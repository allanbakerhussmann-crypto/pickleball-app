/**
 * MeetupDetail Component (Extended with Payment Support)
 * 
 * Shows meetup details and allows users to:
 * - View meetup info, pricing, competition format
 * - RSVP (free meetups) or Pay to Join (paid meetups)
 * - See who's attending and their payment status
 * - Organizer can manage attendees
 * 
 * FILE LOCATION: components/meetups/MeetupDetail.tsx
 */

import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  getMeetupById, 
  getMeetupRSVPs, 
  setMeetupRSVP,
  removeMeetupRSVP,
  cancelMeetup,
  deleteMeetup 
} from '../../services/firebase';
import { 
  createCheckoutSession, 
  redirectToCheckout,
} from '../../services/stripe';
import type { Meetup, MeetupRSVP } from '../../types';

// ============================================
// TYPES
// ============================================

interface MeetupDetailProps {
  meetupId: string;
  onBack: () => void;
  onEdit?: (meetupId: string) => void;
}

interface ExtendedMeetup extends Meetup {
  pricing?: {
    enabled: boolean;
    entryFee: number;
    prizePoolEnabled: boolean;
    prizePoolContribution: number;
    prizeDistribution?: { first: number; second: number; third?: number; fourth?: number };
    feesPaidBy: 'organizer' | 'player';
    totalPerPerson: number;
    currency: string;
  };
  organizerStripeAccountId?: string;
  organizerName?: string;
  competition?: {
    managedInApp: boolean;
    type: string;
    settings?: any;
  };
  endTime?: number;
}

interface ExtendedMeetupRSVP extends MeetupRSVP {
  paymentStatus?: 'not_required' | 'pending' | 'paid' | 'refunded' | 'waived';
  amountPaid?: number;
  paidAt?: number;
}

// ============================================
// CONSTANTS
// ============================================

const COMPETITION_LABELS: Record<string, string> = {
  casual: 'Casual Play',
  round_robin: 'Round Robin',
  single_elimination: 'Single Elimination',
  double_elimination: 'Double Elimination',
  king_of_court: 'King of the Court',
  ladder: 'Ladder',
  swiss: 'Swiss System',
  pool_play_knockout: 'Pool Play + Knockout',
};

// ============================================
// COMPONENT
// ============================================

export const MeetupDetail: React.FC<MeetupDetailProps> = ({ meetupId, onBack, onEdit }) => {
  const { currentUser, userProfile } = useAuth();
  const [meetup, setMeetup] = useState<ExtendedMeetup | null>(null);
  const [rsvps, setRsvps] = useState<ExtendedMeetupRSVP[]>([]);
  const [loading, setLoading] = useState(true);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [showShareToast, setShowShareToast] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================
  // DATA LOADING
  // ============================================

  const loadData = async () => {
    try {
      const [m, r] = await Promise.all([
        getMeetupById(meetupId),
        getMeetupRSVPs(meetupId)
      ]);
      setMeetup(m as ExtendedMeetup);
      setRsvps((r || []) as ExtendedMeetupRSVP[]);
    } catch (e) {
      console.error('Error loading meetup data:', e);
      setRsvps([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [meetupId]);

  // Check URL for payment success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      // Reload data to show updated payment status
      loadData();
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname + window.location.hash.split('?')[0]);
    }
  }, []);

  // ============================================
  // COMPUTED VALUES
  // ============================================

  const isCreator = currentUser?.uid === meetup?.createdByUserId;
  const isCancelled = meetup?.status === 'cancelled';
  const isPast = meetup?.when ? meetup.when < Date.now() : false;
  const isPaid = meetup?.pricing?.enabled && meetup.pricing.totalPerPerson > 0;
  
  const goingList = rsvps.filter(r => r.status === 'going');
  const maybeList = rsvps.filter(r => r.status === 'maybe');
  const paidList = rsvps.filter(r => r.paymentStatus === 'paid');
  const goingCount = goingList.length;
  
  const myRsvp = rsvps.find(r => r.userId === currentUser?.uid);
  const isFull = meetup?.maxPlayers ? goingCount >= meetup.maxPlayers : false;
  const spotsLeft = meetup?.maxPlayers ? meetup.maxPlayers - goingCount : null;

  // Prize pool calculation
  const currentPrizePool = isPaid && meetup?.pricing?.prizePoolEnabled
    ? paidList.length * (meetup.pricing.prizePoolContribution || 0)
    : 0;

  // ============================================
  // HANDLERS
  // ============================================

  const handleRSVP = async (status: 'going' | 'maybe') => {
    if (!currentUser) {
      alert('Please log in to RSVP');
      return;
    }
    
    // If this is a paid meetup and they're going, redirect to payment
    if (isPaid && status === 'going' && myRsvp?.paymentStatus !== 'paid') {
      await handlePayToJoin();
      return;
    }
    
    setRsvpLoading(true);
    try {
      await setMeetupRSVP(meetupId, currentUser.uid, status);
      await loadData();
    } catch (e) {
      console.error('RSVP error:', e);
      alert('Failed to update RSVP: ' + (e as Error).message);
    } finally {
      setRsvpLoading(false);
    }
  };

  const handlePayToJoin = async () => {
    if (!currentUser || !meetup || !meetup.pricing || !meetup.organizerStripeAccountId) {
      setError('Payment not available for this meetup');
      return;
    }

    setPaymentLoading(true);
    setError(null);

    try {
      const baseUrl = window.location.origin;
      const successUrl = `${baseUrl}/#/meetups/${meetupId}?payment=success`;
      const cancelUrl = `${baseUrl}/#/meetups/${meetupId}?payment=cancelled`;

      const session = await createCheckoutSession({
        items: [{
          name: meetup.title,
          description: `Entry fee for ${meetup.title}`,
          amount: meetup.pricing.totalPerPerson,
          quantity: 1,
        }],
        customerEmail: currentUser.email || undefined,
        organizerStripeAccountId: meetup.organizerStripeAccountId,
        successUrl,
        cancelUrl,
        metadata: {
          type: 'meetup',
          meetupId: meetupId,
          odUserId: currentUser.uid,
          odUserName: userProfile?.displayName || 'Player',
        },
      });

      // Redirect to Stripe Checkout
      await redirectToCheckout(session.url);
    } catch (err: any) {
      console.error('Payment error:', err);
      setError(err.message || 'Failed to start payment');
      setPaymentLoading(false);
    }
  };

  const handleWithdrawRSVP = () => {
    if (!currentUser) return;
    setShowWithdrawConfirm(true);
  };

  const confirmWithdrawRSVP = async () => {
    if (!currentUser) return;
    
    setShowWithdrawConfirm(false);
    setRsvpLoading(true);
    
    try {
      await removeMeetupRSVP(meetupId, currentUser.uid);
      await loadData();
    } catch (e) {
      console.error('Withdraw error:', e);
      alert('Failed to withdraw: ' + (e as Error).message);
    } finally {
      setRsvpLoading(false);
    }
  };

  const handleCancelMeetup = async () => {
    if (!meetup) return;
    
    setCancelling(true);
    try {
      await cancelMeetup(meetupId, cancelReason || undefined);
      await loadData();
      setShowCancelModal(false);
    } catch (e) {
      console.error('Cancel error:', e);
      alert('Failed to cancel meetup');
    } finally {
      setCancelling(false);
    }
  };

  const handleDeleteMeetup = async () => {
    try {
      await deleteMeetup(meetupId);
      onBack();
    } catch (e) {
      console.error('Delete error:', e);
      alert('Failed to delete meetup');
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setShowShareToast(true);
      setTimeout(() => setShowShareToast(false), 2000);
    } catch {
      alert('Copy this link: ' + url);
    }
  };

  // ============================================
  // FORMAT HELPERS
  // ============================================

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-NZ', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-NZ', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  // ============================================
  // RENDER - LOADING
  // ============================================

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="h-64 bg-gray-800 rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (!meetup) {
    return (
      <div className="max-w-2xl mx-auto p-4 text-center">
        <p className="text-gray-400">Meetup not found</p>
        <button onClick={onBack} className="mt-4 text-green-400 hover:text-green-300">
          ← Back to Meetups
        </button>
      </div>
    );
  }

  // ============================================
  // RENDER - MAIN
  // ============================================

  return (
    <div className="max-w-2xl mx-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="text-gray-400 hover:text-white flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleShare}
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700"
            title="Share"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          </button>
          {isCreator && !isCancelled && onEdit && (
            <button
              onClick={() => onEdit(meetupId)}
              className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700"
              title="Edit"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Share Toast */}
      {showShareToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg z-50">
          Link copied to clipboard!
        </div>
      )}

      {/* Main Card */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        {/* Cancelled Banner */}
        {isCancelled && (
          <div className="bg-red-900/50 border-b border-red-700 px-4 py-3">
            <p className="text-red-200 font-medium">This meetup has been cancelled</p>
            {meetup.cancelReason && (
              <p className="text-red-300/80 text-sm mt-1">Reason: {meetup.cancelReason}</p>
            )}
          </div>
        )}

        {/* Past Event Banner */}
        {isPast && !isCancelled && (
          <div className="bg-gray-700/50 border-b border-gray-600 px-4 py-3">
            <p className="text-gray-300 font-medium">This meetup has ended</p>
          </div>
        )}

        {/* Title & Organizer */}
        <div className="p-6 border-b border-gray-700">
          <h1 className="text-2xl font-bold text-white mb-2">{meetup.title}</h1>
          {meetup.organizerName && (
            <p className="text-gray-400 text-sm">Organized by {meetup.organizerName}</p>
          )}
        </div>

        {/* Details Grid */}
        <div className="p-6 border-b border-gray-700 grid gap-4">
          {/* Date & Time */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-900/50 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-white font-medium">{formatDate(meetup.when)}</p>
              <p className="text-gray-400 text-sm">
                {formatTime(meetup.when)}
                {meetup.endTime && ` - ${formatTime(meetup.endTime)}`}
              </p>
            </div>
          </div>

          {/* Location */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-900/50 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="text-white font-medium">{meetup.locationName}</p>
              {meetup.location && (
                <a 
                  href={`https://maps.google.com/?q=${meetup.location.lat},${meetup.location.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 text-sm"
                >
                  Open in Maps →
                </a>
              )}
            </div>
          </div>

          {/* Competition Type */}
          {meetup.competition && meetup.competition.type !== 'casual' && (
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-900/50 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-white font-medium">{COMPETITION_LABELS[meetup.competition.type] || meetup.competition.type}</p>
                <p className="text-gray-400 text-sm">
                  {meetup.competition.managedInApp ? 'Brackets managed in app' : 'External management'}
                </p>
              </div>
            </div>
          )}

          {/* Description */}
          {meetup.description && (
            <div className="mt-2">
              <p className="text-gray-300 whitespace-pre-wrap">{meetup.description}</p>
            </div>
          )}
        </div>

        {/* Pricing Section */}
        {isPaid && meetup.pricing && (
          <div className="p-6 border-b border-gray-700 bg-gray-900/30">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Entry Fee</h3>
            
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-2xl font-bold text-green-400">{formatCurrency(meetup.pricing.totalPerPerson)}</p>
                <p className="text-gray-400 text-sm">per person</p>
              </div>
              
              {meetup.pricing.prizePoolEnabled && (
                <div className="text-right">
                  <p className="text-yellow-400 font-bold">🏆 Prize Pool</p>
                  <p className="text-white font-medium">{formatCurrency(currentPrizePool)}</p>
                  <p className="text-gray-500 text-xs">from {paidList.length} paid players</p>
                </div>
              )}
            </div>

            {/* Prize Distribution */}
            {meetup.pricing.prizePoolEnabled && meetup.pricing.prizeDistribution && (
              <div className="bg-gray-800 rounded-lg p-3 grid grid-cols-3 gap-2 text-center text-sm">
                <div>
                  <p className="text-yellow-400 font-bold">🥇 {meetup.pricing.prizeDistribution.first}%</p>
                  <p className="text-gray-500 text-xs">1st Place</p>
                </div>
                {meetup.pricing.prizeDistribution.second > 0 && (
                  <div>
                    <p className="text-gray-300 font-bold">🥈 {meetup.pricing.prizeDistribution.second}%</p>
                    <p className="text-gray-500 text-xs">2nd Place</p>
                  </div>
                )}
                {meetup.pricing.prizeDistribution.third && meetup.pricing.prizeDistribution.third > 0 && (
                  <div>
                    <p className="text-orange-400 font-bold">🥉 {meetup.pricing.prizeDistribution.third}%</p>
                    <p className="text-gray-500 text-xs">3rd Place</p>
                  </div>
                )}
              </div>
            )}

            {/* Fee Breakdown */}
            <div className="mt-3 text-xs text-gray-500">
              {meetup.pricing.entryFee > 0 && (
                <span>Entry: {formatCurrency(meetup.pricing.entryFee)}</span>
              )}
              {meetup.pricing.prizePoolEnabled && meetup.pricing.prizePoolContribution > 0 && (
                <span> • Prize pool: {formatCurrency(meetup.pricing.prizePoolContribution)}</span>
              )}
              {meetup.pricing.feesPaidBy === 'player' && (
                <span> • Fees included</span>
              )}
            </div>
          </div>
        )}

        {/* RSVP Section */}
        {!isCancelled && !isPast && (
          <div className="p-6 border-b border-gray-700">
            {/* Spots Info */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-green-400 font-bold text-lg">{goingCount}</span>
                <span className="text-gray-400">/ {meetup.maxPlayers || '∞'} Going</span>
                {isPaid && (
                  <span className="text-gray-500 text-sm">({paidList.length} paid)</span>
                )}
              </div>
              {spotsLeft !== null && spotsLeft <= 5 && spotsLeft > 0 && (
                <span className="text-orange-400 font-bold text-sm">{spotsLeft} spots left!</span>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-2 rounded-lg mb-4 text-sm">
                {error}
                <button onClick={() => setError(null)} className="float-right text-red-300">✕</button>
              </div>
            )}

            {/* Action Buttons */}
            {currentUser ? (
              <div className="space-y-3">
                {/* Paid Meetup - Pay Button */}
                {isPaid && myRsvp?.paymentStatus !== 'paid' && (
                  <button
                    onClick={handlePayToJoin}
                    disabled={paymentLoading || isFull}
                    className={`w-full py-3 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${
                      isFull
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        : 'bg-green-600 hover:bg-green-500 text-white'
                    }`}
                  >
                    {paymentLoading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Processing...
                      </>
                    ) : isFull ? (
                      'Full'
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                        </svg>
                        Pay {formatCurrency(meetup.pricing!.totalPerPerson)} to Join
                      </>
                    )}
                  </button>
                )}

                {/* Paid Meetup - Already Paid */}
                {isPaid && myRsvp?.paymentStatus === 'paid' && (
                  <div className="bg-green-900/30 border border-green-700 rounded-lg p-4 text-center">
                    <p className="text-green-400 font-bold flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      You're In! Payment Confirmed
                    </p>
                    <p className="text-gray-400 text-sm mt-1">
                      Paid {myRsvp.amountPaid ? formatCurrency(myRsvp.amountPaid) : ''}
                    </p>
                  </div>
                )}

                {/* Free Meetup - Going/Maybe Buttons */}
                {!isPaid && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleRSVP('going')}
                      disabled={rsvpLoading || (isFull && myRsvp?.status !== 'going')}
                      className={`flex-1 py-3 rounded-lg font-bold transition-all ${
                        myRsvp?.status === 'going'
                          ? 'bg-green-600 text-white shadow-lg'
                          : isFull
                            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {rsvpLoading ? 'Saving...' : myRsvp?.status === 'going' ? '✓ Going' : isFull ? 'Full' : 'Going'}
                    </button>
                    <button
                      onClick={() => handleRSVP('maybe')}
                      disabled={rsvpLoading}
                      className={`flex-1 py-3 rounded-lg font-bold transition-all ${
                        myRsvp?.status === 'maybe'
                          ? 'bg-yellow-600 text-white shadow-lg'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {rsvpLoading ? 'Saving...' : myRsvp?.status === 'maybe' ? '✓ Maybe' : 'Maybe'}
                    </button>
                  </div>
                )}

                {/* Withdraw Button */}
                {myRsvp && (!isPaid || myRsvp.paymentStatus !== 'paid') && (
                  <button
                    onClick={handleWithdrawRSVP}
                    disabled={rsvpLoading}
                    className="w-full py-2 text-sm text-gray-500 hover:text-red-400 transition-colors"
                  >
                    Withdraw RSVP
                  </button>
                )}

                {/* Refund note for paid attendees */}
                {isPaid && myRsvp?.paymentStatus === 'paid' && (
                  <p className="text-center text-xs text-gray-500">
                    Contact the organizer to request a refund
                  </p>
                )}
              </div>
            ) : (
              <div className="p-4 bg-gray-900 rounded text-center text-gray-400">
                Please log in to {isPaid ? 'pay and join' : 'RSVP'}.
              </div>
            )}

            {/* Organizer Cancel Button */}
            {isCreator && (
              <button
                onClick={() => setShowCancelModal(true)}
                className="w-full mt-4 py-2 text-sm text-red-400 hover:text-red-300 border border-red-900 rounded-lg hover:bg-red-900/20 transition-colors"
              >
                Cancel Meetup
              </button>
            )}
          </div>
        )}

        {/* Attendees List */}
        <div className="p-6">
          <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">
            Who's Going ({goingCount})
          </h4>
          
          {goingList.length === 0 ? (
            <p className="text-gray-500 italic text-sm">Be the first to join!</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              {goingList.map(rsvp => (
                <div key={rsvp.userId} className="flex items-center gap-2 bg-gray-900 p-2 rounded border border-gray-700">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    rsvp.paymentStatus === 'paid' 
                      ? 'bg-green-900 text-green-300' 
                      : 'bg-gray-700 text-gray-400'
                  }`}>
                    {rsvp.userProfile?.displayName?.charAt(0) || '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-sm text-gray-200 truncate block">
                      {rsvp.userProfile?.displayName || 'User'}
                    </span>
                    {isPaid && (
                      <span className={`text-xs ${
                        rsvp.paymentStatus === 'paid' ? 'text-green-400' : 'text-gray-500'
                      }`}>
                        {rsvp.paymentStatus === 'paid' ? '✓ Paid' : 'Pending'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Maybe List */}
          {maybeList.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4 mt-6">
                Maybe ({maybeList.length})
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {maybeList.map(rsvp => (
                  <div key={rsvp.userId} className="flex items-center gap-2 bg-gray-900/50 p-2 rounded border border-gray-700/50">
                    <div className="w-8 h-8 rounded-full bg-yellow-900/50 flex items-center justify-center text-yellow-300 text-xs font-bold flex-shrink-0">
                      {rsvp.userProfile?.displayName?.charAt(0) || '?'}
                    </div>
                    <span className="text-sm text-gray-400 truncate">
                      {rsvp.userProfile?.displayName || 'User'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Delete Button for cancelled meetups */}
        {isCreator && isCancelled && (
          <div className="p-4 border-t border-gray-700 bg-gray-900/50">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="text-sm text-red-400 hover:text-red-300"
            >
              Permanently delete this meetup
            </button>
          </div>
        )}
      </div>

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl border border-gray-700 max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-white mb-4">Cancel Meetup</h3>
            <p className="text-gray-400 mb-4">
              Are you sure? All attendees will be notified.
              {isPaid && paidList.length > 0 && (
                <span className="block mt-2 text-yellow-400">
                  ⚠️ {paidList.length} people have paid. You'll need to process refunds manually.
                </span>
              )}
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-400 mb-1">Reason (optional)</label>
              <input
                type="text"
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="e.g., Weather conditions"
                className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-red-500 outline-none"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex-1 py-2 px-4 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600"
              >
                Keep Meetup
              </button>
              <button
                onClick={handleCancelMeetup}
                disabled={cancelling}
                className="flex-1 py-2 px-4 bg-red-600 text-white rounded-lg hover:bg-red-500 disabled:opacity-50"
              >
                {cancelling ? 'Cancelling...' : 'Cancel Meetup'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl border border-gray-700 max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-white mb-4">Delete Meetup</h3>
            <p className="text-gray-400 mb-4">
              This will permanently delete the meetup and all data. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2 px-4 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteMeetup}
                className="flex-1 py-2 px-4 bg-red-600 text-white rounded-lg hover:bg-red-500"
              >
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw Confirm Modal */}
      {showWithdrawConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl border border-gray-700 max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-white mb-4">Withdraw RSVP</h3>
            <p className="text-gray-400 mb-6">
              Are you sure you want to remove your RSVP from this meetup?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowWithdrawConfirm(false)}
                className="flex-1 py-2 px-4 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600"
              >
                Keep RSVP
              </button>
              <button
                onClick={confirmWithdrawRSVP}
                className="flex-1 py-2 px-4 bg-red-600 text-white rounded-lg hover:bg-red-500"
              >
                Withdraw
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MeetupDetail;