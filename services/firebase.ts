import { initializeApp, getApps, getApp } from 'firebase/app';
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

// Check LocalStorage for dynamic config (Admin Panel Override)
const getLocalConfig = () => {
    try {
        const stored = typeof window !== 'undefined' ? localStorage.getItem('rythu_firebase_config') : null;
        if (stored) return JSON.parse(stored);
    } catch (e) { console.error("Invalid Local Config", e); }
    return null;
};

const localConfig = getLocalConfig();

const firebaseConfig = localConfig || {
  apiKey: getKey('FIREBASE_API_KEY', manualConfig.apiKey),
  authDomain: getKey('FIREBASE_AUTH_DOMAIN', manualConfig.authDomain),
  projectId: getKey('FIREBASE_PROJECT_ID', manualConfig.projectId),
  storageBucket: getKey('FIREBASE_STORAGE_BUCKET', manualConfig.storageBucket),
  messagingSenderId: getKey('FIREBASE_MESSAGING_SENDER_ID', manualConfig.messagingSenderId),
  appId: getKey('FIREBASE_APP_ID', manualConfig.appId)
};

// --- INITIALIZATION ---
let app = null;

const isConfigValid = 
    (firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY_HERE" && !String(firebaseConfig.apiKey).includes("undefined")) ||
    (localConfig !== null); // Valid if local config exists

if (isConfigValid) {
    try {
        if (!getApps().length) {
            app = initializeApp(firebaseConfig);
            console.log("✅ Firebase Connected: " + (firebaseConfig.projectId || "Custom Config"));
        } else {
            app = getApp();
            console.log("✅ Firebase Reused Existing Instance");
        }
    } catch (e: any) {
        console.error("Firebase Initialization Failed:", e);
    }
} else {
    console.warn("⚠️ Firebase Keys Missing. App running in OFFLINE MODE (Data will not sync).");
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