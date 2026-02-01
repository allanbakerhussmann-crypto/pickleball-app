/**
 * RegisterButton Component
 *
 * Handles weekly meetup registration with payment method selection.
 * Supports Stripe (card) and Bank Transfer payment methods.
 *
 * @version 07.57
 * @file components/meetups/RegisterButton.tsx
 */

import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { httpsCallable, getFunctions, connectFunctionsEmulator } from '@firebase/functions';
import { getApp } from '@firebase/app';
import type { StandingMeetup, RegisterInput, RegisterOutputStripe, RegisterOutputBank } from '../../types/standingMeetup';
import { BankDetailsDisplay } from '../payments';

// Get functions instance for australia-southeast1 region
const functionsAU = getFunctions(getApp(), 'australia-southeast1');

// Connect to emulator if in development mode
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  try {
    connectFunctionsEmulator(functionsAU, '127.0.0.1', 5001);
  } catch {
    // Already connected, ignore
  }
}

interface RegisterButtonProps {
  meetup: StandingMeetup;
  disabled?: boolean;
  onSuccess?: () => void;
}

export const RegisterButton: React.FC<RegisterButtonProps> = ({
  meetup,
  disabled = false,
  onSuccess,
}) => {
  const { currentUser, userProfile } = useAuth();
  const [showOptions, setShowOptions] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBankDetails, setShowBankDetails] = useState(false);
  const [bankDetailsForDisplay, setBankDetailsForDisplay] = useState<RegisterOutputBank['bankDetails'] | null>(null);

  const hasStripe = meetup.paymentMethods?.acceptCardPayments ?? false;
  const hasBankTransfer = meetup.paymentMethods?.acceptBankTransfer ?? false;
  const hasMultipleOptions = hasStripe && hasBankTransfer;

  const formatCurrency = (cents: number): string => {
    const symbol = meetup.billing.currency === 'usd' ? 'US$' : meetup.billing.currency === 'aud' ? 'A$' : '$';
    return `${symbol}${(cents / 100).toFixed(2)}`;
  };

  const handleRegister = async (paymentMethod: 'stripe' | 'bank_transfer') => {
    if (!currentUser) {
      setError('Please log in to register');
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const registerFn = httpsCallable<RegisterInput, RegisterOutputStripe | RegisterOutputBank>(
        functionsAU,
        'standingMeetup_register'
      );

      const result = await registerFn({
        standingMeetupId: meetup.id,
        paymentMethod,
      });

      if (paymentMethod === 'stripe') {
        // Redirect to Stripe Checkout
        const stripeResult = result.data as RegisterOutputStripe;
        window.location.href = stripeResult.checkoutUrl;
      } else {
        // Show bank details for bank transfer
        const bankResult = result.data as RegisterOutputBank;
        setBankDetailsForDisplay(bankResult.bankDetails);
        setShowBankDetails(true);
        setShowOptions(false);
        onSuccess?.();
      }
    } catch (err: any) {
      console.error('Registration failed:', err);
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handleClick = () => {
    if (hasMultipleOptions) {
      setShowOptions(true);
    } else if (hasStripe) {
      handleRegister('stripe');
    } else if (hasBankTransfer) {
      handleRegister('bank_transfer');
    }
  };

  // Show bank details after successful bank transfer registration
  if (showBankDetails && bankDetailsForDisplay) {
    return (
      <div className="space-y-4">
        <BankDetailsDisplay
          bankDetails={{
            bankName: bankDetailsForDisplay.bankName,
            accountName: bankDetailsForDisplay.accountName,
            accountNumber: bankDetailsForDisplay.accountNumber,
            reference: bankDetailsForDisplay.reference,
          }}
          referencePrefix={userProfile?.name || currentUser?.email?.split('@')[0]}
          amount={meetup.billing.amount}
          currency={meetup.billing.currency}
        />
        <div className="p-4 bg-lime-900/20 border border-lime-500/30 rounded-lg">
          <p className="text-lime-400 text-sm">
            Your registration is pending. The organizer will confirm your payment once they receive the transfer.
          </p>
        </div>
        <button
          onClick={() => {
            setShowBankDetails(false);
            setBankDetailsForDisplay(null);
          }}
          className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
        >
          Close
        </button>
      </div>
    );
  }

  // Show payment method options
  if (showOptions) {
    return (
      <div className="space-y-3">
        <p className="text-gray-400 text-sm text-center mb-2">Choose payment method</p>

        {hasStripe && (
          <button
            onClick={() => handleRegister('stripe')}
            disabled={processing}
            className="w-full p-4 bg-lime-600 hover:bg-lime-500 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-3"
          >
            {processing ? (
              <>
                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                Processing...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                Pay Online ({formatCurrency(meetup.billing.amount)})
              </>
            )}
          </button>
        )}

        {hasBankTransfer && (
          <button
            onClick={() => handleRegister('bank_transfer')}
            disabled={processing}
            className="w-full p-4 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-3"
          >
            {processing ? (
              <>
                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                Processing...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                Bank Transfer
              </>
            )}
          </button>
        )}

        <button
          onClick={() => setShowOptions(false)}
          className="w-full px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors"
        >
          Cancel
        </button>

        {error && (
          <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>
    );
  }

  // Default: Show single register button
  return (
    <div className="space-y-3">
      <button
        onClick={handleClick}
        disabled={disabled || processing || (!hasStripe && !hasBankTransfer)}
        className="w-full p-4 bg-lime-600 hover:bg-lime-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
      >
        {processing ? (
          <>
            <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
            Processing...
          </>
        ) : disabled ? (
          'Registration Closed'
        ) : (
          <>
            Register Now
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </>
        )}
      </button>

      {!hasStripe && !hasBankTransfer && (
        <p className="text-center text-yellow-400 text-sm">
          No payment methods configured. Contact the organizer.
        </p>
      )}

      {error && (
        <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}
    </div>
  );
};

export default RegisterButton;
