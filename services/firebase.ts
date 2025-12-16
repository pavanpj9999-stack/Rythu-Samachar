import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

// --- MANUAL CONFIGURATION ---
// IMPORTANT: If your deployment keys fail, paste them directly inside the quotes below.
const manualConfig = {
  apiKey: "", 
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

// --- CONFIGURATION LOGIC ---
const getKey = (keyName: string, manualValue: string) => {
    // 1. Prioritize Manual Value
    if (manualValue && manualValue.trim() !== "") return manualValue;
    
    // 2. Try Vite's import.meta.env
    // @ts-ignore
    if (import.meta.env && import.meta.env[`VITE_${keyName}`]) {
        // @ts-ignore
        return import.meta.env[`VITE_${keyName}`];
    }

    // 3. Try process.env
    // @ts-ignore
    if (typeof process !== 'undefined' && process.env && process.env[keyName]) {
        // @ts-ignore
        return process.env[keyName];
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

// Validation
const isConfigValid = 
    firebaseConfig.apiKey && 
    firebaseConfig.apiKey !== "YOUR_API_KEY_HERE" &&
    !String(firebaseConfig.apiKey).includes("undefined") &&
    firebaseConfig.projectId;

if (isConfigValid) {
    try {
        app = initializeApp(firebaseConfig);
        console.log("✅ Firebase Connected: " + firebaseConfig.projectId);
    } catch (e: any) {
        if (e.code === 'app/duplicate-app') {
            console.warn("Firebase App already initialized.");
        } else {
            console.error("Firebase Initialization Failed:", e);
        }
    }
} else {
    console.warn("⚠️ Firebase Keys Missing. App running in OFFLINE MODE (Data will not sync).");
    console.log("Please add keys to your hosting environment variables OR paste them in services/firebase.ts manualConfig");
}

// Safely initialize services
const safelyInitialize = (initFn: (app: any) => any, serviceName: string) => {
    if (!app) return null;
    try {
        return initFn(app);
    } catch (e) {
        console.error(`${serviceName} failed to start.`, e);
        return null;
    }
};

export const db = safelyInitialize(getFirestore, 'Firestore');
export const storage = safelyInitialize(getStorage, 'Storage');
export const auth = safelyInitialize(getAuth, 'Auth');

export default app;