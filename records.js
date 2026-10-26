// Highlight the correct sidebar icon
const currentPage = window.location.pathname.split("/").pop();
if (currentPage === "records.html") {
  document.getElementById("nav-records").classList.add("active");
}

const nameInput = document.getElementById("patientName");
const ageInput = document.getElementById("patientAge");
const phoneInput = document.getElementById("patientPhone");
const addPatientBtn = document.getElementById("addPatientBtn");
const patientsBody = document.getElementById("patientsBody");
const searchBox = document.getElementById("searchBox");

let patients = []; // will be filled live from Firestore

// Draw all patients currently in the array onto the page
function renderPatients() {
  patientsBody.innerHTML = "";

  patients.forEach(function (patient) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${patient.name}</td>
      <td>${patient.age}</td>
      <td>${patient.phone}</td>
      <td><button class="delete-btn" data-id="${patient.id}">Delete</button></td>
    `;
    patientsBody.appendChild(row);
  });

  // Attach delete behavior to every delete button
  document.querySelectorAll(".delete-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const id = btn.dataset.id;
      db.collection("patients").doc(id).delete();
      // No need to manually re-render — onSnapshot below will update automatically
    });
  });
}

// Listen for live changes from Firestore (runs immediately, and again anytime data changes)
db.collection("patients").onSnapshot(function (snapshot) {
  patients = [];
  snapshot.forEach(function (doc) {
    patients.push({ id: doc.id, ...doc.data() });
  });
  renderPatients();
});

addPatientBtn.addEventListener("click", function () {
  const name = nameInput.value;
  const age = ageInput.value;
  const phone = phoneInput.value;

  if (name === "" || age === "" || phone === "") {
    alert("Please fill in all fields.");
    return;
  }

  db.collection("patients").add({
    name: name,
    age: age,
    phone: phone
  });
  // No need to manually re-render — onSnapshot will pick this up automatically

  nameInput.value = "";
  ageInput.value = "";
  phoneInput.value = "";
});

searchBox.addEventListener("keyup", function () {
  const searchTerm = searchBox.value.toLowerCase();
  const rows = patientsBody.querySelectorAll("tr");

  rows.forEach(function (row) {
    const nameCell = row.querySelector("td");
    const patientName = nameCell.textContent.toLowerCase();
    row.style.display = patientName.includes(searchTerm) ? "" : "none";
  });
});