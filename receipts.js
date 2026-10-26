// Highlight the correct sidebar icon
const currentPage = window.location.pathname.split("/").pop();
if (currentPage === "receipts.html") {
  document.getElementById("nav-receipts").classList.add("active");
}

document.getElementById("userNameDisplay").textContent = currentUser.name;

const receiptsContainer = document.getElementById("receiptsContainer");

function renderReceipts(sales) {
  receiptsContainer.innerHTML = "";

  if (sales.length === 0) {
    receiptsContainer.innerHTML = "<p>No sales yet.</p>";
    return;
  }

  // Show most recent sales first, sorted by sale number
  sales.sort(function (a, b) { return b.saleNumber - a.saleNumber; });

  sales.forEach(function (sale) {
    const card = document.createElement("div");
    card.className = "receipt-card";

    let itemsHtml = "";
    sale.items.forEach(function (item) {
      itemsHtml += `
        <tr>
          <td>${item.name}</td>
          <td>${item.qty} x ${item.price}</td>
          <td style="text-align:right;">${item.total}</td>
        </tr>
      `;
    });

    card.innerHTML = `
      <div class="receipt-header">
        <span>Sale #${sale.saleNumber || "-"}</span>
        <span>${sale.date}</span>
      </div>
      <table>${itemsHtml}</table>
      <div class="receipt-total">Total: ${sale.total}</div>
    `;

    receiptsContainer.appendChild(card);
  });
}

// Live listener - keeps receipts updated automatically across all devices
db.collection("sales").onSnapshot(function (snapshot) {
  const sales = [];
  snapshot.forEach(function (doc) {
    sales.push({ id: doc.id, ...doc.data() });
  });
  renderReceipts(sales);
});