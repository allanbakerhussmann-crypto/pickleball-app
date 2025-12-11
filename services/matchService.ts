import { db, sendNotification, getAuth } from './firebase';
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  updateDoc
} from '@firebase/firestore';

const defaultConfig = {
  projectId: "pickleball-app-dev"
};

const callCloudFunction = async (name: string, data: any): Promise<any> => {
    const auth = getAuth();
    const token = await auth.currentUser?.getIdToken();
    if (!token) {
        throw new Error("You must be logged in to perform this action.");
    }

    // Reuse config logic (simplified for minimal changes)
    const stored = localStorage.getItem('pickleball_firebase_config');
    const config = stored ? JSON.parse(stored) : defaultConfig;
    const projectId = config.projectId || "pickleball-app-dev";
    
    // Default region for HTTP functions is typically us-central1 unless specified
    const region = "us-central1"; 
    const url = `https://${region}-${projectId}.cloudfunctions.net/${name}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
    });

    const json = await response.json();
    
    if (!response.ok) {
        throw new Error(json.error || `Function ${name} failed`);
    }
    return json;
};

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

  try {
      await callCloudFunction('submitMatchScore', {
          matchId: match.id,
          score1,
          score2
      });
  } catch (error: any) {
      console.error("Score submission failed:", error);
      throw new Error(error.message || "Failed to submit score. Please try again.");
  }

  // OPTIONAL: Client-side notification trigger (Best Effort)
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
 */
export async function confirmMatchScore(
  contextId: string,
  match: Match,
  confirmingUserId: string
) {
  // 1. Find the pending submission ID for this match
  const submissionsRef = collection(db, 'matchScoreSubmissions');
  const q = query(submissionsRef, where('matchId', '==', match.id), where('status', '==', 'pending_opponent'));
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
      throw new Error('No pending score submission found to confirm.');
  }
  
  const submissionId = snapshot.docs[0].id;

  // 2. Call Cloud Function
  try {
      await callCloudFunction('confirmMatchScore', { matchId: match.id, submissionId });
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
  try {
      await callCloudFunction('disputeMatchScore', { matchId: match.id, reason });
  } catch (error: any) {
      console.error("Dispute action failed:", error);
      throw new Error(error.message || "Failed to lodge dispute.");
  }
}