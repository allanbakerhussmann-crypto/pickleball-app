/**
 * PoolStageTab - V07.02
 *
 * Redesigned Pool Stage interface with "Sports Command Center" aesthetic.
 * Features glass-morphism cards, enhanced standings display, and polished match lists.
 *
 * @file components/tournament/PoolStageTab.tsx
 */
import React from 'react';
import { Tournament, Division, Team, Match } from '../../types';
import { PoolGroupStandings } from './PoolGroupStandings';
import { PoolEditor } from './PoolEditor';

interface PoolStageTabProps {
  tournament: Tournament;
  activeDivision: Division;
  divisionTeams: Team[];
  divisionMatches: Match[];
  standings: any[];
  getTeamDisplayName: (teamId: string) => string;
  getTeamPlayers: (teamId: string) => { displayName: string }[];
  handleGenerateSchedule: () => void;
  deletePoolMatches: (tournamentId: string, divisionId: string) => Promise<number | void>;
  savePoolAssignments: (tournamentId: string, divisionId: string, assignments: any) => Promise<void>;
}

// Glass card component matching other tabs
const SettingsCard: React.FC<{
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  allowOverflow?: boolean; // For drag-and-drop content
}> = ({ title, subtitle, icon, badge, children, className = '', allowOverflow = false }) => (
  <div className={`
    relative rounded-xl border backdrop-blur-sm
    bg-gradient-to-br from-gray-900/80 to-gray-900/40
    border-gray-700/50 hover:border-gray-600/50
    transition-all duration-300 ease-out
    ${allowOverflow ? '' : 'overflow-hidden'}
    ${className}
  `}>
    {!allowOverflow && (
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    )}

    <div className="px-5 py-4 border-b border-gray-700/30 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-gray-700/50 text-gray-400">
            {icon}
          </div>
        )}
        <div>
          <h3 className="font-bold text-white">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {badge}
    </div>

    <div className="p-5">
      {children}
    </div>
  </div>
);

// Icons
const TrophyIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15l-2 5H6l2-5m4 0l2 5h4l-2-5m-4 0V9m0 0l3-3m-3 3l-3-3m3 3h.01M17 4h2a1 1 0 011 1v3a3 3 0 01-3 3m0-7V4M7 4H5a1 1 0 00-1 1v3a3 3 0 003 3m0-7V4" />
  </svg>
);

const GridIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
  </svg>
);

const CalendarIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const ListIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const WarningIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

export const PoolStageTab: React.FC<PoolStageTabProps> = ({
  tournament,
  activeDivision,
  divisionTeams,
  divisionMatches,
  standings: _standings,
  getTeamDisplayName,
  getTeamPlayers,
  handleGenerateSchedule,
  deletePoolMatches,
  savePoolAssignments,
}) => {
  // _standings passed for potential future use
  void _standings;
  // Filter pool matches
  const poolMatches = (divisionMatches || []).filter(m =>
    m.poolGroup || m.stage === 'pool' || m.stage === 'Pool Play'
  );
  const completedPoolMatches = poolMatches.filter(m => m.status === 'completed');
  const allPoolsComplete = poolMatches.length > 0 && completedPoolMatches.length === poolMatches.length;

  // Check if bracket already generated
  const bracketMatches = (divisionMatches || []).filter(m =>
    m.stage === 'bracket' || m.stage === 'medal' || m.bracketType === 'main'
  );
  const isBracketGenerated = bracketMatches.length > 0;

  const hasSchedule = poolMatches.length > 0;
  const playHasStarted = poolMatches.some(m => m.status === 'in_progress' || m.status === 'completed');
  const teamsCount = (divisionTeams || []).length;

  // ============================================
  // BRACKET VALIDATION - Prevent configs with byes
  // ============================================
  const isPowerOf2 = (n: number): boolean => n > 0 && (n & (n - 1)) === 0;
  const nextPowerOf2 = (n: number): number => n <= 1 ? 2 : Math.pow(2, Math.ceil(Math.log2(n)));

  // Get advancement settings from division format
  const poolSettings = activeDivision.format?.poolPlayMedalsSettings;
  const advancementRule = poolSettings?.advancementRule || 'top_2';
  const qualifiersPerPool = advancementRule === 'top_1' ? 1 : 2;

  // Calculate pool count from assignments or teams
  const poolAssignments = activeDivision.poolAssignments || [];
  const poolCount = poolAssignments.length || Math.ceil(teamsCount / (activeDivision.format?.teamsPerPool || 4));

  // Calculate bracket sizing
  const totalQualifiers = poolCount * qualifiersPerPool;
  const bracketSize = nextPowerOf2(totalQualifiers);
  const byeCount = bracketSize - totalQualifiers;
  const isValidBracketConfig = isPowerOf2(totalQualifiers) && totalQualifiers >= 2;

  // Helper to derive pool from team assignment
  const getMatchPool = (match: any): string => {
    if (match.poolGroup) return match.poolGroup;

    const assignments = activeDivision?.poolAssignments || [];
    const teamAId = match.teamAId || match.sideA?.id;
    const teamBId = match.teamBId || match.sideB?.id;

    for (let i = 0; i < assignments.length; i++) {
      const pa = assignments[i];
      if (pa.teamIds?.includes(teamAId) || pa.teamIds?.includes(teamBId)) {
        return pa.poolName || `Pool ${String.fromCharCode(65 + i)}`;
      }
    }

    const teamsPerPool = activeDivision?.format?.teamsPerPool || 4;
    const matchesPerPool = (teamsPerPool * (teamsPerPool - 1)) / 2;
    const poolIndex = Math.floor((match.matchNumber || 0) / matchesPerPool);
    return `Pool ${String.fromCharCode(65 + poolIndex)}`;
  };

  // Get unique pool groups
  const allPoolMatches = (divisionMatches || []).filter(m =>
    m.poolGroup || m.stage === 'pool' || m.stage === 'Pool Play' || !m.stage
  );
  const poolGroups = [...new Set(allPoolMatches.map(m => getMatchPool(m)))].sort();

  return (
    <div className="space-y-5">
      {/* Pool Standings Card */}
      <SettingsCard
        title="Pool Standings"
        subtitle={allPoolsComplete ? 'All pools complete' : `${completedPoolMatches.length}/${poolMatches.length} matches played`}
        icon={<TrophyIcon />}
        badge={
          allPoolsComplete ? (
            <span className="text-xs px-2.5 py-1 rounded-full bg-lime-500/20 text-lime-400 border border-lime-500/30">
              Pool Stage Complete
            </span>
          ) : isBracketGenerated ? (
            <span className="text-xs px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">
              Bracket Generated
            </span>
          ) : null
        }
      >
        <PoolGroupStandings
          teams={divisionTeams || []}
          matches={poolMatches}
          poolSettings={activeDivision?.format?.poolPlayMedalsSettings}
          plateSettings={{
            plateEnabled: (activeDivision?.format as any)?.plateEnabled,
            plateThirdPlace: (activeDivision?.format as any)?.plateThirdPlace,
            plateName: (activeDivision?.format as any)?.plateName,
          }}
          getTeamPlayers={getTeamPlayers}
        />
      </SettingsCard>

      {/* Pool Editor Card - allowOverflow for drag-and-drop */}
      <SettingsCard
        title="Edit Pool Assignments"
        subtitle="Drag teams between pools to reassign"
        icon={<GridIcon />}
        allowOverflow={true}
      >
        <PoolEditor
          tournamentId={tournament.id}
          divisionId={activeDivision.id}
          teams={divisionTeams || []}
          matches={divisionMatches || []}
          initialAssignments={activeDivision.poolAssignments}
          poolSize={activeDivision.format?.teamsPerPool || 4}
          getTeamDisplayName={getTeamDisplayName}
          onDeleteScheduleAndSave={async (newAssignments) => {
            await deletePoolMatches(tournament.id, activeDivision.id);
            await savePoolAssignments(tournament.id, activeDivision.id, newAssignments);
            console.log('[PoolEditor] Schedule deleted and pools saved');
          }}
          onSave={() => console.log('[PoolEditor] Pools saved')}
        />
      </SettingsCard>

      {/* Bracket Validation Warning */}
      {!isValidBracketConfig && poolCount > 0 && !hasSchedule && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-amber-500/20 text-amber-400 flex-shrink-0">
              <WarningIcon />
            </div>
            <div>
              <p className="text-amber-400 font-semibold">Invalid bracket configuration - {byeCount} bye{byeCount !== 1 ? 's' : ''} required</p>
              <p className="text-sm text-gray-400 mt-1">
                {poolCount} pool{poolCount !== 1 ? 's' : ''} × {qualifiersPerPool} qualifier{qualifiersPerPool !== 1 ? 's' : ''} = {totalQualifiers} teams → {bracketSize}-team bracket with {byeCount} bye{byeCount !== 1 ? 's' : ''}
              </p>
              <p className="text-sm text-gray-400 mt-2">
                <span className="text-gray-300">To avoid byes:</span> Use 2, 4, 8, or 16 pools with top-2 advancement, or 4, 8, 16 pools with top-1.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Generation Card */}
      <SettingsCard
        title="Schedule Generation"
        subtitle={hasSchedule ? `${poolMatches.length} matches generated` : 'Generate round-robin matches'}
        icon={<CalendarIcon />}
      >
        {hasSchedule ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-lime-500/10 border border-lime-500/20">
              <div className="w-10 h-10 rounded-full bg-lime-500/20 flex items-center justify-center text-lime-400">
                <CheckIcon />
              </div>
              <div>
                <span className="font-semibold text-lime-400">Schedule generated</span>
                <p className="text-sm text-gray-400">{poolMatches.length} matches across {poolGroups.length} pools</p>
              </div>
            </div>
            {playHasStarted && (
              <p className="text-amber-400 text-sm flex items-center gap-2 px-4">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Play has started. To regenerate, use "Delete Schedule & Save" in Pool Assignments above.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-gray-400 text-sm">
              Generate round-robin matches for all pools. Teams must be assigned to pools first.
            </p>
            <button
              onClick={handleGenerateSchedule}
              disabled={teamsCount < 2 || !isValidBracketConfig}
              className={`
                w-full py-3 rounded-xl font-bold text-sm
                transition-all duration-300 ease-out
                flex items-center justify-center gap-2
                ${teamsCount < 2 || !isValidBracketConfig
                  ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-lg shadow-blue-500/20 transform hover:scale-[1.01]'}
              `}
            >
              <CalendarIcon />
              {teamsCount < 2
                ? `Need at least 2 teams (have ${teamsCount})`
                : !isValidBracketConfig
                  ? `Invalid: ${totalQualifiers} qualifiers creates ${byeCount} bye${byeCount !== 1 ? 's' : ''}`
                  : 'Generate Pool Schedule'}
            </button>
          </div>
        )}
      </SettingsCard>

      {/* Match List Card */}
      <SettingsCard
        title="Match List"
        subtitle={`${completedPoolMatches.length}/${allPoolMatches.length} completed`}
        icon={<ListIcon />}
      >
        {allPoolMatches.length === 0 ? (
          <div className="text-center py-10">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-800/50 flex items-center justify-center">
              <ListIcon />
            </div>
            <p className="text-gray-400 font-medium">No pool matches generated yet</p>
            <p className="text-xs text-gray-600 mt-1">Use the "Generate Pool Schedule" button above</p>
          </div>
        ) : (
          <div className="space-y-4">
            {poolGroups.map(poolName => {
              const matches = allPoolMatches
                .filter(m => getMatchPool(m) === poolName)
                .sort((a, b) => (a.matchNumber || 0) - (b.matchNumber || 0));
              const completedCount = matches.filter(m => m.status === 'completed').length;
              const isPoolComplete = completedCount === matches.length && matches.length > 0;

              return (
                <div
                  key={poolName}
                  className={`
                    rounded-xl overflow-hidden border
                    ${isPoolComplete
                      ? 'border-lime-500/30 bg-lime-500/5'
                      : 'border-gray-700/50 bg-gray-800/30'}
                  `}
                >
                  {/* Pool Header */}
                  <div className={`
                    px-4 py-3 flex items-center justify-between
                    ${isPoolComplete ? 'bg-lime-500/10' : 'bg-gray-800/50'}
                  `}>
                    <div className="flex items-center gap-3">
                      <span className={`
                        text-lg font-bold
                        ${isPoolComplete ? 'text-lime-400' : 'text-white'}
                      `}>
                        {poolName}
                      </span>
                      <span className="text-xs text-gray-500">({matches.length} matches)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isPoolComplete ? (
                        <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-lime-500/20 text-lime-400 border border-lime-500/30">
                          Complete
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">{completedCount}/{matches.length} played</span>
                      )}
                    </div>
                  </div>

                  {/* Pool Matches */}
                  <div className="p-3 space-y-2">
                    {matches.map(match => {
                      const isCompleted = match.status === 'completed';
                      const isInProgress = match.status === 'in_progress';

                      return (
                        <div
                          key={match.id}
                          className={`
                            p-3 rounded-lg border transition-all duration-200
                            ${isCompleted
                              ? 'border-lime-700/30 bg-lime-900/10'
                              : isInProgress
                                ? 'border-amber-700/30 bg-amber-900/10'
                                : 'border-gray-700/50 bg-gray-800/50 hover:bg-gray-800/70'}
                          `}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm min-w-0 flex-1">
                              <span className="text-white truncate">
                                {getTeamDisplayName(match.teamAId || match.sideA?.id || '')}
                              </span>
                              <span className="text-gray-600 flex-shrink-0">vs</span>
                              <span className="text-white truncate">
                                {getTeamDisplayName(match.teamBId || match.sideB?.id || '')}
                              </span>
                            </div>
                            <div className="flex-shrink-0 ml-3">
                              {isCompleted && (
                                <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-lime-500/20 text-lime-400">
                                  {match.scores?.map((s: any) => `${s.scoreA}-${s.scoreB}`).join(', ') ||
                                    `${match.scoreTeamAGames?.[0] || 0}-${match.scoreTeamBGames?.[0] || 0}`}
                                </span>
                              )}
                              {isInProgress && (
                                <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-amber-500/20 text-amber-400 flex items-center gap-1">
                                  <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
                                  </span>
                                  In Progress
                                </span>
                              )}
                              {!isCompleted && !isInProgress && (
                                <span className="px-2.5 py-1 text-xs font-medium rounded-md bg-gray-700/50 text-gray-400">
                                  Scheduled
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SettingsCard>
    </div>
  );
};
