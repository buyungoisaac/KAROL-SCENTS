if (!isManager()) {
  alert("Only managers can access the Assistant.");
  window.location.href = "dashboard.html";
}

document.getElementById("userNameDisplay").textContent = currentUser.name;

const chatWindow = document.getElementById("chatWindow");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");

let pendingAction = null;

function addMessage(text, sender) {
  const msg = document.createElement("div");
  msg.className = "chat-msg " + sender;
  msg.textContent = text;
  chatWindow.appendChild(msg);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function handleCommand(text) {
  const command = text.toLowerCase().trim();

  // Handle yes/no confirmation first
  if (pendingAction) {
    if (command === "yes" || command === "confirm") {
      pendingAction.confirm();
      pendingAction = null;
      return;
    }
    if (command === "no" || command === "cancel") {
      addMessage("Cancelled.", "assistant");
      pendingAction = null;
      return;
    }
    addMessage("Please reply 'yes' or 'no' to confirm the previous action.", "assistant");
    return;
  }

  // --- Navigation commands ---
  if (command.includes("go to inventory") || command.includes("open inventory")) {
    addMessage("Opening Inventory...", "assistant");
    setTimeout(function () { window.location.href = "inventory.html"; }, 800);
    return;
  }
  if (command.includes("go to receipts") || command.includes("open receipts")) {
    addMessage("Opening Receipts...", "assistant");
    setTimeout(function () { window.location.href = "receipts.html"; }, 800);
    return;
  }
  if (command.includes("go to records") || command.includes("open records")) {
    addMessage("Opening Records...", "assistant");
    setTimeout(function () { window.location.href = "records.html"; }, 800);
    return;
  }
  if (command.includes("go to pos") || command.includes("point of sale")) {
    addMessage("Opening Point of Sale...", "assistant");
    setTimeout(function () { window.location.href = "pos.html"; }, 800);
    return;
  }
  if (command.includes("go to team") || command.includes("open team")) {
    addMessage("Opening Team...", "assistant");
    setTimeout(function () { window.location.href = "team.html"; }, 800);
    return;
  }

  // --- Data questions ---
  if (command.includes("how many patients")) {
    db.collection("patients").get().then(function (snapshot) {
      addMessage(`There are ${snapshot.size} patients recorded.`, "assistant");
    });
    return;
  }

  if (command.includes("expired Products") && command.includes("how many")) {
    db.collection("Products").get().then(function (snapshot) {
      const today = new Date();
      let expiredCount = 0;
      snapshot.forEach(function (doc) {
        if (new Date(doc.data().expiry) < today) expiredCount++;
      });
      addMessage(`There are ${expiredCount} expired Products.`, "assistant");
    });
    return;
  }

  if (command.includes("out of stock")) {
    db.collection("Products").get().then(function (snapshot) {
      let outCount = 0;
      snapshot.forEach(function (doc) {
        if (doc.data().qty === 0) outCount++;
      });
      addMessage(`There are ${outCount} Products out of stock.`, "assistant");
    });
    return;
  }

  if (command.includes("total sales") || command.includes("how much sold")) {
    db.collection("sales").get().then(function (snapshot) {
      let total = 0;
      snapshot.forEach(function (doc) { total += doc.data().total; });
      addMessage(`Total sales recorded: ${total}.`, "assistant");
    });
    return;
  }

  // --- Remove a patient by name ---
  if (command.startsWith("remove patient ")) {
    const nameQuery = command.replace("remove patient ", "").trim();
    db.collection("patients").get().then(function (snapshot) {
      const matches = [];
      snapshot.forEach(function (doc) {
        const data = doc.data();
        if (data.name.toLowerCase().includes(nameQuery)) {
          matches.push({ id: doc.id, ...data });
        }
      });

      if (matches.length === 0) {
        addMessage(`No patient found matching "${nameQuery}".`, "assistant");
        return;
      }
      if (matches.length > 1) {
        const names = matches.map(function (p) { return p.name; }).join(", ");
        addMessage(`Multiple matches found: ${names}. Please be more specific.`, "assistant");
        return;
      }

      const target = matches[0];
      addMessage(`Remove patient "${target.name}" (age ${target.age}, phone ${target.phone})? Reply yes or no.`, "assistant");
      pendingAction = {
        confirm: function () {
          db.collection("patients").doc(target.id).delete();
          addMessage(`Patient "${target.name}" removed.`, "assistant");
        }
      };
    });
    return;
  }

  // --- Remove a single Product by name ---
  if (command.startsWith("remove Product ")) {
    const nameQuery = command.replace("remove Product ", "").trim();
    db.collection("Products").get().then(function (snapshot) {
      const matches = [];
      snapshot.forEach(function (doc) {
        const data = doc.data();
        if (data.name.toLowerCase().includes(nameQuery)) {
          matches.push({ id: doc.id, ...data });
        }
      });

      if (matches.length === 0) {
        addMessage(`No Product found matching "${nameQuery}".`, "assistant");
        return;
      }
      if (matches.length > 1) {
        const names = matches.map(function (d) { return d.name; }).join(", ");
        addMessage(`Multiple matches found: ${names}. Please be more specific.`, "assistant");
        return;
      }

      const target = matches[0];
      addMessage(`Remove Product "${target.name}" (qty ${target.qty}, expiry ${target.expiry})? Reply yes or no.`, "assistant");
      pendingAction = {
        confirm: function () {
          db.collection("Products").doc(target.id).delete();
          addMessage(`Product "${target.name}" removed.`, "assistant");
        }
      };
    });
    return;
  }

  // --- Remove ALL expired Products at once ---
  if (command.includes("remove expired Products") || command.includes("clear expired Products")) {
    db.collection("Products").get().then(function (snapshot) {
      const today = new Date();
      const expired = [];
      snapshot.forEach(function (doc) {
        const data = doc.data();
        if (new Date(data.expiry) < today) {
          expired.push({ id: doc.id, ...data });
        }
      });

      if (expired.length === 0) {
        addMessage("There are no expired Products to remove.", "assistant");
        return;
      }

      const names = expired.map(function (d) { return d.name; }).join(", ");
      addMessage(`Remove ${expired.length} expired Product(s): ${names}? Reply yes or no.`, "assistant");
      pendingAction = {
        confirm: function () {
          expired.forEach(function (d) {
            db.collection("Products").doc(d.id).delete();
          });
          addMessage(`${expired.length} expired Product(s) removed.`, "assistant");
        }
      };
    });
    return;
  }

  // --- Remove a sale by its number ---
  if (command.startsWith("remove sale ")) {
    const numberText = command.replace("remove sale ", "").trim();
    const saleNumber = Number(numberText);

    db.collection("sales").where("saleNumber", "==", saleNumber).get().then(function (snapshot) {
      if (snapshot.empty) {
        addMessage(`No sale found with number ${saleNumber}.`, "assistant");
        return;
      }

      const targetDoc = snapshot.docs[0];
      const target = { id: targetDoc.id, ...targetDoc.data() };

      addMessage(`Remove Sale #${target.saleNumber} from ${target.date}, total ${target.total}? Reply yes or no.`, "assistant");
      pendingAction = {
        confirm: function () {
          db.collection("sales").doc(target.id).delete();
          addMessage(`Sale #${target.saleNumber} removed.`, "assistant");
        }
      };
    });
    return;
  }

  // --- Change the date/time of a sale ---
  if (command.startsWith("change sale ") && command.includes(" date to ")) {
    const rest = command.replace("change sale ", "");
    const parts = rest.split(" date to ");
    const saleNumber = Number(parts[0].trim());
    const newDateText = parts[1].trim();

    const parsedDate = new Date(newDateText);
    if (isNaN(parsedDate.getTime())) {
      addMessage(`I couldn't understand that date. Try something like "change sale 3 date to August 20 2026 3:00 PM".`, "assistant");
      return;
    }

    db.collection("sales").where("saleNumber", "==", saleNumber).get().then(function (snapshot) {
      if (snapshot.empty) {
        addMessage(`No sale found with number ${saleNumber}.`, "assistant");
        return;
      }

      const targetDoc = snapshot.docs[0];
      const target = { id: targetDoc.id, ...targetDoc.data() };

      addMessage(`Change Sale #${target.saleNumber} date from ${target.date} to ${parsedDate.toLocaleString()}? Reply yes or no.`, "assistant");
      pendingAction = {
        confirm: function () {
          db.collection("sales").doc(target.id).update({
            date: parsedDate.toLocaleString()
          });
          addMessage(`Sale #${target.saleNumber} date updated to ${parsedDate.toLocaleString()}.`, "assistant");
        }
      };
    });
    return;
  }

  // Nothing matched
  addMessage("I don't understand that command. Try: 'go to inventory', 'how many patients', 'remove patient John', 'remove Product Amoxyl', 'remove expired Products', 'remove sale 3', 'change sale 3 date to August 20 2026 3:00 PM'.", "assistant");
}

sendBtn.addEventListener("click", function () {
  const text = chatInput.value;
  if (text === "") return;

  addMessage(text, "user");
  handleCommand(text);
  chatInput.value = "";
});

chatInput.addEventListener("keyup", function (event) {
  if (event.key === "Enter") {
    sendBtn.click();
  }
});

addMessage("Hi! I'm your assistant. Try commands like 'go to inventory', 'how many patients', 'remove Product Amoxyl', or 'remove sale 3'.", "assistant");