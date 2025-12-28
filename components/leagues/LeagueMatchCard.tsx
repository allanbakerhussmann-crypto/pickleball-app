/**
 * LeagueMatchCard Component V06.15
 *
 * Displays a league match with status, scores, and action buttons.
 * Now includes verification badges, confirm/dispute actions, and DUPR submission.
 *
 * FILE LOCATION: components/leagues/LeagueMatchCard.tsx
 * VERSION: V06.15 - Added DUPR submit button integration
 */

import React from 'react';
import type { LeagueMatch, GameScore, ScoreVerificationSettings } from '../../types';
import {
  ScoreVerificationBadge,
  ScoreVerificationIcon,
} from './verification';
import { DuprSubmitButton } from '../shared/DuprSubmitButton';

// ============================================
// TYPES
// ============================================

interface LeagueMatchCardProps {
  match: LeagueMatch;
  currentUserId?: string;
  isOrganizer?: boolean;
  onEnterScore?: (match: LeagueMatch) => void;
  onViewDetails?: (match: LeagueMatch) => void;
  onConfirmScore?: (match: LeagueMatch) => void;
  onDisputeScore?: (match: LeagueMatch) => void;
  showWeek?: boolean;
  showRound?: boolean;
  compact?: boolean;
  verificationSettings?: ScoreVerificationSettings;
  // DUPR integration props
  leagueId?: string;
  duprClubId?: string;
  leagueName?: string;
  onDuprSubmit?: (match: LeagueMatch, duprMatchId: string) => void;
  showDuprButton?: boolean;
}

// ============================================
// HELPERS
// ============================================

const calculateGameScores = (scores: GameScore[]): { gamesA: number; gamesB: number } => {
  let gamesA = 0;
  let gamesB = 0;

  for (const score of scores) {
    const a = score.scoreA ?? 0;
    const b = score.scoreB ?? 0;
    if (a > b) gamesA++;
    else if (b > a) gamesB++;
  }

  return { gamesA, gamesB };
};

const formatDate = (timestamp: number | null | undefined): string => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-NZ', { 
    weekday: 'short',
    month: 'short', 
    day: 'numeric',
  });
};

const formatTime = (timestamp: number | null | undefined): string => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-NZ', { 
    hour: 'numeric',
    minute: '2-digit',
  });
};

const getStatusBadge = (status: string): { label: string; className: string } => {
  switch (status) {
    case 'scheduled':
      return { label: 'Scheduled', className: 'bg-blue-600/20 text-blue-400 border-blue-600/30' };
    case 'pending_confirmation':
      return { label: 'Awaiting Confirmation', className: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30' };
    case 'completed':
      return { label: 'Completed', className: 'bg-green-600/20 text-green-400 border-green-600/30' };
    case 'disputed':
      return { label: 'Disputed', className: 'bg-red-600/20 text-red-400 border-red-600/30' };
    case 'cancelled':
      return { label: 'Cancelled', className: 'bg-gray-600/20 text-gray-400 border-gray-600/30' };
    case 'forfeit':
      return { label: 'Forfeit', className: 'bg-orange-600/20 text-orange-400 border-orange-600/30' };
    case 'no_show':
      return { label: 'No Show', className: 'bg-red-600/20 text-red-400 border-red-600/30' };
    default:
      return { label: status, className: 'bg-gray-600/20 text-gray-400 border-gray-600/30' };
  }
};

const getMatchTypeLabel = (matchType: string): string => {
  switch (matchType) {
    case 'regular': return 'Regular';
    case 'challenge': return 'Challenge';
    case 'playoff': return 'Playoff';
    case 'box': return 'Box Match';
    default: return matchType;
  }
};

// ============================================
// COMPONENT
// ============================================

export const LeagueMatchCard: React.FC<LeagueMatchCardProps> = ({
  match,
  currentUserId,
  isOrganizer = false,
  onEnterScore,
  onViewDetails,
  onConfirmScore,
  onDisputeScore,
  showWeek = false,
  showRound = false,
  compact = false,
  verificationSettings,
  leagueId,
  duprClubId,
  leagueName,
  onDuprSubmit,
  showDuprButton = true,
}) => {
  // Calculate game scores
  const { gamesA, gamesB } = match.scores?.length > 0
    ? calculateGameScores(match.scores)
    : { gamesA: 0, gamesB: 0 };

  // Determine if current user is a participant
  const isPlayerA = currentUserId === match.userAId;
  const isPlayerB = currentUserId === match.userBId;
  const isParticipant = isPlayerA || isPlayerB;

  // Get verification status from match
  const verificationStatus = match.verification?.verificationStatus;
  const hasVerification = !!verificationStatus;
  const confirmations = match.verification?.confirmations || [];
  const requiredConfirmations = match.verification?.requiredConfirmations || 1;

  // Determine if user can confirm (has not already confirmed and is opponent)
  const hasAlreadyConfirmed = currentUserId ? confirmations.includes(currentUserId) : false;
  const isOpponent = isParticipant && match.submittedByUserId !== currentUserId;
  const canConfirm = isOpponent &&
    !hasAlreadyConfirmed &&
    verificationStatus === 'pending' &&
    verificationSettings?.verificationMethod !== 'auto_confirm';

  // Determine if user can dispute
  const canDispute = isParticipant &&
    verificationStatus === 'pending' &&
    verificationSettings?.allowDisputes !== false;

  // Determine if user needs to take action
  const isPendingConfirmation = match.status === 'pending_confirmation' || verificationStatus === 'pending';
  const isWaitingOnYou = isPendingConfirmation &&
    match.submittedByUserId !== currentUserId &&
    isParticipant;

  // Can enter/edit score (participants and organizers)
  const canEnterScore = (isParticipant || isOrganizer) &&
    (match.status === 'scheduled' || match.status === 'pending_confirmation' || match.status === 'disputed');

  // Status badge (use verification status if available)
  const statusBadge = getStatusBadge(match.status);

  // Winner highlight
  const playerAWon = match.winnerMemberId === match.memberAId;
  const playerBWon = match.winnerMemberId === match.memberBId;

  if (compact) {
    // Compact view for lists
    return (
      <div 
        className={`bg-gray-800 rounded-lg p-3 border transition-all cursor-pointer hover:border-gray-600 ${
          isWaitingOnYou ? 'border-yellow-500/50 bg-yellow-900/10' : 'border-gray-700'
        }`}
        onClick={() => onViewDetails?.(match)}
      >
        <div className="flex items-center justify-between gap-4">
          {/* Player A */}
          <div className={`flex-1 text-sm truncate ${
            playerAWon ? 'text-green-400 font-semibold' : 
            isPlayerA ? 'text-blue-400' : 'text-white'
          }`}>
            {match.memberAName}
            {playerAWon && ' ✓'}
          </div>

          {/* Score or Status */}
          <div className="text-center min-w-[60px] flex items-center justify-center gap-1">
            {match.status === 'completed' || match.status === 'pending_confirmation' || hasVerification ? (
              <>
                <span className="font-bold text-white">{gamesA} - {gamesB}</span>
                {hasVerification && <ScoreVerificationIcon status={verificationStatus!} size="sm" />}
              </>
            ) : (
              <span className="text-xs text-gray-500">vs</span>
            )}
          </div>

          {/* Player B */}
          <div className={`flex-1 text-sm text-right truncate ${
            playerBWon ? 'text-green-400 font-semibold' : 
            isPlayerB ? 'text-blue-400' : 'text-white'
          }`}>
            {playerBWon && '✓ '}
            {match.memberBName}
          </div>
        </div>

        {/* Action indicator */}
        {isWaitingOnYou && (
          <div className="mt-2 text-xs text-yellow-400 text-center">
            ⚠️ Action required
          </div>
        )}
      </div>
    );
  }

  // Full card view
  return (
    <div 
      className={`bg-gray-800 rounded-xl border overflow-hidden transition-all ${
        isWaitingOnYou ? 'border-yellow-500/50 ring-1 ring-yellow-500/20' : 'border-gray-700'
      }`}
    >
      {/* Header */}
      <div className="bg-gray-900/50 px-4 py-2 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Match type */}
          {match.matchType && match.matchType !== 'regular' && (
            <span className="text-xs bg-purple-600/20 text-purple-400 px-2 py-0.5 rounded">
              {getMatchTypeLabel(match.matchType)}
            </span>
          )}
          
          {/* Week/Round */}
          {showWeek && match.weekNumber && (
            <span className="text-xs text-gray-500">Week {match.weekNumber}</span>
          )}
          {showRound && match.roundNumber && (
            <span className="text-xs text-gray-500">Round {match.roundNumber}</span>
          )}
          {match.boxNumber && (
            <span className="text-xs text-gray-500">Box {match.boxNumber}</span>
          )}
        </div>
        
        {/* Status Badge - Use verification badge when available */}
        {hasVerification ? (
          <ScoreVerificationBadge
            status={verificationStatus!}
            confirmationCount={confirmations.length}
            requiredConfirmations={requiredConfirmations}
            size="sm"
          />
        ) : (
          <span className={`text-xs px-2 py-0.5 rounded border ${statusBadge.className}`}>
            {statusBadge.label}
          </span>
        )}
      </div>

      {/* Match Content */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          {/* Player A */}
          <div className="flex-1">
            <div className={`font-semibold text-lg ${
              playerAWon ? 'text-green-400' : 
              isPlayerA ? 'text-blue-400' : 'text-white'
            }`}>
              {match.memberAName}
              {playerAWon && <span className="ml-2">✓</span>}
            </div>
            {isPlayerA && (
              <div className="text-xs text-blue-400">(You)</div>
            )}
            {match.memberARankAtMatch && (
              <div className="text-xs text-gray-500">Rank #{match.memberARankAtMatch}</div>
            )}
          </div>

          {/* Score Display */}
          <div className="px-6 text-center">
            {match.status === 'completed' || match.status === 'pending_confirmation' ? (
              <div>
                <div className="text-3xl font-bold text-white">
                  <span className={playerAWon ? 'text-green-400' : ''}>{gamesA}</span>
                  <span className="text-gray-500 mx-2">-</span>
                  <span className={playerBWon ? 'text-green-400' : ''}>{gamesB}</span>
                </div>
                {/* Individual game scores */}
                {match.scores && match.scores.length > 0 && (
                  <div className="mt-1 text-xs text-gray-500">
                    {match.scores.map((s, i) => (
                      <span key={i} className="mr-2">
                        {s.scoreA}-{s.scoreB}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-gray-500 text-2xl font-light">vs</div>
            )}
          </div>

          {/* Player B */}
          <div className="flex-1 text-right">
            <div className={`font-semibold text-lg ${
              playerBWon ? 'text-green-400' : 
              isPlayerB ? 'text-blue-400' : 'text-white'
            }`}>
              {playerBWon && <span className="mr-2">✓</span>}
              {match.memberBName}
            </div>
            {isPlayerB && (
              <div className="text-xs text-blue-400">(You)</div>
            )}
            {match.memberBRankAtMatch && (
              <div className="text-xs text-gray-500">Rank #{match.memberBRankAtMatch}</div>
            )}
          </div>
        </div>

        {/* Match Details */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
          <div className="flex items-center gap-3">
            {/* Date/Time */}
            {match.scheduledDate && (
              <span>📅 {formatDate(match.scheduledDate)}</span>
            )}
            {match.scheduledDate && (
              <span>🕐 {formatTime(match.scheduledDate)}</span>
            )}
            {/* Venue */}
            {match.venue && (
              <span>📍 {match.venue}</span>
            )}
            {/* Court */}
            {match.court && (
              <span>🏓 {match.court}</span>
            )}
          </div>

          {/* Deadline */}
          {match.deadline && match.status === 'scheduled' && (
            <span className={`${
              match.deadline < Date.now() ? 'text-red-400' : 
              match.deadline < Date.now() + 2 * 24 * 60 * 60 * 1000 ? 'text-yellow-400' : ''
            }`}>
              ⏰ Due: {formatDate(match.deadline)}
            </span>
          )}
        </div>

        {/* Dispute reason - from match or verification data */}
        {(match.status === 'disputed' || verificationStatus === 'disputed') && (
          <div className="mt-3 p-2 bg-red-900/20 border border-red-700 rounded text-sm text-red-300">
            <span className="font-semibold">Dispute reason:</span>{' '}
            {match.verification?.disputeReason || match.disputeReason || 'No reason provided'}
            {match.verification?.disputeNotes && (
              <div className="mt-1 text-xs text-red-400">
                {match.verification.disputeNotes}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Footer */}
      {(canEnterScore || isWaitingOnYou || canConfirm || canDispute) && (
        <div className="bg-gray-900/50 px-4 py-3 border-t border-gray-700">
          {/* Verification actions - separate confirm/dispute buttons */}
          {canConfirm && onConfirmScore && onDisputeScore ? (
            <div className="flex gap-2">
              <button
                onClick={() => onConfirmScore(match)}
                className="flex-1 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-semibold transition-colors"
              >
                Confirm Score
              </button>
              {canDispute && (
                <button
                  onClick={() => onDisputeScore(match)}
                  className="px-4 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg font-semibold transition-colors border border-red-600/30"
                >
                  Dispute
                </button>
              )}
            </div>
          ) : isWaitingOnYou && onEnterScore ? (
            <button
              onClick={() => onEnterScore(match)}
              className="w-full py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg font-semibold transition-colors"
            >
              Confirm or Dispute Score
            </button>
          ) : match.status === 'scheduled' && onEnterScore ? (
            <button
              onClick={() => onEnterScore(match)}
              className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-colors"
            >
              Enter Score
            </button>
          ) : (match.status === 'disputed' || verificationStatus === 'disputed') && onEnterScore ? (
            <button
              onClick={() => onEnterScore(match)}
              className="w-full py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg font-semibold transition-colors"
            >
              Re-enter Score
            </button>
          ) : null}
        </div>
      )}

      {/* Completed/Finalized timestamp and DUPR submission */}
      {(match.status === 'completed' || verificationStatus === 'final') && (match.completedAt || match.verification?.finalizedAt) && (
        <div className="bg-gray-900/30 px-4 py-2 border-t border-gray-700 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {match.verification?.autoFinalized
              ? `Auto-finalized ${formatDate(match.verification.finalizedAt!)}`
              : `Finalized ${formatDate(match.verification?.finalizedAt || match.completedAt!)}`
            }
          </span>

          {/* DUPR Submit Button */}
          {showDuprButton && (
            <DuprSubmitButton
              match={match}
              leagueId={leagueId}
              eventName={leagueName}
              clubId={duprClubId}
              compact
              onSubmitted={(duprMatchId) => onDuprSubmit?.(match, duprMatchId)}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default LeagueMatchCard;