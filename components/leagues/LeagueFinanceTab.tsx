/**
 * LeagueFinanceTab Component
 *
 * Finance management tab for league organizers.
 * Shows payment status of all members and allows marking bank transfers as paid.
 *
 * Features:
 * - Payment summary (total collected, pending, etc.)
 * - List of members with payment status badges
 * - "Mark as Paid" button for pending bank transfers
 * - Payment method settings (Stripe / Bank Transfer)
 *
 * FILE LOCATION: components/leagues/LeagueFinanceTab.tsx
 * VERSION: V07.53
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  markMemberAsPaid,
  getMemberPaymentStatus,
  getPartnerPaymentStatus,
  updateLeague,
} from '../../services/firebase';
import { getAccountStatusV2 } from '../../services/stripe';
import type { League, LeagueMember, BankDetails, UserProfile } from '../../types';
import { PaymentMethodsPanel, PendingPaymentsList } from '../payments';

// ============================================
// TYPES
// ============================================

interface LeagueFinanceTabProps {
  league: League;
  members: LeagueMember[];
  currentUserId: string;
  userProfile?: UserProfile | null;
  onLeagueUpdate?: (updatedLeague: Partial<League>) => void;
}

// ============================================
// HELPERS
// ============================================

const formatCents = (cents: number): string => {
  return `$${(cents / 100).toFixed(2)}`;
};

const getStatusBadge = (status: string, method?: string) => {
  switch (status) {
    case 'paid':
      return (
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          method === 'stripe'
            ? 'bg-green-500/20 text-green-400'
            : 'bg-blue-500/20 text-blue-400'
        }`}>
          {method === 'stripe' ? 'Paid (Card)' : 'Paid (Manual)'}
        </span>
      );
    case 'pending':
      return (
        <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-500/20 text-yellow-400">
          Pending
        </span>
      );
    case 'not_required':
      return (
        <span className="px-2 py-1 rounded text-xs font-medium bg-gray-500/20 text-gray-400">
          Free
        </span>
      );
    case 'refunded':
      return (
        <span className="px-2 py-1 rounded text-xs font-medium bg-purple-500/20 text-purple-400">
          Refunded
        </span>
      );
    case 'failed':
      return (
        <span className="px-2 py-1 rounded text-xs font-medium bg-red-500/20 text-red-400">
          Failed
        </span>
      );
    default:
      return (
        <span className="px-2 py-1 rounded text-xs font-medium bg-gray-500/20 text-gray-400">
          Unknown
        </span>
      );
  }
};

// ============================================
// COMPONENT
// ============================================

export const LeagueFinanceTab: React.FC<LeagueFinanceTabProps> = ({
  league,
  members,
  currentUserId: _currentUserId,
  userProfile,
  onLeagueUpdate,
}) => {
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [updatingStripeAccount, setUpdatingStripeAccount] = useState(false);
  const [stripeAccountStatus, setStripeAccountStatus] = useState<'checking' | 'valid' | 'invalid' | 'mismatch' | 'none'>('checking');
  const [stripeStatusMessage, setStripeStatusMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Payment Settings state
  const [allowStripe, setAllowStripe] = useState(league.pricing?.allowStripe ?? true);
  const [allowBankTransfer, setAllowBankTransfer] = useState(league.pricing?.allowBankTransfer ?? false);
  const [showBankDetails, setShowBankDetails] = useState(league.pricing?.showBankDetails ?? true);
  const [bankDetails, setBankDetails] = useState<BankDetails>({
    bankName: league.pricing?.bankDetails?.bankName || '',
    accountName: league.pricing?.bankDetails?.accountName || '',
    accountNumber: league.pricing?.bankDetails?.accountNumber || '',
    reference: league.pricing?.bankDetails?.reference || '',
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsChanged, setSettingsChanged] = useState(false);

  // Track changes to settings
  useEffect(() => {
    const originalStripe = league.pricing?.allowStripe ?? true;
    const originalBank = league.pricing?.allowBankTransfer ?? false;
    const originalShowBank = league.pricing?.showBankDetails ?? true;
    const originalBankDetails = league.pricing?.bankDetails || {};

    const hasChanges =
      allowStripe !== originalStripe ||
      allowBankTransfer !== originalBank ||
      showBankDetails !== originalShowBank ||
      bankDetails.bankName !== (originalBankDetails.bankName || '') ||
      bankDetails.accountName !== (originalBankDetails.accountName || '') ||
      bankDetails.accountNumber !== (originalBankDetails.accountNumber || '') ||
      bankDetails.reference !== (originalBankDetails.reference || '');

    setSettingsChanged(hasChanges);
  }, [allowStripe, allowBankTransfer, showBankDetails, bankDetails, league.pricing]);

  // Check Stripe account status
  useEffect(() => {
    const checkStripeAccount = async () => {
      const leagueAccountId = league.organizerStripeAccountId;
      const userAccountId = userProfile?.stripeConnectedAccountId;

      // No Stripe account on league
      if (!leagueAccountId) {
        if (userAccountId) {
          setStripeAccountStatus('none');
          setStripeStatusMessage('No Stripe account linked to this league. Click below to add your connected account.');
        } else {
          setStripeAccountStatus('none');
          setStripeStatusMessage('No Stripe account linked. Set up Stripe Connect in your profile to accept card payments.');
        }
        return;
      }

      // Check if account is different from user's current account
      if (userAccountId && leagueAccountId !== userAccountId) {
        setStripeAccountStatus('mismatch');
        setStripeStatusMessage('This league uses a different Stripe account than your current one. Click below to update to your current account.');
        return;
      }

      // Verify the account is valid
      try {
        const status = await getAccountStatusV2(leagueAccountId);
        if (status.readyToProcessPayments) {
          setStripeAccountStatus('valid');
          setStripeStatusMessage('Stripe account connected and ready to process payments');
        } else {
          setStripeAccountStatus('invalid');
          setStripeStatusMessage('Stripe account needs attention - onboarding may be incomplete');
        }
      } catch (err: any) {
        // Check for test-mode error
        if (err.message?.includes('test') || err.message?.includes('testmode')) {
          setStripeAccountStatus('invalid');
          setStripeStatusMessage('This league has a test-mode Stripe account. Please update to your live account.');
        } else {
          setStripeAccountStatus('invalid');
          setStripeStatusMessage(`Unable to verify Stripe account: ${err.message}`);
        }
      }
    };

    checkStripeAccount();
  }, [league.organizerStripeAccountId, userProfile?.stripeConnectedAccountId]);

  // Update league Stripe account to user's current account
  const handleUpdateStripeAccount = async () => {
    if (!userProfile?.stripeConnectedAccountId) {
      setError('You need to connect a Stripe account in your profile first');
      return;
    }

    setUpdatingStripeAccount(true);
    setError(null);

    try {
      await updateLeague(league.id, {
        organizerStripeAccountId: userProfile.stripeConnectedAccountId,
      });

      if (onLeagueUpdate) {
        onLeagueUpdate({ organizerStripeAccountId: userProfile.stripeConnectedAccountId });
      }

      setStripeAccountStatus('valid');
      setStripeStatusMessage('Stripe account updated successfully');
      setSuccessMessage('Stripe account updated successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      console.error('Failed to update Stripe account:', err);
      setError(err.message || 'Failed to update Stripe account');
    } finally {
      setUpdatingStripeAccount(false);
    }
  };

  // Save payment settings
  const handleSaveSettings = async () => {
    setSavingSettings(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const updatedPricing = {
        ...league.pricing!,
        allowStripe,
        allowBankTransfer,
        showBankDetails,
        bankDetails: allowBankTransfer ? {
          bankName: bankDetails.bankName,
          accountName: bankDetails.accountName,
          accountNumber: bankDetails.accountNumber,
          reference: bankDetails.reference,
        } : undefined,
      };

      await updateLeague(league.id, {
        pricing: updatedPricing,
      });

      // Notify parent of the update so the registration wizard gets updated data
      if (onLeagueUpdate) {
        onLeagueUpdate({ pricing: updatedPricing });
      }

      setSuccessMessage('Payment settings saved successfully');
      setSettingsChanged(false);
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      console.error('Failed to save payment settings:', err);
      setError(err.message || 'Failed to save payment settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const pricing = league.pricing;
  const entryFee = pricing?.entryFee || 0;
  const isPerPlayer = pricing?.entryFeeType === 'per_player';
  const isDoubles = league.type === 'doubles';

  // Calculate payment summary
  const summary = useMemo(() => {
    let paidStripe = 0;
    let paidManual = 0;
    let pending = 0;
    let free = 0;
    let paidStripeAmount = 0;
    let paidManualAmount = 0;
    let pendingAmount = 0;

    members.forEach(member => {
      const status = getMemberPaymentStatus(member);
      const method = member.payment?.method;
      const amount = member.payment?.amountDue || member.amountPaid || entryFee;

      if (status === 'paid') {
        if (method === 'stripe') {
          paidStripe++;
          paidStripeAmount += member.payment?.amountPaid || amount;
        } else {
          paidManual++;
          paidManualAmount += member.payment?.amountPaid || amount;
        }
      } else if (status === 'pending') {
        pending++;
        pendingAmount += amount;
      } else if (status === 'not_required') {
        free++;
      }

      // For per_player doubles, also count partner payments
      if (isDoubles && isPerPlayer && member.partnerUserId) {
        const partnerStatus = getPartnerPaymentStatus(member);
        const partnerMethod = member.partnerPayment?.method;
        const partnerAmount = member.partnerPayment?.amountDue || entryFee;

        if (partnerStatus === 'paid') {
          if (partnerMethod === 'stripe') {
            paidStripe++;
            paidStripeAmount += member.partnerPayment?.amountPaid || partnerAmount;
          } else {
            paidManual++;
            paidManualAmount += member.partnerPayment?.amountPaid || partnerAmount;
          }
        } else if (partnerStatus === 'pending') {
          pending++;
          pendingAmount += partnerAmount;
        } else if (partnerStatus === 'not_required') {
          free++;
        }
      }
    });

    return {
      paidStripe,
      paidManual,
      pending,
      free,
      total: members.length,
      paidStripeAmount,
      paidManualAmount,
      pendingAmount,
      totalCollected: paidStripeAmount + paidManualAmount,
    };
  }, [members, entryFee, isDoubles, isPerPlayer]);

  // Handle marking a member as paid
  const handleMarkAsPaid = async (
    memberId: string,
    slot: 'primary' | 'partner',
    amount: number
  ) => {
    const key = `${memberId}-${slot}`;
    setMarkingPaid(key);
    setError(null);

    try {
      await markMemberAsPaid(league.id, memberId, amount, slot);
    } catch (err: any) {
      console.error('Failed to mark as paid:', err);
      setError(err.message || 'Failed to mark as paid');
    } finally {
      setMarkingPaid(null);
    }
  };

  // Filter pending members for easy action
  const pendingMembers = useMemo(() => {
    const result: Array<{
      member: LeagueMember;
      slot: 'primary' | 'partner';
      displayName: string;
      amount: number;
      reference?: string;
    }> = [];

    members.forEach(member => {
      const status = getMemberPaymentStatus(member);
      if (status === 'pending') {
        result.push({
          member,
          slot: 'primary',
          displayName: member.displayName,
          amount: member.payment?.amountDue || entryFee,
          reference: member.payment?.bankTransferReference,
        });
      }

      // For per_player doubles, check partner payment too
      if (isDoubles && isPerPlayer && member.partnerUserId) {
        const partnerStatus = getPartnerPaymentStatus(member);
        if (partnerStatus === 'pending') {
          result.push({
            member,
            slot: 'partner',
            displayName: member.partnerDisplayName || 'Partner',
            amount: member.partnerPayment?.amountDue || entryFee,
            reference: member.partnerPayment?.bankTransferReference,
          });
        }
      }
    });

    return result;
  }, [members, entryFee, isDoubles, isPerPlayer]);

  return (
    <div className="space-y-6">
      {/* Error display */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Success display */}
      {successMessage && (
        <div className="bg-green-900/30 border border-green-700 text-green-300 px-4 py-3 rounded-lg">
          {successMessage}
        </div>
      )}

      {/* Payment Settings Section - Using shared component */}
      {pricing && pricing.paymentMode !== 'free' && (
        <PaymentMethodsPanel
          acceptCardPayments={allowStripe}
          setAcceptCardPayments={setAllowStripe}
          acceptBankTransfer={allowBankTransfer}
          setAcceptBankTransfer={setAllowBankTransfer}
          bankDetails={bankDetails}
          setBankDetails={setBankDetails}
          showBankDetails={showBankDetails}
          setShowBankDetails={setShowBankDetails}
          onSave={handleSaveSettings}
          saving={savingSettings}
          hasChanges={settingsChanged}
        />
      )}

      {/* Stripe Account Status - Show if card payments are enabled */}
      {allowStripe && pricing && pricing.paymentMode !== 'free' && (
        <div className={`bg-gray-800 rounded-xl p-5 border ${
          stripeAccountStatus === 'valid' ? 'border-green-500/30' :
          stripeAccountStatus === 'invalid' || stripeAccountStatus === 'mismatch' ? 'border-yellow-500/30' :
          'border-gray-700'
        }`}>
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#635BFF"/>
              <path d="M12.5 7.5c-1.5 0-2.5.75-3 1.5l-.5 2h5l-.25 1.5h-5l-.75 4h4.5c1.5 0 2.75-.75 3.25-2l.75-4c.5-1.5-.5-3-2.5-3h-1.5z" fill="white"/>
            </svg>
            Stripe Account
          </h3>

          <div className="space-y-3">
            {stripeAccountStatus === 'checking' ? (
              <div className="flex items-center gap-2 text-gray-400">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Checking Stripe account...
              </div>
            ) : stripeAccountStatus === 'valid' ? (
              <div className="flex items-center gap-2 text-green-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {stripeStatusMessage}
              </div>
            ) : (
              <>
                <div className={`flex items-start gap-2 ${
                  stripeAccountStatus === 'none' ? 'text-gray-400' : 'text-yellow-400'
                }`}>
                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{stripeStatusMessage}</span>
                </div>

                {/* Show update button if user has a Stripe account */}
                {userProfile?.stripeConnectedAccountId && (
                  <button
                    onClick={handleUpdateStripeAccount}
                    disabled={updatingStripeAccount}
                    className="mt-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    {updatingStripeAccount ? (
                      <>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Updating...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Update to Current Stripe Account
                      </>
                    )}
                  </button>
                )}

                {/* Link to profile if no Stripe account */}
                {!userProfile?.stripeConnectedAccountId && (
                  <a
                    href="#/profile"
                    className="mt-2 inline-flex items-center gap-2 text-sm text-lime-400 hover:text-lime-300"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Set up Stripe Connect in your profile
                  </a>
                )}
              </>
            )}

            {/* Account ID info (for debugging) */}
            {league.organizerStripeAccountId && stripeAccountStatus !== 'checking' && (
              <div className="text-xs text-gray-500 mt-2">
                Account: {league.organizerStripeAccountId.substring(0, 12)}...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payment Summary - Styled to match Schedule Manager stats */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-white">Payment Summary</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <div className="bg-gray-800/50 rounded-lg p-4 border-l-4 border-blue-500">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total</div>
            <div className="text-2xl font-bold text-blue-400">{summary.total}</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border-l-4 border-green-500">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Paid (Card)</div>
            <div className="text-2xl font-bold text-green-400">{summary.paidStripe}</div>
            <div className="text-xs text-green-400/70 mt-1">{formatCents(summary.paidStripeAmount)}</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border-l-4 border-purple-500">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Paid (Manual)</div>
            <div className="text-2xl font-bold text-purple-400">{summary.paidManual}</div>
            <div className="text-xs text-purple-400/70 mt-1">{formatCents(summary.paidManualAmount)}</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border-l-4 border-yellow-500">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Pending</div>
            <div className="text-2xl font-bold text-yellow-400">{summary.pending}</div>
            <div className="text-xs text-yellow-400/70 mt-1">{formatCents(summary.pendingAmount)}</div>
          </div>
        </div>
        <div className="pt-2 flex justify-between items-center">
          <span className="text-gray-400">Total Collected:</span>
          <span className="text-xl font-bold text-lime-400">{formatCents(summary.totalCollected)}</span>
        </div>
      </div>

      {/* Pending Payments (Action Required) - Using shared component */}
      <PendingPaymentsList
        items={pendingMembers.map(({ member, slot, displayName, amount, reference }) => ({
          id: `${member.id}-${slot}`,
          displayName,
          amount,
          reference,
        }))}
        onMarkAsPaid={async (id, amount) => {
          const [memberId, slot] = id.split('-') as [string, 'primary' | 'partner'];
          await handleMarkAsPaid(memberId, slot, amount);
        }}
        markingPaidId={markingPaid}
        formatCurrency={formatCents}
      />

      {/* All Members Payment Status */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="text-lg font-bold text-white mb-4">All Members</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
                <th className="pb-3">Player</th>
                {isDoubles && <th className="pb-3">Partner</th>}
                <th className="pb-3">Status</th>
                <th className="pb-3 text-right">Amount</th>
                {isDoubles && isPerPlayer && <th className="pb-3">Partner Status</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {members.map(member => {
                const status = getMemberPaymentStatus(member);
                const method = member.payment?.method;
                const amount = member.payment?.amountPaid || member.payment?.amountDue || member.amountPaid || entryFee;
                const partnerStatus = isDoubles && isPerPlayer && member.partnerUserId
                  ? getPartnerPaymentStatus(member)
                  : null;
                const partnerMethod = member.partnerPayment?.method;

                return (
                  <tr key={member.id} className="text-sm">
                    <td className="py-3 text-white">{member.displayName}</td>
                    {isDoubles && (
                      <td className="py-3 text-gray-400">
                        {member.partnerDisplayName || '-'}
                      </td>
                    )}
                    <td className="py-3">{getStatusBadge(status, method)}</td>
                    <td className="py-3 text-right text-gray-300">
                      {status === 'not_required' ? '-' : formatCents(amount)}
                    </td>
                    {isDoubles && isPerPlayer && (
                      <td className="py-3">
                        {partnerStatus ? getStatusBadge(partnerStatus, partnerMethod) : '-'}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Entry Fee Info */}
      {pricing && entryFee > 0 && (
        <div className="bg-gray-700/30 p-4 rounded-lg border border-gray-600 text-sm text-gray-400">
          <strong className="text-white">Entry Fee:</strong> {formatCents(entryFee)}
          {isDoubles && (
            <span className="ml-2">
              ({isPerPlayer ? 'per player' : 'per team'})
            </span>
          )}
          {pricing.earlyBirdEnabled && pricing.earlyBirdFee && (
            <span className="ml-2 text-lime-400">
              (Early bird: {formatCents(pricing.earlyBirdFee)})
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default LeagueFinanceTab;
