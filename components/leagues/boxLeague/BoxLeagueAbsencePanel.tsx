/**
 * Box League Absence Panel V07.27
 *
 * Allows players to declare absences for upcoming weeks.
 * Shows current absence status and allows cancellation (if still draft).
 *
 * Two views:
 * - Player view: Declare/cancel own absences
 * - Organizer view: See all absences, assign substitutes, mark no-shows
 *
 * FILE LOCATION: components/leagues/boxLeague/BoxLeagueAbsencePanel.tsx
 * VERSION: V07.27
 */

import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot } from '@firebase/firestore';
import { db } from '../../../services/firebase/config';
import type { LeagueMember, League } from '../../../types';
import type {
  BoxLeagueWeek,
  WeekAbsence,
  AbsencePolicyType,
} from '../../../types/rotatingDoublesBox';
import {
  declareAbsence,
  cancelAbsence,
  recordNoShowAbsence,
  assignSubstitute,
  removeSubstitute,
  getEligibleSubstitutes,
  formatPolicyName,
} from '../../../services/rotatingDoublesBox';

// ============================================
// TYPES
// ============================================

interface BoxLeagueAbsencePanelProps {
  leagueId: string;
  league: League;
  members: LeagueMember[];
  currentUserId: string;
  isOrganizer: boolean;
}

interface AbsenceDeclarationModalProps {
  isOpen: boolean;
  onClose: () => void;
  week: BoxLeagueWeek;
  leagueId: string;
  playerId: string;
  playerName: string;
  absencePolicy: AbsencePolicyType;
  onSuccess: () => void;
}

interface SubstituteAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  week: BoxLeagueWeek;
  leagueId: string;
  absence: WeekAbsence;
  eligibleSubstitutes: { id: string; name: string }[];
  onSuccess: () => void;
}

// ============================================
// ABSENCE DECLARATION MODAL
// ============================================

const AbsenceDeclarationModal: React.FC<AbsenceDeclarationModalProps> = ({
  isOpen,
  onClose,
  week,
  leagueId,
  playerId,
  playerName,
  absencePolicy,
  onSuccess,
}) => {
  const [reason, setReason] = useState<'travel' | 'injury' | 'personal' | 'other'>('personal');
  const [reasonText, setReasonText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      await declareAbsence(leagueId, week.weekNumber, playerId, playerId, {
        reason,
        reasonText: reason === 'other' ? reasonText : undefined,
        playerName,
        absencePolicy,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to declare absence');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl border border-gray-700 max-w-md w-full p-6">
        <h3 className="text-xl font-bold text-white mb-2">Declare Absence</h3>
        <p className="text-sm text-gray-400 mb-4">
          Week {week.weekNumber} • {new Date(week.scheduledDate).toLocaleDateString('en-NZ', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          })}
        </p>

        {/* Policy Info */}
        <div className="bg-gray-900/50 rounded-lg p-3 mb-4 border border-gray-700">
          <p className="text-xs text-gray-400">
            <span className="text-lime-400">Absence Policy:</span>{' '}
            {formatPolicyName(absencePolicy)}
          </p>
        </div>

        {/* Reason Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Reason for absence
          </label>
          <div className="space-y-2">
            {[
              { value: 'travel' as const, label: '✈️ Travel', desc: 'Away/travelling' },
              { value: 'injury' as const, label: '🩹 Injury', desc: 'Injured or unwell' },
              { value: 'personal' as const, label: '👤 Personal', desc: 'Personal commitment' },
              { value: 'other' as const, label: '📝 Other', desc: 'Other reason' },
            ].map((option) => (
              <label
                key={option.value}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  reason === option.value
                    ? 'bg-lime-500/10 border-lime-500/50'
                    : 'bg-gray-900/50 border-gray-700/50 hover:border-gray-600'
                }`}
              >
                <input
                  type="radio"
                  name="absenceReason"
                  value={option.value}
                  checked={reason === option.value}
                  onChange={() => setReason(option.value)}
                  className="accent-lime-500"
                />
                <div>
                  <div className={`font-medium ${reason === option.value ? 'text-lime-400' : 'text-white'}`}>
                    {option.label}
                  </div>
                  <div className="text-xs text-gray-400">{option.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Custom reason text */}
        {reason === 'other' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Please specify
            </label>
            <input
              type="text"
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder="Enter reason..."
              className="w-full bg-gray-900 border border-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-500"
              maxLength={100}
            />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 mb-4 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || (reason === 'other' && !reasonText.trim())}
            className="flex-1 px-4 py-2 bg-lime-600 hover:bg-lime-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
          >
            {isSubmitting ? 'Submitting...' : 'Confirm Absence'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// SUBSTITUTE ASSIGNMENT MODAL (Organizer)
// ============================================

const SubstituteAssignmentModal: React.FC<SubstituteAssignmentModalProps> = ({
  isOpen,
  onClose,
  week,
  leagueId,
  absence,
  eligibleSubstitutes,
  onSuccess,
}) => {
  const [selectedSubId, setSelectedSubId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAssign = async () => {
    if (!selectedSubId) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await assignSubstitute(leagueId, week.weekNumber, absence.playerId, selectedSubId, absence.declaredByUserId);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign substitute');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl border border-gray-700 max-w-md w-full p-6">
        <h3 className="text-xl font-bold text-white mb-2">Assign Ghost Player</h3>
        <p className="text-sm text-gray-400 mb-4">
          Select a substitute for <span className="text-white">{absence.playerName || absence.playerId}</span>
        </p>

        {/* Info banner */}
        <div className="bg-blue-900/30 rounded-lg p-3 mb-4 border border-blue-600/30">
          <p className="text-xs text-blue-300">
            <span className="font-medium">Note:</span> Ghost players fill the spot so games can happen.
            Results do NOT count for anyone's standings or DUPR rating.
          </p>
        </div>

        {/* Eligible substitutes list */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Eligible Substitutes ({eligibleSubstitutes.length})
          </label>
          {eligibleSubstitutes.length === 0 ? (
            <div className="bg-gray-900/50 rounded-lg p-4 text-center text-gray-400 text-sm">
              No eligible substitutes available
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {eligibleSubstitutes.map((sub) => (
                <label
                  key={sub.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedSubId === sub.id
                      ? 'bg-lime-500/10 border-lime-500/50'
                      : 'bg-gray-900/50 border-gray-700/50 hover:border-gray-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="substitute"
                    value={sub.id}
                    checked={selectedSubId === sub.id}
                    onChange={() => setSelectedSubId(sub.id)}
                    className="accent-lime-500"
                  />
                  <span className={selectedSubId === sub.id ? 'text-lime-400' : 'text-white'}>
                    {sub.name}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 mb-4 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={isSubmitting || !selectedSubId}
            className="flex-1 px-4 py-2 bg-lime-600 hover:bg-lime-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
          >
            {isSubmitting ? 'Assigning...' : 'Assign Substitute'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// WEEK ABSENCE CARD
// ============================================

interface WeekAbsenceCardProps {
  week: BoxLeagueWeek;
  leagueId: string;
  league: League;
  currentUserId: string;
  isOrganizer: boolean;
  members: LeagueMember[];
  myAbsence: WeekAbsence | undefined;
  onDeclareAbsence: (week: BoxLeagueWeek) => void;
  onCancelAbsence: (week: BoxLeagueWeek) => void;
  onAssignSub: (week: BoxLeagueWeek, absence: WeekAbsence) => void;
  onRemoveSub: (week: BoxLeagueWeek, absence: WeekAbsence) => void;
  onMarkNoShow: (week: BoxLeagueWeek, playerId: string, playerName: string) => void;
}

const WeekAbsenceCard: React.FC<WeekAbsenceCardProps> = ({
  week,
  leagueId: _leagueId,
  league: _league,
  currentUserId,
  isOrganizer,
  members,
  myAbsence,
  onDeclareAbsence,
  onCancelAbsence,
  onAssignSub,
  onRemoveSub,
  onMarkNoShow,
}) => {
  const memberMap = useMemo(() => new Map(members.map(m => [m.userId, m])), [members]);

  // Find my box assignment
  const myBox = useMemo(() => {
    for (const box of week.boxAssignments || []) {
      if (box.playerIds.includes(currentUserId)) {
        return box.boxNumber;
      }
    }
    return null;
  }, [week.boxAssignments, currentUserId]);

  // Get all absences for this week
  const absences = week.absences || [];

  // Can I declare absence? Only in draft state
  const canDeclare = week.state === 'draft' && myBox !== null && !myAbsence;
  const canCancel = week.state === 'draft' && myAbsence;

  // State colors
  const stateColors: Record<string, string> = {
    draft: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    active: 'bg-green-500/20 text-green-400 border-green-500/50',
    closing: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
    finalized: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
  };

  const scheduledDate = week.scheduledDate
    ? new Date(week.scheduledDate).toLocaleDateString('en-NZ', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    : 'TBD';

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-900/50 border-b border-gray-700 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h4 className="text-lg font-semibold text-white">Week {week.weekNumber}</h4>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${stateColors[week.state]}`}>
              {week.state.charAt(0).toUpperCase() + week.state.slice(1)}
            </span>
          </div>
          <p className="text-sm text-gray-400">{scheduledDate}</p>
        </div>
        {myBox && (
          <div className="text-right">
            <p className="text-xs text-gray-400">Your Box</p>
            <p className="text-lg font-bold text-lime-400">Box {myBox}</p>
          </div>
        )}
      </div>

      {/* My Absence Status */}
      {myAbsence && (
        <div className="px-4 py-3 bg-orange-900/20 border-b border-orange-600/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-400 font-medium">
                {myAbsence.isNoShow ? '❌ Marked as No-Show' : '📋 Absence Declared'}
              </p>
              <p className="text-sm text-gray-400">
                Reason: {myAbsence.reason || 'Not specified'}
                {myAbsence.substituteId && (
                  <span className="ml-2">
                    • Ghost: {memberMap.get(myAbsence.substituteId)?.displayName || 'Unknown'}
                  </span>
                )}
              </p>
            </div>
            {canCancel && (
              <button
                onClick={() => onCancelAbsence(week)}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* Player Actions */}
      {!isOrganizer && canDeclare && (
        <div className="px-4 py-4">
          <button
            onClick={() => onDeclareAbsence(week)}
            className="w-full px-4 py-3 bg-gray-700 hover:bg-gray-600 border border-gray-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            <span>📋</span>
            <span>Declare Absence for This Week</span>
          </button>
          <p className="text-xs text-gray-500 mt-2 text-center">
            You can only declare absence while the week is in draft state
          </p>
        </div>
      )}

      {/* Not assigned */}
      {!myBox && !isOrganizer && (
        <div className="px-4 py-4 text-center text-gray-400">
          You are not assigned to this week
        </div>
      )}

      {/* Organizer View: All Absences */}
      {isOrganizer && (
        <div className="px-4 py-3">
          <h5 className="text-sm font-medium text-gray-300 mb-2">
            Absences ({absences.length})
          </h5>

          {absences.length === 0 ? (
            <p className="text-sm text-gray-500">No absences declared</p>
          ) : (
            <div className="space-y-2">
              {absences.map((absence) => {
                const member = memberMap.get(absence.playerId);
                return (
                  <div
                    key={absence.playerId}
                    className="flex items-center justify-between bg-gray-900/50 rounded-lg p-3"
                  >
                    <div>
                      <p className="text-white font-medium">
                        {absence.playerName || member?.displayName || 'Unknown'}
                        <span className="ml-2 text-xs text-gray-400">Box {absence.boxNumber}</span>
                      </p>
                      <p className="text-xs text-gray-400">
                        {absence.isNoShow ? '❌ No-show' : `📋 ${absence.reason || 'Personal'}`}
                        {absence.substituteId && (
                          <span className="ml-2 text-lime-400">
                            → Ghost: {memberMap.get(absence.substituteId)?.displayName || 'Unknown'}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {!absence.substituteId && week.state !== 'finalized' && (
                        <button
                          onClick={() => onAssignSub(week, absence)}
                          className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium transition-colors"
                        >
                          Assign Sub
                        </button>
                      )}
                      {absence.substituteId && week.state === 'draft' && (
                        <button
                          onClick={() => onRemoveSub(week, absence)}
                          className="px-2 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded text-xs font-medium transition-colors"
                        >
                          Remove Sub
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Mark No-Show (only during active state) */}
          {week.state === 'active' && (
            <div className="mt-3 pt-3 border-t border-gray-700">
              <p className="text-xs text-gray-400 mb-2">Mark player as no-show:</p>
              <div className="flex flex-wrap gap-2">
                {(week.boxAssignments || []).flatMap(box =>
                  box.playerIds
                    .filter(pid => !absences.some(a => a.playerId === pid))
                    .map(pid => {
                      const m = memberMap.get(pid);
                      return (
                        <button
                          key={pid}
                          onClick={() => onMarkNoShow(week, pid, m?.displayName || 'Unknown')}
                          className="px-2 py-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/50 rounded text-xs font-medium transition-colors"
                        >
                          {m?.displayName || pid.slice(0, 8)}
                        </button>
                      );
                    })
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

export const BoxLeagueAbsencePanel: React.FC<BoxLeagueAbsencePanelProps> = ({
  leagueId,
  league,
  members,
  currentUserId,
  isOrganizer,
}) => {
  // State
  const [weeks, setWeeks] = useState<BoxLeagueWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [declaringFor, setDeclaringFor] = useState<BoxLeagueWeek | null>(null);
  const [assigningSubFor, setAssigningSubFor] = useState<{ week: BoxLeagueWeek; absence: WeekAbsence } | null>(null);
  const [eligibleSubs, setEligibleSubs] = useState<{ id: string; name: string }[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  // Get absence policy from league settings
  const absencePolicy: AbsencePolicyType = league.settings?.rotatingDoublesBox?.settings?.absencePolicy?.policy || 'freeze';

  // Fetch weeks
  useEffect(() => {
    const weeksRef = collection(db, 'leagues', leagueId, 'boxWeeks');
    const q = query(weeksRef, orderBy('weekNumber', 'asc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const weekData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as BoxLeagueWeek));
        setWeeks(weekData);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching box weeks:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [leagueId]);

  // Filter to show upcoming/active weeks (not finalized)
  const upcomingWeeks = useMemo(() => {
    return weeks.filter(w => w.state !== 'finalized');
  }, [weeks]);

  // Get my absences
  const myAbsences = useMemo(() => {
    const absenceMap = new Map<number, WeekAbsence>();
    for (const week of weeks) {
      const myAbsence = (week.absences || []).find(a => a.playerId === currentUserId);
      if (myAbsence) {
        absenceMap.set(week.weekNumber, myAbsence);
      }
    }
    return absenceMap;
  }, [weeks, currentUserId]);

  // Handlers
  const handleDeclareAbsence = (week: BoxLeagueWeek) => {
    setDeclaringFor(week);
  };

  const handleCancelAbsence = async (week: BoxLeagueWeek) => {
    try {
      await cancelAbsence(leagueId, week.weekNumber, currentUserId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to cancel absence');
    }
  };

  const handleAssignSub = async (week: BoxLeagueWeek, absence: WeekAbsence) => {
    // Fetch eligible substitutes
    const settings = league.settings?.rotatingDoublesBox?.settings?.substituteEligibility || {
      subMustBeMember: false,
      subAllowedFromBoxes: 'same_or_lower' as const,
      subMustHaveDuprLinked: false,
      subMustHaveDuprConsent: false,
    };

    try {
      const eligibleIds = await getEligibleSubstitutes(leagueId, absence.playerId, week, settings);
      const memberMap = new Map(members.map(m => [m.userId, m]));
      const subs = eligibleIds.map(id => ({
        id,
        name: memberMap.get(id)?.displayName || 'Unknown',
      }));
      setEligibleSubs(subs);
      setAssigningSubFor({ week, absence });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to fetch eligible substitutes');
    }
  };

  const handleRemoveSub = async (week: BoxLeagueWeek, absence: WeekAbsence) => {
    try {
      await removeSubstitute(leagueId, week.weekNumber, absence.playerId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to remove substitute');
    }
  };

  const handleMarkNoShow = async (week: BoxLeagueWeek, playerId: string, playerName: string) => {
    try {
      await recordNoShowAbsence(leagueId, week.weekNumber, playerId, currentUserId, {
        playerName,
        absencePolicy,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to mark no-show');
    }
  };

  // Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-lime-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  // No weeks
  if (weeks.length === 0) {
    return (
      <div className="bg-gray-800/50 rounded-xl p-6 text-center border border-gray-700">
        <div className="text-4xl mb-3">📅</div>
        <h3 className="text-lg font-medium text-white mb-2">No Weeks Scheduled</h3>
        <p className="text-gray-400 text-sm">
          Generate a schedule from the Schedule tab to create weeks.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <span>📋</span> Absence Management
            </h3>
            <p className="text-sm text-gray-400 mt-1">
              {isOrganizer
                ? 'View and manage player absences and substitutes'
                : 'Declare your absence for upcoming weeks'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Absence Policy</p>
            <p className="text-sm font-medium text-lime-400">{formatPolicyName(absencePolicy)}</p>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {actionError && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 flex items-center justify-between">
          <p className="text-red-400 text-sm">{actionError}</p>
          <button
            onClick={() => setActionError(null)}
            className="text-red-400 hover:text-red-300"
          >
            ✕
          </button>
        </div>
      )}

      {/* Upcoming Weeks */}
      {upcomingWeeks.length === 0 ? (
        <div className="bg-gray-800/50 rounded-xl p-6 text-center border border-gray-700">
          <p className="text-gray-400">All weeks are finalized. No upcoming weeks.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {upcomingWeeks.map((week) => (
            <WeekAbsenceCard
              key={week.weekNumber}
              week={week}
              leagueId={leagueId}
              league={league}
              currentUserId={currentUserId}
              isOrganizer={isOrganizer}
              members={members}
              myAbsence={myAbsences.get(week.weekNumber)}
              onDeclareAbsence={handleDeclareAbsence}
              onCancelAbsence={handleCancelAbsence}
              onAssignSub={handleAssignSub}
              onRemoveSub={handleRemoveSub}
              onMarkNoShow={handleMarkNoShow}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {declaringFor && (
        <AbsenceDeclarationModal
          isOpen={true}
          onClose={() => setDeclaringFor(null)}
          week={declaringFor}
          leagueId={leagueId}
          playerId={currentUserId}
          playerName={members.find(m => m.userId === currentUserId)?.displayName || 'Unknown'}
          absencePolicy={absencePolicy}
          onSuccess={() => setDeclaringFor(null)}
        />
      )}

      {assigningSubFor && (
        <SubstituteAssignmentModal
          isOpen={true}
          onClose={() => setAssigningSubFor(null)}
          week={assigningSubFor.week}
          leagueId={leagueId}
          absence={assigningSubFor.absence}
          eligibleSubstitutes={eligibleSubs}
          onSuccess={() => setAssigningSubFor(null)}
        />
      )}
    </div>
  );
};

export default BoxLeagueAbsencePanel;
