
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
const storage = firebase.storage();
