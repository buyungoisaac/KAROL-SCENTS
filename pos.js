// Highlight the correct sidebar icon
const currentPage = window.location.pathname.split("/").pop();
if (currentPage === "pos.html") {
  document.getElementById("nav-pos").classList.add("active");
}

document.getElementById("userNameDisplay").textContent = currentUser.name;

const productSearch = document.getElementById("productSearch");
const productList = document.getElementById("productList");
let selectedProductId = "";
let activeIndex = -1;
let visibleProducts = [];
const qtyInput = document.getElementById("qtyInput");
const priceInput = document.getElementById("priceInput");
const addBtn = document.getElementById("addBtn");
const cartBody = document.getElementById("cartBody");
const grandTotalEl = document.getElementById("grandTotal");
const completeSaleBtn = document.getElementById("completeSaleBtn");
const saleDateTimeInput = document.getElementById("saleDateTime");

let grandTotal = 0;
let cartItems = [];
let Products = []; // live list of Products from Firestore

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

function isSellable(Product) {
  return Product.qty > 0 && new Date(Product.expiry) >= new Date();
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

  visibleProducts = Products
    .filter(function (d) { return d.name && d.name.toLowerCase().includes(term); })
    .sort(function (a, b) { return a.name.localeCompare(b.name); });

  productList.innerHTML = "";

  if (visibleProducts.length === 0) {
    productList.innerHTML = '<li class="p-empty">No products found</li>';
    activeIndex = -1;
    return;
  }

  visibleProducts.forEach(function (Product) {
    const exp = expiryInfo(Product.expiry);
    const li = document.createElement("li");
    li.dataset.id = Product.id;
    if (!isSellable(Product)) li.classList.add("disabled");
    li.innerHTML = `
      <div class="p-name"></div>
      <div class="p-meta">
        <span class="${exp.cls}">${exp.text}</span>
        <span>${Product.qty} available</span>
        <span class="p-price">${formatMoney(Product.sellingPrice)}</span>
      </div>
    `;
    li.querySelector(".p-name").textContent = Product.name;
    productList.appendChild(li);
  });

  setActive(0);
}

function chooseProduct(id) {
  const Product = Products.find(function (d) { return d.id === id; });
  if (!Product) return;
  if (!isSellable(Product)) {
    alert(Product.qty <= 0 ? Product.name + " is out of stock." : Product.name + " is expired.");
    return;
  }
  selectedProductId = Product.id;
  productSearch.value = Product.name;
  priceInput.value = Product.sellingPrice;
  closeList();
  qtyInput.focus();
  qtyInput.select();
}

productSearch.addEventListener("input", function () {
  selectedProductId = "";   // typing again means a new search
  priceInput.value = "";
  renderSuggestions();
  openList();
});

productSearch.addEventListener("focus", function () {
  if (!selectedProductId) { renderSuggestions(); }
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
      chooseProduct(items[activeIndex].dataset.id);
    }
  }
  else if (e.key === "Escape") { closeList(); }
});

// mousedown (not click) so it fires before the input loses focus
productList.addEventListener("mousedown", function (e) {
  const li = e.target.closest("li[data-id]");
  if (li) { e.preventDefault(); chooseProduct(li.dataset.id); }
});

document.addEventListener("mousedown", function (e) {
  if (!e.target.closest(".product-search")) closeList();
});

// Live listener - keeps Product stock/prices updated automatically
db.collection("Products").onSnapshot(function (snapshot) {
  Products = [];
  snapshot.forEach(function (doc) {
    Products.push({ id: doc.id, ...doc.data() });
  });
  if (productList.classList.contains("open")) { renderSuggestions(); }
});

function updateGrandTotal() {
  grandTotal = cartItems.reduce(function (sum, item) { return sum + item.total; }, 0);
  grandTotalEl.textContent = grandTotal;
}

addBtn.addEventListener("click", function () {
  const selectedId = selectedProductId;

  if (selectedId === "") {
    alert("Please search for and select a product first.");
    return;
  }

  const Product = Products.find(function (d) { return d.id === selectedId; });

  if (!Product) {
    alert("This product is no longer available.");
    return;
  }

  const qty = Number(qtyInput.value);

  if (qty <= 0 || isNaN(qty)) {
    alert("Please enter a valid quantity.");
    return;
  }

  if (qty > Product.qty) {
    alert(`Only ${Product.qty} units of ${Product.name} in stock.`);
    return;
  }

  const price = Number(priceInput.value);

  if (priceInput.value === "" || isNaN(price) || price < 0) {
    alert("Please enter a valid price.");
    return;
  }

  const total = price * qty;

  // Reduce stock in Firestore immediately
 db.collection("products").doc(product.id).update({
  qty: firebase.firestore.FieldValue.increment(-qty)
});

  // Build cart row
  const row = document.createElement("tr");
  row.innerHTML = `
    <td>${Product.name}</td>
    <td><input type="number" class="cart-price" min="0" step="any" value="${price}"></td>
    <td>${qty}</td>
    <td class="line-total">${total}</td>
    <td><button class="remove-btn">Remove</button></td>
  `;
  cartBody.appendChild(row);

  const cartItem = { ProductId: Product.id, name: Product.name, price: price, qty: qty, total: total };
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
    const currentProduct = Products.find(function (d) { return d.id === Product.id; });
    if (currentProduct) {
      db.collection("products").doc(product.id).update({
  qty: firebase.firestore.FieldValue.increment(qty)
});
    }

    cartItems = cartItems.filter(function (item) { return item !== cartItem; });
    row.remove();
    updateGrandTotal();
  });

  qtyInput.value = 1;
  priceInput.value = "";
  productSearch.value = "";
  selectedProductId = "";
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