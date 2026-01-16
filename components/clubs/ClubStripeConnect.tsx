/**
 * ClubStripeConnect Component
 *
 * Allows club admins to connect their Stripe account to receive payments.
 *
 * Features:
 * - Connect Stripe account (V2 Direct Charges)
 * - Country selection (NZ, AU, US, GB)
 * - Show connection status
 * - Access Stripe dashboard
 * - Configure payout settings
 *
 * @version 07.50
 * FILE LOCATION: components/clubs/ClubStripeConnect.tsx
 */

import React, { useState, useEffect } from 'react';
import { doc, updateDoc, onSnapshot } from '@firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import {
  // V1 Legacy functions (for existing accounts)
  createConnectAccountLink,
  getConnectAccountStatus,
  createConnectLoginLink,
  isClubStripeReady,
  // V2 functions (for new accounts)
  createAccountV2,
  createAccountLinkV2,
  getAccountStatusV2,
  isAccountV2Ready,
  SUPPORTED_COUNTRIES,
  PLATFORM_FEE_PERCENT,
  type StripeConnectStatus,
  type StripeAccountStatusV2,
  type StripeCountryCode,
} from '../../services/stripe';

// ============================================
// TYPES
// ============================================

interface ClubStripeConnectProps {
  clubId: string;
  clubName: string;
  clubEmail?: string;
  isAdmin: boolean;
}

interface ClubStripeData {
  stripeConnectedAccountId?: string;
  stripeOnboardingComplete?: boolean;
  stripeChargesEnabled?: boolean;
  stripePayoutsEnabled?: boolean;
  stripeAccountVersion?: 'v1' | 'v2';
  stripeAccountCountry?: StripeCountryCode;
}

// ============================================
// COMPONENT
// ============================================

export const ClubStripeConnect: React.FC<ClubStripeConnectProps> = ({
  clubId,
  clubName,
  clubEmail,
  isAdmin,
}) => {
  const { currentUser } = useAuth();
  const [stripeData, setStripeData] = useState<ClubStripeData | null>(null);
  const [status, setStatus] = useState<StripeConnectStatus | null>(null);
  const [statusV2, setStatusV2] = useState<StripeAccountStatusV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<StripeCountryCode>('NZ');

  // ============================================
  // LOAD CLUB STRIPE DATA
  // ============================================

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'clubs', clubId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setStripeData({
          stripeConnectedAccountId: data.stripeConnectedAccountId,
          stripeOnboardingComplete: data.stripeOnboardingComplete,
          stripeChargesEnabled: data.stripeChargesEnabled,
          stripePayoutsEnabled: data.stripePayoutsEnabled,
          stripeAccountVersion: data.stripeAccountVersion,
          stripeAccountCountry: data.stripeAccountCountry,
        });
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [clubId]);

  // ============================================
  // LOAD STRIPE ACCOUNT STATUS
  // ============================================

  useEffect(() => {
    if (!stripeData?.stripeConnectedAccountId) {
      setStatus(null);
      setStatusV2(null);
      return;
    }

    const loadStatus = async () => {
      try {
        // Use V2 status check for V2 accounts
        if (stripeData.stripeAccountVersion === 'v2') {
          const v2Status = await getAccountStatusV2(stripeData.stripeConnectedAccountId!);
          setStatusV2(v2Status);
          setStatus(null);

          // Update club document if status changed
          const chargesEnabled = v2Status.readyToProcessPayments;
          const payoutsEnabled = v2Status.readyToProcessPayments;
          const onboardingComplete = v2Status.onboardingComplete;

          if (chargesEnabled !== stripeData.stripeChargesEnabled ||
              payoutsEnabled !== stripeData.stripePayoutsEnabled ||
              onboardingComplete !== stripeData.stripeOnboardingComplete) {
            await updateDoc(doc(db, 'clubs', clubId), {
              stripeChargesEnabled: chargesEnabled,
              stripePayoutsEnabled: payoutsEnabled,
              stripeOnboardingComplete: onboardingComplete,
            });
          }
        } else {
          // V1 legacy status check
          const accountStatus = await getConnectAccountStatus(stripeData.stripeConnectedAccountId!);
          setStatus(accountStatus);
          setStatusV2(null);

          // Update club document if status changed
          if (accountStatus.chargesEnabled !== stripeData.stripeChargesEnabled ||
              accountStatus.payoutsEnabled !== stripeData.stripePayoutsEnabled) {
            await updateDoc(doc(db, 'clubs', clubId), {
              stripeChargesEnabled: accountStatus.chargesEnabled,
              stripePayoutsEnabled: accountStatus.payoutsEnabled,
              stripeOnboardingComplete: accountStatus.detailsSubmitted,
            });
          }
        }
      } catch (err) {
        console.error('Failed to load Stripe status:', err);
      }
    };

    loadStatus();
  }, [stripeData?.stripeConnectedAccountId, stripeData?.stripeAccountVersion, clubId]);

  // ============================================
  // CONNECT STRIPE ACCOUNT (V2)
  // ============================================

  const handleConnectStripe = async () => {
    if (!currentUser) return;

    setConnecting(true);
    setError(null);

    try {
      // Step 1: Create V2 account with selected country
      const accountResult = await createAccountV2({
        clubId,
        displayName: clubName,
        email: clubEmail || currentUser.email || '',
        country: selectedCountry,
      });

      // Step 2: Create onboarding link
      const linkResult = await createAccountLinkV2(
        accountResult.accountId,
        clubId,
        `${window.location.origin}/clubs/${clubId}/settings?stripe=success`,
        `${window.location.origin}/clubs/${clubId}/settings?stripe=refresh`
      );

      // Note: Club document is updated by the Cloud Function
      // Redirect to Stripe onboarding
      window.location.href = linkResult.url;
    } catch (err: any) {
      console.error('Failed to connect Stripe:', err);
      setError(err.message || 'Failed to start Stripe connection');
      setConnecting(false);
    }
  };

  // ============================================
  // CONTINUE ONBOARDING
  // ============================================

  const handleContinueOnboarding = async () => {
    if (!stripeData?.stripeConnectedAccountId || !currentUser) return;

    setConnecting(true);
    setError(null);

    try {
      let url: string;

      if (stripeData.stripeAccountVersion === 'v2') {
        // V2 account - use V2 account link
        const result = await createAccountLinkV2(
          stripeData.stripeConnectedAccountId,
          clubId,
          `${window.location.origin}/clubs/${clubId}/settings?stripe=success`,
          `${window.location.origin}/clubs/${clubId}/settings?stripe=refresh`
        );
        url = result.url;
      } else {
        // V1 legacy account
        const result = await createConnectAccountLink({
          clubId,
          clubName,
          clubEmail: clubEmail || currentUser.email || '',
          returnUrl: `${window.location.origin}/clubs/${clubId}/settings?stripe=success`,
          refreshUrl: `${window.location.origin}/clubs/${clubId}/settings?stripe=refresh`,
        });
        url = result.url;
      }

      window.location.href = url;
    } catch (err: any) {
      console.error('Failed to continue onboarding:', err);
      setError(err.message || 'Failed to continue Stripe setup');
      setConnecting(false);
    }
  };

  // ============================================
  // OPEN STRIPE DASHBOARD
  // ============================================

  const handleOpenDashboard = async () => {
    if (!stripeData?.stripeConnectedAccountId) return;

    try {
      const result = await createConnectLoginLink(stripeData.stripeConnectedAccountId);
      window.open(result.url, '_blank');
    } catch (err: any) {
      console.error('Failed to open dashboard:', err);
      setError(err.message || 'Failed to open Stripe dashboard');
    }
  };

  // ============================================
  // RENDER
  // ============================================

  if (!isAdmin) {
    return null;
  }

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
  const isV2Account = stripeData?.stripeAccountVersion === 'v2';
  const isReady = isV2Account
    ? statusV2 && isAccountV2Ready(statusV2)
    : status && isClubStripeReady(status);
  const needsMoreInfo = isConnected && !isReady;

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
          isReady ? 'bg-green-900/50' : isConnected ? 'bg-yellow-900/50' : 'bg-gray-700'
        }`}>
          <svg className={`w-6 h-6 ${
            isReady ? 'text-green-400' : isConnected ? 'text-yellow-400' : 'text-gray-400'
          }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
              d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" 
            />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">Payment Setup</h3>
          <p className="text-sm text-gray-400">
            Connect Stripe to receive payments from court bookings
          </p>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
          <button 
            onClick={() => setError(null)}
            className="float-right text-red-300 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Not Connected */}
      {!isConnected && (
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-lg p-4">
            <h4 className="text-white font-medium mb-2">Why connect Stripe?</h4>
            <ul className="text-sm text-gray-400 space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-0.5">✓</span>
                <span>Accept card payments for court bookings, tournaments, and memberships</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-0.5">✓</span>
                <span>Get paid directly to your bank account</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-0.5">✓</span>
                <span>Automatic payouts (daily, weekly, or manual)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-500 mt-0.5">ℹ</span>
                <span>Platform fee: {PLATFORM_FEE_PERCENT}% per transaction</span>
              </li>
            </ul>
          </div>

          {/* Country Selection */}
          <div className="bg-gray-900 rounded-lg p-4">
            <label className="block text-sm text-gray-400 mb-2">Country</label>
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value as StripeCountryCode)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {SUPPORTED_COUNTRIES.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name} ({country.currency})
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-2">
              Select the country where your club's bank account is located
            </p>
          </div>

          <button
            onClick={handleConnectStripe}
            disabled={connecting}
            className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 text-white py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
          >
            {connecting ? (
              <>
                <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/>
                </svg>
                <span>Connect with Stripe</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Connected but needs more info */}
      {needsMoreInfo && (
        <div className="space-y-4">
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-yellow-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div>
                <h4 className="text-yellow-400 font-medium">Setup Incomplete</h4>
                <p className="text-sm text-gray-300 mt-1">
                  Stripe needs more information to enable payments. Complete the setup to start accepting payments.
                </p>
                {/* V1 requirements display */}
                {!isV2Account && status?.requirements?.currentlyDue && status.requirements.currentlyDue.length > 0 && (
                  <p className="text-xs text-gray-400 mt-2">
                    Missing: {status.requirements.currentlyDue.slice(0, 3).join(', ')}
                    {status.requirements.currentlyDue.length > 3 && '...'}
                  </p>
                )}
                {/* V2 requirements display */}
                {isV2Account && statusV2?.requirementsStatus && (
                  <p className="text-xs text-gray-400 mt-2">
                    Status: {statusV2.requirementsStatus}
                  </p>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={handleContinueOnboarding}
            disabled={connecting}
            className="w-full bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-600 text-white py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
          >
            {connecting ? (
              <>
                <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                <span>Loading...</span>
              </>
            ) : (
              <>
                <span>Complete Stripe Setup</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </>
            )}
          </button>
        </div>
      )}

      {/* Fully Connected */}
      {isReady && (
        <div className="space-y-4">
          <div className="bg-green-900/30 border border-green-700 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-green-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <div>
                <h4 className="text-green-400 font-medium">Payments Enabled</h4>
                <p className="text-sm text-gray-300 mt-1">
                  Your club is ready to accept payments. Members can now book courts and pay online.
                </p>
              </div>
            </div>
          </div>

          {/* Status Details */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-gray-900 rounded-lg p-3">
              <div className="text-gray-400">Charges</div>
              <div className={`font-medium ${
                isV2Account
                  ? statusV2?.readyToProcessPayments ? 'text-green-400' : 'text-red-400'
                  : status?.chargesEnabled ? 'text-green-400' : 'text-red-400'
              }`}>
                {isV2Account
                  ? statusV2?.readyToProcessPayments ? '✓ Enabled' : '✗ Disabled'
                  : status?.chargesEnabled ? '✓ Enabled' : '✗ Disabled'}
              </div>
            </div>
            <div className="bg-gray-900 rounded-lg p-3">
              <div className="text-gray-400">Payouts</div>
              <div className={`font-medium ${
                isV2Account
                  ? statusV2?.readyToProcessPayments ? 'text-green-400' : 'text-red-400'
                  : status?.payoutsEnabled ? 'text-green-400' : 'text-red-400'
              }`}>
                {isV2Account
                  ? statusV2?.readyToProcessPayments ? '✓ Enabled' : '✗ Disabled'
                  : status?.payoutsEnabled ? '✓ Enabled' : '✗ Disabled'}
              </div>
            </div>
          </div>

          {/* Country Info for V2 */}
          {isV2Account && stripeData?.stripeAccountCountry && (
            <div className="bg-gray-900 rounded-lg p-3 text-sm">
              <div className="text-gray-400">Region</div>
              <div className="font-medium text-white">
                {SUPPORTED_COUNTRIES.find((c) => c.code === stripeData.stripeAccountCountry)?.name || stripeData.stripeAccountCountry}
                {' '}
                ({SUPPORTED_COUNTRIES.find((c) => c.code === stripeData.stripeAccountCountry)?.currency || stripeData.stripeAccountCountry})
              </div>
            </div>
          )}

          {/* Dashboard Button */}
          <button
            onClick={handleOpenDashboard}
            className="w-full bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
            <span>Open Stripe Dashboard</span>
          </button>

          {/* Platform Fee Info */}
          <p className="text-xs text-gray-500 text-center">
            Platform fee: {PLATFORM_FEE_PERCENT}% • Stripe fees apply
          </p>
        </div>
      )}
    </div>
  );
};

export default ClubStripeConnect;