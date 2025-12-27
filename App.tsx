/**
 * App.tsx - Main Application Entry Point
 * 
 * Uses React Router for URL-based navigation.
 * Firebase is pre-configured (hardcoded credentials).
 * 
 * FILE LOCATION: App.tsx (root level)
 */

import React, { useState, useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { isFirebaseConfigured } from './services/firebase';

const App: React.FC = () => {
  // ==========================================
  // FIREBASE CONFIG CHECK
  // ==========================================
  const [checkingConfig, setCheckingConfig] = useState(true);

  useEffect(() => {
    console.log('🔍 App: Checking Firebase configuration...');
    const configured = isFirebaseConfigured();
    console.log('🔍 App: Firebase configured?', configured);
    setCheckingConfig(false);
  }, []);

  // ==========================================
  // Loading state while checking config
  // ==========================================
  if (checkingConfig) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4" />
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  // ==========================================
  // Main app with router
  // ==========================================
  return <RouterProvider router={router} />;
};

export default App;