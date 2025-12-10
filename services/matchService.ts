
import { db } from './firebase';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  query,
  where,
} from '@firebase/firestore';
import type { Match, MatchScoreSubmission } from '../types';

/**
 * Player submits a score for a match.
 * - Creates a MatchScoreSubmission document in root collection
 * - Writes the proposed score to the Match in root 'matches' collection
 * - Sets the match status to 'pending_confirmation'
 */
export async function submitMatchScore(
  tournamentId: string,
  match: Match,
  submittedByUserId: string,
  score1: number,
  score2: number
) {
  if (Number.isNaN(score1) || Number.isNaN(score2)) {
    throw new Error('Please enter both scores.');
  }
  if (score1 === score2) {
    throw new Error('Scores cannot be tied. Please enter a winner.');
  }

  const winnerTeamId =
    score1 > score2 ? match.teamAId :
    score2 > score1 ? match.teamBId :
    null;

  if (!winnerTeamId) {
    throw new Error('Unable to determine winner from scores.');
  }

  const submission: Omit<MatchScoreSubmission, 'id'> = {
    tournamentId,
    matchId: match.id,
    submittedBy: submittedByUserId,
    teamAId: match.teamAId,
    teamBId: match.teamBId,
    submittedScore: {
      // For now, a single game match [score1], [score2]
      scoreTeamAGames: [score1],
      scoreTeamBGames: [score2],
      winnerTeamId,
    },
    status: 'pending_opponent',
    opponentUserId: null, // we will wire this later
    respondedAt: null,
    reasonRejected: null,
    createdAt: Date.now(),
  };

  // Save the submission to root 'matchScoreSubmissions'
  const submissionsRef = collection(db, 'matchScoreSubmissions');
  await addDoc(submissionsRef, submission);

  // Update the match with the proposed score + pending status
  const matchRef = doc(db, 'matches', match.id);
  await updateDoc(matchRef, {
    status: 'pending_confirmation',
    scoreTeamAGames: [score1],
    scoreTeamBGames: [score2],
    winnerTeamId,
    lastUpdatedBy: submittedByUserId,
    lastUpdatedAt: Date.now(),
  });
}

/**
 * Opponent (or organiser) confirms the pending score.
 * - Marks submission as confirmed
 * - Marks the match as 'completed'
 */
export async function confirmMatchScore(
  tournamentId: string,
  match: Match,
  confirmingUserId: string
) {
  const submissionsRef = collection(db, 'matchScoreSubmissions');

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
  const matchRef = doc(db, 'matches', match.id);
  await updateDoc(matchRef, {
    status: 'completed',
    endTime: Date.now(),
    lastUpdatedBy: confirmingUserId,
    lastUpdatedAt: Date.now(),
    court: null, // free court
  });
}

/**
 * Opponent disputes the submitted score.
 * - Marks submission as rejected
 * - Flags the match as 'disputed'
 */
export async function disputeMatchScore(
  tournamentId: string,
  match: Match,
  disputingUserId: string,
  reason?: string
) {
  const submissionsRef = collection(db, 'matchScoreSubmissions');

  const q = query(
    submissionsRef,
    where('matchId', '==', match.id),
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

  const matchRef = doc(db, 'matches', match.id);
  await updateDoc(matchRef, {
    status: 'disputed',
    lastUpdatedBy: disputingUserId,
    lastUpdatedAt: Date.now(),
  });
}
