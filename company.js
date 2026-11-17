// Company settings: name, phone, logo and receipt wording.
// Stored in Firestore at settings/company and shared by every page.
// Also provides printReceipt(sale) used by the Receipts page.
(function () {
  var KEY = "companySettings";
  var DEFAULTS = {
    name: "Karol's Scents",
    phone: "",
    address: "",
    logo: "",                       // small image stored as a data URL
    currency: "",                   // e.g. UGX (shown before amounts on receipts)
    receiptHeader: "",              // extra line under the company name
    receiptFooter: "Thank you for your purchase!",
    showLogoOnReceipt: true
  };

  var company = Object.assign({}, DEFAULTS);
  try {
    var saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) company = Object.assign({}, DEFAULTS, saved);
  } catch (e) {}

  // "KAROL'S SCENTS - Team" -> keep the page part, swap the company part
  var pageTitlePart = (document.title.split(" - ")[1] || "").trim();

  function applyBranding() {
    document.querySelectorAll(".logo-img").forEach(function (img) {
      img.src = company.logo || "LOGO.png";
      img.alt = company.name;
    });
    document.title = company.name.toUpperCase() + (pageTitlePart ? " - " + pageTitlePart : "");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyBranding);
  } else {
    applyBranding();
  }

  if (typeof db !== "undefined") {
    db.collection("settings").doc("company").onSnapshot(function (snap) {
      company = Object.assign({}, DEFAULTS, snap.exists ? snap.data() : {});
      try { localStorage.setItem(KEY, JSON.stringify(company)); } catch (e) {}
      applyBranding();
      window.dispatchEvent(new CustomEvent("company-updated", { detail: company }));
    }, function (err) {
      console.warn("Could not load company settings:", err);
    });
  }

  window.companyDefaults = DEFAULTS;
  window.getCompany = function () { return Object.assign({}, company); };
  window.saveCompany = function (data) {
    return db.collection("settings").doc("company").set(data);
  };

  // ---------- printing ----------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // c = company settings to use (defaults to the saved ones; the Team page
  // passes unsaved form values for its "Preview" button)
  window.printReceipt = function (sale, c) {
    c = c || company;
    function money(n) {
      return (c.currency ? esc(c.currency) + " " : "") + Number(n || 0).toLocaleString();
    }

    var rows = (sale.items || []).map(function (i) {
      return '<tr><td>' + esc(i.name) +
        '<div class="sub">' + esc(i.qty) + ' x ' + money(i.price) + '</div></td>' +
        '<td class="r">' + money(i.total) + '</td></tr>';
    }).join("");

    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Receipt #' +
      esc(sale.saleNumber || "") + '</title><style>' +
      '@page{size:50mm auto;margin:2mm}' +
      'body{font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#000;width:46mm;margin:0 auto;padding:0}' +
      '.c{text-align:center}' +
      'img.logo{max-width:28mm;max-height:20mm;margin-bottom:3px}' +
      'h1{font-size:13px;margin:0 0 2px}' +
      '.muted{font-size:9px;margin:1px 0;white-space:pre-line}' +
      'hr{border:0;border-top:1px dashed #000;margin:5px 0}' +
      'table{width:100%;border-collapse:collapse}' +
      'td{padding:2px 0;vertical-align:top}' +
      '.r{text-align:right;white-space:nowrap;padding-left:4px}' +
      '.sub{font-size:9px;color:#444}' +
      '.total td{font-weight:700;font-size:12px;padding-top:4px;border-top:1px solid #000}' +
      '.meta{font-size:9px}' +
      '.foot{margin-top:8px;font-size:9px;white-space:pre-line}' +
      '</style></head><body>' +
      '<div class="c">' +
      (c.showLogoOnReceipt !== false ? '<img class="logo" src="' + esc(c.logo || new URL("LOGO.png", location.href).href) + '">' : '') +
      '<h1>' + esc(c.name) + '</h1>' +
      (c.receiptHeader ? '<div class="muted">' + esc(c.receiptHeader) + '</div>' : '') +
      (c.address ? '<div class="muted">' + esc(c.address) + '</div>' : '') +
      (c.phone ? '<div class="muted">Tel: ' + esc(c.phone) + '</div>' : '') +
      '</div><hr>' +
      '<div class="meta">Receipt #' + esc(sale.saleNumber || "-") + '<br>' + esc(sale.date || "") + '</div>' +
      '<hr><table>' + rows +
      '<tr class="total"><td>TOTAL</td><td class="r">' + money(sale.total) + '</td></tr></table>' +
      (c.receiptFooter ? '<div class="foot c">' + esc(c.receiptFooter) + '</div>' : '') +
      '</body></html>';

    var frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(frame);
    var doc = frame.contentDocument;
    doc.open();
    doc.write(html);
    doc.close();

    // wait for the logo to load before the print dialog opens
    var imgs = Array.prototype.slice.call(doc.images);
    Promise.all(imgs.map(function (img) {
      return img.complete ? Promise.resolve() :
        new Promise(function (res) { img.onload = img.onerror = res; });
    })).then(function () {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      setTimeout(function () { frame.remove(); }, 60000);
    });
  };
})();
