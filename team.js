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