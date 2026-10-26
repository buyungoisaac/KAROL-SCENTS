const firebaseConfig = {
  apiKey: "AIzaSyCdH9paNOJl15ydRCIT9UqoxdtTe9oXVx8",
  authDomain: "clinic-erp-74896.firebaseapp.com",
  projectId: "clinic-erp-74896",
  storageBucket: "clinic-erp-74896.appspot.com",
  messagingSenderId: "1061267608841",
  appId: "1:1061267608841:web:f91ebf9a62d10a6a05efd8"
};

// Initialize Firebase only once
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();

// OFFLINE MODE: keep a copy of the data on this computer.
// Works offline and syncs automatically when the internet returns.
db.settings({ cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED });
db.enablePersistence({ synchronizeTabs: true }).catch(function (err) {
  if (err.code === "failed-precondition") {
    console.warn("Offline mode: close other tabs of this app and refresh.");
  } else if (err.code === "unimplemented") {
    console.warn("Offline mode is not supported in this browser.");
  } else {
    console.warn("Offline mode error:", err);
  }
});

// Only the login page loads the storage script, so check first
const storage = firebase.storage ? firebase.storage() : null;
