/**
 * LiveCourtsTab - V07.02
 *
 * Redesigned Live Courts interface with "Sports Command Center" aesthetic.
 * Features glass-morphism cards, live status indicators, and polished court cards.
 *
 * V07.02 Changes:
 * - Added court tier badges (🥇 Gold, 🥈 Plate, ⭐ Semi)
 * - Added finals banner when finals matches are ready to play
 * - Pass courtSettings to CourtAllocationStyled for tier display
 *
 * @file components/tournament/LiveCourtsTab.tsx
 */
import React, { useMemo } from 'react';
import { Tournament, Court as FirestoreCourt, Match, TournamentMatchType } from '../../types';
import { CourtAllocationStyled } from './CourtAllocationStyled';
import { Court as CourtViewModel, CourtMatch } from '../CourtAllocation';

interface LiveCourtsTabProps {
  tournament: Tournament;
  courts: FirestoreCourt[];
  matches: Match[];  // V07.02: Full matches for finals detection
  courtViewModels: CourtViewModel[];
  courtMatchModels: CourtMatch[];
  queueMatchModels: CourtMatch[];
  queue: any[];
  autoAllocateCourts: boolean;
  setAutoAllocateCourts: (value: boolean) => void;
  autoAssignFreeCourts: () => void;
  assignMatchToCourt: (matchId: string, courtName: string) => Promise<void>;
  startMatchOnCourt: (courtId: string) => Promise<void>;
  finishMatchOnCourt: (courtId: string, scoreTeamA?: number, scoreTeamB?: number) => void;
}

// Styled card component matching DivisionSettingsTab
const StatusCard: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div className={`
    relative overflow-hidden rounded-xl border backdrop-blur-sm
    bg-gradient-to-br from-gray-900/80 to-gray-900/40
    border-gray-700/50 hover:border-gray-600/50
    transition-all duration-300 ease-out
    ${className}
  `}>
    {/* Subtle top highlight */}
    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    {children}
  </div>
);

// Live pulse indicator
const LiveIndicator: React.FC = () => (
  <div className="flex items-center gap-2.5">
    <span className="relative flex h-3 w-3">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75"></span>
      <span className="relative inline-flex rounded-full h-3 w-3 bg-lime-500"></span>
    </span>
    <span className="text-sm font-bold text-lime-400 uppercase tracking-wider">Live</span>
  </div>
);

// Stat badge component
const StatBadge: React.FC<{
  icon: React.ReactNode;
  value: number;
  label: string;
  color: 'amber' | 'blue' | 'lime' | 'red';
}> = ({ icon, value, label, color }) => {
  const colors = {
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    lime: 'text-lime-400 bg-lime-500/10 border-lime-500/20',
    red: 'text-red-400 bg-red-500/10 border-red-500/20',
  };

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${colors[color]}`}>
      <span className={`${color === 'amber' ? 'text-amber-400' : color === 'blue' ? 'text-blue-400' : color === 'lime' ? 'text-lime-400' : 'text-red-400'}`}>
        {icon}
      </span>
      <span className="text-white font-bold text-lg">{value}</span>
      <span className="text-gray-400 text-sm">{label}</span>
    </div>
  );
};

// Icons
const PlayIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
  </svg>
);

const ClockIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const CheckCircleIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const HandIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
  </svg>
);

const BoltIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

const RefreshIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

// Trophy icon for finals banner
const TrophyIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);

// Finals banner component
const FinalsBanner: React.FC<{
  type: 'gold' | 'bronze' | 'plate_final' | 'plate_bronze';
  courtName?: string;
  matchReady: boolean;
}> = ({ type, courtName, matchReady }) => {
  const configs = {
    gold: {
      label: '🥇 Gold Final',
      bgColor: 'from-yellow-600/20 to-amber-600/10',
      borderColor: 'border-yellow-500/40',
      textColor: 'text-yellow-400',
      iconBg: 'bg-yellow-500/20',
    },
    bronze: {
      label: '🥉 Bronze Match',
      bgColor: 'from-orange-600/20 to-amber-700/10',
      borderColor: 'border-orange-500/40',
      textColor: 'text-orange-400',
      iconBg: 'bg-orange-500/20',
    },
    plate_final: {
      label: '🥈 Plate Final',
      bgColor: 'from-slate-400/20 to-gray-500/10',
      borderColor: 'border-slate-400/40',
      textColor: 'text-slate-300',
      iconBg: 'bg-slate-400/20',
    },
    plate_bronze: {
      label: '🏅 Plate 3rd Place',
      bgColor: 'from-slate-500/20 to-gray-600/10',
      borderColor: 'border-slate-500/40',
      textColor: 'text-slate-400',
      iconBg: 'bg-slate-500/20',
    },
  };

  const config = configs[type];

  return (
    <div className={`
      relative overflow-hidden rounded-xl border backdrop-blur-sm
      bg-gradient-to-r ${config.bgColor} ${config.borderColor}
      p-4 flex items-center justify-between
    `}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl ${config.iconBg} flex items-center justify-center`}>
          <TrophyIcon className={`w-5 h-5 ${config.textColor}`} />
        </div>
        <div>
          <span className={`font-bold ${config.textColor}`}>{config.label}</span>
          <p className="text-xs text-gray-400 mt-0.5">
            {matchReady
              ? `Ready to play${courtName ? ` on ${courtName}` : ''}`
              : 'Waiting for earlier matches to complete'}
          </p>
        </div>
      </div>
      {matchReady && (
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-lime-500/20 border border-lime-500/30">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-lime-500"></span>
          </span>
          <span className="text-xs font-bold text-lime-400 uppercase">Ready</span>
        </span>
      )}
    </div>
  );
};

export const LiveCourtsTab: React.FC<LiveCourtsTabProps> = ({
  tournament,
  courts,
  matches,
  courtViewModels,
  courtMatchModels,
  queueMatchModels,
  queue,
  autoAllocateCourts,
  setAutoAllocateCourts,
  autoAssignFreeCourts,
  assignMatchToCourt,
  startMatchOnCourt,
  finishMatchOnCourt,
}) => {
  // Calculate stats
  const inProgressCount = (courtMatchModels || []).filter(m => m.status === 'IN_PROGRESS').length;
  const waitingCount = (queue || []).length;
  const freeCourtsCount = (courtViewModels || []).filter(c => c.status === 'AVAILABLE').length;

  // V07.02: Detect finals matches and their readiness
  const finalsStatus = useMemo(() => {
    if (!matches || matches.length === 0) return null;

    const goldFinal = matches.find(m => m.matchType === 'final' && m.bracketType !== 'plate');
    const bronzeMatch = matches.find(m => m.matchType === 'bronze');
    const plateFinal = matches.find(m => m.matchType === 'plate_final');
    const plateBronze = matches.find(m => m.matchType === 'plate_bronze');

    // Check if semis are complete for finals readiness
    const mainSemis = matches.filter(m => m.matchType === 'semifinal' && m.bracketType !== 'plate');
    const plateSemis = matches.filter(m => m.matchType === 'semifinal' && m.bracketType === 'plate');

    const mainSemisComplete = mainSemis.length === 0 || mainSemis.every(s => s.status === 'completed');
    const plateSemisComplete = plateSemis.length === 0 || plateSemis.every(s => s.status === 'completed');

    const goldComplete = goldFinal?.status === 'completed';
    const plateComplete = plateFinal?.status === 'completed';

    // Get court names for ready finals
    const courtSettings = tournament.courtSettings;
    const goldCourtName = courts.find(c => c.id === courtSettings?.goldCourtId)?.name;
    const plateCourtName = courts.find(c => c.id === courtSettings?.plateCourtId)?.name;

    return {
      goldFinal: goldFinal && goldFinal.status !== 'completed' ? {
        match: goldFinal,
        ready: mainSemisComplete,
        courtName: goldCourtName,
      } : null,
      bronzeMatch: bronzeMatch && bronzeMatch.status !== 'completed' ? {
        match: bronzeMatch,
        ready: goldComplete,
        courtName: goldCourtName,
      } : null,
      plateFinal: plateFinal && plateFinal.status !== 'completed' ? {
        match: plateFinal,
        ready: plateSemisComplete,
        courtName: plateCourtName,
      } : null,
      plateBronze: plateBronze && plateBronze.status !== 'completed' ? {
        match: plateBronze,
        ready: plateComplete,
        courtName: plateCourtName,
      } : null,
    };
  }, [matches, tournament.courtSettings, courts]);

  return (
    <div className="space-y-5">
      {/* Live Status Bar */}
      <StatusCard>
        <div className="p-5">
          <div className="flex flex-wrap items-center gap-6">
            {/* Live Indicator */}
            <LiveIndicator />

            <div className="h-8 w-px bg-gray-700/50" />

            {/* Stats */}
            <div className="flex flex-wrap items-center gap-4">
              <StatBadge
                icon={<PlayIcon />}
                value={inProgressCount}
                label="in progress"
                color="amber"
              />
              <StatBadge
                icon={<ClockIcon />}
                value={waitingCount}
                label="waiting"
                color="blue"
              />
              <StatBadge
                icon={<CheckCircleIcon />}
                value={freeCourtsCount}
                label="courts free"
                color="lime"
              />
            </div>
          </div>
        </div>
      </StatusCard>

      {/* V07.02: Finals Banners - Show when finals matches exist */}
      {finalsStatus && (finalsStatus.goldFinal || finalsStatus.bronzeMatch || finalsStatus.plateFinal || finalsStatus.plateBronze) && (
        <div className="space-y-3">
          {finalsStatus.goldFinal && (
            <FinalsBanner
              type="gold"
              courtName={finalsStatus.goldFinal.courtName}
              matchReady={finalsStatus.goldFinal.ready}
            />
          )}
          {finalsStatus.bronzeMatch && (
            <FinalsBanner
              type="bronze"
              courtName={finalsStatus.bronzeMatch.courtName}
              matchReady={finalsStatus.bronzeMatch.ready}
            />
          )}
          {finalsStatus.plateFinal && (
            <FinalsBanner
              type="plate_final"
              courtName={finalsStatus.plateFinal.courtName}
              matchReady={finalsStatus.plateFinal.ready}
            />
          )}
          {finalsStatus.plateBronze && (
            <FinalsBanner
              type="plate_bronze"
              courtName={finalsStatus.plateBronze.courtName}
              matchReady={finalsStatus.plateBronze.ready}
            />
          )}
        </div>
      )}

      {/* Mode Toggle & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* Mode Toggle - Segmented Control */}
        <div className="inline-flex rounded-xl bg-gray-900/80 p-1.5 border border-gray-700/50 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setAutoAllocateCourts(false)}
            className={`
              flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg
              transition-all duration-200 ease-out
              ${!autoAllocateCourts
                ? 'bg-gray-700/80 text-white shadow-lg'
                : 'text-gray-400 hover:text-gray-200'}
            `}
          >
            <HandIcon />
            Manual
          </button>
          <button
            type="button"
            onClick={() => setAutoAllocateCourts(true)}
            className={`
              flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg
              transition-all duration-200 ease-out
              ${autoAllocateCourts
                ? 'bg-gradient-to-r from-lime-600 to-lime-500 text-gray-900 shadow-lg shadow-lime-500/20'
                : 'text-gray-400 hover:text-gray-200'}
            `}
          >
            <BoltIcon />
            Auto-Allocate
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          {/* Test Mode Badge */}
          {tournament.testMode && (
            <span className="
              text-xs font-bold px-3 py-1.5 rounded-lg
              bg-amber-500/20 text-amber-400 border border-amber-500/30
              flex items-center gap-1.5
            ">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
              Test Mode: 10s rest
            </span>
          )}

          {/* Fill Free Courts Button (Manual mode only) */}
          {!autoAllocateCourts && (
            <button
              type="button"
              onClick={() => autoAssignFreeCourts()}
              className="
                group relative overflow-hidden
                inline-flex items-center gap-2 px-5 py-2.5 rounded-xl
                text-sm font-semibold
                bg-gradient-to-r from-indigo-600 to-indigo-500
                hover:from-indigo-500 hover:to-indigo-400
                text-white shadow-lg shadow-indigo-600/20
                hover:shadow-xl hover:shadow-indigo-500/30
                transition-all duration-300 ease-out
                transform hover:scale-[1.02] active:scale-[0.98]
              "
            >
              {/* Shine effect */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              </div>
              <RefreshIcon />
              <span className="relative">Fill Free Courts</span>
            </button>
          )}

          {/* Auto-allocation Active Badge */}
          {autoAllocateCourts && (
            <div className="
              flex items-center gap-2 px-4 py-2.5 rounded-xl
              bg-lime-500/10 border border-lime-500/30
            ">
              <svg className="w-5 h-5 text-lime-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm font-semibold text-lime-400">
                Auto-allocation active
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Court Allocation Component */}
      <CourtAllocationStyled
        courts={courtViewModels}
        matches={courtMatchModels}
        filteredQueue={queueMatchModels}
        courtSettings={tournament.courtSettings}  // V07.02: Pass court tier settings
        firestoreCourts={courts}  // V07.02: Pass Firestore courts for ID lookup
        onAssignMatchToCourt={async (matchId, courtId) => {
          const court = (courts || []).find(c => c.id === courtId);
          if (!court) return;
          await assignMatchToCourt(matchId, court.name);
        }}
        onStartMatchOnCourt={async courtId => {
          await startMatchOnCourt(courtId);
        }}
        onFinishMatchOnCourt={finishMatchOnCourt}
      />
    </div>
  );
};
