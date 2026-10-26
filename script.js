
const loginBtn = document.getElementById("loginBtn");
const phoneInput = document.getElementById("phone");
const passwordInput = document.getElementById("password");
const errorMsg = document.getElementById("errorMsg");

if (!loginBtn || !phoneInput || !passwordInput || !errorMsg) {
  console.error("Login form elements are missing.");
} else if (typeof db === "undefined") {
  console.error("Firebase database is not initialized.");
} else {
  // Create the default manager account if no users exist.
  db.collection("users")
    .get()
    .then(function (snapshot) {
      if (snapshot.empty) {
        return db.collection("users").add({
          name: "Isaac Mukisa",
          phone: "0758913473",
          password: "300241004",
          role: "manager"
        });
      }
    })
    .catch(function (error) {
      console.error("Manager account setup failed:", error);
    });

  // Login function
  function login() {
    const phone = phoneInput.value.trim();
    const password = passwordInput.value;

    if (!phone || !password) {
      errorMsg.textContent = "Please fill in both fields.";
      errorMsg.style.display = "block";
      return;
    }

    errorMsg.style.display = "none";
    loginBtn.disabled = true;

    db.collection("users")
      .where("phone", "==", phone)
      .where("password", "==", password)
      .get()
      .then(function (snapshot) {
        if (snapshot.empty) {
          errorMsg.textContent =
            "Invalid phone number or password.";
          errorMsg.style.display = "block";
          return;
        }

        const userDoc = snapshot.docs[0];
        const foundUser = {
          id: userDoc.id,
          ...userDoc.data()
        };

        localStorage.setItem(
          "currentUser",
          JSON.stringify(foundUser)
        );

        window.location.href = "dashboard.html";
      })
      .catch(function (error) {
        console.error("Login failed:", error);
        errorMsg.textContent =
          "Unable to sign in. Please try again.";
        errorMsg.style.display = "block";
      })
      .finally(function () {
        loginBtn.disabled = false;
      });
  }

  // Clicking Sign In
  loginBtn.addEventListener("click", login);

  // Pressing Enter in either login field
  [phoneInput, passwordInput].forEach(function (input) {
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        login();
      }
    });
  });
}
