/**
 * Firebase Configuration and Initialization
 * 
 * This file contains the Firebase app initialization and exports
 * the core Firebase instances used by all other modules.
 */

import { initializeApp, getApps } from '@firebase/app';
import { getAuth as getFirebaseAuth, connectAuthEmulator, type Auth } from '@firebase/auth';
import { getFirestore, connectFirestoreEmulator, type Firestore } from '@firebase/firestore';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from '@firebase/storage';
import { getFunctions, connectFunctionsEmulator, type Functions } from '@firebase/functions';

// ============================================
// 🔥 FIREBASE CONFIG FROM ENVIRONMENT VARIABLES
// ============================================
// Reads from .env file (VITE_ prefix required for Vite)
// Falls back to empty strings if not found (will error on init)

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || ''
};

// Validate that required config is present
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('❌ Firebase config missing! Check your .env file has VITE_FIREBASE_* variables.');
} else {
  console.log('🔥 Firebase: Config loaded from environment variables');
}

// ============================================
// Firebase Initialization (HMR-safe)
// ============================================

let app;
const existingApps = getApps();
if (existingApps.length > 0) {
  app = existingApps[0];
} else {
  app = initializeApp(firebaseConfig);
}

// Export Firebase instances
const authInstance: Auth = getFirebaseAuth(app);
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);
export const functions: Functions = getFunctions(app);

export const getAuth = (): Auth => authInstance;

// ============================================
// 🧪 EMULATOR CONNECTION (Local Testing Only)
// ============================================
// Set VITE_USE_EMULATORS=true in .env to use local emulators
// This connects to: Auth (9099), Firestore (8080), Functions (5001), Storage (9199)

const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true';

if (useEmulators) {
  console.log('🧪 Connecting to Firebase Emulators...');
  connectAuthEmulator(authInstance, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  console.log('✅ Connected to Emulators - Auth:9099, Firestore:8080, Functions:5001, Storage:9199');
}

// ============================================
// Config Helper Functions
// ============================================

export const saveFirebaseConfig = (_configJson: string) => {
  console.log('ℹ️ Config is hardcoded - saveFirebaseConfig is a no-op');
  return { success: true };
};

export const hasCustomConfig = () => true;
export const isFirebaseConfigured = () => true;

console.log('✅ Firebase initialized -', firebaseConfig.projectId);