// Highlight the correct sidebar icon
const currentPage = window.location.pathname.split("/").pop();
if (currentPage === "inventory.html") {
  document.getElementById("nav-inventory").classList.add("active");
}

if (!isManager()) {
  document.getElementById("nav-inventory") && (document.getElementById("nav-inventory").style.display = "none");
}

document.getElementById("userNameDisplay").textContent = currentUser.name;

const drugNameInput = document.getElementById("drugName");
const drugQtyInput = document.getElementById("drugQty");
const drugCostPriceInput = document.getElementById("drugCostPrice");
const drugSellingPriceInput = document.getElementById("drugSellingPrice");
const drugExpiryInput = document.getElementById("drugExpiry");
const addDrugBtn = document.getElementById("addDrugBtn");
const drugsBody = document.getElementById("drugsBody");

const drugSuggestions = document.getElementById("drugSuggestions");
const drugNameHint = document.getElementById("drugNameHint");
const batchBox = document.getElementById("batchBox");
const batchBody = document.getElementById("batchBody");
const batchCount = document.getElementById("batchCount");
const submitBatchBtn = document.getElementById("submitBatchBtn");
const clearBatchBtn = document.getElementById("clearBatchBtn");

let drugs = [];   // live list from Firestore
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

// Finds a drug already in the system with the same name AND same expiry date.
// (Same name but a different expiry is kept as a separate row so the earlier
// batch's expiry date is never lost.)
function findExisting(name, expiry) {
  const key = normalizeName(name);
  return drugs.find(function (d) {
    return normalizeName(d.name) === key && d.expiry === expiry;
  });
}

function findDrugByName(name) {
  const key = normalizeName(name);
  return drugs.find(function (drug) {
    return normalizeName(drug.name) === key;
  });
}

function getMatchingDrugNames(term) {
  if (!term) return [];
  const unique = new Map();
  drugs.forEach(function (drug) {
    const key = normalizeName(drug.name);
    if (key.includes(term) && !unique.has(key)) unique.set(key, drug.name);
  });
  return Array.from(unique.values()).sort(function (a, b) {
    return a.localeCompare(b);
  }).slice(0, 8);
}

function hideDrugSuggestions() {
  drugSuggestions.hidden = true;
  drugSuggestions.innerHTML = "";
}

function selectExistingDrug(name) {
  drugNameInput.value = name;
  const existing = findDrugByName(name);
  if (existing) {
    drugCostPriceInput.value = existing.costPrice ?? "";
    drugSellingPriceInput.value = existing.sellingPrice ?? "";
    drugNameHint.textContent = "Existing drug selected. Enter quantity and expiry for this batch.";
  }
  addDrugBtn.textContent = "Add to batch";
  renderDrugs();
  hideDrugSuggestions();
  drugQtyInput.focus();
}

function updateDrugNameSearch() {
  const term = normalizeName(drugNameInput.value);
  renderDrugs();
  if (!term) {
    hideDrugSuggestions();
    drugNameHint.textContent = "Start typing to find an existing drug or insert a new one.";
    addDrugBtn.textContent = "Add to batch";
    return;
  }

  const matches = getMatchingDrugNames(term);
  drugSuggestions.innerHTML = "";

  matches.forEach(function (name) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "drug-suggestion";
    option.setAttribute("role", "option");
    option.textContent = name;
    option.addEventListener("click", function () {
      selectExistingDrug(name);
    });
    drugSuggestions.appendChild(option);
  });

  const exact = findDrugByName(drugNameInput.value);
  if (!exact) {
    const insertOption = document.createElement("button");
    insertOption.type = "button";
    insertOption.className = "drug-suggestion insert-suggestion";
    insertOption.setAttribute("role", "option");
    insertOption.textContent = "＋ Insert new product: " + drugNameInput.value.trim();
    insertOption.addEventListener("click", function () {
      drugNameInput.value = drugNameInput.value.trim();
      addDrugBtn.textContent = "Insert new product";
      drugNameHint.textContent = "New product: fill in quantity, cost, selling price and expiry, then insert it into the batch.";
      hideDrugSuggestions();
      drugQtyInput.focus();
    });
    drugSuggestions.appendChild(insertOption);
    addDrugBtn.textContent = "Insert new product";
    drugNameHint.textContent = matches.length
      ? "No exact match. Choose a suggestion or insert this as a new product."
      : "No matching product found. Insert it as a new product.";
  } else {
    addDrugBtn.textContent = "Add to batch";
    drugNameHint.textContent = "Existing product found. Choose it to use its saved prices, or enter a new batch.";
  }

  drugSuggestions.hidden = false;
}

// ---------- Main stock table (filtered by the combined drug search) ----------
function renderDrugs() {
  const term = normalizeName(drugNameInput.value);

  const visible = drugs
    .filter(function (drug) {
      return term === "" || normalizeName(drug.name).includes(term);
    })
    .sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });

  drugsBody.innerHTML = "";

  if (visible.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="7" class="empty-row">${
      term === "" ? "No drugs in inventory yet." : "No drugs match your search."
    }</td>`;
    drugsBody.appendChild(row);
    return;
  }

  visible.forEach(function (drug) {
    const status = getStatus(drug.qty, drug.expiry);

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(drug.name)}</td>
      <td>${drug.qty}</td>
      <td>${drug.costPrice}</td>
      <td>${drug.sellingPrice}</td>
      <td>${escapeHtml(drug.expiry)}</td>
      <td class="${status.className}">${status.text}</td>
      <td><button class="delete-btn" data-id="${drug.id}">Delete</button></td>
    `;
    drugsBody.appendChild(row);
  });

  document.querySelectorAll(".delete-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const id = btn.dataset.id;
      db.collection("drugs").doc(id).delete();
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

// Live listener - keeps drugs updated automatically across all devices
db.collection("drugs").onSnapshot(function (snapshot) {
  drugs = [];
  snapshot.forEach(function (doc) {
    drugs.push({ id: doc.id, ...doc.data() });
  });
  renderDrugs();
  renderBatch(); // keeps the "adds to existing" hints accurate
});

drugNameInput.addEventListener("input", updateDrugNameSearch);
drugNameInput.addEventListener("focus", function () {
  if (drugNameInput.value.trim()) updateDrugNameSearch();
});
document.addEventListener("click", function (event) {
  if (!event.target.closest(".drug-name-wrap")) hideDrugSuggestions();
});

// ---------- Add an item to the pending batch ----------
addDrugBtn.addEventListener("click", function () {
  const name = drugNameInput.value.trim();
  const qty = Number(drugQtyInput.value);
  const costPrice = Number(drugCostPriceInput.value);
  const sellingPrice = Number(drugSellingPriceInput.value);
  const expiry = drugExpiryInput.value;

  if (name === "" || drugQtyInput.value === "" || drugCostPriceInput.value === "" || drugSellingPriceInput.value === "" || expiry === "") {
    alert("Please fill in all fields.");
    return;
  }

  if (qty <= 0) {
    alert("Quantity must be more than 0.");
    return;
  }

  // Same drug + same expiry already in the batch? Combine them.
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

  drugNameInput.value = "";
  drugQtyInput.value = "";
  drugCostPriceInput.value = "";
  drugSellingPriceInput.value = "";
  drugExpiryInput.value = "";
  drugNameInput.focus();
  hideDrugSuggestions();
  drugNameHint.textContent = "Start typing to find an existing drug or insert a new one.";
  addDrugBtn.textContent = "Add to batch";
  renderDrugs();

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
      // Same drug + expiry: add the quantity on top of the current stock
      // (increment is safe even if a sale happens at the same moment)
      writeBatch.update(db.collection("drugs").doc(existing.id), {
        qty: firebase.firestore.FieldValue.increment(item.qty),
        costPrice: item.costPrice,
        sellingPrice: item.sellingPrice
      });
      merged++;
    } else {
      writeBatch.set(db.collection("drugs").doc(), {
        name: item.name,
        qty: item.qty,
        costPrice: item.costPrice,
        sellingPrice: item.sellingPrice,
        expiry: item.expiry
      });
      created++;
    }
  });

  writeBatch.commit()
    .then(function () {
      alert(`Batch saved: ${merged} added to existing stock, ${created} new.`);
      batch = [];
      renderBatch();
    })
    .catch(function (error) {
      console.error(error);
      alert("Could not save the batch. Nothing was changed, please try again.");
    })
    .finally(function () {
      submitBatchBtn.disabled = false;
      submitBatchBtn.textContent = "Submit batch";
    });
});
