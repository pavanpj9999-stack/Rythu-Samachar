import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

// --- PASTE YOUR KEYS HERE ---
// 1. Go to console.firebase.google.com
// 2. Select your project > Project Settings (Gear Icon) > General
// 3. Scroll down to "Your apps" and copy the config values
const manualConfig = {
  apiKey: "PASTE_YOUR_API_KEY_HERE",             // e.g. "AIzaSy..."
  authDomain: "PASTE_YOUR_AUTH_DOMAIN_HERE",     // e.g. "rythu-app.firebaseapp.com"
  projectId: "PASTE_YOUR_PROJECT_ID_HERE",       // e.g. "rythu-app"
  storageBucket: "PASTE_YOUR_STORAGE_BUCKET_HERE", // e.g. "rythu-app.appspot.com"
  messagingSenderId: "PASTE_YOUR_SENDER_ID_HERE", // e.g. "123456789"
  appId: "PASTE_YOUR_APP_ID_HERE"                // e.g. "1:12345:web:abcdef"
};

// --- CONFIGURATION LOGIC ---
const getKey = (keyName: string, manualValue: string) => {
    // 1. Prioritize Manual Value (if pasted above)
    if (manualValue && manualValue !== "PASTE_YOUR_API_KEY_HERE" && manualValue !== "PASTE_YOUR_AUTH_DOMAIN_HERE" && !manualValue.includes("PASTE_YOUR")) {
        return manualValue;
    }
    
    // 2. Try Vite's import.meta.env (for deployed environments)
    // @ts-ignore
    if (import.meta.env && import.meta.env[`VITE_${keyName}`]) {
        // @ts-ignore
        return import.meta.env[`VITE_${keyName}`];
    }

    return undefined;
};

const firebaseConfig = {
  apiKey: getKey('FIREBASE_API_KEY', manualConfig.apiKey),
  authDomain: getKey('FIREBASE_AUTH_DOMAIN', manualConfig.authDomain),
  projectId: getKey('FIREBASE_PROJECT_ID', manualConfig.projectId),
  storageBucket: getKey('FIREBASE_STORAGE_BUCKET', manualConfig.storageBucket),
  messagingSenderId: getKey('FIREBASE_MESSAGING_SENDER_ID', manualConfig.messagingSenderId),
  appId: getKey('FIREBASE_APP_ID', manualConfig.appId)
};

// --- INITIALIZATION ---
let app = null;
let firestoreDb = null;
let firestoreStorage = null;
let firestoreAuth = null;

// Validation
const isConfigValid = 
    firebaseConfig.apiKey && 
    !firebaseConfig.apiKey.includes("PASTE_YOUR");

if (isConfigValid) {
    try {
        app = initializeApp(firebaseConfig);
        firestoreDb = getFirestore(app);
        firestoreStorage = getStorage(app);
        firestoreAuth = getAuth(app);
        console.log("✅ Firebase Connected: " + firebaseConfig.projectId);
    } catch (e: any) {
        if (e.code === 'app/duplicate-app') {
            console.warn("Firebase App already initialized.");
        } else {
            console.error("Firebase Initialization Failed:", e);
        }
    }
} else {
    console.warn("⚠️ Firebase Keys Missing. App running in DEMO MODE (Offline). Data will not sync.");
}

export const db = firestoreDb;
export const storage = firestoreStorage;
export const auth = firestoreAuth;

export default app;