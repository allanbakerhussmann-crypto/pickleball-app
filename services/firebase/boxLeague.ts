/**
 * Box League Service V05.38
 * 
 * Service for Individual Rotating Doubles Box League format.
 * 
 * KEY FEATURES:
 * - Individual player tracking (not teams)
 * - Rotating partner generation
 * - Score entry with automatic point allocation
 * - Weekly standings calculation with tie-breakers
 * - Automatic promotion/relegation processing
 * 
 * FILE LOCATION: services/firebase/boxLeague.ts
 * VERSION: V05.38
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  writeBatch,
  onSnapshot,
  type Unsubscribe,
} from '@firebase/firestore';
import { db } from './config';
import type {
  BoxLeagueSettings,
  BoxLeaguePlayer,
  BoxLeagueMatch,
  BoxLeagueWeek,
  BoxAssignment,
  BoxStanding,
  PlayerMovement,
  BoxLeagueScoreInput,
  BoxLeagueScoreResult,
  ProcessWeekResult,
  GenerateBoxLeagueInput,
  GenerateBoxLeagueResult,
  RotatingPartnerPattern,
  BoxLeagueTiebreaker,
} from '../../types/boxLeague';
// Import the constant separately (not as type)
import { DEFAULT_BOX_TIEBREAKERS } from '../../types/boxLeague';

// ============================================
// CONSTANTS
// ============================================

const LEAGUES_COLLECTION = 'leagues';
const PLAYERS_SUBCOLLECTION = 'boxPlayers';
const MATCHES_SUBCOLLECTION = 'boxMatches';
const WEEKS_SUBCOLLECTION = 'boxWeeks';

// ============================================
// BOX PATTERNS
// ============================================

/**
 * 4-Player Box: 3 matches, everyone plays 3 times
 */
const BOX_PATTERN_4: RotatingPartnerPattern = {
  boxSize: 4,
  matches: [
    { team1: [0, 1], team2: [2, 3] },
    { team1: [0, 2], team2: [1, 3] },
    { team1: [0, 3], team2: [1, 2] },
  ],
};

/**
 * 5-Player Box: 5 matches, everyone plays 4 times, sits out once
 */
const BOX_PATTERN_5: RotatingPartnerPattern = {
  boxSize: 5,
  matches: [
    { team1: [0, 1], team2: [2, 3], bye: 4 },
    { team1: [0, 2], team2: [1, 4], bye: 3 },
    { team1: [0, 3], team2: [2, 4], bye: 1 },
    { team1: [0, 4], team2: [1, 3], bye: 2 },
    { team1: [1, 2], team2: [3, 4], bye: 0 },
  ],
};

/**
 * 6-Player Box: 5 matches per week
 */
const BOX_PATTERN_6: RotatingPartnerPattern = {
  boxSize: 6,
  matches: [
    { team1: [0, 1], team2: [2, 3] },
    { team1: [4, 5], team2: [0, 2] },
    { team1: [1, 3], team2: [4, 5] },
    { team1: [2, 5], team2: [1, 4] },
    { team1: [3, 0], team2: [5, 1] },
  ],
};

function getBoxPattern(boxSize: 4 | 5 | 6): RotatingPartnerPattern {
  switch (boxSize) {
    case 4: return BOX_PATTERN_4;
    case 5: return BOX_PATTERN_5;
    case 6: return BOX_PATTERN_6;
  }
}

// ============================================
// PLAYER CRUD OPERATIONS
// ============================================

/**
 * Add a player to the box league
 */
export async function addBoxLeaguePlayer(
  leagueId: string,
  player: Omit<BoxLeaguePlayer, 'id' | 'joinedAt' | 'lastActiveAt' | 'updatedAt'>
): Promise<string> {
  const playerRef = doc(collection(db, LEAGUES_COLLECTION, leagueId, PLAYERS_SUBCOLLECTION));
  const now = Date.now();
  
  const newPlayer: BoxLeaguePlayer = {
    ...player,
    id: playerRef.id,
    joinedAt: now,
    lastActiveAt: now,
    updatedAt: now,
  };
  
  await setDoc(playerRef, newPlayer);
  return playerRef.id;
}

/**
 * Get all players in a box league
 */
export async function getBoxLeaguePlayers(leagueId: string): Promise<BoxLeaguePlayer[]> {
  const q = query(
    collection(db, LEAGUES_COLLECTION, leagueId, PLAYERS_SUBCOLLECTION),
    where('isActive', '==', true),
    orderBy('ladderPosition', 'asc')
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as BoxLeaguePlayer);
}

/**
 * Subscribe to box league players
 */
export function subscribeToBoxLeaguePlayers(
  leagueId: string,
  callback: (players: BoxLeaguePlayer[]) => void
): Unsubscribe {
  const q = query(
    collection(db, LEAGUES_COLLECTION, leagueId, PLAYERS_SUBCOLLECTION),
    orderBy('ladderPosition', 'asc')
  );
  
  return onSnapshot(q, (snap) => {
    const players = snap.docs.map(d => d.data() as BoxLeaguePlayer);
    callback(players);
  });
}

/**
 * Update a player's stats and position
 */
export async function updateBoxLeaguePlayer(
  leagueId: string,
  playerId: string,
  updates: Partial<BoxLeaguePlayer>
): Promise<void> {
  const playerRef = doc(db, LEAGUES_COLLECTION, leagueId, PLAYERS_SUBCOLLECTION, playerId);
  await updateDoc(playerRef, {
    ...updates,
    updatedAt: Date.now(),
  });
}

/**
 * Move a player between boxes (organizer only)
 * V05.44 - Drag-and-drop support
 */
export async function movePlayerBetweenBoxes(
  leagueId: string,
  playerId: string,
  fromBoxNumber: number,
  toBoxNumber: number,
  newPositionInBox: number
): Promise<{ success: boolean; message: string }> {
  try {
    // Get all active players
    const players = await getBoxLeaguePlayers(leagueId);
    const playerToMove = players.find(p => p.id === playerId);

    if (!playerToMove) {
      return { success: false, message: 'Player not found' };
    }

    // Get players in the destination box
    const playersInTargetBox = players.filter(p => p.currentBoxNumber === toBoxNumber && p.id !== playerId);

    // Calculate new positions
    const batch = writeBatch(db);
    const now = Date.now();

    // Update the moved player
    const movedPlayerRef = doc(db, LEAGUES_COLLECTION, leagueId, PLAYERS_SUBCOLLECTION, playerId);
    batch.update(movedPlayerRef, {
      currentBoxNumber: toBoxNumber,
      positionInBox: newPositionInBox,
      updatedAt: now,
    });

    // Shift other players in the target box
    for (const player of playersInTargetBox) {
      if (player.positionInBox >= newPositionInBox) {
        const playerRef = doc(db, LEAGUES_COLLECTION, leagueId, PLAYERS_SUBCOLLECTION, player.id);
        batch.update(playerRef, {
          positionInBox: player.positionInBox + 1,
          updatedAt: now,
        });
      }
    }

    // Shift players in the source box (close the gap)
    const playersInSourceBox = players.filter(p => p.currentBoxNumber === fromBoxNumber && p.id !== playerId);
    for (const player of playersInSourceBox) {
      if (player.positionInBox > playerToMove.positionInBox) {
        const playerRef = doc(db, LEAGUES_COLLECTION, leagueId, PLAYERS_SUBCOLLECTION, player.id);
        batch.update(playerRef, {
          positionInBox: player.positionInBox - 1,
          updatedAt: now,
        });
      }
    }

    await batch.commit();

    return {
      success: true,
      message: `Moved ${playerToMove.displayName} to Box ${toBoxNumber}`,
    };
  } catch (error: any) {
    console.error('Failed to move player between boxes:', error);
    return { success: false, message: error.message || 'Failed to move player' };
  }
}

/**
 * Reorder players within a box (organizer only)
 * V05.44 - Drag-and-drop support
 */
export async function reorderPlayersInBox(
  leagueId: string,
  boxNumber: number,
  playerIdsInOrder: string[]
): Promise<{ success: boolean; message: string }> {
  try {
    const batch = writeBatch(db);
    const now = Date.now();

    // Update each player's position in box
    for (let i = 0; i < playerIdsInOrder.length; i++) {
      const playerId = playerIdsInOrder[i];
      const playerRef = doc(db, LEAGUES_COLLECTION, leagueId, PLAYERS_SUBCOLLECTION, playerId);
      batch.update(playerRef, {
        positionInBox: i + 1,
        updatedAt: now,
      });
    }

    await batch.commit();

    return {
      success: true,
      message: `Reordered players in Box ${boxNumber}`,
    };
  } catch (error: any) {
    console.error('Failed to reorder players in box:', error);
    return { success: false, message: error.message || 'Failed to reorder players' };
  }
}

/**
 * Swap two players between boxes (organizer only)
 * V05.44 - Drag-and-drop support
 */
export async function swapPlayersBetweenBoxes(
  leagueId: string,
  player1Id: string,
  player2Id: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Get both players
    const players = await getBoxLeaguePlayers(leagueId);
    const player1 = players.find(p => p.id === player1Id);
    const player2 = players.find(p => p.id === player2Id);

    if (!player1 || !player2) {
      return { success: false, message: 'One or both players not found' };
    }

    const batch = writeBatch(db);
    const now = Date.now();

    // Swap box assignments
    const player1Ref = doc(db, LEAGUES_COLLECTION, leagueId, PLAYERS_SUBCOLLECTION, player1Id);
    const player2Ref = doc(db, LEAGUES_COLLECTION, leagueId, PLAYERS_SUBCOLLECTION, player2Id);

    batch.update(player1Ref, {
      currentBoxNumber: player2.currentBoxNumber,
      positionInBox: player2.positionInBox,
      ladderPosition: player2.ladderPosition,
      updatedAt: now,
    });

    batch.update(player2Ref, {
      currentBoxNumber: player1.currentBoxNumber,
      positionInBox: player1.positionInBox,
      ladderPosition: player1.ladderPosition,
      updatedAt: now,
    });

    await batch.commit();

    return {
      success: true,
      message: `Swapped ${player1.displayName} and ${player2.displayName}`,
    };
  } catch (error: any) {
    console.error('Failed to swap players:', error);
    return { success: false, message: error.message || 'Failed to swap players' };
  }
}

/**
 * Seed players by DUPR rating or manual order
 */
export async function seedBoxLeaguePlayers(
  leagueId: string,
  players: BoxLeaguePlayer[],
  seedingMethod: 'dupr' | 'manual',
  boxSize: 4 | 5 | 6
): Promise<BoxAssignment[]> {
  // Sort players by seeding method
  let sortedPlayers: BoxLeaguePlayer[];
  
  if (seedingMethod === 'dupr') {
    // Sort by DUPR doubles rating (highest first)
    sortedPlayers = [...players].sort((a, b) => {
      const ratingA = a.duprDoublesRating || a.duprSinglesRating || 0;
      const ratingB = b.duprDoublesRating || b.duprSinglesRating || 0;
      return ratingB - ratingA;
    });
  } else {
    // Sort by manual seed
    sortedPlayers = [...players].sort((a, b) => 
      (a.manualSeed || 999) - (b.manualSeed || 999)
    );
  }
  
  // Assign ladder positions and boxes
  const boxAssignments: BoxAssignment[] = [];
  const batch = writeBatch(db);
  
  let boxNumber = 1;
  let positionInBox = 1;
  let currentBoxPlayerIds: string[] = [];
  let currentBoxPlayerNames: string[] = [];
  
  for (let i = 0; i < sortedPlayers.length; i++) {
    const player = sortedPlayers[i];
    const ladderPosition = i + 1;
    
    currentBoxPlayerIds.push(player.id);
    currentBoxPlayerNames.push(player.displayName);
    
    // Update player
    const playerRef = doc(db, LEAGUES_COLLECTION, leagueId, PLAYERS_SUBCOLLECTION, player.id);
    batch.update(playerRef, {
      ladderPosition,
      currentBoxNumber: boxNumber,
      positionInBox,
      updatedAt: Date.now(),
    });
    
    positionInBox++;
    
    // Check if box is full
    if (currentBoxPlayerIds.length === boxSize || i === sortedPlayers.length - 1) {
      boxAssignments.push({
        boxNumber,
        playerIds: [...currentBoxPlayerIds],
        playerNames: [...currentBoxPlayerNames],
      });
      
      boxNumber++;
      positionInBox = 1;
      currentBoxPlayerIds = [];
      currentBoxPlayerNames = [];
    }
  }
  
  await batch.commit();
  return boxAssignments;
}

// ============================================
// MATCH GENERATION
// ============================================

/**
 * Generate matches for a single box for one week
 */
function generateBoxMatches(
  leagueId: string,
  weekNumber: number,
  boxNumber: number,
  boxPlayers: BoxLeaguePlayer[],
  boxSize: 4 | 5 | 6,
  scheduledDate?: number
): BoxLeagueMatch[] {
  const pattern = getBoxPattern(boxSize);
  const matches: BoxLeagueMatch[] = [];
  const now = Date.now();
  
  // Handle undersized boxes
  if (boxPlayers.length < 4) {
    console.warn(`Box ${boxNumber} has only ${boxPlayers.length} players - skipping`);
    return [];
  }
  
  // Use pattern to generate matches
  for (let i = 0; i < pattern.matches.length; i++) {
    const matchPattern = pattern.matches[i];
    
    // Get players for this match
    const t1p1 = boxPlayers[matchPattern.team1[0]];
    const t1p2 = boxPlayers[matchPattern.team1[1]];
    const t2p1 = boxPlayers[matchPattern.team2[0]];
    const t2p2 = boxPlayers[matchPattern.team2[1]];
    
    // Skip if any player is missing (for undersized boxes)
    if (!t1p1 || !t1p2 || !t2p1 || !t2p2) {
      continue;
    }
    
    const match: BoxLeagueMatch = {
      id: `${leagueId}_w${weekNumber}_b${boxNumber}_m${i + 1}`,
      leagueId,
      weekNumber,
      boxNumber,
      matchNumberInBox: i + 1,
      
      team1Player1Id: t1p1.id,
      team1Player1Name: t1p1.displayName,
      team1Player2Id: t1p2.id,
      team1Player2Name: t1p2.displayName,
      
      team2Player1Id: t2p1.id,
      team2Player1Name: t2p1.displayName,
      team2Player2Id: t2p2.id,
      team2Player2Name: t2p2.displayName,
      
      status: 'scheduled',
      team1Score: null,
      team2Score: null,
      winningTeam: null,
      
      scheduledDate: scheduledDate || null,
      
      createdAt: now,
      updatedAt: now,
    };
    
    matches.push(match);
  }
  
  return matches;
}

/**
 * Generate all matches for a week
 */
export async function generateWeekMatches(
  leagueId: string,
  weekNumber: number,
  boxAssignments: BoxAssignment[],
  players: BoxLeaguePlayer[],
  boxSize: 4 | 5 | 6,
  scheduledDate?: number
): Promise<BoxLeagueMatch[]> {
  const allMatches: BoxLeagueMatch[] = [];
  
  // Create player lookup
  const playerMap = new Map<string, BoxLeaguePlayer>();
  for (const player of players) {
    playerMap.set(player.id, player);
  }
  
  // Generate matches for each box
  for (const box of boxAssignments) {
    const boxPlayers = box.playerIds
      .map(id => playerMap.get(id))
      .filter((p): p is BoxLeaguePlayer => p !== undefined);
    
    const boxMatches = generateBoxMatches(
      leagueId,
      weekNumber,
      box.boxNumber,
      boxPlayers,
      boxSize,
      scheduledDate
    );
    
    allMatches.push(...boxMatches);
  }
  
  // Batch write all matches
  const batch = writeBatch(db);
  
  for (const match of allMatches) {
    const matchRef = doc(db, LEAGUES_COLLECTION, leagueId, MATCHES_SUBCOLLECTION, match.id);
    batch.set(matchRef, match);
  }
  
  await batch.commit();
  
  return allMatches;
}

/**
 * Generate complete box league schedule
 */
export async function generateBoxLeagueSchedule(
  input: GenerateBoxLeagueInput
): Promise<GenerateBoxLeagueResult> {
  try {
    const { leagueId, players, settings, startDate } = input;
    
    if (players.length < 4) {
      return { 
        success: false, 
        weeksCreated: 0, 
        matchesCreated: 0, 
        boxAssignments: [],
        error: 'Need at least 4 players to create a box league' 
      };
    }
    
    // Seed players and get initial box assignments
    const boxAssignments = await seedBoxLeaguePlayers(
      leagueId,
      players,
      settings.initialSeeding,
      settings.boxSize
    );
    
    let totalMatchesCreated = 0;
    
    
    // Generate first week
    const weekMatches = await generateWeekMatches(
      leagueId,
      1,
      boxAssignments,
      players,
      settings.boxSize,
      startDate
    );
    
    totalMatchesCreated += weekMatches.length;
    
    // Create week 1 document
    await createBoxLeagueWeek(leagueId, {
      weekNumber: 1,
      status: 'upcoming',
      weekStartDate: startDate,
      boxAssignments,
      matchIds: weekMatches.map(m => m.id),
      totalMatches: weekMatches.length,
      completedMatches: 0,
    });
    
    return {
      success: true,
      weeksCreated: 1,
      matchesCreated: totalMatchesCreated,
      boxAssignments,
    };
  } catch (error: any) {
    console.error('Box league generation failed:', error);
    return {
      success: false,
      weeksCreated: 0,
      matchesCreated: 0,
      boxAssignments: [],
      error: error.message,
    };
  }
}

// ============================================
// WEEK OPERATIONS
// ============================================

/**
 * Create a box league week document
 */
export async function createBoxLeagueWeek(
  leagueId: string,
  weekData: Omit<BoxLeagueWeek, 'id' | 'leagueId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const weekRef = doc(
    collection(db, LEAGUES_COLLECTION, leagueId, WEEKS_SUBCOLLECTION)
  );
  const now = Date.now();
  
  const week: BoxLeagueWeek = {
    ...weekData,
    id: weekRef.id,
    leagueId,
    createdAt: now,
    updatedAt: now,
  };
  
  await setDoc(weekRef, week);
  return weekRef.id;
}

/**
 * Get a specific week
 */
export async function getBoxLeagueWeek(
  leagueId: string,
  weekNumber: number
): Promise<BoxLeagueWeek | null> {
  const q = query(
    collection(db, LEAGUES_COLLECTION, leagueId, WEEKS_SUBCOLLECTION),
    where('weekNumber', '==', weekNumber)
  );
  
  const snap = await getDocs(q);
  if (snap.empty) return null;
  
  return snap.docs[0].data() as BoxLeagueWeek;
}

/**
 * Get all weeks for a league
 */
export async function getBoxLeagueWeeks(leagueId: string): Promise<BoxLeagueWeek[]> {
  const q = query(
    collection(db, LEAGUES_COLLECTION, leagueId, WEEKS_SUBCOLLECTION),
    orderBy('weekNumber', 'asc')
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as BoxLeagueWeek);
}

/**
 * Subscribe to weeks
 */
export function subscribeToBoxLeagueWeeks(
  leagueId: string,
  callback: (weeks: BoxLeagueWeek[]) => void
): Unsubscribe {
  const q = query(
    collection(db, LEAGUES_COLLECTION, leagueId, WEEKS_SUBCOLLECTION),
    orderBy('weekNumber', 'asc')
  );
  
  return onSnapshot(q, (snap) => {
    const weeks = snap.docs.map(d => d.data() as BoxLeagueWeek);
    callback(weeks);
  });
}

// ============================================
// MATCH OPERATIONS
// ============================================

/**
 * Get all matches for a week
 */
export async function getBoxLeagueMatchesForWeek(
  leagueId: string,
  weekNumber: number
): Promise<BoxLeagueMatch[]> {
  const q = query(
    collection(db, LEAGUES_COLLECTION, leagueId, MATCHES_SUBCOLLECTION),
    where('weekNumber', '==', weekNumber),
    orderBy('boxNumber', 'asc'),
    orderBy('matchNumberInBox', 'asc')
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as BoxLeagueMatch);
}

/**
 * Get all matches for a box in a week
 */
export async function getBoxLeagueMatchesForBox(
  leagueId: string,
  weekNumber: number,
  boxNumber: number
): Promise<BoxLeagueMatch[]> {
  const q = query(
    collection(db, LEAGUES_COLLECTION, leagueId, MATCHES_SUBCOLLECTION),
    where('weekNumber', '==', weekNumber),
    where('boxNumber', '==', boxNumber),
    orderBy('matchNumberInBox', 'asc')
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as BoxLeagueMatch);
}

/**
 * Subscribe to matches for a week
 */
export function subscribeToBoxLeagueMatches(
  leagueId: string,
  weekNumber: number,
  callback: (matches: BoxLeagueMatch[]) => void
): Unsubscribe {
  const q = query(
    collection(db, LEAGUES_COLLECTION, leagueId, MATCHES_SUBCOLLECTION),
    where('weekNumber', '==', weekNumber),
    orderBy('boxNumber', 'asc'),
    orderBy('matchNumberInBox', 'asc')
  );
  
  return onSnapshot(q, (snap) => {
    const matches = snap.docs.map(d => d.data() as BoxLeagueMatch);
    callback(matches);
  });
}
// ============================================
// SCORE ENTRY
// ============================================

/**
 * Enter a match score
 * 
 * This function:
 * 1. Updates the match with the score
 * 2. Calculates individual player results
 * 3. Updates each player's weekly and total stats
 */
export async function enterBoxLeagueScore(
  leagueId: string,
  input: BoxLeagueScoreInput
): Promise<BoxLeagueScoreResult> {
  try {
    const { matchId, team1Score, team2Score, enteredByUserId, enteredByName, playedAt } = input;
    
    // Get the match
    const matchRef = doc(db, LEAGUES_COLLECTION, leagueId, MATCHES_SUBCOLLECTION, matchId);
    const matchSnap = await getDoc(matchRef);
    
    if (!matchSnap.exists()) {
      return { success: false, matchId, winningTeam: 1, playerUpdates: [], error: 'Match not found' };
    }
    
    const match = matchSnap.data() as BoxLeagueMatch;
    
    // Determine winner
    const winningTeam: 1 | 2 = team1Score > team2Score ? 1 : 2;
    const now = Date.now();
    
    // Calculate individual results
    const playerUpdates: BoxLeagueScoreResult['playerUpdates'] = [];
    
    // Team 1 players
    playerUpdates.push({
      playerId: match.team1Player1Id,
      won: winningTeam === 1,
      pointsFor: team1Score,
      pointsAgainst: team2Score,
    });
    playerUpdates.push({
      playerId: match.team1Player2Id,
      won: winningTeam === 1,
      pointsFor: team1Score,
      pointsAgainst: team2Score,
    });
    
    // Team 2 players
    playerUpdates.push({
      playerId: match.team2Player1Id,
      won: winningTeam === 2,
      pointsFor: team2Score,
      pointsAgainst: team1Score,
    });
    playerUpdates.push({
      playerId: match.team2Player2Id,
      won: winningTeam === 2,
      pointsFor: team2Score,
      pointsAgainst: team1Score,
    });
    
    // Create player results for match record
    const playerResults = playerUpdates.map(pu => ({
      playerId: pu.playerId,
      playerName: getPlayerNameFromMatch(match, pu.playerId),
      won: pu.won,
      pointsFor: pu.pointsFor,
      pointsAgainst: pu.pointsAgainst,
    }));
    
    // Batch update
    const batch = writeBatch(db);
    
    // Update match
    batch.update(matchRef, {
      team1Score,
      team2Score,
      winningTeam,
      status: 'completed',
      playerResults,
      enteredByUserId,
      enteredByName,
      enteredAt: now,
      playedAt: playedAt || now,
      updatedAt: now,
    });
    
    // Update each player's stats
    for (const pu of playerUpdates) {
      const playerRef = doc(db, LEAGUES_COLLECTION, leagueId, PLAYERS_SUBCOLLECTION, pu.playerId);
      const playerSnap = await getDoc(playerRef);
      
      if (playerSnap.exists()) {
        const player = playerSnap.data() as BoxLeaguePlayer;
        
        // Update week stats
        const newWeekStats = {
          matchesPlayed: (player.weekStats?.matchesPlayed || 0) + 1,
          matchesWon: (player.weekStats?.matchesWon || 0) + (pu.won ? 1 : 0),
          matchesLost: (player.weekStats?.matchesLost || 0) + (pu.won ? 0 : 1),
          pointsFor: (player.weekStats?.pointsFor || 0) + pu.pointsFor,
          pointsAgainst: (player.weekStats?.pointsAgainst || 0) + pu.pointsAgainst,
          pointsDiff: 0,
          hadBye: player.weekStats?.hadBye || false,
        };
        newWeekStats.pointsDiff = newWeekStats.pointsFor - newWeekStats.pointsAgainst;
        
        // Update total stats
        const newTotalStats = {
          matchesPlayed: (player.totalStats?.matchesPlayed || 0) + 1,
          matchesWon: (player.totalStats?.matchesWon || 0) + (pu.won ? 1 : 0),
          matchesLost: (player.totalStats?.matchesLost || 0) + (pu.won ? 0 : 1),
          pointsFor: (player.totalStats?.pointsFor || 0) + pu.pointsFor,
          pointsAgainst: (player.totalStats?.pointsAgainst || 0) + pu.pointsAgainst,
          pointsDiff: 0,
          byeCount: player.totalStats?.byeCount || 0,
          weeksPlayed: player.totalStats?.weeksPlayed || 0,
          promotionCount: player.totalStats?.promotionCount || 0,
          relegationCount: player.totalStats?.relegationCount || 0,
        };
        newTotalStats.pointsDiff = newTotalStats.pointsFor - newTotalStats.pointsAgainst;
        
        batch.update(playerRef, {
          weekStats: newWeekStats,
          totalStats: newTotalStats,
          lastActiveAt: now,
          updatedAt: now,
        });
      }
    }
    
    // Update week completed matches count
    const week = await getBoxLeagueWeek(leagueId, match.weekNumber);
    if (week) {
      const weekRef = doc(db, LEAGUES_COLLECTION, leagueId, WEEKS_SUBCOLLECTION, week.id);
      batch.update(weekRef, {
        completedMatches: (week.completedMatches || 0) + 1,
        status: 'in_progress',
        updatedAt: now,
      });
    }
    
    await batch.commit();
    
    return {
      success: true,
      matchId,
      winningTeam,
      playerUpdates,
    };
  } catch (error: any) {
    console.error('Score entry failed:', error);
    return {
      success: false,
      matchId: input.matchId,
      winningTeam: 1,
      playerUpdates: [],
      error: error.message,
    };
  }
}

/**
 * Helper to get player name from match
 */
function getPlayerNameFromMatch(match: BoxLeagueMatch, playerId: string): string {
  if (match.team1Player1Id === playerId) return match.team1Player1Name;
  if (match.team1Player2Id === playerId) return match.team1Player2Name;
  if (match.team2Player1Id === playerId) return match.team2Player1Name;
  if (match.team2Player2Id === playerId) return match.team2Player2Name;
  return 'Unknown';
}

// ============================================
// STANDINGS CALCULATION
// ============================================

/**
 * Calculate standings for a box
 */
export function calculateBoxStandings(
  boxNumber: number,
  players: BoxLeaguePlayer[],
  matches: BoxLeagueMatch[],
  tiebreakers: BoxLeagueTiebreaker[] = DEFAULT_BOX_TIEBREAKERS,
  promotionCount: number = 1,
  relegationCount: number = 1,
  isTopBox: boolean = false,
  isBottomBox: boolean = false
): BoxStanding[] {
  // Get players in this box
  const boxPlayers = players.filter(p => p.currentBoxNumber === boxNumber);
  
  // Create standings with week stats
  const standings: BoxStanding[] = boxPlayers.map(player => ({
    playerId: player.id,
    playerName: player.displayName,
    boxNumber,
    positionInBox: 0,  // Will be calculated
    matchesPlayed: player.weekStats?.matchesPlayed || 0,
    matchesWon: player.weekStats?.matchesWon || 0,
    matchesLost: player.weekStats?.matchesLost || 0,
    pointsFor: player.weekStats?.pointsFor || 0,
    pointsAgainst: player.weekStats?.pointsAgainst || 0,
    pointsDiff: player.weekStats?.pointsDiff || 0,
    hadBye: player.weekStats?.hadBye || false,
    willPromote: false,
    willRelegate: false,
    willStay: false,
  }));
  
  // Sort by tiebreakers
  standings.sort((a, b) => {
    for (const tiebreaker of tiebreakers) {
      let diff = 0;
      
      switch (tiebreaker) {
        case 'wins':
          diff = b.matchesWon - a.matchesWon;
          break;
        case 'head_to_head':
          diff = calculateHeadToHead(a.playerId, b.playerId, matches);
          break;
        case 'points_diff':
          diff = b.pointsDiff - a.pointsDiff;
          break;
        case 'points_for':
          diff = b.pointsFor - a.pointsFor;
          break;
        case 'points_against':
          diff = a.pointsAgainst - b.pointsAgainst;  // Lower is better
          break;
      }
      
      if (diff !== 0) return diff;
    }
    return 0;
  });
  
  // Assign positions and movement indicators
  for (let i = 0; i < standings.length; i++) {
    standings[i].positionInBox = i + 1;
    
    // Determine movement
    if (!isTopBox && i < promotionCount) {
      standings[i].willPromote = true;
    } else if (!isBottomBox && i >= standings.length - relegationCount) {
      standings[i].willRelegate = true;
    } else {
      standings[i].willStay = true;
    }
  }
  
  return standings;
}

/**
 * Calculate head-to-head result between two players
 * Returns positive if player A beat player B, negative if B beat A, 0 if tied/no match
 */
function calculateHeadToHead(
  playerAId: string,
  playerBId: string,
  matches: BoxLeagueMatch[]
): number {
  let aWins = 0;
  let bWins = 0;
  
  for (const match of matches) {
    if (match.status !== 'completed' || !match.playerResults) continue;
    
    // Check if both players were in this match
    const aResult = match.playerResults.find(r => r.playerId === playerAId);
    const bResult = match.playerResults.find(r => r.playerId === playerBId);
    
    if (aResult && bResult) {
      // They were opponents (on different teams)
      if (aResult.won && !bResult.won) aWins++;
      if (bResult.won && !aResult.won) bWins++;
    }
  }
  
  return bWins - aWins;  // Positive means A is better
}

// ============================================
// WEEK PROCESSING (PROMOTION/RELEGATION)
// ============================================

/**
 * Process end of week - calculate standings and perform promotions/relegations
 */
export async function processBoxLeagueWeek(
  leagueId: string,
  weekNumber: number,
  settings: BoxLeagueSettings,
  processedByUserId: string
): Promise<ProcessWeekResult> {
  try {
    // Get current data
    const players = await getBoxLeaguePlayers(leagueId);
    const matches = await getBoxLeagueMatchesForWeek(leagueId, weekNumber);
    const week = await getBoxLeagueWeek(leagueId, weekNumber);
    
    if (!week) {
      return { success: false, weekNumber, standings: [], movements: [], nextWeekCreated: false, error: 'Week not found' };
    }
    
    // Check all matches are complete
    const incompleteMatches = matches.filter(m => m.status !== 'completed');
    if (incompleteMatches.length > 0) {
      return { 
        success: false, 
        weekNumber, 
        standings: [], 
        movements: [], 
        nextWeekCreated: false,
        error: `${incompleteMatches.length} matches still incomplete` 
      };
    }
    
    // Get unique box numbers
    const boxNumbers = [...new Set(players.map(p => p.currentBoxNumber))].sort((a, b) => a - b);
    const topBox = Math.min(...boxNumbers);
    const bottomBox = Math.max(...boxNumbers);
    
    // Calculate standings for each box
    const allStandings: BoxStanding[] = [];
    const movements: PlayerMovement[] = [];
    
    for (const boxNum of boxNumbers) {
      const boxStandings = calculateBoxStandings(
        boxNum,
        players,
        matches,
        settings.tiebreakers,
        settings.promotionCount,
        settings.relegationCount,
        boxNum === topBox,
        boxNum === bottomBox
      );
      
      allStandings.push(...boxStandings);
    }
    
    // Process promotions and relegations
    const batch = writeBatch(db);
    const now = Date.now();
    
    // Collect players moving up and down
    const promoting: { playerId: string; playerName: string; fromBox: number; position: number }[] = [];
    const relegating: { playerId: string; playerName: string; fromBox: number; position: number }[] = [];
    
    for (const standing of allStandings) {
      if (standing.willPromote) {
        promoting.push({
          playerId: standing.playerId,
          playerName: standing.playerName,
          fromBox: standing.boxNumber,
          position: standing.positionInBox,
        });
      }
      if (standing.willRelegate) {
        relegating.push({
          playerId: standing.playerId,
          playerName: standing.playerName,
          fromBox: standing.boxNumber,
          position: standing.positionInBox,
        });
      }
    }
    
    // Calculate new positions
    // Promoted players go to bottom of the box above
    // Relegated players go to top of the box below
    
    for (const p of promoting) {
      const newBox = p.fromBox - 1;
            
      movements.push({
        playerId: p.playerId,
        playerName: p.playerName,
        fromBox: p.fromBox,
        toBox: newBox,
        fromPosition: p.position,
        newPosition: 0,  // Will be recalculated
        reason: 'promotion',
      });
      
      const playerRef = doc(db, LEAGUES_COLLECTION, leagueId, PLAYERS_SUBCOLLECTION, p.playerId);
      batch.update(playerRef, {
        currentBoxNumber: newBox,
        'totalStats.promotionCount': (players.find(pl => pl.id === p.playerId)?.totalStats?.promotionCount || 0) + 1,
        updatedAt: now,
      });
    }
    
    for (const r of relegating) {
      const newBox = r.fromBox + 1;
      
      movements.push({
        playerId: r.playerId,
        playerName: r.playerName,
        fromBox: r.fromBox,
        toBox: newBox,
        fromPosition: r.position,
        newPosition: 0,  // Will be recalculated
        reason: 'relegation',
      });
      
      const playerRef = doc(db, LEAGUES_COLLECTION, leagueId, PLAYERS_SUBCOLLECTION, r.playerId);
      batch.update(playerRef, {
        currentBoxNumber: newBox,
        'totalStats.relegationCount': (players.find(pl => pl.id === r.playerId)?.totalStats?.relegationCount || 0) + 1,
        updatedAt: now,
      });
    }
    
    // Add stayed movements
    for (const standing of allStandings) {
      if (standing.willStay) {
        movements.push({
          playerId: standing.playerId,
          playerName: standing.playerName,
          fromBox: standing.boxNumber,
          toBox: standing.boxNumber,
          fromPosition: standing.positionInBox,
          newPosition: standing.positionInBox,
          reason: 'stayed',
        });
      }
    }
    
    // Reset week stats for all players (prepare for next week)
    for (const player of players) {
      const playerRef = doc(db, LEAGUES_COLLECTION, leagueId, PLAYERS_SUBCOLLECTION, player.id);
      batch.update(playerRef, {
        weekStats: {
          matchesPlayed: 0,
          matchesWon: 0,
          matchesLost: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          pointsDiff: 0,
          hadBye: false,
        },
        'totalStats.weeksPlayed': (player.totalStats?.weeksPlayed || 0) + 1,
        updatedAt: now,
      });
    }
    
    // Update week document with standings and movements
    const weekRef = doc(db, LEAGUES_COLLECTION, leagueId, WEEKS_SUBCOLLECTION, week.id);
    batch.update(weekRef, {
      status: 'completed',
      standings: allStandings,
      movements,
      processedAt: now,
      processedByUserId,
      updatedAt: now,
    });
    
    await batch.commit();
    
    // Recalculate ladder positions after moves
    await recalculateLadderPositions(leagueId, settings.boxSize);
    
    // Create next week
    const nextWeekNumber = weekNumber + 1;
    const updatedPlayers = await getBoxLeaguePlayers(leagueId);
    const newBoxAssignments = getBoxAssignmentsFromPlayers(updatedPlayers, settings.boxSize);
    
    const nextWeekMatches = await generateWeekMatches(
      leagueId,
      nextWeekNumber,
      newBoxAssignments,
      updatedPlayers,
      settings.boxSize,
      week.weekStartDate ? week.weekStartDate + (7 * 24 * 60 * 60 * 1000) : undefined
    );
    
    await createBoxLeagueWeek(leagueId, {
      weekNumber: nextWeekNumber,
      status: 'upcoming',
      weekStartDate: week.weekStartDate ? week.weekStartDate + (7 * 24 * 60 * 60 * 1000) : Date.now(),
      boxAssignments: newBoxAssignments,
      matchIds: nextWeekMatches.map(m => m.id),
      totalMatches: nextWeekMatches.length,
      completedMatches: 0,
    });
    
    return {
      success: true,
      weekNumber,
      standings: allStandings,
      movements,
      nextWeekCreated: true,
    };
  } catch (error: any) {
    console.error('Week processing failed:', error);
    return {
      success: false,
      weekNumber,
      standings: [],
      movements: [],
      nextWeekCreated: false,
      error: error.message,
    };
  }
}

/**
 * Recalculate ladder positions after promotions/relegations
 */
async function recalculateLadderPositions(
  leagueId: string,
  _boxSize: 4 | 5 | 6
): Promise<void> {
  const players = await getBoxLeaguePlayers(leagueId);
  
  // Sort by box, then by position in box
  players.sort((a, b) => {
    if (a.currentBoxNumber !== b.currentBoxNumber) {
      return a.currentBoxNumber - b.currentBoxNumber;
    }
    return a.positionInBox - b.positionInBox;
  });
  
  const batch = writeBatch(db);
  
  for (let i = 0; i < players.length; i++) {
    const player = players[i];
    const newLadderPosition = i + 1;
    const newPositionInBox = (i % _boxSize) + 1;
    
    const playerRef = doc(db, LEAGUES_COLLECTION, leagueId, PLAYERS_SUBCOLLECTION, player.id);
    batch.update(playerRef, {
      ladderPosition: newLadderPosition,
      positionInBox: newPositionInBox,
      updatedAt: Date.now(),
    });
  }
  
  await batch.commit();
}

/**
 * Get box assignments from current player positions
 */
function getBoxAssignmentsFromPlayers(
  players: BoxLeaguePlayer[],
  _boxSize: 4 | 5 | 6
): BoxAssignment[] {
  const boxMap = new Map<number, { ids: string[]; names: string[] }>();
  
  for (const player of players) {
    const box = player.currentBoxNumber;
    if (!boxMap.has(box)) {
      boxMap.set(box, { ids: [], names: [] });
    }
    boxMap.get(box)!.ids.push(player.id);
    boxMap.get(box)!.names.push(player.displayName);
  }
  
  const assignments: BoxAssignment[] = [];
  const sortedBoxes = [...boxMap.keys()].sort((a, b) => a - b);
  
  for (const boxNum of sortedBoxes) {
    const boxData = boxMap.get(boxNum)!;
    assignments.push({
      boxNumber: boxNum,
      playerIds: boxData.ids,
      playerNames: boxData.names,
    });
  }
  
  return assignments;
}

// ============================================
// EXPORTS FOR INDEX
// ============================================

export {
  // Types re-exported for convenience
  type BoxLeagueSettings,
  type BoxLeaguePlayer,
  type BoxLeagueMatch,
  type BoxLeagueWeek,
  type BoxAssignment,
  type BoxStanding,
  type PlayerMovement,
  type BoxLeagueScoreInput,
  type BoxLeagueScoreResult,
  type ProcessWeekResult,
  type GenerateBoxLeagueInput,
  type GenerateBoxLeagueResult,
};