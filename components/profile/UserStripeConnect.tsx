/**
 * UserStripeConnect Component
 * 
 * Allows users to become paid organizers by connecting their Stripe account.
 * Once connected, they can receive payments from meetups and leagues they organize.
 * 
 * Features:
 * - Connect Stripe account (Express onboarding)
 * - Show connection status
 * - Access Stripe dashboard
 * 
 * FILE LOCATION: components/profile/UserStripeConnect.tsx
 */

import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, updateDoc } from '@firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import {
  createUserConnectAccountLink,
  getUserConnectAccountStatus,
  createUserConnectLoginLink,
  PLATFORM_FEE_PERCENT,
  type StripeConnectStatus,
} from '../../services/stripe';

// ============================================
// TYPES
// ============================================

interface UserStripeData {
  isOrganizer?: boolean;
  stripeConnectedAccountId?: string;
  stripeOnboardingComplete?: boolean;
  stripeChargesEnabled?: boolean;
  stripePayoutsEnabled?: boolean;
}

// ============================================
// COMPONENT
// ============================================

export const UserStripeConnect: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const [stripeData, setStripeData] = useState<UserStripeData | null>(null);
  const [status, setStatus] = useState<StripeConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================
  // LOAD USER STRIPE DATA
  // ============================================

  useEffect(() => {
    if (!currentUser) return;

    const unsubscribe = onSnapshot(doc(db, 'users', currentUser.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setStripeData({
          isOrganizer: data.isOrganizer,
          stripeConnectedAccountId: data.stripeConnectedAccountId,
          stripeOnboardingComplete: data.stripeOnboardingComplete,
          stripeChargesEnabled: data.stripeChargesEnabled,
          stripePayoutsEnabled: data.stripePayoutsEnabled,
        });
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // ============================================
  // LOAD STRIPE ACCOUNT STATUS
  // ============================================

  useEffect(() => {
    if (!stripeData?.stripeConnectedAccountId) {
      setStatus(null);
      return;
    }

    const loadStatus = async () => {
      try {
        const accountStatus = await getUserConnectAccountStatus(stripeData.stripeConnectedAccountId!);
        setStatus(accountStatus);

        // Update local data if status changed
        if (currentUser && accountStatus) {
          const updates: Partial<UserStripeData> = {};
          
          if (accountStatus.chargesEnabled !== stripeData.stripeChargesEnabled) {
            updates.stripeChargesEnabled = accountStatus.chargesEnabled;
          }
          if (accountStatus.payoutsEnabled !== stripeData.stripePayoutsEnabled) {
            updates.stripePayoutsEnabled = accountStatus.payoutsEnabled;
          }
          if (accountStatus.detailsSubmitted !== stripeData.stripeOnboardingComplete) {
            updates.stripeOnboardingComplete = accountStatus.detailsSubmitted;
          }

          if (Object.keys(updates).length > 0) {
            await updateDoc(doc(db, 'users', currentUser.uid), updates);
          }
        }
      } catch (err) {
        console.error('Failed to load Stripe status:', err);
      }
    };

    loadStatus();
  }, [stripeData?.stripeConnectedAccountId, currentUser]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleConnectStripe = async () => {
    if (!currentUser || !userProfile) return;

    setConnecting(true);
    setError(null);

    try {
      const baseUrl = window.location.origin;
      const returnUrl = `${baseUrl}/#/profile?stripe=success`;
      const refreshUrl = `${baseUrl}/#/profile?stripe=refresh`;

      const result = await createUserConnectAccountLink({
        userId: currentUser.uid,
        userName: userProfile.displayName || 'Organizer',
        userEmail: currentUser.email || undefined,
        returnUrl,
        refreshUrl,
      });

      // Redirect to Stripe onboarding
      window.location.href = result.url;
    } catch (err: any) {
      console.error('Failed to connect Stripe:', err);
      setError(err.message || 'Failed to connect Stripe account');
      setConnecting(false);
    }
  };

  const handleOpenDashboard = async () => {
    if (!stripeData?.stripeConnectedAccountId) return;

    try {
      const result = await createUserConnectLoginLink(stripeData.stripeConnectedAccountId);
      window.open(result.url, '_blank');
    } catch (err: any) {
      console.error('Failed to open dashboard:', err);
      setError(err.message || 'Failed to open Stripe dashboard');
    }
  };

  // ============================================
  // RENDER
  // ============================================

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
        <div className="animate-pulse flex items-center gap-4">
          <div className="w-12 h-12 bg-gray-700 rounded-full"></div>
          <div className="flex-1">
            <div className="h-4 bg-gray-700 rounded w-1/3 mb-2"></div>
            <div className="h-3 bg-gray-700 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    );
  }

  const isConnected = stripeData?.stripeConnectedAccountId;
  const isReady = status?.chargesEnabled && status?.payoutsEnabled;
  const needsMoreInfo = isConnected && !isReady;

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
          isReady ? 'bg-green-900/50' : isConnected ? 'bg-yellow-900/50' : 'bg-purple-900/50'
        }`}>
          <svg className={`w-6 h-6 ${
            isReady ? 'text-green-400' : isConnected ? 'text-yellow-400' : 'text-purple-400'
          }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
              d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" 
            />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Organizer Payments</h3>
          <p className="text-sm text-gray-400">
            {isReady 
              ? 'Your account is ready to receive payments' 
              : isConnected 
                ? 'Complete setup to receive payments'
                : 'Connect Stripe to receive payments from your events'
            }
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-2 rounded-lg mb-4 text-sm">
          {error}
          <button onClick={() => setError(null)} className="float-right text-red-300 hover:text-white">✕</button>
        </div>
      )}

      {/* Status */}
      {isConnected && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-900/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-2 h-2 rounded-full ${status?.chargesEnabled ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
              <span className="text-sm text-gray-400">Charges</span>
            </div>
            <p className={`text-sm font-medium ${status?.chargesEnabled ? 'text-green-400' : 'text-yellow-400'}`}>
              {status?.chargesEnabled ? 'Enabled' : 'Pending'}
            </p>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-2 h-2 rounded-full ${status?.payoutsEnabled ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
              <span className="text-sm text-gray-400">Payouts</span>
            </div>
            <p className={`text-sm font-medium ${status?.payoutsEnabled ? 'text-green-400' : 'text-yellow-400'}`}>
              {status?.payoutsEnabled ? 'Enabled' : 'Pending'}
            </p>
          </div>
        </div>
      )}

      {/* Setup Incomplete Warning */}
      {needsMoreInfo && (
        <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-yellow-200 font-medium">Setup Incomplete</p>
              <p className="text-yellow-300/80 text-sm">
                Stripe needs more information to enable payments. Complete the setup to start receiving payments.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Benefits (when not connected) */}
      {!isConnected && (
        <div className="bg-gray-900/30 rounded-lg p-4 mb-6">
          <h4 className="text-white font-medium mb-3">Why become an organizer?</h4>
          <ul className="space-y-2 text-sm text-gray-300">
            <li className="flex items-center gap-2">
              <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Accept card payments for meetups and leagues
            </li>
            <li className="flex items-center gap-2">
              <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Get paid directly to your bank account
            </li>
            <li className="flex items-center gap-2">
              <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Automatic payouts (daily, weekly, or manual)
            </li>
            <li className="flex items-center gap-2">
              <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Collect prize pool contributions
            </li>
            <li className="flex items-center gap-2 text-gray-500">
              <span className="text-xs">ℹ</span>
              Platform fee: {PLATFORM_FEE_PERCENT}% per transaction
            </li>
          </ul>
        </div>
      )}

      {/* Actions */}
      {isReady ? (
        <div className="flex gap-3">
          <button
            onClick={handleOpenDashboard}
            className="flex-1 bg-purple-600 hover:bg-purple-500 text-white px-4 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Open Stripe Dashboard
          </button>
        </div>
      ) : needsMoreInfo ? (
        <button
          onClick={handleConnectStripe}
          disabled={connecting}
          className="w-full bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-600 text-white px-4 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
        >
          {connecting ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Connecting...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Complete Stripe Setup
            </>
          )}
        </button>
      ) : (
        <button
          onClick={handleConnectStripe}
          disabled={connecting}
          className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 text-white px-4 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
        >
          {connecting ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Connecting...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/>
              </svg>
              Connect with Stripe
            </>
          )}
        </button>
      )}

      {/* Fee Info */}
      {isReady && (
        <p className="text-center text-xs text-gray-500 mt-4">
          Platform fee: {PLATFORM_FEE_PERCENT}% • Stripe fees apply
        </p>
      )}
    </div>
  );
};

export default UserStripeConnect;