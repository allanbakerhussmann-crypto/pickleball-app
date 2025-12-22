/**
 * PostponedMatchesList Component V05.37
 * 
 * Displays all postponed matches in a league with options to reschedule.
 * Used by organizers to manage and track postponed matches.
 * 
 * Features:
 * - Lists all postponed matches grouped by week
 * - Shows postpone reason, original date, and makeup deadline
 * - Highlights overdue makeup deadlines in red
 * - Quick reschedule button for each match
 * - Bulk reschedule option for entire weeks
 * 
 * FILE LOCATION: components/leagues/PostponedMatchesList.tsx
 * VERSION: V05.37
 */

import React, { useState, useMemo } from 'react';
import type { LeagueMatch } from '../../types';
import { PostponeMatchModal } from './PostponeMatchModal';

// ============================================
// TYPES
// ============================================

interface PostponedMatchesListProps {
  matches: LeagueMatch[];
  leagueId: string;
  currentUserId: string;
  currentUserName: string;
  isOrganizer: boolean;
  onMatchUpdated: () => void;
}

// ============================================
// COMPONENT
// ============================================

export const PostponedMatchesList: React.FC<PostponedMatchesListProps> = ({
  matches,
  leagueId,
  currentUserId,
  currentUserName,
  isOrganizer,
  onMatchUpdated,
}) => {
  // State
  const [rescheduleMatch, setRescheduleMatch] = useState<LeagueMatch | null>(null);
  const [sortBy, setSortBy] = useState<'week' | 'deadline' | 'date'>('deadline');
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);

  // ============================================
  // COMPUTED VALUES
  // ============================================

  // Filter to only postponed matches
  const postponedMatches = useMemo(() => {
    return matches.filter(m => m.status === 'postponed');
  }, [matches]);

  // Count overdue matches
  const overdueCount = useMemo(() => {
    const now = Date.now();
    return postponedMatches.filter(m => m.makeupDeadline && m.makeupDeadline < now).length;
  }, [postponedMatches]);

  // Sort and filter matches
  const sortedMatches = useMemo(() => {
    let result = [...postponedMatches];
    
    // Filter overdue only
    if (showOverdueOnly) {
      const now = Date.now();
      result = result.filter(m => m.makeupDeadline && m.makeupDeadline < now);
    }
    
    // Sort
    switch (sortBy) {
      case 'week':
        result.sort((a, b) => (a.weekNumber || 0) - (b.weekNumber || 0));
        break;
      case 'deadline':
        result.sort((a, b) => {
          // Overdue first, then by deadline
          const now = Date.now();
          const aOverdue = a.makeupDeadline && a.makeupDeadline < now;
          const bOverdue = b.makeupDeadline && b.makeupDeadline < now;
          if (aOverdue && !bOverdue) return -1;
          if (!aOverdue && bOverdue) return 1;
          return (a.makeupDeadline || Infinity) - (b.makeupDeadline || Infinity);
        });
        break;
      case 'date':
        result.sort((a, b) => (a.postponedAt || 0) - (b.postponedAt || 0));
        break;
    }
    
    return result;
  }, [postponedMatches, sortBy, showOverdueOnly]);

  // Group by week
  const matchesByWeek = useMemo(() => {
    const grouped: Record<number, LeagueMatch[]> = {};
    sortedMatches.forEach(m => {
      const week = m.weekNumber || 0;
      if (!grouped[week]) grouped[week] = [];
      grouped[week].push(m);
    });
    return grouped;
  }, [sortedMatches]);

  // ============================================
  // HELPERS
  // ============================================

  const formatDate = (timestamp: number | null | undefined) => {
    if (!timestamp) return 'Not set';
    return new Date(timestamp).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const getDaysUntilDeadline = (deadline: number | null | undefined) => {
    if (!deadline) return null;
    const now = Date.now();
    const days = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
    return days;
  };

  const getDeadlineStatus = (deadline: number | null | undefined) => {
    const days = getDaysUntilDeadline(deadline);
    if (days === null) return { color: 'text-gray-400', label: 'No deadline' };
    if (days < 0) return { color: 'text-red-400', label: `${Math.abs(days)} days overdue` };
    if (days === 0) return { color: 'text-red-400', label: 'Due today' };
    if (days === 1) return { color: 'text-orange-400', label: 'Due tomorrow' };
    if (days <= 3) return { color: 'text-yellow-400', label: `${days} days left` };
    return { color: 'text-gray-400', label: `${days} days left` };
  };

  // ============================================
  // HANDLERS
  // ============================================

  const handleReschedule = (match: LeagueMatch) => {
    setRescheduleMatch(match);
  };

  const handleRescheduleSuccess = () => {
    setRescheduleMatch(null);
    onMatchUpdated();
  };

  // ============================================
  // RENDER
  // ============================================

  if (postponedMatches.length === 0) {
    return (
      <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 text-center">
        <div className="text-4xl mb-3">✅</div>
        <h3 className="text-lg font-semibold text-white mb-2">No Postponed Matches</h3>
        <p className="text-gray-400 text-sm">All matches are on schedule!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header & Controls */}
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              ⏸️ Postponed Matches
              <span className="text-sm font-normal bg-yellow-600/20 text-yellow-400 px-2 py-0.5 rounded">
                {postponedMatches.length}
              </span>
              {overdueCount > 0 && (
                <span className="text-sm font-normal bg-red-600/20 text-red-400 px-2 py-0.5 rounded">
                  {overdueCount} overdue
                </span>
              )}
            </h3>
            <p className="text-sm text-gray-400 mt-1">
              Matches that need to be rescheduled
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Overdue filter */}
            {overdueCount > 0 && (
              <button
                onClick={() => setShowOverdueOnly(!showOverdueOnly)}
                className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
                  showOverdueOnly
                    ? 'bg-red-600 text-white'
                    : 'bg-red-600/20 text-red-400 hover:bg-red-600/30'
                }`}
              >
                {showOverdueOnly ? 'Show All' : '🚨 Overdue Only'}
              </button>
            )}

            {/* Sort dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'week' | 'deadline' | 'date')}
              className="bg-gray-900 border border-gray-700 text-white text-sm px-3 py-1.5 rounded-lg"
            >
              <option value="deadline">Sort by Deadline</option>
              <option value="week">Sort by Week</option>
              <option value="date">Sort by Postponed Date</option>
            </select>
          </div>
        </div>
      </div>

      {/* Match List - Grouped by Week when sorted by week */}
      {sortBy === 'week' ? (
        // Grouped view
        <div className="space-y-4">
          {Object.entries(matchesByWeek)
            .sort(([a], [b]) => parseInt(a) - parseInt(b))
            .map(([weekNum, weekMatches]) => (
              <div key={weekNum} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                <div className="bg-gray-900 px-4 py-3 border-b border-gray-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">Week {weekNum}</span>
                    <span className="text-sm text-gray-400">
                      {weekMatches.length} match{weekMatches.length !== 1 ? 'es' : ''}
                    </span>
                  </div>
                  {isOrganizer && weekMatches.length > 1 && (
                    <button
                      onClick={() => handleReschedule(weekMatches[0])}
                      className="text-xs bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 px-2 py-1 rounded transition-colors"
                    >
                      Reschedule Week
                    </button>
                  )}
                </div>
                <div className="divide-y divide-gray-700">
                  {weekMatches.map(match => (
                    <MatchRow 
                      key={match.id}
                      match={match}
                      isOrganizer={isOrganizer}
                      onReschedule={handleReschedule}
                      formatDate={formatDate}
                      getDeadlineStatus={getDeadlineStatus}
                    />
                  ))}
                </div>
              </div>
            ))}
        </div>
      ) : (
        // Flat list view
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="divide-y divide-gray-700">
            {sortedMatches.map(match => (
              <MatchRow 
                key={match.id}
                match={match}
                isOrganizer={isOrganizer}
                onReschedule={handleReschedule}
                formatDate={formatDate}
                getDeadlineStatus={getDeadlineStatus}
                showWeek
              />
            ))}
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-yellow-400">{postponedMatches.length}</div>
            <div className="text-xs text-gray-500">Total Postponed</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-400">{overdueCount}</div>
            <div className="text-xs text-gray-500">Overdue</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-400">
              {Object.keys(matchesByWeek).length}
            </div>
            <div className="text-xs text-gray-500">Affected Weeks</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-400">
              {postponedMatches.filter(m => m.makeupDeadline).length}
            </div>
            <div className="text-xs text-gray-500">With Deadlines</div>
          </div>
        </div>
      </div>

      {/* Reschedule Modal */}
      {rescheduleMatch && (
        <PostponeMatchModal
          isOpen={true}
          onClose={() => setRescheduleMatch(null)}
          match={rescheduleMatch}
          leagueId={leagueId}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          onSuccess={handleRescheduleSuccess}
        />
      )}
    </div>
  );
};

// ============================================
// MATCH ROW SUB-COMPONENT
// ============================================

interface MatchRowProps {
  match: LeagueMatch;
  isOrganizer: boolean;
  onReschedule: (match: LeagueMatch) => void;
  formatDate: (timestamp: number | null | undefined) => string;
  getDeadlineStatus: (deadline: number | null | undefined) => { color: string; label: string };
  showWeek?: boolean;
}

const MatchRow: React.FC<MatchRowProps> = ({
  match,
  isOrganizer,
  onReschedule,
  formatDate,
  getDeadlineStatus,
  showWeek = false,
}) => {
  const deadlineStatus = getDeadlineStatus(match.makeupDeadline);
  const isOverdue = match.makeupDeadline && match.makeupDeadline < Date.now();

  return (
    <div className={`p-4 ${isOverdue ? 'bg-red-900/10' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        {/* Match Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-white">
              {match.memberAName} vs {match.memberBName}
            </span>
            {showWeek && (
              <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded">
                Week {match.weekNumber}
              </span>
            )}
          </div>

          {/* Postpone Details */}
          <div className="text-sm text-gray-400 space-y-1">
            {match.postponedReason && (
              <div className="flex items-start gap-2">
                <span className="text-gray-500">Reason:</span>
                <span>{match.postponedReason}</span>
              </div>
            )}
            {match.originalScheduledDate && (
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Originally:</span>
                <span>{formatDate(match.originalScheduledDate)}</span>
              </div>
            )}
            {match.makeupDeadline && (
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Makeup by:</span>
                <span className={deadlineStatus.color}>
                  {formatDate(match.makeupDeadline)} ({deadlineStatus.label})
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Deadline Badge */}
          {isOverdue && (
            <span className="text-xs bg-red-600/20 text-red-400 px-2 py-1 rounded font-medium">
              🚨 OVERDUE
            </span>
          )}

          {/* Reschedule Button */}
          {isOrganizer && (
            <button
              onClick={() => onReschedule(match)}
              className="px-3 py-1.5 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 rounded text-sm font-medium transition-colors"
            >
              📅 Reschedule
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PostponedMatchesList;