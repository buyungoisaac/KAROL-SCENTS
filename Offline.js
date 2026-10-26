// Offline helper: registers the service worker and shows a status bar.
(function () {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(function (e) {
      console.warn("Service worker failed:", e);
    });
  }

  var bar = document.createElement("div");
  bar.style.cssText =
    "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);" +
    "padding:10px 18px;border-radius:999px;font:600 13px sans-serif;" +
    "color:#fff;z-index:99999;display:none;box-shadow:0 6px 18px rgba(0,0,0,.2)";
  document.addEventListener("DOMContentLoaded", function () {
    document.body.appendChild(bar);
    if (!navigator.onLine) showOffline();
  });

  function show(text, color, hideAfter) {
    bar.textContent = text;
    bar.style.background = color;
    bar.style.display = "block";
    if (hideAfter) setTimeout(function () { bar.style.display = "none"; }, hideAfter);
  }
  function showOffline() {
    show("Offline - your work is saved on this computer and will sync automatically", "#8a5a00");
  }

  window.addEventListener("offline", showOffline);
  window.addEventListener("online", function () {
    show("Back online - syncing...", "#214E3D");
    if (typeof db !== "undefined" && db.waitForPendingWrites) {
      db.waitForPendingWrites().then(function () {
        show("All changes synced", "#214E3D", 3000);
      });
    } else {
      show("Back online", "#214E3D", 3000);
    }
  });
})();
