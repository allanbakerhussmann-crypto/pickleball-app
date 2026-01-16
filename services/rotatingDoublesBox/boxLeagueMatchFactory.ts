/**
 * Box League Match Factory
 *
 * Creates universal Match objects for box league matches.
 * Matches are stored in leagues/{leagueId}/matches/{matchId}
 * (same as singles weekly league for DUPR compatibility).
 *
 * FILE LOCATION: services/rotatingDoublesBox/boxLeagueMatchFactory.ts
 * VERSION: V07.50
 *
 * V07.49: Added seasonId, participantIds to match docs for efficient queries
 * V07.50: Fixed substitute name resolution - now checks absences, members, and users
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
} from '@firebase/firestore';
import { db } from '../firebase/config';
import type { Match, MatchParticipant } from '../../types/game/match';
import type { GameSettings } from '../../types/game/gameSettings';
import type {
  BoxLeagueWeek,
  BoxAssignment,
  GeneratedPairing,
} from '../../types/rotatingDoublesBox';
import { generateBoxPairings, PlayerInfo } from '../../types/rotatingDoublesBox';

// ============================================
// FIRESTORE PATHS
// ============================================

/**
 * Get matches collection for a league
 * CRITICAL: Matches are stored NESTED under leagues (not top-level)
 */
function getMatchesCollection(leagueId: string) {
  return collection(db, 'leagues', leagueId, 'matches');
}

/**
 * Get match document reference
 */
function getMatchDoc(leagueId: string, matchId: string) {
  return doc(db, 'leagues', leagueId, 'matches', matchId);
}

// ============================================
// IDEMPOTENCY KEY
// ============================================

/**
 * Generate an idempotency key for a match
 *
 * Used to prevent duplicate match creation on retries
 */
function generateIdempotencyKey(
  leagueId: string,
  weekNumber: number,
  boxNumber: number,
  roundNumber: number
): string {
  return `${leagueId}_week${weekNumber}_box${boxNumber}_round${roundNumber}`;
}

/**
 * V07.39: Generate deterministic match ID
 *
 * Format: {leagueId}_w{week}_b{box}_r{round}_m{matchIndex}_rotv{version}
 * This ensures idempotent match creation - same inputs = same matchId
 */
export function generateDeterministicMatchId(
  leagueId: string,
  weekNumber: number,
  boxNumber: number,
  roundNumber: number,
  matchIndex: number,
  rotationVersion: number = 1
): string {
  return `${leagueId}_w${weekNumber}_b${boxNumber}_r${roundNumber}_m${matchIndex}_rotv${rotationVersion}`;
}

/**
 * V07.39: Match document for batch creation
 */
export interface MatchDoc {
  id: string;
  data: Match;
}

/**
 * V07.40: Generate match documents for a week (without writing to Firestore)
 *
 * Returns array of {id, data} for use in transactions/batches.
 * Uses deterministic matchIds for idempotency.
 *
 * @param leagueId - League ID
 * @param week - Week document (for rulesSnapshot, weekNumber, scheduledDate, courtAssignments)
 * @param rotationVersion - Rotation version for deterministic IDs
 * @param boxAssignmentsOverride - Optional: use these assignments instead of week.boxAssignments
 */
export async function generateMatchDocsForWeek(
  leagueId: string,
  week: BoxLeagueWeek,
  rotationVersion: number = 1,
  boxAssignmentsOverride?: BoxAssignment[],
  venueInfo?: { sessions?: { startTime: string }[]; venueName?: string } // V07.50
): Promise<MatchDoc[]> {
  // V07.40: Use override if provided, otherwise use week's assignments
  const boxAssignments = boxAssignmentsOverride ?? week.boxAssignments;

  // Debug log: confirm which assignments we're using
  console.log('[generateMatchDocsForWeek] using boxes:',
    boxAssignments.map(b => `Box ${b.boxNumber}: ${b.playerIds.join(',')}`)
  );

  // V07.50: Get player lookup data including substitute names from absences
  const playerLookup = await getPlayerLookup(leagueId, boxAssignments, week.absences);

  const matchDocs: MatchDoc[] = [];

  // Find game settings from rules snapshot
  const gameSettings: GameSettings = {
    playType: 'doubles',
    pointsPerGame: week.rulesSnapshot.pointsTo,
    winBy: week.rulesSnapshot.winBy,
    bestOf: week.rulesSnapshot.bestOf,
  };

  // Get court assignments map (V07.50: include session time)
  const courtMap = new Map<number, { court: string; sessionTime?: string }>();
  for (const ca of week.courtAssignments) {
    const sessionTime = venueInfo?.sessions?.[ca.sessionIndex]?.startTime;
    courtMap.set(ca.boxNumber, {
      court: ca.courtLabel,
      sessionTime,
    });
  }

  // Generate matches for each box
  let globalMatchIndex = 0;
  for (const boxAssignment of boxAssignments) {
    const boxSize = boxAssignment.playerIds.length as 4 | 5 | 6;

    // Build player info array for rotation
    const players: PlayerInfo[] = boxAssignment.playerIds.map((id) => ({
      id,
      name: playerLookup[id]?.name || 'Unknown',
    }));

    // Generate pairings using rotation pattern
    const pairings = generateBoxPairings(players, boxSize);

    // Create match doc for each pairing
    for (const pairing of pairings) {
      globalMatchIndex++;

      // Generate deterministic match ID
      const matchId = generateDeterministicMatchId(
        leagueId,
        week.weekNumber,
        boxAssignment.boxNumber,
        pairing.roundNumber,
        globalMatchIndex,
        rotationVersion
      );

      const now = Date.now();

      // V07.50: Get court and session info
      const courtInfo = courtMap.get(boxAssignment.boxNumber);

      const matchData = createBoxLeagueMatch({
        leagueId,
        seasonId: week.seasonId,
        weekNumber: week.weekNumber,
        boxNumber: boxAssignment.boxNumber,
        roundNumber: pairing.roundNumber,
        pairing,
        playerLookup,
        gameSettings,
        scheduledDate: week.scheduledDate,
        court: courtInfo?.court,
        scheduledTime: courtInfo?.sessionTime,
        venue: venueInfo?.venueName,
      });

      const match: Match = {
        ...matchData,
        id: matchId,
        createdAt: now,
        updatedAt: now,
      };

      // Add idempotency key for backward compatibility
      (match as any).idempotencyKey = generateIdempotencyKey(
        leagueId,
        week.weekNumber,
        boxAssignment.boxNumber,
        pairing.roundNumber
      );

      // Add rotation version
      (match as any).rotationVersion = rotationVersion;

      matchDocs.push({ id: matchId, data: match });
    }
  }

  return matchDocs;
}

// ============================================
// MATCH CREATION
// ============================================

/**
 * Player lookup for match creation
 */
export interface PlayerLookup {
  [playerId: string]: {
    name: string;
    duprId?: string;
    duprRating?: number;
  };
}

/**
 * Create a single box league match
 *
 * V07.49: Added seasonId and participantIds for efficient queries
 *
 * @returns Match without id, createdAt, updatedAt (caller provides these)
 */
export function createBoxLeagueMatch(params: {
  leagueId: string;
  seasonId: string;
  weekNumber: number;
  boxNumber: number;
  roundNumber: number;
  pairing: GeneratedPairing;
  playerLookup: PlayerLookup;
  gameSettings: GameSettings;
  scheduledDate?: number;
  court?: string;
  scheduledTime?: string;  // V07.50: Session start time (HH:MM)
  venue?: string;          // V07.50: Venue name
}): Omit<Match, 'id' | 'createdAt' | 'updatedAt'> {
  const {
    leagueId,
    seasonId,
    weekNumber,
    boxNumber,
    roundNumber,
    pairing,
    playerLookup,
    gameSettings,
    scheduledDate,
    court,
    scheduledTime,
    venue,
  } = params;

  // Build sideA participant
  const sideAPlayer1 = playerLookup[pairing.teamAPlayerIds[0]];
  const sideAPlayer2 = playerLookup[pairing.teamAPlayerIds[1]];

  const sideA: MatchParticipant = {
    id: `${pairing.teamAPlayerIds[0]}_${pairing.teamAPlayerIds[1]}`, // Composite ID
    name: `${sideAPlayer1?.name || 'Unknown'} & ${sideAPlayer2?.name || 'Unknown'}`,
    playerIds: pairing.teamAPlayerIds,
    playerNames: [sideAPlayer1?.name || 'Unknown', sideAPlayer2?.name || 'Unknown'],
    duprIds: [sideAPlayer1?.duprId, sideAPlayer2?.duprId].filter(Boolean) as string[],
  };

  // Build sideB participant
  const sideBPlayer1 = playerLookup[pairing.teamBPlayerIds[0]];
  const sideBPlayer2 = playerLookup[pairing.teamBPlayerIds[1]];

  const sideB: MatchParticipant = {
    id: `${pairing.teamBPlayerIds[0]}_${pairing.teamBPlayerIds[1]}`, // Composite ID
    name: `${sideBPlayer1?.name || 'Unknown'} & ${sideBPlayer2?.name || 'Unknown'}`,
    playerIds: pairing.teamBPlayerIds,
    playerNames: [sideBPlayer1?.name || 'Unknown', sideBPlayer2?.name || 'Unknown'],
    duprIds: [sideBPlayer1?.duprId, sideBPlayer2?.duprId].filter(Boolean) as string[],
  };

  // V07.49: Build participantIds array for efficient queries
  const participantIds = [
    ...pairing.teamAPlayerIds,
    ...pairing.teamBPlayerIds,
  ];

  // Build match object
  const match: Omit<Match, 'id' | 'createdAt' | 'updatedAt'> = {
    eventType: 'league',
    eventId: leagueId,
    format: 'rotating_doubles_box',
    gameSettings,
    sideA,
    sideB,
    status: 'scheduled',
    scores: [],
    weekNumber,
    boxNumber,
    roundNumber,
    matchNumberInBox: roundNumber, // Round = match number for box league
  };

  // V07.49: Add seasonId and participantIds for efficient queries
  (match as any).seasonId = seasonId;
  (match as any).participantIds = participantIds;

  // Optional fields
  if (scheduledDate) {
    match.scheduledDate = scheduledDate;
  }
  if (court) {
    match.court = court;
  }
  // V07.50: Add session time and venue
  if (scheduledTime) {
    match.scheduledTime = scheduledTime;
  }
  if (venue) {
    match.venue = venue;
  }

  // Track bye player for 5/6 player boxes
  if (pairing.byePlayerId) {
    (match as any).byePlayerId = pairing.byePlayerId;
    (match as any).byePlayerName = pairing.byePlayerName;
  }

  return match;
}

/**
 * Generate all matches for a week
 *
 * @returns Array of created match IDs
 */
export async function generateMatchesForWeek(
  leagueId: string,
  week: BoxLeagueWeek,
  venueInfo?: { sessions?: { startTime: string }[]; venueName?: string } // V07.50
): Promise<string[]> {
  // V07.50: Get player lookup data including substitute names from absences
  const playerLookup = await getPlayerLookup(leagueId, week.boxAssignments, week.absences);

  const batch = writeBatch(db);
  const matchIds: string[] = [];

  // Find game settings from rules snapshot
  const gameSettings: GameSettings = {
    playType: 'doubles',
    pointsPerGame: week.rulesSnapshot.pointsTo,
    winBy: week.rulesSnapshot.winBy,
    bestOf: week.rulesSnapshot.bestOf,
  };

  // Get court assignments map (V07.50: include session time)
  const courtMap = new Map<number, { court: string; sessionTime?: string }>();
  for (const ca of week.courtAssignments) {
    const sessionTime = venueInfo?.sessions?.[ca.sessionIndex]?.startTime;
    courtMap.set(ca.boxNumber, {
      court: ca.courtLabel,
      sessionTime,
    });
  }

  // Generate matches for each box
  for (const boxAssignment of week.boxAssignments) {
    const boxSize = boxAssignment.playerIds.length as 4 | 5 | 6;

    // Build player info array for rotation
    const players: PlayerInfo[] = boxAssignment.playerIds.map((id) => ({
      id,
      name: playerLookup[id]?.name || 'Unknown',
    }));

    // Generate pairings using rotation pattern
    const pairings = generateBoxPairings(players, boxSize);

    // Create match for each pairing
    for (const pairing of pairings) {
      // Check for existing match with idempotency key
      const idempotencyKey = generateIdempotencyKey(
        leagueId,
        week.weekNumber,
        boxAssignment.boxNumber,
        pairing.roundNumber
      );

      const existingMatch = await getMatchByIdempotencyKey(leagueId, idempotencyKey);
      if (existingMatch) {
        matchIds.push(existingMatch.id);
        continue;
      }

      // Create match document
      const matchRef = doc(getMatchesCollection(leagueId));
      const now = Date.now();

      // V07.50: Get court and session info
      const courtInfo = courtMap.get(boxAssignment.boxNumber);

      const matchData = createBoxLeagueMatch({
        leagueId,
        seasonId: week.seasonId,
        weekNumber: week.weekNumber,
        boxNumber: boxAssignment.boxNumber,
        roundNumber: pairing.roundNumber,
        pairing,
        playerLookup,
        gameSettings,
        scheduledDate: week.scheduledDate,
        court: courtInfo?.court,
        scheduledTime: courtInfo?.sessionTime,
        venue: venueInfo?.venueName,
      });

      const match: Match = {
        ...matchData,
        id: matchRef.id,
        createdAt: now,
        updatedAt: now,
      };

      // Add idempotency key for deduplication
      (match as any).idempotencyKey = idempotencyKey;

      batch.set(matchRef, match);
      matchIds.push(matchRef.id);
    }
  }

  await batch.commit();

  return matchIds;
}

// ============================================
// PLAYER LOOKUP
// ============================================

/**
 * Get player lookup data from league members, absences (for substitutes), and users
 *
 * V07.50: Enhanced to resolve substitute names from:
 * 1. Week absences (substituteName stored when sub is assigned)
 * 2. League members collection
 * 3. Users collection (fallback for non-member substitutes)
 */
async function getPlayerLookup(
  leagueId: string,
  boxAssignments: BoxAssignment[],
  absences?: { substituteId?: string; substituteName?: string }[]
): Promise<PlayerLookup> {
  const allPlayerIds = boxAssignments.flatMap((ba) => ba.playerIds);
  const uniquePlayerIds = [...new Set(allPlayerIds)];

  const lookup: PlayerLookup = {};

  // Build a map of substituteId -> substituteName from absences
  const substituteNames = new Map<string, string>();
  if (absences) {
    for (const absence of absences) {
      if (absence.substituteId && absence.substituteName) {
        substituteNames.set(absence.substituteId, absence.substituteName);
      }
    }
  }

  // Fetch member data from league members collection
  const membersRef = collection(db, 'leagues', leagueId, 'members');
  const usersRef = collection(db, 'users');

  for (const playerId of uniquePlayerIds) {
    // 1. Check if this is a substitute with a stored name
    const subName = substituteNames.get(playerId);
    if (subName) {
      // Try to get DUPR info from users collection
      const userDoc = await getDoc(doc(usersRef, playerId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        lookup[playerId] = {
          name: subName,
          duprId: userData.duprId,
          duprRating: userData.duprDoublesRating,
        };
      } else {
        lookup[playerId] = { name: subName };
      }
      continue;
    }

    // 2. Check league members collection
    const memberDoc = await getDoc(doc(membersRef, playerId));
    if (memberDoc.exists()) {
      const data = memberDoc.data();
      lookup[playerId] = {
        name: data.displayName || 'Unknown',
        duprId: data.duprId,
        duprRating: data.duprDoublesRating,
      };
      continue;
    }

    // 3. Fallback to users collection (for non-member substitutes without stored name)
    const userDoc = await getDoc(doc(usersRef, playerId));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      lookup[playerId] = {
        name: userData.displayName || userData.email?.split('@')[0] || 'Unknown',
        duprId: userData.duprId,
        duprRating: userData.duprDoublesRating,
      };
      continue;
    }

    // 4. Final fallback
    lookup[playerId] = { name: 'Unknown' };
  }

  return lookup;
}

/**
 * Get a match by its idempotency key
 */
async function getMatchByIdempotencyKey(
  leagueId: string,
  idempotencyKey: string
): Promise<Match | null> {
  const q = query(
    getMatchesCollection(leagueId),
    where('idempotencyKey', '==', idempotencyKey)
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return null;
  }

  return snapshot.docs[0].data() as Match;
}

// ============================================
// MATCH QUERIES
// ============================================

/**
 * Get all matches for a week
 */
export async function getMatchesForWeek(
  leagueId: string,
  weekNumber: number
): Promise<Match[]> {
  const q = query(
    getMatchesCollection(leagueId),
    where('weekNumber', '==', weekNumber)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data() as Match);
}

/**
 * Get matches for a specific box in a week
 */
export async function getMatchesForBox(
  leagueId: string,
  weekNumber: number,
  boxNumber: number
): Promise<Match[]> {
  const q = query(
    getMatchesCollection(leagueId),
    where('weekNumber', '==', weekNumber),
    where('boxNumber', '==', boxNumber)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data() as Match);
}

/**
 * Get match counts by status for a set of match IDs
 */
export async function getMatchCounts(
  leagueId: string,
  matchIds: string[]
): Promise<{
  total: number;
  completed: number;
  pending: number;
  disputed: number;
  inProgress: number;
  scheduled: number;
}> {
  if (matchIds.length === 0) {
    return {
      total: 0,
      completed: 0,
      pending: 0,
      disputed: 0,
      inProgress: 0,
      scheduled: 0,
    };
  }

  // Fetch all matches
  const matches: Match[] = [];
  for (const matchId of matchIds) {
    const matchDoc = await getDoc(getMatchDoc(leagueId, matchId));
    if (matchDoc.exists()) {
      matches.push(matchDoc.data() as Match);
    }
  }

  return {
    total: matches.length,
    completed: matches.filter((m) => m.status === 'completed').length,
    pending: matches.filter((m) => m.status === 'pending_confirmation').length,
    disputed: matches.filter((m) => m.status === 'disputed').length,
    inProgress: matches.filter((m) => m.status === 'in_progress').length,
    scheduled: matches.filter((m) => m.status === 'scheduled').length,
  };
}

/**
 * Get matches ready for DUPR submission
 *
 * Uses existing pattern from singles weekly league
 */
export async function getMatchesForDuprSubmission(
  leagueId: string,
  weekNumber?: number
): Promise<Match[]> {
  let q;

  if (weekNumber) {
    q = query(
      getMatchesCollection(leagueId),
      where('weekNumber', '==', weekNumber),
      where('status', '==', 'completed'),
      where('scoreState', '==', 'official'),
      where('dupr.submitted', '==', false)
    );
  } else {
    q = query(
      getMatchesCollection(leagueId),
      where('status', '==', 'completed'),
      where('scoreState', '==', 'official'),
      where('dupr.submitted', '==', false)
    );
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data() as Match);
}

// ============================================
// INDIVIDUAL PLAYER RESULTS
// ============================================

/**
 * Calculate individual player results for a match
 *
 * In rotating doubles, each player gets credited individually
 * for their wins/losses in the match.
 */
export function calculatePlayerResults(match: Match): Match['playerResults'] {
  if (match.status !== 'completed' || !match.winnerId) {
    return undefined;
  }

  const playerResults: Match['playerResults'] = [];

  // Get total points for each side
  let totalPointsA = 0;
  let totalPointsB = 0;
  for (const game of match.scores) {
    totalPointsA += game.scoreA;
    totalPointsB += game.scoreB;
  }

  // Determine winning side
  const sideAWon = match.winnerId === match.sideA.id;

  // Side A players
  for (let i = 0; i < match.sideA.playerIds.length; i++) {
    playerResults.push({
      playerId: match.sideA.playerIds[i],
      playerName: match.sideA.playerNames?.[i] || 'Unknown',
      won: sideAWon,
      pointsFor: totalPointsA,
      pointsAgainst: totalPointsB,
    });
  }

  // Side B players
  for (let i = 0; i < match.sideB.playerIds.length; i++) {
    playerResults.push({
      playerId: match.sideB.playerIds[i],
      playerName: match.sideB.playerNames?.[i] || 'Unknown',
      won: !sideAWon,
      pointsFor: totalPointsB,
      pointsAgainst: totalPointsA,
    });
  }

  return playerResults;
}

// ============================================
// VALIDATION
// ============================================

/**
 * Validate match for DUPR submission
 *
 * Checks:
 * - All 4 players have DUPR IDs
 * - At least one team scored 6+ points
 * - No tied games
 */
export function validateMatchForDupr(match: Match): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check DUPR IDs
  const allDuprIds = [
    ...(match.sideA.duprIds || []),
    ...(match.sideB.duprIds || []),
  ];

  if (allDuprIds.length !== 4) {
    errors.push('Not all players have DUPR IDs linked');
  }

  // Check minimum score
  let maxPointsAny = 0;
  for (const game of match.scores) {
    maxPointsAny = Math.max(maxPointsAny, game.scoreA, game.scoreB);
  }

  if (maxPointsAny < 6) {
    errors.push('At least one team must score 6+ points');
  }

  // Check for tied games
  for (const game of match.scores) {
    if (game.scoreA === game.scoreB) {
      errors.push(`Game ${game.gameNumber} is tied (${game.scoreA}-${game.scoreB})`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================
// SCORE CONFIRMATION RULES
// ============================================

/**
 * Check if a user can confirm a score
 *
 * For rotating doubles:
 * - Confirmation must come from the OPPOSING side
 * - Partner cannot confirm (only opponents can)
 */
export function canConfirmScore(match: Match, userId: string): boolean {
  const enteredBy = match.submittedByUserId;

  if (!enteredBy) {
    return false;
  }

  // Cannot confirm your own score submission
  if (userId === enteredBy) {
    return false;
  }

  // Find which side entered the score
  const enteredBySideA = match.sideA.playerIds.includes(enteredBy);
  const enteredBySideB = match.sideB.playerIds.includes(enteredBy);

  // Confirmer must be on the OTHER side
  if (enteredBySideA) {
    return match.sideB.playerIds.includes(userId);
  } else if (enteredBySideB) {
    return match.sideA.playerIds.includes(userId);
  }

  return false;
}

/**
 * Get list of users who can confirm a score
 */
export function getConfirmEligibleUsers(match: Match): string[] {
  const enteredBy = match.submittedByUserId;

  if (!enteredBy) {
    return [];
  }

  // Find which side entered the score
  const enteredBySideA = match.sideA.playerIds.includes(enteredBy);
  const enteredBySideB = match.sideB.playerIds.includes(enteredBy);

  // Return the other side's players
  if (enteredBySideA) {
    return [...match.sideB.playerIds];
  } else if (enteredBySideB) {
    return [...match.sideA.playerIds];
  }

  return [];
}
