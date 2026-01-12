/**
 * Venue Capacity Calculator V07.27
 *
 * Interactive calculator shown during league creation to help organizers
 * understand venue capacity for single-session leagues where all matches
 * complete in one sitting.
 *
 * Key Features:
 * - Calculates max teams based on courts, time window, and match duration
 * - Shows dual capacity guards (match slots AND courts×2)
 * - Displays what-if scenarios for different team counts
 * - Enforces rest time separate from buffer time
 *
 * FILE LOCATION: components/leagues/VenueCapacityCalculator.tsx
 * VERSION: V07.27
 */

import React, { useMemo, useEffect, useRef } from 'react';

// ============================================
// TYPES
// ============================================

export interface VenueCapacityInput {
  courts: number;
  sessionStartTime: string;    // "18:00" format
  sessionEndTime: string;      // "21:00" format
  matchDurationMinutes: number;
  bufferMinutes: number;
  minRestMinutes: number;      // Player recovery time
}

export interface CapacityResult {
  availableMinutes: number;
  slotDuration: number;
  slotsPerCourt: number;
  totalMatchSlots: number;
  maxTeamsBySlots: number;     // From n(n-1)/2 <= slots
  maxTeamsByCourts: number;    // From n <= courts * 2
  maxTeams: number;            // min of both
  restSlotsRequired: number;   // How many slots between same team matches
  teamScenarios: TeamScenario[];
}

export interface TeamScenario {
  teams: number;
  matches: number;
  fitsInSlots: boolean;
  fitsInCourts: boolean;
  fits: boolean;
  estimatedDuration: string;
}

interface VenueCapacityCalculatorProps {
  courts: number;
  sessionStartTime: string;
  sessionEndTime: string;
  matchDurationMinutes: number;
  bufferMinutes: number;
  minRestMinutes: number;
  onCapacityCalculated?: (result: CapacityResult) => void;
  className?: string;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Parse time string "HH:MM" to minutes from midnight
 */
const parseTimeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

/**
 * Format minutes as duration string
 */
const formatDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
};

/**
 * Calculate round robin matches for n teams: n(n-1)/2
 */
const roundRobinMatches = (n: number): number => (n * (n - 1)) / 2;

/**
 * Find max teams where matches <= slots
 */
const maxTeamsForSlots = (slots: number): number => {
  // Solve n(n-1)/2 <= slots
  // n^2 - n - 2*slots <= 0
  // n <= (1 + sqrt(1 + 8*slots)) / 2
  const n = Math.floor((1 + Math.sqrt(1 + 8 * slots)) / 2);
  return Math.max(2, n);
};

// ============================================
// CAPACITY CALCULATION
// ============================================

export const calculateCapacity = (input: VenueCapacityInput): CapacityResult => {
  const {
    courts,
    sessionStartTime,
    sessionEndTime,
    matchDurationMinutes,
    bufferMinutes,
    minRestMinutes,
  } = input;

  // Calculate available time
  const startMinutes = parseTimeToMinutes(sessionStartTime);
  const endMinutes = parseTimeToMinutes(sessionEndTime);
  const availableMinutes = Math.max(0, endMinutes - startMinutes);

  // Calculate slot duration (match + buffer for court turnaround)
  const slotDuration = matchDurationMinutes + bufferMinutes;

  // Slots per court
  const slotsPerCourt = slotDuration > 0 ? Math.floor(availableMinutes / slotDuration) : 0;

  // Total match slots
  const totalMatchSlots = slotsPerCourt * courts;

  // Calculate rest slots requirement
  const restSlotsRequired = slotDuration > 0 ? Math.ceil(minRestMinutes / slotDuration) : 1;

  // Dual capacity guards
  // Guard 1: Enough time for all matches - n(n-1)/2 <= totalMatchSlots
  const maxTeamsBySlots = maxTeamsForSlots(totalMatchSlots);

  // Guard 2: Enough courts to avoid idle conflicts - n <= courts * 2
  // With c courts, max c matches run simultaneously = 2c teams playing
  const maxTeamsByCourts = courts * 2;

  // Final max is the stricter of both guards
  const maxTeams = Math.min(maxTeamsBySlots, maxTeamsByCourts);

  // Generate team scenarios (2 to maxTeams + 2 for reference)
  const teamScenarios: TeamScenario[] = [];
  for (let teams = 2; teams <= Math.min(maxTeams + 2, 20); teams++) {
    const matches = roundRobinMatches(teams);
    const fitsInSlots = matches <= totalMatchSlots;
    const fitsInCourts = teams <= maxTeamsByCourts;
    const fits = fitsInSlots && fitsInCourts;

    // Estimate duration: ceil(matches / courts) * slotDuration
    const roundsNeeded = Math.ceil(matches / courts);
    const estimatedMinutes = roundsNeeded * slotDuration;

    teamScenarios.push({
      teams,
      matches,
      fitsInSlots,
      fitsInCourts,
      fits,
      estimatedDuration: formatDuration(estimatedMinutes),
    });
  }

  return {
    availableMinutes,
    slotDuration,
    slotsPerCourt,
    totalMatchSlots,
    maxTeamsBySlots,
    maxTeamsByCourts,
    maxTeams,
    restSlotsRequired,
    teamScenarios,
  };
};

// ============================================
// COMPONENT
// ============================================

export const VenueCapacityCalculator: React.FC<VenueCapacityCalculatorProps> = ({
  courts,
  sessionStartTime,
  sessionEndTime,
  matchDurationMinutes,
  bufferMinutes,
  minRestMinutes,
  onCapacityCalculated,
  className = '',
}) => {
  // Calculate capacity (pure calculation, no side effects)
  const capacity = useMemo(() => {
    return calculateCapacity({
      courts,
      sessionStartTime,
      sessionEndTime,
      matchDurationMinutes,
      bufferMinutes,
      minRestMinutes,
    });
  }, [courts, sessionStartTime, sessionEndTime, matchDurationMinutes, bufferMinutes, minRestMinutes]);

  // Stable reference to callback to avoid infinite loops
  const callbackRef = useRef(onCapacityCalculated);
  callbackRef.current = onCapacityCalculated;

  // Notify parent when capacity changes (using ref to avoid dependency on callback)
  useEffect(() => {
    callbackRef.current?.(capacity);
  }, [capacity]);

  const isValidSetup = courts > 0 && capacity.availableMinutes > 0 && capacity.slotDuration > 0;

  if (!isValidSetup) {
    return (
      <div className={`bg-gray-800/50 rounded-xl border border-gray-700 p-4 ${className}`}>
        <div className="flex items-center gap-2 text-amber-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="text-sm font-medium">Configure courts and session times to see capacity</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl border border-gray-700 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 bg-lime-500/10 border-b border-lime-500/20">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-lime-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <h3 className="font-semibold text-lime-300 uppercase tracking-wider text-sm">Capacity Calculator</h3>
        </div>
      </div>

      {/* Main Stats */}
      <div className="p-4">
        <div className="grid grid-cols-3 gap-3 mb-4">
          {/* Slots per Court */}
          <div className="bg-gray-900/60 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-white">{capacity.slotsPerCourt}</div>
            <div className="text-xs text-gray-400">slots/court</div>
          </div>

          {/* Total Slots */}
          <div className="bg-gray-900/60 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-white">{capacity.totalMatchSlots}</div>
            <div className="text-xs text-gray-400">total slots</div>
          </div>

          {/* Max Teams */}
          <div className="bg-lime-500/20 rounded-lg p-3 text-center border border-lime-500/30">
            <div className="text-2xl font-bold text-lime-300">{capacity.maxTeams}</div>
            <div className="text-xs text-lime-400">max teams</div>
          </div>
        </div>

        {/* Dual Guards */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2 text-sm">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center ${capacity.maxTeamsBySlots >= capacity.maxTeams ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
              {capacity.maxTeamsBySlots >= capacity.maxTeams ? '✓' : '!'}
            </span>
            <span className="text-gray-400">Time slots: max {capacity.maxTeamsBySlots} teams</span>
            <span className="text-gray-600 text-xs">({capacity.totalMatchSlots} slots)</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center ${capacity.maxTeamsByCourts >= capacity.maxTeams ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
              {capacity.maxTeamsByCourts >= capacity.maxTeams ? '✓' : '!'}
            </span>
            <span className="text-gray-400">Court capacity: max {capacity.maxTeamsByCourts} teams</span>
            <span className="text-gray-600 text-xs">({courts} courts × 2)</span>
          </div>
          {capacity.restSlotsRequired > 1 && (
            <div className="flex items-center gap-2 text-sm">
              <span className="w-5 h-5 rounded-full flex items-center justify-center bg-blue-500/20 text-blue-400">i</span>
              <span className="text-gray-400">Rest requirement: {capacity.restSlotsRequired} slots between matches</span>
            </div>
          )}
        </div>

        {/* Team Scenarios */}
        <div className="bg-gray-900/40 rounded-lg p-3">
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Team Scenarios</h4>
          <div className="space-y-1">
            {capacity.teamScenarios.slice(0, 6).map((scenario) => (
              <div
                key={scenario.teams}
                className={`flex items-center justify-between text-sm py-1 px-2 rounded ${
                  scenario.fits
                    ? 'text-gray-300'
                    : 'text-gray-600 line-through'
                } ${scenario.teams === capacity.maxTeams ? 'bg-lime-500/10 text-lime-300' : ''}`}
              >
                <span className="font-medium">
                  {scenario.teams} teams
                  {scenario.teams === capacity.maxTeams && (
                    <span className="ml-2 text-xs text-lime-400">(max)</span>
                  )}
                </span>
                <span className="text-gray-500">
                  {scenario.matches} matches • ~{scenario.estimatedDuration}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="mt-4 p-3 bg-gray-900/60 rounded-lg border border-gray-700/50">
          <p className="text-sm text-gray-400">
            With <span className="text-white font-medium">{courts} courts</span>,{' '}
            <span className="text-white font-medium">{formatDuration(capacity.availableMinutes)}</span> session,{' '}
            and <span className="text-white font-medium">{capacity.slotDuration}min</span> slots,{' '}
            you can run a round-robin for up to{' '}
            <span className="text-lime-300 font-semibold">{capacity.maxTeams} teams</span>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default VenueCapacityCalculator;
