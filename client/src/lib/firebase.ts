import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// TODO: Replace with your actual Firebase configuration
// For now, this is a placeholder structure
const firebaseConfig = {
  apiKey: "AIzaSyD-PLACEHOLDER-API-KEY",
  authDomain: "stock-manager-placeholder.firebaseapp.com",
  projectId: "stock-manager-placeholder",
  storageBucket: "stock-manager-placeholder.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:placeholder"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;