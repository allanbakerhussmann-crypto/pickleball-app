/**
 * App.tsx - React Router Version
 * 
 * This replaces the old App.tsx with URL-based routing.
 * 
 * FILE LOCATION: App.tsx (root level)
 * 
 * MIGRATION:
 * 1. Rename your current App.tsx to App.old.tsx (backup)
 * 2. Rename this file to App.tsx
 */

import React, { useState, useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { isFirebaseConfigured, saveFirebaseConfig } from './services/firebase';
import { FirebaseConfigModal } from './components/auth/FirebaseConfigModal';
import { PickleballDirectorLogo } from './components/icons/PickleballDirectorLogo';

// ============================================
// Landing Page (shown when not logged in)
// ============================================
const LandingPage: React.FC<{ onLoginClick: () => void }> = ({ onLoginClick }) => (
  <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center relative overflow-hidden">
    {/* Background pattern */}
    <div 
      className="absolute inset-0 opacity-5"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2322c55e' fill-opacity='0.4'%3E%3Ccircle cx='30' cy='30' r='4'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }}
    />

    <div className="relative text-center px-4 max-w-4xl mx-auto">
      <div className="mb-8 flex justify-center">
        <PickleballDirectorLogo className="h-20 w-auto md:h-28" />
      </div>

      <h1 className="text-4xl md:text-6xl font-black text-white mb-4 tracking-tight">
        Pickleball<span className="text-green-500">Director</span>
      </h1>

      <p className="text-lg md:text-xl text-gray-400 mb-8 max-w-2xl mx-auto leading-relaxed">
        The complete tournament management platform for pickleball. Create events, 
        manage registrations, run brackets, and track results — all in one place.
      </p>

      <div className="flex flex-col sm:flex-row justify-center gap-4">
        <button
          onClick={onLoginClick}
          className="bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-10 rounded-lg transition-all transform hover:scale-105 shadow-lg shadow-green-900/50 text-lg"
        >
          Get Started Free
        </button>
        <button className="bg-gray-800 hover:bg-gray-700 text-white font-bold py-4 px-10 rounded-lg transition-all border border-gray-700 text-lg">
          View Demo
        </button>
      </div>

      <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
        <div className="bg-gray-900/50 backdrop-blur rounded-xl p-6 border border-gray-800">
          <div className="text-green-500 text-2xl mb-2">🏆</div>
          <h3 className="text-white font-bold mb-2">Easy Tournaments</h3>
          <p className="text-gray-400 text-sm">Create round-robin pools, single elimination brackets, or custom formats in minutes.</p>
        </div>
        <div className="bg-gray-900/50 backdrop-blur rounded-xl p-6 border border-gray-800">
          <div className="text-green-500 text-2xl mb-2">📱</div>
          <h3 className="text-white font-bold mb-2">Live Scoring</h3>
          <p className="text-gray-400 text-sm">Players submit scores from their phones. Real-time updates for everyone.</p>
        </div>
        <div className="bg-gray-900/50 backdrop-blur rounded-xl p-6 border border-gray-800">
          <div className="text-green-500 text-2xl mb-2">🎯</div>
          <h3 className="text-white font-bold mb-2">Court Management</h3>
          <p className="text-gray-400 text-sm">Smart court allocation keeps matches flowing and players engaged.</p>
        </div>
      </div>
    </div>
  </div>
);

// ============================================
// Main App Component
// ============================================
const App: React.FC = () => {
  // Firebase configuration check
  const [firebaseReady, setFirebaseReady] = useState(false);
  const [checkingConfig, setCheckingConfig] = useState(true);
  const [isConfigModalOpen, setConfigModalOpen] = useState(false);

  useEffect(() => {
    console.log('🔍 App: Checking Firebase configuration...');
    const configured = isFirebaseConfigured();
    console.log('🔍 App: Firebase configured?', configured);
    setFirebaseReady(configured);
    setCheckingConfig(false);
  }, []);

  const handleSaveConfig = async (config: any) => {
    try {
      await saveFirebaseConfig(config);
      setFirebaseReady(true);
      setConfigModalOpen(false);
      window.location.reload();
    } catch (error) {
      console.error('Failed to save Firebase config:', error);
    }
  };

  // Loading state
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

  // Firebase not configured
  if (!firebaseReady) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <PickleballDirectorLogo className="h-16 w-auto mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-white mb-4">Firebase Setup Required</h1>
          <p className="text-gray-400 mb-6">
            Configure your Firebase project to get started with PickleballDirector.
          </p>
          <button
            onClick={() => setConfigModalOpen(true)}
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
          >
            Configure Firebase
          </button>
        </div>

        {isConfigModalOpen && (
          <FirebaseConfigModal onSave={handleSaveConfig} />
        )}
      </div>
    );
  }

  // Main app with router
  return <RouterProvider router={router} />;
};

export default App;