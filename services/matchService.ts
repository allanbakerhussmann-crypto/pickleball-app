
import { db, updateLeagueStandings, sendNotification } from './firebase';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  query,
  where,
  writeBatch,
  getDoc
} from '@firebase/firestore';
import type { Match, MatchScoreSubmission, MatchTeam, Competition } from '../types';

/**
 * Player submits a score for a match.
 */
export async function submitMatchScore(
  contextId: string, // Tournament ID or Competition ID
  match: Match,
  submittedByUserId: string,
  score1: number,
  score2: number
) {
  if (Number.isNaN(score1) || Number.isNaN(score2)) {
    throw new Error('Please enter both scores.');
  }
  if (score1 === score2 && !match.competitionId) {
    throw new Error('Scores cannot be tied. Please enter a winner.');
  }

  // Hydrated match has teamAId/teamBId
  const teamAId = match.teamAId!;
  const teamBId = match.teamBId!;

  let winnerTeamId: string | null = null;
  if (score1 > score2) winnerTeamId = teamAId;
  else if (score2 > score1) winnerTeamId = teamBId;
  // If equal, winnerTeamId remains null (Draw)

  const submission: Omit<MatchScoreSubmission, 'id'> = {
    tournamentId: match.tournamentId,
    competitionId: match.competitionId,
    matchId: match.id,
    submittedBy: submittedByUserId,
    teamAId: teamAId,
    teamBId: teamBId,
    submittedScore: {
      scoreTeamAGames: [score1],
      scoreTeamBGames: [score2],
      winnerTeamId: winnerTeamId || 'draw',
    },
    status: 'pending_opponent',
    opponentUserId: null, 
    respondedAt: null,
    reasonRejected: null,
    createdAt: Date.now(),
  };

  await addDoc(collection(db, 'matchScoreSubmissions'), submission);

  // Update match status
  const matchRef = doc(db, 'matches', match.id);
  await updateDoc(matchRef, {
    status: 'pending_confirmation',
    winnerTeamId,
    lastUpdatedBy: submittedByUserId,
    lastUpdatedAt: Date.now(),
  });

  // NOTIFICATION: Notify Opponent
  // We need to find who the opponent is.
  // Assuming 1v1 league for simplicity, teamId might be userId or we look up team members.
  // If it's a team, we ideally notify all members.
  // For this implementation, let's assume teamAId/teamBId ARE userIds if type is individual, 
  // or we do a quick lookup.
  
  const opponentTeamId = (teamAId === submittedByUserId || teamAId.includes(submittedByUserId)) ? teamBId : teamAId;
  
  // Try to find if opponentTeamId corresponds to a user directly (Individual League)
  // or search for team members.
  // Optimization: Just check if opponentTeamId is not the submitter.
  // Ideally, we'd fetch the team to get players.
  
  // Simplified logic: If teamId looks like a User ID, notify them.
  if (opponentTeamId && opponentTeamId !== 'BYE') {
      sendNotification(
          opponentTeamId,
          "Score Verification Required",
          `A score has been submitted for your match against ${submittedByUserId === teamAId ? "Team A" : "Team B"}. Please verify it.`,
          "action_required"
      ).catch(console.error); // Best effort
  }
}

/**
 * Confirm score. Writes final scores to MatchTeams.
 */
export async function confirmMatchScore(
  contextId: string,
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
  
  // Handle draw winnerTeamId
  let winnerId = submissionData.submittedScore.winnerTeamId;
  if (winnerId === 'draw') winnerId = null as any;

  batch.update(matchRef, {
    status: 'completed',
    endTime: Date.now(),
    lastUpdatedBy: confirmingUserId,
    lastUpdatedAt: Date.now(),
    court: null,
    winnerTeamId: winnerId
  });

  // 3. Update MatchTeams
  const qMt = query(collection(db, 'matchTeams'), where('matchId', '==', match.id));
  const mtSnap = await getDocs(qMt);
  
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

  // 4. Update League Standings if applicable
  if (match.competitionId) {
      await updateLeagueStandings(match.id);
  }

  // NOTIFICATION: Notify original submitter
  if (submissionData.submittedBy && submissionData.submittedBy !== confirmingUserId) {
      sendNotification(
          submissionData.submittedBy,
          "Score Confirmed",
          "Your match score has been confirmed and the standings updated.",
          "success"
      ).catch(console.error);
  }
}

export async function disputeMatchScore(
  contextId: string,
  match: Match,
  disputingUserId: string,
  reason?: string
) {
  const submissionsRef = collection(db, 'matchScoreSubmissions');
  const q = query(submissionsRef, where('matchId', '==', match.id), where('status', '==', 'pending_opponent'));
  const snapshot = await getDocs(q);
  if (!snapshot.empty) {
      await updateDoc(snapshot.docs[0].ref, { status: 'rejected', respondedAt: Date.now(), reasonRejected: reason || null });
  }
  const matchRef = doc(db, 'matches', match.id);
  await updateDoc(matchRef, { status: 'disputed', lastUpdatedBy: disputingUserId, lastUpdatedAt: Date.now() });

  // NOTIFICATION: Alert Organizer
  if (match.competitionId) {
      const compSnap = await getDoc(doc(db, 'competitions', match.competitionId));
      if (compSnap.exists()) {
          const comp = compSnap.data() as Competition;
          sendNotification(
              comp.organiserId,
              "Score Disputed",
              `A match score in ${comp.name} has been disputed. Please investigate.`,
              "error"
          ).catch(console.error);
      }
  }
}
