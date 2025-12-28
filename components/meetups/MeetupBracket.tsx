/**
 * MeetupBracket Component
 *
 * Displays an elimination bracket for single/double elimination meetups.
 * Shows matches organized by round with visual connectors.
 *
 * FILE LOCATION: components/meetups/MeetupBracket.tsx
 * VERSION: V06.16
 */

import React, { useMemo } from 'react';
import type { MeetupMatch } from '../../services/firebase/meetupMatches';

// ============================================
// TYPES
// ============================================

interface MeetupBracketProps {
  matches: MeetupMatch[];
  onMatchClick?: (match: MeetupMatch) => void;
  isOrganizer?: boolean;
}

interface BracketRound {
  round: number;
  name: string;
  matches: MeetupMatch[];
}

// ============================================
// HELPERS
// ============================================

function getRoundName(roundNumber: number, totalRounds: number): string {
  const roundsFromEnd = totalRounds - roundNumber;

  switch (roundsFromEnd) {
    case 0:
      return 'Finals';
    case 1:
      return 'Semi-Finals';
    case 2:
      return 'Quarter-Finals';
    default:
      return `Round ${roundNumber}`;
  }
}

// ============================================
// COMPONENT
// ============================================

export const MeetupBracket: React.FC<MeetupBracketProps> = ({
  matches,
  onMatchClick,
  isOrganizer = false,
}) => {
  // Organize matches by round
  const rounds = useMemo(() => {
    const roundMap = new Map<number, MeetupMatch[]>();
    let maxRound = 0;

    matches.forEach((match) => {
      const round = match.round || 1;
      if (!roundMap.has(round)) {
        roundMap.set(round, []);
      }
      roundMap.get(round)!.push(match);
      maxRound = Math.max(maxRound, round);
    });

    // Sort matches in each round by creation order
    roundMap.forEach((roundMatches) => {
      roundMatches.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    });

    const result: BracketRound[] = [];
    for (let r = 1; r <= maxRound; r++) {
      result.push({
        round: r,
        name: getRoundName(r, maxRound),
        matches: roundMap.get(r) || [],
      });
    }

    return result;
  }, [matches]);

  const totalRounds = rounds.length;

  if (matches.length === 0) {
    return (
      <div className="text-center py-8 bg-gray-800/50 rounded-lg">
        <p className="text-gray-400">No bracket generated yet</p>
        {isOrganizer && (
          <p className="text-gray-500 text-sm mt-1">
            Click "Generate Bracket" to create the elimination bracket
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-4 min-w-max">
        {rounds.map((round, roundIndex) => (
          <div key={round.round} className="flex flex-col">
            {/* Round Header */}
            <div className="text-center mb-3">
              <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider">
                {round.name}
              </h4>
              <p className="text-xs text-gray-600">
                {round.matches.length} match{round.matches.length !== 1 ? 'es' : ''}
              </p>
            </div>

            {/* Matches */}
            <div
              className="flex flex-col gap-4"
              style={{
                justifyContent: 'space-around',
                minHeight: `${Math.pow(2, totalRounds - roundIndex) * 60}px`,
              }}
            >
              {round.matches.map((match) => (
                <BracketMatch
                  key={match.id}
                  match={match}
                  onClick={onMatchClick}
                  isOrganizer={isOrganizer}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================
// BRACKET MATCH COMPONENT
// ============================================

interface BracketMatchProps {
  match: MeetupMatch;
  onClick?: (match: MeetupMatch) => void;
  isOrganizer?: boolean;
}

const BracketMatch: React.FC<BracketMatchProps> = ({
  match,
  onClick,
  isOrganizer = false,
}) => {
  const isBye = match.player1Id === 'BYE' || match.player2Id === 'BYE';
  const isTbd = match.player1Id === 'TBD' || match.player2Id === 'TBD';
  const isCompleted = match.status === 'completed';
  const canClick = !isBye && !isTbd && (isOrganizer || !isCompleted);

  const getPlayerClass = (playerId: string, isWinner: boolean) => {
    if (playerId === 'BYE') return 'text-gray-600 italic';
    if (playerId === 'TBD') return 'text-gray-500 italic';
    if (isWinner) return 'text-green-400 font-semibold';
    if (isCompleted && !isWinner) return 'text-gray-500';
    return 'text-white';
  };

  const getScore = (playerNum: 1 | 2): string => {
    if (!match.games || match.games.length === 0) return '';
    return match.games.map((g) => (playerNum === 1 ? g.player1 : g.player2)).join(', ');
  };

  return (
    <div
      onClick={() => canClick && onClick?.(match)}
      className={`w-48 bg-gray-800 border rounded-lg overflow-hidden transition-all ${
        isCompleted
          ? 'border-green-600/30'
          : isBye || isTbd
          ? 'border-gray-700/50'
          : 'border-gray-700 hover:border-gray-500 cursor-pointer'
      }`}
    >
      {/* Player 1 */}
      <div
        className={`flex items-center justify-between px-3 py-2 ${
          match.winnerId === match.player1Id ? 'bg-green-900/20' : ''
        }`}
      >
        <span
          className={`text-sm truncate flex-1 ${getPlayerClass(
            match.player1Id,
            match.winnerId === match.player1Id
          )}`}
        >
          {match.player1Name}
          {match.winnerId === match.player1Id && ' 🏆'}
        </span>
        {isCompleted && (
          <span className="text-xs text-gray-400 ml-2 font-mono">{getScore(1)}</span>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-gray-700" />

      {/* Player 2 */}
      <div
        className={`flex items-center justify-between px-3 py-2 ${
          match.winnerId === match.player2Id ? 'bg-green-900/20' : ''
        }`}
      >
        <span
          className={`text-sm truncate flex-1 ${getPlayerClass(
            match.player2Id,
            match.winnerId === match.player2Id
          )}`}
        >
          {match.player2Name}
          {match.winnerId === match.player2Id && ' 🏆'}
        </span>
        {isCompleted && (
          <span className="text-xs text-gray-400 ml-2 font-mono">{getScore(2)}</span>
        )}
      </div>

      {/* Status indicator */}
      {!isBye && !isTbd && !isCompleted && (
        <div className="bg-gray-900 px-3 py-1 text-center">
          <span className="text-xs text-gray-500">
            {match.status === 'pending_confirmation' ? 'Awaiting confirm' : 'Tap to enter score'}
          </span>
        </div>
      )}
    </div>
  );
};

export default MeetupBracket;
