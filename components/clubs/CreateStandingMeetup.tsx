/**
 * CreateStandingMeetup Component
 *
 * Form to create a new standing meetup for a club.
 * Collects schedule, pricing, capacity, credit settings, and payment methods.
 *
 * @version 07.57
 * @file components/clubs/CreateStandingMeetup.tsx
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { createStandingMeetup } from '../../services/firebase/standingMeetups';
import type { StandingMeetup } from '../../types/standingMeetup';
import type { BankDetails } from '../../types';
import { PaymentMethodsPanel } from '../payments';
import { ScrollTimePicker } from '../shared/ScrollTimePicker';

interface CreateStandingMeetupProps {
  clubId: string;
  clubName: string;
  organizerStripeAccountId: string;
  onSuccess: (meetupId: string) => void;
  onCancel: () => void;
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

export const CreateStandingMeetup: React.FC<CreateStandingMeetupProps> = ({
  clubId,
  clubName,
  organizerStripeAccountId,
  onSuccess,
  onCancel,
}) => {
  const { currentUser } = useAuth();

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationName, setLocationName] = useState('');
  const [timezone, setTimezone] = useState('Pacific/Auckland');
  const [dayOfWeek, setDayOfWeek] = useState<number>(1); // Monday default
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('20:00');
  const [maxPlayers, setMaxPlayers] = useState(16);

  // Duration state
  const [numberOfWeeks, setNumberOfWeeks] = useState(10); // Default 10 weeks (school term)
  const [perSessionAmount, setPerSessionAmount] = useState('18.00'); // Per-session price (required)
  const [seasonPassAmount, setSeasonPassAmount] = useState(''); // Season pass price (optional)
  const [currency, setCurrency] = useState<'nzd' | 'aud' | 'usd'>('nzd');
  const [feesPaidBy, setFeesPaidBy] = useState<'organizer' | 'player'>('organizer');
  const [creditsEnabled, setCreditsEnabled] = useState(true);
  const [cutoffHours, setCutoffHours] = useState(24);

  // Payment methods state
  const [acceptCardPayments, setAcceptCardPayments] = useState(true);
  const [acceptBankTransfer, setAcceptBankTransfer] = useState(false);
  const [bankDetails, setBankDetails] = useState<BankDetails>({
    bankName: '',
    accountName: '',
    accountNumber: '',
    reference: '',
  });
  const [showBankDetails, setShowBankDetails] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate next occurrence of selected day
  const getNextDayOfWeek = (day: number): string => {
    const today = new Date();
    const currentDay = today.getDay();
    const daysUntilNext = (day - currentDay + 7) % 7 || 7;
    const nextDate = new Date(today);
    nextDate.setDate(today.getDate() + daysUntilNext);
    return nextDate.toISOString().split('T')[0];
  };

  // Start date - updates when day of week changes
  const [startDate, setStartDate] = useState(() => getNextDayOfWeek(1)); // Monday default

  // Update start date when day of week changes
  useEffect(() => {
    setStartDate(getNextDayOfWeek(dayOfWeek));
  }, [dayOfWeek]);

  // Calculate end date based on start date and number of weeks
  const endDate = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(start);
    end.setDate(start.getDate() + (numberOfWeeks - 1) * 7); // Last session is (weeks-1) weeks after first
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentUser) {
      setError('You must be logged in');
      return;
    }

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

    // Validate season pass price (optional - if provided, must be >= per-session)
    let seasonPassCents = 0;
    if (seasonPassAmount.trim()) {
      seasonPassCents = Math.round(parseFloat(seasonPassAmount) * 100);
      if (isNaN(seasonPassCents) || seasonPassCents < perSessionCents) {
        setError('Season pass price must be at least the per-session price');
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
      const meetupData: Omit<StandingMeetup, 'id' | 'createdAt' | 'updatedAt' | 'subscriberCount'> = {
        clubId,
        clubName,
        createdByUserId: currentUser.uid,
        organizerStripeAccountId,
        title: title.trim(),
        description: description.trim(),
        locationName: locationName.trim(),
        timezone,
        recurrence: {
          interval: 'weekly',
          dayOfWeek: dayOfWeek as 0 | 1 | 2 | 3 | 4 | 5 | 6,
          startTime,
          endTime,
          startDate,
          endDate,
          totalSessions: numberOfWeeks,
        },
        maxPlayers,
        waitlistEnabled: false, // V1.5 feature
        billing: {
          interval: 'weekly',
          amount: seasonPassCents, // Season pass price (0 if not set)
          perSessionAmount: perSessionCents, // Per-session price (required)
          currency,
          feesPaidBy,
        },
        credits: {
          enabled: creditsEnabled,
          cancellationCutoffHours: cutoffHours,
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
        competitionType: 'casual', // Default
        status: 'active',
        visibility: 'public',
      };

      const meetupId = await createStandingMeetup(meetupData);
      onSuccess(meetupId);
    } catch (err: any) {
      console.error('Failed to create standing meetup:', err);
      setError(err.message || 'Failed to create standing meetup');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <h1 className="text-2xl font-bold text-white">Create Standing Meetup</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h2 className="text-lg font-semibold text-white mb-4">Basic Information</h2>

          <div className="space-y-4">
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
        </div>

        {/* Schedule */}
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h2 className="text-lg font-semibold text-white mb-4">Schedule</h2>

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
        </div>

        {/* Duration */}
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h2 className="text-lg font-semibold text-white mb-4">Duration</h2>

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
          <div className="mt-6 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
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
                <span>🎾</span>
                <span>{numberOfWeeks} sessions</span>
                <span>•</span>
                <span>Every {getDayName(dayOfWeek)}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Capacity */}
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h2 className="text-lg font-semibold text-white mb-4">Capacity</h2>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-3 text-center">Maximum Players *</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMaxPlayers(Math.max(4, maxPlayers - 4))}
                className="w-12 h-12 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-white text-2xl font-bold transition-colors flex items-center justify-center"
              >
                −
              </button>
              <div className="flex-1 h-12 bg-gray-700 border border-gray-600 rounded-lg flex items-center justify-center">
                <span className="text-lime-400 text-xl font-bold">{maxPlayers}</span>
              </div>
              <button
                type="button"
                onClick={() => setMaxPlayers(Math.min(100, maxPlayers + 4))}
                className="w-12 h-12 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-white text-2xl font-bold transition-colors flex items-center justify-center"
              >
                +
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1 text-center">Increments by 4 (min: 4, max: 100)</p>
          </div>
        </div>

        {/* Pricing */}
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h2 className="text-lg font-semibold text-white mb-4">Pricing</h2>

          {/* Per-Session Price (Required) */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-1">Per-Session Price *</label>
            <p className="text-xs text-gray-500 mb-3">Players pay this for each session they select</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const current = parseFloat(perSessionAmount) || 1;
                  const newAmount = Math.max(1, current - 0.5);
                  setPerSessionAmount(newAmount.toFixed(2));
                }}
                className="w-12 h-12 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-white text-2xl font-bold transition-colors flex items-center justify-center"
              >
                −
              </button>
              <div className="flex-1 h-12 bg-gray-700 border border-gray-600 rounded-lg flex items-center justify-center">
                <span className="text-lime-400 text-xl font-bold font-mono">
                  ${parseFloat(perSessionAmount).toFixed(2)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const current = parseFloat(perSessionAmount) || 1;
                  const newAmount = Math.min(100, current + 0.5);
                  setPerSessionAmount(newAmount.toFixed(2));
                }}
                className="w-12 h-12 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-white text-2xl font-bold transition-colors flex items-center justify-center"
              >
                +
              </button>
            </div>
          </div>

          {/* Season Pass Price (Optional) */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-1">Season Pass Price (optional)</label>
            <p className="text-xs text-gray-500 mb-3">One payment for all remaining sessions (discounted)</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const current = parseFloat(seasonPassAmount) || parseFloat(perSessionAmount) * numberOfWeeks;
                  const newAmount = Math.max(parseFloat(perSessionAmount), current - 5);
                  setSeasonPassAmount(newAmount.toFixed(2));
                }}
                className="w-12 h-12 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-white text-2xl font-bold transition-colors flex items-center justify-center"
              >
                −
              </button>
              <div className="flex-1 h-12 bg-gray-700 border border-gray-600 rounded-lg flex items-center justify-center">
                {seasonPassAmount ? (
                  <span className="text-lime-400 text-xl font-bold font-mono">
                    ${parseFloat(seasonPassAmount).toFixed(2)}
                  </span>
                ) : (
                  <span className="text-gray-500 text-sm">Not set</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  const current = parseFloat(seasonPassAmount) || parseFloat(perSessionAmount) * numberOfWeeks * 0.9;
                  const newAmount = Math.min(500, current + 5);
                  setSeasonPassAmount(newAmount.toFixed(2));
                }}
                className="w-12 h-12 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-white text-2xl font-bold transition-colors flex items-center justify-center"
              >
                +
              </button>
            </div>
            {seasonPassAmount && (
              <div className="mt-2 text-xs text-gray-400">
                {(() => {
                  const perSession = parseFloat(perSessionAmount);
                  const seasonPass = parseFloat(seasonPassAmount);
                  const fullPrice = perSession * numberOfWeeks;
                  const savings = fullPrice - seasonPass;
                  const savingsPercent = Math.round((savings / fullPrice) * 100);
                  if (savings > 0) {
                    return `Players save $${savings.toFixed(2)} (${savingsPercent}%) vs paying per session`;
                  }
                  return null;
                })()}
              </div>
            )}
            {!seasonPassAmount && (
              <p className="text-xs text-gray-500 mt-2">
                If not set, only per-session option will be shown to players
              </p>
            )}
          </div>

          {/* Currency */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-1">Currency *</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as 'nzd' | 'aud' | 'usd')}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="nzd">🇳🇿 NZD (New Zealand)</option>
              <option value="aud">🇦🇺 AUD (Australia)</option>
              <option value="usd">🇺🇸 USD (United States)</option>
            </select>
          </div>

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
        </div>

        {/* Credits Settings */}
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Cancellation Credits</h2>
              <p className="text-sm text-gray-400">Issue credits when players cancel in advance</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={creditsEnabled}
                onChange={(e) => setCreditsEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-green-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
            </label>
          </div>

          {creditsEnabled && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Cancellation Cutoff (hours before)</label>
              <select
                value={cutoffHours}
                onChange={(e) => setCutoffHours(parseInt(e.target.value))}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value={6}>6 hours</option>
                <option value={12}>12 hours</option>
                <option value={24}>24 hours</option>
                <option value={48}>48 hours</option>
                <option value={72}>72 hours (3 days)</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Players who cancel at least {cutoffHours} hours before the session will receive credit
              </p>
            </div>
          )}
        </div>

        {/* Payment Methods */}
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

        {/* Error Message */}
        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-4">
          <button
            type="button"
            onClick={onCancel}
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
                Creating...
              </>
            ) : (
              'Create Standing Meetup'
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateStandingMeetup;
