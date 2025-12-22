/**
 * PostponeWeekModal Component V05.37
 * 
 * Modal for postponing or rescheduling an entire week of league matches.
 * Used by organizers/admins for bulk match management (e.g., weather cancellations).
 * 
 * Features:
 * - Postpone all matches in a week with single action
 * - Reschedule an entire postponed week to new date
 * - Cancel all matches in a postponed week
 * - Shows affected match count
 * 
 * FIXED: Now uses dark theme with light date pickers for visibility
 * 
 * FILE LOCATION: src/components/leagues/PostponeWeekModal.tsx
 * VERSION: V05.37
 */

import React, { useState, useEffect } from 'react';
import {
  postponeWeek,
  rescheduleWeek,
  cancelPostponedWeek,
} from '../../services/firebase/leaguePostpone';
import type { LeagueWeekPostponement, PostponeReason } from '../../types';

// ============================================
// TYPES
// ============================================

interface PostponeWeekModalProps {
  isOpen: boolean;
  onClose: () => void;
  leagueId: string;
  divisionId?: string | null;
  // For new postponement
  weekNumber?: number;
  roundNumber?: number | null;
  weekDate?: number;
  scheduledMatchCount?: number;
  // For existing postponement
  existingPostponement?: LeagueWeekPostponement | null;
  // User info
  currentUserId: string;
  currentUserName: string;
  onSuccess?: () => void;
}

type ModalMode = 'postpone' | 'reschedule' | 'cancel';

// ============================================
// CONSTANTS
// ============================================

const POSTPONE_REASONS: { value: PostponeReason; label: string }[] = [
  { value: 'weather', label: '🌧️ Weather' },
  { value: 'venue_unavailable', label: '🏟️ Venue Unavailable' },
  { value: 'holiday', label: '🎉 Holiday' },
  { value: 'emergency', label: '🚨 Emergency' },
  { value: 'other', label: '📝 Other' },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString('en-NZ', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const formatDateForInput = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toISOString().split('T')[0];
};

const parseInputDate = (dateStr: string): number => {
  return new Date(dateStr + 'T12:00:00').getTime();
};

// ============================================
// COMPONENT
// ============================================

export const PostponeWeekModal: React.FC<PostponeWeekModalProps> = ({
  isOpen,
  onClose,
  leagueId,
  divisionId,
  weekNumber,
  roundNumber,
  weekDate,
  scheduledMatchCount,
  existingPostponement,
  currentUserId,
  currentUserName,
  onSuccess,
}) => {
  // Determine if we're managing an existing postponement
  const isExisting = !!existingPostponement;
  
  const getInitialMode = (): ModalMode => {
    if (isExisting) {
      return 'reschedule';
    }
    return 'postpone';
  };

  const [mode, setMode] = useState<ModalMode>(getInitialMode());
  const [reason, setReason] = useState<PostponeReason>('weather');
  const [otherReason, setOtherReason] = useState('');
  const [makeupDays, setMakeupDays] = useState(21);
  const [newDate, setNewDate] = useState('');
  const [newStartTime, setNewStartTime] = useState('');
  const [newEndTime, setNewEndTime] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode(getInitialMode());
      setReason('weather');
      setOtherReason('');
      setMakeupDays(21);
      setNewDate('');
      setNewStartTime('');
      setNewEndTime('');
      setCancelReason('');
      setError(null);
    }
  }, [isOpen, existingPostponement]);

  if (!isOpen) return null;

  // Get display values
  const displayWeekNumber = existingPostponement?.weekNumber || weekNumber || 0;
  const displayDate = existingPostponement?.originalDate || weekDate || Date.now();
  const displayMatchCount = existingPostponement?.affectedMatchCount || scheduledMatchCount || 0;

  const handlePostpone = async () => {
    setLoading(true);
    setError(null);

    try {
      const finalReason = reason === 'other' ? otherReason : reason;
      
      if (reason === 'other' && !otherReason.trim()) {
        throw new Error('Please enter a reason');
      }

      if (!weekNumber) {
        throw new Error('Week number is required');
      }

      if (!weekDate) {
        throw new Error('Week date is required');
      }

      await postponeWeek({
        leagueId,
        divisionId: divisionId || null,
        weekNumber,
        roundNumber: roundNumber || null,
        originalDate: weekDate,
        reason: finalReason,
        makeupDeadlineDays: makeupDays,
        postponedByUserId: currentUserId,
        postponedByName: currentUserName,
      });

      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to postpone week');
    } finally {
      setLoading(false);
    }
  };

  const handleReschedule = async () => {
    setLoading(true);
    setError(null);

    try {
      if (!newDate) {
        throw new Error('Please select a new date');
      }

      if (!existingPostponement) {
        throw new Error('No postponement record found');
      }

      await rescheduleWeek({
        leagueId,
        postponementId: existingPostponement.id,
        newDate: parseInputDate(newDate),
        newStartTime: newStartTime || null,
        newEndTime: newEndTime || null,
      });

      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reschedule week');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setLoading(true);
    setError(null);

    try {
      if (!existingPostponement) {
        throw new Error('No postponement record found');
      }

      await cancelPostponedWeek(
        leagueId,
        existingPostponement.id,
        cancelReason || undefined
      );

      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel week');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl border border-gray-700 max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700 bg-gray-900">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">
              {isExisting ? 'Manage Postponed Week' : 'Postpone Week'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Week Info */}
        <div className="px-6 py-4 bg-gray-900/50 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-400 mb-1">Week {displayWeekNumber}</div>
              <div className="font-medium text-white">
                {formatDate(displayDate)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-white">{displayMatchCount}</div>
              <div className="text-sm text-gray-400">matches affected</div>
            </div>
          </div>
          
          {isExisting && existingPostponement && (
            <div className="mt-3 pt-3 border-t border-gray-700">
              <div className="text-sm text-yellow-400">
                <span className="font-medium">Status:</span> {existingPostponement.status}
              </div>
              <div className="text-sm text-gray-400 mt-1">
                <span className="font-medium">Reason:</span> {existingPostponement.reason}
              </div>
              {existingPostponement.makeupDeadline && (
                <div className={`text-sm mt-1 ${existingPostponement.makeupDeadline < Date.now() ? 'text-red-400 font-medium' : 'text-gray-400'}`}>
                  <span className="font-medium">Makeup deadline:</span> {formatDate(existingPostponement.makeupDeadline)}
                  {existingPostponement.makeupDeadline < Date.now() && ' (OVERDUE)'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mode Tabs (only show if existing postponement) */}
        {isExisting && (
          <div className="px-6 pt-4">
            <div className="flex gap-2">
              <button
                onClick={() => setMode('reschedule')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                  mode === 'reschedule'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'
                }`}
              >
                📅 Reschedule
              </button>
              <button
                onClick={() => setMode('cancel')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                  mode === 'cancel'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'
                }`}
              >
                ❌ Cancel All
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="px-6 py-4">
          {error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Postpone Form */}
          {mode === 'postpone' && !isExisting && (
            <div className="space-y-4">
              <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-3 mb-4">
                <p className="text-sm text-yellow-400">
                  <strong>⚠️ Bulk Action:</strong> This will postpone all {displayMatchCount} scheduled matches for Week {displayWeekNumber}.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Reason for postponement
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as PostponeReason)}
                  className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 text-white rounded-lg focus:outline-none focus:border-blue-500"
                >
                  {POSTPONE_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              {reason === 'other' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Specify reason
                  </label>
                  <input
                    type="text"
                    value={otherReason}
                    onChange={(e) => setOtherReason(e.target.value)}
                    placeholder="Enter reason..."
                    className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 text-white rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Makeup deadline (days from now)
                </label>
                <input
                  type="number"
                  value={makeupDays}
                  onChange={(e) => setMakeupDays(parseInt(e.target.value) || 21)}
                  min={1}
                  max={90}
                  className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 text-white rounded-lg focus:outline-none focus:border-blue-500"
                />
                <p className="mt-1 text-sm text-gray-500">
                  All matches must be rescheduled by {formatDate(Date.now() + makeupDays * 24 * 60 * 60 * 1000)}
                </p>
              </div>

              <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-3">
                <p className="text-sm text-blue-400">
                  <strong>Note:</strong> All players with matches this week will be notified. 
                  You can reschedule the entire week to a new date later.
                </p>
              </div>
            </div>
          )}
          {/* Reschedule Form */}
          {mode === 'reschedule' && (
            <div className="space-y-4">
              <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-3 mb-4">
                <p className="text-sm text-blue-400">
                  <strong>📅 Reschedule Week:</strong> All {displayMatchCount} matches will be moved to the new date.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  New date *
                </label>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  min={formatDateForInput(Date.now())}
                  className="w-full px-3 py-2.5 bg-white border border-gray-300 text-gray-900 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  style={{ colorScheme: 'light' }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Start time (optional)
                  </label>
                  <input
                    type="time"
                    value={newStartTime}
                    onChange={(e) => setNewStartTime(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white border border-gray-300 text-gray-900 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    style={{ colorScheme: 'light' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    End time (optional)
                  </label>
                  <input
                    type="time"
                    value={newEndTime}
                    onChange={(e) => setNewEndTime(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white border border-gray-300 text-gray-900 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    style={{ colorScheme: 'light' }}
                  />
                </div>
              </div>

              <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-3">
                <p className="text-sm text-gray-400">
                  <strong>Tip:</strong> If matches have different times, leave the time fields empty. 
                  Players can then coordinate their own times within the rescheduled date.
                </p>
              </div>
            </div>
          )}

          {/* Cancel Form */}
          {mode === 'cancel' && (
            <div className="space-y-4">
              <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
                <p className="text-sm text-red-400 mb-2">
                  <strong>⚠️ Warning:</strong> This will cancel ALL {displayMatchCount} matches for Week {displayWeekNumber}. 
                  None of these matches will be played or count towards standings.
                </p>
                <p className="text-sm text-red-300">
                  This action cannot be undone.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Reason for cancellation (optional)
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g., Venue permanently closed, season ended early..."
                  rows={3}
                  className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 text-white rounded-lg focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 bg-gray-900 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>

          {mode === 'postpone' && !isExisting && (
            <button
              onClick={handlePostpone}
              disabled={loading || (reason === 'other' && !otherReason.trim())}
              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:bg-gray-600 flex items-center"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Postponing...
                </>
              ) : (
                `⏸️ Postpone ${displayMatchCount} Matches`
              )}
            </button>
          )}

          {mode === 'reschedule' && (
            <button
              onClick={handleReschedule}
              disabled={loading || !newDate}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:bg-gray-600 flex items-center"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Rescheduling...
                </>
              ) : (
                `📅 Reschedule ${displayMatchCount} Matches`
              )}
            </button>
          )}

          {mode === 'cancel' && (
            <button
              onClick={handleCancel}
              disabled={loading}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:bg-gray-600 flex items-center"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Cancelling...
                </>
              ) : (
                `❌ Cancel ${displayMatchCount} Matches`
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PostponeWeekModal;