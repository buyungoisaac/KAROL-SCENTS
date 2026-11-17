if (!isManager()) {
  alert("Only managers can access Team.");
  window.location.href = "dashboard.html";
}

document.getElementById("userNameDisplay").textContent = currentUser.name;

const newName = document.getElementById("newName");
const newPhone = document.getElementById("newPhone");
const newPassword = document.getElementById("newPassword");
const newRole = document.getElementById("newRole");
const addUserBtn = document.getElementById("addUserBtn");
const usersBody = document.getElementById("usersBody");

let users = [];

function countManagers() {
  return users.filter(function (u) { return u.role === "manager"; }).length;
}

function renderUsers() {
  usersBody.innerHTML = "";
  users.forEach(function (user) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${user.name}</td>
      <td>${user.phone}</td>
      <td>${user.role}</td>
      <td>${user.phone !== currentUser.phone ? `<button class="delete-btn" data-id="${user.id}">Remove</button>` : ""}</td>
    `;
    usersBody.appendChild(row);
  });

  document.querySelectorAll(".delete-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const id = btn.dataset.id;
      db.collection("users").doc(id).delete();
    });
  });
}

// Live listener - keeps the team list updated automatically
db.collection("users").onSnapshot(function (snapshot) {
  users = [];
  snapshot.forEach(function (doc) {
    users.push({ id: doc.id, ...doc.data() });
  });
  renderUsers();
});

addUserBtn.addEventListener("click", function () {
  const name = newName.value;
  const phone = newPhone.value;
  const password = newPassword.value;
  const role = newRole.value;

  if (name === "" || phone === "" || password === "") {
    alert("Please fill in all fields.");
    return;
  }

  if (users.some(function (u) { return u.phone === phone; })) {
    alert("A user with this phone number already exists.");
    return;
  }

  if (role === "manager" && countManagers() >= 3) {
    alert("Maximum of 3 managers already reached.");
    return;
  }

  db.collection("users").add({
    name: name,
    phone: phone,
    password: password,
    role: role
  });

  newName.value = "";
  newPhone.value = "";
  newPassword.value = "";
  newRole.value = "member";
});

// ================= Tabs =================
document.querySelectorAll(".tabs .tab").forEach(function (btn) {
  btn.addEventListener("click", function () {
    document.querySelectorAll(".tabs .tab").forEach(function (b) {
      b.classList.toggle("active", b === btn);
    });
    document.getElementById("tab-users").hidden = btn.dataset.tab !== "users";
    document.getElementById("tab-company").hidden = btn.dataset.tab !== "company";
  });
});

// ================= Company tab =================
const coName = document.getElementById("coName");
const coPhone = document.getElementById("coPhone");
const coAddress = document.getElementById("coAddress");
const coHeader = document.getElementById("coHeader");
const coFooter = document.getElementById("coFooter");
const coCurrency = document.getElementById("coCurrency");
const coShowLogo = document.getElementById("coShowLogo");
const coStatus = document.getElementById("coStatus");
const logoPreview = document.getElementById("logoPreview");
const logoFile = document.getElementById("logoFile");
let companyLogo = "";   // data URL of the chosen logo ("" = default LOGO.png)
let companyFormFilled = false;

function fillCompanyForm(c) {
  coName.value = c.name || "";
  coPhone.value = c.phone || "";
  coAddress.value = c.address || "";
  coHeader.value = c.receiptHeader || "";
  coFooter.value = c.receiptFooter || "";
  coCurrency.value = c.currency || "";
  coShowLogo.checked = c.showLogoOnReceipt !== false;
  companyLogo = c.logo || "";
  logoPreview.src = companyLogo || "LOGO.png";
}

function readCompanyForm() {
  return {
    name: coName.value.trim() || companyDefaults.name,
    phone: coPhone.value.trim(),
    address: coAddress.value.trim(),
    receiptHeader: coHeader.value.trim(),
    receiptFooter: coFooter.value.trim(),
    currency: coCurrency.value.trim(),
    showLogoOnReceipt: coShowLogo.checked,
    logo: companyLogo
  };
}

// Fill the form once with the saved settings (don't overwrite what's being typed later)
fillCompanyForm(getCompany());
window.addEventListener("company-updated", function (e) {
  if (!companyFormFilled) { fillCompanyForm(e.detail); companyFormFilled = true; }
});

// Shrink the chosen image so it fits comfortably in the database
logoFile.addEventListener("change", function () {
  const file = logoFile.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function () {
    const img = new Image();
    img.onload = function () {
      const max = 300;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      companyLogo = canvas.toDataURL("image/png");
      logoPreview.src = companyLogo;
    };
    img.onerror = function () { alert("That file could not be read as an image."); };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
  logoFile.value = "";
});

document.getElementById("logoReset").addEventListener("click", function () {
  companyLogo = "";
  logoPreview.src = "LOGO.png";
});

document.getElementById("coSave").addEventListener("click", function () {
  coStatus.textContent = "Saving...";
  saveCompany(readCompanyForm()).then(function () {
    coStatus.textContent = "Saved";
    setTimeout(function () { coStatus.textContent = ""; }, 3000);
  }).catch(function (err) {
    console.error(err);
    coStatus.textContent = "";
    alert("Could not save: " + err.message);
  });
});

// Print a sample receipt using what's currently in the form (saved or not)
document.getElementById("coPreview").addEventListener("click", function () {
  printReceipt({
    saleNumber: "TEST",
    date: new Date().toLocaleString(),
    items: [
      { name: "Sample perfume", qty: 2, price: 25000, total: 50000 },
      { name: "Sample oil", qty: 1, price: 15000, total: 15000 }
    ],
    total: 65000
  }, readCompanyForm());
});
