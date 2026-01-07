/**
 * DuprSubmitButton Component V07.04
 *
 * DUPR-Compliant submission button that calls Cloud Function for server-side submission.
 * No client-side DUPR API calls - all submission is handled by dupr_submitMatches Cloud Function.
 *
 * V07.04 Changes:
 * - Removed direct DUPR API calls
 * - Uses dupr_submitMatches Cloud Function for server-side submission
 * - Checks eligibility: match must have officialResult and scoreState: 'official'
 * - Batch submission with tracking via dupr_submission_batches collection
 *
 * FILE LOCATION: components/shared/DuprSubmitButton.tsx
 * VERSION: V07.04
 */

import React, { useState, useEffect } from 'react';
import { httpsCallable } from '@firebase/functions';
import { useAuth } from '../../contexts/AuthContext';
import { functions } from '../../services/firebase/config';
import type { LeagueMatch, Match } from '../../types';

// ============================================
// TYPES
// ============================================

interface DuprSubmitButtonProps {
  /** Match to submit - supports both LeagueMatch and universal Match */
  match: LeagueMatch | Match;
  /** Event type for batch submission */
  eventType: 'tournament' | 'league';
  /** Event ID (tournamentId or leagueId) */
  eventId: string;
  /** Callback when submission is queued */
  onQueued?: (batchId: string) => void;
  /** Callback on error */
  onError?: (error: string) => void;
  /** Additional CSS classes */
  className?: string;
  /** Compact display mode */
  compact?: boolean;
}

type SubmitState = 'idle' | 'checking' | 'loading' | 'queued' | 'submitted' | 'error' | 'not_eligible';

interface SubmitMatchesResponse {
  success: boolean;
  batchId?: string;
  message: string;
  eligibleCount?: number;
  ineligibleCount?: number;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if match is eligible for DUPR submission
 * Match must have officialResult and scoreState: 'official'
 */
function checkEligibility(match: LeagueMatch | Match): { eligible: boolean; reason?: string } {
  // Already submitted
  if ((match as any).dupr?.submitted || (match as LeagueMatch).duprSubmitted) {
    return { eligible: false, reason: 'Already submitted to DUPR' };
  }

  // Check for officialResult (V07.04 requirement)
  const hasOfficialResult = !!(match as any).officialResult;

  // Check scoreState
  const scoreState = (match as any).scoreState;
  const isOfficial = scoreState === 'official' || scoreState === 'submittedToDupr';

  // Check match status
  const isCompleted = match.status === 'completed';

  // V07.04: Require officialResult and scoreState for new matches
  if (hasOfficialResult && isOfficial) {
    return { eligible: true };
  }

  // Legacy check for older matches
  if (isCompleted && !hasOfficialResult) {
    // Legacy match without officialResult - may have been completed before V07.04
    const hasScores = (match as LeagueMatch).scores?.length > 0;
    const hasWinner = !!(match as any).winnerId ||
      !!(match as any).memberAWins || !!(match as any).memberBWins;

    if (hasScores && hasWinner) {
      return { eligible: true };
    }
  }

  // Not eligible
  if (!isCompleted) {
    return { eligible: false, reason: 'Match not completed' };
  }
  if (!hasOfficialResult && !isOfficial) {
    return { eligible: false, reason: 'Awaiting organiser finalization' };
  }

  return { eligible: false, reason: 'Missing required data' };
}

// ============================================
// COMPONENT
// ============================================

export const DuprSubmitButton: React.FC<DuprSubmitButtonProps> = ({
  match,
  eventType,
  eventId,
  onQueued,
  onError,
  className = '',
  compact = false,
}) => {
  const { userProfile } = useAuth();
  const [state, setState] = useState<SubmitState>('checking');
  const [error, setError] = useState<string | null>(null);
  const [, setBatchId] = useState<string | null>(null);

  // Check eligibility on mount and when match changes
  useEffect(() => {
    // Check if already submitted
    if ((match as any).dupr?.submitted || (match as LeagueMatch).duprSubmitted) {
      setState('submitted');
      return;
    }

    // Check if pending submission
    if ((match as any).dupr?.pendingSubmission) {
      setState('queued');
      setBatchId((match as any).dupr?.batchId || null);
      return;
    }

    // Check eligibility
    const eligibility = checkEligibility(match);
    if (!eligibility.eligible) {
      setError(eligibility.reason || 'Not eligible');
      setState('not_eligible');
    } else {
      setState('idle');
    }
  }, [match]);

  // Handle submit - calls Cloud Function
  const handleSubmit = async () => {
    if (!userProfile) {
      setError('You must be logged in');
      setState('error');
      return;
    }

    setState('loading');
    setError(null);

    try {
      const submitMatches = httpsCallable<
        { eventType: string; eventId: string; matchIds: string[] },
        SubmitMatchesResponse
      >(functions, 'dupr_submitMatches');

      const result = await submitMatches({
        eventType,
        eventId,
        matchIds: [match.id],
      });

      if (result.data.success && result.data.batchId) {
        setState('queued');
        setBatchId(result.data.batchId);
        onQueued?.(result.data.batchId);
      } else {
        setError(result.data.message || 'Submission failed');
        setState('error');
        onError?.(result.data.message || 'Submission failed');
      }
    } catch (err: any) {
      console.error('[DuprSubmitButton] Error:', err);
      const errorMessage = err.message || 'Failed to queue submission';
      setError(errorMessage);
      setState('error');
      onError?.(errorMessage);
    }
  };

  // Already submitted state
  if (state === 'submitted' || (match as any).dupr?.submitted || (match as LeagueMatch).duprSubmitted) {
    const duprMatchId = (match as any).dupr?.submissionId || (match as LeagueMatch).duprMatchId;
    return (
      <div className={`flex items-center gap-1 text-green-400 ${className}`}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <span className={compact ? 'text-xs' : 'text-sm'}>
          {compact ? 'DUPR ✓' : 'Submitted to DUPR'}
        </span>
        {duprMatchId && !compact && (
          <span className="text-xs text-gray-500 ml-1">#{duprMatchId}</span>
        )}
      </div>
    );
  }

  // Queued/Pending state
  if (state === 'queued' || (match as any).dupr?.pendingSubmission) {
    return (
      <div className={`flex items-center gap-1 text-amber-400 ${className}`}>
        <svg className="animate-pulse w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className={compact ? 'text-xs' : 'text-sm'}>
          {compact ? 'Queued' : 'Queued for DUPR'}
        </span>
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
        {state === 'loading' ? 'Queuing...' : 'Checking...'}
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
      title={canSubmit ? 'Queue for DUPR submission' : 'Sign in to submit to DUPR'}
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
