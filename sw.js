// Service worker: lets the app open with no internet.
const CACHE = "clinic-erp-v1"; // change v1 -> v2 after each deploy to force a refresh

const FILES = [
  "./", "index.html", "dashboard.html", "pos.html", "records.html",
  "inventory.html", "receipts.html", "team.html", "assistant.html",
  "dashboard.css", "inventory.css", "pos.css", "records.css", "receipts.css",
  "assistant.css", "style.css",
  "auth.js", "dashboard.js", "pos.js", "records.js", "inventory.js",
  "receipts.js", "team.js", "assistant.js", "script.js", "app.js",
  "firebase-config.js", "offline.js", "manifest.json", "LOGO.png",
  "https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js",
  "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage-compat.js"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // add one by one so a missing file doesn't break everything
      return Promise.all(FILES.map(function (f) { return c.add(f).catch(function () {}); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  var sameOrigin = url.origin === location.origin;
  var firebaseSdk = url.hostname === "www.gstatic.com";
  if (!sameOrigin && !firebaseSdk) return; // Firestore traffic is handled by Firebase itself

  if (firebaseSdk) {
    // SDK files never change: cache first
    e.respondWith(caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      });
    }));
    return;
  }

  // Our own files: try the internet first (so updates show), fall back to saved copy
  e.respondWith(
    fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) {
        return hit || caches.match("index.html");
      });
    })
  );
});
