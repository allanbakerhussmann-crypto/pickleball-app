/**
 * JoinMeetupModal Component
 *
 * Modal for players to join a weekly meetup with either:
 * - Season Pass: All remaining sessions for a discounted price
 * - Pick-and-Pay: Select specific sessions to attend
 *
 * Handles payment method selection (Stripe/Bank Transfer) and
 * calls the standingMeetup_register Cloud Function.
 *
 * @version 07.58
 * @file components/clubs/JoinMeetupModal.tsx
 */

import React, { useState, useMemo, useEffect } from 'react';
import { httpsCallable, getFunctions, connectFunctionsEmulator } from '@firebase/functions';
import { getApp } from '@firebase/app';
import { collection, query, where, getDocs } from '@firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import type { StandingMeetup, MeetupOccurrence, StandingMeetupRegistration } from '../../types/standingMeetup';
import { formatTime } from '../../utils/timeFormat';
import { ModalShell } from '../shared/ModalShell';

// Get functions instance for us-central1 region (registration functions deployed there)
const functionsUS = getFunctions(getApp(), 'us-central1');

// Connect to emulator if in development mode
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  try {
    connectFunctionsEmulator(functionsUS, '127.0.0.1', 5001);
  } catch {
    // Already connected, ignore
  }
}

interface JoinMeetupModalProps {
  meetup: StandingMeetup;
  occurrences: MeetupOccurrence[];
  registrationType: 'season_pass' | 'pick_and_pay';
  onClose: () => void;
  onSuccess?: () => void;
  /** User's existing registration for this meetup (if any) */
  existingRegistration?: StandingMeetupRegistration | null;
}

interface RegisterInput {
  standingMeetupId: string;
  registrationType: 'season_pass' | 'pick_and_pay';
  selectedSessionIds?: string[];
  paymentMethod: 'stripe' | 'bank_transfer';
  returnUrl?: string;
}

interface RegisterOutput {
  checkoutUrl?: string;
  registrationId?: string;
  bankDetails?: {
    bankName: string;
    accountName: string;
    accountNumber: string;
    reference?: string;
  };
}

export const JoinMeetupModal: React.FC<JoinMeetupModalProps> = ({
  meetup,
  occurrences,
  registrationType,
  onClose,
  onSuccess,
  existingRegistration,
}) => {
  const { currentUser } = useAuth();

  // Session selection (for pick_and_pay)
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());

  // State for database-loaded registrations (more accurate than prop)
  const [loadedRegistrations, setLoadedRegistrations] = useState<StandingMeetupRegistration[]>([]);
  const [registrationsLoaded, setRegistrationsLoaded] = useState(false);

  // Debug: Log existing registration prop and occurrence IDs
  useEffect(() => {
    console.log('[JoinMeetupModal] existingRegistration prop:', existingRegistration);
    if (existingRegistration?.selectedSessionIds) {
      console.log('[JoinMeetupModal] Prop selectedSessionIds:', existingRegistration.selectedSessionIds);
    }
    // Log occurrence IDs for comparison
    console.log('[JoinMeetupModal] Occurrence IDs:', occurrences.map(o => o.id));
  }, [existingRegistration, occurrences]);

  // Query database directly for accurate registration data on mount
  // Uses a simpler query that doesn't require a composite index
  useEffect(() => {
    const loadRegistrations = async () => {
      if (!currentUser?.uid) {
        setRegistrationsLoaded(true);
        return;
      }

      try {
        // Simple query by odUserId only (index exists for this)
        // Then filter client-side for this specific meetup
        const q = query(
          collection(db, 'standingMeetupRegistrations'),
          where('odUserId', '==', currentUser.uid),
          where('status', '==', 'active')
        );

        const snapshot = await getDocs(q);
        const allUserRegistrations = snapshot.docs.map(
          (docSnap) => ({ id: docSnap.id, ...docSnap.data() } as StandingMeetupRegistration)
        );

        // Filter to only this meetup
        const registrations = allUserRegistrations.filter(
          (reg) => reg.standingMeetupId === meetup.id
        );

        console.log('[JoinMeetupModal] Loaded registrations from DB:', registrations.length, registrations);
        if (registrations.length > 0) {
          console.log('[JoinMeetupModal] First registration selectedSessionIds:', registrations[0].selectedSessionIds);
        }
        setLoadedRegistrations(registrations);
      } catch (err: any) {
        console.error('Failed to load registrations:', err);
        // Fall back to prop data if query fails
      } finally {
        setRegistrationsLoaded(true);
      }
    };

    loadRegistrations();
  }, [meetup.id, currentUser?.uid]);

  // Get already registered session IDs from database (combining all registrations)
  // IMPORTANT: Merge database data with prop data to prevent double-booking
  const alreadyRegisteredSessionIds = useMemo(() => {
    const sessionIds = new Set<string>();

    // 1. Add sessions from database query (if any found)
    if (loadedRegistrations.length > 0) {
      // Check for season pass first
      const seasonPass = loadedRegistrations.find(r => r.registrationType === 'season_pass');
      if (seasonPass) {
        // Season pass = ALL sessions
        occurrences.forEach(o => sessionIds.add(o.id));
        return sessionIds;
      }

      // Add all selectedSessionIds from all pick_and_pay registrations
      loadedRegistrations.forEach(reg => {
        (reg.selectedSessionIds || []).forEach(id => sessionIds.add(id));
      });
    }

    // 2. ALSO add sessions from prop (in case query failed or missed some)
    // This prevents double-booking even if the index query fails
    if (existingRegistration && existingRegistration.status === 'active') {
      if (existingRegistration.registrationType === 'season_pass') {
        // Season pass = ALL sessions
        occurrences.forEach(o => sessionIds.add(o.id));
        return sessionIds;
      }
      // Add prop's selectedSessionIds (includes combined paidSessionIds + pendingSessionIds)
      (existingRegistration.selectedSessionIds || []).forEach(id => sessionIds.add(id));
      // Also add from paidSessionIds/pendingSessionIds if available (combined registration)
      (existingRegistration.paidSessionIds || []).forEach(id => sessionIds.add(id));
      (existingRegistration.pendingSessionIds || []).forEach(id => sessionIds.add(id));
    }

    return sessionIds;
  }, [loadedRegistrations, existingRegistration, occurrences]);

  // Check if user has a season pass (blocks all new registrations)
  // Check BOTH database and prop to prevent issues if query fails
  const hasSeasonPass = useMemo(() => {
    // Check database data
    if (loadedRegistrations.some(r => r.registrationType === 'season_pass')) {
      return true;
    }
    // Also check prop
    return existingRegistration?.status === 'active' &&
      existingRegistration?.registrationType === 'season_pass';
  }, [loadedRegistrations, existingRegistration]);

  // Payment state
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'bank_transfer'>('stripe');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bank transfer success state
  const [bankTransferSuccess, setBankTransferSuccess] = useState(false);
  const [bankDetails, setBankDetails] = useState<RegisterOutput['bankDetails'] | null>(null);

  // Check which payment methods are enabled
  const stripeEnabled = meetup.paymentMethods?.acceptCardPayments ?? true;
  const bankEnabled = meetup.paymentMethods?.acceptBankTransfer ?? false;

  // Set default payment method based on availability
  useState(() => {
    if (!stripeEnabled && bankEnabled) {
      setPaymentMethod('bank_transfer');
    }
  });

  // Currency formatter
  const formatCurrency = (cents: number): string => {
    const currency = meetup.billing.currency || 'nzd';
    const symbol = currency === 'usd' ? 'US$' : currency === 'aud' ? 'A$' : '$';
    return `${symbol}${(cents / 100).toFixed(2)}`;
  };

  // Filter occurrences to only show scheduled future sessions
  const availableOccurrences = useMemo(() => {
    const now = Date.now();
    return occurrences.filter(
      (o) => o.status === 'scheduled' && o.startAt >= now
    );
  }, [occurrences]);

  // Calculate total amount based on registration type and selection
  // Note: For backwards compatibility, fall back to billing.amount if perSessionAmount not set
  const perSessionPrice = meetup.billing.perSessionAmount || meetup.billing.amount || 0;

  const totalAmount = useMemo(() => {
    if (registrationType === 'season_pass') {
      return meetup.billing.amount;
    } else {
      return perSessionPrice * selectedSessions.size;
    }
  }, [registrationType, meetup.billing.amount, perSessionPrice, selectedSessions.size]);

  // Format occurrence date for display
  const formatOccurrenceDate = (occ: MeetupOccurrence) => {
    const date = new Date(occ.date + 'T00:00:00');
    return date.toLocaleDateString('en-NZ', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  // Check if a session is full
  const isSessionFull = (occ: MeetupOccurrence) => {
    const spotsLeft = meetup.maxPlayers - (occ.expectedCount || 0);
    return spotsLeft <= 0;
  };

  // Check if user is already registered for a session
  const isAlreadyRegistered = (sessionId: string) => {
    return alreadyRegisteredSessionIds.has(sessionId);
  };

  // Toggle session selection
  const toggleSession = (sessionId: string) => {
    const newSet = new Set(selectedSessions);
    if (newSet.has(sessionId)) {
      newSet.delete(sessionId);
    } else {
      newSet.add(sessionId);
    }
    setSelectedSessions(newSet);
  };

  // Select all available sessions (excluding already registered ones)
  const selectAllSessions = () => {
    const availableIds = availableOccurrences
      .filter((o) => !isSessionFull(o) && !isAlreadyRegistered(o.id))
      .map((o) => o.id);
    setSelectedSessions(new Set(availableIds));
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedSessions(new Set());
  };

  // Handle registration
  const handleRegister = async () => {
    setProcessing(true);
    setError(null);

    try {
      // Validation
      if (registrationType === 'pick_and_pay' && selectedSessions.size === 0) {
        throw new Error('Please select at least one session');
      }

      const registerFn = httpsCallable<RegisterInput, RegisterOutput>(
        functionsUS,
        'standingMeetup_register'
      );

      const input: RegisterInput = {
        standingMeetupId: meetup.id,
        registrationType,
        paymentMethod,
        returnUrl: window.location.href,
      };

      if (registrationType === 'pick_and_pay') {
        input.selectedSessionIds = Array.from(selectedSessions);
      }

      const result = await registerFn(input);

      if (paymentMethod === 'stripe' && result.data.checkoutUrl) {
        // Redirect to Stripe Checkout
        window.location.href = result.data.checkoutUrl;
      } else if (paymentMethod === 'bank_transfer' && result.data.bankDetails) {
        // Show bank transfer details
        setBankDetails(result.data.bankDetails);
        setBankTransferSuccess(true);
        onSuccess?.();
      }
    } catch (err: any) {
      console.error('Registration error:', err);

      // Parse error message
      let errorMessage = err.message || 'Failed to register';

      if (errorMessage.includes('ALREADY_REGISTERED')) {
        errorMessage = 'You are already registered for this meetup';
      } else if (errorMessage.includes('MEETUP_NOT_ACTIVE')) {
        errorMessage = 'This meetup is no longer accepting registrations';
      } else if (errorMessage.includes('SESSIONS_FULL')) {
        const sessionId = errorMessage.split(':')[1];
        errorMessage = `Session ${sessionId} is now full. Please deselect it and try again.`;
      } else if (errorMessage.includes('PAYMENT_METHOD_NOT_ENABLED')) {
        errorMessage = 'This payment method is not enabled for this meetup';
      } else if (errorMessage.includes('NO_SESSIONS_AVAILABLE')) {
        errorMessage = 'No sessions are available for registration';
      } else if (errorMessage.includes('ORGANIZER_STRIPE_NOT_CONFIGURED')) {
        errorMessage = 'Card payments are not available. The organizer has not completed Stripe setup. Please use Bank Transfer instead.';
      }

      setError(errorMessage);
    } finally {
      setProcessing(false);
    }
  };

  // Bank Transfer Success View
  if (bankTransferSuccess && bankDetails) {
    return (
      <ModalShell isOpen={true} onClose={onClose}>
          <div className="p-6">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-green-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white">Registration Submitted!</h3>
            <p className="text-gray-400 mt-2">
              Please complete your bank transfer to confirm your spot.
            </p>
          </div>

          <div className="bg-gray-900/50 rounded-lg p-4 space-y-3 mb-6">
            <h4 className="text-sm font-semibold text-white mb-3">Bank Details</h4>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Bank:</span>
              <span className="text-white">{bankDetails.bankName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Account Name:</span>
              <span className="text-white">{bankDetails.accountName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Account Number:</span>
              <span className="text-white font-mono">{bankDetails.accountNumber}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Reference:</span>
              <span className="text-lime-400 font-mono">{bankDetails.reference}</span>
            </div>
            <div className="flex justify-between text-sm pt-2 border-t border-gray-700">
              <span className="text-gray-400">Amount:</span>
              <span className="text-white font-bold">{formatCurrency(totalAmount)}</span>
            </div>
          </div>

          <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3 mb-6">
            <p className="text-yellow-400 text-sm">
              <strong>Important:</strong> Your registration is pending until payment is confirmed by the organizer.
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-full bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-semibold transition-colors"
          >
            Done
          </button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell isOpen={true} onClose={onClose} maxWidth="max-w-lg" className="flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-white">
              {registrationType === 'season_pass' ? 'Get Season Pass' : 'Select Sessions'}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-gray-400 text-sm mt-1">{meetup.title}</p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Loading State */}
          {!registrationsLoaded && (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-lime-500/30 border-t-lime-500 rounded-full animate-spin"></div>
              <span className="ml-3 text-gray-400">Loading...</span>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Season Pass Summary */}
          {registrationsLoaded && registrationType === 'season_pass' && (
            <div className="mb-6">
              {hasSeasonPass ? (
                <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-green-400 font-semibold">You have a Season Pass!</span>
                  </div>
                  <p className="text-gray-300 text-sm">
                    You're already registered for all sessions with your Season Pass.
                  </p>
                </div>
              ) : (
                <div className="bg-lime-900/20 border border-lime-700/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lime-400 text-lg">⭐</span>
                    <span className="text-white font-semibold">Season Pass</span>
                  </div>
                  <p className="text-gray-300 text-sm mb-2">
                    Access to all <strong>{availableOccurrences.length}</strong> remaining sessions
                  </p>
                  <p className="text-lime-400 text-2xl font-bold">
                    {formatCurrency(meetup.billing.amount)}
                  </p>
                  {availableOccurrences.length > 0 && (
                    <p className="text-gray-500 text-sm mt-1">
                      That's {formatCurrency(Math.round(meetup.billing.amount / availableOccurrences.length))}/session
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Pick-and-Pay Session Selection */}
          {registrationsLoaded && registrationType === 'pick_and_pay' && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-white">Select Sessions</h4>
                <div className="flex gap-2">
                  <button
                    onClick={selectAllSessions}
                    className="text-xs text-lime-400 hover:text-lime-300"
                  >
                    Select All
                  </button>
                  <span className="text-gray-600">|</span>
                  <button
                    onClick={clearSelection}
                    className="text-xs text-gray-400 hover:text-gray-300"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                {availableOccurrences.map((occ) => {
                  const isFull = isSessionFull(occ);
                  const isRegistered = isAlreadyRegistered(occ.id);
                  const isDisabled = isFull || isRegistered;
                  const spotsLeft = meetup.maxPlayers - (occ.expectedCount || 0);

                  return (
                    <label
                      key={occ.id}
                      className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                        isDisabled
                          ? 'bg-gray-900/30 border-gray-700 cursor-not-allowed'
                          : selectedSessions.has(occ.id)
                          ? 'bg-lime-500/10 border-lime-500/50 cursor-pointer'
                          : 'bg-gray-900/50 border-gray-700 hover:border-gray-600 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {isRegistered ? (
                          // Show checkmark icon for already registered sessions
                          <div className="w-5 h-5 rounded bg-green-600 flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        ) : (
                          <input
                            type="checkbox"
                            checked={selectedSessions.has(occ.id)}
                            onChange={() => !isDisabled && toggleSession(occ.id)}
                            disabled={isDisabled}
                            className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-lime-500 focus:ring-lime-500 focus:ring-offset-0 disabled:opacity-50"
                          />
                        )}
                        <div>
                          <p className={`text-sm font-medium ${isRegistered ? 'text-green-400' : 'text-white'}`}>
                            {formatOccurrenceDate(occ)}
                          </p>
                          <p className="text-gray-500 text-xs">
                            {formatTime(occ.startTime)} - {formatTime(occ.endTime)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        {isRegistered ? (
                          <span className="text-green-400 text-xs font-medium bg-green-500/20 px-2 py-0.5 rounded-full">
                            Registered
                          </span>
                        ) : isFull ? (
                          <span className="text-red-400 text-xs font-medium">FULL</span>
                        ) : (
                          <>
                            <span className="text-gray-400 text-xs">{spotsLeft} spots</span>
                            <p className="text-white text-sm font-medium">
                              {formatCurrency(meetup.billing.perSessionAmount || 0)}
                            </p>
                          </>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>

              {selectedSessions.size > 0 && (
                <div className="mt-4 p-3 bg-gray-900/50 rounded-lg flex items-center justify-between">
                  <span className="text-gray-400 text-sm">
                    {selectedSessions.size} session{selectedSessions.size !== 1 ? 's' : ''} selected
                  </span>
                  <span className="text-white font-bold">
                    {formatCurrency(totalAmount)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Payment Method Selection */}
          {registrationsLoaded && (
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-white mb-3">Payment Method</h4>
            <div className="space-y-2">
              {stripeEnabled && (
                <label
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    paymentMethod === 'stripe'
                      ? 'bg-blue-500/10 border-blue-500/50'
                      : 'bg-gray-900/50 border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="stripe"
                    checked={paymentMethod === 'stripe'}
                    onChange={() => setPaymentMethod('stripe')}
                    className="w-4 h-4 text-blue-500 border-gray-600 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <p className="text-white text-sm font-medium">Pay Online (Card)</p>
                    <p className="text-gray-500 text-xs">Secure payment via Stripe</p>
                  </div>
                  <svg className="w-8 h-8 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/>
                  </svg>
                </label>
              )}

              {bankEnabled && (
                <label
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    paymentMethod === 'bank_transfer'
                      ? 'bg-green-500/10 border-green-500/50'
                      : 'bg-gray-900/50 border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="bank_transfer"
                    checked={paymentMethod === 'bank_transfer'}
                    onChange={() => setPaymentMethod('bank_transfer')}
                    className="w-4 h-4 text-green-500 border-gray-600 focus:ring-green-500"
                  />
                  <div className="flex-1">
                    <p className="text-white text-sm font-medium">Bank Transfer</p>
                    <p className="text-gray-500 text-xs">Manual payment - organizer confirms</p>
                  </div>
                  <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </label>
              )}
            </div>
          </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-700 bg-gray-800">
          <div className="flex items-center justify-between mb-4">
            <span className="text-gray-400">Total</span>
            <span className="text-white text-xl font-bold">{formatCurrency(totalAmount)}</span>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleRegister}
              disabled={
                processing ||
                hasSeasonPass ||
                (registrationType === 'pick_and_pay' && selectedSessions.size === 0)
              }
              className="flex-1 bg-lime-600 hover:bg-lime-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {processing ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Processing...
                </>
              ) : hasSeasonPass ? (
                'Already Registered'
              ) : paymentMethod === 'stripe' ? (
                `Pay ${formatCurrency(totalAmount)}`
              ) : (
                'Submit Registration'
              )}
            </button>
          </div>
        </div>
      </ModalShell>
  );
};

export default JoinMeetupModal;
