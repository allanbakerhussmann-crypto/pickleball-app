/**
 * MeetupDetail Component (Extended with Scoring & Tabs)
 * 
 * Shows meetup details with tabbed interface:
 * - Details: Event info, pricing, competition format
 * - Attendees: Who's attending and their payment status
 * - Scoring: Match entry and standings (for competitive meetups)
 * 
 * FILE LOCATION: components/meetups/MeetupDetail.tsx
 * VERSION: V05.17 - Added Scoring Tab
 */

import React, { useEffect, useState, useMemo } from 'react';
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
import { MeetupScoring } from './MeetupScoring';
import type { MeetupRSVP } from '../../types';

// ============================================
// TYPES
// ============================================

interface MeetupDetailProps {
  meetupId: string;
  onBack: () => void;
  onEdit?: (meetupId: string) => void;
}

// Define locally to avoid type conflicts
interface ExtendedMeetup {
  id: string;
  title: string;
  description: string;
  when: number;
  endTime?: number;
  visibility: 'public' | 'linkOnly' | 'private';
  maxPlayers: number;
  locationName: string;
  location?: { lat: number; lng: number };
  createdByUserId: string;
  organizerName?: string;
  clubId?: string;
  clubName?: string;
  hostedBy?: string;
  status: 'draft' | 'active' | 'cancelled' | 'completed';
  cancelledAt?: number;
  cancelReason?: string;
  currentPlayers?: number;
  paidPlayers?: number;
  totalCollected?: number;
  createdAt: number;
  updatedAt: number;
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
  competition?: {
    managedInApp: boolean;
    type: string;
    settings?: {
      pointsToWin?: number;
      winBy?: number;
      gamesPerMatch?: number;
      scoringSystem?: string;
      pointsPerWin?: number;
      pointsPerDraw?: number;
      pointsPerLoss?: number;
      timeLimit?: number;
      numberOfRounds?: number;
      poolSize?: number;
      teamsAdvancing?: number;
      winStreak?: number;
      consolationBracket?: boolean;
      thirdPlaceMatch?: boolean;
    };
  };
}

interface ExtendedMeetupRSVP extends MeetupRSVP {
  odUserId: string;
  odUserName: string;
  userId?: string;  // Legacy field
  userName?: string;
  paymentStatus?: 'not_required' | 'pending' | 'paid' | 'refunded' | 'waived';
  amountPaid?: number;
  paidAt?: number;
}

type MeetupTab = 'details' | 'attendees' | 'scoring';

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

  // Tab state
  const [activeTab, setActiveTab] = useState<MeetupTab>('details');

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
      loadData();
      window.history.replaceState({}, '', window.location.pathname + window.location.hash.split('?')[0]);
    }
  }, []);

  // ============================================
  // COMPUTED VALUES
  // ============================================

  const isCreator = currentUser?.uid === meetup?.createdByUserId;
  const isCancelled = meetup?.status === 'cancelled';
  const isPaid = meetup?.pricing?.enabled && (meetup?.pricing?.totalPerPerson || 0) > 0;
  
  const myRsvp = useMemo(() => 
    rsvps.find(r => r.odUserId === currentUser?.uid || (r as any).userId === currentUser?.uid),
    [rsvps, currentUser?.uid]
  );
  
  const isGoing = myRsvp?.status === 'going';
  const hasPaid = myRsvp?.paymentStatus === 'paid';

  const goingList = useMemo(() => 
    rsvps.filter(r => r.status === 'going'),
    [rsvps]
  );
  
  const maybeList = useMemo(() => 
    rsvps.filter(r => r.status === 'maybe'),
    [rsvps]
  );

  // Check if scoring tab should be shown
  const showScoringTab = useMemo(() => {
    if (!meetup?.competition) return false;
    if (meetup.competition.type === 'casual') return false;
    return meetup.competition.managedInApp === true;
  }, [meetup?.competition]);

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

  const getRsvpDisplayName = (rsvp: ExtendedMeetupRSVP): string => {
    return rsvp.odUserName || rsvp.userName || (rsvp as any).userProfile?.displayName || 'User';
  };

  // ============================================
  // HANDLERS
  // ============================================

  const handleRSVP = async (status: 'going' | 'maybe') => {
    if (!currentUser || !userProfile) return;
    setRsvpLoading(true);
    try {
      await setMeetupRSVP(meetupId, currentUser.uid, status);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRsvpLoading(false);
    }
  };

  const handlePayToJoin = async () => {
    if (!currentUser || !userProfile || !meetup) return;
    if (!meetup.organizerStripeAccountId) {
      setError('Payment not available - organizer has not set up payments');
      return;
    }
    
    setPaymentLoading(true);
    try {
      const session = await createCheckoutSession({
        items: [{
          name: meetup.title,
          description: `Entry fee for ${meetup.title}`,
          amount: meetup.pricing?.totalPerPerson || 0,
          quantity: 1,
        }],
        customerEmail: currentUser.email || undefined,
        organizerStripeAccountId: meetup.organizerStripeAccountId,
        successUrl: `${window.location.origin}/#/meetups/${meetupId}?payment=success`,
        cancelUrl: `${window.location.origin}/#/meetups/${meetupId}?payment=cancel`,
        metadata: {
          type: 'meetup',
          meetupId,
          odUserId: currentUser.uid,
          userName: userProfile.displayName || 'Guest',
        },
      });
      // Redirect to Stripe Checkout URL
      await redirectToCheckout(session.url);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!currentUser) return;
    setRsvpLoading(true);
    try {
      await removeMeetupRSVP(meetupId, currentUser.uid);
      await loadData();
      setShowWithdrawConfirm(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRsvpLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!meetup) return;
    setCancelling(true);
    try {
      await cancelMeetup(meetupId, cancelReason);
      await loadData();
      setShowCancelModal(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCancelling(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMeetup(meetupId);
      onBack();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleShare = () => {
    const url = `${window.location.origin}/#/meetups/${meetupId}`;
    navigator.clipboard.writeText(url);
    setShowShareToast(true);
    setTimeout(() => setShowShareToast(false), 2000);
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
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        <div className="fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg z-50">
          Link copied to clipboard!
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-200 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Main Card */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        {/* Title Section */}
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-white">{meetup.title}</h1>
              {meetup.organizerName && (
                <p className="text-sm text-gray-400 mt-1">
                  Hosted by {meetup.organizerName}
                </p>
              )}
            </div>
            {isCancelled && (
              <span className="px-3 py-1 bg-red-900/50 text-red-400 rounded-full text-sm font-medium">
                Cancelled
              </span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActiveTab('details')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'details'
                ? 'text-green-400 border-b-2 border-green-400 bg-gray-900/30'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            📋 Details
          </button>
          <button
            onClick={() => setActiveTab('attendees')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'attendees'
                ? 'text-green-400 border-b-2 border-green-400 bg-gray-900/30'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            👥 Attendees ({goingList.length})
          </button>
          {showScoringTab && (
            <button
              onClick={() => setActiveTab('scoring')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'scoring'
                  ? 'text-green-400 border-b-2 border-green-400 bg-gray-900/30'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              🏆 Scoring
            </button>
          )}
        </div>

        {/* Tab Content */}
        <div className="p-4">
          {/* ========== DETAILS TAB ========== */}
          {activeTab === 'details' && (
            <div className="space-y-4">
              {/* Date & Time */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-900/50 flex items-center justify-center">
                  <span className="text-green-400">📅</span>
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
                <div className="w-10 h-10 rounded-lg bg-blue-900/50 flex items-center justify-center">
                  <span className="text-blue-400">📍</span>
                </div>
                <div>
                  <p className="text-white font-medium">{meetup.locationName}</p>
                </div>
              </div>

              {/* Capacity */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-900/50 flex items-center justify-center">
                  <span className="text-purple-400">👥</span>
                </div>
                <div>
                  <p className="text-white font-medium">
                    {goingList.length} / {meetup.maxPlayers} spots filled
                  </p>
                  {goingList.length >= meetup.maxPlayers && (
                    <p className="text-yellow-400 text-sm">Meetup is full</p>
                  )}
                </div>
              </div>

              {/* Pricing */}
              {isPaid && (
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-yellow-900/50 flex items-center justify-center">
                    <span className="text-yellow-400">💰</span>
                  </div>
                  <div>
                    <p className="text-white font-medium">
                      {formatCurrency(meetup.pricing!.totalPerPerson)} per person
                    </p>
                    {meetup.pricing!.prizePoolEnabled && (
                      <p className="text-gray-400 text-sm">
                        Includes {formatCurrency(meetup.pricing!.prizePoolContribution)} prize pool
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Competition Format */}
              {meetup.competition && meetup.competition.type !== 'casual' && (
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-orange-900/50 flex items-center justify-center">
                    <span className="text-orange-400">🏆</span>
                  </div>
                  <div>
                    <p className="text-white font-medium">
                      {COMPETITION_LABELS[meetup.competition.type] || meetup.competition.type}
                    </p>
                    {meetup.competition.settings && (
                      <p className="text-gray-400 text-sm">
                        {meetup.competition.settings.gamesPerMatch === 1 
                          ? 'Single game' 
                          : `Best of ${meetup.competition.settings.gamesPerMatch}`} to {meetup.competition.settings.pointsToWin || 11}
                        {meetup.competition.settings.winBy === 2 && ', win by 2'}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Description */}
              {meetup.description && (
                <div className="pt-4 border-t border-gray-700">
                  <p className="text-gray-300 whitespace-pre-wrap">{meetup.description}</p>
                </div>
              )}

              {/* Action Buttons */}
              {!isCancelled && (
                <div className="pt-4 border-t border-gray-700 space-y-3">
                  {!currentUser ? (
                    <p className="text-center text-gray-400">Sign in to RSVP</p>
                  ) : isGoing ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-center gap-2 py-2 bg-green-900/30 rounded-lg">
                        <span className="text-green-400">✓</span>
                        <span className="text-green-400 font-medium">
                          {hasPaid ? "You're going (Paid)" : "You're going"}
                        </span>
                      </div>
                      {isPaid && !hasPaid && (
                        <button
                          onClick={handlePayToJoin}
                          disabled={paymentLoading}
                          className="w-full py-3 bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-600 text-white rounded-lg font-semibold"
                        >
                          {paymentLoading ? 'Processing...' : `Pay ${formatCurrency(meetup.pricing!.totalPerPerson)}`}
                        </button>
                      )}
                      <button
                        onClick={() => setShowWithdrawConfirm(true)}
                        className="w-full py-2 text-gray-400 hover:text-red-400 text-sm"
                      >
                        Withdraw
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      {isPaid ? (
                        <button
                          onClick={handlePayToJoin}
                          disabled={paymentLoading || goingList.length >= meetup.maxPlayers}
                          className="flex-1 py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white rounded-lg font-semibold"
                        >
                          {paymentLoading ? 'Processing...' : `Pay ${formatCurrency(meetup.pricing!.totalPerPerson)} & Join`}
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => handleRSVP('going')}
                            disabled={rsvpLoading || goingList.length >= meetup.maxPlayers}
                            className="flex-1 py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white rounded-lg font-semibold"
                          >
                            {rsvpLoading ? 'Saving...' : "I'm Going"}
                          </button>
                          <button
                            onClick={() => handleRSVP('maybe')}
                            disabled={rsvpLoading}
                            className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold"
                          >
                            Maybe
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* Organizer Actions */}
                  {isCreator && (
                    <button
                      onClick={() => setShowCancelModal(true)}
                      className="w-full py-2 text-red-400 hover:text-red-300 text-sm"
                    >
                      Cancel Meetup
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ========== ATTENDEES TAB ========== */}
          {activeTab === 'attendees' && (
            <div className="space-y-4">
              {/* Going List */}
              <div>
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">
                  Going ({goingList.length})
                </h3>
                {goingList.length === 0 ? (
                  <p className="text-gray-500 text-sm">No one has joined yet. Be the first!</p>
                ) : (
                  <div className="space-y-2">
                    {goingList.map((rsvp) => (
                      <div
                        key={rsvp.odUserId || (rsvp as any).userId}
                        className={`flex items-center justify-between p-3 rounded-lg ${
                          rsvp.paymentStatus === 'paid'
                            ? 'bg-green-900/20 border border-green-800'
                            : 'bg-gray-700/50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center text-lg font-bold text-white">
                            {getRsvpDisplayName(rsvp)[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="text-white font-medium">{getRsvpDisplayName(rsvp)}</p>
                            {rsvp.paymentStatus === 'paid' && (
                              <p className="text-green-400 text-xs">✓ Paid</p>
                            )}
                            {rsvp.paymentStatus === 'pending' && isPaid && (
                              <p className="text-yellow-400 text-xs">⏳ Payment pending</p>
                            )}
                          </div>
                        </div>
                        {(currentUser?.uid === rsvp.odUserId || currentUser?.uid === (rsvp as any).userId) && (
                          <span className="text-xs text-gray-500">You</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Maybe List */}
              {maybeList.length > 0 && (
                <div className="pt-4 border-t border-gray-700">
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">
                    Maybe ({maybeList.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {maybeList.map((rsvp) => (
                      <div
                        key={rsvp.odUserId || (rsvp as any).userId}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-700/50"
                      >
                        <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center text-xs font-bold text-white">
                          {getRsvpDisplayName(rsvp)[0].toUpperCase()}
                        </div>
                        <span className="text-sm text-gray-400">{getRsvpDisplayName(rsvp)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========== SCORING TAB ========== */}
          {activeTab === 'scoring' && showScoringTab && meetup.competition && (
            <MeetupScoring
              meetupId={meetupId}
              competitionType={meetup.competition.type}
              competitionSettings={meetup.competition.settings || {}}
              attendees={rsvps.filter(r => r.status === 'going')}
              isOrganizer={isCreator}
            />
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

      {/* ========== MODALS ========== */}

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl border border-gray-700 max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-white mb-4">Cancel Meetup</h3>
            <p className="text-gray-400 mb-4">
              Are you sure? All attendees will be notified.
            </p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason for cancellation (optional)"
              className="w-full bg-gray-900 border border-gray-600 text-white p-3 rounded-lg mb-4 min-h-[80px] resize-none"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
              >
                Keep Meetup
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex-1 py-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white rounded-lg font-semibold"
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
              This will permanently delete the meetup. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw Confirm Modal */}
      {showWithdrawConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl border border-gray-700 max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-white mb-4">Withdraw from Meetup</h3>
            <p className="text-gray-400 mb-4">
              Are you sure you want to withdraw? 
              {hasPaid && ' Note: Refund policy applies to paid meetups.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowWithdrawConfirm(false)}
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
              >
                Stay
              </button>
              <button
                onClick={handleWithdraw}
                disabled={rsvpLoading}
                className="flex-1 py-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white rounded-lg font-semibold"
              >
                {rsvpLoading ? 'Processing...' : 'Withdraw'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MeetupDetail;