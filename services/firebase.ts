import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

// TODO: Replace these values with your actual Firebase Project Configuration
// Get these from: Firebase Console -> Project Settings -> General -> Your Apps
const firebaseConfig = {
  // Use environment variables if available, otherwise these placeholders need to be updated manually
  apiKey: process.env.FIREBASE_API_KEY || "YOUR_API_KEY_HERE",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "rythu-samachar-portal.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "rythu-samachar-portal",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "rythu-samachar-portal.appspot.com",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "YOUR_SENDER_ID",
  appId: process.env.FIREBASE_APP_ID || "YOUR_APP_ID"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Services
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

export default app;