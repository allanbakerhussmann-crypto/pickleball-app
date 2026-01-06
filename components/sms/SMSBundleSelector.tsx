/**
 * SMSBundleSelector - Select and purchase SMS credit bundles
 *
 * Shows available bundles with pricing and purchase buttons.
 * Integrates with Stripe Checkout for payment.
 *
 * FILE LOCATION: components/sms/SMSBundleSelector.tsx
 * VERSION: 07.19
 */

import React, { useEffect, useState } from 'react';
import { getFunctions, httpsCallable } from '@firebase/functions';
import type { SMSBundle } from '../../types';
import {
  subscribeToSMSBundles,
  formatPriceNZD,
  formatPricePerSMS,
} from '../../services/firebase/smsCredits';

interface SMSBundleSelectorProps {
  userId: string;
  onClose?: () => void;
  onPurchaseComplete?: () => void;
}

export const SMSBundleSelector: React.FC<SMSBundleSelectorProps> = ({
  userId,
  onClose,
  onPurchaseComplete,
}) => {
  const [bundles, setBundles] = useState<(SMSBundle & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeToSMSBundles((data) => {
      setBundles(data);
      setLoading(false);
    });

    return unsub;
  }, []);

  const handlePurchase = async (bundle: SMSBundle & { id: string }) => {
    if (!userId) {
      setError('You must be logged in to purchase SMS credits');
      return;
    }

    setPurchasing(bundle.id);
    setError(null);

    try {
      const functions = getFunctions();
      const purchaseSMSBundle = httpsCallable<
        { bundleId: string; successUrl: string; cancelUrl: string },
        { sessionId: string; url: string }
      >(functions, 'stripe_purchaseSMSBundle');

      const currentUrl = window.location.href;
      const result = await purchaseSMSBundle({
        bundleId: bundle.id,
        successUrl: `${currentUrl}?sms_purchase=success`,
        cancelUrl: `${currentUrl}?sms_purchase=cancelled`,
      });

      if (result.data.url) {
        // Redirect to Stripe Checkout
        window.location.href = result.data.url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (err: any) {
      console.error('Purchase error:', err);
      setError(err.message || 'Failed to start purchase');
      setPurchasing(null);
    }
  };

  // Check for return from Stripe
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const purchaseStatus = params.get('sms_purchase');

    if (purchaseStatus === 'success') {
      onPurchaseComplete?.();
      // Clean up URL
      const url = new URL(window.location.href);
      url.searchParams.delete('sms_purchase');
      window.history.replaceState({}, '', url.toString());
    } else if (purchaseStatus === 'cancelled') {
      setError('Purchase was cancelled');
      // Clean up URL
      const url = new URL(window.location.href);
      url.searchParams.delete('sms_purchase');
      window.history.replaceState({}, '', url.toString());
    }
  }, [onPurchaseComplete]);

  if (loading) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-700 rounded w-1/3" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="h-48 bg-gray-800 rounded-lg" />
            <div className="h-48 bg-gray-800 rounded-lg" />
            <div className="h-48 bg-gray-800 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-white">Purchase SMS Credits</h3>
          <p className="text-sm text-gray-400 mt-1">
            Select a bundle to send SMS notifications to players
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-400 bg-red-900/20 rounded-lg px-3 py-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {bundles.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <p>No SMS bundles available</p>
          <p className="text-sm mt-1">Please contact support</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {bundles.map((bundle, index) => {
            const isPopular = index === 1; // Middle bundle is "popular"
            const isPurchasing = purchasing === bundle.id;

            return (
              <div
                key={bundle.id}
                className={`relative rounded-lg p-5 transition-all ${
                  isPopular
                    ? 'bg-lime-500/10 border-2 border-lime-500'
                    : 'bg-gray-800 border border-gray-700 hover:border-gray-600'
                }`}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-lime-500 text-gray-900 text-xs font-semibold rounded-full">
                    Best Value
                  </div>
                )}

                <div className="text-center mb-4">
                  <h4 className="text-lg font-semibold text-white">{bundle.name}</h4>
                  {bundle.description && (
                    <p className="text-sm text-gray-400 mt-1">{bundle.description}</p>
                  )}
                </div>

                <div className="text-center mb-4">
                  <div className="text-3xl font-bold text-white">
                    {bundle.credits}
                  </div>
                  <div className="text-sm text-gray-400">SMS credits</div>
                </div>

                <div className="text-center mb-4">
                  <div className="text-xl font-semibold text-lime-400">
                    {formatPriceNZD(bundle.priceNZD)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatPricePerSMS(bundle)} per SMS
                  </div>
                </div>

                <button
                  onClick={() => handlePurchase(bundle)}
                  disabled={!!purchasing}
                  className={`w-full py-2.5 rounded-lg font-medium transition-colors ${
                    isPopular
                      ? 'bg-lime-500 hover:bg-lime-400 text-gray-900 disabled:bg-lime-700'
                      : 'bg-gray-700 hover:bg-gray-600 text-white disabled:bg-gray-800'
                  } disabled:cursor-not-allowed`}
                >
                  {isPurchasing ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Processing...
                    </span>
                  ) : (
                    'Purchase'
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 text-center text-xs text-gray-500">
        <p>Secure payment powered by Stripe</p>
        <p className="mt-1">Credits never expire and can be used across all your events</p>
      </div>
    </div>
  );
};

export default SMSBundleSelector;
