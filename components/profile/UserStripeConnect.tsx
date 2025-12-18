/**
 * UserStripeConnect Component
 * 
 * Allows ORGANIZERS to connect their Stripe account to receive payments.
 * Regular players see a message to request organizer access.
 * 
 * Features:
 * - Connect Stripe account (Express onboarding) - ORGANIZERS ONLY
 * - Show connection status
 * - Access Stripe dashboard
 * - Non-organizers see request access message
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
  const { currentUser, userProfile, isOrganizer } = useAuth();
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
  // COMPUTED VALUES
  // ============================================

  const isConnected = !!stripeData?.stripeConnectedAccountId;
  const isReady = isConnected && stripeData?.stripeChargesEnabled && stripeData?.stripePayoutsEnabled;
  const needsMoreInfo = isConnected && !isReady;

  // ============================================
  // RENDER - LOADING
  // ============================================

  if (loading) {
    return (
      <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-700">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-700 rounded w-2/3 mb-2"></div>
          <div className="h-10 bg-gray-700 rounded w-full mt-4"></div>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER - NON-ORGANIZER (RESTRICTED)
  // ============================================

  if (!isOrganizer) {
    return (
      <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-700">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Become a Paid Organizer</h3>
            <p className="text-sm text-gray-400">Organizer access required</p>
          </div>
        </div>

        <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4 mb-4">
          <p className="text-blue-200 text-sm">
            To accept payments for meetups and leagues, you need to be an <strong>Organizer</strong>.
          </p>
        </div>

        <div className="bg-gray-800/50 rounded-lg p-4 mb-4">
          <h4 className="text-white font-medium mb-3">What organizers can do:</h4>
          <ul className="space-y-2 text-sm text-gray-300">
            <li className="flex items-center gap-2">
              <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Create paid meetups with entry fees
            </li>
            <li className="flex items-center gap-2">
              <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Collect prize pool contributions
            </li>
            <li className="flex items-center gap-2">
              <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Organize paid leagues and tournaments
            </li>
            <li className="flex items-center gap-2">
              <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Get paid directly to your bank account
            </li>
          </ul>
        </div>

        <div className="text-center">
          <p className="text-gray-400 text-sm mb-3">
            Interested in becoming an organizer?
          </p>
          <a
            href="mailto:support@pickleballdirector.com?subject=Request%20Organizer%20Access"
            className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Request Organizer Access
          </a>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER - ORGANIZER VIEW
  // ============================================

  return (
    <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-700">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
          isReady ? 'bg-green-900' : isConnected ? 'bg-yellow-900' : 'bg-purple-900'
        }`}>
          {isReady ? (
            <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-purple-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/>
            </svg>
          )}
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">
            {isReady ? 'Stripe Connected' : isConnected ? 'Complete Setup' : 'Become a Paid Organizer'}
          </h3>
          <p className="text-sm text-gray-400">
            {isReady 
              ? 'You can accept payments for meetups and leagues'
              : isConnected
                ? 'Finish setting up your Stripe account'
                : 'Connect Stripe to accept payments'
            }
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-2 rounded-lg mb-4 text-sm">
          {error}
          <button onClick={() => setError(null)} className="float-right text-red-300 hover:text-red-100">✕</button>
        </div>
      )}

      {/* Status Badges */}
      {isConnected && (
        <div className="flex flex-wrap gap-2 mb-4">
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
            status?.chargesEnabled ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'
          }`}>
            {status?.chargesEnabled ? '✓ Charges Enabled' : '⏳ Charges Pending'}
          </span>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
            status?.payoutsEnabled ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'
          }`}>
            {status?.payoutsEnabled ? '✓ Payouts Enabled' : '⏳ Payouts Pending'}
          </span>
        </div>
      )}

      {/* Needs More Info Warning */}
      {needsMoreInfo && (
        <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-yellow-200 font-medium">Additional Information Required</p>
              <p className="text-yellow-300/80 text-sm">
                Complete the setup to start receiving payments.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Benefits (when not connected) */}
      {!isConnected && (
        <div className="bg-gray-800/50 rounded-lg p-4 mb-6">
          <h4 className="text-white font-medium mb-3">What you can do as a paid organizer:</h4>
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