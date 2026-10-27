// Highlight the correct sidebar icon
const currentPage = window.location.pathname.split("/").pop();
if (currentPage === "inventory.html") {
  document.getElementById("nav-inventory").classList.add("active");
}

if (!isManager()) {
  document.getElementById("nav-inventory") && (document.getElementById("nav-inventory").style.display = "none");
}

document.getElementById("userNameDisplay").textContent = currentUser.name;

const ProductsNameInput = document.getElementById("ProductsName");
const ProductsQtyInput = document.getElementById("ProductsQty");
const ProductsCostPriceInput = document.getElementById("ProductsCostPrice");
const ProductsellingPriceInput = document.getElementById("ProductsellingPrice");
const ProductsExpiryInput = document.getElementById("ProductsExpiry");
const addProductsBtn = document.getElementById("addProductsBtn");
const ProductsBody = document.getElementById("ProductsBody");

const ProductSuggestions = document.getElementById("ProductSuggestions");
const ProductsNameHint = document.getElementById("ProductsNameHint");
const batchBox = document.getElementById("batchBox");
const batchBody = document.getElementById("batchBody");
const batchCount = document.getElementById("batchCount");
const submitBatchBtn = document.getElementById("submitBatchBtn");
const clearBatchBtn = document.getElementById("clearBatchBtn");

let Products = [];   // live list from Firestore
let batch = [];   // items waiting to be submitted

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function getStatus(qty, expiry) {
  const today = new Date();
  const expiryDate = new Date(expiry);

  if (expiryDate < today) {
    return { text: "Expired", className: "status-expired" };
  } else if (qty <= 10) {
    return { text: "Low stock", className: "status-low" };
  } else {
    return { text: "OK", className: "status-ok" };
  }
}

// Finds a Product already in the system with the same name AND same expiry date.
// (Same name but a different expiry is kept as a separate row so the earlier
// batch's expiry date is never lost.)
function findExisting(name, expiry) {
  const key = normalizeName(name);
  return Products.find(function (d) {
    return normalizeName(d.name) === key && d.expiry === expiry;
  });
}

function findProductByName(name) {
  const key = normalizeName(name);
  return Products.find(function (Product) {
    return normalizeName(Product.name) === key;
  });
}

function getMatchingProductsNames(term) {
  if (!term) return [];
  const unique = new Map();
  Products.forEach(function (Product) {
    const key = normalizeName(Product.name);
    if (key.includes(term) && !unique.has(key)) unique.set(key, Product.name);
  });
  return Array.from(unique.values()).sort(function (a, b) {
    return a.localeCompare(b);
  }).slice(0, 8);
}

function hideProductSuggestions() {
  ProductSuggestions.hidden = true;
  ProductSuggestions.innerHTML = "";
}

function selectExistingProduct(name) {
  ProductsNameInput.value = name;
  const existing = findProductByName(name);
  if (existing) {
    ProductsCostPriceInput.value = existing.costPrice ?? "";
    ProductsellingPriceInput.value = existing.sellingPrice ?? "";
    ProductsNameHint.textContent = "Existing Product selected. Enter quantity and expiry for this batch.";
  }
  addProductsBtn.textContent = "Add to batch";
  renderProducts();
  hideProductSuggestions();
  ProductsQtyInput.focus();
}

function updateProductsNameSearch() {
  const term = normalizeName(ProductsNameInput.value);
  renderProducts();
  if (!term) {
    hideProductSuggestions();
    ProductsNameHint.textContent = "Start typing to find an existing Product or insert a new one.";
    addProductsBtn.textContent = "Add to batch";
    return;
  }

  const matches = getMatchingProductsNames(term);
  ProductSuggestions.innerHTML = "";

  matches.forEach(function (name) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "Product-suggestion";
    option.setAttribute("role", "option");
    option.textContent = name;
    option.addEventListener("click", function () {
      selectExistingProduct(name);
    });
    ProductSuggestions.appendChild(option);
  });

  const exact = findProductByName(ProductsNameInput.value);
  if (!exact) {
    const insertOption = document.createElement("button");
    insertOption.type = "button";
    insertOption.className = "Product-suggestion insert-suggestion";
    insertOption.setAttribute("role", "option");
    insertOption.textContent = "＋ Insert new product: " + ProductsNameInput.value.trim();
    insertOption.addEventListener("click", function () {
      ProductsNameInput.value = ProductsNameInput.value.trim();
      addProductsBtn.textContent = "Insert new product";
      ProductsNameHint.textContent = "New product: fill in quantity, cost, selling price and expiry, then insert it into the batch.";
      hideProductSuggestions();
      ProductsQtyInput.focus();
    });
    ProductSuggestions.appendChild(insertOption);
    addProductsBtn.textContent = "Insert new product";
    ProductsNameHint.textContent = matches.length
      ? "No exact match. Choose a suggestion or insert this as a new product."
      : "No matching product found. Insert it as a new product.";
  } else {
    addProductsBtn.textContent = "Add to batch";
    ProductsNameHint.textContent = "Existing product found. Choose it to use its saved prices, or enter a new batch.";
  }

  ProductSuggestions.hidden = false;
}

// ---------- Main stock table (filtered by the combined Product search) ----------
function renderProducts() {
  const term = normalizeName(ProductsNameInput.value);

  const visible = Products
    .filter(function (Product) {
      return term === "" || normalizeName(Product.name).includes(term);
    })
    .sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });

  ProductsBody.innerHTML = "";

  if (visible.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="7" class="empty-row">${
      term === "" ? "No Products in inventory yet." : "No Products match your search."
    }</td>`;
    ProductsBody.appendChild(row);
    return;
  }

  visible.forEach(function (Product) {
    const status = getStatus(Product.qty, Product.expiry);

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(Product.name)}</td>
      <td>${Product.qty}</td>
      <td>${Product.costPrice}</td>
      <td>${Product.sellingPrice}</td>
      <td>${escapeHtml(Product.expiry)}</td>
      <td class="${status.className}">${status.text}</td>
      <td><button class="delete-btn" data-id="${Product.id}">Delete</button></td>
    `;
    ProductsBody.appendChild(row);
  });

  document.querySelectorAll(".delete-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const id = btn.dataset.id;
      db.collection("Products").doc(id).delete();
    });
  });
}

// ---------- Pending batch table ----------
function renderBatch() {
  batchBody.innerHTML = "";
  batchCount.textContent = batch.length;
  batchBox.style.display = batch.length === 0 ? "none" : "block";

  batch.forEach(function (item, index) {
    const existing = findExisting(item.name, item.expiry);
    const result = existing
      ? `<span class="tag-merge">Adds to existing (now ${existing.qty} → ${existing.qty + item.qty})</span>`
      : `<span class="tag-new">New entry</span>`;

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(item.name)}</td>
      <td>${item.qty}</td>
      <td>${item.costPrice}</td>
      <td>${item.sellingPrice}</td>
      <td>${escapeHtml(item.expiry)}</td>
      <td>${result}</td>
      <td><button class="delete-btn" data-index="${index}">Remove</button></td>
    `;
    batchBody.appendChild(row);
  });

  batchBody.querySelectorAll(".delete-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      batch.splice(Number(btn.dataset.index), 1);
      renderBatch();
    });
  });
}

// Live listener - keeps Products updated automatically across all devices
db.collection("Products").onSnapshot(function (snapshot) {
  Products = [];
  snapshot.forEach(function (doc) {
    Products.push({ id: doc.id, ...doc.data() });
  });
  renderProducts();
  renderBatch(); // keeps the "adds to existing" hints accurate
});

ProductsNameInput.addEventListener("input", updateProductsNameSearch);
ProductsNameInput.addEventListener("focus", function () {
  if (ProductsNameInput.value.trim()) updateProductsNameSearch();
});
document.addEventListener("click", function (event) {
  if (!event.target.closest(".Products-name-wrap")) hideProductSuggestions();
});

// ---------- Add an item to the pending batch ----------
addProductsBtn.addEventListener("click", function () {
  const name = ProductsNameInput.value.trim();
  const qty = Number(ProductsQtyInput.value);
  const costPrice = Number(ProductsCostPriceInput.value);
  const sellingPrice = Number(ProductsellingPriceInput.value);
  const expiry = ProductsExpiryInput.value;

  if (name === "" || ProductsQtyInput.value === "" || ProductsCostPriceInput.value === "" || ProductsellingPriceInput.value === "" || expiry === "") {
    alert("Please fill in all fields.");
    return;
  }

  if (qty <= 0) {
    alert("Quantity must be more than 0.");
    return;
  }

  // Same Product + same expiry already in the batch? Combine them.
  const sameInBatch = batch.find(function (b) {
    return normalizeName(b.name) === normalizeName(name) && b.expiry === expiry;
  });

  if (sameInBatch) {
    sameInBatch.qty += qty;
    sameInBatch.costPrice = costPrice;
    sameInBatch.sellingPrice = sellingPrice;
  } else {
    batch.push({ name: name, qty: qty, costPrice: costPrice, sellingPrice: sellingPrice, expiry: expiry });
  }

  ProductsNameInput.value = "";
  ProductsQtyInput.value = "";
  ProductsCostPriceInput.value = "";
  ProductsellingPriceInput.value = "";
  ProductsExpiryInput.value = "";
  ProductsNameInput.focus();
  hideProductSuggestions();
  ProductsNameHint.textContent = "Start typing to find an existing Product or insert a new one.";
  addProductsBtn.textContent = "Add to batch";
  renderProducts();

  renderBatch();
});

clearBatchBtn.addEventListener("click", function () {
  if (batch.length === 0) return;
  if (confirm("Remove all items from this batch?")) {
    batch = [];
    renderBatch();
  }
});

// ---------- Submit the whole batch in one go ----------
submitBatchBtn.addEventListener("click", function () {
  if (batch.length === 0) return;

  submitBatchBtn.disabled = true;
  submitBatchBtn.textContent = "Saving...";

  const writeBatch = db.batch();
  let merged = 0;
  let created = 0;

  batch.forEach(function (item) {
    const existing = findExisting(item.name, item.expiry);

    if (existing) {
      // Same Product + expiry: add the quantity on top of the current stock
      // (increment is safe even if a sale happens at the same moment)
      writeBatch.update(db.collection("Products").doc(existing.id), {
        qty: firebase.firestore.FieldValue.increment(item.qty),
        costPrice: item.costPrice,
        sellingPrice: item.sellingPrice
      });
      merged++;
    } else {
      writeBatch.set(db.collection("Products").doc(), {
        name: item.name,
        qty: item.qty,
        costPrice: item.costPrice,
        sellingPrice: item.sellingPrice,
        expiry: item.expiry
      });
      created++;
    }
  });

  writeBatch.commit().catch(function (error) {
  console.error(error);
  alert("Could not save the batch. Please try again.");
});

alert(`Batch saved: ${merged} added to existing stock, ${created} new. It will sync when online.`);
batch = [];
renderBatch();
submitBatchBtn.disabled = false;
submitBatchBtn.textContent = "Submit batch";
    });
