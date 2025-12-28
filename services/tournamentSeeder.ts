/**
 * Tournament Seeder Service
 *
 * Generates test data for tournaments to enable single-user testing.
 * Creates fake teams, players, and optionally generates matches.
 *
 * FILE LOCATION: services/tournamentSeeder.ts
 * VERSION: V06.17
 *
 * V06.17 Changes:
 * - Improved getDivisionCode() algorithm to generate UNIQUE codes for similar names
 * - "md open" → [MOP], "md open 60 plus" → [MO60], "md social" → [MOS]
 * - Extracts numbers from division names (e.g., "60 plus" → includes "60")
 * - Handles embedded numbers like "3.5" ratings
 *
 * V06.15 Changes:
 * - Added isTestData flag to generated matches for reliable cleanup
 * - Added clearOrphanedMatches() to delete matches where teams no longer exist
 * - clearTestData() now checks both legacy (teamAId) and modern (sideA.id) formats
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
import type { Team, Match } from '../types';

// ============================================
// Types
// ============================================

export interface SeedOptions {
  tournamentId: string;
  divisionId: string;
  divisionName?: string; // Division name for unique player names across divisions
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

/**
 * Generate a unique division code for display (e.g., "MDO", "M60", "MDS")
 *
 * Algorithm:
 * 1. Extract meaningful tokens from division name (words and numbers)
 * 2. Create code from first char of each token + any numbers
 * 3. Ensure minimum 3 characters for readability
 *
 * Examples:
 * - "md open" → "MO" (first chars) → "MDO" (padded)
 * - "md open 60 plus" → "MO60P" (includes number) → "M60" (truncated to 4 max)
 * - "md social" → "MS" → "MDS" (padded)
 * - "womens doubles" → "WD" → "WOD" (padded)
 */
const getDivisionCode = (divisionName?: string): string => {
  if (!divisionName) return '';

  // Extract tokens: split by spaces and non-alphanumeric chars
  const tokens = divisionName.toLowerCase().split(/[\s\-_\/]+/).filter(Boolean);

  if (tokens.length === 0) return '';

  // Build code: first char of each word + any numbers found
  let code = '';
  let hasNumber = false;

  for (const token of tokens) {
    // Check if token is purely numeric (like "60")
    if (/^\d+$/.test(token)) {
      // Add the number (limit to 2 digits for brevity)
      code += token.slice(0, 2);
      hasNumber = true;
    } else {
      // Add first letter of the word
      const firstLetter = token.replace(/[^a-z]/g, '').charAt(0);
      if (firstLetter) {
        code += firstLetter;
      }
      // Also extract embedded numbers (e.g., "3.5" → "35")
      const embeddedNum = token.replace(/[^0-9]/g, '');
      if (embeddedNum) {
        code += embeddedNum.slice(0, 2);
        hasNumber = true;
      }
    }
  }

  // If code is too short, pad with characters from the first word
  if (code.length < 3 && tokens[0]) {
    const firstWord = tokens[0].replace(/[^a-z]/g, '');
    while (code.length < 3 && code.length < firstWord.length + 1) {
      code = firstWord.slice(0, code.length + 1);
    }
  }

  // Limit to 4 chars max (but prefer 3 if no number)
  const maxLen = hasNumber ? 4 : 3;
  return code.slice(0, maxLen).toUpperCase();
};

/**
 * Generate unique player ID including division context
 * Format: test_player_firstname_lastname_divhash_randomsuffix
 */
const generatePlayerId = (index: number, divisionId?: string): string => {
  const first = FIRST_NAMES[index % FIRST_NAMES.length];
  const last = LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length];
  // Include division ID hash for guaranteed uniqueness across divisions
  const divHash = divisionId ? divisionId.slice(-4) : 'xxxx';
  const suffix = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `test_player_${first.toLowerCase()}_${last.toLowerCase()}_${divHash}_${suffix}`;
};

/**
 * Generate player display name with division code for uniqueness
 * Format: "Alex Smith [MEN]" or "Alex Smith (Test)" if no division name
 */
const generatePlayerName = (index: number, divisionName?: string): string => {
  const first = FIRST_NAMES[index % FIRST_NAMES.length];
  const last = LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length];
  const divCode = getDivisionCode(divisionName);
  return divCode ? `${first} ${last} [${divCode}]` : `${first} ${last} (Test)`;
};

/**
 * Generate team display name with division code for uniqueness
 * Format: "Alex & Jordan [MEN]" or "Alex & Jordan (Test Team)" if no division name
 */
const generateTeamName = (player1Index: number, player2Index: number, divisionName?: string): string => {
  const first1 = FIRST_NAMES[player1Index % FIRST_NAMES.length];
  const first2 = FIRST_NAMES[player2Index % FIRST_NAMES.length];
  const divCode = getDivisionCode(divisionName);
  return divCode ? `${first1} & ${first2} [${divCode}]` : `${first1} & ${first2} (Test Team)`;
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
  const { tournamentId, divisionId, divisionName, teamCount, generateMatches, userId, playType = 'doubles' } = options;

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
  // Singles: 1 player per team (e.g., "Alex Smith [MEN]")
  // Doubles: 2 players per team (e.g., "Alex & Jordan [MEN]")
  for (let i = 0; i < teamCount; i++) {
    const teamRef = doc(collection(db, 'tournaments', tournamentId, 'teams'));

    if (isSingles) {
      // Singles: one player per team
      const playerIndex = i;
      const playerId = generatePlayerId(playerIndex, divisionId);
      const playerName = generatePlayerName(playerIndex, divisionName);

      // Use Record for Firestore compatibility with all fields
      const teamData: Record<string, unknown> = {
        id: teamRef.id,
        tournamentId,
        divisionId,
        playerIds: [playerId], // Modern format
        teamName: playerName, // Just the player name for singles
        registeredByUserId: userId,
        captainPlayerId: playerId,
        isLookingForPartner: false,
        status: 'active',
        registeredAt: now,
        player1DisplayName: playerName,
      };

      batch.set(teamRef, teamData);
      teamsCreated.push({ ...teamData, id: teamRef.id } as Team);
    } else {
      // Doubles: two players per team
      const player1Index = i * 2;
      const player2Index = i * 2 + 1;

      const player1Id = generatePlayerId(player1Index, divisionId);
      const player2Id = generatePlayerId(player2Index, divisionId);

      // Use Record for Firestore compatibility with all fields
      const teamData: Record<string, unknown> = {
        id: teamRef.id,
        tournamentId,
        divisionId,
        playerIds: [player1Id, player2Id], // Modern format
        teamName: generateTeamName(player1Index, player2Index, divisionName),
        registeredByUserId: userId,
        captainPlayerId: player1Id,
        isLookingForPartner: false,
        status: 'active',
        registeredAt: now,
        player1DisplayName: generatePlayerName(player1Index, divisionName),
        player2DisplayName: generatePlayerName(player2Index, divisionName),
      };

      batch.set(teamRef, teamData);
      teamsCreated.push({ ...teamData, id: teamRef.id } as Team);
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
 * Assigns teams to pools and creates pool matches with proper poolGroup field.
 */
export const generateTestMatches = async (
  tournamentId: string,
  divisionId: string,
  teams: Team[]
): Promise<number> => {
  const now = Date.now();
  const batch = writeBatch(db);
  let matchCount = 0;

  // Determine number of pools (4 teams per pool is standard)
  const poolSize = 4;
  const poolCount = Math.ceil(teams.length / poolSize);

  // Assign teams to pools using snake draft for balanced seeding
  const pools: { poolName: string; teams: Team[] }[] = [];
  for (let i = 0; i < poolCount; i++) {
    const poolLetter = String.fromCharCode(65 + i); // A, B, C, D...
    pools.push({ poolName: `Pool ${poolLetter}`, teams: [] });
  }

  // Snake draft assignment
  let direction = 1;
  let poolIndex = 0;
  for (const team of teams) {
    pools[poolIndex].teams.push(team);
    poolIndex += direction;
    if (poolIndex >= poolCount) {
      poolIndex = poolCount - 1;
      direction = -1;
    } else if (poolIndex < 0) {
      poolIndex = 0;
      direction = 1;
    }
  }

  // Generate round robin matches within each pool
  for (const pool of pools) {
    const poolTeams = pool.teams;
    for (let i = 0; i < poolTeams.length; i++) {
      for (let j = i + 1; j < poolTeams.length; j++) {
        const matchRef = doc(collection(db, 'tournaments', tournamentId, 'matches'));

        // Build sideA and sideB for modern match format
        const teamA = poolTeams[i];
        const teamB = poolTeams[j];

        // Use Record for Firestore compatibility
        const matchData: Record<string, unknown> = {
          id: matchRef.id,
          tournamentId,
          divisionId,
          // Modern format (sideA/sideB)
          sideA: {
            id: teamA.id,
            name: teamA.teamName || 'Team A',
            playerIds: teamA.playerIds || [],
          },
          sideB: {
            id: teamB.id,
            name: teamB.teamName || 'Team B',
            playerIds: teamB.playerIds || [],
          },
          // Legacy format for compatibility
          teamAId: teamA.id,
          teamBId: teamB.id,
          roundNumber: 1,
          matchNumber: matchCount + 1,
          stage: 'pool',
          poolGroup: pool.poolName, // CRITICAL: Set poolGroup for pool stage filtering
          status: 'scheduled',
          scores: [],
          scoreTeamAGames: [],
          scoreTeamBGames: [],
          lastUpdatedAt: now,
          createdAt: now,
          isTestData: true, // Mark as test data for easy cleanup
        };

        batch.set(matchRef, matchData);
        matchCount++;
      }
    }
  }

  await batch.commit();
  return matchCount;
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

  // Find test teams (player IDs start with test_player_)
  const testTeamIds: string[] = [];
  teamsSnap.forEach((d) => {
    // Cast to any for Firestore data that may have legacy formats
    const teamData = d.data() as Record<string, unknown>;

    // Check playerIds array first (modern format)
    const playerIds = (teamData.playerIds as string[]) || [];
    let isTestTeam = playerIds.some((p) => typeof p === 'string' && p.startsWith('test_player_'));

    // Also check players array for legacy support (could be string[] or object[])
    if (!isTestTeam && teamData.players) {
      const players = teamData.players as unknown[];
      isTestTeam = players.some((p) => {
        if (typeof p === 'string') return p.startsWith('test_player_');
        if (p && typeof p === 'object' && 'id' in p) {
          const id = (p as Record<string, unknown>).id;
          return typeof id === 'string' && id.startsWith('test_player_');
        }
        return false;
      });
    }

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
  // Check: 1) isTestData flag, 2) legacy format (teamAId/teamBId), 3) modern format (sideA.id/sideB.id)
  const testMatchIds: string[] = [];
  matchesSnap.forEach((d) => {
    const match = d.data() as Match;

    // Check isTestData flag first (most reliable)
    if ((match as any).isTestData === true) {
      testMatchIds.push(d.id);
      return;
    }

    // Check team IDs against known test teams
    const teamAId = match.teamAId || (match as any).sideA?.id;
    const teamBId = match.teamBId || (match as any).sideB?.id;
    if (testTeamIds.includes(teamAId) || testTeamIds.includes(teamBId)) {
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
    // Cast to any for Firestore data that may have legacy formats
    const teamData = d.data() as Record<string, unknown>;

    // Check playerIds array first (modern format)
    const playerIds = (teamData.playerIds as string[]) || [];
    if (playerIds.some((p) => typeof p === 'string' && p.startsWith('test_player_'))) {
      hasTest = true;
      return;
    }

    // Also check players array for legacy support (could be string[] or object[])
    if (teamData.players) {
      const players = teamData.players as unknown[];
      const isTestTeam = players.some((p) => {
        if (typeof p === 'string') return p.startsWith('test_player_');
        if (p && typeof p === 'object' && 'id' in p) {
          const id = (p as Record<string, unknown>).id;
          return typeof id === 'string' && id.startsWith('test_player_');
        }
        return false;
      });
      if (isTestTeam) hasTest = true;
    }
  });

  return hasTest;
};

/**
 * Clear orphaned matches from a division (matches where teams no longer exist)
 * Useful when teams were deleted but matches remain.
 */
export const clearOrphanedMatches = async (
  tournamentId: string,
  divisionId: string
): Promise<{ matchesDeleted: number }> => {
  // Get all teams in the division
  const teamsQuery = query(
    collection(db, 'tournaments', tournamentId, 'teams'),
    where('divisionId', '==', divisionId)
  );
  const teamsSnap = await getDocs(teamsQuery);
  const validTeamIds = new Set<string>();
  teamsSnap.forEach((d) => validTeamIds.add(d.id));

  // Get all matches in the division
  const matchesQuery = query(
    collection(db, 'tournaments', tournamentId, 'matches'),
    where('divisionId', '==', divisionId)
  );
  const matchesSnap = await getDocs(matchesQuery);

  // Find orphaned matches (teams don't exist OR marked as test data)
  const orphanedMatchIds: string[] = [];
  matchesSnap.forEach((d) => {
    const match = d.data() as Match;

    // Always delete if marked as test data
    if ((match as any).isTestData === true) {
      orphanedMatchIds.push(d.id);
      return;
    }

    // Check if referenced teams exist
    const teamAId = match.teamAId || (match as any).sideA?.id;
    const teamBId = match.teamBId || (match as any).sideB?.id;

    // If either team doesn't exist, it's orphaned
    if ((teamAId && !validTeamIds.has(teamAId)) || (teamBId && !validTeamIds.has(teamBId))) {
      orphanedMatchIds.push(d.id);
    }
  });

  if (orphanedMatchIds.length === 0) {
    return { matchesDeleted: 0 };
  }

  // Delete in batches
  const batchSize = 450;
  let matchesDeleted = 0;

  for (let i = 0; i < orphanedMatchIds.length; i += batchSize) {
    const batch = writeBatch(db);
    const chunk = orphanedMatchIds.slice(i, i + batchSize);
    chunk.forEach((id) => {
      batch.delete(doc(db, 'tournaments', tournamentId, 'matches', id));
    });
    await batch.commit();
    matchesDeleted += chunk.length;
  }

  return { matchesDeleted };
};
