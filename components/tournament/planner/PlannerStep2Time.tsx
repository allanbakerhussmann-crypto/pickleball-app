/**
 * Tournament Planner - Step 2: Time Window (Multi-Day Support)
 *
 * User selects tournament dates and times for each day.
 *
 * FILE LOCATION: components/tournament/planner/PlannerStep2Time.tsx
 * VERSION: V06.00
 */

import React, { useMemo, useState, useEffect } from 'react';
import type { TournamentDay, TournamentPaymentMode, BankDetails } from '../../../types';

interface PlannerStep2TimeProps {
  days: TournamentDay[];
  courts: number;
  onChange: (days: TournamentDay[]) => void;
  // Registration & Payment
  registrationOpens?: number;
  registrationDeadline?: number;
  isFreeEvent?: boolean;
  entryFee?: number;
  paymentMode?: TournamentPaymentMode;
  adminFee?: number;
  bankDetails?: BankDetails;
  showBankDetails?: boolean;
  hasStripeConnected?: boolean;
  onRegistrationChange?: (updates: {
    registrationOpens?: number;
    registrationDeadline?: number;
    isFreeEvent?: boolean;
    entryFee?: number;
    paymentMode?: TournamentPaymentMode;
    adminFee?: number;
    bankDetails?: BankDetails;
    showBankDetails?: boolean;
  }) => void;
}

// Generate time options from 6 AM to 10 PM in 30-minute increments
const TIME_OPTIONS = Array.from({ length: 33 }, (_, i) => {
  const totalMinutes = 6 * 60 + i * 30; // Start at 6:00 AM
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hours12 = hours % 12 || 12;
  const ampm = hours < 12 ? 'AM' : 'PM';
  return {
    value: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`,
    label: `${hours12}:${minutes.toString().padStart(2, '0')} ${ampm}`,
  };
});

// Format date for display
const formatDateDisplay = (dateStr: string): string => {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

// Format time for display
const formatTimeDisplay = (time: string): string => {
  const [hours, minutes] = time.split(':').map(Number);
  const hours12 = hours % 12 || 12;
  const ampm = hours < 12 ? 'AM' : 'PM';
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
};

// Calculate hours for a single day
const calculateDayHours = (day: TournamentDay): number => {
  const [startH, startM] = day.startTime.split(':').map(Number);
  const [endH, endM] = day.endTime.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  return Math.max(0, (endMinutes - startMinutes) / 60);
};

export const PlannerStep2Time: React.FC<PlannerStep2TimeProps> = ({
  days,
  courts,
  onChange,
  registrationOpens,
  registrationDeadline,
  // Legacy props kept for backwards compatibility but not used in new UI
  isFreeEvent: _isFreeEvent,
  entryFee: _entryFee,
  paymentMode = 'free',
  adminFee,
  bankDetails,
  showBankDetails,
  hasStripeConnected,
  onRegistrationChange,
}) => {
  // Calculate totals
  const { totalHours, totalCourtHours } = useMemo(() => {
    const totalHours = days.reduce((sum, day) => sum + calculateDayHours(day), 0);
    return {
      totalHours,
      totalCourtHours: totalHours * courts,
    };
  }, [days, courts]);

  // Local state for admin fee input to allow free typing
  const [adminFeeInput, setAdminFeeInput] = useState(() =>
    adminFee ? (adminFee / 100).toString() : ''
  );

  // Sync local state when prop changes externally
  useEffect(() => {
    const propValue = adminFee ? (adminFee / 100).toString() : '';
    // Only update if significantly different (not just formatting)
    if (parseFloat(adminFeeInput || '0') !== (adminFee || 0) / 100) {
      setAdminFeeInput(propValue);
    }
  }, [adminFee]);

  // Add a new day
  const handleAddDay = () => {
    // Find the last date and add 1 day
    const lastDay = days[days.length - 1];
    const lastDate = new Date(lastDay.date + 'T12:00:00');
    lastDate.setDate(lastDate.getDate() + 1);
    const newDateStr = lastDate.toISOString().split('T')[0];

    const newDay: TournamentDay = {
      id: `day-${Date.now()}`,
      date: newDateStr,
      startTime: lastDay.startTime,
      endTime: lastDay.endTime,
      label: `Day ${days.length + 1}`,
    };

    onChange([...days, newDay]);
  };

  // Remove a day
  const handleRemoveDay = (dayId: string) => {
    if (days.length <= 1) return;
    onChange(days.filter((d) => d.id !== dayId));
  };

  // Update a day
  const handleUpdateDay = (dayId: string, updates: Partial<TournamentDay>) => {
    onChange(
      days.map((d) => (d.id === dayId ? { ...d, ...updates } : d))
    );
  };

  return (
    <div className="p-8">
      <div className="text-center mb-8">
        <span className="text-4xl mb-4 block">📅</span>
        <h2 className="text-2xl font-bold text-white mb-2">
          When is your tournament?
        </h2>
        <p className="text-gray-400">
          Add tournament days and set times for each
        </p>
      </div>

      {/* Days list */}
      <div className="space-y-4 mb-6">
        {days.map((day, index) => {
          const dayHours = calculateDayHours(day);

          return (
            <div
              key={day.id}
              className="bg-gray-700 rounded-lg p-4 border border-gray-600"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">
                    {index === 0 ? '🏁' : index === days.length - 1 && days.length > 1 ? '🏆' : '📆'}
                  </span>
                  <div>
                    <input
                      type="text"
                      value={day.label || `Day ${index + 1}`}
                      onChange={(e) => handleUpdateDay(day.id, { label: e.target.value })}
                      className="bg-transparent text-white font-medium text-lg focus:outline-none focus:border-b-2 focus:border-blue-500 w-32"
                      placeholder={`Day ${index + 1}`}
                    />
                  </div>
                </div>
                {days.length > 1 && (
                  <button
                    onClick={() => handleRemoveDay(day.id)}
                    className="text-gray-400 hover:text-red-400 transition-colors p-1"
                    title="Remove day"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Date */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">DATE</label>
                  <input
                    type="date"
                    value={day.date}
                    onChange={(e) => handleUpdateDay(day.id, { date: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Start Time */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">START</label>
                  <select
                    value={day.startTime}
                    onChange={(e) => handleUpdateDay(day.id, { startTime: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  >
                    {TIME_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* End Time */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">END</label>
                  <select
                    value={day.endTime}
                    onChange={(e) => handleUpdateDay(day.id, { endTime: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  >
                    {TIME_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Day summary */}
              <div className="mt-3 pt-3 border-t border-gray-600 flex items-center justify-between text-sm">
                <span className="text-gray-400">
                  {formatDateDisplay(day.date)} • {formatTimeDisplay(day.startTime)} - {formatTimeDisplay(day.endTime)}
                </span>
                <span className="text-white font-medium">
                  {dayHours.toFixed(1)} hrs • {(dayHours * courts).toFixed(0)} court-hrs
                </span>
              </div>
            </div>
          );
        })}

        {/* Add day button */}
        <button
          onClick={handleAddDay}
          className="w-full p-4 border-2 border-dashed border-gray-600 rounded-lg text-gray-400 hover:border-blue-500 hover:text-blue-400 transition-colors flex items-center justify-center gap-2"
        >
          <span className="text-xl">➕</span>
          Add Another Day
        </button>
      </div>

      {/* Registration Window */}
      {onRegistrationChange && (
        <div className="bg-gray-700 rounded-lg p-4 mb-6 border border-gray-600">
          <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
            <span>📋</span> Registration Window
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-4">
            {/* Registration Opens */}
            <div>
              <label className="block text-xs text-gray-400 mb-2">OPENS</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <input
                    type="date"
                    value={registrationOpens ? new Date(registrationOpens).toISOString().split('T')[0] : ''}
                    onChange={(e) => {
                      if (!e.target.value) {
                        onRegistrationChange({ registrationOpens: undefined });
                        return;
                      }
                      const currentTime = registrationOpens ? new Date(registrationOpens) : new Date();
                      const [year, month, day] = e.target.value.split('-').map(Number);
                      currentTime.setFullYear(year, month - 1, day);
                      onRegistrationChange({ registrationOpens: currentTime.getTime() });
                    }}
                    className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <select
                    value={registrationOpens ? `${new Date(registrationOpens).getHours().toString().padStart(2, '0')}:${new Date(registrationOpens).getMinutes().toString().padStart(2, '0')}` : '09:00'}
                    onChange={(e) => {
                      const [hours, minutes] = e.target.value.split(':').map(Number);
                      const date = registrationOpens ? new Date(registrationOpens) : new Date();
                      date.setHours(hours, minutes, 0, 0);
                      onRegistrationChange({ registrationOpens: date.getTime() });
                    }}
                    className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  >
                    {TIME_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">When players can start registering</p>
            </div>

            {/* Registration Closes */}
            <div>
              <label className="block text-xs text-gray-400 mb-2">CLOSES</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <input
                    type="date"
                    value={registrationDeadline ? new Date(registrationDeadline).toISOString().split('T')[0] : ''}
                    onChange={(e) => {
                      if (!e.target.value) {
                        onRegistrationChange({ registrationDeadline: undefined });
                        return;
                      }
                      const currentTime = registrationDeadline ? new Date(registrationDeadline) : new Date();
                      const [year, month, day] = e.target.value.split('-').map(Number);
                      currentTime.setFullYear(year, month - 1, day);
                      onRegistrationChange({ registrationDeadline: currentTime.getTime() });
                    }}
                    className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <select
                    value={registrationDeadline ? `${new Date(registrationDeadline).getHours().toString().padStart(2, '0')}:${new Date(registrationDeadline).getMinutes().toString().padStart(2, '0')}` : '17:00'}
                    onChange={(e) => {
                      const [hours, minutes] = e.target.value.split(':').map(Number);
                      const date = registrationDeadline ? new Date(registrationDeadline) : new Date();
                      date.setHours(hours, minutes, 0, 0);
                      onRegistrationChange({ registrationDeadline: date.getTime() });
                    }}
                    className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  >
                    {TIME_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">Last day to register</p>
            </div>
          </div>

          {/* Payment Mode Selection */}
          <div className="border-t border-gray-600 pt-4 mt-4">
            <h4 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
              <span>💳</span> Payment Options
            </h4>

            <div className="space-y-3">
              {/* Free Tournament Option */}
              <button
                type="button"
                onClick={() => onRegistrationChange?.({ paymentMode: 'free', isFreeEvent: true, adminFee: 0, showBankDetails: false })}
                className={`w-full flex items-center gap-3 p-4 rounded-lg border text-left transition-colors ${
                  paymentMode === 'free'
                    ? 'bg-green-900/20 border-green-600'
                    : 'bg-gray-700 border-gray-600 hover:border-gray-500'
                }`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  paymentMode === 'free' ? 'border-green-500' : 'border-gray-500'
                }`}>
                  {paymentMode === 'free' && <div className="w-2.5 h-2.5 rounded-full bg-green-500"/>}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-white">Free Tournament</div>
                  <div className="text-sm text-gray-400">No payment required to register</div>
                </div>
              </button>

              {/* Paid Tournament Option */}
              <button
                type="button"
                onClick={() => hasStripeConnected && onRegistrationChange?.({ paymentMode: 'paid', isFreeEvent: false })}
                disabled={!hasStripeConnected}
                className={`w-full flex items-start gap-3 p-4 rounded-lg border text-left transition-colors ${
                  !hasStripeConnected
                    ? 'opacity-60 cursor-not-allowed bg-gray-700 border-gray-600'
                    : paymentMode === 'paid'
                      ? 'bg-blue-900/20 border-blue-600'
                      : 'bg-gray-700 border-gray-600 hover:border-gray-500'
                }`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  paymentMode === 'paid' ? 'border-blue-500' : 'border-gray-500'
                }`}>
                  {paymentMode === 'paid' && <div className="w-2.5 h-2.5 rounded-full bg-blue-500"/>}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-white flex items-center gap-2">
                    Paid Tournament
                    {!hasStripeConnected && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-600/30 text-yellow-300">Setup Required</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-400 mt-1">
                    Players choose how to pay:
                  </div>
                  <ul className="text-sm text-gray-400 mt-2 space-y-1">
                    <li className="flex items-start gap-2">
                      <span className="text-blue-400">•</span>
                      <span><strong className="text-gray-300">Bank Transfer</strong> - Base fee only, you approve manually</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-purple-400">•</span>
                      <span><strong className="text-gray-300">Pay via Stripe</strong> - Base fee + 1.5% platform + Stripe fees, instant confirmation</span>
                    </li>
                  </ul>
                </div>
              </button>

              {!hasStripeConnected && (
                <div className="bg-yellow-900/20 border border-yellow-600/50 p-3 rounded-lg">
                  <p className="text-yellow-400 text-sm">
                    <strong>Setup required:</strong> Connect your Stripe account to enable paid tournaments.
                    Go to Settings → Stripe to set up.
                  </p>
                </div>
              )}
            </div>

            {/* Paid Tournament Settings (shown when paid is selected) */}
            {paymentMode === 'paid' && (
              <div className="mt-4 space-y-4">
                {/* Admin Fee Input */}
                <div className="bg-gray-700/50 p-4 rounded-lg">
                  <label className="block text-xs text-gray-400 mb-1">
                    ADMIN FEE (Optional - tournament-level fee)
                  </label>
                  <div className="relative w-48">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={adminFeeInput}
                      onChange={(e) => {
                        // Allow only numbers and one decimal point
                        const value = e.target.value;
                        if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
                          setAdminFeeInput(value);
                        }
                      }}
                      onBlur={() => {
                        // Convert to cents and save on blur
                        const dollars = parseFloat(adminFeeInput || '0');
                        const cents = Math.round(dollars * 100);
                        onRegistrationChange?.({ adminFee: cents });
                        // Format the display value
                        if (adminFeeInput && dollars > 0) {
                          setAdminFeeInput(dollars.toFixed(2));
                        }
                      }}
                      className="w-full px-3 py-2 pl-8 bg-gray-600 border border-gray-500 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    This fee is added to all registrations. Set division-specific fees in Step 4.
                  </p>
                </div>

                {/* Bank Details Section */}
                <div className="bg-gray-700/50 p-4 rounded-lg">
                  <label className="flex items-center gap-3 cursor-pointer mb-4">
                    <input
                      type="checkbox"
                      checked={showBankDetails || false}
                      onChange={(e) => onRegistrationChange?.({ showBankDetails: e.target.checked })}
                      className="w-5 h-5 rounded bg-gray-800 border-gray-500 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-white">Show my bank details to players for transfers</span>
                  </label>

                  {showBankDetails && (
                    <div className="space-y-3 pt-2 border-t border-gray-600">
                      <p className="text-xs text-gray-400 mt-2">
                        These details will be shown to players who select bank transfer.
                      </p>
                      <div className="grid grid-cols-1 gap-3">
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Bank Name</label>
                          <input
                            type="text"
                            placeholder="e.g., ANZ, Westpac, ASB, BNZ, Kiwibank"
                            value={bankDetails?.bankName || ''}
                            onChange={(e) => onRegistrationChange?.({
                              bankDetails: { ...bankDetails, bankName: e.target.value }
                            })}
                            className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Account Name</label>
                          <input
                            type="text"
                            placeholder="e.g., Pickleball Club Inc"
                            value={bankDetails?.accountName || ''}
                            onChange={(e) => onRegistrationChange?.({
                              bankDetails: { ...bankDetails, accountName: e.target.value }
                            })}
                            className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Account Number</label>
                          <input
                            type="text"
                            placeholder="e.g., 12-3456-0123456-00"
                            value={bankDetails?.accountNumber || ''}
                            onChange={(e) => onRegistrationChange?.({
                              bankDetails: { ...bankDetails, accountNumber: e.target.value }
                            })}
                            className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm"
                          />
                          <p className="text-xs text-gray-500 mt-1">NZ format: XX-XXXX-XXXXXXX-XX</p>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Reference Instructions</label>
                        <input
                          type="text"
                          placeholder="e.g., Use your name as reference"
                          value={bankDetails?.reference || ''}
                          onChange={(e) => onRegistrationChange?.({
                            bankDetails: { ...bankDetails, reference: e.target.value }
                          })}
                          className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm"
                        />
                      </div>
                    </div>
                  )}

                  {!showBankDetails && (
                    <p className="text-xs text-gray-500">
                      If unchecked, you'll need to share your bank details with players directly (email, WhatsApp, etc.)
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Total Stats */}
      <div className="bg-gray-700 rounded-lg p-4 mb-6">
        <div className="flex justify-center gap-8">
          <div className="text-center">
            <div className="text-3xl font-bold text-white">{days.length}</div>
            <div className="text-sm text-gray-400">{days.length === 1 ? 'day' : 'days'}</div>
          </div>
          <div className="w-px bg-gray-600" />
          <div className="text-center">
            <div className="text-3xl font-bold text-white">{totalHours.toFixed(1)}</div>
            <div className="text-sm text-gray-400">total hours</div>
          </div>
          <div className="w-px bg-gray-600" />
          <div className="text-center">
            <div className="text-3xl font-bold text-white">{totalCourtHours.toFixed(0)}</div>
            <div className="text-sm text-gray-400">court-hours</div>
          </div>
        </div>
      </div>

      {/* Multi-day info */}
      {days.length > 1 && (
        <div className="p-4 bg-blue-900/30 border border-blue-800 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-blue-400 text-lg">💡</span>
            <div className="text-sm text-blue-200">
              <p className="font-medium mb-1">Multi-day tournament</p>
              <p className="text-blue-300/80">
                You can assign divisions to specific days in the next step. Pool play often
                runs on Day 1, with medal rounds on Day 2.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Single day info */}
      {days.length === 1 && (
        <div className="p-4 bg-blue-900/30 border border-blue-800 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-blue-400 text-lg">💡</span>
            <div className="text-sm text-blue-200">
              <p className="font-medium mb-1">What are court-hours?</p>
              <p className="text-blue-300/80">
                With {courts} courts running for {totalHours.toFixed(1)} hours, you have{' '}
                {totalCourtHours.toFixed(0)} court-hours of total playing time. If each match takes
                ~15-20 minutes, that's roughly {Math.floor(totalCourtHours * 3)}-{Math.floor(totalCourtHours * 4)}{' '}
                matches.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlannerStep2Time;
