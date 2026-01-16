/**
 * DuprPlusVerificationModal - DUPR+ subscription verification via Premium Login iframe
 *
 * Displays DUPR's Premium Login iframe for users to verify their DUPR+ subscription.
 * On success, calls Cloud Function to persist subscription status.
 *
 * @version V07.50
 * @file components/shared/DuprPlusVerificationModal.tsx
 */

import React, { useEffect, useState } from 'react';
import { httpsCallable } from '@firebase/functions';
import { functions } from '../../services/firebase/config';
import {
  getDuprPremiumLoginIframeUrl,
  parseDuprPremiumLoginEvent,
} from '../../services/dupr';

interface DuprPlusVerificationModalProps {
  /** Called when modal should close (user cancelled or verification complete) */
  onClose: () => void;
  /** Called with verification result */
  onVerified: (isActive: boolean) => void;
}

/**
 * Modal component for DUPR+ subscription verification
 */
const DuprPlusVerificationModal: React.FC<DuprPlusVerificationModalProps> = ({
  onClose,
  onVerified,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const iframeUrl = getDuprPremiumLoginIframeUrl();

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Parse the premium login event
      const loginData = parseDuprPremiumLoginEvent(event);
      if (!loginData) return;

      console.log('[DUPR+ Modal] Received login data');

      setLoading(true);
      setError(null);

      try {
        // Call Cloud Function to persist subscription
        const updateFn = httpsCallable<
          { subscriptions: typeof loginData.subscriptions },
          { success: boolean; duprPlusActive: boolean }
        >(functions, 'dupr_updateMySubscriptions');

        const result = await updateFn({ subscriptions: loginData.subscriptions || [] });

        console.log('[DUPR+ Modal] Subscription update result:', result.data);

        // Notify parent of result
        onVerified(result.data.duprPlusActive);
      } catch (err) {
        console.error('[DUPR+ Modal] Error updating subscription:', err);
        setError(err instanceof Error ? err.message : 'Failed to verify subscription');
        setLoading(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onVerified]);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full overflow-hidden relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 z-10 p-2 text-gray-500 hover:text-gray-700 transition-colors"
          aria-label="Close"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* Header */}
        <div className="bg-gradient-to-r from-[#00B4D8] to-[#0077B6] px-4 py-3">
          <h2 className="text-white font-semibold text-lg">Verify DUPR+ Subscription</h2>
          <p className="text-white/80 text-sm">
            Sign in with DUPR to verify your subscription
          </p>
        </div>

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 bg-white/90 flex items-center justify-center z-20">
            <div className="text-center">
              <div className="w-10 h-10 border-4 border-[#00B4D8] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-gray-600">Verifying subscription...</p>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="absolute inset-x-0 top-20 px-4 z-20">
            <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-2 rounded-lg text-sm">
              {error}
            </div>
          </div>
        )}

        {/* DUPR Premium Login iframe */}
        <iframe
          src={iframeUrl}
          title="DUPR+ Verification"
          className="w-full h-[500px] border-0"
          allow="clipboard-read; clipboard-write"
        />

        {/* Footer */}
        <div className="bg-gray-100 px-4 py-3 text-center border-t">
          <p className="text-xs text-gray-500">
            Secure verification powered by DUPR
          </p>
        </div>
      </div>
    </div>
  );
};

export default DuprPlusVerificationModal;
