/**
 * useTournamentPhase Hook
 * 
 * Manages tournament phase state and provides phase-related UI helpers.
 */

import { useState, useEffect, useMemo } from 'react';
import type { Match } from '../../../types';

export type TournamentPhase = 'registration' | 'in_progress' | 'completed';

interface UseTournamentPhaseProps {
  matches: Match[];
}

interface UseTournamentPhaseReturn {
  // Phase state
  tournamentPhase: TournamentPhase;
  phaseOverride: TournamentPhase | null;
  setPhaseOverride: (phase: TournamentPhase | null) => void;
  
  // UI helpers
  tournamentPhaseLabel: string;
  tournamentPhaseClass: string;
  
  // Actions
  handleStartTournament: () => void;
}

export const useTournamentPhase = ({
  matches,
}: UseTournamentPhaseProps): UseTournamentPhaseReturn => {
  const [phaseOverride, setPhaseOverride] = useState<TournamentPhase | null>(null);

  // ============================================
  // Computed phase based on matches
  // ============================================

  const computedPhase: TournamentPhase = useMemo(() => {
    if (matches.length === 0) return 'registration';
    const anyNotCompleted = matches.some(m => m.status !== 'completed');
    return anyNotCompleted ? 'in_progress' : 'completed';
  }, [matches]);

  // Auto-set phase to completed when all matches are done
  useEffect(() => {
    if (computedPhase === 'completed') {
      setPhaseOverride('completed');
    }
  }, [computedPhase]);

  // Final phase (override takes precedence)
  const tournamentPhase: TournamentPhase = phaseOverride ?? computedPhase;

  // ============================================
  // UI Helpers
  // ============================================

  const tournamentPhaseLabel = useMemo(() => {
    switch (tournamentPhase) {
      case 'registration':
        return 'Registration';
      case 'in_progress':
        return 'In Progress';
      case 'completed':
        return 'Completed';
      default:
        return 'Unknown';
    }
  }, [tournamentPhase]);

  const tournamentPhaseClass = useMemo(() => {
    switch (tournamentPhase) {
      case 'registration':
        return 'bg-yellow-900 text-yellow-300';
      case 'in_progress':
        return 'bg-green-900 text-green-300';
      case 'completed':
        return 'bg-blue-900 text-blue-300';
      default:
        return 'bg-gray-900 text-gray-300';
    }
  }, [tournamentPhase]);

  // ============================================
  // Actions
  // ============================================

  const handleStartTournament = () => {
    setPhaseOverride('in_progress');
  };

  return {
    tournamentPhase,
    phaseOverride,
    setPhaseOverride,
    tournamentPhaseLabel,
    tournamentPhaseClass,
    handleStartTournament,
  };
};