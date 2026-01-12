/**
 * Box League Standings Component V07.42
 *
 * Complete standings UI for rotating doubles box leagues.
 * Shows Overall season ladder + Weekly tabs with per-box standings.
 * Includes promotion/relegation indicators, movement summaries, and tiebreak explanations.
 *
 * FILE LOCATION: components/leagues/boxLeague/BoxLeagueStandings.tsx
 * VERSION: V07.42
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, query, orderBy, onSnapshot, doc, getDoc, getDocs, where } from '@firebase/firestore';
import { db } from '../../../services/firebase/config';
// V07.36: Import recalculate function
// V07.41: Week lifecycle functions removed - now only used in Schedule tab
import { recalculateWeekStandings } from '../../../services/rotatingDoublesBox';
import type { LeagueMember, UserProfile, LeagueMatch } from '../../../types';
import type {
  BoxLeagueWeek,
  BoxStanding,
  BoxStandingsSnapshot,
  PlayerMovement,
  BoxAssignment,
} from '../../../types/rotatingDoublesBox';

// ============================================
// TYPES
// ============================================

interface BoxLeagueStandingsProps {
  leagueId: string;
  members: LeagueMember[];
  matches: LeagueMatch[];  // V07.41: Add matches prop to compute accurate counts
  isOrganizer: boolean;
  currentUserId?: string;
}

interface PlayerWithRating {
  odUserId: string;
  displayName: string;
  duprRating?: number;
}

// Box colors - gradient from darker (top box) to lighter (bottom box)
const BOX_COLORS = [
  { bg: 'bg-blue-900', border: 'border-blue-700' },
  { bg: 'bg-blue-800', border: 'border-blue-600' },
  { bg: 'bg-blue-700', border: 'border-blue-500' },
  { bg: 'bg-sky-700', border: 'border-sky-500' },
  { bg: 'bg-sky-600', border: 'border-sky-400' },
  { bg: 'bg-cyan-600', border: 'border-cyan-400' },
  { bg: 'bg-cyan-500', border: 'border-cyan-300' },
  { bg: 'bg-teal-500', border: 'border-teal-300' },
];

const getBoxColors = (boxNumber: number) => {
  const index = Math.min(boxNumber - 1, BOX_COLORS.length - 1);
  return BOX_COLORS[index] || BOX_COLORS[BOX_COLORS.length - 1];
};

// ============================================
// WEEK HEADER COMPONENT
// ============================================

interface WeekHeaderProps {
  week: BoxLeagueWeek;
  isOrganizer: boolean;
  completedMatches: number;  // V07.41: Computed from actual matches
  totalMatches: number;      // V07.41: Computed from actual matches
  onRecalculate?: () => void;
  // V07.41: All week lifecycle props removed - management now only in Schedule tab
  isRecalculating?: boolean;
}

const WeekHeader: React.FC<WeekHeaderProps> = ({
  week,
  isOrganizer,
  completedMatches,  // V07.41
  totalMatches,      // V07.41
  onRecalculate,
  isRecalculating,
}) => {
  const stateColors = {
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
        year: 'numeric',
      })
    : null;

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 mb-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        {/* Week Info */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-xl font-bold text-white">Week {week.weekNumber}</h3>
            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${stateColors[week.state]}`}>
              {week.state.charAt(0).toUpperCase() + week.state.slice(1)}
            </span>
          </div>
          {scheduledDate && (
            <p className="text-sm text-gray-400">{scheduledDate}</p>
          )}
          <div className="flex items-center gap-4 mt-2 text-sm">
            <span className="text-gray-400">
              Matches: <span className="text-white font-medium">
                {completedMatches} / {totalMatches}
              </span>
            </span>
            {week.pendingVerificationCount > 0 && (
              <span className="text-yellow-400">
                {week.pendingVerificationCount} pending verification
              </span>
            )}
            {week.disputedCount > 0 && (
              <span className="text-red-400">
                {week.disputedCount} disputed
              </span>
            )}
          </div>
        </div>

        {/* Organizer Controls */}
        {isOrganizer && (
          <div className="flex items-center gap-2">
            {week.state !== 'finalized' && onRecalculate && (
              <button
                onClick={onRecalculate}
                disabled={isRecalculating}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {isRecalculating ? 'Calculating...' : 'Recalculate'}
              </button>
            )}
            {/* V07.41: All week lifecycle buttons moved to Schedule tab (Refresh Boxes, Activate, Close, Finalize) */}
          </div>
        )}
      </div>

      {/* Tiebreaker info */}
      {week.rulesSnapshot && (
        <div className="mt-3 pt-3 border-t border-gray-700">
          <p className="text-xs text-gray-500">
            Tiebreakers: {week.rulesSnapshot.tiebreakers?.join(' → ') || 'wins → head_to_head → points_diff → points_for'}
          </p>
        </div>
      )}
    </div>
  );
};

// ============================================
// BOX STANDINGS TABLE COMPONENT
// ============================================

interface BoxStandingsTableProps {
  boxNumber: number;
  standings: BoxStanding[];
  totalBoxes: number;
  promotionCount?: number;
  relegationCount?: number;
  absences?: { playerId: string }[];
  tiebreakExplanations?: string[];
}

const BoxStandingsTable: React.FC<BoxStandingsTableProps> = ({
  boxNumber,
  standings,
  totalBoxes,
  promotionCount = 1,
  relegationCount = 1,
  absences = [],
  tiebreakExplanations = [],
}) => {
  const colors = getBoxColors(boxNumber);
  const absentPlayerIds = new Set(absences.map(a => a.playerId));

  const getMovementDisplay = (position: number, total: number): { icon: string; text: string; color: string } => {
    // Top box can't promote
    if (boxNumber === 1) {
      if (position > total - relegationCount) {
        return { icon: '▼', text: 'Relegate', color: 'text-red-400' };
      }
      return { icon: '—', text: 'Stay', color: 'text-gray-500' };
    }

    // Bottom box can't relegate
    if (boxNumber === totalBoxes) {
      if (position <= promotionCount) {
        return { icon: '▲', text: 'Promote', color: 'text-green-400' };
      }
      return { icon: '—', text: 'Stay', color: 'text-gray-500' };
    }

    // Middle boxes
    if (position <= promotionCount) {
      return { icon: '▲', text: 'Promote', color: 'text-green-400' };
    }
    if (position > total - relegationCount) {
      return { icon: '▼', text: 'Relegate', color: 'text-red-400' };
    }
    return { icon: '—', text: 'Stay', color: 'text-gray-500' };
  };

  return (
    <div className={`rounded-xl border ${colors.border} overflow-hidden mb-4`}>
      {/* Box Header */}
      <div className={`${colors.bg} px-4 py-3 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold text-white">Box {boxNumber}</span>
          <span className="text-sm text-white/70">{standings.length} players</span>
        </div>
        {boxNumber === 1 && (
          <span className="px-2 py-1 bg-yellow-400/20 text-yellow-400 rounded text-xs font-medium">
            Top Box
          </span>
        )}
        {boxNumber === totalBoxes && (
          <span className="px-2 py-1 bg-gray-600/50 text-gray-400 rounded text-xs font-medium">
            Entry Box
          </span>
        )}
      </div>

      {/* Standings Table */}
      <table className="w-full">
        <thead>
          <tr className="bg-gray-900/50 text-xs text-gray-400 uppercase tracking-wider">
            <th className="px-3 py-2 text-center w-12">Pos</th>
            <th className="px-3 py-2 text-left">Player</th>
            <th className="px-3 py-2 text-center w-12">MP</th>
            <th className="px-3 py-2 text-center w-12">W</th>
            <th className="px-3 py-2 text-center w-12">L</th>
            <th className="px-3 py-2 text-center w-14">PF</th>
            <th className="px-3 py-2 text-center w-14">PA</th>
            <th className="px-3 py-2 text-center w-14">Diff</th>
            <th className="px-3 py-2 text-center w-24">Movement</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((player, index) => {
            const movement = getMovementDisplay(player.positionInBox, standings.length);
            const isAbsent = absentPlayerIds.has(player.playerId);
            const diff = player.pointsFor - player.pointsAgainst;

            return (
              <tr
                key={player.playerId}
                className={`
                  ${colors.bg} border-t border-gray-700/30
                  hover:brightness-110 transition-all
                `}
              >
                <td className="px-3 py-2 text-center">
                  <span className="text-white font-bold">{player.positionInBox}</span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">{player.playerName}</span>
                    {isAbsent && (
                      <span className="px-1.5 py-0.5 bg-gray-600 text-gray-300 rounded text-xs">
                        Absent
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-center text-white/80">{player.matchesPlayed}</td>
                <td className="px-3 py-2 text-center text-green-400 font-medium">{player.wins}</td>
                <td className="px-3 py-2 text-center text-red-400 font-medium">{player.losses}</td>
                <td className="px-3 py-2 text-center text-white/80">{player.pointsFor}</td>
                <td className="px-3 py-2 text-center text-white/80">{player.pointsAgainst}</td>
                <td className="px-3 py-2 text-center">
                  <span className={diff > 0 ? 'text-green-400' : diff < 0 ? 'text-red-400' : 'text-gray-400'}>
                    {diff > 0 ? '+' : ''}{diff}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`font-bold ${movement.color}`}>
                    {movement.icon} <span className="text-xs ml-1">{movement.text}</span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Tiebreak Explanations */}
      {tiebreakExplanations.length > 0 && (
        <div className="px-4 py-2 bg-gray-900/50 border-t border-gray-700">
          <p className="text-xs text-gray-400">
            <span className="text-yellow-400">ℹ️ Tiebreak applied:</span>{' '}
            {tiebreakExplanations.join('. ')}
          </p>
        </div>
      )}
    </div>
  );
};

// ============================================
// MOVEMENT SUMMARY COMPONENT
// ============================================

interface MovementSummaryProps {
  movements: PlayerMovement[];
  nextWeekExists: boolean;
  nextWeekNumber: number;
}

const MovementSummary: React.FC<MovementSummaryProps> = ({
  movements,
  nextWeekExists,
  nextWeekNumber,
}) => {
  const promotions = movements.filter(m => m.reason === 'promotion');
  const relegations = movements.filter(m => m.reason === 'relegation');

  if (promotions.length === 0 && relegations.length === 0) {
    return null;
  }

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 mt-4">
      <h4 className="text-lg font-semibold text-white mb-3">Promotion / Relegation Summary</h4>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Promotions */}
        {promotions.length > 0 && (
          <div className="bg-green-900/20 rounded-lg p-3 border border-green-500/30">
            <h5 className="text-green-400 font-medium text-sm mb-2 flex items-center gap-2">
              <span>▲</span> Promoted ({promotions.length})
            </h5>
            <ul className="space-y-1">
              {promotions.map(m => (
                <li key={m.playerId} className="text-sm text-gray-300">
                  {m.playerName}: Box {m.fromBox} → Box {m.toBox}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Relegations */}
        {relegations.length > 0 && (
          <div className="bg-red-900/20 rounded-lg p-3 border border-red-500/30">
            <h5 className="text-red-400 font-medium text-sm mb-2 flex items-center gap-2">
              <span>▼</span> Relegated ({relegations.length})
            </h5>
            <ul className="space-y-1">
              {relegations.map(m => (
                <li key={m.playerId} className="text-sm text-gray-300">
                  {m.playerName}: Box {m.fromBox} → Box {m.toBox}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Next Week Status */}
      <div className="mt-3 pt-3 border-t border-gray-700">
        {nextWeekExists ? (
          <p className="text-sm text-green-400">
            ✅ Week {nextWeekNumber} draft created
          </p>
        ) : (
          <p className="text-sm text-gray-400">
            Week {nextWeekNumber} draft not created yet
          </p>
        )}
      </div>
    </div>
  );
};

// ============================================
// OVERALL SEASON LADDER COMPONENT
// ============================================

interface SeasonLadderProps {
  weeks: BoxLeagueWeek[];
  members: LeagueMember[];
  userRatings: Map<string, number | undefined>;
}

const SeasonLadder: React.FC<SeasonLadderProps> = ({ weeks, members, userRatings }) => {
  // Get latest finalized or active week for current positions
  const latestWeek = [...weeks]
    .filter(w => w.state === 'finalized' || w.state === 'active' || w.state === 'closing')
    .sort((a, b) => b.weekNumber - a.weekNumber)[0];

  // Get previous week for trend calculation
  const previousWeek = [...weeks]
    .filter(w => w.state === 'finalized' && w.weekNumber < (latestWeek?.weekNumber || 0))
    .sort((a, b) => b.weekNumber - a.weekNumber)[0];

  // Build player data with current box/position
  const memberMap = new Map(members.map(m => [m.userId, m]));

  const playerData = useMemo(() => {
    if (!latestWeek?.boxAssignments) return [];

    const data: {
      odUserId: string;
      displayName: string;
      currentBox: number;
      positionInBox: number;
      duprRating?: number;
      trend: 'up' | 'down' | 'same';
      // Season stats would come from aggregated match data
      seasonWins: number;
      seasonLosses: number;
      seasonDiff: number;
    }[] = [];

    // Get current positions from latest week
    for (const box of latestWeek.boxAssignments) {
      box.playerIds.forEach((userId, index) => {
        const member = memberMap.get(userId);
        const rating = userRatings.get(userId);

        // Calculate trend from previous week movements
        let trend: 'up' | 'down' | 'same' = 'same';
        if (previousWeek?.movements) {
          const movement = previousWeek.movements.find(m => m.playerId === userId);
          if (movement) {
            if (movement.reason === 'promotion') trend = 'up';
            else if (movement.reason === 'relegation') trend = 'down';
          }
        }

        // Get season stats and position from standings snapshot if available
        let seasonWins = 0, seasonLosses = 0, seasonDiff = 0;
        let actualPosition = index + 1; // Fallback to array index
        if (latestWeek.standingsSnapshot?.boxes) {
          const standing = latestWeek.standingsSnapshot.boxes.find(s => s.playerId === userId);
          if (standing) {
            seasonWins = standing.wins;
            seasonLosses = standing.losses;
            seasonDiff = standing.pointsFor - standing.pointsAgainst;
            actualPosition = standing.positionInBox; // Use actual standings position
          }
        }

        data.push({
          odUserId: userId,
          displayName: member?.displayName || 'Unknown Player',
          currentBox: box.boxNumber,
          positionInBox: actualPosition,
          duprRating: rating,
          trend,
          seasonWins,
          seasonLosses,
          seasonDiff,
        });
      });
    }

    // Sort by box number, then position in box
    return data.sort((a, b) => {
      if (a.currentBox !== b.currentBox) return a.currentBox - b.currentBox;
      return a.positionInBox - b.positionInBox;
    });
  }, [latestWeek, previousWeek, memberMap, userRatings]);

  if (playerData.length === 0) {
    return (
      <div className="bg-gray-800/50 rounded-xl p-6 text-center border border-gray-700">
        <p className="text-gray-400">No season data available yet. Generate a schedule to begin.</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      <div className="px-4 py-3 bg-lime-900/30 border-b border-lime-600/50">
        <h3 className="text-lg font-semibold text-white">Season Ladder</h3>
        <p className="text-sm text-gray-400">
          Based on Week {latestWeek?.weekNumber || 1} standings
        </p>
      </div>

      <table className="w-full">
        <thead>
          <tr className="bg-gray-900/50 text-xs text-gray-400 uppercase tracking-wider">
            <th className="px-3 py-2 text-center w-12">Rank</th>
            <th className="px-3 py-2 text-left">Player</th>
            <th className="px-3 py-2 text-center">Box • Pos</th>
            <th className="px-3 py-2 text-center w-16">DUPR</th>
            <th className="px-3 py-2 text-center w-12">W</th>
            <th className="px-3 py-2 text-center w-12">L</th>
            <th className="px-3 py-2 text-center w-14">Diff</th>
            <th className="px-3 py-2 text-center w-16">Trend</th>
          </tr>
        </thead>
        <tbody>
          {playerData.map((player, index) => {
            const colors = getBoxColors(player.currentBox);
            return (
              <tr
                key={player.odUserId}
                className={`${colors.bg} border-t border-gray-700/30 hover:brightness-110 transition-all`}
              >
                <td className="px-3 py-2 text-center">
                  <span className="text-white font-bold">{index + 1}</span>
                </td>
                <td className="px-3 py-2">
                  <span className="text-white font-medium">{player.displayName}</span>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className="text-white/80">Box {player.currentBox} • #{player.positionInBox}</span>
                </td>
                <td className="px-3 py-2 text-center text-white/70 text-sm">
                  {player.duprRating?.toFixed(2) || '-'}
                </td>
                <td className="px-3 py-2 text-center text-green-400 font-medium">{player.seasonWins}</td>
                <td className="px-3 py-2 text-center text-red-400 font-medium">{player.seasonLosses}</td>
                <td className="px-3 py-2 text-center">
                  <span className={player.seasonDiff > 0 ? 'text-green-400' : player.seasonDiff < 0 ? 'text-red-400' : 'text-gray-400'}>
                    {player.seasonDiff > 0 ? '+' : ''}{player.seasonDiff}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  {player.trend === 'up' && <span className="text-green-400 font-bold">▲</span>}
                  {player.trend === 'down' && <span className="text-red-400 font-bold">▼</span>}
                  {player.trend === 'same' && <span className="text-gray-500">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

export const BoxLeagueStandings: React.FC<BoxLeagueStandingsProps> = ({
  leagueId,
  members,
  matches,  // V07.41: Receive matches to compute accurate counts
  isOrganizer,
  currentUserId,
}) => {
  // State
  const [weeks, setWeeks] = useState<BoxLeagueWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('overall');
  const [selectedBox, setSelectedBox] = useState<number>(1);
  const [userRatings, setUserRatings] = useState<Map<string, number | undefined>>(new Map());
  const [isRecalculating, setIsRecalculating] = useState(false);

  // Fetch weeks from boxWeeks collection
  useEffect(() => {
    const weeksRef = collection(db, 'leagues', leagueId, 'boxWeeks');
    const q = query(weeksRef, orderBy('weekNumber', 'asc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const weekData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as BoxLeagueWeek));
        setWeeks(weekData);
        setLoading(false);

        // Auto-select first week if no weeks selected yet
        if (weekData.length > 0 && activeTab === 'overall') {
          // Keep overall selected initially
        }
      },
      (err) => {
        console.error('Error fetching box weeks:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [leagueId]);

  // Fetch DUPR ratings for all members - only show if they have official duprId
  useEffect(() => {
    const fetchRatings = async () => {
      const ratings = new Map<string, number | undefined>();

      for (const member of members) {
        try {
          const userDoc = await getDoc(doc(db, 'users', member.userId));
          if (userDoc.exists()) {
            const user = userDoc.data() as UserProfile;
            // Only show rating if user has official DUPR ID linked
            if (user.duprId) {
              const rating = user.duprDoublesRating ?? user.duprSinglesRating ?? undefined;
              ratings.set(member.userId, rating);
            }
          }
        } catch (err) {
          // Ignore
        }
      }

      setUserRatings(ratings);
    };

    if (members.length > 0) {
      fetchRatings();
    }
  }, [members]);

  // Get current week for display
  const currentWeek = useMemo(() => {
    if (activeTab === 'overall') return null;
    const weekNum = parseInt(activeTab.replace('week-', ''));
    return weeks.find(w => w.weekNumber === weekNum) || null;
  }, [activeTab, weeks]);

  // Get box standings for current week
  const boxStandings = useMemo(() => {
    if (!currentWeek) return new Map<number, BoxStanding[]>();

    const result = new Map<number, BoxStanding[]>();

    if (currentWeek.standingsSnapshot?.boxes && currentWeek.standingsSnapshot.boxes.length > 0) {

      // Group standings by box number
      const boxGroups = new Map<number, BoxStanding[]>();
      for (const standing of currentWeek.standingsSnapshot.boxes) {
        const existing = boxGroups.get(standing.boxNumber) || [];
        existing.push(standing);
        boxGroups.set(standing.boxNumber, existing);
      }

      // Sort each box by position
      for (const [boxNum, standings] of boxGroups) {
        result.set(boxNum, standings.sort((a, b) => a.positionInBox - b.positionInBox));
      }
    } else if (currentWeek.boxAssignments) {
      // Fallback: Create placeholder standings from box assignments

      const memberMap = new Map(members.map(m => [m.userId, m]));

      for (const box of currentWeek.boxAssignments) {
        const standings: BoxStanding[] = box.playerIds.map((userId, index) => {
          const member = memberMap.get(userId);
          return {
            playerId: userId,
            playerName: member?.displayName || 'Unknown Player',
            boxNumber: box.boxNumber,
            positionInBox: index + 1,
            matchesPlayed: 0,
            wins: 0,
            losses: 0,
            pointsFor: 0,
            pointsAgainst: 0,
          };
        });
        result.set(box.boxNumber, standings);
      }
    }

    return result;
  }, [currentWeek, members]);

  // V07.41: Compute match counts from actual matches (more reliable than cached week values)
  const weekMatchCounts = useMemo(() => {
    if (!currentWeek) return { completed: 0, total: 0 };

    const weekMatches = matches.filter(m => m.weekNumber === currentWeek.weekNumber);
    const completed = weekMatches.filter(m =>
      m.status === 'completed' ||
      (m as any).scoreState === 'official' ||
      (m as any).scoreState === 'submittedToDupr'
    ).length;
    const total = currentWeek.totalMatches ?? weekMatches.length;

    return { completed, total };
  }, [currentWeek, matches]);

  // V07.41: Removed finalizeBlockers - finalize controls now only in Schedule tab

  // Check if next week exists
  const nextWeekExists = useMemo(() => {
    if (!currentWeek) return false;
    return weeks.some(w => w.weekNumber === currentWeek.weekNumber + 1);
  }, [currentWeek, weeks]);

  // Handlers
  const handleRecalculate = useCallback(async () => {
    if (!currentWeek) return;
    setIsRecalculating(true);
    try {
      // V07.36: Call the actual recalculate standings service
      console.log('[BoxLeagueStandings] Recalculating standings for week', currentWeek.weekNumber);
      await recalculateWeekStandings(leagueId, currentWeek.weekNumber);
      console.log('[BoxLeagueStandings] Standings recalculated successfully');
      // The onSnapshot listener will automatically update the UI
    } catch (err) {
      console.error('Failed to recalculate:', err);
      alert('Failed to recalculate standings: ' + (err as Error).message);
    } finally {
      setIsRecalculating(false);
    }
  }, [currentWeek, leagueId]);

  // V07.41: Removed handleStartClosing and handleFinalize - week management now only in Schedule tab

  // V07.41: Removed handleActivateWeek and handleRefreshAssignments - now only in Schedule tab

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-lime-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  // No weeks state
  if (weeks.length === 0) {
    return (
      <div className="bg-gray-800/50 rounded-xl p-6 text-center border border-gray-700">
        <div className="text-4xl mb-3">📊</div>
        <h3 className="text-lg font-medium text-white mb-2">No Standings Yet</h3>
        <p className="text-gray-400 text-sm">
          Go to the Schedule tab and generate a schedule to create box assignments.
        </p>
      </div>
    );
  }

  const boxNumbers = Array.from(boxStandings.keys()).sort((a, b) => a - b);
  const totalBoxes = currentWeek?.boxAssignments?.length || boxNumbers.length;

  return (
    <div className="space-y-4">
      {/* Sub-Tabs: Overall + Week tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-700">
        {/* Overall Tab */}
        <button
          onClick={() => setActiveTab('overall')}
          className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
            activeTab === 'overall'
              ? 'bg-lime-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          🏆 Overall
        </button>

        {/* Week Tabs */}
        {weeks.map(week => {
          const isActive = activeTab === `week-${week.weekNumber}`;
          const stateIcon = week.state === 'finalized' ? '✓' :
                           week.state === 'active' ? '●' :
                           week.state === 'closing' ? '⏳' : '○';

          return (
            <button
              key={week.weekNumber}
              onClick={() => {
                setActiveTab(`week-${week.weekNumber}`);
                setSelectedBox(1);
              }}
              className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Week {week.weekNumber}
              <span className="ml-1 opacity-70">{stateIcon}</span>
            </button>
          );
        })}
      </div>

      {/* Overall View */}
      {activeTab === 'overall' && (
        <SeasonLadder weeks={weeks} members={members} userRatings={userRatings} />
      )}

      {/* Week View */}
      {activeTab.startsWith('week-') && currentWeek && (
        <>
          {/* Week Header */}
          <WeekHeader
            week={currentWeek}
            isOrganizer={isOrganizer}
            completedMatches={weekMatchCounts.completed}
            totalMatches={weekMatchCounts.total}
            onRecalculate={handleRecalculate}
            isRecalculating={isRecalculating}
          />

          {/* Box Selector */}
          {boxNumbers.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              {boxNumbers.map(boxNum => (
                <button
                  key={boxNum}
                  onClick={() => setSelectedBox(boxNum)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedBox === boxNum
                      ? `${getBoxColors(boxNum).bg} text-white ring-2 ring-white/30`
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Box {boxNum}
                </button>
              ))}
            </div>
          )}

          {/* Box Standings Table */}
          {boxStandings.has(selectedBox) ? (
            <BoxStandingsTable
              boxNumber={selectedBox}
              standings={boxStandings.get(selectedBox) || []}
              totalBoxes={totalBoxes}
              promotionCount={currentWeek.rulesSnapshot?.promotionCount || 1}
              relegationCount={currentWeek.rulesSnapshot?.relegationCount || 1}
              absences={currentWeek.absences}
            />
          ) : (
            <div className="bg-gray-800/50 rounded-xl p-6 text-center border border-gray-700">
              <p className="text-gray-400">No standings data for Box {selectedBox}</p>
            </div>
          )}

          {/* Movement Summary (only for finalized weeks) */}
          {currentWeek.state === 'finalized' && currentWeek.movements && currentWeek.movements.length > 0 && (
            <MovementSummary
              movements={currentWeek.movements}
              nextWeekExists={nextWeekExists}
              nextWeekNumber={currentWeek.weekNumber + 1}
            />
          )}

          {/* No standings snapshot message */}
          {!currentWeek.standingsSnapshot && currentWeek.state !== 'draft' && (
            <div className="bg-yellow-900/30 border border-yellow-600/50 p-4 rounded-lg">
              <p className="text-yellow-400 text-sm">
                ⚠️ Standings not yet calculated for this week.
                {isOrganizer && ' Click "Recalculate" to generate standings from match results.'}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default BoxLeagueStandings;
