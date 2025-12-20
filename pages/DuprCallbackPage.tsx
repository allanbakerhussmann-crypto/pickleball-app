/**
 * DUPR OAuth Callback Page
 * 
 * Handles the OAuth callback from DUPR SSO login.
 * Exchanges authorization code for tokens and updates user profile.
 * 
 * FILE LOCATION: pages/DuprCallbackPage.tsx
 * VERSION: V05.17
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { handleDuprCallback, type DuprUser } from '../services/dupr';
import { doc, updateDoc } from '@firebase/firestore';
import { db } from '../services/firebase';

// ============================================
// COMPONENT
// ============================================

const DuprCallbackPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [duprUser, setDuprUser] = useState<DuprUser | null>(null);

  useEffect(() => {
    processCallback();
  }, []);

  const processCallback = async () => {
    try {
      // Get code and state from URL
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');

      // Check for OAuth errors
      if (error) {
        throw new Error(errorDescription || error);
      }

      if (!code || !state) {
        throw new Error('Missing authorization code or state');
      }

      // Validate state matches what we stored
      const storedState = sessionStorage.getItem('dupr_sso_state');
      if (!storedState) {
        throw new Error('SSO state not found - please try again');
      }

      const parsedStoredState = JSON.parse(storedState);
      const parsedState = JSON.parse(atob(state));

      if (parsedStoredState.nonce !== parsedState.nonce) {
        throw new Error('Invalid SSO state - please try again');
      }

      // Exchange code for tokens and get user profile
      const { user, accessToken, refreshToken } = await handleDuprCallback(code, state);
      setDuprUser(user);

      // Check if user is logged in to Pickleball Director
      if (!currentUser) {
        // Store DUPR data temporarily for after login
        sessionStorage.setItem('dupr_pending_link', JSON.stringify({
          user,
          accessToken,
          refreshToken,
          returnUrl: parsedState.returnUrl,
        }));
        
        setStatus('success');
        
        // Redirect to login after short delay
        setTimeout(() => {
          navigate('/login?dupr_pending=true');
        }, 2000);
        return;
      }

      // Update user profile with DUPR data
      await linkDuprToProfile(currentUser.uid, user, accessToken, refreshToken);

      // Clear stored state
      sessionStorage.removeItem('dupr_sso_state');

      setStatus('success');

      // Redirect to return URL after short delay
      setTimeout(() => {
        const returnUrl = parsedState.returnUrl || '/';
        // Handle hash router URLs
        if (returnUrl.includes('/#/')) {
          window.location.href = returnUrl;
        } else {
          navigate(returnUrl);
        }
      }, 2000);

    } catch (err: any) {
      console.error('DUPR callback error:', err);
      setErrorMessage(err.message || 'Failed to connect DUPR account');
      setStatus('error');
    }
  };

  /**
   * Link DUPR account to user profile in Firestore
   */
  const linkDuprToProfile = async (
    odUserId: string,
    duprUser: DuprUser,
    accessToken: string,
    refreshToken: string
  ) => {
    const userRef = doc(db, 'users', odUserId);
    
    await updateDoc(userRef, {
      // DUPR account info - linked via SSO only
      duprId: duprUser.duprId,
      duprConnected: true,
      duprConnectedAt: Date.now(),
      
      // Ratings (cached for display)
      duprDoublesRating: duprUser.doublesRating || null,
      duprDoublesReliability: duprUser.doublesReliability || null,
      duprSinglesRating: duprUser.singlesRating || null,
      duprSinglesReliability: duprUser.singlesReliability || null,
      
      // Entitlements
      duprIsVerified: duprUser.isVerified,
      duprIsPremium: duprUser.isPremium,
      duprEntitlements: duprUser.entitlements,
      
      // Profile info from DUPR
      duprFullName: duprUser.fullName,
      duprImageUrl: duprUser.imageUrl || null,
      
      // Tokens (encrypted in production)
      duprAccessToken: accessToken,
      duprRefreshToken: refreshToken,
      duprTokenUpdatedAt: Date.now(),
      
      // Updated timestamp
      updatedAt: Date.now(),
    });
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Processing */}
        {status === 'processing' && (
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4">
              <div className="w-full h-full border-4 border-[#00B4D8] border-t-transparent rounded-full animate-spin" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Connecting to DUPR...</h2>
            <p className="text-gray-400">Please wait while we link your account.</p>
          </div>
        )}

        {/* Success */}
        {status === 'success' && (
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-green-500/20 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            
            <h2 className="text-xl font-bold text-white mb-2">DUPR Connected!</h2>
            
            {duprUser && (
              <div className="bg-gray-900 rounded-lg p-4 mb-4">
                <p className="text-white font-medium">{duprUser.fullName}</p>
                <div className="flex items-center justify-center gap-4 mt-2">
                  {duprUser.doublesRating && (
                    <div className="text-center">
                      <span className="text-xs text-gray-500 block">Doubles</span>
                      <span className="text-lg font-bold text-[#00B4D8]">
                        {duprUser.doublesRating.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {duprUser.singlesRating && (
                    <div className="text-center">
                      <span className="text-xs text-gray-500 block">Singles</span>
                      <span className="text-lg font-bold text-[#00B4D8]">
                        {duprUser.singlesRating.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-center gap-2 mt-2">
                  {duprUser.isVerified && (
                    <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full">
                      ✓ Verified
                    </span>
                  )}
                  {duprUser.isPremium && (
                    <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full">
                      ★ DUPR+
                    </span>
                  )}
                </div>
              </div>
            )}
            
            <p className="text-gray-400 text-sm">Redirecting you back...</p>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="bg-gray-800 rounded-xl border border-red-500/50 p-6 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-red-500/20 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            
            <h2 className="text-xl font-bold text-white mb-2">Connection Failed</h2>
            <p className="text-red-400 mb-4">{errorMessage}</p>
            
            <div className="space-y-2">
              <button
                onClick={() => navigate(-1)}
                className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
              >
                Go Back
              </button>
              <button
                onClick={() => window.location.reload()}
                className="w-full py-2 bg-[#00B4D8] hover:bg-[#0096B4] text-white rounded-lg"
              >
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DuprCallbackPage;