/**
 * BracketViewer Component
 *
 * Public view of tournament bracket - matches Manager View layout
 * but without edit functionality.
 *
 * @version 07.01
 * @file components/BracketViewer.tsx
 */

import React from 'react';
import { MatchDisplay } from './MatchCard';

interface BracketViewerProps {
  matches: MatchDisplay[];
  onUpdateScore: (matchId: string, score1: number, score2: number, action: 'submit' | 'confirm' | 'dispute', reason?: string) => void;
  onUpdateMultiGameScore?: (matchId: string, scores: any[], winnerId: string) => Promise<void>;
  isVerified: boolean;
  bracketTitle?: string;
  bracketType?: 'main' | 'plate' | 'consolation';
  finalsLabel?: string;
  isOrganizer?: boolean;
}

// ============================================
// PUBLIC MATCH CARD (Read-Only)
// ============================================

interface PublicMatchCardProps {
  match: MatchDisplay | null;
  label: string;
  variant?: 'default' | 'gold' | 'bronze';
  size?: 'default' | 'large';
}

const PublicMatchCard: React.FC<PublicMatchCardProps> = ({
  match,
  label,
  variant = 'default',
  size = 'default',
}) => {
  const team1Name = match?.team1?.name || 'TBD';
  const team2Name = match?.team2?.name || 'TBD';
  const isCompleted = match?.status === 'completed';

  // Calculate winner
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
    const s1 = match?.score1 ?? 0;
    const s2 = match?.score2 ?? 0;
    team1Won = isCompleted && s1 > s2;
    team2Won = isCompleted && s2 > s1;
  }

  const getScore = (isTeam1: boolean): string => {
    if (!match) return '-';
    if (match.scores && match.scores.length > 0) {
      let wins = 0;
      for (const g of match.scores) {
        const a = isTeam1 ? g.scoreA : g.scoreB;
        const b = isTeam1 ? g.scoreB : g.scoreA;
        if (a > b) wins++;
      }
      return String(wins);
    }
    return String(isTeam1 ? (match.score1 ?? '-') : (match.score2 ?? '-'));
  };

  // Styling based on variant
  const cardWidth = size === 'large' ? 'w-56' : 'w-52';
  const borderColor = variant === 'gold' ? 'border-yellow-500' : variant === 'bronze' ? 'border-amber-600' : 'border-gray-700';
  const headerBg = variant === 'gold' ? 'bg-yellow-500/20' : variant === 'bronze' ? 'bg-amber-600/20' : 'bg-gray-800';
  const headerText = variant === 'gold' ? 'text-yellow-400' : variant === 'bronze' ? 'text-amber-400' : 'text-gray-500';

  return (
    <div className={`${cardWidth} border ${borderColor} rounded-lg overflow-hidden bg-gray-900`}>
      {/* Match Header */}
      <div className={`${headerBg} px-3 py-1.5`}>
        <span className={`text-[10px] font-bold uppercase tracking-wider ${headerText}`}>
          {label}
        </span>
      </div>

      {/* Team 1 */}
      <div className={`flex items-center justify-between px-3 py-2.5 border-b border-gray-800 ${team1Won ? 'bg-lime-500/10' : ''}`}>
        <span className={`text-sm truncate flex-1 mr-2 ${
          team1Won ? 'text-lime-400 font-semibold' : team1Name === 'TBD' ? 'text-gray-600 italic' : 'text-gray-300'
        }`}>
          {team1Name}
        </span>
        <span className={`min-w-[24px] text-center text-sm font-semibold ${
          team1Won ? 'text-lime-400' : 'text-gray-500'
        }`}>
          {getScore(true)}
        </span>
      </div>

      {/* Team 2 */}
      <div className={`flex items-center justify-between px-3 py-2.5 ${team2Won ? 'bg-lime-500/10' : ''}`}>
        <span className={`text-sm truncate flex-1 mr-2 ${
          team2Won ? 'text-lime-400 font-semibold' : team2Name === 'TBD' ? 'text-gray-600 italic' : 'text-gray-300'
        }`}>
          {team2Name}
        </span>
        <span className={`min-w-[24px] text-center text-sm font-semibold ${
          team2Won ? 'text-lime-400' : 'text-gray-500'
        }`}>
          {getScore(false)}
        </span>
      </div>

      {/* Game Scores for multi-game matches */}
      {match?.scores && match.scores.length > 1 && isCompleted && (
        <div className="px-3 py-1.5 bg-gray-800/50 border-t border-gray-800 text-center">
          <span className="text-[10px] text-gray-500">
            {match.scores.map((g) => `${g.scoreA}-${g.scoreB}`).join(' · ')}
          </span>
        </div>
      )}
    </div>
  );
};

// ============================================
// MAIN BRACKET VIEWER
// ============================================

export const BracketViewer: React.FC<BracketViewerProps> = ({
  matches,
  bracketTitle,
  bracketType = 'main',
  finalsLabel = 'GOLD MEDAL MATCH',
}) => {
  // Separate bronze matches
  const bronzeMatches = (matches || []).filter(m => (m as any).isThirdPlace === true);
  const regularMatches = (matches || []).filter(m => (m as any).isThirdPlace !== true);

  // Group by round
  const rounds: { [key: number]: MatchDisplay[] } = {};
  let maxRound = 0;

  regularMatches.forEach(m => {
    const round = (m as any).roundNumber || 1;
    if (!rounds[round]) rounds[round] = [];
    rounds[round].push(m);
    if (round > maxRound) maxRound = round;
  });

  // Sort within rounds
  Object.keys(rounds).forEach(k => {
    rounds[Number(k)].sort((a, b) => {
      const pa = (a as any).bracketPosition || (a as any).matchNumber || 0;
      const pb = (b as any).bracketPosition || (b as any).matchNumber || 0;
      return pa - pb;
    });
  });

  const roundKeys = Object.keys(rounds).map(Number).sort((a, b) => a - b);

  const getRoundName = (roundNum: number): string => {
    const fromFinal = maxRound - roundNum;
    const prefix = bracketType === 'plate' ? 'PLATE ' : '';
    switch (fromFinal) {
      case 0: return finalsLabel;
      case 1: return `${prefix}SEMI-FINALS`;
      case 2: return `${prefix}QUARTER-FINALS`;
      case 3: return `${prefix}ROUND OF 16`;
      default: return `${prefix}ROUND ${roundNum}`;
    }
  };

  const titleColor = bracketType === 'plate' ? 'text-amber-400' : bracketType === 'main' ? 'text-yellow-400' : 'text-lime-400';

  if (regularMatches.length === 0) {
    return (
      <div className="bg-gray-900/50 rounded-xl p-8 border border-gray-800">
        {bracketTitle && <h2 className={`text-lg font-bold mb-2 ${titleColor}`}>{bracketTitle}</h2>}
        <p className="text-gray-500 text-sm">Bracket will appear after pool play completes.</p>
      </div>
    );
  }

  // Layout constants - SAME AS MANAGER VIEW
  const cardHeight = 100; // Approximate card height
  const actualCardHeight = 140; // With padding
  const cardWidth = 220;
  const finalsCardHeight = 120;
  const finalsCardWidth = 240;
  const roundGap = 60;
  const baseGap = 50;
  const baseSpacing = actualCardHeight + baseGap;

  return (
    <div className="overflow-x-auto pb-6">
      {/* Title */}
      {bracketTitle && (
        <h2 className={`text-xl font-bold mb-6 ${titleColor}`}>
          {bracketTitle}
        </h2>
      )}

      <div className="bg-gray-900/30 rounded-xl p-6 border border-gray-800">
        {/* Round Headers */}
        <div className="flex items-start mb-4" style={{ gap: `${roundGap}px` }}>
          {roundKeys.map((roundNum) => {
            const isChampionship = roundNum === maxRound;
            const currentCardWidth = isChampionship ? finalsCardWidth : cardWidth;
            // Finals header: gold for main bracket, silver for plate bracket
            const finalsHeaderStyle = bracketType === 'main'
              ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
              : 'bg-gray-600/30 text-gray-300 border-gray-500/30';
            const headerBg = isChampionship
              ? finalsHeaderStyle
              : 'bg-gray-800 text-gray-400 border-gray-700';

            return (
              <div
                key={`header-${roundNum}`}
                className={`text-center font-bold uppercase text-xs tracking-wider px-4 py-2 rounded-lg border ${headerBg}`}
                style={{ width: `${currentCardWidth}px` }}
              >
                {getRoundName(roundNum)}
              </div>
            );
          })}

          {/* Bronze Match Header */}
          {bronzeMatches.length > 0 && (
            <div
              className="text-center font-bold uppercase text-xs tracking-wider px-4 py-2 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30"
              style={{ width: `${cardWidth}px` }}
            >
              {bracketType === 'main' ? 'BRONZE MATCH' : '3RD PLACE'}
            </div>
          )}

          {/* Champion Header */}
          {bracketType === 'main' && maxRound > 0 && (
            <div className="w-24" />
          )}
        </div>

        {/* Bracket with Connectors */}
        <div className="relative flex items-start" style={{ gap: `${roundGap}px` }}>
          {roundKeys.map((roundNum) => {
            const matchesInRound = rounds[roundNum] || [];
            const isChampionship = roundNum === maxRound;
            const currentCardWidth = isChampionship ? finalsCardWidth : cardWidth;
            const currentActualCardHeight = isChampionship ? finalsCardHeight + 20 : actualCardHeight;

            // FLEXIBLE positioning formula - SAME AS MANAGER VIEW
            const roundMultiplier = Math.pow(2, roundNum - 1);
            const matchSpacing = baseSpacing * roundMultiplier;
            const topOffset = (baseSpacing / 2) * (roundMultiplier - 1);
            const adjustedTopOffset = isChampionship
              ? topOffset - (finalsCardHeight - cardHeight) / 2
              : topOffset;

            const getMatchTopPosition = (matchIndex: number): number => {
              return adjustedTopOffset + matchIndex * matchSpacing;
            };

            const lastMatchTop = getMatchTopPosition(matchesInRound.length - 1);
            const containerHeight = lastMatchTop + currentActualCardHeight + 20;

            return (
              <div
                key={`round-${roundNum}`}
                className="relative"
                style={{
                  width: `${currentCardWidth}px`,
                  height: `${containerHeight}px`
                }}
              >
                {/* Match Cards */}
                {matchesInRound.map((match, matchIndex) => {
                  const matchNum = (match as any).bracketPosition || matchIndex + 1;
                  const matchType = (match as any).matchType;

                  // Only show finals label for actual finals match (matchType === 'final')
                  // AND only if it's in the championship round with just 1 match
                  const isActualFinals = isChampionship &&
                    (matchType === 'final' || matchType === 'gold_medal' || matchesInRound.length === 1);

                  const matchLabel = isActualFinals
                    ? finalsLabel
                    : bracketType === 'plate'
                      ? `PLATE MATCH ${matchNum}`
                      : `Match ${matchNum}`;
                  const topPosition = getMatchTopPosition(matchIndex);

                  return (
                    <div
                      key={match.id}
                      className="absolute"
                      style={{
                        top: `${topPosition}px`,
                        left: 0,
                        width: '100%'
                      }}
                    >
                      <PublicMatchCard
                        match={match}
                        label={matchLabel}
                        variant={isActualFinals ? (bracketType === 'main' ? 'gold' : 'default') : 'default'}
                        size={isActualFinals ? 'large' : 'default'}
                      />
                    </div>
                  );
                })}

                {/* Connector Lines */}
                {roundNum < maxRound && (
                  <svg
                    className="absolute pointer-events-none"
                    style={{
                      top: 0,
                      left: `${currentCardWidth}px`,
                    }}
                    width={roundGap}
                    height={containerHeight}
                  >
                    {matchesInRound.map((_, matchIndex) => {
                      const matchTop = getMatchTopPosition(matchIndex);
                      const matchCenterY = matchTop + actualCardHeight / 2;
                      const midX = roundGap / 2;

                      const isFirstOfPair = matchIndex % 2 === 0;
                      const hasPair = matchIndex + 1 < matchesInRound.length;

                      if (isFirstOfPair && hasPair) {
                        const pairMatchTop = getMatchTopPosition(matchIndex + 1);
                        const pairMatchCenterY = pairMatchTop + actualCardHeight / 2;
                        const meetingY = (matchCenterY + pairMatchCenterY) / 2;

                        return (
                          <g key={matchIndex}>
                            <path
                              d={`M 0 ${matchCenterY} L ${midX} ${matchCenterY} L ${midX} ${meetingY} L ${roundGap} ${meetingY}`}
                              fill="none"
                              stroke="#84cc16"
                              strokeWidth="2"
                            />
                            <path
                              d={`M 0 ${pairMatchCenterY} L ${midX} ${pairMatchCenterY} L ${midX} ${meetingY}`}
                              fill="none"
                              stroke="#84cc16"
                              strokeWidth="2"
                            />
                          </g>
                        );
                      } else if (isFirstOfPair && !hasPair) {
                        return (
                          <path
                            key={matchIndex}
                            d={`M 0 ${matchCenterY} L ${roundGap} ${matchCenterY}`}
                            fill="none"
                            stroke="#84cc16"
                            strokeWidth="2"
                          />
                        );
                      }
                      return null;
                    })}
                  </svg>
                )}

                {/* Finals to Champion line */}
                {isChampionship && bracketType === 'main' && (
                  <div
                    className="absolute bg-yellow-500"
                    style={{
                      top: `${adjustedTopOffset + currentActualCardHeight / 2}px`,
                      left: `${currentCardWidth}px`,
                      width: '40px',
                      height: '3px',
                    }}
                  />
                )}
              </div>
            );
          })}

          {/* Bronze Match & Champion Trophy */}
          {(() => {
            const finalsMultiplier = Math.pow(2, maxRound - 1);
            const finalsTopOffset = (baseSpacing / 2) * (finalsMultiplier - 1);
            const finalsAdjustedOffset = finalsTopOffset - (finalsCardHeight - cardHeight) / 2;

            return (
              <>
                {/* Bronze Match */}
                {bronzeMatches.length > 0 && (
                  <div
                    className="relative"
                    style={{
                      width: `${cardWidth}px`,
                      paddingTop: `${finalsAdjustedOffset + (finalsCardHeight - cardHeight) / 2}px`
                    }}
                  >
                    <PublicMatchCard
                      match={bronzeMatches[0]}
                      label={bracketType === 'main' ? 'BRONZE MEDAL' : '3RD PLACE'}
                      variant="bronze"
                    />
                  </div>
                )}

                {/* Champion Trophy */}
                {bracketType === 'main' && maxRound > 0 && (
                  <div
                    className="flex items-start"
                    style={{
                      paddingTop: `${finalsAdjustedOffset + (finalsCardHeight - 96) / 2}px`,
                      marginLeft: `-${roundGap - 40}px`
                    }}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-24 h-24 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center shadow-xl shadow-yellow-500/40 border-4 border-yellow-300/30">
                        <svg className="w-12 h-12 text-yellow-900" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                      </div>
                      <span className="text-yellow-400 font-bold text-sm tracking-wide">CHAMPION</span>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
};
