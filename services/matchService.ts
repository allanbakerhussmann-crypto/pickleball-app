
import { db } from './firebase';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  query,
  where,
  writeBatch
} from '@firebase/firestore';
import type { Match, MatchScoreSubmission, MatchTeam } from '../types';

/**
 * Player submits a score for a match.
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

  // Hydrated match has teamAId/teamBId
  const teamAId = match.teamAId!;
  const teamBId = match.teamBId!;

  const winnerTeamId =
    score1 > score2 ? teamAId :
    score2 > score1 ? teamBId :
    null;

  if (!winnerTeamId) {
    throw new Error('Unable to determine winner from scores.');
  }

  const submission: Omit<MatchScoreSubmission, 'id'> = {
    tournamentId,
    matchId: match.id,
    submittedBy: submittedByUserId,
    teamAId: teamAId,
    teamBId: teamBId,
    submittedScore: {
      scoreTeamAGames: [score1],
      scoreTeamBGames: [score2],
      winnerTeamId,
    },
    status: 'pending_opponent',
    opponentUserId: null, 
    respondedAt: null,
    reasonRejected: null,
    createdAt: Date.now(),
  };

  await addDoc(collection(db, 'matchScoreSubmissions'), submission);

  // Update match status
  // Note: We do NOT write scores to `matchTeams` yet. We wait for confirmation.
  // But we might want to update `match` doc with status.
  const matchRef = doc(db, 'matches', match.id);
  await updateDoc(matchRef, {
    status: 'pending_confirmation',
    winnerTeamId,
    lastUpdatedBy: submittedByUserId,
    lastUpdatedAt: Date.now(),
  });
}

/**
 * Confirm score. Writes final scores to MatchTeams.
 */
export async function confirmMatchScore(
  tournamentId: string,
  match: Match,
  confirmingUserId: string
) {
  const submissionsRef = collection(db, 'matchScoreSubmissions');
  const q = query(submissionsRef, where('matchId', '==', match.id), where('status', '==', 'pending_opponent'));
  const snapshot = await getDocs(q);

  if (snapshot.empty) throw new Error('No pending score submission.');
  const submissionDoc = snapshot.docs[0];
  const submissionData = submissionDoc.data() as MatchScoreSubmission;

  const batch = writeBatch(db);

  // 1. Confirm submission
  batch.update(submissionDoc.ref, { status: 'confirmed', respondedAt: Date.now() });

  // 2. Update Match
  const matchRef = doc(db, 'matches', match.id);
  batch.update(matchRef, {
    status: 'completed',
    endTime: Date.now(),
    lastUpdatedBy: confirmingUserId,
    lastUpdatedAt: Date.now(),
    court: null,
    winnerTeamId: submissionData.submittedScore.winnerTeamId
  });

  // 3. Update MatchTeams
  // Need to find the matchTeam docs.
  const qMt = query(collection(db, 'matchTeams'), where('matchId', '==', match.id));
  const mtSnap = await getDocs(qMt);
  
  // We assume 2 docs. Map teamAId -> scoreA, teamBId -> scoreB
  const scores = submissionData.submittedScore;
  const teamAId = submissionData.teamAId;
  const teamBId = submissionData.teamBId;

  mtSnap.forEach(d => {
      const mt = d.data() as MatchTeam;
      if (mt.teamId === teamAId) {
          batch.update(d.ref, { scoreGames: scores.scoreTeamAGames });
      } else if (mt.teamId === teamBId) {
          batch.update(d.ref, { scoreGames: scores.scoreTeamBGames });
      }
  });

  await batch.commit();
}

export async function disputeMatchScore(
  tournamentId: string,
  match: Match,
  disputingUserId: string,
  reason?: string
) {
  // ... similar to before, update submission to rejected, match to disputed
  const submissionsRef = collection(db, 'matchScoreSubmissions');
  const q = query(submissionsRef, where('matchId', '==', match.id), where('status', '==', 'pending_opponent'));
  const snapshot = await getDocs(q);
  if (!snapshot.empty) {
      await updateDoc(snapshot.docs[0].ref, { status: 'rejected', respondedAt: Date.now(), reasonRejected: reason || null });
  }
  const matchRef = doc(db, 'matches', match.id);
  await updateDoc(matchRef, { status: 'disputed', lastUpdatedBy: disputingUserId, lastUpdatedAt: Date.now() });
}
