// Highlight the correct sidebar icon
const currentPage = window.location.pathname.split("/").pop();
if (currentPage === "pos.html") {
  document.getElementById("nav-pos").classList.add("active");
}

document.getElementById("userNameDisplay").textContent = currentUser.name;

const productSearch = document.getElementById("productSearch");
const productList = document.getElementById("productList");
let selectedDrugId = "";
let activeIndex = -1;
let visibleDrugs = [];
const qtyInput = document.getElementById("qtyInput");
const priceInput = document.getElementById("priceInput");
const addBtn = document.getElementById("addBtn");
const cartBody = document.getElementById("cartBody");
const grandTotalEl = document.getElementById("grandTotal");
const completeSaleBtn = document.getElementById("completeSaleBtn");
const saleDateTimeInput = document.getElementById("saleDateTime");

let grandTotal = 0;
let cartItems = [];
let drugs = []; // live list of drugs from Firestore

function clearDateTime() {
  saleDateTimeInput.value = "";
}

function formatMoney(n) {
  return Number(n).toLocaleString();
}

function expiryInfo(expiry) {
  const days = Math.floor((new Date(expiry) - new Date()) / 86400000);
  if (isNaN(days)) return { text: "No expiry date", cls: "p-expiry-soon" };
  if (days < 0) return { text: "Expired", cls: "p-expiry-expired" };
  if (days < 30) return { text: "Expires in " + days + (days === 1 ? " day" : " days"), cls: "p-expiry-soon" };
  if (days < 365) {
    const m = Math.floor(days / 30);
    return { text: "Expires in " + m + (m === 1 ? " month" : " months"), cls: days < 180 ? "p-expiry-soon" : "p-expiry-ok" };
  }
  const y = Math.floor(days / 365);
  return { text: "Expires in " + y + (y === 1 ? " year" : " years"), cls: "p-expiry-ok" };
}

function isSellable(drug) {
  return drug.qty > 0 && new Date(drug.expiry) >= new Date();
}

function openList() { productList.classList.add("open"); }
function closeList() { productList.classList.remove("open"); activeIndex = -1; }

function setActive(index) {
  const items = productList.querySelectorAll("li[data-id]");
  items.forEach(function (li) { li.classList.remove("active"); });
  if (items.length === 0) { activeIndex = -1; return; }
  activeIndex = (index + items.length) % items.length;
  items[activeIndex].classList.add("active");
  items[activeIndex].scrollIntoView({ block: "nearest" });
}

// Build the suggestions under the search box
function renderSuggestions() {
  const term = productSearch.value.trim().toLowerCase();

  visibleDrugs = drugs
    .filter(function (d) { return d.name && d.name.toLowerCase().includes(term); })
    .sort(function (a, b) { return a.name.localeCompare(b.name); });

  productList.innerHTML = "";

  if (visibleDrugs.length === 0) {
    productList.innerHTML = '<li class="p-empty">No products found</li>';
    activeIndex = -1;
    return;
  }

  visibleDrugs.forEach(function (drug) {
    const exp = expiryInfo(drug.expiry);
    const li = document.createElement("li");
    li.dataset.id = drug.id;
    if (!isSellable(drug)) li.classList.add("disabled");
    li.innerHTML = `
      <div class="p-name"></div>
      <div class="p-meta">
        <span class="${exp.cls}">${exp.text}</span>
        <span>${drug.qty} available</span>
        <span class="p-price">${formatMoney(drug.sellingPrice)}</span>
      </div>
    `;
    li.querySelector(".p-name").textContent = drug.name;
    productList.appendChild(li);
  });

  setActive(0);
}

function chooseDrug(id) {
  const drug = drugs.find(function (d) { return d.id === id; });
  if (!drug) return;
  if (!isSellable(drug)) {
    alert(drug.qty <= 0 ? drug.name + " is out of stock." : drug.name + " is expired.");
    return;
  }
  selectedDrugId = drug.id;
  productSearch.value = drug.name;
  priceInput.value = drug.sellingPrice;
  closeList();
  qtyInput.focus();
  qtyInput.select();
}

productSearch.addEventListener("input", function () {
  selectedDrugId = "";   // typing again means a new search
  priceInput.value = "";
  renderSuggestions();
  openList();
});

productSearch.addEventListener("focus", function () {
  if (!selectedDrugId) { renderSuggestions(); }
  openList();
  productSearch.select();
});

productSearch.addEventListener("keydown", function (e) {
  if (e.key === "ArrowDown") { e.preventDefault(); openList(); setActive(activeIndex + 1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); setActive(activeIndex - 1); }
  else if (e.key === "Enter") {
    const items = productList.querySelectorAll("li[data-id]");
    if (activeIndex >= 0 && items[activeIndex]) {
      e.preventDefault();
      chooseDrug(items[activeIndex].dataset.id);
    }
  }
  else if (e.key === "Escape") { closeList(); }
});

// mousedown (not click) so it fires before the input loses focus
productList.addEventListener("mousedown", function (e) {
  const li = e.target.closest("li[data-id]");
  if (li) { e.preventDefault(); chooseDrug(li.dataset.id); }
});

document.addEventListener("mousedown", function (e) {
  if (!e.target.closest(".product-search")) closeList();
});

// Live listener - keeps drug stock/prices updated automatically
db.collection("drugs").onSnapshot(function (snapshot) {
  drugs = [];
  snapshot.forEach(function (doc) {
    drugs.push({ id: doc.id, ...doc.data() });
  });
  if (productList.classList.contains("open")) { renderSuggestions(); }
});

function updateGrandTotal() {
  grandTotal = cartItems.reduce(function (sum, item) { return sum + item.total; }, 0);
  grandTotalEl.textContent = grandTotal;
}

addBtn.addEventListener("click", function () {
  const selectedId = selectedDrugId;

  if (selectedId === "") {
    alert("Please search for and select a product first.");
    return;
  }

  const drug = drugs.find(function (d) { return d.id === selectedId; });

  if (!drug) {
    alert("This product is no longer available.");
    return;
  }

  const qty = Number(qtyInput.value);

  if (qty <= 0 || isNaN(qty)) {
    alert("Please enter a valid quantity.");
    return;
  }

  if (qty > drug.qty) {
    alert(`Only ${drug.qty} units of ${drug.name} in stock.`);
    return;
  }

  const price = Number(priceInput.value);

  if (priceInput.value === "" || isNaN(price) || price < 0) {
    alert("Please enter a valid price.");
    return;
  }

  const total = price * qty;

  // Reduce stock in Firestore immediately
  db.collection("drugs").doc(drug.id).update({
    qty: drug.qty - qty
  });

  // Build cart row
  const row = document.createElement("tr");
  row.innerHTML = `
    <td>${drug.name}</td>
    <td><input type="number" class="cart-price" min="0" step="any" value="${price}"></td>
    <td>${qty}</td>
    <td class="line-total">${total}</td>
    <td><button class="remove-btn">Remove</button></td>
  `;
  cartBody.appendChild(row);

  const cartItem = { drugId: drug.id, name: drug.name, price: price, qty: qty, total: total };
  cartItems.push(cartItem);
  updateGrandTotal();

  // Let the user change this line's price at will
  const cartPriceInput = row.querySelector(".cart-price");
  cartPriceInput.addEventListener("input", function () {
    const newPrice = Number(cartPriceInput.value);
    cartItem.price = isNaN(newPrice) || newPrice < 0 ? 0 : newPrice;
    cartItem.total = cartItem.price * cartItem.qty;
    row.querySelector(".line-total").textContent = cartItem.total;
    updateGrandTotal();
  });

  // Handle removing this row (restores stock)
  const removeButton = row.querySelector(".remove-btn");
  removeButton.addEventListener("click", function () {
    // Restore stock in Firestore
    const currentDrug = drugs.find(function (d) { return d.id === drug.id; });
    if (currentDrug) {
      db.collection("drugs").doc(drug.id).update({
        qty: currentDrug.qty + qty
      });
    }

    cartItems = cartItems.filter(function (item) { return item !== cartItem; });
    row.remove();
    updateGrandTotal();
  });

  qtyInput.value = 1;
  priceInput.value = "";
  productSearch.value = "";
  selectedDrugId = "";
  productSearch.focus();
});

completeSaleBtn.addEventListener("click", function () {
  if (cartItems.length === 0) {
    alert("Cart is empty.");
    return;
  }

  if (saleDateTimeInput.value === "") {
    alert("Please select the sale date and time.");
    return;
  }

  const chosenDate = new Date(saleDateTimeInput.value);

  // Get the next sale number by checking how many sales exist
  db.collection("sales").get().then(function (snapshot) {
    const nextSaleNumber = snapshot.size + 1;

    db.collection("sales").add({
      saleNumber: nextSaleNumber,
      date: chosenDate.toLocaleString(),
      items: cartItems,
      total: grandTotal
    });

    alert("Sale completed!");

    // Reset the cart
    cartItems = [];
    updateGrandTotal();
    cartBody.innerHTML = "";
    clearDateTime();
  });
});