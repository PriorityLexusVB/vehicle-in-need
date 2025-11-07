import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: "AIzaSyBZ9ZdHhBgH-ilOyXhlk0wsH09pXWakbkA",
  authDomain: "vehicles-in-need.firebaseapp.com",
  projectId: "vehicles-in-need",
  storageBucket: "vehicles-in-need.firebasestorage.app",
  messagingSenderId: "136871166517",
  appId: "1:136871166517:web:1615cb71a136a7551ee77c"
};

// Initialize Firebase robustly, preventing re-initialization
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

// Initialize Firebase services
const auth = getAuth(app);
const db = getFirestore(app);

// Explicitly set persistence to be more robust in iframe environments.
setPersistence(auth, browserLocalPersistence)
  .catch((error) => {
    console.error("Error setting auth persistence:", error);
  });

// Configure Google Auth Provider
const googleProvider = new GoogleAuthProvider();
// Restrict login to a specific domain and always show account chooser
googleProvider.setCustomParameters({
  hd: 'priorityautomotive.com',
  prompt: 'select_account'
});

export { db, auth, googleProvider };