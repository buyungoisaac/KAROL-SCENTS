// Highlight the correct sidebar icon
const currentPage = window.location.pathname.split("/").pop();
if (currentPage === "dashboard.html") {
  document.getElementById("nav-home").classList.add("active");
}

if (!isManager()) {
  document.getElementById("nav-inventory").style.display = "none";
  document.getElementById("nav-receipts").style.display = "none";
  document.getElementById("nav-team").style.display = "none";
  document.getElementById("nav-assistant").style.display = "none";
}

document.getElementById("userNameDisplay").textContent = currentUser.name;

const posQuickBtn = document.getElementById("posQuickBtn");
posQuickBtn.addEventListener("click", function () {
  window.location.href = "pos.html";
});

// Live patient count
db.collection("patients").onSnapshot(function (snapshot) {
  document.getElementById("patientsCount").textContent = snapshot.size;
});

// Live expired / out-of-stock drug counts
db.collection("drugs").onSnapshot(function (snapshot) {
  const today = new Date();
  let expiredCount = 0;
  let outOfStockCount = 0;

  snapshot.forEach(function (doc) {
    const drug = doc.data();
    const expiryDate = new Date(drug.expiry);
    if (expiryDate < today) {
      expiredCount++;
    }
    if (drug.qty === 0) {
      outOfStockCount++;
    }
  });

  document.getElementById("expiredCount").textContent = expiredCount;
  document.getElementById("outOfStockCount").textContent = outOfStockCount;
});