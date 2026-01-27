/**
 * LeagueRegistrationWizard Component
 *
 * Simple registration wizard for leagues.
 * For singles: direct join
 * For doubles: uses DoublesPartnerFlow with invite/open team/join modes
 *
 * V07.53: Added payment support
 * - Stripe Card payments (redirect to Stripe Checkout)
 * - Bank Transfer (manual, organizer confirms)
 * - Free registrations (when fee is $0)
 * - Configurable doubles payment: per_team or per_player
 *
 * FILE LOCATION: components/leagues/LeagueRegistrationWizard.tsx
 * VERSION: V07.53
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  joinLeague,
  updateUserProfile,
  joinLeagueWithPartnerInvite,
  joinLeagueAsOpenTeam,
  joinOpenTeamDirect,
  cancelPendingRequestsForTeam,
  checkDuprPlusGate,
  generateBankTransferReference,
} from '../../services/firebase';
import {
  createCheckoutSession,
  redirectToCheckout,
  calculateFees,
  PLATFORM_FEE_PERCENT,
  STRIPE_FEE_PERCENT,
  STRIPE_FEE_FIXED,
} from '../../services/stripe';
import { getDuprLoginIframeUrl, parseDuprLoginEvent } from '../../services/dupr';
import { DoublesPartnerFlow, type PartnerSelection } from './DoublesPartnerFlow';
import DuprPlusVerificationModal from '../shared/DuprPlusVerificationModal';
import type { League, UserProfile, LeaguePaymentSlot } from '../../types';

// ============================================
// TYPES
// ============================================

interface LeagueRegistrationWizardProps {
  league: League;
  onClose: () => void;
  onComplete: () => void;
  /** V07.27: When true, only shows join_open option (for full leagues with open teams) */
  onlyJoinOpen?: boolean;
}

type PaymentMethod = 'stripe' | 'bank_transfer';

// ============================================
// HELPERS
// ============================================

/**
 * Format cents to display string
 */
const formatCents = (cents: number): string => {
  return `$${(cents / 100).toFixed(2)}`;
};

/**
 * Calculate the entry fee for a league registration
 * Returns amount in cents
 */
const calculateLeagueFee = (league: League, isTeam: boolean = false): number => {
  const pricing = league.pricing;
  if (!pricing) return 0;

  // Check payment mode - if external or free, no payment required
  if (pricing.paymentMode === 'external' || pricing.paymentMode === 'free') {
    return 0;
  }

  // Base entry fee
  let fee = pricing.entryFee || 0;

  // Check for early bird
  if (pricing.earlyBirdEnabled && pricing.earlyBirdFee && pricing.earlyBirdDeadline) {
    const now = Date.now();
    if (now < pricing.earlyBirdDeadline) {
      fee = pricing.earlyBirdFee;
    }
  }

  // Check for late fee
  if (pricing.lateFeeEnabled && pricing.lateFee && league.registrationDeadline) {
    const now = Date.now();
    // If past deadline and late registration is allowed
    if (now > league.registrationDeadline) {
      fee += pricing.lateFee;
    }
  }

  // For per_team fee type in doubles, the full team fee is paid by one person
  // For per_player, each player pays their own fee
  // This function returns the fee for the current registration (one slot)
  return fee;
};

// ============================================
// COMPONENT
// ============================================

export const LeagueRegistrationWizard: React.FC<LeagueRegistrationWizardProps> = ({
  league,
  onClose,
  onComplete,
  onlyJoinOpen = false,
}) => {
  const { currentUser, userProfile } = useAuth();

  // Step management
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Partner selection (for doubles)
  const [partnerSelection, setPartnerSelection] = useState<PartnerSelection | null>(null);

  // Payment method selection (V07.53)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);

  // DUPR Required modal state
  const [showDuprRequiredModal, setShowDuprRequiredModal] = useState(false);
  const [duprLinking, setDuprLinking] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(userProfile);

  // DUPR+ Verification modal state (V07.50)
  const [showDuprPlusModal, setShowDuprPlusModal] = useState(false);

  // Determine league characteristics
  const isDoubles = league.type === 'doubles';

  // Check if DUPR is required and user doesn't have it linked
  const isDuprRequired = league.settings?.duprSettings?.mode === 'required';
  const userHasDupr = !!(currentUserProfile?.duprId);
  const needsDuprLink = isDuprRequired && !userHasDupr;

  // V07.53: Payment configuration
  const pricing = league.pricing;
  const entryFee = useMemo(() => calculateLeagueFee(league, isDoubles), [league, isDoubles]);
  const isFreeRegistration = entryFee === 0;
  const allowStripe = pricing?.allowStripe !== false; // Default true
  const allowBankTransfer = pricing?.allowBankTransfer === true; // Default false
  const showPaymentOptions = !isFreeRegistration && (allowStripe || allowBankTransfer);
  const feesPaidBy = pricing?.feesPaidBy || 'player';

  // Debug: Log payment configuration
  console.log('🔷 [LeagueRegistrationWizard] Payment config:', {
    allowStripe,
    allowBankTransfer,
    showBothOptions: allowStripe && allowBankTransfer,
    pricingAllowStripe: pricing?.allowStripe,
    pricingAllowBankTransfer: pricing?.allowBankTransfer,
    fullPricing: pricing,
    leagueId: league.id,
  });

  // Calculate fees for Stripe payment
  const feeCalculation = useMemo(() => {
    if (isFreeRegistration) return null;
    return calculateFees(entryFee, feesPaidBy);
  }, [entryFee, isFreeRegistration, feesPaidBy]);

  // Auto-select payment method - Stripe is default when both are available
  useEffect(() => {
    if (!showPaymentOptions) {
      setSelectedPaymentMethod(null);
    } else if (allowStripe) {
      // Default to Stripe when available (including when both options available)
      setSelectedPaymentMethod('stripe');
    } else if (allowBankTransfer) {
      setSelectedPaymentMethod('bank_transfer');
    }
  }, [showPaymentOptions, allowStripe, allowBankTransfer]);

  // Show DUPR required modal if user doesn't have DUPR linked
  useEffect(() => {
    if (needsDuprLink) {
      setShowDuprRequiredModal(true);
    }
  }, [needsDuprLink]);

  // Listen for DUPR login messages
  useEffect(() => {
    if (!showDuprRequiredModal) return;

    const handleDuprMessage = async (event: MessageEvent) => {
      const loginData = parseDuprLoginEvent(event);
      if (!loginData || !currentUser?.uid) return;

      console.log('DUPR login successful from league registration:', loginData);
      setDuprLinking(true);

      try {
        // Update user profile with DUPR data
        await updateUserProfile(currentUser.uid, {
          duprId: loginData.duprId,
          duprDisplayName: loginData.displayName,
          duprSinglesRating: loginData.singles,
          duprDoublesRating: loginData.doubles,
          duprSinglesReliability: loginData.singlesReliability,
          duprDoublesReliability: loginData.doublesReliability,
          duprLinkedAt: Date.now(),
        });

        // Update local state
        setCurrentUserProfile(prev => prev ? ({
          ...prev,
          duprId: loginData.duprId,
          duprDisplayName: loginData.displayName,
          duprSinglesRating: loginData.singles,
          duprDoublesRating: loginData.doubles,
        }) : null);

        // Close modal after successful link
        setShowDuprRequiredModal(false);
      } catch (error) {
        console.error('Failed to link DUPR account:', error);
      } finally {
        setDuprLinking(false);
      }
    };

    window.addEventListener('message', handleDuprMessage);
    return () => window.removeEventListener('message', handleDuprMessage);
  }, [showDuprRequiredModal, currentUser?.uid]);

  // For doubles: step 1 is partner selection, step 2 is confirm + payment
  // For singles: step 1 is confirm + payment
  const totalSteps = isDoubles ? 2 : 1;

  // ============================================
  // PARTNER SELECTION HANDLER
  // ============================================

  const handlePartnerSelected = (selection: PartnerSelection) => {
    setPartnerSelection(selection);
    setStep(2); // Move to confirmation step
  };

  // ============================================
  // DUPR+ VERIFICATION HANDLER (V07.50)
  // ============================================

  const handleDuprPlusVerified = (isActive: boolean) => {
    setShowDuprPlusModal(false);
    if (isActive) {
      // User has DUPR+, proceed with registration
      // Update local profile state to reflect new verification
      setCurrentUserProfile(prev =>
        prev ? { ...prev, duprPlusActive: true, duprPlusVerifiedAt: Date.now() } : prev
      );
      // Retry submit after successful verification
      handleSubmit();
    } else {
      // User doesn't have active DUPR+
      setError('This league requires an active DUPR+ subscription. Please subscribe to DUPR+ and try again.');
    }
  };

  // ============================================
  // PAYMENT HANDLING (V07.53)
  // ============================================

  /**
   * Build payment patch for member creation
   * @param slot - 'primary' or 'partner' slot
   */
  const buildPaymentPatch = (slot: 'primary' | 'partner' = 'primary'): Partial<LeaguePaymentSlot> => {
    if (isFreeRegistration) {
      return { status: 'not_required', amountDue: 0 };
    }

    if (selectedPaymentMethod === 'bank_transfer') {
      // Generate reference using league ID and user ID (not member ID which doesn't exist yet)
      // The reference is deterministic based on user+league+slot, so it can be generated before member creation
      const reference = currentUser?.uid
        ? generateBankTransferReference(league.id, currentUser.uid, slot)
        : `LG${league.id.slice(-5).toUpperCase()}`;  // Fallback (shouldn't happen)
      return {
        status: 'pending',
        method: 'bank_transfer',
        amountDue: entryFee,
        bankTransferReference: reference,
      };
    }

    // Stripe - pending until webhook confirms
    return {
      status: 'pending',
      method: 'stripe',
      amountDue: entryFee,
    };
  };

  /**
   * Redirect to Stripe Checkout
   */
  const redirectToStripeCheckout = async (memberId: string) => {
    if (!feeCalculation || !currentUser) return;

    const baseUrl = window.location.origin;
    const successUrl = `${baseUrl}/#/leagues/${league.id}?payment=success`;
    const cancelUrl = `${baseUrl}/#/leagues/${league.id}?payment=cancelled`;

    // Determine fee description
    let description = `Entry fee for ${league.name}`;
    if (pricing?.earlyBirdEnabled && pricing.earlyBirdDeadline && Date.now() < pricing.earlyBirdDeadline) {
      description = `Early bird entry for ${league.name}`;
    }

    const { url } = await createCheckoutSession({
      items: [{
        name: `League Entry: ${league.name}`,
        description,
        amount: feeCalculation.playerPays, // Amount including fees if player pays
        quantity: 1,
      }],
      customerEmail: currentUser.email || undefined,
      // V07.54: Route to correct Stripe account - leagueId is highest priority
      // Server loads league.organizerStripeAccountId (fixes stale user account issue)
      leagueId: league.id,
      clubId: league.clubId || undefined,
      organizerUserId: !league.clubId ? league.createdByUserId : undefined,
      successUrl,
      cancelUrl,
      metadata: {
        type: 'league',
        leagueId: league.id,
        memberId: memberId,
        slot: 'primary',
        odUserId: currentUser.uid,
        eventName: league.name,
        payerName: userProfile?.displayName || '',
        organizerUserId: league.createdByUserId,  // For Finance tab queries
      },
    });

    // Redirect to Stripe
    await redirectToCheckout(url);
  };

  // ============================================
  // REGISTRATION SUBMIT
  // ============================================

  const handleSubmit = async () => {
    if (!currentUser || !userProfile) return;

    // Validate payment method selection if payment is required
    if (showPaymentOptions && !selectedPaymentMethod) {
      setError('Please select a payment method');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      // V07.50: Check DUPR+ gate before proceeding
      const gateCheck = await checkDuprPlusGate(league, userProfile);
      if (!gateCheck.allowed) {
        if (gateCheck.needsVerification) {
          setShowDuprPlusModal(true);
          setLoading(false);
          return;
        }
        throw new Error(gateCheck.reason || 'Cannot join this league');
      }

      let memberId: string;

      if (isDoubles) {
        // Handle doubles registration based on partner selection mode
        if (!partnerSelection) {
          throw new Error('Please select a partner option');
        }

        const paymentParams = {
          slot: 'primary' as const,
          paymentPatch: buildPaymentPatch('primary'),
        };

        switch (partnerSelection.mode) {
          case 'invite':
            // Invite a specific partner - creates member + invite atomically
            if (!partnerSelection.partnerUserId || !partnerSelection.partnerName) {
              throw new Error('Please select a partner to invite');
            }
            const inviteResult = await joinLeagueWithPartnerInvite(
              league.id,
              currentUser.uid,
              userProfile.displayName || 'Player',
              userProfile.duprId || null,
              partnerSelection.partnerUserId,
              partnerSelection.partnerName,
              partnerSelection.partnerDuprId || null,
              null, // divisionId
              league.name,
              paymentParams
            );
            memberId = inviteResult.memberId;
            break;

          case 'open_team':
            // Create open team looking for partner
            memberId = await joinLeagueAsOpenTeam(
              league.id,
              currentUser.uid,
              userProfile.displayName || 'Player',
              userProfile.duprId || null,
              null, // divisionId
              paymentParams
            );
            break;

          case 'join_open':
            // V07.27: Direct join to open team (no request/approval needed)
            // The team owner consented to auto-matching by creating an open team
            if (!partnerSelection.openTeamMemberId || !partnerSelection.openTeamOwnerName) {
              throw new Error('Please select a team to join');
            }
            // Directly join the open team - this makes us the partner immediately
            // For per_player mode, partner payment would be handled separately
            const joinResult = await joinOpenTeamDirect(
              league.id,
              partnerSelection.openTeamMemberId,
              currentUser.uid,
              userProfile.displayName || 'Player',
              userProfile.duprId || null,
              // Partner payment params (for per_player mode)
              pricing?.entryFeeType === 'per_player' ? {
                slot: 'partner',
                paymentPatch: buildPaymentPatch('partner'),
              } : undefined
            );
            memberId = joinResult.memberId;
            console.log('Joined team:', joinResult.teamName);
            // Clean up any other pending requests for this team (non-critical, best effort)
            try {
              await cancelPendingRequestsForTeam(partnerSelection.openTeamMemberId);
            } catch (cleanupErr) {
              // Cleanup is not critical - old requests will expire naturally
              console.log('Note: Could not clean up old requests:', cleanupErr);
            }
            break;

          default:
            throw new Error('Invalid partner selection mode');
        }
      } else {
        // Singles league - direct join
        memberId = await joinLeague(
          league.id,
          currentUser.uid,
          userProfile.displayName || 'Player',
          null, // divisionId
          null, // partnerUserId
          null, // partnerDisplayName
          {
            slot: 'primary',
            paymentPatch: buildPaymentPatch('primary'),
          }
        );
      }

      // If Stripe payment, redirect to checkout
      if (selectedPaymentMethod === 'stripe' && !isFreeRegistration) {
        await redirectToStripeCheckout(memberId);
        // Don't call onComplete - will redirect to Stripe
        return;
      }

      // For free or bank transfer, complete immediately
      onComplete();
    } catch (e: any) {
      console.error('Registration failed:', e);
      setError(e.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // STEP NAVIGATION
  // ============================================

  const canProceed = () => {
    // For doubles on confirmation step, partner must be selected
    if (isDoubles && step === 2 && !partnerSelection) return false;
    // Payment method must be selected if payment is required
    if (showPaymentOptions && !selectedPaymentMethod) return false;
    return true;
  };

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
      if (isDoubles && step === 2) {
        // Going back to partner selection, clear selection
        setPartnerSelection(null);
      }
    } else {
      onClose();
    }
  };

  // ============================================
  // RENDER - PAYMENT SECTION (V07.53)
  // ============================================

  const renderPaymentSection = () => {
    if (isFreeRegistration) {
      return (
        <div className="bg-green-900/20 border border-green-700 rounded-lg p-3">
          <p className="text-green-300 text-sm flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Free registration - no payment required
          </p>
        </div>
      );
    }

    const showBothOptions = allowStripe && allowBankTransfer;

    // Debug at render time
    console.log('🔷 [PaymentStep RENDER] showBothOptions:', showBothOptions, 'allowStripe:', allowStripe, 'allowBankTransfer:', allowBankTransfer);

    return (
      <div className="space-y-4">
        <h4 className="font-medium text-white">Payment</h4>

        {/* Entry fee display */}
        <div className="bg-gray-700/50 rounded-lg p-3 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-300">Entry fee:</span>
            <span className="text-white font-medium">{formatCents(entryFee)}</span>
          </div>
          {pricing?.earlyBirdEnabled && pricing.earlyBirdDeadline && Date.now() < pricing.earlyBirdDeadline && (
            <div className="text-xs text-lime-400">Early bird pricing!</div>
          )}
        </div>

        {/* Payment method selection - Pay Online first (default) */}
        {showBothOptions && (
          <div className="space-y-3">
            {/* Stripe Option (First/Default) */}
            <label className={`block p-4 rounded-lg border cursor-pointer transition-colors ${
              selectedPaymentMethod === 'stripe'
                ? 'border-lime-500 bg-lime-500/10'
                : 'border-gray-600 hover:border-gray-500'
            }`}>
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="stripe"
                  checked={selectedPaymentMethod === 'stripe'}
                  onChange={() => setSelectedPaymentMethod('stripe')}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="font-medium text-white">Pay Online (Card)</div>
                  {feeCalculation && (
                    <div className="text-sm text-gray-400 mt-1 space-y-1">
                      <div className="flex justify-between">
                        <span>Entry fee:</span>
                        <span>{formatCents(entryFee)}</span>
                      </div>
                      {feesPaidBy === 'player' && (
                        <>
                          <div className="flex justify-between text-gray-500">
                            <span>Platform fee ({PLATFORM_FEE_PERCENT}%):</span>
                            <span>{formatCents(feeCalculation.platformFee)}</span>
                          </div>
                          <div className="flex justify-between text-gray-500">
                            <span>Card fee ({STRIPE_FEE_PERCENT}% + {formatCents(STRIPE_FEE_FIXED)}):</span>
                            <span>{formatCents(feeCalculation.stripeFee)}</span>
                          </div>
                          <div className="flex justify-between font-medium text-white pt-1 border-t border-gray-700">
                            <span>Total:</span>
                            <span>{formatCents(feeCalculation.playerPays)}</span>
                          </div>
                        </>
                      )}
                      <div className="text-lime-400 text-xs mt-1">✓ Instant confirmation</div>
                    </div>
                  )}
                </div>
              </div>
            </label>

            {/* Bank Transfer Option */}
            <label className={`block p-4 rounded-lg border cursor-pointer transition-colors ${
              selectedPaymentMethod === 'bank_transfer'
                ? 'border-lime-500 bg-lime-500/10'
                : 'border-gray-600 hover:border-gray-500'
            }`}>
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="bank_transfer"
                  checked={selectedPaymentMethod === 'bank_transfer'}
                  onChange={() => setSelectedPaymentMethod('bank_transfer')}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="font-medium text-white">Bank Transfer (EFT)</div>
                  <div className="text-sm text-gray-400 mt-1">
                    • No processing fees<br />
                    • Spot not guaranteed until organizer confirms
                  </div>
                  {/* Bank details */}
                  {selectedPaymentMethod === 'bank_transfer' && pricing?.showBankDetails && pricing?.bankDetails && (
                    <div className="mt-3 bg-gray-800 rounded-lg p-3 text-sm border border-gray-700">
                      {pricing.bankDetails.bankName && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Bank:</span>
                          <span className="text-white">{pricing.bankDetails.bankName}</span>
                        </div>
                      )}
                      {pricing.bankDetails.accountName && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Account:</span>
                          <span className="text-white">{pricing.bankDetails.accountName}</span>
                        </div>
                      )}
                      {pricing.bankDetails.accountNumber && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Number:</span>
                          <span className="text-white font-mono">{pricing.bankDetails.accountNumber}</span>
                        </div>
                      )}
                      {pricing.bankDetails.reference && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Reference:</span>
                          <span className="text-white">{pricing.bankDetails.reference}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </label>
          </div>
        )}

        {/* Single option: Stripe only */}
        {allowStripe && !allowBankTransfer && feeCalculation && (
          <div className="bg-gray-700/50 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-300">Entry fee:</span>
              <span className="text-white">{formatCents(entryFee)}</span>
            </div>
            {feesPaidBy === 'player' && (
              <>
                <div className="flex justify-between text-gray-500">
                  <span>Platform fee ({PLATFORM_FEE_PERCENT}%):</span>
                  <span>{formatCents(feeCalculation.platformFee)}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Card fee ({STRIPE_FEE_PERCENT}% + {formatCents(STRIPE_FEE_FIXED)}):</span>
                  <span>{formatCents(feeCalculation.stripeFee)}</span>
                </div>
                <div className="flex justify-between font-medium text-white pt-2 border-t border-gray-600">
                  <span>Total:</span>
                  <span>{formatCents(feeCalculation.playerPays)}</span>
                </div>
              </>
            )}
            <div className="text-lime-400 text-xs">✓ Pay securely with Stripe</div>
          </div>
        )}

        {/* Single option: Bank transfer only */}
        {!allowStripe && allowBankTransfer && (
          <div className="bg-gray-700/50 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-300">Entry fee:</span>
              <span className="text-white">{formatCents(entryFee)}</span>
            </div>
            <div className="text-gray-400 text-xs">Payment via bank transfer. No processing fees.</div>
            {/* Bank details */}
            {pricing?.showBankDetails && pricing?.bankDetails && (
              <div className="mt-3 bg-gray-800 rounded-lg p-3 text-sm border border-gray-700">
                {pricing.bankDetails.bankName && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Bank:</span>
                    <span className="text-white">{pricing.bankDetails.bankName}</span>
                  </div>
                )}
                {pricing.bankDetails.accountName && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Account:</span>
                    <span className="text-white">{pricing.bankDetails.accountName}</span>
                  </div>
                )}
                {pricing.bankDetails.accountNumber && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Number:</span>
                    <span className="text-white font-mono">{pricing.bankDetails.accountNumber}</span>
                  </div>
                )}
                {pricing.bankDetails.reference && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Reference:</span>
                    <span className="text-white">{pricing.bankDetails.reference}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ============================================
  // RENDER - CONFIRM STEP
  // ============================================

  const renderConfirmStep = () => (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <h3 className="font-semibold text-white mb-3">Registration Summary</h3>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">League:</span>
            <span className="text-white">{league.name}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-400">Type:</span>
            <span className="text-white capitalize">{league.type}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-400">Format:</span>
            <span className="text-white capitalize">{league.format.replace('_', ' ')}</span>
          </div>

          {isDoubles && partnerSelection && (
            <div className="flex justify-between">
              <span className="text-gray-400">Partner:</span>
              <span className="text-white">
                {partnerSelection.mode === 'open_team'
                  ? 'Looking for partner'
                  : partnerSelection.mode === 'join_open'
                  ? `Joining ${partnerSelection.openTeamOwnerName}'s team`
                  : partnerSelection.partnerName || 'Not selected'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Mode-specific messages */}
      {isDoubles && partnerSelection?.mode === 'invite' && (
        <div className="bg-lime-900/20 border border-lime-700 rounded-lg p-3">
          <p className="text-lime-300 text-sm">
            Your partner will receive an invitation. Your team will show as "Pending Partner" until they accept.
          </p>
        </div>
      )}

      {isDoubles && partnerSelection?.mode === 'open_team' && (
        <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-3">
          <p className="text-blue-300 text-sm">
            You'll be registered as an open team. The first eligible player who joins will automatically become your partner.
          </p>
        </div>
      )}

      {isDoubles && partnerSelection?.mode === 'join_open' && (
        <div className="bg-lime-900/20 border border-lime-700 rounded-lg p-3">
          <p className="text-lime-300 text-sm">
            You will be automatically partnered with {partnerSelection.openTeamOwnerName}. Open teams accept all eligible players.
          </p>
        </div>
      )}

      {/* Payment Section (V07.53) */}
      {renderPaymentSection()}

      {/* Bank transfer pending notice */}
      {selectedPaymentMethod === 'bank_transfer' && !isFreeRegistration && (
        <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-3">
          <p className="text-yellow-300 text-sm">
            Your registration will be marked as "Pending Payment" until the organizer confirms receipt of your bank transfer.
          </p>
        </div>
      )}
    </div>
  );

  const renderCurrentStep = () => {
    // For doubles, step 1 is partner selection using DoublesPartnerFlow
    if (isDoubles && step === 1) {
      return (
        <DoublesPartnerFlow
          league={league}
          onPartnerSelected={handlePartnerSelected}
          onBack={onClose}
          onlyJoinOpen={onlyJoinOpen}
        />
      );
    }
    return renderConfirmStep();
  };

  const getStepTitle = () => {
    if (isDoubles && step === 1) return 'Partner Selection';
    return 'Confirm Registration';
  };

  // For doubles step 1, DoublesPartnerFlow handles its own navigation
  const showFooter = !(isDoubles && step === 1);

  // Button text
  const getSubmitButtonText = () => {
    if (loading) return 'Processing...';
    if (isFreeRegistration) return 'Join League';
    if (selectedPaymentMethod === 'stripe') return 'Continue to Payment';
    if (selectedPaymentMethod === 'bank_transfer') return 'Join League';
    return 'Join League';
  };

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
      {/* DUPR Required Modal */}
      {showDuprRequiredModal && (
        <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-[70] rounded-lg p-4 backdrop-blur-sm">
          <div className="bg-gray-800 p-6 rounded-lg border border-lime-500/50 shadow-2xl max-w-md w-full text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-lime-500/20 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-lime-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">DUPR Account Required</h3>
            <p className="text-gray-300 mb-4 text-sm">
              This league requires a linked DUPR account for match result submissions. Please link your DUPR account to continue with registration.
            </p>

            {duprLinking ? (
              <div className="py-8">
                <div className="animate-spin w-8 h-8 border-2 border-lime-500 border-t-transparent rounded-full mx-auto mb-3"></div>
                <p className="text-gray-400 text-sm">Linking your DUPR account...</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-gray-900 rounded-lg p-2 border border-gray-700">
                  <iframe
                    src={getDuprLoginIframeUrl()}
                    className="w-full h-[400px] rounded"
                    title="Link DUPR Account"
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Sign in with your DUPR credentials above to link your account.
                </p>
              </div>
            )}

            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium transition-colors"
            >
              Cancel Registration
            </button>
          </div>
        </div>
      )}

      {/* DUPR+ Verification Modal (V07.50) */}
      {showDuprPlusModal && (
        <DuprPlusVerificationModal
          onClose={() => setShowDuprPlusModal(false)}
          onVerified={handleDuprPlusVerified}
        />
      )}

      <div className="bg-gray-800 w-full max-w-lg rounded-xl border border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="bg-gray-900 px-6 py-4 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">Join {league.name}</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Progress - only show when not on partner selection step */}
          {totalSteps > 1 && !(isDoubles && step === 1) && (
            <>
              <div className="flex items-center gap-2 mt-3">
                {Array.from({ length: totalSteps }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded ${
                      i < step ? 'bg-lime-500' : 'bg-gray-700'
                    }`}
                  />
                ))}
              </div>
              <div className="text-sm text-gray-400 mt-2">
                Step {step} of {totalSteps}: {getStepTitle()}
              </div>
            </>
          )}
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {error && (
            <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          {renderCurrentStep()}
        </div>

        {/* Footer - hide during partner selection (DoublesPartnerFlow has its own) */}
        {showFooter && (
          <div className="bg-gray-900 px-6 py-4 border-t border-gray-700 flex justify-between">
            <button
              onClick={handleBack}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              Back
            </button>

            <button
              onClick={handleNext}
              disabled={!canProceed() || loading}
              className="px-6 py-2 bg-lime-600 hover:bg-lime-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-colors"
            >
              {getSubmitButtonText()}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LeagueRegistrationWizard;
