/**
 * Rotating Box Player Manager Component V07.45
 *
 * Displays box league standings in a clean table format with promotion/relegation indicators.
 * Shows players grouped by boxes with colored backgrounds.
 * Allows organizers to manage boxes when week is in draft state.
 *
 * V07.45: Added substitute name lookup from week absences
 *
 * FILE LOCATION: components/leagues/boxLeague/RotatingBoxPlayerManager.tsx
 * VERSION: V07.45
 */

import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, doc, getDoc } from '@firebase/firestore';
import { db } from '../../../services/firebase/config';
import type { LeagueMember, UserProfile } from '../../../types';
import type { BoxLeagueWeek } from '../../../types/rotatingDoublesBox';

// ============================================
// TYPES
// ============================================

interface RotatingBoxPlayerManagerProps {
  leagueId: string;
  members: LeagueMember[];
  isOrganizer: boolean;
  disabled?: boolean;
}

interface PlayerDisplayInfo {
  odUserId: string;
  displayName: string;
  duprDoublesRating?: number | null;
  boxNumber: number;
  positionInBox: number;
  totalInBox: number;
}

// Box colors - gradient from darker (top box) to lighter (bottom box)
const BOX_COLORS = [
  'bg-blue-900',      // Box 1 - darkest
  'bg-blue-800',      // Box 2
  'bg-blue-700',      // Box 3
  'bg-sky-700',       // Box 4
  'bg-sky-600',       // Box 5
  'bg-cyan-600',      // Box 6
  'bg-cyan-500',      // Box 7
  'bg-teal-500',      // Box 8 - lightest
];

// Get box color by index
const getBoxColor = (boxNumber: number): string => {
  const index = Math.min(boxNumber - 1, BOX_COLORS.length - 1);
  return BOX_COLORS[index] || BOX_COLORS[BOX_COLORS.length - 1];
};

// ============================================
// PROMOTION/RELEGATION INDICATOR
// ============================================

type MovementType = 'promote' | 'relegate' | 'stay';

const getMovementType = (
  positionInBox: number,
  totalInBox: number,
  boxNumber: number,
  totalBoxes: number,
  promotionCount: number = 1,
  relegationCount: number = 1
): MovementType => {
  // Top box can't promote
  if (boxNumber === 1) {
    // But bottom players still relegate
    if (positionInBox > totalInBox - relegationCount) {
      return 'relegate';
    }
    return 'stay';
  }

  // Bottom box can't relegate
  if (boxNumber === totalBoxes) {
    // But top players still promote
    if (positionInBox <= promotionCount) {
      return 'promote';
    }
    return 'stay';
  }

  // Middle boxes: top promote, bottom relegate
  if (positionInBox <= promotionCount) {
    return 'promote';
  }
  if (positionInBox > totalInBox - relegationCount) {
    return 'relegate';
  }

  return 'stay';
};

const MovementIndicator: React.FC<{ type: MovementType }> = ({ type }) => {
  if (type === 'promote') {
    return (
      <span className="text-green-400 font-bold text-lg" title="Promotes to higher box">
        ▲
      </span>
    );
  }
  if (type === 'relegate') {
    return (
      <span className="text-red-400 font-bold text-lg" title="Relegates to lower box">
        ▼
      </span>
    );
  }
  return <span className="w-4 inline-block"></span>;
};

// ============================================
// MAIN COMPONENT
// ============================================

export const RotatingBoxPlayerManager: React.FC<RotatingBoxPlayerManagerProps> = ({
  leagueId,
  members,
  isOrganizer,
  disabled = false,
}) => {
  // State
  const [currentWeek, setCurrentWeek] = useState<BoxLeagueWeek | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRatings, setUserRatings] = useState<Map<string, number | undefined>>(new Map());
  // V07.45: Fetched user names for players not in member list (substitutes)
  const [fetchedUserNames, setFetchedUserNames] = useState<Map<string, string>>(new Map());

  // Fetch current week from boxWeeks collection
  useEffect(() => {
    const weeksRef = collection(db, 'leagues', leagueId, 'boxWeeks');
    const q = query(weeksRef, orderBy('weekNumber', 'asc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (snapshot.empty) {
          setCurrentWeek(null);
          setLoading(false);
          return;
        }

        // Get the latest non-finalized week, or the last week
        const weeks = snapshot.docs.map((d) => d.data() as BoxLeagueWeek);
        const activeWeek = weeks.find((w) => w.state !== 'finalized') || weeks[weeks.length - 1];
        setCurrentWeek(activeWeek);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching box weeks:', err);
        setError('Failed to load box assignments');
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
          // Ignore individual fetch errors
        }
      }

      setUserRatings(ratings);
    };

    if (members.length > 0) {
      fetchRatings();
    }
  }, [members]);

  // V07.45: Fetch names for players not in member list (substitutes)
  useEffect(() => {
    if (!currentWeek?.boxAssignments) return;

    const memberIds = new Set(members.map(m => m.userId));
    const unknownIds: string[] = [];

    // Find player IDs not in member list
    for (const box of currentWeek.boxAssignments) {
      for (const userId of box.playerIds) {
        if (!memberIds.has(userId) && !fetchedUserNames.has(userId)) {
          unknownIds.push(userId);
        }
      }
    }

    if (unknownIds.length === 0) return;

    const fetchNames = async () => {
      const newNames = new Map(fetchedUserNames);
      for (const odUserId of unknownIds) {
        try {
          const userDoc = await getDoc(doc(db, 'users', odUserId));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.displayName) {
              newNames.set(odUserId, userData.displayName);
            }
          }
        } catch (err) {
          console.warn(`Failed to fetch user name for ${odUserId}:`, err);
        }
      }
      if (newNames.size > fetchedUserNames.size) {
        setFetchedUserNames(newNames);
      }
    };

    fetchNames();
  }, [currentWeek?.boxAssignments, members, fetchedUserNames]);

  // V07.45: Build substitute name lookup from current week absences
  // Map both: substituteId → substituteName (if box has sub ID)
  // AND: absentPlayerId → substituteName (if box still has absent player ID)
  const substituteNames = useMemo(() => {
    const names = new Map<string, string>();
    if (currentWeek?.absences) {
      for (const absence of currentWeek.absences) {
        if (absence.substituteId && absence.substituteName) {
          // Map substitute's own ID to their name
          names.set(absence.substituteId, absence.substituteName);
          // Also map the absent player's ID to the substitute's name
          // (in case boxAssignments has the absent player's ID, not the sub's)
          names.set(absence.playerId, absence.substituteName);
        }
      }
    }
    return names;
  }, [currentWeek?.absences]);

  // Build all players list with box info
  const allPlayers = useMemo(() => {
    if (!currentWeek?.boxAssignments) return [];

    const memberMap = new Map(members.map((m) => [m.userId, m]));
    const players: PlayerDisplayInfo[] = [];
    const totalBoxes = currentWeek.boxAssignments.length;

    for (const box of currentWeek.boxAssignments) {
      const totalInBox = box.playerIds.length;

      box.playerIds.forEach((userId, index) => {
        const member = memberMap.get(userId);
        const rating = userRatings.get(userId);

        // V07.45: Check member first, then substitute names, then fetched names
        const displayName = member?.displayName
          || substituteNames.get(userId)
          || fetchedUserNames.get(userId)
          || 'Unknown Player';

        players.push({
          odUserId: userId,
          displayName,
          duprDoublesRating: rating,
          boxNumber: box.boxNumber,
          positionInBox: index + 1,
          totalInBox,
        });
      });
    }

    return players;
  }, [currentWeek?.boxAssignments, members, userRatings, substituteNames, fetchedUserNames]);

  // Get total box count
  const totalBoxes = currentWeek?.boxAssignments?.length || 0;

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-lime-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  // No week data - show registered players list instead
  if (!currentWeek) {
    const activeMembers = members.filter(m => m.status === 'active');
    return (
      <div className="space-y-4">
        {/* Info banner */}
        <div className="bg-yellow-900/30 rounded-xl p-4 border border-yellow-700/50">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📦</span>
            <div>
              <h3 className="text-sm font-medium text-yellow-400">Boxes Not Created Yet</h3>
              <p className="text-gray-400 text-xs">
                Go to the Schedule tab and click "Generate Schedule" to create box assignments.
              </p>
            </div>
          </div>
        </div>

        {/* Registered players list */}
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <h3 className="text-lg font-bold text-white mb-4">
            Registered Players ({activeMembers.length})
          </h3>
          {activeMembers.length === 0 ? (
            <p className="text-gray-400 text-center py-8">No players registered yet.</p>
          ) : (
            <div className="space-y-2">
              {activeMembers
                .sort((a, b) => (userRatings.get(b.userId) || 0) - (userRatings.get(a.userId) || 0))
                .map((member, idx) => {
                  const rating = userRatings.get(member.userId);
                  return (
                  <div
                    key={member.userId || idx}
                    className="flex items-center justify-between p-3 rounded-lg bg-gray-700/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-sm font-medium">
                        {idx + 1}
                      </div>
                      <span className="text-white font-medium">
                        {member.displayName || 'Unknown Player'}
                      </span>
                    </div>
                    {rating && (
                      <span className="text-sm text-gray-400">
                        DUPR: {rating.toFixed(2)}
                      </span>
                    )}
                  </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // No box assignments
  if (!currentWeek.boxAssignments || currentWeek.boxAssignments.length === 0) {
    return (
      <div className="bg-gray-800/50 rounded-xl p-6 text-center border border-gray-700">
        <div className="text-4xl mb-3">📦</div>
        <h3 className="text-lg font-medium text-white mb-2">No Box Assignments</h3>
        <p className="text-gray-400 text-sm">
          Week {currentWeek.weekNumber} exists but has no box assignments.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">
            Week {currentWeek.weekNumber} Standings
          </h3>
          <p className="text-sm text-gray-400">
            {totalBoxes} boxes • {allPlayers.length} players
          </p>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-xs font-medium ${
            currentWeek.state === 'draft'
              ? 'bg-yellow-500/20 text-yellow-400'
              : currentWeek.state === 'active'
              ? 'bg-green-500/20 text-green-400'
              : currentWeek.state === 'closing'
              ? 'bg-orange-500/20 text-orange-400'
              : 'bg-gray-500/20 text-gray-400'
          }`}
        >
          {currentWeek.state.charAt(0).toUpperCase() + currentWeek.state.slice(1)}
        </span>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Standings Table */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-900/50 border-b border-gray-700">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider w-20">
                Box
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Name
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider w-20">
                DUPR
              </th>
            </tr>
          </thead>
          <tbody>
            {allPlayers.map((player, index) => {
              const isFirstInBox = player.positionInBox === 1;
              const isLastInBox = player.positionInBox === player.totalInBox;
              const movementType = getMovementType(
                player.positionInBox,
                player.totalInBox,
                player.boxNumber,
                totalBoxes
              );

              return (
                <tr
                  key={player.odUserId}
                  className={`
                    ${getBoxColor(player.boxNumber)}
                    ${isLastInBox ? 'border-b-2 border-gray-900' : 'border-b border-gray-700/30'}
                    hover:brightness-110 transition-all
                  `}
                >
                  {/* Box Number - only show for first player in box */}
                  <td className="px-4 py-2 text-center">
                    {isFirstInBox ? (
                      <span className="text-white font-bold text-lg">
                        {player.boxNumber}
                      </span>
                    ) : null}
                  </td>

                  {/* Player Name */}
                  <td className="px-4 py-2">
                    <span className="text-white font-medium">
                      {player.displayName}
                    </span>
                  </td>

                  {/* DUPR Rating */}
                  <td className="px-4 py-2 text-right">
                    <span className="text-white/80 text-sm">
                      {player.duprDoublesRating?.toFixed(2) || '-'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-xs text-gray-400 bg-gray-800/50 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 bg-blue-800 rounded"></span>
          <span>Top boxes (darker)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 bg-cyan-500 rounded"></span>
          <span>Lower boxes (lighter)</span>
        </div>
      </div>
    </div>
  );
};

export default RotatingBoxPlayerManager;
