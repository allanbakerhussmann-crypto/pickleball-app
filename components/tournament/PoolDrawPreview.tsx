/**
 * Pool Draw Preview Component
 *
 * Shows a read-only preview of how teams will be distributed into pools
 * BEFORE the schedule is generated. Uses snake draft seeding based on DUPR ratings.
 *
 * This is a simpler, read-only version of PoolEditor for preview purposes.
 * For editable pools, use PoolEditor instead.
 *
 * @version 06.06
 * @file components/tournament/PoolDrawPreview.tsx
 */

import React, { useMemo } from 'react';
import type { Team, PoolAssignment } from '../../types';
import type { PoolPlayMedalsSettings } from '../../types/formats/formatTypes';
import { generatePoolAssignments } from '../../services/firebase/poolAssignments';

// ============================================
// TYPES
// ============================================

interface PoolDrawPreviewProps {
  /** All teams in the division */
  teams: Team[];
  /** Target pool size (teams per pool) */
  poolSize: number;
  /** Manual pool assignments (if any) */
  poolAssignments?: PoolAssignment[] | null;
  /** Pool play settings for advancement rules */
  poolSettings?: PoolPlayMedalsSettings;
  /** Custom function to get team display name */
  getTeamDisplayName?: (teamId: string) => string;
  /** Show detailed info like DUPR ratings */
  showDetails?: boolean;
  /** Show advancement indicators */
  showAdvancement?: boolean;
  /** Callback when user wants to edit pools */
  onEditPools?: () => void;
}

interface TeamRowProps {
  team: Team;
  displayName: string;
  seed: number;
  willAdvance: boolean;
  showAdvancement: boolean;
  showDetails: boolean;
}

// ============================================
// TEAM ROW
// ============================================

const TeamRow: React.FC<TeamRowProps> = ({
  team,
  displayName,
  seed,
  willAdvance,
  showAdvancement,
  showDetails,
}) => {
  // Use seed as rating proxy - Team type doesn't have avgDuprRating
  const rating = team.seed;

  return (
    <div
      className={`px-3 py-2 flex items-center justify-between ${
        willAdvance && showAdvancement
          ? 'bg-green-900/20 border-l-2 border-green-500'
          : 'bg-gray-800/50 border-l-2 border-transparent'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-gray-500 text-xs w-5 text-center">{seed}</span>
        <span className="text-white truncate">{displayName}</span>
      </div>
      <div className="flex items-center gap-2">
        {showDetails && rating && typeof rating === 'number' && rating > 0 && (
          <span className="text-xs text-gray-500 tabular-nums">
            {rating.toFixed(2)}
          </span>
        )}
        {willAdvance && showAdvancement && (
          <span className="bg-green-600/30 text-green-400 text-[10px] px-1.5 py-0.5 rounded">
            Advances
          </span>
        )}
      </div>
    </div>
  );
};

// ============================================
// POOL CARD
// ============================================

interface PoolCardProps {
  poolName: string;
  teamIds: string[];
  teams: Team[];
  advancementCount: number;
  showAdvancement: boolean;
  showDetails: boolean;
  getTeamDisplayName: (teamId: string) => string;
}

const PoolCard: React.FC<PoolCardProps> = ({
  poolName,
  teamIds,
  teams,
  advancementCount,
  showAdvancement,
  showDetails,
  getTeamDisplayName,
}) => {
  const poolTeams = teamIds
    .map(id => teams.find(t => t.id === id))
    .filter((t): t is Team => t !== undefined);

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden flex-1 min-w-[200px]">
      {/* Pool Header */}
      <div className="px-3 py-2 bg-gray-900/50 border-b border-gray-700 flex items-center justify-between">
        <h3 className="font-semibold text-white">{poolName}</h3>
        <span className="text-xs text-gray-500">{poolTeams.length} teams</span>
      </div>

      {/* Team List */}
      <div className="divide-y divide-gray-700/50">
        {poolTeams.length === 0 ? (
          <div className="px-3 py-4 text-center text-gray-500 text-sm italic">
            No teams assigned
          </div>
        ) : (
          poolTeams.map((team, index) => {
            const teamId = team.id || team.odTeamId || '';
            return (
              <TeamRow
                key={teamId || index}
                team={team}
                displayName={getTeamDisplayName(teamId)}
                seed={index + 1}
                willAdvance={index < advancementCount}
                showAdvancement={showAdvancement}
                showDetails={showDetails}
              />
            );
          })
        )}
      </div>
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

export const PoolDrawPreview: React.FC<PoolDrawPreviewProps> = ({
  teams,
  poolSize,
  poolAssignments,
  poolSettings,
  getTeamDisplayName: externalGetName,
  showDetails = true,
  showAdvancement = true,
  onEditPools,
}) => {
  // Generate or use existing pool assignments
  const assignments = useMemo(() => {
    if (poolAssignments && poolAssignments.length > 0) {
      return poolAssignments;
    }
    if (teams.length === 0) {
      return [];
    }
    return generatePoolAssignments({ teams, poolSize });
  }, [poolAssignments, teams, poolSize]);

  // Get team display name helper
  const getTeamDisplayName = (teamId: string): string => {
    if (externalGetName) {
      return externalGetName(teamId);
    }
    const team = teams.find(t => t.id === teamId);
    return team?.teamName || team?.name || 'Unknown Team';
  };

  // Calculate advancement count per pool
  const advancementCount = useMemo(() => {
    if (!poolSettings) return 2; // Default: top 2 advance

    const rule = poolSettings.advancementRule || 'top_2';
    if (rule === 'top_1') return 1;
    if (rule === 'top_2') return 2;
    if (rule === 'top_n_plus_best') return 2; // Main bracket uses top 2 from each pool
    return 2;
  }, [poolSettings]);

  // Calculate stats
  const poolCount = assignments.length;
  const totalMatches = assignments.reduce((total, pool) => {
    const n = pool.teamIds.length;
    // Round robin: n*(n-1)/2 matches per pool
    return total + (n * (n - 1)) / 2;
  }, 0);
  const advancingTeams = poolCount * advancementCount;

  if (teams.length === 0) {
    return (
      <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
        <p className="text-gray-400 text-sm italic text-center">
          No teams registered yet. Register teams to see pool preview.
        </p>
      </div>
    );
  }

  if (teams.length < 4) {
    return (
      <div className="bg-yellow-900/30 rounded-lg p-6 border border-yellow-700/50">
        <p className="text-yellow-400 text-sm text-center">
          Need at least 4 teams for pool play. Currently {teams.length} team{teams.length !== 1 ? 's' : ''} registered.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-green-400 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            Pool Draw Preview
          </h2>
          <p className="text-sm text-gray-400">
            Teams seeded using snake draft based on DUPR rating
          </p>
        </div>
        {onEditPools && (
          <button
            onClick={onEditPools}
            className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit Pools
          </button>
        )}
      </div>

      {/* Pool Cards */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {assignments.map((pool) => (
          <PoolCard
            key={pool.poolName}
            poolName={pool.poolName}
            teamIds={pool.teamIds}
            teams={teams}
            advancementCount={advancementCount}
            showAdvancement={showAdvancement}
            showDetails={showDetails}
            getTeamDisplayName={getTeamDisplayName}
          />
        ))}
      </div>

      {/* Stats Footer */}
      <div className="bg-gray-900/50 rounded-lg p-3 flex flex-wrap gap-4 text-sm text-gray-400">
        <div>
          <span className="text-gray-300 font-medium">{teams.length}</span> teams
        </div>
        <div>
          <span className="text-gray-300 font-medium">{poolCount}</span> pools
        </div>
        <div>
          <span className="text-gray-300 font-medium">{Math.round(totalMatches)}</span> pool matches
        </div>
        {showAdvancement && (
          <div className="flex items-center gap-1">
            <span className="text-green-400 font-medium">{advancingTeams}</span>
            <span>teams → medal bracket</span>
          </div>
        )}
      </div>

      {/* Advancement Legend */}
      {showAdvancement && (
        <div className="text-xs text-gray-500 flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-4 bg-green-500 rounded-sm"></div>
            <span>Top {advancementCount} from each pool advance to medal bracket</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default PoolDrawPreview;
