/**
 * usePendingScoreAcknowledgements Hook
 *
 * Fetches matches where the current user needs to acknowledge (sign) a score proposal.
 * Used for the global pending score alert banner.
 *
 * V07.53: Uses collectionGroup query with participantIds for efficient cross-event queries.
 * Requires Firestore collection group index on: matches (scoreState ASC, participantIds ARRAY)
 *
 * @version V07.53
 * @file hooks/usePendingScoreAcknowledgements.ts
 */

import { useState, useEffect } from 'react';
import { collectionGroup, query, where, onSnapshot } from '@firebase/firestore';
import { db } from '../services/firebase/config';
import { useAuth } from '../contexts/AuthContext';
import type { Match } from '../types';

export interface PendingScoreMatch {
  matchId: string;
  eventType: 'tournament' | 'league' | 'meetup';
  eventId: string;
  eventName?: string;
  opponentName: string;
  proposedScore: string;
  proposedBy: string;
  proposedAt: number;
}

export function usePendingScoreAcknowledgements() {
  const { currentUser } = useAuth();
  const [pendingMatches, setPendingMatches] = useState<PendingScoreMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser?.uid) {
      setPendingMatches([]);
      setLoading(false);
      return;
    }

    const userId = currentUser.uid;

    // V07.53: Use collectionGroup to query across tournaments, leagues, and meetups
    // Combined with participantIds for efficient filtering
    const matchesRef = collectionGroup(db, 'matches');

    // Query for matches where:
    // 1. scoreState = 'proposed' (awaiting opponent signature)
    // 2. User is a participant (via participantIds array)
    const q = query(
      matchesRef,
      where('scoreState', '==', 'proposed'),
      where('participantIds', 'array-contains', userId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const pending: PendingScoreMatch[] = [];

        snapshot.docs.forEach((doc) => {
          const match = { id: doc.id, ...doc.data() } as Match;

          // Check if user is the opponent (not the proposer)
          const proposerId = match.scoreProposal?.enteredByUserId;
          if (!proposerId || proposerId === userId) return; // User proposed this score, skip

          // Check if proposer's teammate proposed (user's team proposed)
          const sideAPlayerIds = match.sideA?.playerIds || [];
          const sideBPlayerIds = match.sideB?.playerIds || [];
          const isInSideA = sideAPlayerIds.includes(userId);
          const isInSideB = sideBPlayerIds.includes(userId);

          // If proposer is on the same team as user, skip (teammate proposed)
          const proposerInSideA = sideAPlayerIds.includes(proposerId);
          const proposerInSideB = sideBPlayerIds.includes(proposerId);

          if ((isInSideA && proposerInSideA) || (isInSideB && proposerInSideB)) {
            return; // User's team proposed, they can't confirm
          }

          // User is the opponent who needs to acknowledge
          const opponentName = isInSideA ? match.sideB?.name : match.sideA?.name;
          const proposedBy = isInSideA ? match.sideB?.name : match.sideA?.name;

          // Format the score
          const scores = match.scoreProposal?.scores || match.scores || [];
          const scoreStr =
            scores.map((s) => `${s.scoreA}-${s.scoreB}`).join(', ') || 'N/A';

          // Extract eventId from document path
          // Path is like: tournaments/{tournamentId}/matches/{matchId}
          const pathParts = doc.ref.path.split('/');
          const eventId = pathParts.length >= 2 ? pathParts[1] : '';
          const eventTypeFromPath = pathParts.length >= 1 ? pathParts[0] : '';

          // Determine event type from path or match data
          let eventType: 'tournament' | 'league' | 'meetup' = match.eventType || 'tournament';
          if (eventTypeFromPath === 'tournaments') eventType = 'tournament';
          else if (eventTypeFromPath === 'leagues') eventType = 'league';
          else if (eventTypeFromPath === 'meetups') eventType = 'meetup';

          pending.push({
            matchId: match.id,
            eventType,
            eventId: match.eventId || eventId,
            eventName: (match as any).eventName,
            opponentName: opponentName || 'Unknown',
            proposedScore: scoreStr,
            proposedBy: proposedBy || 'Opponent',
            proposedAt: match.scoreProposal?.enteredAt || Date.now(),
          });
        });

        setPendingMatches(pending);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('[usePendingScoreAcknowledgements] Error:', err);

        // Check if it's a missing index error
        if (err.message?.includes('index')) {
          console.error(
            '[usePendingScoreAcknowledgements] Missing Firestore index. ' +
              'Create a collection group index on "matches" with fields: ' +
              'scoreState (Ascending), participantIds (Arrays). ' +
              'Or click the link in the Firebase console error.'
          );
          setError('Database index required. Please contact support.');
        } else {
          setError('Failed to load pending matches.');
        }

        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser?.uid]);

  return { pendingMatches, loading, error };
}
