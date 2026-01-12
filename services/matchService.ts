import { db } from './firebase';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
} from '@firebase/firestore';
import type { Match, MatchScoreSubmission, GameScore } from '../types';
import { updatePoolResultsOnMatchCompleteSafe } from './firebase/poolResults';

/**
 * Player submits a score for a match.
 * - Creates a MatchScoreSubmission document
 * - Writes the proposed score to the Match
 * - Sets the match status to 'pending_confirmation' (or 'completed' if isOrganizer)
 * - Advances winner to next bracket match if applicable
 *
 * V06.22: Updated to accept matchId instead of Match object, fetch match data,
 * and handle bracket advancement for organizer instant-complete.
 */
export async function submitMatchScore(
  tournamentId: string,
  matchId: string,
  submittedByUserId: string,
  scoresA: number[],
  scoresB: number[],
  isOrganizer: boolean = false
) {
  // Fetch the match to get full data including nextMatchId
  const matchRef = doc(db, 'tournaments', tournamentId, 'matches', matchId);
  const matchSnap = await getDoc(matchRef);
  if (!matchSnap.exists()) {
    throw new Error('Match not found');
  }
  const match = { id: matchSnap.id, ...matchSnap.data() } as Match;

  // V06.42: Determine winner by counting GAMES WON, not first game score
  // This fixes Best of 3/5 matches where game 1 winner may lose overall
  let gamesWonA = 0;
  let gamesWonB = 0;
  for (let i = 0; i < scoresA.length; i++) {
    const scoreA = scoresA[i] ?? 0;
    const scoreB = scoresB[i] ?? 0;

    if (Number.isNaN(scoreA) || Number.isNaN(scoreB)) {
      throw new Error('Please enter valid scores for all games.');
    }

    if (scoreA > scoreB) gamesWonA++;
    else if (scoreB > scoreA) gamesWonB++;
    // Tied games don't count toward either side
  }

  if (gamesWonA === gamesWonB) {
    throw new Error('Cannot determine winner - games are tied. Please enter a decisive result.');
  }

  const teamAId = match.teamAId || match.sideA?.id || '';
  const teamBId = match.teamBId || match.sideB?.id || '';

  const winnerTeamId = gamesWonA > gamesWonB ? teamAId : teamBId;

  if (!winnerTeamId) {
    throw new Error('Unable to determine winner from scores.');
  }

  const now = Date.now();

  // Build modern scores array
  const scores: GameScore[] = scoresA.map((scoreA, i) => ({
    gameNumber: i + 1,
    scoreA: scoreA,
    scoreB: scoresB[i] ?? 0,
  }));

  // If organizer, complete the match immediately without confirmation flow
  if (isOrganizer) {
    await updateDoc(matchRef, {
      status: 'completed',
      completedAt: now,
      endTime: now,
      winnerId: winnerTeamId,
      winnerTeamId,
      scores,
      scoreTeamAGames: scoresA,
      scoreTeamBGames: scoresB,
      lastUpdatedBy: submittedByUserId,
      lastUpdatedAt: now,
      court: null, // free court
    });

    // Advance winner to next bracket match if applicable
    if (match.nextMatchId) {
      await advanceWinnerToNextMatch(tournamentId, match, winnerTeamId, now);
    }

    // V06.22: Advance loser to bronze match if applicable (semi-finals)
    // V06.42: Use gamesWonA/B instead of single score comparison
    if (match.loserNextMatchId) {
      const loserTeamId = gamesWonA > gamesWonB ? teamBId : teamAId;
      await advanceLoserToBronzeMatch(tournamentId, match, loserTeamId, now);
    }

    // V06.35: Update pool results if this is a pool match
    // V07.30: Use safe wrapper - pool results are secondary, match scoring should not fail
    const completedMatch: Match = {
      ...match,
      status: 'completed',
      winnerId: winnerTeamId,
      scores,
      completedAt: now,
      updatedAt: now,
    };
    await updatePoolResultsOnMatchCompleteSafe(tournamentId, match.divisionId || '', completedMatch);

    return;
  }

  // Regular player flow: create submission and set pending status
  const submission: Omit<MatchScoreSubmission, 'id'> = {
    tournamentId,
    matchId: match.id,
    submittedBy: submittedByUserId,
    teamAId,
    teamBId,
    submittedScore: {
      scoreTeamAGames: scoresA,
      scoreTeamBGames: scoresB,
      winnerTeamId,
    },
    status: 'pending_opponent',
    opponentUserId: null,
    respondedAt: null,
    reasonRejected: null,
    createdAt: now,
  };

  const submissionsRef = collection(db, 'tournaments', tournamentId, 'scoreSubmissions');
  await addDoc(submissionsRef, submission);

  // Update the match with the proposed score + pending status
  await updateDoc(matchRef, {
    status: 'pending_confirmation',
    winnerId: winnerTeamId,
    winnerTeamId,
    scores,
    scoreTeamAGames: scoresA,
    scoreTeamBGames: scoresB,
    lastUpdatedBy: submittedByUserId,
    lastUpdatedAt: now,
  });
}

/**
 * Helper to advance winner to next bracket match
 *
 * V06.22: Updated to handle missing nextMatchSlot by determining empty slot
 */
async function advanceWinnerToNextMatch(
  tournamentId: string,
  match: Match,
  winnerId: string,
  timestamp: number
) {
  if (!match.nextMatchId) return;

  const nextMatchRef = doc(db, 'tournaments', tournamentId, 'matches', match.nextMatchId);
  const teamAId = match.teamAId || match.sideA?.id || '';

  // Determine which side of the next match to update
  let isSlotA: boolean;

  if (match.nextMatchSlot) {
    // Use explicit slot if available
    const slot = match.nextMatchSlot;
    isSlotA = slot === 'teamA' || slot === 'sideA' || slot === 'team1';
  } else {
    // Fallback: fetch next match and find empty slot
    const nextMatchSnap = await getDoc(nextMatchRef);
    if (!nextMatchSnap.exists()) {
      console.error('[advanceWinner] Next match not found:', match.nextMatchId);
      return;
    }
    const nextMatch = nextMatchSnap.data() as Match;

    // Check which slot is empty (no team/side assigned)
    const slotAEmpty = !nextMatch.teamAId && !nextMatch.sideA?.id;
    const slotBEmpty = !nextMatch.teamBId && !nextMatch.sideB?.id;

    if (slotAEmpty) {
      isSlotA = true;
    } else if (slotBEmpty) {
      isSlotA = false;
    } else {
      // Both slots filled - shouldn't happen, log error
      console.error('[advanceWinner] Both slots already filled in next match:', match.nextMatchId);
      return;
    }
  }

  const nextMatchField = isSlotA ? 'teamAId' : 'teamBId';
  const nextMatchSideField = isSlotA ? 'sideA' : 'sideB';

  // Get winner's info from the match
  const winnerSide = winnerId === teamAId
    ? { id: match.sideA?.id || match.teamAId, name: match.sideA?.name, playerIds: match.sideA?.playerIds }
    : { id: match.sideB?.id || match.teamBId, name: match.sideB?.name, playerIds: match.sideB?.playerIds };

  // Filter out undefined values
  const winnerSideClean = Object.fromEntries(
    Object.entries(winnerSide).filter(([, v]) => v !== undefined)
  );

  console.log('[advanceWinner] Advancing to', match.nextMatchId, 'slot:', isSlotA ? 'A' : 'B', 'winner:', winnerSideClean);

  await updateDoc(nextMatchRef, {
    [nextMatchField]: winnerId,
    [nextMatchSideField]: winnerSideClean,
    lastUpdatedAt: timestamp,
  });
}

/**
 * V06.22: Helper to advance loser to bronze/3rd place match
 */
async function advanceLoserToBronzeMatch(
  tournamentId: string,
  match: Match,
  loserId: string,
  timestamp: number
) {
  if (!match.loserNextMatchId) return;

  const bronzeMatchRef = doc(db, 'tournaments', tournamentId, 'matches', match.loserNextMatchId);
  const teamAId = match.teamAId || match.sideA?.id || '';

  // Determine which side of the bronze match to update
  let isSlotA: boolean;

  if (match.loserNextMatchSlot) {
    // Use explicit slot if available
    const slot = match.loserNextMatchSlot;
    isSlotA = slot === 'team1' || slot === 'sideA';
  } else {
    // Fallback: fetch bronze match and find empty slot
    const bronzeMatchSnap = await getDoc(bronzeMatchRef);
    if (!bronzeMatchSnap.exists()) {
      console.error('[advanceLoser] Bronze match not found:', match.loserNextMatchId);
      return;
    }
    const bronzeMatch = bronzeMatchSnap.data() as Match;

    const slotAEmpty = !bronzeMatch.teamAId && !bronzeMatch.sideA?.id;
    const slotBEmpty = !bronzeMatch.teamBId && !bronzeMatch.sideB?.id;

    if (slotAEmpty) {
      isSlotA = true;
    } else if (slotBEmpty) {
      isSlotA = false;
    } else {
      console.error('[advanceLoser] Both slots already filled in bronze match:', match.loserNextMatchId);
      return;
    }
  }

  const bronzeMatchField = isSlotA ? 'teamAId' : 'teamBId';
  const bronzeMatchSideField = isSlotA ? 'sideA' : 'sideB';

  // Get loser's info from the match
  const loserSide = loserId === teamAId
    ? { id: match.sideA?.id || match.teamAId, name: match.sideA?.name, playerIds: match.sideA?.playerIds }
    : { id: match.sideB?.id || match.teamBId, name: match.sideB?.name, playerIds: match.sideB?.playerIds };

  // Filter out undefined values
  const loserSideClean = Object.fromEntries(
    Object.entries(loserSide).filter(([, v]) => v !== undefined)
  );

  console.log('[advanceLoser] Advancing loser to bronze match', match.loserNextMatchId, 'slot:', isSlotA ? 'A' : 'B', 'loser:', loserSideClean);

  await updateDoc(bronzeMatchRef, {
    [bronzeMatchField]: loserId,
    [bronzeMatchSideField]: loserSideClean,
    lastUpdatedAt: timestamp,
  });
}

/**
 * Opponent (or organiser) confirms the pending score.
 * - Marks submission as confirmed
 * - Marks the match as 'completed'
 * - Advances winner to next bracket match if applicable
 *
 * V06.22: Updated to accept matchId instead of Match object
 */
export async function confirmMatchScore(
  tournamentId: string,
  matchId: string,
  confirmingUserId: string,
  _isOrganizer: boolean = false // for signature compatibility
) {
  // Fetch the match to get full data
  const matchRef = doc(db, 'tournaments', tournamentId, 'matches', matchId);
  const matchSnap = await getDoc(matchRef);
  if (!matchSnap.exists()) {
    throw new Error('Match not found');
  }
  const match = { id: matchSnap.id, ...matchSnap.data() } as Match;

  const submissionsRef = collection(db, 'tournaments', tournamentId, 'scoreSubmissions');

  // Find the latest pending submission for this match
  const q = query(
    submissionsRef,
    where('matchId', '==', match.id),
    where('status', '==', 'pending_opponent')
  );
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    throw new Error('No pending score submission found for this match.');
  }

  const docSnap = snapshot.docs[0];

  // Confirm the submission
  await updateDoc(docSnap.ref, {
    status: 'confirmed',
    respondedAt: Date.now(),
  });

  // Mark the match as completed (scores were already written on submit)
  const now = Date.now();
  await updateDoc(matchRef, {
    status: 'completed',
    completedAt: now,
    endTime: now,
    lastUpdatedBy: confirmingUserId,
    lastUpdatedAt: now,
    court: null, // free court
  });

  // Advance winner to next bracket match if applicable
  const winnerId = match.winnerId || match.winnerTeamId;
  if (winnerId && match.nextMatchId) {
    await advanceWinnerToNextMatch(tournamentId, match, winnerId, now);
  }

  // V06.22: Advance loser to bronze match if applicable (semi-finals)
  if (winnerId && match.loserNextMatchId) {
    const teamAId = match.teamAId || match.sideA?.id || '';
    const teamBId = match.teamBId || match.sideB?.id || '';
    const loserId = winnerId === teamAId ? teamBId : teamAId;
    await advanceLoserToBronzeMatch(tournamentId, match, loserId, now);
  }

  // V06.35: Update pool results if this is a pool match
  // V07.30: Use safe wrapper - pool results are secondary, match scoring should not fail
  const completedMatch: Match = {
    ...match,
    status: 'completed',
    completedAt: now,
    updatedAt: now,
  };
  await updatePoolResultsOnMatchCompleteSafe(tournamentId, match.divisionId || '', completedMatch);
}

/**
 * Opponent disputes the submitted score.
 * - Marks submission as rejected
 * - Flags the match as 'disputed'
 *
 * V06.22: Updated to accept matchId instead of Match object
 */
export async function disputeMatchScore(
  tournamentId: string,
  matchId: string,
  disputingUserId: string,
  reason?: string
) {
  const submissionsRef = collection(
    db,
    'tournaments',
    tournamentId,
    'scoreSubmissions'
  );

  const q = query(
    submissionsRef,
    where('matchId', '==', matchId),
    where('status', '==', 'pending_opponent')
  );
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    throw new Error('No pending score submission found to dispute.');
  }

  const docSnap = snapshot.docs[0];

  await updateDoc(docSnap.ref, {
    status: 'rejected',
    respondedAt: Date.now(),
    reasonRejected: reason ?? null,
  });

  const matchRef = doc(db, 'tournaments', tournamentId, 'matches', matchId);
  await updateDoc(matchRef, {
    status: 'disputed',
    lastUpdatedBy: disputingUserId,
    lastUpdatedAt: Date.now(),
  });
}
