/**
 * useTournamentData Hook
 * 
 * Manages all Firebase subscriptions and data fetching for tournament data.
 * Centralizes divisions, teams, matches, courts, and player cache management.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Division, Team, Match, Court, UserProfile } from '../../../types';
import {
  subscribeToDivisions,
  subscribeToTeams,
  subscribeToMatches,
  subscribeToCourts,
  getUsersByIds,
  getRegistration,
} from '../../../services/firebase';

interface UseTournamentDataProps {
  tournamentId: string;
  currentUserId?: string;
}

interface UseTournamentDataReturn {
  // Data
  divisions: Division[];
  teams: Team[];
  matches: Match[];
  courts: Court[];
  playersCache: Record<string, UserProfile>;
  
  // Active division
  activeDivisionId: string;
  setActiveDivisionId: (id: string) => void;
  activeDivision: Division | undefined;
  
  // Filtered data for active division
  divisionTeams: Team[];
  divisionMatches: Match[];
  attentionMatches: Match[];
  
  // Registration status
  hasCompletedRegistration: boolean;
  
  // Helpers
  getTeamDisplayName: (teamId: string) => string;
  getTeamPlayers: (teamId: string) => UserProfile[];
}

export const useTournamentData = ({
  tournamentId,
  currentUserId,
}: UseTournamentDataProps): UseTournamentDataReturn => {
  // Core data state
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [playersCache, setPlayersCache] = useState<Record<string, UserProfile>>({});
  
  // Active division
  const [activeDivisionId, setActiveDivisionId] = useState<string>('');
  
  // Registration status
  const [hasCompletedRegistration, setHasCompletedRegistration] = useState(false);

  // ============================================
  // Subscriptions
  // ============================================

  useEffect(() => {
    const unsubDivs = subscribeToDivisions(tournamentId, setDivisions);
    const unsubTeams = subscribeToTeams(tournamentId, setTeams);
    const unsubMatches = subscribeToMatches(tournamentId, setMatches);
    const unsubCourts = subscribeToCourts(tournamentId, setCourts);

    return () => {
      unsubDivs();
      unsubTeams();
      unsubMatches();
      unsubCourts();
    };
  }, [tournamentId]);

  // ============================================
  // Auto-select first division
  // ============================================

  useEffect(() => {
    if (!activeDivisionId && divisions.length > 0) {
      setActiveDivisionId(divisions[0].id);
    }
  }, [divisions, activeDivisionId]);

  // ============================================
  // Fetch missing player profiles
  // ============================================

  useEffect(() => {
    const allPlayerIds = Array.from(new Set(teams.flatMap(t => t.players || [])));
    const missing = allPlayerIds.filter(
      id => !playersCache[id] && !id.startsWith('invite_') && !id.startsWith('tbd')
    );
    
    if (missing.length === 0) return;

    let cancelled = false;
    
    (async () => {
      try {
        const profiles = await getUsersByIds(missing);
        if (cancelled) return;
        setPlayersCache(prev => {
          const next = { ...prev };
          profiles.forEach(p => (next[p.id] = p));
          return next;
        });
      } catch (err) {
        console.error('Failed to fetch missing player profiles', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [teams, playersCache]);

  // ============================================
  // Check registration status
  // ============================================

  useEffect(() => {
    const loadRegistration = async () => {
      if (!currentUserId) {
        setHasCompletedRegistration(false);
        return;
      }

      try {
        const reg = await getRegistration(tournamentId, currentUserId);
        setHasCompletedRegistration(!!reg && reg.status === 'completed');
      } catch (err) {
        console.error('Failed to load registration status', err);
        setHasCompletedRegistration(false);
      }
    };

    loadRegistration();
  }, [tournamentId, currentUserId]);

  // ============================================
  // Derived data
  // ============================================

  const activeDivision = useMemo(
    () => divisions.find(d => d.id === activeDivisionId) || divisions[0],
    [divisions, activeDivisionId]
  );

  const divisionTeams = useMemo(
    () => teams.filter(
      t => t.divisionId === activeDivision?.id && t.status !== 'withdrawn'
    ),
    [teams, activeDivision]
  );

  const divisionMatches = useMemo(
    () => matches.filter(m => m.divisionId === activeDivision?.id),
    [matches, activeDivision]
  );

  const attentionMatches = useMemo(
    () => divisionMatches.filter(
      m => m.status === 'pending_confirmation' || m.status === 'disputed'
    ),
    [divisionMatches]
  );

  // ============================================
  // Helper functions
  // ============================================

  const getTeamDisplayName = useCallback((teamId: string): string => {
    const team = teams.find(t => t.id === teamId);
    if (!team) return 'TBD';
    if (team.teamName) return team.teamName;
    const names = (team.players || [])
      .map(pid => playersCache[pid]?.displayName || 'Unknown')
      .join(' / ');
    return names || 'TBD';
  }, [teams, playersCache]);

  const getTeamPlayers = useCallback((teamId: string): UserProfile[] => {
    const team = teams.find(t => t.id === teamId);
    if (!team) return [];
    return (team.players || [])
      .map(pid => playersCache[pid])
      .filter(Boolean) as UserProfile[];
  }, [teams, playersCache]);

  return {
    // Data
    divisions,
    teams,
    matches,
    courts,
    playersCache,
    
    // Active division
    activeDivisionId,
    setActiveDivisionId,
    activeDivision,
    
    // Filtered data
    divisionTeams,
    divisionMatches,
    attentionMatches,
    
    // Registration
    hasCompletedRegistration,
    
    // Helpers
    getTeamDisplayName,
    getTeamPlayers,
  };
};