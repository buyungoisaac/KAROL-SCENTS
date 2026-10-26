import { firebaseConfig } from "./firebase-config.js";
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection,
  serverTimestamp, onSnapshot, query, orderBy, limit, writeBatch, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- helpers ----------
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = n => "UGX " + Number(n || 0).toLocaleString();

// Auth needs an email under the hood; staff sign in with phone + password.
// The email is derived deterministically from the phone digits, so login
// never needs a pre-auth lookup.
function phoneToEmail(phone) {
  const digits = String(phone || "").replace(/[^0-9]/g, "");
  return `${digits}@clinicdesk.local`;
}

// Fire-and-forget write. Firestore applies it to the local cache at once (so every
// live listener updates instantly) and syncs to the server in the background.
function fire(promise) {
  return promise.catch(err => {
    console.error(err);
    alert("Could not save: " + (err.code === "permission-denied" ? "you don't have permission to do that." : err.message));
  });
}

function table(headers, rows, emptyText = "No records yet") {
  const head = `<tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr>`;
  const body = rows.length
    ? rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")
    : `<tr class="empty-row"><td colspan="${headers.length}">${emptyText}</td></tr>`;
  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

// ---------- state ----------
let currentUser = null;
let currentProfile = null; // {name, phone, role, active}
let cache = { medicines: [], inventory: [], patients: [], sales: [], users: [] };
let cart = []; // [{medicineId, name, price, qty}]

function isStaff() { return currentProfile && (currentProfile.role === "admin" || currentProfile.role === "manager"); }
function isAdmin() { return currentProfile && currentProfile.role === "admin"; }

// ---------- boot: show the login screen at once, check first-run in the background ----------
function checkFirstRun() {
  getDoc(doc(db, "meta", "setup")).then(snap => {
    if (!snap.exists() && !currentUser) {
      $("authView").classList.add("hidden");
      $("bootView").classList.remove("hidden");
    }
  }).catch(e => console.error("ClinicDesk boot check failed:", e));
}
$("authView").classList.remove("hidden");
checkFirstRun();

$("bootForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("bootError").classList.add("hidden");
  const name = $("bootName").value.trim();
  const phone = $("bootPhone").value.trim();
  const password = $("bootPassword").value;
  try {
    const cred = await createUserWithEmailAndPassword(auth, phoneToEmail(phone), password);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, "users", cred.user.uid), {
      uid: cred.user.uid, name, phone, role: "admin", active: true,
      createdAt: serverTimestamp(), createdBy: null
    });
    await setDoc(doc(db, "meta", "setup"), { adminCreated: true, createdAt: serverTimestamp() });
  } catch (err) {
    $("bootError").textContent = err.message;
    $("bootError").classList.remove("hidden");
  }
});

$("authForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("authError").classList.add("hidden");
  const phone = $("authPhone").value.trim();
  const password = $("authPassword").value;
  try {
    await signInWithEmailAndPassword(auth, phoneToEmail(phone), password);
  } catch (err) {
    $("authError").textContent = "Could not sign in. Check the phone number and password.";
    $("authError").classList.remove("hidden");
  }
});

$("logoutBtn").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (user) {
    $("bootView").classList.add("hidden");
    $("authView").classList.add("hidden");
    $("appView").classList.remove("hidden");
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      currentProfile = snap.exists() ? snap.data() : null;
    } catch (e) { currentProfile = null; }

    $("userBadge").innerHTML = `<strong>${esc(currentProfile?.name || "User")}</strong>
      <small>${esc(currentProfile?.phone || "")} &middot; ${esc(currentProfile?.role || "user")}</small>`;
    $("navTeam").classList.toggle("hidden", !isStaff());

    showSection(document.querySelector("#nav button.active")?.dataset.section || "dashboard");
  } else {
    stopListeners();
    currentProfile = null;
    $("appView").classList.add("hidden");
    $("authView").classList.remove("hidden");
    checkFirstRun();
  }
});

// ---------- live data (onSnapshot) ----------
// Each section subscribes only to the collections it needs, the first time it is
// opened. After that Firestore pushes just the changes, and our own writes show
// up instantly from the local cache - nothing is ever re-downloaded after a save.
const needs = {
  dashboard: ["medicines", "inventory", "patients", "sales"],
  inventory: ["medicines", "inventory"],
  pos: ["medicines", "inventory"],
  records: ["patients"],
  receipts: ["sales"],
  team: ["users"]
};
// Sections that should only redraw when one of these changes (keeps POS inputs steady)
const renderOn = { pos: ["medicines"] };

const listeners = {};
const ready = new Set();
let currentSection = null;

function listen(name) {
  if (listeners[name]) return;
  let q = collection(db, name);
  if (name === "sales") q = query(q, orderBy("createdAt", "desc"), limit(300)); // newest 300 only
  listeners[name] = onSnapshot(q, snap => {
    cache[name] = snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }));
    ready.add(name);
    refreshIfAffected(name);
  }, err => {
    console.error("Listener failed for " + name, err); // e.g. a "user" role can't list managers/admins
    cache[name] = [];
    ready.add(name);
    refreshIfAffected(name);
  });
}

function refreshIfAffected(name) {
  const sec = currentSection;
  if (!sec || !(needs[sec] || []).every(n => ready.has(n))) return;
  if ((renderOn[sec] || needs[sec]).includes(name) || $(sec).dataset.rendered !== "1") renderers[sec]();
}

function stopListeners() {
  Object.values(listeners).forEach(unsub => unsub());
  Object.keys(listeners).forEach(k => delete listeners[k]);
  ready.clear();
  cache = { medicines: [], inventory: [], patients: [], sales: [], users: [] };
  cart = [];
  currentSection = null;
  document.querySelectorAll(".section").forEach(s => { s.dataset.rendered = ""; s.innerHTML = ""; });
}

// ---------- navigation ----------
document.getElementById("nav").addEventListener("click", e => {
  const btn = e.target.closest("button[data-section]");
  if (!btn) return;
  showSection(btn.dataset.section);
});

const titles = { dashboard: "Dashboard", inventory: "Inventory", pos: "Point of Sale", records: "Records", receipts: "Receipts", team: "Team" };
const _renderers = { dashboard: renderDashboard, inventory: renderInventory, pos: renderPOS, records: renderRecords, receipts: renderReceipts, team: renderTeam };
const renderers = Object.fromEntries(Object.entries(_renderers).map(([k, fn]) => [k, () => { fn(); $(k).dataset.rendered = "1"; }]));

function showSection(name) {
  currentSection = name;
  document.querySelectorAll("#nav button").forEach(b => b.classList.toggle("active", b.dataset.section === name));
  document.querySelectorAll(".section").forEach(s => s.classList.toggle("active", s.id === name));
  $("pageTitle").textContent = titles[name] || "";
  (needs[name] || []).forEach(listen);
  if ((needs[name] || []).every(n => ready.has(n))) renderers[name]();
  else if (!$(name).dataset.rendered) $(name).innerHTML = `<p style="color:var(--muted)">Loading&hellip;</p>`;
}

// ================= Dashboard =================
function renderDashboard() {
  const lowStock = cache.inventory.filter(i => Number(i.quantity) <= 5).length;
  const today = new Date().toDateString();
  const salesToday = cache.sales.filter(s => s.createdAt?.toDate && s.createdAt.toDate().toDateString() === today);
  const totalToday = salesToday.reduce((sum, s) => sum + Number(s.total || 0), 0);

  $("dashboard").innerHTML = `
    <div class="section-head"><h3>Overview</h3></div>
    <div class="cards">
      <div class="card"><div class="num">${cache.medicines.length}</div><div class="label">Medicines</div></div>
      <div class="card"><div class="num">${cache.inventory.length}</div><div class="label">Stock entries</div></div>
      <div class="card"><div class="num">${lowStock}</div><div class="label">Low stock (&le;5)</div></div>
      <div class="card"><div class="num">${cache.patients.length}</div><div class="label">Patients</div></div>
      <div class="card"><div class="num">${money(totalToday)}</div><div class="label">Sales today</div></div>
    </div>`;
}

// ================= Inventory =================
function renderInventory() {
  const medicineRows = cache.medicines.map(m => [
    esc(m.name), esc(m.unit || ""), money(m.sellPrice),
    isStaff() ? `<span class="actions"><button onclick="editMedicine('${m.id}')">Edit</button><button class="danger" onclick="deleteMedicine('${m.id}')">Delete</button></span>` : ""
  ]);

  const stockRows = cache.inventory.map(i => [
    esc(i.medicineName), esc(i.batchNo || ""), i.quantity, esc(i.expiryDate || "-"), money(i.costPrice),
    isStaff() ? `<span class="actions"><button onclick="editStock('${i.id}')">Edit</button><button class="danger" onclick="deleteStock('${i.id}')">Delete</button></span>` : ""
  ]);

  $("inventory").innerHTML = `
    <div class="section-head">
      <h3>Medicines</h3>
      ${isStaff() ? `<button class="primary-btn" onclick="openMedicineForm()">Add medicine</button>` : ""}
    </div>
    ${table(["Name", "Unit", "Sell price", ""], medicineRows)}

    <div class="section-head" style="margin-top:30px">
      <h3>Stock entries</h3>
      <button class="primary-btn" onclick="openStockForm()">Add stock</button>
    </div>
    ${table(["Medicine", "Batch", "Qty", "Expiry", "Cost", ""], stockRows)}
  `;
}

window.openMedicineForm = (id) => {
  const m = id ? cache.medicines.find(x => x.id === id) : null;
  modal(m ? "Edit medicine" : "Add medicine", `
    <input id="f_name" placeholder="Medicine name" value="${esc(m?.name || "")}" required>
    <input id="f_unit" placeholder="Unit (e.g. tablet, bottle)" value="${esc(m?.unit || "")}">
    <input id="f_price" type="number" placeholder="Sell price" value="${m?.sellPrice || ""}" required>
  `, async () => {
    const data = { name: $("f_name").value.trim(), unit: $("f_unit").value.trim(), sellPrice: Number($("f_price").value) };
    if (m) fire(updateDoc(doc(db, "medicines", m.id), data));
    else fire(addDoc(collection(db, "medicines"), { ...data, createdAt: serverTimestamp() }));
  });
};
window.editMedicine = id => window.openMedicineForm(id);
window.deleteMedicine = id => { if (confirm("Delete this medicine?")) fire(deleteDoc(doc(db, "medicines", id))); };

window.openStockForm = (id) => {
  const s = id ? cache.inventory.find(x => x.id === id) : null;
  const options = cache.medicines.map(m => `<option value="${m.id}" ${s?.medicineId === m.id ? "selected" : ""}>${esc(m.name)}</option>`).join("");
  modal(s ? "Edit stock entry" : "Add stock", `
    <select id="f_med" required>${options || `<option value="">Add a medicine first</option>`}</select>
    <input id="f_batch" placeholder="Batch number" value="${esc(s?.batchNo || "")}">
    <input id="f_qty" type="number" placeholder="Quantity" value="${s?.quantity || ""}" required>
    <input id="f_expiry" type="date" value="${s?.expiryDate || ""}">
    <input id="f_cost" type="number" placeholder="Cost price" value="${s?.costPrice || ""}">
  `, async () => {
    const medId = $("f_med").value;
    const med = cache.medicines.find(m => m.id === medId);
    const data = {
      medicineId: medId, medicineName: med?.name || "", batchNo: $("f_batch").value.trim(),
      quantity: Number($("f_qty").value), expiryDate: $("f_expiry").value, costPrice: Number($("f_cost").value) || 0
    };
    if (s) fire(updateDoc(doc(db, "inventory", s.id), data));
    else fire(addDoc(collection(db, "inventory"), { ...data, createdAt: serverTimestamp(), createdBy: currentUser.uid }));
  });
};
window.editStock = id => window.openStockForm(id);
window.deleteStock = id => { if (confirm("Delete this stock entry?")) fire(deleteDoc(doc(db, "inventory", id))); };

// ================= Point of Sale =================
function renderPOS() {
  const prevMed = $("posMed")?.value, prevQty = $("posQty")?.value;
  renderPOSInner();
  if (prevMed && $("posMed") && [...$("posMed").options].some(o => o.value === prevMed)) $("posMed").value = prevMed;
  if (prevQty && $("posQty")) $("posQty").value = prevQty;
}

function renderPOSInner() {
  const options = cache.medicines.map(m => `<option value="${m.id}">${esc(m.name)} (${money(m.sellPrice)})</option>`).join("");
  const cartRows = cart.map((c, idx) => `
    <div class="cart-row">
      <span>${esc(c.name)} &times; ${c.qty}</span>
      <span>${money(c.price * c.qty)} <button onclick="removeCartItem(${idx})" style="margin-left:8px;border:none;background:none;color:var(--danger)">&times;</button></span>
    </div>`).join("") || `<p style="color:var(--muted);font-size:13.5px">Cart is empty.</p>`;
  const totalVal = cart.reduce((sum, c) => sum + c.price * c.qty, 0);

  $("pos").innerHTML = `
    <div class="pos-grid">
      <div class="pos-panel">
        <h4>Add item</h4>
        <select id="posMed">${options || `<option value="">No medicines yet</option>`}</select>
        <input id="posQty" type="number" min="1" value="1" style="margin-top:10px;width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:8px">
        <button class="primary-btn" style="margin-top:12px;width:100%" onclick="addToCart()">Add to cart</button>
      </div>
      <div class="pos-panel">
        <h4>Cart</h4>
        ${cartRows}
        <div class="cart-total"><span>Total</span><span>${money(totalVal)}</span></div>
        <button class="primary-btn" style="margin-top:14px;width:100%" ${cart.length ? "" : "disabled"} onclick="completeSale()">Complete sale</button>
      </div>
    </div>`;
}

window.addToCart = () => {
  const medId = $("posMed").value;
  const qty = Number($("posQty").value);
  const med = cache.medicines.find(m => m.id === medId);
  if (!med || !qty || qty < 1) return;
  const existing = cart.find(c => c.medicineId === medId);
  if (existing) existing.qty += qty;
  else cart.push({ medicineId: medId, name: med.name, price: med.sellPrice, qty });
  renderPOS();
};
window.removeCartItem = idx => { cart.splice(idx, 1); renderPOS(); };

window.completeSale = () => {
  if (!cart.length) return;
  // Work out the stock deductions (earliest-expiry batches first) from the live cache,
  // and refuse up front if there isn't enough of something.
  const batch = writeBatch(db);
  for (const item of cart) {
    const batches = cache.inventory
      .filter(i => i.medicineId === item.medicineId && Number(i.quantity) > 0)
      .sort((a, b) => (a.expiryDate || "9999").localeCompare(b.expiryDate || "9999"));
    const available = batches.reduce((s, b) => s + Number(b.quantity), 0);
    if (available < item.qty) { alert(`Only ${available} of ${item.name} in stock.`); return; }
    let remaining = item.qty;
    for (const b of batches) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, Number(b.quantity));
      batch.update(doc(db, "inventory", b.id), { quantity: increment(-take) }); // safe if two tills sell at once
      remaining -= take;
    }
  }
  const sold = cart;
  const total = sold.reduce((sum, c) => sum + c.price * c.qty, 0);
  batch.set(doc(collection(db, "sales")), {
    items: sold, total, soldBy: currentProfile?.name || "Staff", createdAt: serverTimestamp()
  });

  // Stock and the sale record are saved together or not at all. We don't wait for the
  // server: the screen clears now, and the cart comes back only if the save fails.
  cart = [];
  renderPOS();
  batch.commit().catch(err => {
    console.error(err);
    cart = sold;
    if (currentSection === "pos") renderPOS();
    alert("Sale was NOT saved: " + (err.code === "permission-denied" ? "your role isn't allowed to deduct stock." : err.message));
  });
};

// ================= Records (patients) =================
function renderRecords() {
  const rows = cache.patients.map(p => [
    esc(p.name), esc(p.phone || ""), esc(p.gender || ""), esc(p.dob || ""), esc(p.address || ""),
    isStaff() ? `<span class="actions"><button onclick="editPatient('${p.id}')">Edit</button><button class="danger" onclick="deletePatient('${p.id}')">Delete</button></span>` : ""
  ]);
  $("records").innerHTML = `
    <div class="section-head"><h3>Patients</h3><button class="primary-btn" onclick="openPatientForm()">Add patient</button></div>
    ${table(["Name", "Phone", "Gender", "Date of birth", "Address", ""], rows)}
  `;
}

window.openPatientForm = (id) => {
  const p = id ? cache.patients.find(x => x.id === id) : null;
  modal(p ? "Edit patient" : "Add patient", `
    <input id="f_name" placeholder="Full name" value="${esc(p?.name || "")}" required>
    <input id="f_phone" placeholder="Phone number" value="${esc(p?.phone || "")}">
    <select id="f_gender">
      <option value="">Gender</option>
      <option value="Female" ${p?.gender === "Female" ? "selected" : ""}>Female</option>
      <option value="Male" ${p?.gender === "Male" ? "selected" : ""}>Male</option>
    </select>
    <input id="f_dob" type="date" value="${p?.dob || ""}">
    <input id="f_address" placeholder="Address" value="${esc(p?.address || "")}">
  `, async () => {
    const data = {
      name: $("f_name").value.trim(), phone: $("f_phone").value.trim(),
      gender: $("f_gender").value, dob: $("f_dob").value, address: $("f_address").value.trim()
    };
    if (p) fire(updateDoc(doc(db, "patients", p.id), data));
    else fire(addDoc(collection(db, "patients"), { ...data, createdAt: serverTimestamp() }));
  });
};
window.editPatient = id => window.openPatientForm(id);
window.deletePatient = id => { if (confirm("Delete this patient record?")) fire(deleteDoc(doc(db, "patients", id))); };

// ================= Receipts =================
function renderReceipts() {
  const sorted = [...cache.sales].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  const rows = sorted.map(s => [
    s.createdAt?.toDate ? s.createdAt.toDate().toLocaleString() : "-",
    (s.items || []).map(i => `${esc(i.name)} x${i.qty}`).join(", "),
    money(s.total), esc(s.soldBy || "")
  ]);
  $("receipts").innerHTML = `
    <div class="section-head"><h3>Receipts</h3></div>
    ${table(["Date", "Items", "Total", "Sold by"], rows)}
  `;
}

// ================= Team =================
function renderTeam() {
  const rows = cache.users.map(u => {
    let actions = "";
    if (isAdmin()) {
      actions = `<span class="actions">
        <button onclick="changeRole('${u.id}','${u.role === 'manager' ? 'user' : 'manager'}')">${u.role === "manager" ? "Make user" : "Make manager"}</button>
        <button onclick="toggleActive('${u.id}', ${u.active === false})">${u.active === false ? "Activate" : "Deactivate"}</button>
      </span>`;
    } else if (isStaff() && u.role === "user") {
      actions = `<span class="actions"><button onclick="toggleActive('${u.id}', ${u.active === false})">${u.active === false ? "Activate" : "Deactivate"}</button></span>`;
    }
    return [
      esc(u.name), esc(u.phone || ""),
      `<span class="pill${u.role === "admin" ? "" : " off"}">${esc(u.role || "user")}</span>`,
      u.active === false ? "Inactive" : "Active",
      actions
    ];
  });

  $("team").innerHTML = `
    <div class="section-head">
      <h3>Team</h3>
      ${isAdmin() ? `<button class="primary-btn" onclick="openTeamForm()">Add team member</button>` : ""}
    </div>
    ${table(["Name", "Phone", "Role", "Status", ""], rows)}
  `;
}

window.openTeamForm = () => {
  modal("Add team member", `
    <input id="f_name" placeholder="Full name" required>
    <input id="f_phone" placeholder="Phone number" required>
    <input id="f_password" type="password" placeholder="Temporary password (min 6 chars)" minlength="6" required>
    <select id="f_role">
      <option value="user">User (data entry only)</option>
      <option value="manager">Manager (can edit &amp; delete)</option>
    </select>
  `, async () => {
    const name = $("f_name").value.trim();
    const phone = $("f_phone").value.trim();
    const password = $("f_password").value;
    const role = $("f_role").value;
    // Create the account on a throwaway secondary Firebase app instance so
    // signing in as the new user doesn't sign the admin out of their own session.
    const secondary = initializeApp(firebaseConfig, "secondary-" + Date.now());
    const secondaryAuth = getAuth(secondary);
    const secondaryDb = getFirestore(secondary);
    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, phoneToEmail(phone), password);
      await setDoc(doc(secondaryDb, "users", cred.user.uid), {
        uid: cred.user.uid, name, phone, role: "user", active: true,
        createdAt: serverTimestamp(), createdBy: currentUser.uid
      });
      await signOut(secondaryAuth);
      if (role !== "user") await updateDoc(doc(db, "users", cred.user.uid), { role });
    } finally {
      await deleteApp(secondary);
    }
  });
};

window.changeRole = (uid, role) => fire(updateDoc(doc(db, "users", uid), { role }));
window.toggleActive = (uid, makeActive) => fire(updateDoc(doc(db, "users", uid), { active: makeActive }));

// ================= Modal =================
function modal(title, fieldsHtml, onSubmit) {
  const root = $("modalRoot");
  root.innerHTML = `
    <div class="modal-overlay">
      <div class="modal">
        <h3>${esc(title)}</h3>
        <form id="modalForm">${fieldsHtml}
          <div class="modal-actions">
            <button type="button" class="cancel" id="modalCancel">Cancel</button>
            <button type="submit" class="submit">Save</button>
          </div>
        </form>
      </div>
    </div>`;
  $("modalCancel").onclick = () => root.innerHTML = "";
  $("modalForm").onsubmit = async e => {
    e.preventDefault();
    try {
      await onSubmit();
      root.innerHTML = "";
    } catch (err) {
      console.error(err);
      alert(err.code === "auth/email-already-in-use" ? "That phone number already has an account." : err.message);
    }
  };
}
