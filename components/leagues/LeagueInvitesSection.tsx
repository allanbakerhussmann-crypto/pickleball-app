/**
 * LeagueInvitesSection Component
 *
 * Displays and manages league-related invites:
 * - Partner invites (someone invited you to be their partner)
 * - Join requests (someone wants to join your open team)
 *
 * V07.53: Added payment handling for per_player leagues
 * - Shows payment modal when accepting invite in per_player league
 * - Supports both Stripe and bank transfer payment methods
 *
 * @version 07.53
 * @file components/leagues/LeagueInvitesSection.tsx
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  subscribeToUserLeaguePartnerInvites,
  subscribeToMyOpenTeamRequests,
  respondToLeaguePartnerInviteAtomic,
  respondToLeagueJoinRequest,
  getLeague,
  generateBankTransferReference,
} from '../../services/firebase';
import { createCheckoutSession, redirectToCheckout, calculateFees, PLATFORM_FEE_PERCENT } from '../../services/stripe';
import type { LeaguePartnerInvite, LeagueJoinRequest, League, LeaguePaymentSlot } from '../../types';

// ============================================
// TYPES
// ============================================

interface LeagueInvitesSectionProps {
  onInviteAccepted?: (leagueId: string) => void;
}

interface InviteWithMeta extends LeaguePartnerInvite {
  league?: League | null;
}

interface JoinRequestWithMeta extends LeagueJoinRequest {
  league?: League | null;
}

// V07.53: Payment modal state for per_player leagues
interface PaymentModalState {
  isOpen: boolean;
  invite: InviteWithMeta | null;
  selectedMethod: 'stripe' | 'bank_transfer' | null;
}

// ============================================
// COMPONENT
// ============================================

export const LeagueInvitesSection: React.FC<LeagueInvitesSectionProps> = ({
  onInviteAccepted,
}) => {
  const { currentUser } = useAuth();

  // Partner invites (you were invited)
  const [partnerInvites, setPartnerInvites] = useState<InviteWithMeta[]>([]);
  const [partnerInvitesLoading, setPartnerInvitesLoading] = useState(true);

  // Join requests (someone wants to join your open team)
  const [joinRequests, setJoinRequests] = useState<JoinRequestWithMeta[]>([]);
  const [joinRequestsLoading, setJoinRequestsLoading] = useState(true);

  // Processing state
  const [processingId, setProcessingId] = useState<string | null>(null);

  // V07.53: Payment modal state for per_player leagues
  const [paymentModal, setPaymentModal] = useState<PaymentModalState>({
    isOpen: false,
    invite: null,
    selectedMethod: null,
  });
  const [processingPayment, setProcessingPayment] = useState(false);

  // ============================================
  // SUBSCRIPTIONS
  // ============================================

  // Subscribe to partner invites
  useEffect(() => {
    if (!currentUser?.uid) {
      setPartnerInvites([]);
      setPartnerInvitesLoading(false);
      return;
    }

    setPartnerInvitesLoading(true);
    const unsubscribe = subscribeToUserLeaguePartnerInvites(
      currentUser.uid,
      async (invites) => {
        // Enrich with league data
        const enriched = await Promise.all(
          invites.map(async (invite) => {
            try {
              const league = await getLeague(invite.leagueId);
              return { ...invite, league };
            } catch {
              return { ...invite, league: null };
            }
          })
        );
        setPartnerInvites(enriched);
        setPartnerInvitesLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser?.uid]);

  // Subscribe to join requests for my open teams
  useEffect(() => {
    if (!currentUser?.uid) {
      setJoinRequests([]);
      setJoinRequestsLoading(false);
      return;
    }

    setJoinRequestsLoading(true);
    const unsubscribe = subscribeToMyOpenTeamRequests(
      currentUser.uid,
      async (requests) => {
        // Enrich with league data
        const enriched = await Promise.all(
          requests.map(async (request) => {
            try {
              const league = await getLeague(request.leagueId);
              return { ...request, league };
            } catch {
              return { ...request, league: null };
            }
          })
        );
        setJoinRequests(enriched);
        setJoinRequestsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser?.uid]);

  // ============================================
  // HANDLERS
  // ============================================

  // V07.53: Check if partner payment is required for a league
  const requiresPartnerPayment = (league: League | null | undefined): boolean => {
    if (!league?.pricing) return false;
    const entryFee = league.pricing.entryFee || 0;
    const isPerPlayer = league.pricing.entryFeeType === 'per_player';
    const isDoubles = league.type === 'doubles' || league.type === 'mixed_doubles';
    return entryFee > 0 && isPerPlayer && isDoubles;
  };

  // V07.53: Get payment methods available for the league
  const getPaymentMethods = (league: League | null | undefined): { stripe: boolean; bank: boolean } => {
    if (!league?.pricing) return { stripe: false, bank: false };
    const pricing = league.pricing;
    // Default to stripe if nothing specified and paymentMode is stripe
    if (pricing.paymentMode === 'stripe') {
      return {
        stripe: pricing.allowStripe !== false, // Default true
        bank: pricing.allowBankTransfer === true,
      };
    }
    return { stripe: false, bank: pricing.paymentMode === 'external' };
  };

  const handleRespondToInvite = async (
    inviteId: string,
    _leagueId: string,
    response: 'accepted' | 'declined'
  ) => {
    // Find the invite to check if payment is required
    const invite = partnerInvites.find(i => i.id === inviteId);

    // V07.53: If accepting and payment is required, show payment modal
    if (response === 'accepted' && invite && requiresPartnerPayment(invite.league)) {
      setPaymentModal({
        isOpen: true,
        invite,
        selectedMethod: null,
      });
      return;
    }

    // No payment required - proceed directly
    setProcessingId(inviteId);
    try {
      const result = await respondToLeaguePartnerInviteAtomic(inviteId, response);
      if (response === 'accepted' && result) {
        onInviteAccepted?.(result.leagueId);
      }
    } catch (error) {
      console.error('Failed to respond to invite:', error);
    } finally {
      setProcessingId(null);
    }
  };

  // V07.53: Handle payment and accept invite
  const handlePayAndAccept = async () => {
    if (!paymentModal.invite || !paymentModal.selectedMethod || !currentUser) return;

    const invite = paymentModal.invite;
    const league = invite.league;
    if (!league?.pricing) return;

    setProcessingPayment(true);
    const entryFee = league.pricing.entryFee || 0;

    try {
      if (paymentModal.selectedMethod === 'bank_transfer') {
        // Bank transfer - accept with pending payment
        const paymentPatch: Partial<LeaguePaymentSlot> = {
          status: 'pending',
          method: 'bank_transfer',
          amountDue: entryFee,
          bankTransferReference: generateBankTransferReference(league.id, currentUser.uid, 'partner'),
        };

        const result = await respondToLeaguePartnerInviteAtomic(
          invite.id,
          'accepted',
          { slot: 'partner', paymentPatch }
        );

        if (result) {
          onInviteAccepted?.(result.leagueId);
        }
        setPaymentModal({ isOpen: false, invite: null, selectedMethod: null });
      } else {
        // Stripe - create checkout session and redirect
        const fees = calculateFees(entryFee, league.pricing.feesPaidBy || 'organizer');
        const amount = league.pricing.feesPaidBy === 'player' ? fees.playerPays : entryFee;

        // First, accept the invite with pending stripe payment
        const paymentPatch: Partial<LeaguePaymentSlot> = {
          status: 'pending',
          method: 'stripe',
          amountDue: entryFee,
        };

        const result = await respondToLeaguePartnerInviteAtomic(
          invite.id,
          'accepted',
          { slot: 'partner', paymentPatch }
        );

        if (!result) {
          throw new Error('Failed to accept invite');
        }

        // Create checkout session with proper metadata
        const { url } = await createCheckoutSession({
          items: [{
            name: `Partner Fee: ${league.name}`,
            description: `Entry fee for ${league.name}`,
            amount: amount,
            quantity: 1,
          }],
          successUrl: `${window.location.origin}/#/leagues/${league.id}?payment=success`,
          cancelUrl: `${window.location.origin}/#/leagues/${league.id}?payment=cancelled`,
          // V07.54: Route to correct Stripe account - leagueId is highest priority
          // Server loads league.organizerStripeAccountId (fixes stale user account issue)
          leagueId: league.id,
          clubId: league.clubId || undefined,
          organizerUserId: !league.clubId ? league.createdByUserId : undefined,
          metadata: {
            type: 'league',
            leagueId: league.id,
            memberId: result.memberId,
            slot: 'partner',
            odUserId: currentUser.uid,
            eventName: league.name,
            payerName: currentUser.displayName || currentUser.email || '',
          },
        });

        // Redirect to Stripe
        await redirectToCheckout(url);
      }
    } catch (error) {
      console.error('Failed to process payment:', error);
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleRespondToJoinRequest = async (
    requestId: string,
    _leagueId: string,
    response: 'accepted' | 'declined'
  ) => {
    setProcessingId(requestId);
    try {
      const result = await respondToLeagueJoinRequest(requestId, response);
      if (response === 'accepted' && result) {
        onInviteAccepted?.(result.leagueId);
      }
    } catch (error) {
      console.error('Failed to respond to join request:', error);
    } finally {
      setProcessingId(null);
    }
  };

  // ============================================
  // RENDER
  // ============================================

  const isLoading = partnerInvitesLoading || joinRequestsLoading;
  const hasContent = partnerInvites.length > 0 || joinRequests.length > 0;

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-gray-700 rounded w-40" />
        <div className="h-24 bg-gray-800 rounded-xl" />
      </div>
    );
  }

  if (!hasContent) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Partner Invites Section */}
      {partnerInvites.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-lime-500/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-lime-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white">
              League Partner Invitations
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-lime-500/20 text-lime-400 text-xs font-medium">
              {partnerInvites.length}
            </span>
          </div>

          <div className="space-y-3">
            {partnerInvites.map((invite) => (
              <div
                key={invite.id}
                className="group relative overflow-hidden rounded-xl border border-gray-700 bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur transition-all hover:border-gray-600"
              >
                {/* Accent bar */}
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-lime-400 to-lime-600" />

                <div className="p-5 pl-6">
                  <div className="flex items-start gap-4">
                    {/* Inviter avatar */}
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-lime-400 to-lime-600 flex items-center justify-center text-gray-900 font-bold text-lg shadow-lg shadow-lime-500/20">
                        {invite.inviterName[0].toUpperCase()}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h4 className="font-semibold text-white">
                            {invite.inviterName}
                          </h4>
                          <p className="text-gray-400 text-sm mt-0.5">
                            invited you to be their doubles partner
                          </p>
                        </div>
                      </div>

                      {/* League info */}
                      <div className="mt-3 flex items-center gap-3">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-700/50 text-gray-300 text-sm">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                          {invite.league?.name || invite.leagueName || 'League'}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(invite.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="mt-4 flex gap-2">
                        <button
                          onClick={() => handleRespondToInvite(invite.id, invite.leagueId, 'accepted')}
                          disabled={processingId === invite.id}
                          className="px-4 py-2 rounded-lg bg-lime-500 hover:bg-lime-400 text-gray-900 font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {processingId === invite.id ? (
                            <span className="flex items-center gap-2">
                              <div className="w-4 h-4 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                              Processing...
                            </span>
                          ) : (
                            'Accept'
                          )}
                        </button>
                        <button
                          onClick={() => handleRespondToInvite(invite.id, invite.leagueId, 'declined')}
                          disabled={processingId === invite.id}
                          className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Join Requests Section */}
      {joinRequests.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white">
              Partner Join Requests
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-xs font-medium">
              {joinRequests.length}
            </span>
          </div>

          <div className="space-y-3">
            {joinRequests.map((request) => (
              <div
                key={request.id}
                className="group relative overflow-hidden rounded-xl border border-gray-700 bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur transition-all hover:border-gray-600"
              >
                {/* Accent bar */}
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-400 to-blue-600" />

                <div className="p-5 pl-6">
                  <div className="flex items-start gap-4">
                    {/* Requester avatar */}
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-blue-500/20">
                        {request.requesterName[0].toUpperCase()}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h4 className="font-semibold text-white">
                            {request.requesterName}
                          </h4>
                          <p className="text-gray-400 text-sm mt-0.5">
                            wants to join your team as a partner
                          </p>
                        </div>
                      </div>

                      {/* League info */}
                      <div className="mt-3 flex items-center gap-3">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-700/50 text-gray-300 text-sm">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                          {request.league?.name || request.leagueName || 'League'}
                        </span>
                        {request.requesterDuprId && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-lime-500/20 text-lime-400 text-xs font-medium">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            DUPR Linked
                          </span>
                        )}
                        <span className="text-xs text-gray-500">
                          {new Date(request.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="mt-4 flex gap-2">
                        <button
                          onClick={() => handleRespondToJoinRequest(request.id, request.leagueId, 'accepted')}
                          disabled={processingId === request.id}
                          className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-400 text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {processingId === request.id ? (
                            <span className="flex items-center gap-2">
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Processing...
                            </span>
                          ) : (
                            'Accept Partner'
                          )}
                        </button>
                        <button
                          onClick={() => handleRespondToJoinRequest(request.id, request.leagueId, 'declined')}
                          disabled={processingId === request.id}
                          className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* V07.53: Payment Modal for Per-Player Leagues */}
      {paymentModal.isOpen && paymentModal.invite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-md shadow-2xl">
            {/* Header */}
            <div className="p-5 border-b border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">Accept Partner Invite</h3>
                <button
                  onClick={() => setPaymentModal({ isOpen: false, invite: null, selectedMethod: null })}
                  className="text-gray-400 hover:text-white"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4">
              <div className="bg-gray-800/50 rounded-lg p-4">
                <p className="text-gray-400 text-sm">You've been invited to join:</p>
                <p className="text-white font-semibold mt-1">
                  {paymentModal.invite.league?.name || paymentModal.invite.leagueName}
                </p>
                <p className="text-gray-400 text-sm mt-1">
                  Partner: {paymentModal.invite.inviterName}
                </p>
              </div>

              {/* Entry Fee */}
              <div className="bg-lime-500/10 border border-lime-500/30 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Entry Fee (per player)</span>
                  <span className="text-lime-400 font-bold text-lg">
                    ${((paymentModal.invite.league?.pricing?.entryFee || 0) / 100).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Payment Method Selection */}
              <div className="space-y-3">
                <p className="text-sm text-gray-400">Payment Method:</p>

                {(() => {
                  const methods = getPaymentMethods(paymentModal.invite.league);
                  return (
                    <>
                      {methods.stripe && (
                        <label
                          className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                            paymentModal.selectedMethod === 'stripe'
                              ? 'bg-purple-500/20 border-purple-500'
                              : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                          }`}
                          onClick={() => setPaymentModal(prev => ({ ...prev, selectedMethod: 'stripe' }))}
                        >
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            paymentModal.selectedMethod === 'stripe' ? 'border-purple-500' : 'border-gray-500'
                          }`}>
                            {paymentModal.selectedMethod === 'stripe' && (
                              <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="text-white font-medium">Pay Online</div>
                            <div className="text-xs text-gray-400">
                              ${(() => {
                                const fee = paymentModal.invite.league?.pricing?.entryFee || 0;
                                const feesPaidBy = paymentModal.invite.league?.pricing?.feesPaidBy || 'organizer';
                                if (feesPaidBy === 'player') {
                                  const fees = calculateFees(fee, 'player');
                                  return (fees.playerPays / 100).toFixed(2);
                                }
                                return (fee / 100).toFixed(2);
                              })()} total {paymentModal.invite.league?.pricing?.feesPaidBy === 'player' ? '(incl. fees)' : ''}
                            </div>
                          </div>
                        </label>
                      )}

                      {methods.bank && (
                        <label
                          className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                            paymentModal.selectedMethod === 'bank_transfer'
                              ? 'bg-blue-500/20 border-blue-500'
                              : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                          }`}
                          onClick={() => setPaymentModal(prev => ({ ...prev, selectedMethod: 'bank_transfer' }))}
                        >
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            paymentModal.selectedMethod === 'bank_transfer' ? 'border-blue-500' : 'border-gray-500'
                          }`}>
                            {paymentModal.selectedMethod === 'bank_transfer' && (
                              <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="text-white font-medium">Bank Transfer</div>
                            <div className="text-xs text-gray-400">
                              No fees - organizer confirms manually
                            </div>
                          </div>
                        </label>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Bank Details (if bank transfer selected and details available) */}
              {paymentModal.selectedMethod === 'bank_transfer' &&
               paymentModal.invite.league?.pricing?.bankDetails?.accountNumber &&
               paymentModal.invite.league?.pricing?.showBankDetails && (
                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                  <h4 className="text-sm font-medium text-white mb-3">Bank Details</h4>
                  <div className="space-y-2 text-sm">
                    {paymentModal.invite.league.pricing.bankDetails.bankName && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Bank:</span>
                        <span className="text-white">{paymentModal.invite.league.pricing.bankDetails.bankName}</span>
                      </div>
                    )}
                    {paymentModal.invite.league.pricing.bankDetails.accountName && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Name:</span>
                        <span className="text-white">{paymentModal.invite.league.pricing.bankDetails.accountName}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-400">Account:</span>
                      <span className="text-white font-mono">{paymentModal.invite.league.pricing.bankDetails.accountNumber}</span>
                    </div>
                    {paymentModal.invite.league.pricing.bankDetails.reference && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Reference:</span>
                        <span className="text-white">{paymentModal.invite.league.pricing.bankDetails.reference}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-gray-700 flex gap-3">
              <button
                onClick={() => setPaymentModal({ isOpen: false, invite: null, selectedMethod: null })}
                disabled={processingPayment}
                className="flex-1 px-4 py-3 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handlePayAndAccept}
                disabled={!paymentModal.selectedMethod || processingPayment}
                className="flex-1 px-4 py-3 rounded-lg bg-lime-500 hover:bg-lime-400 text-gray-900 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processingPayment ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                    Processing...
                  </span>
                ) : paymentModal.selectedMethod === 'stripe' ? (
                  'Pay & Accept'
                ) : (
                  'Accept'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeagueInvitesSection;
