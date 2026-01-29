/**
 * EditStandingMeetup Component
 *
 * Modal to edit an existing standing meetup.
 * Pre-populates with current values and allows updating schedule, pricing, payment methods, etc.
 *
 * @version 07.58
 * @file components/clubs/EditStandingMeetup.tsx
 */

import React, { useState, useEffect, useMemo } from 'react';
import { updateStandingMeetup } from '../../services/firebase/standingMeetups';
import type { StandingMeetup } from '../../types/standingMeetup';
import type { BankDetails } from '../../types';
import { PaymentMethodsPanel } from '../payments';
import { ScrollTimePicker } from '../shared/ScrollTimePicker';

interface EditStandingMeetupProps {
  meetup: StandingMeetup;
  onClose: () => void;
  onSuccess: () => void;
}

const DAY_OPTIONS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

const TIMEZONE_OPTIONS = [
  { value: 'Pacific/Auckland', label: 'New Zealand (Auckland)' },
  { value: 'Australia/Sydney', label: 'Australia (Sydney)' },
  { value: 'Australia/Melbourne', label: 'Australia (Melbourne)' },
  { value: 'Australia/Brisbane', label: 'Australia (Brisbane)' },
  { value: 'Australia/Perth', label: 'Australia (Perth)' },
];

export const EditStandingMeetup: React.FC<EditStandingMeetupProps> = ({
  meetup,
  onClose,
  onSuccess,
}) => {
  // Form state - initialize from meetup
  const [title, setTitle] = useState(meetup.title);
  const [description, setDescription] = useState(meetup.description);
  const [locationName, setLocationName] = useState(meetup.locationName);
  const [timezone, setTimezone] = useState(meetup.timezone);
  const [dayOfWeek, setDayOfWeek] = useState<number>(meetup.recurrence.dayOfWeek);
  const [startTime, setStartTime] = useState(meetup.recurrence.startTime);
  const [endTime, setEndTime] = useState(meetup.recurrence.endTime);

  // Duration state
  const [numberOfWeeks, setNumberOfWeeks] = useState(meetup.recurrence.totalSessions || 10);
  const [startDate, setStartDate] = useState(meetup.recurrence.startDate || new Date().toISOString().split('T')[0]);

  const [maxPlayers, setMaxPlayers] = useState(meetup.maxPlayers);

  // Pricing - hybrid model (per-session required, season pass optional)
  const [perSessionAmount, setPerSessionAmount] = useState(
    meetup.billing.perSessionAmount
      ? (meetup.billing.perSessionAmount / 100).toFixed(2)
      : '18.00' // Default if not set (migration)
  );
  const [seasonPassAmount, setSeasonPassAmount] = useState(
    meetup.billing.amount > 0
      ? (meetup.billing.amount / 100).toFixed(2)
      : '' // Empty means not enabled
  );
  const [currency, setCurrency] = useState<'nzd' | 'aud' | 'usd'>(meetup.billing.currency);
  const [feesPaidBy, setFeesPaidBy] = useState<'organizer' | 'player'>(meetup.billing.feesPaidBy);

  // Payment methods state - initialized from meetup
  const [acceptCardPayments, setAcceptCardPayments] = useState(
    meetup.paymentMethods?.acceptCardPayments ?? true
  );
  const [acceptBankTransfer, setAcceptBankTransfer] = useState(
    meetup.paymentMethods?.acceptBankTransfer ?? false
  );
  const [bankDetails, setBankDetails] = useState<BankDetails>({
    bankName: meetup.paymentMethods?.bankDetails?.bankName || '',
    accountName: meetup.paymentMethods?.bankDetails?.accountName || '',
    accountNumber: meetup.paymentMethods?.bankDetails?.accountNumber || '',
    reference: meetup.paymentMethods?.bankDetails?.reference || '',
  });
  const [showBankDetails, setShowBankDetails] = useState(
    meetup.paymentMethods?.bankDetails?.showToPlayers ?? true
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate end date based on start date and number of weeks
  const endDate = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(start);
    end.setDate(start.getDate() + (numberOfWeeks - 1) * 7);
    return end.toISOString().split('T')[0];
  }, [startDate, numberOfWeeks]);

  // Format date for display (e.g., "Mon, Feb 3, 2025")
  const formatDateDisplay = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-NZ', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Get day name
  const getDayName = (day: number): string => {
    return DAY_OPTIONS.find((d) => d.value === day)?.label || '';
  };

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    if (!locationName.trim()) {
      setError('Location is required');
      return;
    }

    // Validate per-session price (required)
    const perSessionCents = Math.round(parseFloat(perSessionAmount) * 100);
    if (isNaN(perSessionCents) || perSessionCents < 100) {
      setError('Per-session price must be at least $1.00');
      return;
    }

    // Validate season pass price (optional - only if provided)
    let seasonPassCents = 0;
    if (seasonPassAmount.trim()) {
      seasonPassCents = Math.round(parseFloat(seasonPassAmount) * 100);
      if (isNaN(seasonPassCents) || seasonPassCents < 100) {
        setError('Season pass price must be at least $1.00 (or leave blank to disable)');
        return;
      }
    }

    // Card payments always enabled - no validation needed

    // Validate bank details if bank transfer enabled
    if (acceptBankTransfer && showBankDetails) {
      if (!bankDetails.bankName?.trim() || !bankDetails.accountName?.trim() || !bankDetails.accountNumber?.trim()) {
        setError('Please fill in all bank details (bank name, account name, account number)');
        return;
      }
    }

    setSaving(true);

    try {
      await updateStandingMeetup(meetup.id, {
        title: title.trim(),
        description: description.trim(),
        locationName: locationName.trim(),
        timezone,
        recurrence: {
          ...meetup.recurrence,
          dayOfWeek: dayOfWeek as 0 | 1 | 2 | 3 | 4 | 5 | 6,
          startTime,
          endTime,
          startDate,
          endDate,
          totalSessions: numberOfWeeks,
        },
        maxPlayers,
        billing: {
          ...meetup.billing,
          amount: seasonPassCents, // Season pass price (0 if not enabled)
          perSessionAmount: perSessionCents, // Per-session price (required)
          currency,
          feesPaidBy,
        },
        paymentMethods: {
          acceptCardPayments: true, // Always enabled for platform revenue
          acceptBankTransfer,
          bankDetails: acceptBankTransfer ? {
            bankName: bankDetails.bankName?.trim() || '',
            accountName: bankDetails.accountName?.trim() || '',
            accountNumber: bankDetails.accountNumber?.trim() || '',
            reference: bankDetails.reference?.trim(),
            showToPlayers: showBankDetails,
          } : undefined,
        },
      });

      onSuccess();
    } catch (err: any) {
      console.error('Failed to update standing meetup:', err);
      setError(err.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700 sticky top-0 bg-gray-800">
          <h2 className="text-xl font-bold text-white">Edit Weekly Meetup</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">Basic Information</h3>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Monday Night Pickleball"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your weekly meetup..."
                rows={3}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Location *</label>
              <input
                type="text"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="e.g., Central Sports Centre, 123 Main St"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                required
              />
            </div>
          </div>

          {/* Schedule */}
          <div className="space-y-4 pt-4 border-t border-gray-700">
            <h3 className="text-lg font-semibold text-white">Schedule</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Day of Week *</label>
                <select
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(parseInt(e.target.value))}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  {DAY_OPTIONS.map((day) => (
                    <option key={day.value} value={day.value}>
                      {day.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Timezone *</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>

            </div>

            {/* Time Pickers */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <ScrollTimePicker
                value={startTime}
                onChange={setStartTime}
                label="Start Time"
              />
              <ScrollTimePicker
                value={endTime}
                onChange={setEndTime}
                label="End Time"
              />
            </div>

            <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3">
              <p className="text-yellow-400 text-sm">
                <strong>Note:</strong> Changing the day/time will apply to future sessions only. Existing sessions will keep their original schedule.
              </p>
            </div>
          </div>

          {/* Duration */}
          <div className="space-y-4 pt-4 border-t border-gray-700">
            <h3 className="text-lg font-semibold text-white">Duration</h3>

            <div className="grid grid-cols-2 gap-4">
              {/* Start Date */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Starts On</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-lime-500 focus:border-transparent [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70 [&::-webkit-calendar-picker-indicator]:hover:opacity-100 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                />
                <p className="text-xs text-gray-500 mt-1">First {getDayName(dayOfWeek)}</p>
              </div>

              {/* Number of Weeks */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Number of Weeks</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setNumberOfWeeks(Math.max(1, numberOfWeeks - 1))}
                    className="w-12 h-10 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-white text-xl font-bold transition-colors flex items-center justify-center"
                  >
                    −
                  </button>
                  <div className="flex-1 h-10 bg-gray-700 border border-gray-600 rounded-lg flex items-center justify-center">
                    <span className="text-lime-400 text-xl font-bold">{numberOfWeeks}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNumberOfWeeks(Math.min(52, numberOfWeeks + 1))}
                    className="w-12 h-10 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-white text-xl font-bold transition-colors flex items-center justify-center"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Timeline Visual */}
            <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <div className="text-center">
                  <div className="text-xs text-gray-500 mb-1">START</div>
                  <div className="text-white font-medium">{formatDateDisplay(startDate)}</div>
                </div>
                <div className="flex-1 mx-4 relative">
                  <div className="h-1 bg-gray-700 rounded-full"></div>
                  <div className="absolute inset-0 h-1 bg-lime-500 rounded-full" style={{ width: '100%' }}></div>
                  <div className="absolute -top-1 left-0 w-3 h-3 bg-lime-500 rounded-full"></div>
                  <div className="absolute -top-1 right-0 w-3 h-3 bg-lime-500 rounded-full"></div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500 mb-1">END</div>
                  <div className="text-white font-medium">{formatDateDisplay(endDate)}</div>
                </div>
              </div>
              <div className="text-center">
                <span className="inline-flex items-center gap-2 px-3 py-1 bg-lime-500/10 border border-lime-500/30 rounded-full text-lime-400 text-sm">
                  <span>{numberOfWeeks} sessions</span>
                  <span>•</span>
                  <span>Every {getDayName(dayOfWeek)}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Capacity */}
          <div className="space-y-4 pt-4 border-t border-gray-700">
            <h3 className="text-lg font-semibold text-white">Capacity</h3>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Maximum Players *</label>
              <div className="flex items-center gap-2 max-w-xs">
                <button
                  type="button"
                  onClick={() => setMaxPlayers(Math.max(4, maxPlayers - 4))}
                  className="w-10 h-10 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-white text-lg font-bold transition-colors flex items-center justify-center"
                >
                  −
                </button>
                <div className="flex-1 h-10 bg-gray-700 border border-gray-600 rounded-lg flex items-center justify-center">
                  <span className="text-lime-400 text-lg font-bold">{maxPlayers}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMaxPlayers(Math.min(100, maxPlayers + 4))}
                  className="w-10 h-10 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-white text-lg font-bold transition-colors flex items-center justify-center"
                >
                  +
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">Current subscribers: {meetup.subscriberCount} • Increments by 4</p>
            </div>
          </div>

          {/* Pricing */}
          <div className="space-y-4 pt-4 border-t border-gray-700">
            <h3 className="text-lg font-semibold text-white">Pricing</h3>

            {/* Per-Session Price (Required) */}
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-300 mb-1">Per-Session Price *</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const current = parseFloat(perSessionAmount) || 1;
                      const newAmount = Math.max(1, current - 0.5);
                      setPerSessionAmount(newAmount.toFixed(2));
                    }}
                    className="w-10 h-10 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-white text-lg font-bold transition-colors flex items-center justify-center"
                  >
                    −
                  </button>
                  <div className="flex-1 h-10 bg-gray-700 border border-gray-600 rounded-lg flex items-center justify-center">
                    <span className="text-lime-400 text-lg font-bold font-mono">
                      ${parseFloat(perSessionAmount || '0').toFixed(2)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const current = parseFloat(perSessionAmount) || 1;
                      const newAmount = Math.min(100, current + 0.5);
                      setPerSessionAmount(newAmount.toFixed(2));
                    }}
                    className="w-10 h-10 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-white text-lg font-bold transition-colors flex items-center justify-center"
                  >
                    +
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">Players pay this for each session selected</p>
              </div>

              {/* Currency */}
              <div className="w-28">
                <label className="block text-sm font-medium text-gray-300 mb-1">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as 'nzd' | 'aud' | 'usd')}
                  className="w-full h-10 bg-gray-700 border border-gray-600 rounded-lg px-2 text-white text-sm focus:ring-2 focus:ring-lime-500 focus:border-transparent"
                >
                  <option value="nzd">🇳🇿 NZD</option>
                  <option value="aud">🇦🇺 AUD</option>
                  <option value="usd">🇺🇸 USD</option>
                </select>
              </div>
            </div>

            {/* Season Pass Price (Optional) */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Season Pass Price (optional)</label>
              <div className="flex items-center gap-2 max-w-xs">
                <button
                  type="button"
                  onClick={() => {
                    const current = parseFloat(seasonPassAmount) || 0;
                    if (current <= 0) return; // Don't go below 0
                    const newAmount = Math.max(0, current - 5);
                    setSeasonPassAmount(newAmount > 0 ? newAmount.toFixed(2) : '');
                  }}
                  className="w-10 h-10 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-white text-lg font-bold transition-colors flex items-center justify-center"
                >
                  −
                </button>
                <div className="flex-1 h-10 bg-gray-700 border border-gray-600 rounded-lg flex items-center justify-center">
                  <span className={`text-lg font-bold font-mono ${seasonPassAmount ? 'text-lime-400' : 'text-gray-500'}`}>
                    {seasonPassAmount ? `$${parseFloat(seasonPassAmount).toFixed(2)}` : 'Not set'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const current = parseFloat(seasonPassAmount) || 0;
                    const newAmount = Math.min(500, current + 5);
                    setSeasonPassAmount(newAmount.toFixed(2));
                  }}
                  className="w-10 h-10 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-white text-lg font-bold transition-colors flex items-center justify-center"
                >
                  +
                </button>
                {seasonPassAmount && (
                  <button
                    type="button"
                    onClick={() => setSeasonPassAmount('')}
                    className="w-10 h-10 bg-gray-600 hover:bg-gray-500 border border-gray-500 rounded-lg text-gray-300 text-sm transition-colors flex items-center justify-center"
                    title="Clear season pass"
                  >
                    ✕
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                One payment for all remaining sessions (leave blank to show only per-session option)
              </p>
            </div>

            {/* Savings calculation */}
            {seasonPassAmount && parseFloat(seasonPassAmount) > 0 && numberOfWeeks > 0 && (
              <div className="bg-lime-900/20 border border-lime-700/50 rounded-lg p-3">
                <p className="text-lime-400 text-sm">
                  {(() => {
                    const perSession = parseFloat(perSessionAmount) || 0;
                    const seasonPass = parseFloat(seasonPassAmount) || 0;
                    const fullPrice = perSession * numberOfWeeks;
                    const savings = fullPrice - seasonPass;
                    const savingsPercent = fullPrice > 0 ? Math.round((savings / fullPrice) * 100) : 0;

                    if (savings > 0) {
                      return (
                        <>
                          <strong>Savings:</strong> Players save ${savings.toFixed(2)} ({savingsPercent}%) with Season Pass
                          <br />
                          <span className="text-gray-400">
                            {numberOfWeeks} sessions × ${perSession.toFixed(2)} = ${fullPrice.toFixed(2)} vs ${seasonPass.toFixed(2)}
                          </span>
                        </>
                      );
                    } else if (savings < 0) {
                      return (
                        <>
                          <span className="text-yellow-400">
                            <strong>Warning:</strong> Season pass is more expensive than individual sessions (${seasonPass.toFixed(2)} vs ${fullPrice.toFixed(2)})
                          </span>
                        </>
                      );
                    } else {
                      return <>Season Pass equals full price (no discount)</>;
                    }
                  })()}
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Who pays the fees?</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFeesPaidBy('organizer')}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    feesPaidBy === 'organizer'
                      ? 'bg-lime-500/20 border-2 border-lime-500 text-lime-400'
                      : 'bg-gray-700 border border-gray-600 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  Organizer absorbs
                </button>
                <button
                  type="button"
                  onClick={() => setFeesPaidBy('player')}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    feesPaidBy === 'player'
                      ? 'bg-lime-500/20 border-2 border-lime-500 text-lime-400'
                      : 'bg-gray-700 border border-gray-600 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  Player pays on top
                </button>
              </div>
            </div>

            <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3">
              <p className="text-yellow-400 text-sm">
                <strong>Note:</strong> Pricing changes will apply to new registrations only.
              </p>
            </div>
          </div>

          {/* Payment Methods */}
          <div className="pt-4 border-t border-gray-700">
            <PaymentMethodsPanel
              acceptCardPayments={acceptCardPayments}
              setAcceptCardPayments={setAcceptCardPayments}
              acceptBankTransfer={acceptBankTransfer}
              setAcceptBankTransfer={setAcceptBankTransfer}
              bankDetails={bankDetails}
              setBankDetails={setBankDetails}
              showBankDetails={showBankDetails}
              setShowBankDetails={setShowBankDetails}
              hideSaveButton={true}
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-4 pt-4 border-t border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white px-6 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditStandingMeetup;
