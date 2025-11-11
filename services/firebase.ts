<<<<<<< HEAD
// Switched from CDN module URLs to bundled Firebase imports for consistent build behavior
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
=======
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";
>>>>>>> feat/admin-hardening-docs

export const firebaseConfig = {
  apiKey: "AIzaSyBZ9ZdHhBgH-ilOyXhlk0wsH09pXWakbkA",
  authDomain: "vehicles-in-need.firebaseapp.com",
  projectId: "vehicles-in-need",
  storageBucket: "vehicles-in-need.firebasestorage.app",
  messagingSenderId: "136871166517",
<<<<<<< HEAD
  appId: "1:136871166517:web:1615cb71a136a7551ee77c",
=======
  appId: "1:136871166517:web:1615cb71a136a7551ee77c"
>>>>>>> feat/admin-hardening-docs
};

// Initialize Firebase robustly, preventing re-initialization
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

// Initialize Firebase services
const auth = getAuth(app);
const db = getFirestore(app);

// Explicitly set persistence to be more robust in iframe environments.
<<<<<<< HEAD
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error("Error setting auth persistence:", error);
});
=======
setPersistence(auth, browserLocalPersistence)
  .catch((error) => {
    console.error("Error setting auth persistence:", error);
  });
>>>>>>> feat/admin-hardening-docs

// Configure Google Auth Provider
const googleProvider = new GoogleAuthProvider();
// Restrict login to a specific domain and always show account chooser
googleProvider.setCustomParameters({
<<<<<<< HEAD
  hd: "priorityautomotive.com",
  prompt: "select_account",
});

export { db, auth, googleProvider };
=======
  hd: 'priorityautomotive.com',
  prompt: 'select_account'
});

export { db, auth, googleProvider };
>>>>>>> feat/admin-hardening-docs
