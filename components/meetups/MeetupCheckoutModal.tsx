/**
 * MeetupCheckoutModal Component
 * 
 * Checkout modal specifically for meetup payments.
 * Supports "Pay for Others" feature:
 * - Add guests (non-members)
 * - Pay for existing members
 * 
 * FILE LOCATION: components/meetups/MeetupCheckoutModal.tsx
 */

import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { PayForOthersSection } from '../checkout/PayForOthersSection';
import { 
  createCheckoutSession, 
  redirectToCheckout,
  PLATFORM_FEE_PERCENT,
} from '../../services/stripe';
import type { PayForOthersData } from '../../types/payForOthers';
import { calculatePaymentSummary } from '../../types/payForOthers';

// ============================================
// TYPES
// ============================================

interface MeetupCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  meetup: {
    id: string;
    title: string;
    when: number;
    locationName: string;
    maxPlayers?: number;
    pricing: {
      totalPerPerson: number;
      entryFee: number;
      prizePoolEnabled?: boolean;
      prizePoolContribution?: number;
      feesPaidBy: 'organizer' | 'player';
    };
    organizerStripeAccountId: string;
    organizerName?: string;
  };
  /** Current number of confirmed attendees */
  currentAttendees: number;
  /** Called after successful payment redirect */
  onPaymentStarted?: () => void;
}

// ============================================
// HELPER: Format currency
// ============================================

const formatCurrency = (cents: number): string => {
  return `$${(cents / 100).toFixed(2)}`;
};

const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString('en-NZ', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
};

// ============================================
// COMPONENT
// ============================================

export const MeetupCheckoutModal: React.FC<MeetupCheckoutModalProps> = ({
  isOpen,
  onClose,
  meetup,
  currentAttendees,
  onPaymentStarted,
}) => {
  const { currentUser, userProfile } = useAuth();
  
  // Pay for others data
  const [payForOthersData, setPayForOthersData] = useState<PayForOthersData>({
    includeSelf: true,
    guests: [],
    members: [],
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate summary
  const pricePerPerson = meetup.pricing.totalPerPerson;
  const platformFee = meetup.pricing.feesPaidBy === 'player' ? PLATFORM_FEE_PERCENT : 0;
  const summary = calculatePaymentSummary(payForOthersData, pricePerPerson, platformFee);
  
  // Calculate available spots
  const spotsAvailable = meetup.maxPlayers 
    ? meetup.maxPlayers - currentAttendees 
    : 999;

  // ============================================
  // HANDLERS
  // ============================================

  const handlePayment = async () => {
    if (!currentUser || summary.totalPeople === 0) return;

    setLoading(true);
    setError(null);

    try {
      const baseUrl = window.location.origin;
      const successUrl = `${baseUrl}/#/meetups/${meetup.id}?payment=success`;
      const cancelUrl = `${baseUrl}/#/meetups/${meetup.id}?payment=cancelled`;

      // Build description with all names
      const description = summary.names.length > 1
        ? `Entry for ${summary.names.join(', ')}`
        : `Entry fee for ${meetup.title}`;

      // Build metadata for webhook processing
      const metadata: Record<string, string> = {
        type: 'meetup',
        meetupId: meetup.id,
        payerId: currentUser.uid,
        payerName: userProfile?.displayName || 'Player',
        headcount: summary.totalPeople.toString(),
        includeSelf: payForOthersData.includeSelf.toString(),
      };

      // Add guest info if any
      if (payForOthersData.guests.length > 0) {
        metadata.guestNames = payForOthersData.guests.map(g => g.name).join('|');
        metadata.guestRelationships = payForOthersData.guests.map(g => g.relationship).join('|');
      }

      // Add member info if any
      if (payForOthersData.members.length > 0) {
        metadata.memberIds = payForOthersData.members.map(m => m.odUserId).join('|');
        metadata.memberNames = payForOthersData.members.map(m => m.odUserName).join('|');
      }

      const session = await createCheckoutSession({
        items: [{
          name: meetup.title,
          description,
          amount: summary.total, // Total including all people and fees
          quantity: 1,
        }],
        customerEmail: currentUser.email || undefined,
        organizerStripeAccountId: meetup.organizerStripeAccountId,
        successUrl,
        cancelUrl,
        metadata,
      });

      onPaymentStarted?.();
      
      // Redirect to Stripe Checkout
      await redirectToCheckout(session.url);
    } catch (err: any) {
      console.error('Payment error:', err);
      setError(err.message || 'Failed to start payment');
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col border border-gray-700"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-700 bg-gray-900/50 rounded-t-xl">
          <div>
            <h2 className="text-lg font-bold text-white">Confirm RSVP</h2>
            <p className="text-gray-400 text-sm">{meetup.title}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Meetup Info */}
          <div className="bg-gray-900/50 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-gray-300">{formatDate(meetup.when)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-gray-300">{meetup.locationName}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-green-400 font-medium">{formatCurrency(pricePerPerson)} per person</span>
            </div>
            {meetup.maxPlayers && (
              <div className="flex items-center gap-2 text-sm">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span className="text-gray-400">
                  {spotsAvailable} {spotsAvailable === 1 ? 'spot' : 'spots'} left
                </span>
              </div>
            )}
          </div>

          {/* Pay For Others Section */}
          <PayForOthersSection
            data={payForOthersData}
            onChange={setPayForOthersData}
            pricePerPerson={pricePerPerson}
            platformFeePercent={platformFee}
            maxPeople={spotsAvailable}
            currentUserName={userProfile?.displayName || 'You'}
            disabled={loading}
          />

          {/* Prize Pool Info */}
          {meetup.pricing.prizePoolEnabled && meetup.pricing.prizePoolContribution && (
            <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3">
              <p className="text-yellow-400 text-sm font-medium flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                </svg>
                Prize Pool Contribution
              </p>
              <p className="text-yellow-200/70 text-xs mt-1">
                {formatCurrency(meetup.pricing.prizePoolContribution)} per person goes to the prize pool
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm">
              {error}
              <button 
                onClick={() => setError(null)} 
                className="float-right text-red-400 hover:text-red-300"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 bg-gray-900/50 rounded-b-xl space-y-3">
          {/* Terms */}
          <p className="text-gray-500 text-xs text-center">
            By clicking Pay, you agree to the cancellation policy. Refunds are at the organizer's discretion.
          </p>
          
          {/* Pay Button */}
          <button
            onClick={handlePayment}
            disabled={loading || summary.totalPeople === 0}
            className={`w-full py-3 rounded-lg font-bold text-lg transition-all flex items-center justify-center gap-2 ${
              loading || summary.totalPeople === 0
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-500 text-white'
            }`}
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Processing...
              </>
            ) : summary.totalPeople === 0 ? (
              'Select at least 1 person'
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                Pay {formatCurrency(summary.total)}
                {summary.totalPeople > 1 && (
                  <span className="text-green-200 text-sm font-normal">
                    ({summary.totalPeople} people)
                  </span>
                )}
              </>
            )}
          </button>
          
          {/* Cancel */}
          <button
            onClick={onClose}
            disabled={loading}
            className="w-full py-2 text-gray-400 hover:text-white text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default MeetupCheckoutModal;