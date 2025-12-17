/**
 * CheckoutModal Component
 * 
 * Universal checkout modal for all product types:
 * - Court bookings
 * - Tournament entries
 * - League registrations
 * - Meetup RSVPs
 * - Club memberships
 * 
 * Features:
 * - Countdown timer for hold expiry
 * - Price breakdown
 * - Payment method selection
 * - Wallet and card payments
 * 
 * FILE LOCATION: components/checkout/CheckoutModal.tsx
 */

import React, { useEffect, useState } from 'react';
import { useCheckout } from '../../hooks/useCheckout';
import { CheckoutTimer } from './CheckoutTimer';
import { PriceBreakdown } from './PriceBreakdown';
import { PaymentMethodSelector } from './PaymentMethodSelector';
import type { CheckoutItemType, CheckoutItemDetails, CheckoutItem } from '../../services/firebase/checkout';
import type { PriceCalculation } from '../../services/firebase/pricing';

// ============================================
// TYPES
// ============================================

export interface CheckoutModalProps {
  // Required
  isOpen: boolean;
  onClose: () => void;
  
  // Product info
  type: CheckoutItemType;
  itemDetails: CheckoutItemDetails;
  pricing: PriceCalculation;
  
  // Context
  clubId?: string;
  
  // Callbacks
  onSuccess?: (checkout: CheckoutItem) => void;
  onError?: (error: Error) => void;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

const getItemTitle = (type: CheckoutItemType): string => {
  const titles: Record<CheckoutItemType, string> = {
    court_booking: 'Complete Your Booking',
    tournament: 'Complete Registration',
    league: 'Complete Registration',
    meetup: 'Confirm RSVP',
    annual_pass: 'Purchase Annual Pass',
    club_membership: 'Complete Membership',
    visitor_fee: 'Pay Visitor Fee',
  };
  return titles[type] || 'Complete Purchase';
};

const getItemDescription = (type: CheckoutItemType, details: CheckoutItemDetails): string => {
  switch (type) {
    case 'court_booking':
      return `${details.courtName || 'Court'} • ${formatDate(details.date)} • ${formatTime(details.startTime)} - ${formatTime(details.endTime)}`;
    case 'tournament':
      return `${details.tournamentName || 'Tournament'}${details.divisionName ? ` • ${details.divisionName}` : ''}`;
    case 'league':
      return `${details.leagueName || 'League'}${details.teamName ? ` • Team: ${details.teamName}` : ''}`;
    case 'meetup':
      return details.meetupTitle || 'Meetup';
    case 'annual_pass':
    case 'club_membership':
      return details.clubName || 'Club';
    default:
      return details.description || '';
  }
};

const formatDate = (dateStr?: string): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-NZ', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};

const formatTime = (time?: string): string => {
  if (!time) return '';
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
};

const getItemIcon = (type: CheckoutItemType): string => {
  const icons: Record<CheckoutItemType, string> = {
    court_booking: '🏸',
    tournament: '🏆',
    league: '📊',
    meetup: '👥',
    annual_pass: '🎫',
    club_membership: '🏅',
    visitor_fee: '🎟️',
  };
  return icons[type] || '📦';
};

// ============================================
// COMPONENT
// ============================================

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  type,
  itemDetails,
  pricing,
  clubId,
  onSuccess,
  onError,
}) => {
  const [step, setStep] = useState<'review' | 'payment' | 'success' | 'error'>('review');
  
  const {
    checkout,
    wallet,
    annualPass,
    loading,
    processing,
    error,
    timeRemaining,
    isExpired,
    formattedTime,
    selectedPaymentMethod,
    setSelectedPaymentMethod,
    canPayWithWallet,
    canPayWithAnnualPass,
    startCheckout,
    completePayment,
    cancelReservation,
    formatCurrency,
  } = useCheckout({
    clubId,
    onSuccess: (checkout) => {
      setStep('success');
      onSuccess?.(checkout);
    },
    onError: (err) => {
      setStep('error');
      onError?.(err);
    },
    onExpire: () => {
      setStep('error');
    },
  });

  // Start checkout when modal opens
  useEffect(() => {
    if (isOpen && !checkout && !loading) {
      setStep('review');
      startCheckout({
        type,
        itemDetails,
        pricing,
      });
    }
  }, [isOpen]);

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStep('review');
    }
  }, [isOpen]);

  // Handle close
  const handleClose = async () => {
    if (checkout && checkout.status === 'pending') {
      await cancelReservation();
    }
    onClose();
  };

  // Handle payment
  const handlePay = async () => {
    setStep('payment');
    const success = await completePayment();
    if (!success) {
      setStep('review');
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div 
        className="bg-gray-800 rounded-xl max-w-md w-full border border-gray-700 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gray-900 px-6 py-4 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{getItemIcon(type)}</span>
              <h2 className="text-xl font-bold text-white">{getItemTitle(type)}</h2>
            </div>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Loading State */}
          {loading && (
            <div className="text-center py-8">
              <div className="animate-spin w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-gray-400">Creating reservation...</p>
            </div>
          )}

          {/* Success State */}
          {step === 'success' && checkout?.status === 'confirmed' && (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-green-900/50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-green-400 mb-2">Booking Confirmed!</h3>
              <p className="text-gray-400 mb-6">
                {getItemDescription(type, itemDetails)}
              </p>
              <button
                onClick={onClose}
                className="w-full bg-green-600 hover:bg-green-500 text-white py-3 rounded-lg font-semibold transition-colors"
              >
                Done
              </button>
            </div>
          )}

          {/* Error / Expired State */}
          {(step === 'error' || isExpired) && (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-red-900/50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-red-400 mb-2">
                {isExpired ? 'Reservation Expired' : 'Something Went Wrong'}
              </h3>
              <p className="text-gray-400 mb-6">
                {error || 'Your reservation has expired. Please try again.'}
              </p>
              <button
                onClick={onClose}
                className="w-full bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          )}

          {/* Review / Payment State */}
          {!loading && checkout && checkout.status === 'pending' && step !== 'success' && step !== 'error' && !isExpired && (
            <>
              {/* Timer */}
              <CheckoutTimer
                timeRemaining={timeRemaining}
                formattedTime={formattedTime}
                isExpired={isExpired}
                className="mb-4"
              />

              {/* Item Details */}
              <div className="bg-gray-900 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{getItemIcon(type)}</span>
                  <div>
                    <p className="text-white font-medium">
                      {itemDetails.courtName || itemDetails.tournamentName || itemDetails.leagueName || itemDetails.meetupTitle || itemDetails.clubName || 'Booking'}
                    </p>
                    <p className="text-gray-400 text-sm">
                      {getItemDescription(type, itemDetails)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Price Breakdown */}
              <PriceBreakdown 
                pricing={pricing} 
                className="mb-4"
              />

              {/* Payment Method Selection */}
              <PaymentMethodSelector
                selectedMethod={selectedPaymentMethod}
                onSelect={setSelectedPaymentMethod}
                amount={pricing.finalPrice}
                isFree={pricing.isFree}
                walletBalance={wallet?.balance ?? null}
                canPayWithWallet={canPayWithWallet}
                hasAnnualPass={annualPass !== null}
                annualPassCoversThis={canPayWithAnnualPass}
                cardEnabled={false}
                className="mb-6"
              />

              {/* Error Message */}
              {error && (
                <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg mb-4 text-sm">
                  {error}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleClose}
                  disabled={processing}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white py-3 rounded-lg font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePay}
                  disabled={processing || (!pricing.isFree && !selectedPaymentMethod)}
                  className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  {processing ? (
                    <>
                      <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                      <span>Processing...</span>
                    </>
                  ) : pricing.isFree ? (
                    'Confirm Booking'
                  ) : (
                    `Pay ${formatCurrency(pricing.finalPrice)}`
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CheckoutModal;