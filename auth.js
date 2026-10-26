const currentUser = JSON.parse(localStorage.getItem("currentUser"));

// If nobody is logged in, kick back to login page
if (!currentUser) {
  window.location.href = "index.html";
}

function logout() {
  localStorage.removeItem("currentUser");
  window.location.href = "index.html";
}

function isManager() {
  return currentUser && currentUser.role === "manager";
}
const profileTrigger = document.getElementById("profileTrigger");
const profileDropdown = document.getElementById("profileDropdown");
const userRoleDisplay = document.getElementById("userRoleDisplay");

if (profileTrigger && profileDropdown) {
  profileTrigger.addEventListener("click", function () {
    profileDropdown.classList.toggle("show");
  });

  // Close the dropdown if you click anywhere else on the page
  document.addEventListener("click", function (event) {
    if (!profileTrigger.contains(event.target) && !profileDropdown.contains(event.target)) {
      profileDropdown.classList.remove("show");
    }
  });
}

if (userRoleDisplay && currentUser) {
  userRoleDisplay.textContent = "Role: " + currentUser.role;
}