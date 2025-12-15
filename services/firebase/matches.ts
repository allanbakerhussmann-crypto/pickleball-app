/**
 * Match Management and Schedule Generation
 */

import { 
  doc, 
  setDoc,
  updateDoc,
  collection, 
  onSnapshot,
  writeBatch,
} from '@firebase/firestore';
import { db } from './config';
import type { Match, Division, Team, UserProfile, StandingsEntry } from '../../types';

// ============================================
// Match CRUD
// ============================================

export const subscribeToMatches = (
  tournamentId: string, 
  callback: (matches: Match[]) => void
) => {
  return onSnapshot(
    collection(db, 'tournaments', tournamentId, 'matches'), 
    (snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Match)));
    }
  );
};

export const createMatch = async (tournamentId: string, match: Match) => {
  await setDoc(doc(db, 'tournaments', tournamentId, 'matches', match.id), match);
};

export const updateMatchScore = async (
  tournamentId: string, 
  matchId: string, 
  updates: Partial<Match>
) => {
  await updateDoc(
    doc(db, 'tournaments', tournamentId, 'matches', matchId), 
    { ...updates, updatedAt: Date.now() }
  );
};

export const batchCreateMatches = async (tournamentId: string, matches: Match[]) => {
  const batch = writeBatch(db);
  matches.forEach(m => {
    batch.set(doc(db, 'tournaments', tournamentId, 'matches', m.id), m);
  });
  await batch.commit();
};

// ============================================
// Schedule Generation
// ============================================

export const generatePoolsSchedule = async (
  tournamentId: string, 
  division: Division, 
  teams: Team[], 
  _playersCache: Record<string, UserProfile>
) => {
  const matches: Match[] = [];
  const now = Date.now();

  // Round robin: every team plays every other team
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const matchRef = doc(collection(db, 'tournaments', tournamentId, 'matches'));
      const match: Match = {
        id: matchRef.id,
        tournamentId,
        divisionId: division.id,
        teamAId: teams[i].id,
        teamBId: teams[j].id,
        roundNumber: 1,
        matchNumber: matches.length + 1,
        stage: 'Pool Play',
        status: 'scheduled',
        court: null,
        startTime: null,
        endTime: null,
        scoreTeamAGames: [],
        scoreTeamBGames: [],
        winnerTeamId: null,
        lastUpdatedBy: null,
        lastUpdatedAt: now,
      } as Match;
      matches.push(match);
    }
  }

  const batch = writeBatch(db);
  matches.forEach(m => {
    batch.set(doc(db, 'tournaments', tournamentId, 'matches', m.id), m);
  });
  await batch.commit();

  return matches;
};

export const generateBracketSchedule = async (
  tournamentId: string,
  division: Division,
  teams: Team[],
  _playersCache: Record<string, UserProfile>
) => {
  const matches: Match[] = [];
  const now = Date.now();
  const numTeams = teams.length;
  
  // Calculate bracket size (next power of 2)
  const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(numTeams)));
  const numRounds = Math.ceil(Math.log2(nextPowerOf2));

  let matchNumber = 1;
  
  for (let round = 1; round <= numRounds; round++) {
    const matchesInRound = nextPowerOf2 / Math.pow(2, round);
    
    for (let i = 0; i < matchesInRound; i++) {
      const matchRef = doc(collection(db, 'tournaments', tournamentId, 'matches'));
      
      // Only assign teams in round 1
      let teamAId: string | null = null;
      let teamBId: string | null = null;
      
      if (round === 1) {
        const seedA = i * 2;
        const seedB = i * 2 + 1;
        teamAId = seedA < teams.length ? teams[seedA].id : null;
        teamBId = seedB < teams.length ? teams[seedB].id : null;
      }

      const match: Match = {
        id: matchRef.id,
        tournamentId,
        divisionId: division.id,
        teamAId: teamAId || '',
        teamBId: teamBId || '',
        roundNumber: round,
        matchNumber: matchNumber++,
        stage: round === numRounds ? 'Finals' : 
               round === numRounds - 1 ? 'Semi-Finals' : 
               `Round ${round}`,
        status: 'scheduled',
        court: null,
        startTime: null,
        endTime: null,
        scoreTeamAGames: [],
        scoreTeamBGames: [],
        winnerTeamId: null,
        lastUpdatedBy: null,
        lastUpdatedAt: now,
      } as Match;
      
      matches.push(match);
    }
  }

  const batch = writeBatch(db);
  matches.forEach(m => {
    batch.set(doc(db, 'tournaments', tournamentId, 'matches', m.id), m);
  });
  await batch.commit();

  return matches;
};

export const generateFinalsFromPools = async (
  tournamentId: string,
  division: Division,
  teams: Team[],
  playersCache: Record<string, UserProfile>,
  standings: StandingsEntry[]
) => {
  // Get top teams from standings
  const advanceCount = (division as any).advanceCount || 4;
  const qualifyingTeams = standings.slice(0, advanceCount);
  
  // Map standings back to teams
  const teamsForBracket = qualifyingTeams
    .map(s => teams.find(t => t.id === s.teamId))
    .filter((t): t is Team => t !== undefined);
  
  return generateBracketSchedule(tournamentId, division, teamsForBracket, playersCache);
};