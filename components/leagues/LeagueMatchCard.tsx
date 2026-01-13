/**
 * LeagueMatchCard Component V07.45
 *
 * Displays a league match with status, scores, and action buttons.
 * Now includes verification badges, confirm/dispute actions, and DUPR submission.
 *
 * V07.45: Added playerNameLookup prop to resolve "Unknown" names for substitutes
 * V07.35: Compact view shows inline "Enter Score" / "Acknowledge" buttons
 *
 * FILE LOCATION: components/leagues/LeagueMatchCard.tsx
 * VERSION: V07.45
 */

import React from 'react';
import type { LeagueMatch, GameScore, ScoreVerificationSettings } from '../../types';
import {
  ScoreVerificationBadge,
  ScoreVerificationIcon,
} from './verification';
import { DuprSubmitButton } from '../shared/DuprSubmitButton';
import { formatTimestamp } from '../../utils/timeFormat';

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
  // V07.29: Week lock - prevents players from scoring when week is locked
  weekLocked?: boolean;
  // V07.45: Name lookup for substitutes not in member list
  playerNameLookup?: Map<string, string>;
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

// V07.26: Format actual game scores for display (e.g., "13-15" or "11-9, 9-11, 11-7")
const formatActualScores = (scores: GameScore[]): string => {
  if (!scores || scores.length === 0) return '';
  return scores.map(s => `${s.scoreA ?? 0}-${s.scoreB ?? 0}`).join(', ');
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

// Use formatTimestamp from utils/timeFormat (wrapper for null handling)
const formatTime = (timestamp: number | null | undefined): string => {
  if (!timestamp) return '';
  return formatTimestamp(timestamp);
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
  weekLocked = false,
  playerNameLookup,  // V07.45: Name lookup for substitutes
}) => {
  // Calculate game scores
  const { gamesA, gamesB } = match.scores?.length > 0
    ? calculateGameScores(match.scores)
    : { gamesA: 0, gamesB: 0 };

  // V07.30: Get team names - prefer sideA/sideB.name (full team name) over memberAName/memberBName
  // V07.26: Fixed self-referential bug, added box league support with playerNames fallback
  // V07.45: Use playerNameLookup to resolve "Unknown" names for substitutes
  const resolvePlayerNames = (playerIds?: string[], storedNames?: string[]): string[] | null => {
    if (!playerIds?.length) return storedNames || null;
    if (!playerNameLookup) return storedNames || null;

    return playerIds.map((id, idx) => {
      const storedName = storedNames?.[idx];
      if (storedName && storedName !== 'Unknown' && storedName !== 'Unknown Player') {
        return storedName;
      }
      return playerNameLookup.get(id) || storedName || 'Unknown';
    });
  };

  // Note: LeagueMatch type doesn't have playerNames on sideA/sideB, but we use type assertion
  // to handle the general Match interface which may have them
  const teamAPlayerNames = resolvePlayerNames(
    match.sideA?.playerIds,
    (match.sideA as any)?.playerNames
  );
  const teamBPlayerNames = resolvePlayerNames(
    match.sideB?.playerIds,
    (match.sideB as any)?.playerNames
  );

  // V07.45: Check if stored name contains "Unknown" - if so, try to resolve using playerIds
  const storedNameHasUnknown = (name?: string) => name?.includes('Unknown');

  const teamAName = (match.sideA?.name && !storedNameHasUnknown(match.sideA.name))
    ? match.sideA.name
    : (teamAPlayerNames?.length ? teamAPlayerNames.join(' & ') : null) ||
      match.sideA?.name ||
      match.memberAName || 'Unknown';
  const teamBName = (match.sideB?.name && !storedNameHasUnknown(match.sideB.name))
    ? match.sideB.name
    : (teamBPlayerNames?.length ? teamBPlayerNames.join(' & ') : null) ||
      match.sideB?.name ||
      match.memberBName || 'Unknown';

  // Determine if current user is a participant (check both primary and partner)
  // V07.35: Also check sideA/sideB.playerIds for box leagues
  const isPlayerA = currentUserId === match.userAId ||
    currentUserId === match.partnerAId ||
    (match.sideA?.playerIds?.includes(currentUserId || '') ?? false);
  const isPlayerB = currentUserId === match.userBId ||
    currentUserId === match.partnerBId ||
    (match.sideB?.playerIds?.includes(currentUserId || '') ?? false);
  const isParticipant = isPlayerA || isPlayerB;

  // Get verification status from match
  const verificationStatus = match.verification?.verificationStatus;
  const hasVerification = !!verificationStatus;
  const confirmations = match.verification?.confirmations || [];
  const requiredConfirmations = match.verification?.requiredConfirmations || 1;

  // V07.40: First compute who proposed - need this for all confirm/display logic
  const proposerId = match.scoreProposal?.enteredByUserId || match.submittedByUserId;
  const userProposed = proposerId === currentUserId;
  const partnerProposedA = isPlayerA && proposerId && (
    match.sideA?.playerIds?.includes(proposerId) ||
    proposerId === match.partnerAId
  ) && proposerId !== currentUserId;
  const partnerProposedB = isPlayerB && proposerId && (
    match.sideB?.playerIds?.includes(proposerId) ||
    proposerId === match.partnerBId
  ) && proposerId !== currentUserId;
  const partnerProposed = partnerProposedA || partnerProposedB;
  const teamProposed = userProposed || partnerProposed;

  // Determine if user can confirm (has not already confirmed and is on OPPOSING team)
  // V07.29: Cannot confirm when week is locked (unless organizer)
  // V07.40: User can only confirm if OPPONENT proposed (not user or their partner)
  const hasAlreadyConfirmed = currentUserId ? confirmations.includes(currentUserId) : false;
  const isOpponent = isParticipant && !teamProposed; // User is opponent if their team didn't propose
  const canConfirm = isOpponent &&
    !hasAlreadyConfirmed &&
    verificationStatus === 'pending' &&
    verificationSettings?.verificationMethod !== 'auto_confirm' &&
    (!weekLocked || isOrganizer);

  // Determine if user can dispute
  // V07.29: Cannot dispute when week is locked (unless organizer)
  const canDispute = isParticipant &&
    verificationStatus === 'pending' &&
    verificationSettings?.allowDisputes !== false &&
    (!weekLocked || isOrganizer);

  // Determine if user needs to take action
  const isPendingConfirmation = match.status === 'pending_confirmation' || verificationStatus === 'pending';
  const isWaitingOnYou = isPendingConfirmation && isOpponent;

  // V07.35: Check scoreState for more precise status messages
  const scoreState = match.scoreState;
  const isProposed = scoreState === 'proposed';
  const isSigned = scoreState === 'signed';
  const isOfficial = scoreState === 'official' || scoreState === 'submittedToDupr';

  // V07.35: Determine if current user needs to confirm (opponent entered score, user hasn't confirmed)
  // V07.40: User can only confirm if:
  // 1. Score is in 'proposed' state (NOT already signed or official)
  // 2. User is a participant
  // 3. Opponent's team proposed (not user's team)
  const userNeedsToConfirm = isProposed && // Must be in proposed state, not signed
    !isSigned && // Not already signed
    isParticipant &&
    !teamProposed && // Opponent must have proposed
    !hasAlreadyConfirmed &&
    (!weekLocked || isOrganizer);

  // Can enter/edit score (participants and organizers)
  // V07.29: Players cannot score when week is locked (organizers can still score)
  const canEnterScore = (isParticipant || isOrganizer) &&
    (match.status === 'scheduled' || match.status === 'pending_confirmation' || match.status === 'disputed') &&
    (!weekLocked || isOrganizer);

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
            {teamAName}
            {playerAWon && ' ✓'}
          </div>

          {/* Score or Action - V07.35: Show Enter Score / Acknowledge buttons for participants */}
          <div className="text-center min-w-[100px] flex flex-col items-center justify-center gap-0.5">
            {match.status === 'completed' && verificationStatus !== 'pending' ? (
              // Completed match - show score
              <>
                <span className="font-bold text-white text-sm">{formatActualScores(match.scores || [])}</span>
                {hasVerification && <ScoreVerificationIcon status={verificationStatus!} size="sm" />}
              </>
            ) : userNeedsToConfirm ? (
              // Opponent proposed, user needs to confirm - show score AND button
              <>
                <span className="font-bold text-white text-sm">{formatActualScores(match.scores || [])}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEnterScore?.(match);
                  }}
                  className="px-2 py-1 bg-yellow-600 hover:bg-yellow-500 text-white text-[10px] font-semibold rounded transition-colors"
                >
                  Confirm
                </button>
              </>
            ) : isSigned ? (
              // Score signed by opponent - waiting for organizer to finalize
              <>
                <span className="font-bold text-white text-sm">{formatActualScores(match.scores || [])}</span>
                <span className="text-[10px] text-blue-400">Awaiting organizer</span>
              </>
            ) : match.status === 'pending_confirmation' || verificationStatus === 'pending' || isProposed ? (
              // Has score but pending confirmation - show score with status text
              <>
                <span className="font-bold text-white text-sm">{formatActualScores(match.scores || [])}</span>
                <span className={`text-[10px] ${
                  teamProposed ? 'text-blue-400' :
                  isParticipant ? 'text-yellow-400' : 'text-gray-400'
                }`}>
                  {userProposed ? 'You proposed' :
                   partnerProposed ? 'Partner proposed' :
                   isParticipant ? 'Awaiting your confirmation' : 'Score proposed'}
                </span>
              </>
            ) : isParticipant && match.status === 'scheduled' && !weekLocked ? (
              // Participant can enter score
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEnterScore?.(match);
                }}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Enter Score
              </button>
            ) : (
              // Default - show vs
              <span className="text-xs text-gray-500">vs</span>
            )}
          </div>

          {/* Player B */}
          <div className={`flex-1 text-sm text-right truncate ${
            playerBWon ? 'text-green-400 font-semibold' : 
            isPlayerB ? 'text-blue-400' : 'text-white'
          }`}>
            {playerBWon && '✓ '}
            {teamBName}
          </div>
        </div>

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
              {teamAName}
              {playerAWon && <span className="ml-2">✓</span>}
            </div>
            {isPlayerA && (
              <div className="text-xs text-blue-400">(You)</div>
            )}
            {match.memberARankAtMatch && (
              <div className="text-xs text-gray-500">Rank #{match.memberARankAtMatch}</div>
            )}
          </div>

          {/* Score Display - V07.26: Show actual game scores as main display */}
          <div className="px-6 text-center">
            {match.status === 'completed' || match.status === 'pending_confirmation' ? (
              <div>
                {/* V07.26: Show actual scores (e.g., "13-15") instead of game wins */}
                <div className="text-2xl font-bold text-white">
                  {match.scores && match.scores.length > 0 ? (
                    match.scores.map((s, i) => (
                      <span key={i} className="inline-block">
                        <span className={(s.scoreA ?? 0) > (s.scoreB ?? 0) ? 'text-green-400' : ''}>
                          {s.scoreA ?? 0}
                        </span>
                        <span className="text-gray-500">-</span>
                        <span className={(s.scoreB ?? 0) > (s.scoreA ?? 0) ? 'text-green-400' : ''}>
                          {s.scoreB ?? 0}
                        </span>
                        {i < (match.scores?.length || 0) - 1 && (
                          <span className="text-gray-600 mx-2">,</span>
                        )}
                      </span>
                    ))
                  ) : (
                    <>
                      <span className={playerAWon ? 'text-green-400' : ''}>{gamesA}</span>
                      <span className="text-gray-500 mx-2">-</span>
                      <span className={playerBWon ? 'text-green-400' : ''}>{gamesB}</span>
                    </>
                  )}
                </div>
                {/* Show game win count for best of 3/5 */}
                {match.scores && match.scores.length > 1 && (
                  <div className="mt-1 text-xs text-gray-500">
                    Games: {gamesA} - {gamesB}
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
              {teamBName}
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