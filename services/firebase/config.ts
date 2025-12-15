/**
 * Firebase Configuration and Initialization
 * 
 * This file contains the Firebase app initialization and exports
 * the core Firebase instances used by all other modules.
 */

import { initializeApp, getApps } from '@firebase/app';
import { getAuth as getFirebaseAuth, type Auth } from '@firebase/auth';
import { getFirestore, type Firestore } from '@firebase/firestore';
import { getStorage, type FirebaseStorage } from '@firebase/storage';
import { getFunctions, type Functions } from '@firebase/functions';

// ============================================
// 🔥 HARDCODED FIREBASE CONFIG
// ============================================
// This bypasses all cookie/localStorage/env issues in AI Studio

const firebaseConfig = {
  apiKey: "AIzaSyBPeYXnPobCZ7bPH0g_2IYOP55-1PFTWTE",
  authDomain: "pickleball-app-dev.firebaseapp.com",
  projectId: "pickleball-app-dev",
  storageBucket: "pickleball-app-dev.firebasestorage.app",
  messagingSenderId: "906655677998",
  appId: "1:906655677998:web:b7fe4bb2f479ba79c069bf",
  measurementId: "G-WWLE6K6J7Z"
};

console.log('🔥 Firebase: Using HARDCODED config for pickleball-app-dev');

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
// Config Helper Functions
// ============================================

export const saveFirebaseConfig = (_configJson: string) => {
  console.log('ℹ️ Config is hardcoded - saveFirebaseConfig is a no-op');
  return { success: true };
};

export const hasCustomConfig = () => true;
export const isFirebaseConfigured = () => true;

console.log('✅ Firebase initialized - pickleball-app-dev');