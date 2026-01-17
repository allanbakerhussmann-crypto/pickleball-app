/**
 * DuprConnect Component
 * 
 * DUPR account linking for user profiles.
 * Uses IFRAME-based SSO as required by DUPR (NOT redirect OAuth).
 * 
 * Features:
 * - Login with DUPR (via iframe modal)
 * - Display linked DUPR info & ratings
 * - Refresh ratings
 * - Disconnect DUPR
 * 
 * FILE LOCATION: components/profile/DuprConnect.tsx
 * VERSION: V05.17.1 - Fixed to use iframe-based OAuth per DUPR docs
 */

import React, { useState, useEffect, useCallback } from 'react';
import { doc, updateDoc, onSnapshot } from '@firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import {
  getDuprLoginIframeUrl,
  parseDuprLoginEvent,
  getDuprUserProfile,
  formatDuprRating,
  refreshMyDuprRating,
} from '../../services/dupr';

// ============================================
// TYPES
// ============================================

interface DuprProfileData {
  duprId?: string;
  duprConnected?: boolean;
  duprConnectedAt?: number;
  duprDoublesRating?: number;
  duprDoublesReliability?: number;
  duprSinglesRating?: number;
  duprSinglesReliability?: number;
  duprIsVerified?: boolean;
  duprIsPremium?: boolean;
  duprFullName?: string;
  duprImageUrl?: string;
  duprAccessToken?: string;
  duprRefreshToken?: string;
  duprTokenUpdatedAt?: number;
}

// ============================================
// COMPONENT
// ============================================

export const DuprConnect: React.FC = () => {
  const { currentUser } = useAuth();
  
  // State
  const [duprData, setDuprData] = useState<DuprProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  // Login modal state
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  // ============================================
  // LOAD DUPR DATA
  // ============================================

  useEffect(() => {
    if (!currentUser?.uid) {
      setLoading(false);
      return;
    }

    const userRef = doc(db, 'users', currentUser.uid);
    const unsubscribe = onSnapshot(userRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as DuprProfileData;
        setDuprData({
          duprId: data.duprId,
          duprConnected: data.duprConnected,
          duprConnectedAt: data.duprConnectedAt,
          duprDoublesRating: data.duprDoublesRating,
          duprDoublesReliability: data.duprDoublesReliability,
          duprSinglesRating: data.duprSinglesRating,
          duprSinglesReliability: data.duprSinglesReliability,
          duprIsVerified: data.duprIsVerified,
          duprIsPremium: data.duprIsPremium,
          duprFullName: data.duprFullName,
          duprImageUrl: data.duprImageUrl,
          duprAccessToken: data.duprAccessToken,
        });
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser?.uid]);

  // ============================================
  // HANDLE DUPR IFRAME MESSAGE
  // ============================================

  const handleDuprMessage = useCallback(async (event: MessageEvent) => {
    // Parse the DUPR login event
    const loginData = parseDuprLoginEvent(event);
    
    if (!loginData || !currentUser?.uid) return;
    
    console.log('DUPR login successful:', loginData);
    setLoginLoading(true);
    setError(null);
    
    try {
      // The iframe login returns basic stats directly
      // The userToken has read-only permissions, so profile fetch may fail
      // We'll use the data from the login event primarily
      
      let doublesRating: number | undefined = loginData.stats?.doublesRating;
      let singlesRating: number | undefined = loginData.stats?.singlesRating;
      
      // Try to get additional profile info, but don't fail if it doesn't work
      try {
        const profile = await getDuprUserProfile(loginData.userToken);
        if (profile.doublesRating) doublesRating = profile.doublesRating;
        if (profile.singlesRating) singlesRating = profile.singlesRating;
      } catch (profileError) {
        console.warn('Could not fetch full profile (this is normal with read-only token):', profileError);
        // Continue with the data we got from the login event
      }
      
      // Update Firestore with DUPR data
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, {
        duprId: loginData.duprId,
        duprConnected: true,
        duprConnectedAt: Date.now(),
        duprDoublesRating: doublesRating || null,
        duprSinglesRating: singlesRating || null,
        duprIsVerified: false, // Would need profile call to get this
        duprIsPremium: false,  // Would need profile call to get this
        duprAccessToken: loginData.userToken,
        duprRefreshToken: loginData.refreshToken,
        duprTokenUpdatedAt: Date.now(),
        updatedAt: Date.now(),
      });
      
      // Close modal
      setShowLoginModal(false);
    } catch (err: any) {
      console.error('Failed to save DUPR data:', err);
      setError(err.message || 'Failed to link DUPR account');
    } finally {
      setLoginLoading(false);
    }
  }, [currentUser?.uid]);

  // Listen for messages from DUPR iframe
  useEffect(() => {
    if (showLoginModal) {
      window.addEventListener('message', handleDuprMessage);
      return () => window.removeEventListener('message', handleDuprMessage);
    }
  }, [showLoginModal, handleDuprMessage]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleDisconnect = async () => {
    if (!currentUser?.uid) return;

    setDisconnecting(true);
    setError(null);

    try {
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, {
        duprId: null,
        duprConnected: false,
        duprConnectedAt: null,
        duprDoublesRating: null,
        duprDoublesReliability: null,
        duprSinglesRating: null,
        duprSinglesReliability: null,
        duprIsVerified: false,
        duprIsPremium: false,
        duprFullName: null,
        duprImageUrl: null,
        duprAccessToken: null,
        duprRefreshToken: null,
        duprTokenUpdatedAt: null,
        updatedAt: Date.now(),
      });

      setShowDisconnectConfirm(false);
    } catch (err: any) {
      setError(err.message || 'Failed to disconnect DUPR');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleRefreshRating = async () => {
    if (!currentUser?.uid) return;

    setIsRefreshing(true);
    setError(null);

    try {
      const result = await refreshMyDuprRating();
      console.log('[DUPR] Rating refreshed:', result);
      // The profile will update automatically via the onSnapshot listener
    } catch (err: any) {
      console.error('[DUPR] Failed to refresh rating:', err);
      setError(err.message || 'Failed to refresh DUPR rating');
    } finally {
      setIsRefreshing(false);
    }
  };

  // ============================================
  // RENDER - LOADING
  // ============================================

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="h-20 bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER - NOT CONNECTED
  // ============================================

  if (!duprData?.duprConnected) {
    return (
      <>
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-gray-700 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#00B4D8]/20 flex items-center justify-center">
              <DuprLogo className="w-6 h-6 text-[#00B4D8]" />
            </div>
            <div>
              <h3 className="font-bold text-white">DUPR Rating</h3>
              <p className="text-xs text-gray-400">Link your DUPR account</p>
            </div>
          </div>

          {/* Content */}
          <div className="p-4">
            <p className="text-gray-400 text-sm mb-4">
              Connect your DUPR account to display your official rating and submit match results 
              to DUPR automatically.
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-900/30 border border-red-500/50 rounded-lg text-red-300 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={() => setShowLoginModal(true)}
              className="w-full py-3 bg-[#00B4D8] hover:bg-[#0096B4] text-white rounded-lg font-semibold flex items-center justify-center gap-2"
            >
              <DuprLogo className="w-5 h-5" />
              Login with DUPR
            </button>

            <p className="text-xs text-gray-500 mt-3 text-center">
              Don't have a DUPR account?{' '}
              <a 
                href="https://mydupr.com/signup" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-[#00B4D8] hover:underline"
              >
                Create one for free
              </a>
            </p>
          </div>
        </div>

        {/* DUPR Login Modal with iframe */}
        {showLoginModal && (
          <DuprLoginModal
            onClose={() => setShowLoginModal(false)}
            loading={loginLoading}
          />
        )}
      </>
    );
  }

  // ============================================
  // RENDER - CONNECTED
  // ============================================

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-white">DUPR Connected</h3>
            <p className="text-xs text-gray-400">
              ID: {duprData.duprId}
            </p>
          </div>
        </div>
        
        {/* Badges */}
        <div className="flex items-center gap-2">
          {duprData.duprIsVerified && (
            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Verified
            </span>
          )}
          {duprData.duprIsPremium && (
            <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              DUPR+
            </span>
          )}
        </div>
      </div>

      {/* Ratings Display */}
      <div className="p-4">
        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* Doubles Rating */}
          <div className="bg-gray-900 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Doubles</p>
            <p className="text-3xl font-bold text-[#00B4D8]">
              {formatDuprRating(duprData.duprDoublesRating)}
            </p>
            {duprData.duprDoublesReliability && (
              <p className="text-xs text-gray-500 mt-1">
                Reliability: {(duprData.duprDoublesReliability * 100).toFixed(0)}%
              </p>
            )}
          </div>

          {/* Singles Rating */}
          <div className="bg-gray-900 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Singles</p>
            <p className="text-3xl font-bold text-[#00B4D8]">
              {formatDuprRating(duprData.duprSinglesRating)}
            </p>
            {duprData.duprSinglesReliability && (
              <p className="text-xs text-gray-500 mt-1">
                Reliability: {(duprData.duprSinglesReliability * 100).toFixed(0)}%
              </p>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-yellow-900/30 border border-yellow-500/50 rounded-lg text-yellow-300 text-sm">
            {error}
          </div>
        )}

        {/* Info about ratings */}
        <div className="mb-4 p-3 bg-gray-900 rounded-lg">
          <p className="text-xs text-gray-400">
            💡 Ratings sync daily at 3 AM NZ time. Click "Refresh" for an instant update.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <a
            href={`https://mydupr.com/player/${duprData.duprId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2 bg-[#00B4D8] hover:bg-[#0096B4] text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            View on DUPR
          </a>

          <button
            onClick={handleRefreshRating}
            disabled={isRefreshing}
            className="px-4 py-2 bg-lime-600 hover:bg-lime-700 disabled:bg-gray-600 text-white rounded-lg text-sm font-medium flex items-center gap-1"
          >
            {isRefreshing ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Refreshing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </>
            )}
          </button>

          <button
            onClick={() => {
              setShowDisconnectConfirm(true);
              setError(null);
            }}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium"
            title="Disconnect DUPR account"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>

      </div>

      {/* Disconnect/Update Confirmation Modal */}
      {showDisconnectConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl border border-gray-700 max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-white mb-4">Update DUPR Connection</h3>
            <p className="text-gray-400 mb-4">
              To get your latest DUPR ratings, disconnect and then reconnect your account 
              using "Login with DUPR".
            </p>
            <p className="text-sm text-gray-500 mb-4">
              Current DUPR ID: <span className="text-[#00B4D8]">{duprData.duprId}</span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDisconnectConfirm(false)}
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="flex-1 py-2 bg-[#00B4D8] hover:bg-[#0096B4] disabled:bg-gray-600 text-white rounded-lg font-semibold"
              >
                {disconnecting ? 'Disconnecting...' : 'Disconnect to Update'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================
// DUPR LOGIN MODAL (with iframe)
// ============================================

interface DuprLoginModalProps {
  onClose: () => void;
  loading: boolean;
}

const DuprLoginModal: React.FC<DuprLoginModalProps> = ({ onClose, loading }) => {
  const iframeUrl = getDuprLoginIframeUrl();
  
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full overflow-hidden relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={loading}
          className="absolute top-2 right-2 z-10 p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-600"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        
        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 bg-white/90 flex items-center justify-center z-20">
            <div className="text-center">
              <div className="w-10 h-10 border-4 border-[#00B4D8] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-gray-600">Linking your DUPR account...</p>
            </div>
          </div>
        )}
        
        {/* DUPR Login iframe */}
        <iframe
          src={iframeUrl}
          title="Login with DUPR"
          className="w-full h-[500px] border-0"
          allow="clipboard-read; clipboard-write"
        />
        
        {/* Footer */}
        <div className="bg-gray-100 px-4 py-3 text-center">
          <p className="text-xs text-gray-500">
            Secure login powered by DUPR
          </p>
        </div>
      </div>
    </div>
  );
};

// ============================================
// DUPR LOGO
// ============================================

const DuprLogo: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg 
    className={className} 
    viewBox="0 0 24 24" 
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="12" cy="10" r="8" fill="currentColor" opacity="0.9" />
    <rect x="10" y="16" width="4" height="6" rx="1" fill="currentColor" />
    <circle cx="12" cy="10" r="3" fill="white" opacity="0.3" />
  </svg>
);

export default DuprConnect;