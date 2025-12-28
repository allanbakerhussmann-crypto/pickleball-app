/**
 * DuprSubmitButton Component
 *
 * A reusable button component for submitting completed matches to DUPR.
 * Shows different states: eligible, loading, submitted, error.
 *
 * FILE LOCATION: components/shared/DuprSubmitButton.tsx
 * VERSION: V06.15
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getUserProfile } from '../../services/firebase';
import { updateLeagueMatchDuprStatus } from '../../services/firebase/matches';
import {
  isDuprEligible,
  submitLeagueMatchToDupr,
  type SubmissionPlayers,
  type SubmissionOptions,
} from '../../services/dupr/matchSubmission';
import type { LeagueMatch } from '../../types';

// ============================================
// TYPES
// ============================================

interface DuprSubmitButtonProps {
  match: LeagueMatch;
  leagueId?: string;  // For updating match status in Firestore
  eventName?: string;
  clubId?: string;
  location?: string;
  onSubmitted?: (duprMatchId: string) => void;
  onError?: (error: string) => void;
  className?: string;
  compact?: boolean;
}

type SubmitState = 'idle' | 'checking' | 'loading' | 'submitted' | 'error' | 'not_eligible';

// ============================================
// COMPONENT
// ============================================

export const DuprSubmitButton: React.FC<DuprSubmitButtonProps> = ({
  match,
  leagueId,
  eventName,
  clubId,
  location,
  onSubmitted,
  onError,
  className = '',
  compact = false,
}) => {
  const { userProfile } = useAuth();
  const [state, setState] = useState<SubmitState>('checking');
  const [error, setError] = useState<string | null>(null);
  const [players, setPlayers] = useState<SubmissionPlayers | null>(null);

  // Check if match is already submitted
  useEffect(() => {
    if (match.duprSubmitted) {
      setState('submitted');
      return;
    }

    // Load player profiles to check eligibility
    const loadPlayers = async () => {
      setState('checking');
      try {
        // Get player IDs from match
        const userAId = match.userAId;
        const userBId = match.userBId;
        const partnerAId = match.partnerAId;
        const partnerBId = match.partnerBId;

        console.log('[DuprSubmitButton] Checking eligibility for match:', {
          matchId: match.id,
          userAId,
          userBId,
          memberAName: match.memberAName,
          memberBName: match.memberBName,
        });

        if (!userAId || !userBId) {
          setError('Match is missing player IDs');
          setState('not_eligible');
          return;
        }

        // Fetch player profiles
        let userA, userB, partnerA, partnerB;
        try {
          [userA, userB, partnerA, partnerB] = await Promise.all([
            getUserProfile(userAId),
            getUserProfile(userBId),
            partnerAId ? getUserProfile(partnerAId) : Promise.resolve(null),
            partnerBId ? getUserProfile(partnerBId) : Promise.resolve(null),
          ]);
        } catch (fetchErr) {
          console.error('[DuprSubmitButton] Error fetching profiles:', fetchErr);
          setError('Could not load player profiles');
          setState('not_eligible');
          return;
        }

        if (!userA || !userB) {
          console.log('[DuprSubmitButton] Missing user profiles:', { userA: !!userA, userB: !!userB });
          setError('Could not load player profiles');
          setState('not_eligible');
          return;
        }

        console.log('[DuprSubmitButton] Loaded profiles:', {
          userA: { id: userA.id, name: userA.displayName, duprId: userA.duprId },
          userB: { id: userB.id, name: userB.displayName, duprId: userB.duprId },
        });

        const loadedPlayers: SubmissionPlayers = {
          userA,
          userB,
          partnerA: partnerA || undefined,
          partnerB: partnerB || undefined,
        };

        setPlayers(loadedPlayers);

        // Check eligibility
        const eligibility = isDuprEligible(match, loadedPlayers);
        console.log('[DuprSubmitButton] Eligibility check:', eligibility);

        if (!eligibility.eligible) {
          setError(eligibility.reason || 'Not eligible for DUPR submission');
          setState('not_eligible');
        } else {
          setState('idle');
        }
      } catch (err) {
        console.error('[DuprSubmitButton] Error loading players:', err);
        setError('Error checking eligibility');
        setState('not_eligible');
      }
    };

    loadPlayers();
  }, [match]);

  // Handle submit
  const handleSubmit = async () => {
    if (!players) {
      setError('Player data not loaded');
      setState('error');
      return;
    }

    // Note: With the new RaaS API, we use client credentials, not user's access token
    // The userProfile?.duprAccessToken check is no longer strictly required
    console.log('[DuprSubmitButton] Submitting match to DUPR...');

    setState('loading');
    setError(null);

    const options: SubmissionOptions = {
      eventName,
      clubId,
      location,
    };

    const result = await submitLeagueMatchToDupr(
      userProfile.duprAccessToken,
      match,
      players,
      options
    );

    if (result.success && result.duprMatchId) {
      // Update match status in Firestore if leagueId is provided
      if (leagueId && match.id) {
        try {
          await updateLeagueMatchDuprStatus(leagueId, match.id, {
            duprSubmitted: true,
            duprMatchId: result.duprMatchId,
            duprSubmittedAt: Date.now(),
            duprSubmittedBy: userProfile.id,
          });
        } catch (err) {
          console.warn('[DuprSubmitButton] Failed to update match status:', err);
          // Don't fail the whole operation, the submission was successful
        }
      }

      setState('submitted');
      onSubmitted?.(result.duprMatchId);
    } else {
      // Update match with error if leagueId is provided
      if (leagueId && match.id) {
        try {
          await updateLeagueMatchDuprStatus(leagueId, match.id, {
            duprSubmitted: false,
            duprError: result.error || 'Submission failed',
          });
        } catch (err) {
          console.warn('[DuprSubmitButton] Failed to update match error status:', err);
        }
      }

      setError(result.error || 'Submission failed');
      setState('error');
      onError?.(result.error || 'Submission failed');
    }
  };

  // Already submitted state
  if (state === 'submitted' || match.duprSubmitted) {
    return (
      <div className={`flex items-center gap-1 text-green-400 ${className}`}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <span className={compact ? 'text-xs' : 'text-sm'}>
          {compact ? 'DUPR' : 'Submitted to DUPR'}
        </span>
        {match.duprMatchId && !compact && (
          <span className="text-xs text-gray-500 ml-1">#{match.duprMatchId}</span>
        )}
      </div>
    );
  }

  // Not eligible state
  if (state === 'not_eligible') {
    return (
      <div className={`flex items-center gap-1 text-gray-500 ${className}`} title={error || undefined}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className={compact ? 'text-xs' : 'text-sm'}>
          {compact ? 'No DUPR' : (error || 'Not eligible')}
        </span>
      </div>
    );
  }

  // Error state with retry
  if (state === 'error') {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="text-red-400 text-xs">{error}</span>
        <button
          onClick={handleSubmit}
          className="px-2 py-1 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded text-xs border border-red-600/30"
        >
          Retry
        </button>
      </div>
    );
  }

  // Check if user can submit
  // With RaaS API, we use client credentials, so any authenticated user can submit
  const canSubmit = !!userProfile;

  // Loading/checking state
  if (state === 'checking' || state === 'loading') {
    return (
      <button
        disabled
        className={`inline-flex items-center gap-2 px-3 py-1.5 bg-gray-700 text-gray-400 rounded-lg ${compact ? 'text-xs' : 'text-sm'} ${className}`}
      >
        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        {state === 'loading' ? 'Submitting...' : 'Checking...'}
      </button>
    );
  }

  // Idle state - ready to submit
  return (
    <button
      onClick={handleSubmit}
      disabled={!canSubmit}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${compact ? 'text-xs' : 'text-sm'} ${
        canSubmit
          ? 'bg-blue-600 hover:bg-blue-500 text-white'
          : 'bg-gray-700 text-gray-400 cursor-not-allowed'
      } ${className}`}
      title={canSubmit ? 'Submit this match to DUPR' : 'Sign in to submit matches to DUPR'}
    >
      {/* DUPR Icon */}
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
      {compact ? 'DUPR' : 'Submit to DUPR'}
    </button>
  );
};

export default DuprSubmitButton;
