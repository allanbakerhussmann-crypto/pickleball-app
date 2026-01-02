/**
 * BracketViewer Component
 *
 * Visual tournament bracket with tree structure, connecting lines,
 * and inline score entry. Shows full bracket path including future rounds.
 *
 * Features:
 * - Tree structure with SVG connector lines
 * - Dynamic round names (QF, SF, Final) based on bracket size
 * - TBD placeholders for undetermined matchups
 * - Inline score entry boxes
 * - Winner advancement visualization
 * - Bronze match section
 * - V06.42: Multi-game score entry modal for Best of 3/5 matches
 * - V06.43: Added score validation for inline editing (win by 2, points to win)
 * - V06.45: Show all game scores for multi-game matches (games won + individual scores)
 *
 * @version 06.45
 * @file components/BracketViewer.tsx
 */

import React, { useState } from 'react';
import { MatchDisplay } from './MatchCard';
import { useAuth } from '../contexts/AuthContext';
import { ScoreEntryModal } from './shared/ScoreEntryModal';
import type { GameScore } from '../types/game/match';
import type { GameSettings } from '../types/game/gameSettings';
import { validateGameScore } from '../services/game/scoreValidation';

interface BracketViewerProps {
  matches: MatchDisplay[];
  onUpdateScore: (matchId: string, score1: number, score2: number, action: 'submit' | 'confirm' | 'dispute', reason?: string) => void;
  // V06.42: New callback for multi-game matches (Best of 3/5)
  onUpdateMultiGameScore?: (matchId: string, scores: GameScore[], winnerId: string) => Promise<void>;
  isVerified: boolean;
  bracketTitle?: string;
  bracketType?: 'main' | 'plate' | 'consolation';
  finalsLabel?: string;
  isOrganizer?: boolean;  // V06.22: Allow organizers to edit any match
}

// Compact match card for bracket display
interface BracketMatchCardProps {
  match: MatchDisplay | null;
  matchLabel?: string;
  onUpdateScore: (matchId: string, score1: number, score2: number, action: 'submit' | 'confirm' | 'dispute', reason?: string) => void;
  // V06.42: Open modal for multi-game matches (Best of 3/5)
  onOpenScoreModal?: (match: MatchDisplay) => void;
  isVerified: boolean;
  canEdit: boolean;
  isChampionship?: boolean;
  isBronze?: boolean;
}

// V06.45: Helper function to calculate games won for multi-game matches
const formatBracketScores = (match: MatchDisplay | null, isTeam1: boolean): string => {
  if (!match) return '-';

  // If multi-game match with scores array
  if (match.scores && match.scores.length > 0) {
    let gamesWon = 0;
    for (const game of match.scores) {
      const teamScore = isTeam1 ? game.scoreA : game.scoreB;
      const oppScore = isTeam1 ? game.scoreB : game.scoreA;
      if (teamScore > oppScore) gamesWon++;
    }
    return String(gamesWon);
  }

  // Fallback to single score
  return String(isTeam1 ? (match.score1 ?? '-') : (match.score2 ?? '-'));
};

// V06.45: Format individual game scores for display/tooltip
const formatGameScores = (match: MatchDisplay | null): string => {
  if (!match?.scores || match.scores.length === 0) return '';
  return match.scores.map(g => `${g.scoreA}-${g.scoreB}`).join(', ');
};

const BracketMatchCard: React.FC<BracketMatchCardProps> = ({
  match,
  matchLabel,
  onUpdateScore,
  onOpenScoreModal,
  isVerified,
  canEdit,
  isChampionship,
  isBronze,
}) => {
  const [score1, setScore1] = useState<string>(match?.score1?.toString() ?? '');
  const [score2, setScore2] = useState<string>(match?.score2?.toString() ?? '');
  const [isEditing, setIsEditing] = useState(false);

  // Update local state when match changes
  React.useEffect(() => {
    setScore1(match?.score1?.toString() ?? '');
    setScore2(match?.score2?.toString() ?? '');
  }, [match?.score1, match?.score2]);

  const team1Name = match?.team1?.name || 'TBD';
  const team2Name = match?.team2?.name || 'TBD';
  const isTBD = team1Name === 'TBD' || team2Name === 'TBD';
  const isCompleted = match?.status === 'completed';

  // V06.45: For multi-game matches, determine winner by games won
  const isMultiGame = match?.scores && match.scores.length > 1;
  let team1Won = false;
  let team2Won = false;

  if (isCompleted && match?.scores && match.scores.length > 0) {
    let gamesA = 0, gamesB = 0;
    for (const game of match.scores) {
      if (game.scoreA > game.scoreB) gamesA++;
      else if (game.scoreB > game.scoreA) gamesB++;
    }
    team1Won = gamesA > gamesB;
    team2Won = gamesB > gamesA;
  } else {
    // Fallback to single score
    const score1Num = match?.score1 ?? 0;
    const score2Num = match?.score2 ?? 0;
    team1Won = isCompleted && score1Num > score2Num;
    team2Won = isCompleted && score2Num > score1Num;
  }

  const handleScoreSubmit = () => {
    if (!match || !isVerified || !canEdit) return;
    const s1 = parseInt(score1, 10);
    const s2 = parseInt(score2, 10);
    if (isNaN(s1) || isNaN(s2)) {
      alert('Please enter valid scores for both teams.');
      return;
    }

    // V06.43: Validate score against game rules (win by 2, points to win, etc.)
    const gameSettings: GameSettings = (match as any).gameSettings || {
      playType: 'doubles',
      bestOf: 1,
      pointsPerGame: 11,
      winBy: 2,
    };

    const validation = validateGameScore(s1, s2, gameSettings);
    if (!validation.valid) {
      alert(`Game 1 score invalid: ${validation.error}\n\nRules: First to ${gameSettings.pointsPerGame}, win by ${gameSettings.winBy}`);
      return;
    }

    onUpdateScore(match.id, s1, s2, 'submit');
    setIsEditing(false);
  };

  // Card styling
  const cardBorder = isChampionship
    ? 'border-yellow-500/50'
    : isBronze
      ? 'border-amber-600/50'
      : 'border-gray-600';

  const cardBg = isChampionship
    ? 'bg-gradient-to-r from-yellow-900/20 to-gray-800'
    : isBronze
      ? 'bg-gradient-to-r from-amber-900/20 to-gray-800'
      : 'bg-gray-800';

  return (
    <div className={`rounded-lg border ${cardBorder} ${cardBg} overflow-hidden shadow-lg`} style={{ width: '200px' }}>
      {/* Match Label */}
      {matchLabel && (
        <div className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 ${
          isChampionship ? 'bg-yellow-600/30 text-yellow-400' :
          isBronze ? 'bg-amber-600/30 text-amber-400' :
          'bg-gray-700/50 text-gray-400'
        }`}>
          {matchLabel}
        </div>
      )}

      {/* Team 1 */}
      <div className={`flex items-center justify-between px-2 py-1.5 border-b border-gray-700 ${
        team1Won ? 'bg-green-900/30' : ''
      }`}>
        <span className={`text-sm truncate flex-1 ${
          team1Won ? 'text-green-400 font-semibold' :
          isTBD && team1Name === 'TBD' ? 'text-gray-500 italic' : 'text-white'
        }`}>
          {team1Name}
        </span>
        {!isTBD && (
          isEditing ? (
            <input
              type="number"
              value={score1}
              onChange={(e) => setScore1(e.target.value)}
              className="w-10 h-6 text-center text-sm bg-gray-700 border border-gray-600 rounded text-white"
              min="0"
            />
          ) : (
            <span
              className={`w-8 h-6 flex items-center justify-center text-sm font-bold rounded ${
                team1Won ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'
              }`}
              title={formatGameScores(match)}
            >
              {formatBracketScores(match, true)}
            </span>
          )
        )}
      </div>

      {/* Team 2 */}
      <div className={`flex items-center justify-between px-2 py-1.5 ${
        team2Won ? 'bg-green-900/30' : ''
      }`}>
        <span className={`text-sm truncate flex-1 ${
          team2Won ? 'text-green-400 font-semibold' :
          isTBD && team2Name === 'TBD' ? 'text-gray-500 italic' : 'text-white'
        }`}>
          {team2Name}
        </span>
        {!isTBD && (
          isEditing ? (
            <input
              type="number"
              value={score2}
              onChange={(e) => setScore2(e.target.value)}
              className="w-10 h-6 text-center text-sm bg-gray-700 border border-gray-600 rounded text-white"
              min="0"
            />
          ) : (
            <span
              className={`w-8 h-6 flex items-center justify-center text-sm font-bold rounded ${
                team2Won ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'
              }`}
              title={formatGameScores(match)}
            >
              {formatBracketScores(match, false)}
            </span>
          )
        )}
      </div>

      {/* V06.45: Show individual game scores for multi-game matches */}
      {isMultiGame && isCompleted && match?.scores && (
        <div className="px-2 py-1 bg-gray-900/30 border-t border-gray-700 text-center">
          <span className="text-xs text-gray-400">
            {match.scores.map((g, i) => (
              <span key={i} className={i > 0 ? 'ml-2' : ''}>
                <span className={g.scoreA > g.scoreB ? 'text-green-400' : 'text-gray-500'}>{g.scoreA}</span>
                <span className="text-gray-600">-</span>
                <span className={g.scoreB > g.scoreA ? 'text-green-400' : 'text-gray-500'}>{g.scoreB}</span>
              </span>
            ))}
          </span>
        </div>
      )}

      {/* Edit/Submit Button */}
      {match && !isTBD && canEdit && isVerified && (
        <div className="px-2 py-1 bg-gray-900/50 border-t border-gray-700">
          {isEditing ? (
            <div className="flex gap-1">
              <button
                onClick={handleScoreSubmit}
                className="flex-1 text-xs py-1 bg-green-600 hover:bg-green-500 text-white rounded"
              >
                Save
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="flex-1 text-xs py-1 bg-gray-600 hover:bg-gray-500 text-white rounded"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                // V06.42: Use modal for Best of 3+ matches
                const bestOf = (match as any).gameSettings?.bestOf || 1;
                if (bestOf > 1 && onOpenScoreModal) {
                  onOpenScoreModal(match);
                } else {
                  setIsEditing(true);
                }
              }}
              className="w-full text-xs py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded"
            >
              {isCompleted ? 'Edit Score' : 'Enter Score'}
              {/* V06.42: Show Best of indicator for multi-game matches */}
              {(match as any).gameSettings?.bestOf && (match as any).gameSettings.bestOf > 1 && (
                <span className="ml-1 text-yellow-400">
                  (Bo{(match as any).gameSettings.bestOf})
                </span>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// Get round name based on position from final
function getRoundName(roundNumber: number, totalRounds: number): string {
  const fromFinal = totalRounds - roundNumber;
  switch (fromFinal) {
    case 0: return 'Final';
    case 1: return 'Semi-Finals';
    case 2: return 'Quarter-Finals';
    case 3: return 'Round of 16';
    case 4: return 'Round of 32';
    default: return `Round ${roundNumber}`;
  }
}

export const BracketViewer: React.FC<BracketViewerProps> = ({
  matches,
  onUpdateScore,
  onUpdateMultiGameScore,
  isVerified,
  bracketTitle,
  bracketType = 'main',
  finalsLabel,
  isOrganizer = false,
}) => {
  const { currentUser } = useAuth();

  // V06.42: Modal state for multi-game matches
  const [scoreModalMatch, setScoreModalMatch] = useState<MatchDisplay | null>(null);
  const [isScoreModalOpen, setIsScoreModalOpen] = useState(false);
  const [isSubmittingScore, setIsSubmittingScore] = useState(false);

  // Separate bronze matches from regular bracket
  const bronzeMatches = (matches || []).filter(m => (m as any).isThirdPlace === true);
  const regularMatches = (matches || []).filter(m => (m as any).isThirdPlace !== true);

  // Group matches by round
  const rounds: { [key: number]: MatchDisplay[] } = {};
  let maxRound = 0;

  regularMatches.forEach(m => {
    const round = (m as any).roundNumber || 1;
    if (!rounds[round]) rounds[round] = [];
    rounds[round].push(m);
    if (round > maxRound) maxRound = round;
  });

  // Sort matches within each round by bracketPosition or matchNumber
  Object.keys(rounds).forEach(roundKey => {
    rounds[Number(roundKey)].sort((a, b) => {
      const posA = (a as any).bracketPosition || (a as any).matchNumber || 0;
      const posB = (b as any).bracketPosition || (b as any).matchNumber || 0;
      return posA - posB;
    });
  });

  const roundKeys = Object.keys(rounds).map(Number).sort((a, b) => a - b);
  const totalRounds = maxRound;

  // Calculate dimensions
  const matchHeight = 76; // Height of each match card
  const matchWidth = 200;
  const roundGap = 60; // Horizontal gap between rounds (for connector lines)
  const connectorWidth = 40; // Width of connector line area

  // Check if user can edit a match
  const canEditMatch = (match: MatchDisplay) => {
    // V06.22: Organizers can edit any match
    if (isOrganizer) return true;
    if (!currentUser) return false;
    const inTeam1 = (match.team1?.players || []).some(p => p.name === currentUser.displayName);
    const inTeam2 = (match.team2?.players || []).some(p => p.name === currentUser.displayName);
    return inTeam1 || inTeam2;
  };

  // Title color based on bracket type
  const titleColor = bracketType === 'plate' ? 'text-amber-400' : 'text-green-400';
  const bronzeLabel = bracketType === 'plate' ? 'Plate 3rd Place' : 'Bronze Match';

  // If no matches, show placeholder
  if (regularMatches.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        {bracketTitle && (
          <h2 className={`text-lg font-bold mb-2 ${titleColor}`}>{bracketTitle}</h2>
        )}
        <p className="text-gray-400 text-sm italic">
          Bracket will be generated after pool stage completes.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto pb-4">
      {/* Bracket Title */}
      {bracketTitle && (
        <h2 className={`text-lg font-bold mb-4 ${titleColor}`}>
          {bracketTitle}
        </h2>
      )}

      {/* Main Bracket Container */}
      <div className="relative min-w-max">
        {/* Round Headers */}
        <div className="flex mb-2" style={{ gap: `${roundGap}px` }}>
          {roundKeys.map(roundNum => (
            <div
              key={`header-${roundNum}`}
              className="text-center text-gray-400 font-bold uppercase text-xs tracking-wider"
              style={{ width: `${matchWidth}px` }}
            >
              {roundNum === maxRound
                ? (finalsLabel || getRoundName(roundNum, totalRounds))
                : getRoundName(roundNum, totalRounds)
              }
            </div>
          ))}
        </div>

        {/* Bracket with Matches and Connectors */}
        <div className="flex items-start" style={{ gap: `${roundGap}px` }}>
          {roundKeys.map((roundNum, roundIndex) => {
            const matchesInRound = rounds[roundNum] || [];
            const matchCount = matchesInRound.length;

            // Calculate vertical spacing - doubles each round
            const spacingMultiplier = Math.pow(2, roundNum - 1);
            const verticalGap = matchHeight * (spacingMultiplier - 1) + (spacingMultiplier - 1) * 8;
            const topOffset = (matchHeight + 8) * (spacingMultiplier - 1) / 2;

            return (
              <div key={`round-${roundNum}`} className="relative" style={{ width: `${matchWidth}px` }}>
                {/* Matches Column */}
                <div
                  className="flex flex-col"
                  style={{
                    gap: `${verticalGap + 8}px`,
                    paddingTop: `${topOffset}px`
                  }}
                >
                  {matchesInRound.map((match, matchIndex) => {
                    const isChampionship = roundNum === maxRound;
                    const matchLabel = isChampionship
                      ? (bracketType === 'main' ? 'Gold Medal Match' : 'Final')
                      : `Game ${(match as any).bracketPosition || matchIndex + 1}`;

                    return (
                      <div key={match.id} className="relative">
                        <BracketMatchCard
                          match={match}
                          matchLabel={matchLabel}
                          onUpdateScore={onUpdateScore}
                          onOpenScoreModal={(m) => {
                            setScoreModalMatch(m);
                            setIsScoreModalOpen(true);
                          }}
                          isVerified={isVerified}
                          canEdit={canEditMatch(match)}
                          isChampionship={isChampionship}
                        />

                        {/* Connector Lines (SVG) - Draw lines to next round */}
                        {roundNum < maxRound && (
                          <svg
                            className="absolute top-0 left-full"
                            style={{
                              width: `${roundGap}px`,
                              height: `${matchHeight * spacingMultiplier + 8 * (spacingMultiplier - 1)}px`,
                              overflow: 'visible'
                            }}
                          >
                            {/* Horizontal line from match */}
                            <line
                              x1="0"
                              y1={matchHeight / 2}
                              x2={roundGap / 2}
                              y2={matchHeight / 2}
                              stroke="#4B5563"
                              strokeWidth="2"
                            />

                            {/* Vertical connector for pairs */}
                            {matchIndex % 2 === 0 && matchIndex + 1 < matchCount && (
                              <>
                                {/* Vertical line connecting pair */}
                                <line
                                  x1={roundGap / 2}
                                  y1={matchHeight / 2}
                                  x2={roundGap / 2}
                                  y2={matchHeight / 2 + verticalGap + matchHeight + 8}
                                  stroke="#4B5563"
                                  strokeWidth="2"
                                />
                                {/* Horizontal line to next match */}
                                <line
                                  x1={roundGap / 2}
                                  y1={matchHeight / 2 + (verticalGap + matchHeight + 8) / 2}
                                  x2={roundGap}
                                  y2={matchHeight / 2 + (verticalGap + matchHeight + 8) / 2}
                                  stroke="#4B5563"
                                  strokeWidth="2"
                                />
                              </>
                            )}
                          </svg>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bronze Match Section */}
        {bronzeMatches.length > 0 && (
          <div className="mt-8 pt-6 border-t border-gray-700">
            <h3 className="text-amber-500 font-bold uppercase text-xs tracking-wider mb-3">
              {bronzeLabel}
            </h3>
            <div className="flex gap-4">
              {bronzeMatches.map(match => (
                <BracketMatchCard
                  key={match.id}
                  match={match}
                  matchLabel="3rd Place"
                  onUpdateScore={onUpdateScore}
                  onOpenScoreModal={(m) => {
                    setScoreModalMatch(m);
                    setIsScoreModalOpen(true);
                  }}
                  isVerified={isVerified}
                  canEdit={canEditMatch(match)}
                  isBronze={true}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* V06.42: Score Entry Modal for multi-game matches */}
      {scoreModalMatch && onUpdateMultiGameScore && (
        <ScoreEntryModal
          match={{
            id: scoreModalMatch.id,
            eventType: 'tournament',
            eventId: '',
            format: 'pool_play_medals' as any,
            gameSettings: (scoreModalMatch as any).gameSettings || {
              playType: 'doubles',
              bestOf: 1,
              pointsPerGame: 11,
              winBy: 2,
            },
            sideA: {
              id: scoreModalMatch.team1?.id || '',
              name: scoreModalMatch.team1?.name || 'TBD',
              playerIds: scoreModalMatch.team1?.players?.map(p => p.name) || [],
            },
            sideB: {
              id: scoreModalMatch.team2?.id || '',
              name: scoreModalMatch.team2?.name || 'TBD',
              playerIds: scoreModalMatch.team2?.players?.map(p => p.name) || [],
            },
            status: (scoreModalMatch.status as any) || 'scheduled',
            scores: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }}
          isOpen={isScoreModalOpen}
          onClose={() => {
            setIsScoreModalOpen(false);
            setScoreModalMatch(null);
          }}
          onSubmit={async (scores, winnerId) => {
            setIsSubmittingScore(true);
            try {
              await onUpdateMultiGameScore(scoreModalMatch.id, scores, winnerId);
              setIsScoreModalOpen(false);
              setScoreModalMatch(null);
            } finally {
              setIsSubmittingScore(false);
            }
          }}
          isLoading={isSubmittingScore}
        />
      )}
    </div>
  );
};
