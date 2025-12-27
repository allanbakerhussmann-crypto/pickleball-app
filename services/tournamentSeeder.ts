/**
 * Tournament Seeder Service
 *
 * Generates test data for tournaments to enable single-user testing.
 * Creates fake teams, players, and optionally generates matches.
 *
 * FILE LOCATION: services/tournamentSeeder.ts
 * VERSION: V06.14
 *
 * V06.14 Changes:
 * - Added playType option to support singles vs doubles divisions
 * - Singles: Creates 1 player per team (e.g., "Alex (Test)")
 * - Doubles: Creates 2 players per team (e.g., "Alex & Jordan (Test Team)")
 *
 * TESTING ONLY - Use this to populate tournaments with test data.
 */

import {
  doc,
  collection,
  getDocs,
  query,
  where,
  writeBatch,
} from '@firebase/firestore';
import { db } from './firebase/config';
import type { Team, Match, Division } from '../types';

// ============================================
// Types
// ============================================

export interface SeedOptions {
  tournamentId: string;
  divisionId: string;
  teamCount: number; // 4, 8, or 16
  generateMatches: boolean;
  userId: string; // Admin user running the seed
  playType?: 'singles' | 'doubles'; // Singles = 1 player per team, Doubles = 2 players per team
}

export interface SeedResult {
  teamsCreated: number;
  matchesCreated: number;
  message: string;
}

// ============================================
// Name Generation
// ============================================

const FIRST_NAMES = [
  'Alex', 'Jordan', 'Casey', 'Taylor', 'Morgan', 'Riley', 'Quinn', 'Avery',
  'Blake', 'Cameron', 'Dakota', 'Drew', 'Finley', 'Harper', 'Jamie', 'Kendall',
  'Logan', 'Mackenzie', 'Parker', 'Peyton', 'Reagan', 'Reese', 'Rowan', 'Sage',
  'Skyler', 'Spencer', 'Sydney', 'Tatum', 'Tyler', 'Wesley', 'Emerson', 'Hayden',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Wilson', 'Anderson', 'Thomas', 'Taylor',
  'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White', 'Harris', 'Clark',
  'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott',
];

const generatePlayerId = (index: number): string => {
  const first = FIRST_NAMES[index % FIRST_NAMES.length];
  const last = LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length];
  const suffix = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `test_player_${first.toLowerCase()}_${last.toLowerCase()}_${suffix}`;
};

const generatePlayerName = (index: number): string => {
  const first = FIRST_NAMES[index % FIRST_NAMES.length];
  const last = LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length];
  return `${first} ${last} (Test)`;
};

const generateTeamName = (player1Index: number, player2Index: number): string => {
  const first1 = FIRST_NAMES[player1Index % FIRST_NAMES.length];
  const first2 = FIRST_NAMES[player2Index % FIRST_NAMES.length];
  return `${first1} & ${first2} (Test Team)`;
};

// ============================================
// Seed Functions
// ============================================

/**
 * Seed a tournament division with test teams
 */
export const seedTournamentWithTestTeams = async (
  options: SeedOptions
): Promise<SeedResult> => {
  const { tournamentId, divisionId, teamCount, generateMatches, userId, playType = 'doubles' } = options;

  if (teamCount < 2 || teamCount > 32) {
    return {
      teamsCreated: 0,
      matchesCreated: 0,
      message: 'Team count must be between 2 and 32',
    };
  }

  const now = Date.now();
  const batch = writeBatch(db);
  const teamsCreated: Team[] = [];
  const isSingles = playType === 'singles';

  // Create teams
  // Singles: 1 player per team (e.g., "Alex (Test)")
  // Doubles: 2 players per team (e.g., "Alex & Jordan (Test Team)")
  for (let i = 0; i < teamCount; i++) {
    const teamRef = doc(collection(db, 'tournaments', tournamentId, 'teams'));

    if (isSingles) {
      // Singles: one player per team
      const playerIndex = i;
      const playerId = generatePlayerId(playerIndex);
      const playerName = generatePlayerName(playerIndex);

      const team: Team = {
        id: teamRef.id,
        tournamentId,
        divisionId,
        players: [playerId],
        teamName: playerName, // Just the player name for singles
        createdByUserId: userId,
        captainPlayerId: playerId,
        isLookingForPartner: false,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        player1DisplayName: playerName,
      } as Team;

      batch.set(teamRef, team);
      teamsCreated.push(team);
    } else {
      // Doubles: two players per team
      const player1Index = i * 2;
      const player2Index = i * 2 + 1;

      const player1Id = generatePlayerId(player1Index);
      const player2Id = generatePlayerId(player2Index);

      const team: Team = {
        id: teamRef.id,
        tournamentId,
        divisionId,
        players: [player1Id, player2Id],
        teamName: generateTeamName(player1Index, player2Index),
        createdByUserId: userId,
        captainPlayerId: player1Id,
        isLookingForPartner: false,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        player1DisplayName: generatePlayerName(player1Index),
        player2DisplayName: generatePlayerName(player2Index),
      } as Team;

      batch.set(teamRef, team);
      teamsCreated.push(team);
    }
  }

  await batch.commit();

  let matchesCreated = 0;

  // Generate matches if requested
  if (generateMatches && teamsCreated.length >= 2) {
    matchesCreated = await generateTestMatches(tournamentId, divisionId, teamsCreated);
  }

  return {
    teamsCreated: teamsCreated.length,
    matchesCreated,
    message: `Created ${teamsCreated.length} test teams${generateMatches ? ` and ${matchesCreated} matches` : ''}`,
  };
};

/**
 * Generate round-robin matches for test teams
 */
export const generateTestMatches = async (
  tournamentId: string,
  divisionId: string,
  teams: Team[]
): Promise<number> => {
  const now = Date.now();
  const batch = writeBatch(db);
  const matches: Match[] = [];

  // Round robin: every team plays every other team
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const matchRef = doc(collection(db, 'tournaments', tournamentId, 'matches'));
      const match: Match = {
        id: matchRef.id,
        tournamentId,
        divisionId,
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

      batch.set(matchRef, match);
      matches.push(match);
    }
  }

  await batch.commit();
  return matches.length;
};

/**
 * Clear all test data from a division
 */
export const clearTestData = async (
  tournamentId: string,
  divisionId: string
): Promise<{ teamsDeleted: number; matchesDeleted: number }> => {
  // Get all teams in the division
  const teamsQuery = query(
    collection(db, 'tournaments', tournamentId, 'teams'),
    where('divisionId', '==', divisionId)
  );
  const teamsSnap = await getDocs(teamsQuery);

  // Find test teams (players start with test_player_)
  const testTeamIds: string[] = [];
  teamsSnap.forEach((d) => {
    const team = d.data() as Team;
    const players = team.players || [];
    const isTestTeam = players.some((p) => p.startsWith('test_player_'));
    if (isTestTeam) {
      testTeamIds.push(d.id);
    }
  });

  if (testTeamIds.length === 0) {
    return { teamsDeleted: 0, matchesDeleted: 0 };
  }

  // Get all matches in the division
  const matchesQuery = query(
    collection(db, 'tournaments', tournamentId, 'matches'),
    where('divisionId', '==', divisionId)
  );
  const matchesSnap = await getDocs(matchesQuery);

  // Find matches involving test teams
  const testMatchIds: string[] = [];
  matchesSnap.forEach((d) => {
    const match = d.data() as Match;
    if (testTeamIds.includes(match.teamAId) || testTeamIds.includes(match.teamBId)) {
      testMatchIds.push(d.id);
    }
  });

  // Delete in batches (Firestore limit: 500 operations per batch)
  const batchSize = 450;
  let teamsDeleted = 0;
  let matchesDeleted = 0;

  // Delete matches first
  for (let i = 0; i < testMatchIds.length; i += batchSize) {
    const batch = writeBatch(db);
    const chunk = testMatchIds.slice(i, i + batchSize);
    chunk.forEach((id) => {
      batch.delete(doc(db, 'tournaments', tournamentId, 'matches', id));
    });
    await batch.commit();
    matchesDeleted += chunk.length;
  }

  // Delete teams
  for (let i = 0; i < testTeamIds.length; i += batchSize) {
    const batch = writeBatch(db);
    const chunk = testTeamIds.slice(i, i + batchSize);
    chunk.forEach((id) => {
      batch.delete(doc(db, 'tournaments', tournamentId, 'teams', id));
    });
    await batch.commit();
    teamsDeleted += chunk.length;
  }

  return { teamsDeleted, matchesDeleted };
};

/**
 * Check if a division has test data
 */
export const hasTestData = async (
  tournamentId: string,
  divisionId: string
): Promise<boolean> => {
  const teamsQuery = query(
    collection(db, 'tournaments', tournamentId, 'teams'),
    where('divisionId', '==', divisionId)
  );
  const teamsSnap = await getDocs(teamsQuery);

  let hasTest = false;
  teamsSnap.forEach((d) => {
    const team = d.data() as Team;
    const players = team.players || [];
    if (players.some((p) => p.startsWith('test_player_'))) {
      hasTest = true;
    }
  });

  return hasTest;
};
