/**
 * League Match Generation Service
 * 
 * Generates match schedules for different league formats:
 * - Round Robin: Everyone plays everyone
 * - Swiss: Paired by similar records
 * - Box League: Small groups with promotion/relegation
 * 
 * NOTE: Ladder format doesn't use pre-generated matches (uses challenges instead)
 * 
 * FILE LOCATION: services/firebase/leagueMatchGeneration.ts
 * VERSION: V05.32
 */

import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
} from '@firebase/firestore';
import { db } from './config';
import type {
  League,
  LeagueMember,
  LeagueMatch,
} from '../../types';

// ============================================
// TYPES
// ============================================

export interface GenerationResult {
  success: boolean;
  matchesCreated: number;
  error?: string;
  matches?: LeagueMatch[];
}

export interface MatchPairing {
  memberAId: string;
  memberAName: string;
  userAId: string;
  partnerAId?: string | null;
  memberBId: string;
  memberBName: string;
  userBId: string;
  partnerBId?: string | null;
}

// ============================================
// ROUND ROBIN GENERATION
// ============================================

/**
 * Generate Round Robin schedule
 * 
 * Uses the "circle method" algorithm:
 * - Fix one player, rotate all others
 * - Ensures everyone plays everyone exactly once per round
 * - Handles odd number of players with "bye"
 */
export const generateRoundRobinSchedule = async (
  league: League,
  members: LeagueMember[],
  divisionId?: string | null
): Promise<GenerationResult> => {
  try {
    if (members.length < 2) {
      return { success: false, matchesCreated: 0, error: 'Need at least 2 members to generate schedule' };
    }

    const settings = league.settings?.roundRobinSettings || { rounds: 1, scheduleGeneration: 'auto' };
    const rounds = settings.rounds || 1;
    
    // Filter members by division if specified
    const divisionMembers = divisionId 
      ? members.filter(m => m.divisionId === divisionId)
      : members;

    if (divisionMembers.length < 2) {
      return { success: false, matchesCreated: 0, error: 'Need at least 2 members in this division' };
    }

    // Generate all pairings using circle method
    const allMatches: LeagueMatch[] = [];
    const pairings = generateRoundRobinPairings(divisionMembers);
    
    // Create matches for each round
    for (let roundNum = 1; roundNum <= rounds; roundNum++) {
      let weekNumber = 0;
      
      for (const weekPairings of pairings) {
        weekNumber++;
        const actualWeek = (roundNum - 1) * pairings.length + weekNumber;
        
        for (const pairing of weekPairings) {
          const match = createMatchFromPairing(
            league.id,
            divisionId || null,
            pairing,
            'regular',
            actualWeek,
            roundNum
          );
          allMatches.push(match);
        }
      }
    }

    // Batch write all matches
    await batchCreateLeagueMatches(league.id, allMatches);

    return {
      success: true,
      matchesCreated: allMatches.length,
      matches: allMatches,
    };
  } catch (error: any) {
    console.error('Round Robin generation failed:', error);
    return { success: false, matchesCreated: 0, error: error.message };
  }
};

/**
 * Circle method for Round Robin pairings
 * Returns array of weeks, each containing array of pairings
 */
function generateRoundRobinPairings(members: LeagueMember[]): MatchPairing[][] {
  const n = members.length;
  const weeks: MatchPairing[][] = [];
  
  // If odd number, add a "bye" placeholder
  const participants = [...members];
  const hasBye = n % 2 === 1;
  if (hasBye) {
    participants.push({
      id: 'BYE',
      displayName: 'BYE',
      userId: 'BYE',
    } as LeagueMember);
  }
  
  const numParticipants = participants.length;
  const numWeeks = numParticipants - 1;
  
  // Circle method: fix first participant, rotate others
  for (let week = 0; week < numWeeks; week++) {
    const weekPairings: MatchPairing[] = [];
    
    for (let i = 0; i < numParticipants / 2; i++) {
      const home = i === 0 ? 0 : (week + i) % (numParticipants - 1) + 1;
      const away = (week + numParticipants - 1 - i) % (numParticipants - 1) + 1;
      
      // Adjust indices for the fixed position
      const homeIdx = home === 0 ? 0 : home;
      const awayIdx = away === 0 ? 0 : away;
      
      const memberA = participants[homeIdx];
      const memberB = participants[awayIdx];
      
      // Skip bye matches
      if (memberA.id === 'BYE' || memberB.id === 'BYE') continue;
      
      weekPairings.push({
        memberAId: memberA.id,
        memberAName: memberA.teamName || memberA.displayName,
        userAId: memberA.userId,
        partnerAId: memberA.partnerUserId || null,
        memberBId: memberB.id,
        memberBName: memberB.teamName || memberB.displayName,
        userBId: memberB.userId,
        partnerBId: memberB.partnerUserId || null,
      });
    }
    
    weeks.push(weekPairings);
  }
  
  return weeks;
}

// ============================================
// SWISS SYSTEM GENERATION
// ============================================

/**
 * Generate Swiss pairing for a single round
 * 
 * Swiss system pairs players with similar records:
 * - Round 1: Random or seeded pairing
 * - Subsequent rounds: Pair by points, avoiding rematches
 */
export const generateSwissRound = async (
  league: League,
  members: LeagueMember[],
  roundNumber: number,
  existingMatches: LeagueMatch[],
  divisionId?: string | null
): Promise<GenerationResult> => {
  try {
    if (members.length < 2) {
      return { success: false, matchesCreated: 0, error: 'Need at least 2 members' };
    }

    // Filter by division
    const divisionMembers = divisionId 
      ? members.filter(m => m.divisionId === divisionId)
      : members;

    if (divisionMembers.length < 2) {
      return { success: false, matchesCreated: 0, error: 'Need at least 2 members in division' };
    }

    // Get played pairings to avoid rematches
    const playedPairings = new Set<string>();
    existingMatches.forEach(m => {
      playedPairings.add(`${m.memberAId}-${m.memberBId}`);
      playedPairings.add(`${m.memberBId}-${m.memberAId}`);
    });

    // Sort members by points (descending), then by game difference
    const sortedMembers = [...divisionMembers].sort((a, b) => {
      const pointsDiff = (b.stats?.points || 0) - (a.stats?.points || 0);
      if (pointsDiff !== 0) return pointsDiff;
      
      const aDiff = (a.stats?.gamesWon || 0) - (a.stats?.gamesLost || 0);
      const bDiff = (b.stats?.gamesWon || 0) - (b.stats?.gamesLost || 0);
      return bDiff - aDiff;
    });

    // Generate pairings using slide pairing method
    const pairings = generateSwissPairings(sortedMembers, playedPairings);
    
    if (pairings.length === 0) {
      return { success: false, matchesCreated: 0, error: 'Could not generate valid pairings (all combinations played)' };
    }

    // Create matches
    const matches: LeagueMatch[] = pairings.map(pairing => 
      createMatchFromPairing(
        league.id,
        divisionId || null,
        pairing,
        'regular',
        roundNumber,
        roundNumber
      )
    );

    // Batch write
    await batchCreateLeagueMatches(league.id, matches);

    return {
      success: true,
      matchesCreated: matches.length,
      matches,
    };
  } catch (error: any) {
    console.error('Swiss round generation failed:', error);
    return { success: false, matchesCreated: 0, error: error.message };
  }
};

/**
 * Swiss pairing using slide method
 * Pairs #1 vs #2, #3 vs #4, etc. with rematch avoidance
 */
function generateSwissPairings(
  sortedMembers: LeagueMember[],
  playedPairings: Set<string>
): MatchPairing[] {
  const pairings: MatchPairing[] = [];
  const paired = new Set<string>();
  
  // Try to pair adjacent players, avoiding rematches
  for (let i = 0; i < sortedMembers.length; i++) {
    const memberA = sortedMembers[i];
    if (paired.has(memberA.id)) continue;
    
    // Find best opponent (closest in standings, not already played)
    for (let j = i + 1; j < sortedMembers.length; j++) {
      const memberB = sortedMembers[j];
      if (paired.has(memberB.id)) continue;
      
      const pairingKey = `${memberA.id}-${memberB.id}`;
      if (!playedPairings.has(pairingKey)) {
        pairings.push({
          memberAId: memberA.id,
          memberAName: memberA.teamName || memberA.displayName,
          userAId: memberA.userId,
          partnerAId: memberA.partnerUserId || null,
          memberBId: memberB.id,
          memberBName: memberB.teamName || memberB.displayName,
          userBId: memberB.userId,
          partnerBId: memberB.partnerUserId || null,
        });
        paired.add(memberA.id);
        paired.add(memberB.id);
        break;
      }
    }
  }
  
  // Handle bye if odd number
  const unpaired = sortedMembers.filter(m => !paired.has(m.id));
  if (unpaired.length === 1) {
    // This player gets a bye (could track this separately)
    console.log(`Player ${unpaired[0].displayName} has a bye this round`);
  }
  
  return pairings;
}

// ============================================
// BOX LEAGUE GENERATION
// ============================================

/**
 * Generate Box League schedule
 * 
 * Box league divides players into small groups (boxes):
 * - Each box plays round robin within their box
 * - Top players promote, bottom players relegate
 * - Creates balanced competition at all levels
 */
export const generateBoxLeagueSchedule = async (
  league: League,
  members: LeagueMember[],
  divisionId?: string | null
): Promise<GenerationResult> => {
  try {
    const settings = league.settings?.boxSettings || {
      playersPerBox: 4,
      promotionSpots: 1,
      relegationSpots: 1,
      roundsPerBox: 1,
    };

    // Filter by division
    const divisionMembers = divisionId 
      ? members.filter(m => m.divisionId === divisionId)
      : members;

    if (divisionMembers.length < 2) {
      return { success: false, matchesCreated: 0, error: 'Need at least 2 members' };
    }

    // Sort by current rank
    const sortedMembers = [...divisionMembers].sort((a, b) => 
      (a.currentRank || 999) - (b.currentRank || 999)
    );

    // Divide into boxes
    const boxes: LeagueMember[][] = [];
    for (let i = 0; i < sortedMembers.length; i += settings.playersPerBox) {
      boxes.push(sortedMembers.slice(i, i + settings.playersPerBox));
    }

    // Generate round robin within each box
    const allMatches: LeagueMatch[] = [];
    
    for (let boxNum = 0; boxNum < boxes.length; boxNum++) {
      const box = boxes[boxNum];
      if (box.length < 2) continue;
      
      // Assign box number to members (for tracking)
      for (const member of box) {
        member.currentBox = boxNum + 1;
      }
      
      // Generate pairings within box
      const boxPairings = generateRoundRobinPairings(box);
      
      let weekNumber = 0;
      for (let round = 1; round <= settings.roundsPerBox; round++) {
        for (const weekPairings of boxPairings) {
          weekNumber++;
          
          for (const pairing of weekPairings) {
            const match = createMatchFromPairing(
              league.id,
              divisionId || null,
              pairing,
              'box',
              weekNumber,
              round,
              boxNum + 1
            );
            allMatches.push(match);
          }
        }
      }
    }

    // Batch write
    await batchCreateLeagueMatches(league.id, allMatches);

    return {
      success: true,
      matchesCreated: allMatches.length,
      matches: allMatches,
    };
  } catch (error: any) {
    console.error('Box League generation failed:', error);
    return { success: false, matchesCreated: 0, error: error.message };
  }
};

/**
 * Process box league promotions/relegations after a period
 * Call this after all matches in a box period are complete
 */
export const processBoxLeaguePromotions = async (
  league: League,
  members: LeagueMember[],
  divisionId?: string | null
): Promise<{ promoted: string[]; relegated: string[] }> => {
  const settings = league.settings?.boxSettings || {
    playersPerBox: 4,
    promotionSpots: 1,
    relegationSpots: 1,
    roundsPerBox: 1,
  };

  // Filter and sort by box, then by points within box
  const divisionMembers = divisionId 
    ? members.filter(m => m.divisionId === divisionId)
    : members;

  // Group by box
  const boxGroups = new Map<number, LeagueMember[]>();
  for (const member of divisionMembers) {
    const box = member.currentBox || 1;
    if (!boxGroups.has(box)) boxGroups.set(box, []);
    boxGroups.get(box)!.push(member);
  }

  const promoted: string[] = [];
  const relegated: string[] = [];

  // Sort each box by points and determine promotions/relegations
  const sortedBoxes = Array.from(boxGroups.keys()).sort((a, b) => a - b);
  
  for (let i = 0; i < sortedBoxes.length; i++) {
    const boxNum = sortedBoxes[i];
    const boxMembers = boxGroups.get(boxNum)!;
    
    // Sort by points descending
    boxMembers.sort((a, b) => (b.stats?.points || 0) - (a.stats?.points || 0));
    
    // Top players from this box get promoted (except box 1)
    if (boxNum > 1) {
      for (let j = 0; j < settings.promotionSpots && j < boxMembers.length; j++) {
        promoted.push(boxMembers[j].id);
      }
    }
    
    // Bottom players from this box get relegated (except last box)
    if (i < sortedBoxes.length - 1) {
      for (let j = 0; j < settings.relegationSpots && j < boxMembers.length; j++) {
        relegated.push(boxMembers[boxMembers.length - 1 - j].id);
      }
    }
  }

  return { promoted, relegated };
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Create a LeagueMatch from a pairing
 */
function createMatchFromPairing(
  leagueId: string,
  divisionId: string | null,
  pairing: MatchPairing,
  matchType: 'regular' | 'box' | 'playoff',
  weekNumber: number,
  roundNumber: number,
  boxNumber?: number
): LeagueMatch {
  const matchRef = doc(collection(db, 'leagues', leagueId, 'matches'));
  
  return {
    id: matchRef.id,
    leagueId,
    divisionId,
    memberAId: pairing.memberAId,
    memberBId: pairing.memberBId,
    userAId: pairing.userAId,
    userBId: pairing.userBId,
    partnerAId: pairing.partnerAId,
    partnerBId: pairing.partnerBId,
    memberAName: pairing.memberAName,
    memberBName: pairing.memberBName,
    matchType,
    weekNumber,
    roundNumber,
    boxNumber: boxNumber || null,
    scheduledDate: null,
    deadline: null,
    court: null,
    venue: null,
    status: 'scheduled',
    scores: [],
    winnerMemberId: null,
    memberARankAtMatch: null,
    memberBRankAtMatch: null,
    submittedByUserId: null,
    confirmedByUserId: null,
    disputeReason: null,
    createdAt: Date.now(),
    playedAt: null,
    completedAt: null,
  };
}

/**
 * Batch create league matches
 */
async function batchCreateLeagueMatches(
  leagueId: string,
  matches: LeagueMatch[]
): Promise<void> {
  // Firestore batch limit is 500
  const batchSize = 450;
  
  for (let i = 0; i < matches.length; i += batchSize) {
    const batch = writeBatch(db);
    const batchMatches = matches.slice(i, i + batchSize);
    
    for (const match of batchMatches) {
      const matchRef = doc(db, 'leagues', leagueId, 'matches', match.id);
      batch.set(matchRef, match);
    }
    
    await batch.commit();
  }
}

// ============================================
// MAIN GENERATION FUNCTION
// ============================================

/**
 * Generate schedule based on league format
 * 
 * @param league - The league to generate schedule for
 * @param members - Current league members
 * @param divisionId - Optional division filter
 * @param roundNumber - For Swiss, which round to generate
 * @param existingMatches - For Swiss, already played matches
 */
export const generateLeagueSchedule = async (
  league: League,
  members: LeagueMember[],
  options?: {
    divisionId?: string | null;
    roundNumber?: number;
    existingMatches?: LeagueMatch[];
  }
): Promise<GenerationResult> => {
  const { divisionId, roundNumber, existingMatches } = options || {};

  switch (league.format) {
    case 'round_robin':
      return generateRoundRobinSchedule(league, members, divisionId);
      
    case 'swiss':
      if (roundNumber === undefined) {
        return { success: false, matchesCreated: 0, error: 'Swiss format requires roundNumber' };
      }
      return generateSwissRound(league, members, roundNumber, existingMatches || [], divisionId);
      
    case 'box_league':
      return generateBoxLeagueSchedule(league, members, divisionId);
      
    case 'ladder':
      // Ladder doesn't pre-generate matches - uses challenge system
      return { 
        success: true, 
        matchesCreated: 0, 
        error: 'Ladder format uses challenges instead of pre-generated matches' 
      };
      
    default:
      return { success: false, matchesCreated: 0, error: `Unknown format: ${league.format}` };
  }
};

// ============================================
// CLEAR MATCHES (for regeneration)
// ============================================

/**
 * Clear all matches for a league (or division)
 * Use before regenerating schedule
 */
export const clearLeagueMatches = async (
  leagueId: string,
  options?: {
    divisionId?: string | null;
    statusFilter?: string[]; // Only clear matches with these statuses
  }
): Promise<number> => {
  const { divisionId, statusFilter } = options || {};
  
  let q = query(collection(db, 'leagues', leagueId, 'matches'));
  
  if (divisionId) {
    q = query(q, where('divisionId', '==', divisionId));
  }
  
  const snap = await getDocs(q);
  
  // Filter by status if specified
  let matchesToDelete = snap.docs;
  if (statusFilter && statusFilter.length > 0) {
    matchesToDelete = snap.docs.filter(d => 
      statusFilter.includes(d.data().status)
    );
  }
  
  // Batch delete
  const batchSize = 450;
  let deleted = 0;
  
  for (let i = 0; i < matchesToDelete.length; i += batchSize) {
    const batch = writeBatch(db);
    const batchDocs = matchesToDelete.slice(i, i + batchSize);
    
    for (const docSnap of batchDocs) {
      batch.delete(docSnap.ref);
      deleted++;
    }
    
    await batch.commit();
  }
  
  return deleted;
};

// ============================================
// EXPORTS
// ============================================

export default {
  generateLeagueSchedule,
  generateRoundRobinSchedule,
  generateSwissRound,
  generateBoxLeagueSchedule,
  processBoxLeaguePromotions,
  clearLeagueMatches,
};