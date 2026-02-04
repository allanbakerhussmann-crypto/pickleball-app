/**
 * CheckoutModal Component
 * 
 * Universal checkout modal with Stripe integration.
 * 
 * Payment Flow:
 * 1. User selects slots → Opens modal
 * 2. Shows price breakdown
 * 3. User clicks "Pay with Card" → Redirects to Stripe Checkout
 * 4. After payment → Stripe webhook creates bookings
 * 5. User returns to booking calendar with success message
 * 
 * FILE LOCATION: components/checkout/CheckoutModal.tsx
 */

import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { doc, getDoc } from '@firebase/firestore';
import { db } from '../../services/firebase';
import {
  createCheckoutSession,
  redirectToCheckout,
  PLATFORM_FEE_PERCENT,
} from '../../services/stripe';
import type { PriceCalculation } from '../../services/firebase/pricing';
import { formatTime } from '../../utils/timeFormat';
import { ModalShell } from '../shared/ModalShell';

// ============================================
// TYPES (inline to avoid import issues)
// ============================================

type CheckoutItemType = 
  | 'court_booking' 
  | 'tournament' 
  | 'league' 
  | 'meetup' 
  | 'annual_pass' 
  | 'club_membership' 
  | 'visitor_fee';

type CheckoutStatus = 'pending' | 'confirmed' | 'expired' | 'cancelled';
type PaymentMethod = 'wallet' | 'card' | 'annual_pass' | 'free';

interface CheckoutItemDetails {
  // Court booking
  clubId?: string;
  clubName?: string;
  courtId?: string;
  courtName?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  
  // Tournament
  tournamentId?: string;
  tournamentName?: string;
  divisionId?: string;
  divisionName?: string;
  teamId?: string;
  teamName?: string;
  
  // League
  leagueId?: string;
  leagueName?: string;
  
  // Meetup
  meetupId?: string;
  meetupTitle?: string;
  
  // Generic
  description?: string;
}

interface CheckoutItem {
  id: string;
  type: CheckoutItemType;
  status: CheckoutStatus;
  itemDetails: CheckoutItemDetails;
  userId: string;
  userName: string;
  userEmail: string;
  pricing: PriceCalculation;
  createdAt: number;
  expiresAt: number;
  clubId?: string;
  paymentMethod?: PaymentMethod;
  transactionId?: string;
  walletId?: string;
  confirmedAt?: number;
}

export interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  
  // Product info
  type: CheckoutItemType;
  itemDetails: CheckoutItemDetails;
  pricing: PriceCalculation;
  
  // Context
  clubId: string;
  
  // For multi-slot bookings
  allSlots?: Array<{
    courtId: string;
    courtName: string;
    date: string;
    startTime: string;
    endTime: string;
    pricing: PriceCalculation;
  }>;
  
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

const formatDate = (dateStr?: string): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-NZ', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};

// formatTime imported from utils/timeFormat

const formatCurrency = (cents: number): string => {
  return `NZ$${(cents / 100).toFixed(2)}`;
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
  allSlots,
  onSuccess,
  onError,
}) => {
  const { currentUser, userProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clubStripeAccountId, setClubStripeAccountId] = useState<string | null>(null);
  const [stripeReady, setStripeReady] = useState(false);

  // Load club's Stripe account ID
  useEffect(() => {
    if (!clubId) return;
    
    const loadClubStripe = async () => {
      try {
        const clubDoc = await getDoc(doc(db, 'clubs', clubId));
        if (clubDoc.exists()) {
          const data = clubDoc.data();
          const accountId = data.stripeConnectedAccountId;
          const chargesEnabled = data.stripeChargesEnabled;
          
          setClubStripeAccountId(accountId || null);
          setStripeReady(!!accountId && chargesEnabled);
        }
      } catch (err) {
        console.error('Failed to load club Stripe info:', err);
      }
    };
    
    loadClubStripe();
  }, [clubId]);

  // Handle Stripe Checkout
  const handleStripeCheckout = async () => {
    if (!currentUser || !clubId) {
      setError('Please log in to continue');
      return;
    }

    if (!stripeReady) {
      setError('This club has not set up payments yet. Please contact the club administrator.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Build line items for Stripe
      const lineItems = allSlots && allSlots.length > 0
        ? allSlots.map(slot => ({
            name: `Court Booking - ${slot.courtName}`,
            description: `${formatDate(slot.date)} • ${formatTime(slot.startTime)} - ${formatTime(slot.endTime)}`,
            amount: slot.pricing.finalPrice,
            quantity: 1,
          }))
        : [{
            name: getItemTitle(type),
            description: itemDetails.courtName 
              ? `${itemDetails.courtName} • ${formatDate(itemDetails.date)} • ${formatTime(itemDetails.startTime)} - ${formatTime(itemDetails.endTime)}`
              : itemDetails.description || '',
            amount: pricing.finalPrice,
            quantity: 1,
          }];

      // Build metadata for tracking
      const metadata: Record<string, string> = {
        type,
        odUserId: currentUser.uid,
        clubId,
      };

      // Add booking details for court bookings
      if (allSlots && allSlots.length > 0) {
        metadata.slots = JSON.stringify(allSlots.map(s => ({
          courtId: s.courtId,
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime,
        })));
      } else if (itemDetails.courtId) {
        metadata.courtId = itemDetails.courtId;
        metadata.date = itemDetails.date || '';
        metadata.startTime = itemDetails.startTime || '';
        metadata.endTime = itemDetails.endTime || '';
      }

      // IMPORTANT: Use hash-based URLs for HashRouter compatibility
      // The app uses createHashRouter, so URLs are like /#/clubs/123
      const baseUrl = window.location.origin;
      const successUrl = `${baseUrl}/#/clubs/${clubId}?tab=booking&payment=success&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${baseUrl}/#/clubs/${clubId}?tab=booking&payment=cancelled`;

      // Create Stripe Checkout session
      const { url } = await createCheckoutSession({
        items: lineItems,
        customerEmail: currentUser.email || undefined,
        clubId,
        clubStripeAccountId: clubStripeAccountId || undefined,
        successUrl,
        cancelUrl,
        metadata,
      });

      // Redirect to Stripe Checkout
      if (url) {
        redirectToCheckout(url);
      } else {
        throw new Error('Failed to create checkout session');
      }
    } catch (err: any) {
      console.error('Stripe checkout error:', err);
      setError(err.message || 'Failed to start payment. Please try again.');
      onError?.(err);
    } finally {
      setLoading(false);
    }
  };

  // Handle free bookings
  const handleFreeBooking = async () => {
    if (!currentUser) {
      setError('Please log in to continue');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // For free bookings, we can confirm immediately
      // The parent component (CourtBookingCalendar) will create the actual booking
      const mockCheckout: CheckoutItem = {
        id: `free_${Date.now()}`,
        type,
        status: 'confirmed',
        itemDetails,
        userId: currentUser.uid,
        userName: userProfile?.displayName || currentUser.displayName || 'User',
        userEmail: currentUser.email || '',
        pricing,
        createdAt: Date.now(),
        expiresAt: 0,
        clubId,
        paymentMethod: 'free',
        confirmedAt: Date.now(),
      };

      onSuccess?.(mockCheckout);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to confirm booking');
      onError?.(err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Calculate total for multiple slots
  const totalAmount = allSlots && allSlots.length > 0
    ? allSlots.reduce((sum, slot) => sum + slot.pricing.finalPrice, 0)
    : pricing.finalPrice;

  const isFree = totalAmount === 0;
  const slotCount = allSlots?.length || 1;

  return (
    <ModalShell isOpen={isOpen} onClose={onClose}>
        {/* Header */}
        <div className="bg-gray-900 px-6 py-4 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{getItemIcon(type)}</span>
              <h2 className="text-xl font-bold text-white">{getItemTitle(type)}</h2>
            </div>
            <button
              onClick={onClose}
              disabled={loading}
              className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Booking Summary */}
          <div className="bg-gray-900 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-medium text-gray-400 mb-3">
              {slotCount > 1 ? `${slotCount} Bookings` : 'Booking Details'}
            </h3>
            
            {allSlots && allSlots.length > 0 ? (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {allSlots.map((slot, idx) => (
                  <div key={idx} className="flex justify-between items-center text-sm">
                    <div>
                      <span className="text-white">{slot.courtName}</span>
                      <span className="text-gray-400 ml-2">
                        {formatDate(slot.date)} • {formatTime(slot.startTime)}
                      </span>
                    </div>
                    <span className="text-green-400">{formatCurrency(slot.pricing.finalPrice)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-white">
                <div className="font-medium">{itemDetails.courtName || 'Court'}</div>
                <div className="text-gray-400 text-sm">
                  {formatDate(itemDetails.date)} • {formatTime(itemDetails.startTime)} - {formatTime(itemDetails.endTime)}
                </div>
              </div>
            )}
          </div>

          {/* Price Summary */}
          <div className="bg-gray-900 rounded-lg p-4 mb-6">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">
                {slotCount > 1 ? `Total (${slotCount} bookings)` : 'Total'}
              </span>
              <span className="text-2xl font-bold text-white">
                {isFree ? 'FREE' : formatCurrency(totalAmount)}
              </span>
            </div>
            
            {!isFree && (
              <p className="text-xs text-gray-500 mt-2">
                Secure payment via Stripe • Platform fee: {PLATFORM_FEE_PERCENT}%
              </p>
            )}
          </div>

          {/* Stripe Not Ready Warning */}
          {!stripeReady && !isFree && (
            <div className="bg-yellow-900/30 border border-yellow-700 text-yellow-200 px-4 py-3 rounded-lg mb-4 text-sm">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>This club hasn't set up payments yet. Please contact the club administrator.</span>
              </div>
            </div>
          )}

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

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white py-3 rounded-lg font-semibold transition-colors"
            >
              Cancel
            </button>
            
            {isFree ? (
              <button
                onClick={handleFreeBooking}
                disabled={loading}
                className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                    <span>Confirming...</span>
                  </>
                ) : (
                  'Confirm Booking'
                )}
              </button>
            ) : (
              <button
                onClick={handleStripeCheckout}
                disabled={loading || !stripeReady}
                className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 text-white py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                    <span>Redirecting...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/>
                    </svg>
                    <span>Pay {formatCurrency(totalAmount)}</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Secure Payment Notice */}
          {!isFree && stripeReady && (
            <p className="text-center text-xs text-gray-500 mt-4">
              🔒 Secure payment powered by Stripe
            </p>
          )}
        </div>
    </ModalShell>
  );
};

export default CheckoutModal;