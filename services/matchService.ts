
import { db, sendNotification } from './firebase';
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  updateDoc
} from '@firebase/firestore';
import { getFunctions, httpsCallable } from '@firebase/functions';
import type { Match, MatchScoreSubmission, Competition } from '../types';

/**
 * SERVICE: Match Management
 * 
 * Handles the secure submission and verification of match scores.
 * All critical state changes are delegated to Firebase Cloud Functions to ensure
 * data integrity and enforce rules (e.g. only participants can submit, atomic standings updates).
 */

/**
 * Submits a score for a match via Cloud Function.
 * 
 * @param contextId - The ID of the tournament or competition context.
 * @param match - The match object being updated.
 * @param submittedByUserId - The ID of the user submitting the score.
 * @param score1 - Score for Team A.
 * @param score2 - Score for Team B.
 * 
 * @throws Error if scores are invalid or backend rejects the submission.
 */
export async function submitMatchScore(
  contextId: string, 
  match: Match,
  submittedByUserId: string,
  score1: number,
  score2: number
) {
  if (Number.isNaN(score1) || Number.isNaN(score2)) {
    throw new Error('Please enter valid numeric scores.');
  }
  
  if (score1 < 0 || score2 < 0) {
      throw new Error('Scores cannot be negative.');
  }

  const functions = getFunctions();
  const submitFn = httpsCallable(functions, 'submitMatchScore');

  try {
      await submitFn({
          matchId: match.id,
          score1,
          score2
      });
  } catch (error: any) {
      console.error("Score submission failed:", error);
      throw new Error(error.message || "Failed to submit score. Please try again.");
  }

  // OPTIONAL: Client-side notification trigger (Best Effort)
  // Real-time notifications should ideally be handled by Firestore Triggers on the backend.
  const teamAId = match.teamAId!;
  const teamBId = match.teamBId!;
  const opponentTeamId = (teamAId === submittedByUserId || (typeof teamAId === 'string' && teamAId.includes(submittedByUserId))) ? teamBId : teamAId;
  
  if (opponentTeamId && opponentTeamId !== 'BYE') {
      sendNotification(
          opponentTeamId,
          "Score Verification Required",
          `A score has been submitted for your match. Please confirm or dispute it.`,
          "action_required"
      ).catch(err => console.warn("Failed to send client-side notification", err)); 
  }
}

/**
 * Confirms a pending score submission.
 * 
 * This triggers a Cloud Function that:
 * 1. Sets match status to 'completed'.
 * 2. Updates the match result.
 * 3. Atomically updates the League Standings (if applicable).
 * 
 * @param contextId - Context ID.
 * @param match - The match object.
 * @param confirmingUserId - The ID of the user confirming (Opponent or Organizer).
 */
export async function confirmMatchScore(
  contextId: string,
  match: Match,
  confirmingUserId: string
) {
  // 1. Find the pending submission ID for this match
  // We need this to tell the server WHICH submission we are confirming.
  const submissionsRef = collection(db, 'matchScoreSubmissions');
  const q = query(submissionsRef, where('matchId', '==', match.id), where('status', '==', 'pending_opponent'));
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
      throw new Error('No pending score submission found to confirm.');
  }
  
  const submissionId = snapshot.docs[0].id;

  // 2. Call Cloud Function
  const functions = getFunctions();
  const confirmFn = httpsCallable(functions, 'confirmMatchScore');
  
  try {
      await confirmFn({ matchId: match.id, submissionId });
  } catch (error: any) {
      console.error("Score confirmation failed:", error);
      throw new Error(error.message || "Failed to confirm score.");
  }
}

/**
 * Disputes a score, flagging it for organizer review.
 */
export async function disputeMatchScore(
  contextId: string,
  match: Match,
  disputingUserId: string,
  reason?: string
) {
  const functions = getFunctions();
  const disputeFn = httpsCallable(functions, 'disputeMatchScore');
  
  try {
      await disputeFn({ matchId: match.id, reason });
  } catch (error: any) {
      console.error("Dispute action failed:", error);
      throw new Error(error.message || "Failed to lodge dispute.");
  }
}
