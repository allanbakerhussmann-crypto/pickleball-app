/**
 * MedalBracketTab - V07.02
 *
 * Redesigned Medal Bracket interface with "Sports Command Center" aesthetic.
 * Features illustrative bracket visualization with solid connector lines,
 * medal podium display, and glass-morphism cards.
 *
 * @file components/tournament/MedalBracketTab.tsx
 */
import React, { useState } from 'react';
import { Tournament, Division, Match } from '../../types';
import { MatchDisplay } from '../MatchCard';
import { ScoreEntryModal } from '../shared/ScoreEntryModal';
import type { GameScore } from '../../types/game/match';
import { useAuth } from '../../contexts/AuthContext';

interface MedalBracketTabProps {
  tournament: Tournament;
  activeDivision: Division;
  divisionMatches: Match[];
  getTeamDisplayName: (teamId: string) => string;
  getTeamPlayers: (teamId: string) => { displayName: string }[];
  handleUpdateScore: (matchId: string, score1: number, score2: number, action: 'submit' | 'confirm' | 'dispute', reason?: string) => void;
  handleUpdateMultiGameScore?: (matchId: string, scores: GameScore[], winnerId: string) => Promise<void>;
  isVerified: boolean;
  isOrganizer: boolean;
  permissions: { isFullAdmin: boolean };
  localMedalSettings: any;
  setLocalMedalSettings: (fn: (prev: any) => any) => void;
  handleSaveMedalRules: () => Promise<void>;
  /** For generate bracket button */
  standings?: any[];
  setPendingStandings?: (standings: any[]) => void;
  setShowMedalConfirmModal?: (show: boolean) => void;
  allPoolsComplete?: boolean;
}

// Glass card component matching other tabs
const SettingsCard: React.FC<{
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  allowOverflow?: boolean;
}> = ({ title, subtitle, icon, badge, children, className = '', allowOverflow = false }) => (
  <div className={`
    relative rounded-xl border backdrop-blur-sm
    bg-gradient-to-br from-gray-900/80 to-gray-900/40
    border-gray-700/50 hover:border-gray-600/50
    transition-all duration-300 ease-out
    ${allowOverflow ? '' : 'overflow-hidden'}
    ${className}
  `}>
    {!allowOverflow && (
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    )}

    <div className="px-5 py-4 border-b border-gray-700/30 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-gray-700/50 text-gray-400">
            {icon}
          </div>
        )}
        <div>
          <h3 className="font-bold text-white">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {badge}
    </div>

    <div className="p-5">
      {children}
    </div>
  </div>
);

// Icons
const TrophyIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15l-2 5H6l2-5m4 0l2 5h4l-2-5m-4 0V9m0 0l3-3m-3 3l-3-3m3 3h.01M17 4h2a1 1 0 011 1v3a3 3 0 01-3 3m0-7V4M7 4H5a1 1 0 00-1 1v3a3 3 0 003 3m0-7V4" />
  </svg>
);

const SettingsIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const SparklesIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);

// Styled select component
const StyledSelect: React.FC<{
  value: number;
  onChange: (value: number) => void;
  options: { value: number; label: string }[];
  disabled?: boolean;
}> = ({ value, onChange, options, disabled }) => (
  <select
    value={value}
    onChange={(e) => onChange(parseInt(e.target.value))}
    disabled={disabled}
    className={`
      bg-gray-800/80 text-white rounded-lg px-3 py-1.5 text-sm
      border border-gray-600/50 focus:border-lime-500/50 focus:ring-1 focus:ring-lime-500/30
      transition-all duration-200 outline-none
      ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-500'}
    `}
  >
    {options.map(opt => (
      <option key={opt.value} value={opt.value}>{opt.label}</option>
    ))}
  </select>
);

// Styled toggle component
const StyledToggle: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}> = ({ checked, onChange, disabled }) => (
  <button
    type="button"
    onClick={() => !disabled && onChange(!checked)}
    disabled={disabled}
    className={`
      relative w-14 h-7 rounded-full transition-all duration-300
      ${checked
        ? 'bg-gradient-to-r from-lime-600 to-lime-500 shadow-lg shadow-lime-500/20'
        : 'bg-gray-700'}
      ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
    `}
  >
    <div
      className={`
        absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md
        transition-transform duration-300 ease-out
        ${checked ? 'translate-x-7' : 'translate-x-0.5'}
      `}
    />
  </button>
);

// ============================================
// BRACKET MATCH CARD - Tournament Style
// ============================================
interface BracketMatchCardProps {
  match: MatchDisplay | null;
  label?: string;
  onUpdateScore: (matchId: string, score1: number, score2: number, action: 'submit' | 'confirm' | 'dispute') => void;
  onOpenScoreModal?: (match: MatchDisplay) => void;
  canEdit: boolean;
  variant?: 'default' | 'gold' | 'bronze' | 'plate';
  size?: 'default' | 'large';
}

const BracketMatchCard: React.FC<BracketMatchCardProps> = ({
  match,
  label,
  onUpdateScore,
  onOpenScoreModal,
  canEdit,
  variant = 'default',
  size = 'default',
}) => {
  const [score1, setScore1] = useState<string>(match?.score1?.toString() ?? '');
  const [score2, setScore2] = useState<string>(match?.score2?.toString() ?? '');
  const [isEditing, setIsEditing] = useState(false);

  React.useEffect(() => {
    setScore1(match?.score1?.toString() ?? '');
    setScore2(match?.score2?.toString() ?? '');
  }, [match?.score1, match?.score2]);

  const team1Name = match?.team1?.name || 'TBD';
  const team2Name = match?.team2?.name || 'TBD';
  const isTBD = team1Name === 'TBD' || team2Name === 'TBD';
  const isCompleted = match?.status === 'completed';

  // Determine winner for multi-game matches
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

  // Format scores - show actual points for single game, or games won for multi-game
  const formatScore = (isTeam1: boolean): string => {
    if (!match) return '-';
    if (match.scores && match.scores.length > 0) {
      // For single game, show actual points
      if (match.scores.length === 1) {
        const game = match.scores[0];
        return String(isTeam1 ? game.scoreA : game.scoreB);
      }
      // For multi-game, show games won count
      let gamesWon = 0;
      for (const game of match.scores) {
        const teamScore = isTeam1 ? game.scoreA : game.scoreB;
        const oppScore = isTeam1 ? game.scoreB : game.scoreA;
        if (teamScore > oppScore) gamesWon++;
      }
      return String(gamesWon);
    }
    return String(isTeam1 ? (match.score1 ?? '-') : (match.score2 ?? '-'));
  };

  const handleSubmit = () => {
    if (!match || !canEdit) return;
    const s1 = parseInt(score1, 10);
    const s2 = parseInt(score2, 10);
    if (isNaN(s1) || isNaN(s2)) return;
    onUpdateScore(match.id, s1, s2, 'submit');
    setIsEditing(false);
  };

  // Variant styles
  const variantStyles = {
    default: 'border-gray-600/50 bg-gray-800/60',
    gold: 'border-yellow-500/50 bg-gradient-to-br from-yellow-900/30 to-yellow-800/20 shadow-lg shadow-yellow-500/10',
    bronze: 'border-amber-600/50 bg-gradient-to-br from-amber-900/30 to-amber-800/20',
    plate: 'border-gray-500/50 bg-gradient-to-br from-gray-700/30 to-gray-600/20',
  };

  const labelStyles = {
    default: 'text-gray-500',
    gold: 'text-yellow-400 font-semibold',
    bronze: 'text-amber-400 font-semibold',
    plate: 'text-gray-400',
  };

  // Size-based dimensions
  const sizeStyles = {
    default: 'min-w-[220px] p-3',
    large: 'min-w-[260px] p-4',
  };

  return (
    <div className={`
      rounded-lg border backdrop-blur-sm
      transition-all duration-200 hover:border-opacity-100
      ${sizeStyles[size]}
      ${variantStyles[variant]}
    `}>
      {label && (
        <div className={`uppercase tracking-wider mb-2 ${size === 'large' ? 'text-xs' : 'text-[10px]'} ${labelStyles[variant]}`}>
          {label}
        </div>
      )}

      {/* Team 1 */}
      <div className={`
        flex items-center justify-between rounded
        ${size === 'large' ? 'py-2.5 px-3' : 'py-1.5 px-2'}
        ${team1Won ? 'bg-lime-500/20' : ''}
        ${isTBD && team1Name === 'TBD' ? 'opacity-50' : ''}
      `}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {team1Won && (
            <div className={`rounded-full bg-lime-400 flex-shrink-0 ${size === 'large' ? 'w-2 h-2' : 'w-1.5 h-1.5'}`} />
          )}
          <span className={`truncate ${size === 'large' ? 'text-base' : 'text-sm'} ${team1Won ? 'text-white font-semibold' : 'text-gray-300'}`}>
            {team1Name}
          </span>
        </div>
        <span className={`font-mono ml-2 ${size === 'large' ? 'text-base' : 'text-sm'} ${team1Won ? 'text-lime-400 font-bold' : 'text-gray-400'}`}>
          {isCompleted ? formatScore(true) : '-'}
        </span>
      </div>

      {/* Divider */}
      <div className={`h-px bg-gray-600/30 ${size === 'large' ? 'my-2' : 'my-1'}`} />

      {/* Team 2 */}
      <div className={`
        flex items-center justify-between rounded
        ${size === 'large' ? 'py-2.5 px-3' : 'py-1.5 px-2'}
        ${team2Won ? 'bg-lime-500/20' : ''}
        ${isTBD && team2Name === 'TBD' ? 'opacity-50' : ''}
      `}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {team2Won && (
            <div className={`rounded-full bg-lime-400 flex-shrink-0 ${size === 'large' ? 'w-2 h-2' : 'w-1.5 h-1.5'}`} />
          )}
          <span className={`truncate ${size === 'large' ? 'text-base' : 'text-sm'} ${team2Won ? 'text-white font-semibold' : 'text-gray-300'}`}>
            {team2Name}
          </span>
        </div>
        <span className={`font-mono ml-2 ${size === 'large' ? 'text-base' : 'text-sm'} ${team2Won ? 'text-lime-400 font-bold' : 'text-gray-400'}`}>
          {isCompleted ? formatScore(false) : '-'}
        </span>
      </div>

      {/* Score Entry - Always use global scorecard modal when available */}
      {canEdit && match && !isTBD && !isCompleted && (
        <div className="mt-2 pt-2 border-t border-gray-600/30">
          {onOpenScoreModal ? (
            <button
              onClick={() => onOpenScoreModal(match)}
              className="w-full py-1.5 text-xs bg-lime-600/20 hover:bg-lime-600/30 text-lime-400 rounded transition-colors"
            >
              Enter Score
            </button>
          ) : isEditing ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={score1}
                onChange={(e) => setScore1(e.target.value)}
                className="w-12 px-2 py-1 text-sm bg-gray-700 rounded text-center text-white"
                min="0"
              />
              <span className="text-gray-500">-</span>
              <input
                type="number"
                value={score2}
                onChange={(e) => setScore2(e.target.value)}
                className="w-12 px-2 py-1 text-sm bg-gray-700 rounded text-center text-white"
                min="0"
              />
              <button
                onClick={handleSubmit}
                className="px-2 py-1 text-xs bg-lime-600 hover:bg-lime-500 text-white rounded"
              >
                ✓
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="w-full py-1.5 text-xs bg-gray-700/50 hover:bg-gray-600/50 text-gray-400 rounded transition-colors"
            >
              Enter Score
            </button>
          )}
        </div>
      )}

      {/* Game scores tooltip for multi-game */}
      {isCompleted && match?.scores && match.scores.length > 1 && (
        <div className="mt-2 pt-2 border-t border-gray-600/30">
          <div className="text-[10px] text-gray-500 text-center">
            {match.scores.map((g) => `${g.scoreA}-${g.scoreB}`).join(' • ')}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================
// ILLUSTRATIVE BRACKET COMPONENT
// ============================================
export interface IllustrativeBracketProps {
  matches: MatchDisplay[];
  bronzeMatches: MatchDisplay[];
  onUpdateScore: (matchId: string, score1: number, score2: number, action: 'submit' | 'confirm' | 'dispute') => void;
  onOpenScoreModal: (match: MatchDisplay) => void;
  canEditMatch: (match: MatchDisplay) => boolean;
  bracketTitle?: string;
  finalsLabel?: string;
  bracketType?: 'main' | 'plate';
}

export const IllustrativeBracket: React.FC<IllustrativeBracketProps> = ({
  matches,
  bronzeMatches,
  onUpdateScore,
  onOpenScoreModal,
  canEditMatch,
  bracketTitle,
  finalsLabel = 'Gold Medal Match',
  bracketType = 'main',
}) => {
  // Group matches by round
  const rounds: { [key: number]: MatchDisplay[] } = {};
  let maxRound = 0;

  matches.forEach(m => {
    const round = (m as any).roundNumber || 1;
    if (!rounds[round]) rounds[round] = [];
    rounds[round].push(m);
    if (round > maxRound) maxRound = round;
  });

  // Sort matches within each round
  Object.keys(rounds).forEach(roundKey => {
    rounds[Number(roundKey)].sort((a, b) => {
      const posA = (a as any).bracketPosition || 0;
      const posB = (b as any).bracketPosition || 0;
      return posA - posB;
    });
  });

  const roundKeys = Object.keys(rounds).map(Number).sort((a, b) => a - b);

  // Get round name with plate prefix if needed
  const getRoundName = (roundNum: number): string => {
    const fromFinal = maxRound - roundNum;
    const prefix = bracketType === 'plate' ? 'Plate ' : '';
    switch (fromFinal) {
      case 0: return finalsLabel;
      case 1: return `${prefix}Semi-Finals`;
      case 2: return `${prefix}Quarter-Finals`;
      case 3: return `${prefix}Round of 16`;
      default: return `${prefix}Round ${roundNum}`;
    }
  };

  // Card dimensions - Finals card is bigger
  const cardHeight = 100;
  const finalsCardHeight = 120; // Bigger for finals
  const cardWidth = 220;
  const finalsCardWidth = 260; // Wider for finals
  const roundGap = 60; // Gap between rounds for connector lines

  if (matches.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-800/50 flex items-center justify-center">
          <TrophyIcon />
        </div>
        <p className="text-gray-400">Bracket will be generated after pool stage completes.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Bracket Title */}
      {bracketTitle && (
        <div className="flex items-center gap-3 mb-6">
          <div className={`
            w-10 h-10 rounded-lg flex items-center justify-center
            ${bracketType === 'main' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-600/20 text-gray-400'}
          `}>
            <TrophyIcon />
          </div>
          <h2 className={`text-xl font-bold ${bracketType === 'main' ? 'text-yellow-400' : 'text-gray-400'}`}>
            {bracketTitle}
          </h2>
        </div>
      )}

      {/* Main Bracket Grid */}
      <div className="overflow-x-auto pb-4">
        <div className="inline-flex flex-col">
          {/* Round Headers */}
          <div className="flex mb-4" style={{ gap: `${roundGap}px` }}>
            {roundKeys.map(roundNum => {
              const isChampionship = roundNum === maxRound;
              // Finals header: gold for main bracket, silver for plate bracket
              const finalsHeaderStyle = bracketType === 'main'
                ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                : 'bg-gray-600/30 text-gray-300 border border-gray-500/30';
              return (
                <div
                  key={`header-${roundNum}`}
                  className={`
                    text-center font-bold uppercase text-xs tracking-wider px-4 py-2 rounded-lg
                    ${isChampionship
                      ? finalsHeaderStyle
                      : 'bg-gray-800/50 text-gray-400 border border-gray-700/30'}
                  `}
                  style={{ width: `${isChampionship ? finalsCardWidth : cardWidth}px` }}
                >
                  {getRoundName(roundNum)}
                </div>
              );
            })}
            {/* Bronze header placeholder */}
            {bronzeMatches.length > 0 && (
              <div
                className="text-center font-bold uppercase text-xs tracking-wider px-4 py-2 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30"
                style={{ width: `${cardWidth}px` }}
              >
                {bracketType === 'main' ? 'Bronze Match' : '3rd Place'}
              </div>
            )}
          </div>

          {/* Bracket Matches with Connectors */}
          <div className="relative flex items-start" style={{ gap: `${roundGap}px` }}>
            {roundKeys.map((roundNum, roundIndex) => {
              const matchesInRound = rounds[roundNum] || [];
              const isChampionship = roundNum === maxRound;
              const currentCardHeight = isChampionship ? finalsCardHeight : cardHeight;
              const currentCardWidth = isChampionship ? finalsCardWidth : cardWidth;

              // FLEXIBLE positioning formula that works for any bracket size
              // Cards are ~140px tall (with Enter Score button), so need more spacing
              const baseGap = 50; // Gap between match boxes
              const actualCardHeight = 140; // Actual rendered card height including button
              const baseSpacing = actualCardHeight + baseGap;

              // Each round's spacing doubles: Round 1 = 116, Round 2 = 232, Round 3 = 464, etc.
              const roundMultiplier = Math.pow(2, roundNum - 1);
              const matchSpacing = baseSpacing * roundMultiplier;

              // Top offset: positions first match so its center aligns with meeting point of previous round's pair
              // Formula: (baseSpacing / 2) * (2^(roundNum-1) - 1)
              const topOffset = (baseSpacing / 2) * (roundMultiplier - 1);

              // For championship round, adjust for taller card
              const adjustedTopOffset = isChampionship
                ? topOffset - (finalsCardHeight - cardHeight) / 2
                : topOffset;

              const getMatchTopPosition = (matchIndex: number): number => {
                return adjustedTopOffset + matchIndex * matchSpacing;
              };

              // Calculate total height needed
              const lastMatchTop = getMatchTopPosition(matchesInRound.length - 1);
              const containerHeight = lastMatchTop + currentCardHeight + 20;

              return (
                <div
                  key={`round-${roundNum}`}
                  className="relative"
                  style={{
                    width: `${currentCardWidth}px`,
                    height: `${containerHeight}px`
                  }}
                >
                  {/* Match Cards - Absolute Positioning */}
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
                        ? `Plate Match ${matchNum}`
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
                        <BracketMatchCard
                          match={match}
                          label={matchLabel}
                          onUpdateScore={onUpdateScore}
                          onOpenScoreModal={onOpenScoreModal}
                          canEdit={canEditMatch(match)}
                          variant={isActualFinals ? (bracketType === 'main' ? 'gold' : 'plate') : 'default'}
                          size={isActualFinals ? 'large' : 'default'}
                        />
                        {/* Line from finals to champion trophy */}
                        {isActualFinals && bracketType === 'main' && (
                          <div
                            className="absolute bg-yellow-500"
                            style={{
                              top: `${actualCardHeight / 2}px`,
                              left: `${currentCardWidth}px`,
                              width: '40px',
                              height: '3px',
                            }}
                          />
                        )}
                      </div>
                    );
                  })}

                  {/* Bracket Connector Lines */}
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
                        // Get Y position for this match center
                        const matchTop = getMatchTopPosition(matchIndex);
                        const matchCenterY = matchTop + actualCardHeight / 2;
                        const midX = roundGap / 2;

                        const isFirstOfPair = matchIndex % 2 === 0;
                        const hasPair = matchIndex + 1 < matchesInRound.length;

                        if (isFirstOfPair && hasPair) {
                          // Get next match in pair
                          const pairMatchTop = getMatchTopPosition(matchIndex + 1);
                          const pairMatchCenterY = pairMatchTop + actualCardHeight / 2;

                          // Meeting point is midway between the two
                          const meetingY = (matchCenterY + pairMatchCenterY) / 2;

                          return (
                            <g key={matchIndex}>
                              {/* Top match: horizontal → down → horizontal */}
                              <path
                                d={`M 0 ${matchCenterY} L ${midX} ${matchCenterY} L ${midX} ${meetingY} L ${roundGap} ${meetingY}`}
                                fill="none"
                                stroke="#84cc16"
                                strokeWidth="2"
                              />
                              {/* Bottom match: horizontal → up to meeting point */}
                              <path
                                d={`M 0 ${pairMatchCenterY} L ${midX} ${pairMatchCenterY} L ${midX} ${meetingY}`}
                                fill="none"
                                stroke="#84cc16"
                                strokeWidth="2"
                              />
                            </g>
                          );
                        } else if (isFirstOfPair && !hasPair) {
                          // Single match - straight line
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
                </div>
              );
            })}

            {/* Finals Row: Bronze Match + Champion Trophy - aligned with finals */}
            {(() => {
              // Use same calculation as main rounds for consistency
              const baseGap = 16;
              const baseSpacing = cardHeight + baseGap;

              // Finals positioning using the correct formula
              const finalsTopOffset = (baseSpacing / 2) * (Math.pow(2, maxRound - 1) - 1);
              const finalsAdjustedOffset = finalsTopOffset - (finalsCardHeight - cardHeight) / 2;

              // Semi-finals positioning (for bronze connector lines)
              const sfRoundNum = maxRound - 1;
              const sfRoundSpacing = baseSpacing * Math.pow(2, sfRoundNum - 1);
              const sfTopOffset = (baseSpacing / 2) * (Math.pow(2, sfRoundNum - 1) - 1);

              // SF match centers (where bronze connectors start from)
              const sfMatch0CenterY = sfTopOffset + cardHeight / 2;
              const sfMatch1CenterY = sfTopOffset + sfRoundSpacing + cardHeight / 2;

              // Bronze match center (same as finals center for visual alignment)
              const bronzeCenterY = finalsAdjustedOffset + finalsCardHeight / 2;

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
                      <BracketMatchCard
                        match={bronzeMatches[0]}
                        label={bracketType === 'main' ? 'Bronze Medal' : '3rd Place'}
                        onUpdateScore={onUpdateScore}
                        onOpenScoreModal={onOpenScoreModal}
                        canEdit={canEditMatch(bronzeMatches[0])}
                        variant="bronze"
                      />
                    </div>
                  )}

                  {/* Champion Trophy (for main bracket) - positioned to connect with finals line */}
                  {bracketType === 'main' && maxRound > 0 && (
                    <div
                      className="flex items-start"
                      style={{
                        paddingTop: `${finalsAdjustedOffset + (finalsCardHeight - 96) / 2}px`,
                        marginLeft: `-${roundGap - 40}px` // Move closer to finals (40px line width)
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
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================
export const MedalBracketTab: React.FC<MedalBracketTabProps> = ({
  tournament: _tournament,
  activeDivision,
  divisionMatches,
  getTeamDisplayName,
  getTeamPlayers,
  handleUpdateScore,
  handleUpdateMultiGameScore,
  isVerified: _isVerified,
  isOrganizer,
  permissions,
  localMedalSettings,
  setLocalMedalSettings,
  handleSaveMedalRules,
  standings,
  setPendingStandings,
  setShowMedalConfirmModal,
  allPoolsComplete,
}) => {
  // _tournament and _isVerified are passed for potential future use
  void _tournament;
  void _isVerified;
  const { currentUser } = useAuth();

  // Modal state for multi-game matches
  const [scoreModalMatch, setScoreModalMatch] = useState<MatchDisplay | null>(null);
  const [isScoreModalOpen, setIsScoreModalOpen] = useState(false);
  const [isSubmittingScore, setIsSubmittingScore] = useState(false);

  // Filter bracket matches
  const mainBracketMatches = (divisionMatches || []).filter(m =>
    (m.stage === 'bracket' || m.stage === 'Finals' || m.stage === 'finals' || m.stage === 'Medal' ||
     m.bracketType === 'main' || (!m.poolGroup && !m.stage?.toLowerCase().includes('pool'))) &&
    m.bracketType !== 'plate'
  );

  const plateMatches = (divisionMatches || []).filter(m =>
    m.bracketType === 'plate' || m.stage?.toLowerCase().includes('plate')
  );

  // Convert to UI format
  const convertToUiMatches = (matches: Match[]): MatchDisplay[] => {
    return matches.map(m => {
      const teamAId = m.teamAId || m.sideA?.id || '';
      const teamBId = m.teamBId || m.sideB?.id || '';
      return {
        id: m.id,
        team1: {
          id: teamAId,
          name: m.sideA?.name || getTeamDisplayName(teamAId),
          players: getTeamPlayers(teamAId),
        },
        team2: {
          id: teamBId,
          name: m.sideB?.name || getTeamDisplayName(teamBId),
          players: getTeamPlayers(teamBId),
        },
        gameSettings: m.gameSettings,
        scores: m.scores,
        score1: m.scores?.[0]?.scoreA ?? m.scoreTeamAGames?.[0] ?? null,
        score2: m.scores?.[0]?.scoreB ?? m.scoreTeamBGames?.[0] ?? null,
        status: m.status || 'scheduled',
        roundNumber: m.roundNumber,
        bracketPosition: m.bracketPosition,
        isThirdPlace: m.isThirdPlace,
      } as unknown as MatchDisplay;
    });
  };

  const mainBracketUiMatches = convertToUiMatches(mainBracketMatches);
  const plateUiMatches = convertToUiMatches(plateMatches);

  // Separate bronze matches
  const mainRegular = mainBracketUiMatches.filter(m => !(m as any).isThirdPlace);
  const mainBronze = mainBracketUiMatches.filter(m => (m as any).isThirdPlace);
  const plateRegular = plateUiMatches.filter(m => !(m as any).isThirdPlace);
  const plateBronze = plateUiMatches.filter(m => (m as any).isThirdPlace);

  // Check edit permissions
  const canEditMatch = (match: MatchDisplay) => {
    if (isOrganizer) return true;
    if (!currentUser) return false;
    const inTeam1 = (match.team1?.players || []).some(p => p.name === currentUser.displayName);
    const inTeam2 = (match.team2?.players || []).some(p => p.name === currentUser.displayName);
    return inTeam1 || inTeam2;
  };

  // Bracket lock status
  const isBracketLocked = mainBracketMatches.length > 0;
  const totalRounds = mainRegular.length > 0
    ? Math.max(...mainRegular.map(m => (m as any).roundNumber || 1))
    : 0;
  const showQuarterFinals = totalRounds >= 3;
  const showBronzeRow = activeDivision?.format?.hasBronzeMatch !== false;

  // Pool settings reference
  const format = activeDivision?.format;
  const poolSettings = {
    bestOf: format?.bestOfGames || 1,
    points: format?.pointsPerGame || 11,
    winBy: format?.winBy || 2,
  };

  // Handle multi-game score submission
  const handleScoreModalSubmit = async (scores: GameScore[], winnerId: string) => {
    if (!scoreModalMatch || !handleUpdateMultiGameScore) return;
    setIsSubmittingScore(true);
    try {
      await handleUpdateMultiGameScore(scoreModalMatch.id, scores, winnerId);
      setIsScoreModalOpen(false);
      setScoreModalMatch(null);
    } catch (err) {
      console.error('Failed to submit scores:', err);
    } finally {
      setIsSubmittingScore(false);
    }
  };

  // Check if we can generate bracket
  const canGenerateBracket = !isBracketLocked && allPoolsComplete && standings && standings.length > 0;

  return (
    <div className="space-y-6">
      {/* Generate Medal Bracket Section - shown when bracket not generated */}
      {!isBracketLocked && isOrganizer && (
        <SettingsCard
          title="Generate Medal Bracket"
          subtitle={allPoolsComplete ? 'Pool stage complete - ready to generate' : 'Waiting for pool stage to complete'}
          icon={<SparklesIcon />}
          badge={allPoolsComplete ? (
            <span className="text-xs px-2.5 py-1 rounded-full bg-lime-500/20 text-lime-400 border border-lime-500/30">
              Ready
            </span>
          ) : (
            <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
              Waiting
            </span>
          )}
        >
          {/* Helper message */}
          <div className="mb-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-blue-300 font-medium text-sm">Review bracket rules before generating</p>
                <p className="text-gray-400 text-xs mt-1">
                  Check the settings below to configure game rules for each bracket round.
                  These settings will be locked once the bracket is generated.
                </p>
              </div>
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={() => {
              if (setPendingStandings && setShowMedalConfirmModal && standings) {
                setPendingStandings(standings);
                setShowMedalConfirmModal(true);
              }
            }}
            disabled={!canGenerateBracket}
            className={`
              group relative overflow-hidden w-full
              inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl
              text-base font-bold
              transition-all duration-300 ease-out
              ${!canGenerateBracket
                ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white shadow-lg shadow-purple-500/20'}
            `}
          >
            {canGenerateBracket && (
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              </div>
            )}
            <SparklesIcon />
            <span className="relative">
              {!allPoolsComplete
                ? 'Complete pool stage first'
                : 'Generate Medal Bracket'}
            </span>
          </button>
        </SettingsCard>
      )}

      {/* Medal Match Rules - Always visible for organizers, shown BEFORE bracket when not generated */}
      {isOrganizer && !isBracketLocked && (
        <SettingsCard
          title="Medal Match Rules"
          subtitle="Configure game settings for each bracket round"
          icon={<SettingsIcon />}
        >
          {/* Pool Play reference */}
          <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700/30">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Pool Play Rules (Reference)</div>
            <div className="flex gap-6 text-sm">
              <span className="text-gray-300">Best Of: <span className="text-white font-medium">{poolSettings.bestOf}</span></span>
              <span className="text-gray-300">Points: <span className="text-white font-medium">{poolSettings.points}</span></span>
              <span className="text-gray-300">Win By: <span className="text-white font-medium">{poolSettings.winBy}</span></span>
            </div>
          </div>

          {/* Round-specific settings - Always visible */}
          <div className="mt-6 space-y-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider">Medal Round Rules</div>

            {/* Settings Grid */}
            <div className="grid gap-3">
                {/* Quarter-Finals */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800/30 border border-gray-700/30">
                  <span className="text-white font-medium">Quarter-Finals</span>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Best Of</span>
                      <StyledSelect
                        value={localMedalSettings.quarterFinals?.bestOf || 1}
                        onChange={(v) => setLocalMedalSettings((prev: any) => ({
                          ...prev,
                          quarterFinals: { ...prev.quarterFinals, bestOf: v },
                        }))}
                        options={[{ value: 1, label: '1' }, { value: 3, label: '3' }, { value: 5, label: '5' }]}
                        disabled={false}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Points</span>
                      <StyledSelect
                        value={localMedalSettings.quarterFinals?.pointsToWin || 11}
                        onChange={(v) => setLocalMedalSettings((prev: any) => ({
                          ...prev,
                          quarterFinals: { ...prev.quarterFinals, pointsToWin: v },
                        }))}
                        options={[{ value: 11, label: '11' }, { value: 15, label: '15' }, { value: 21, label: '21' }]}
                        disabled={false}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Win By</span>
                      <StyledSelect
                        value={localMedalSettings.quarterFinals?.winBy || 2}
                        onChange={(v) => setLocalMedalSettings((prev: any) => ({
                          ...prev,
                          quarterFinals: { ...prev.quarterFinals, winBy: v },
                        }))}
                        options={[{ value: 1, label: '1' }, { value: 2, label: '2' }]}
                        disabled={false}
                      />
                    </div>
                  </div>
                </div>

                {/* Semi-Finals */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800/30 border border-gray-700/30">
                  <span className="text-white font-medium">Semi-Finals</span>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Best Of</span>
                      <StyledSelect
                        value={localMedalSettings.semiFinals?.bestOf || 1}
                        onChange={(v) => setLocalMedalSettings((prev: any) => ({
                          ...prev,
                          semiFinals: { ...prev.semiFinals, bestOf: v },
                        }))}
                        options={[{ value: 1, label: '1' }, { value: 3, label: '3' }, { value: 5, label: '5' }]}
                        disabled={false}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Points</span>
                      <StyledSelect
                        value={localMedalSettings.semiFinals?.pointsToWin || 11}
                        onChange={(v) => setLocalMedalSettings((prev: any) => ({
                          ...prev,
                          semiFinals: { ...prev.semiFinals, pointsToWin: v },
                        }))}
                        options={[{ value: 11, label: '11' }, { value: 15, label: '15' }, { value: 21, label: '21' }]}
                        disabled={false}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Win By</span>
                      <StyledSelect
                        value={localMedalSettings.semiFinals?.winBy || 2}
                        onChange={(v) => setLocalMedalSettings((prev: any) => ({
                          ...prev,
                          semiFinals: { ...prev.semiFinals, winBy: v },
                        }))}
                        options={[{ value: 1, label: '1' }, { value: 2, label: '2' }]}
                        disabled={false}
                      />
                    </div>
                  </div>
                </div>

                {/* Gold Medal Match */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-yellow-900/20 border border-yellow-500/30">
                  <div className="flex items-center gap-2">
                    <span className="text-yellow-400 font-bold">🥇</span>
                    <span className="text-yellow-400 font-medium">Gold Match</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Best Of</span>
                      <StyledSelect
                        value={localMedalSettings.finals?.bestOf || 3}
                        onChange={(v) => setLocalMedalSettings((prev: any) => ({
                          ...prev,
                          finals: { ...prev.finals, bestOf: v },
                        }))}
                        options={[{ value: 1, label: '1' }, { value: 3, label: '3' }, { value: 5, label: '5' }]}
                        disabled={false}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Points</span>
                      <StyledSelect
                        value={localMedalSettings.finals?.pointsToWin || 11}
                        onChange={(v) => setLocalMedalSettings((prev: any) => ({
                          ...prev,
                          finals: { ...prev.finals, pointsToWin: v },
                        }))}
                        options={[{ value: 11, label: '11' }, { value: 15, label: '15' }, { value: 21, label: '21' }]}
                        disabled={false}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Win By</span>
                      <StyledSelect
                        value={localMedalSettings.finals?.winBy || 2}
                        onChange={(v) => setLocalMedalSettings((prev: any) => ({
                          ...prev,
                          finals: { ...prev.finals, winBy: v },
                        }))}
                        options={[{ value: 1, label: '1' }, { value: 2, label: '2' }]}
                        disabled={false}
                      />
                    </div>
                  </div>
                </div>

                {/* Bronze Medal Match */}
                {showBronzeRow && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-amber-900/20 border border-amber-500/30">
                    <div className="flex items-center gap-2">
                      <span className="text-amber-400 font-bold">🥉</span>
                      <span className="text-amber-400 font-medium">Bronze Match</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Best Of</span>
                        <StyledSelect
                          value={localMedalSettings.bronze?.bestOf || 3}
                          onChange={(v) => setLocalMedalSettings((prev: any) => ({
                            ...prev,
                            bronze: { ...prev.bronze, bestOf: v },
                          }))}
                          options={[{ value: 1, label: '1' }, { value: 3, label: '3' }, { value: 5, label: '5' }]}
                          disabled={false}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Points</span>
                        <StyledSelect
                          value={localMedalSettings.bronze?.pointsToWin || 11}
                          onChange={(v) => setLocalMedalSettings((prev: any) => ({
                            ...prev,
                            bronze: { ...prev.bronze, pointsToWin: v },
                          }))}
                          options={[{ value: 11, label: '11' }, { value: 15, label: '15' }, { value: 21, label: '21' }]}
                          disabled={false}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Win By</span>
                        <StyledSelect
                          value={localMedalSettings.bronze?.winBy || 2}
                          onChange={(v) => setLocalMedalSettings((prev: any) => ({
                            ...prev,
                            bronze: { ...prev.bronze, winBy: v },
                          }))}
                          options={[{ value: 1, label: '1' }, { value: 2, label: '2' }]}
                          disabled={false}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

            {/* Save Button */}
            <div className="pt-4">
              <button
                onClick={handleSaveMedalRules}
                className="
                  px-6 py-2.5 rounded-lg font-semibold text-sm
                  bg-gradient-to-r from-lime-600 to-lime-500
                  hover:from-lime-500 hover:to-lime-400
                  text-gray-900 shadow-lg shadow-lime-500/20
                  transition-all duration-200
                "
              >
                Save Medal Rules
              </button>
            </div>
          </div>
        </SettingsCard>
      )}

      {/* Main Medal Bracket */}
      <SettingsCard
        title="Medal Bracket"
        subtitle={isBracketLocked ? `${mainRegular.length} matches` : 'Awaiting pool completion'}
        icon={<TrophyIcon />}
        allowOverflow
        badge={isBracketLocked && (
          <span className="text-xs px-2.5 py-1 rounded-full bg-lime-500/20 text-lime-400 border border-lime-500/30">
            Generated
          </span>
        )}
      >
        <IllustrativeBracket
          matches={mainRegular}
          bronzeMatches={mainBronze}
          onUpdateScore={handleUpdateScore}
          onOpenScoreModal={(m) => {
            setScoreModalMatch(m);
            setIsScoreModalOpen(true);
          }}
          canEditMatch={canEditMatch}
          bracketTitle=""
          finalsLabel="Gold Medal Match"
          bracketType="main"
        />
      </SettingsCard>

      {/* Plate Bracket (if enabled) */}
      {activeDivision?.format?.plateEnabled && plateUiMatches.length > 0 && (
        <SettingsCard
          title={`${(activeDivision?.format as any)?.plateName || 'Plate'} Bracket`}
          subtitle={`${plateRegular.length} matches`}
          icon={<TrophyIcon />}
          allowOverflow
        >
          <IllustrativeBracket
            matches={plateRegular}
            bronzeMatches={plateBronze}
            onUpdateScore={handleUpdateScore}
            onOpenScoreModal={(m) => {
              setScoreModalMatch(m);
              setIsScoreModalOpen(true);
            }}
            canEditMatch={canEditMatch}
            bracketTitle=""
            finalsLabel={`${(activeDivision?.format as any)?.plateName || 'Plate'} Final`}
            bracketType="plate"
          />
        </SettingsCard>
      )}

      {/* Medal Match Rules - Shown AFTER bracket when locked (read-only view) */}
      {isOrganizer && isBracketLocked && (
        <SettingsCard
          title="Medal Match Rules"
          subtitle="Configure game settings for each bracket round"
          icon={<SettingsIcon />}
          badge={isBracketLocked && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
              Locked
            </span>
          )}
        >
          {isBracketLocked && (
            <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
              Medal rules are locked after bracket generation. Delete and re-generate bracket to modify.
            </div>
          )}

          {/* Toggle for separate medal settings */}
          <div className="flex items-center justify-between py-3 border-b border-gray-700/30">
            <div>
              <span className="text-white font-medium">Custom Bracket Rules</span>
              <p className="text-xs text-gray-500 mt-0.5">Enable different Best Of settings per round</p>
            </div>
            <StyledToggle
              checked={localMedalSettings.useSeparateMedalSettings}
              onChange={(checked) => !isBracketLocked && setLocalMedalSettings((prev: any) => ({
                ...prev,
                useSeparateMedalSettings: checked,
              }))}
              disabled={isBracketLocked}
            />
          </div>

          {/* Pool Play reference */}
          <div className="mt-4 p-4 rounded-lg bg-gray-800/50 border border-gray-700/30">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Pool Play Rules (Reference)</div>
            <div className="flex gap-6 text-sm">
              <span className="text-gray-300">Best Of: <span className="text-white font-medium">{poolSettings.bestOf}</span></span>
              <span className="text-gray-300">Points: <span className="text-white font-medium">{poolSettings.points}</span></span>
              <span className="text-gray-300">Win By: <span className="text-white font-medium">{poolSettings.winBy}</span></span>
            </div>
          </div>

          {/* Round-specific settings */}
          {localMedalSettings.useSeparateMedalSettings && (
            <div className="mt-6 space-y-4">
              <div className="text-xs text-gray-500 uppercase tracking-wider">Medal Round Rules</div>

              {/* Settings Grid */}
              <div className="grid gap-3">
                {/* Quarter-Finals */}
                {(showQuarterFinals || !isBracketLocked) && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800/30 border border-gray-700/30">
                    <span className="text-white font-medium">Quarter-Finals</span>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Best Of</span>
                        <StyledSelect
                          value={localMedalSettings.quarterFinals?.bestOf || 1}
                          onChange={(v) => !isBracketLocked && setLocalMedalSettings((prev: any) => ({
                            ...prev,
                            quarterFinals: { ...prev.quarterFinals, bestOf: v },
                          }))}
                          options={[{ value: 1, label: '1' }, { value: 3, label: '3' }, { value: 5, label: '5' }]}
                          disabled={isBracketLocked}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Points</span>
                        <StyledSelect
                          value={localMedalSettings.quarterFinals?.pointsToWin || 11}
                          onChange={(v) => !isBracketLocked && setLocalMedalSettings((prev: any) => ({
                            ...prev,
                            quarterFinals: { ...prev.quarterFinals, pointsToWin: v },
                          }))}
                          options={[{ value: 11, label: '11' }, { value: 15, label: '15' }, { value: 21, label: '21' }]}
                          disabled={isBracketLocked}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Win By</span>
                        <StyledSelect
                          value={localMedalSettings.quarterFinals?.winBy || 2}
                          onChange={(v) => !isBracketLocked && setLocalMedalSettings((prev: any) => ({
                            ...prev,
                            quarterFinals: { ...prev.quarterFinals, winBy: v },
                          }))}
                          options={[{ value: 1, label: '1' }, { value: 2, label: '2' }]}
                          disabled={isBracketLocked}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Semi-Finals */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800/30 border border-gray-700/30">
                  <span className="text-white font-medium">Semi-Finals</span>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Best Of</span>
                      <StyledSelect
                        value={localMedalSettings.semiFinals?.bestOf || 1}
                        onChange={(v) => !isBracketLocked && setLocalMedalSettings((prev: any) => ({
                          ...prev,
                          semiFinals: { ...prev.semiFinals, bestOf: v },
                        }))}
                        options={[{ value: 1, label: '1' }, { value: 3, label: '3' }, { value: 5, label: '5' }]}
                        disabled={isBracketLocked}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Points</span>
                      <StyledSelect
                        value={localMedalSettings.semiFinals?.pointsToWin || 11}
                        onChange={(v) => !isBracketLocked && setLocalMedalSettings((prev: any) => ({
                          ...prev,
                          semiFinals: { ...prev.semiFinals, pointsToWin: v },
                        }))}
                        options={[{ value: 11, label: '11' }, { value: 15, label: '15' }, { value: 21, label: '21' }]}
                        disabled={isBracketLocked}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Win By</span>
                      <StyledSelect
                        value={localMedalSettings.semiFinals?.winBy || 2}
                        onChange={(v) => !isBracketLocked && setLocalMedalSettings((prev: any) => ({
                          ...prev,
                          semiFinals: { ...prev.semiFinals, winBy: v },
                        }))}
                        options={[{ value: 1, label: '1' }, { value: 2, label: '2' }]}
                        disabled={isBracketLocked}
                      />
                    </div>
                  </div>
                </div>

                {/* Gold Medal Match */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-yellow-900/20 border border-yellow-500/30">
                  <div className="flex items-center gap-2">
                    <span className="text-yellow-400 font-bold">🥇</span>
                    <span className="text-yellow-400 font-medium">Gold Match</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Best Of</span>
                      <StyledSelect
                        value={localMedalSettings.finals?.bestOf || 3}
                        onChange={(v) => !isBracketLocked && setLocalMedalSettings((prev: any) => ({
                          ...prev,
                          finals: { ...prev.finals, bestOf: v },
                        }))}
                        options={[{ value: 1, label: '1' }, { value: 3, label: '3' }, { value: 5, label: '5' }]}
                        disabled={isBracketLocked}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Points</span>
                      <StyledSelect
                        value={localMedalSettings.finals?.pointsToWin || 11}
                        onChange={(v) => !isBracketLocked && setLocalMedalSettings((prev: any) => ({
                          ...prev,
                          finals: { ...prev.finals, pointsToWin: v },
                        }))}
                        options={[{ value: 11, label: '11' }, { value: 15, label: '15' }, { value: 21, label: '21' }]}
                        disabled={isBracketLocked}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Win By</span>
                      <StyledSelect
                        value={localMedalSettings.finals?.winBy || 2}
                        onChange={(v) => !isBracketLocked && setLocalMedalSettings((prev: any) => ({
                          ...prev,
                          finals: { ...prev.finals, winBy: v },
                        }))}
                        options={[{ value: 1, label: '1' }, { value: 2, label: '2' }]}
                        disabled={isBracketLocked}
                      />
                    </div>
                  </div>
                </div>

                {/* Bronze Medal Match */}
                {showBronzeRow && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-amber-900/20 border border-amber-500/30">
                    <div className="flex items-center gap-2">
                      <span className="text-amber-400 font-bold">🥉</span>
                      <span className="text-amber-400 font-medium">Bronze Match</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Best Of</span>
                        <StyledSelect
                          value={localMedalSettings.bronze?.bestOf || 3}
                          onChange={(v) => !isBracketLocked && setLocalMedalSettings((prev: any) => ({
                            ...prev,
                            bronze: { ...prev.bronze, bestOf: v },
                          }))}
                          options={[{ value: 1, label: '1' }, { value: 3, label: '3' }, { value: 5, label: '5' }]}
                          disabled={isBracketLocked}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Points</span>
                        <StyledSelect
                          value={localMedalSettings.bronze?.pointsToWin || 11}
                          onChange={(v) => !isBracketLocked && setLocalMedalSettings((prev: any) => ({
                            ...prev,
                            bronze: { ...prev.bronze, pointsToWin: v },
                          }))}
                          options={[{ value: 11, label: '11' }, { value: 15, label: '15' }, { value: 21, label: '21' }]}
                          disabled={isBracketLocked}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Win By</span>
                        <StyledSelect
                          value={localMedalSettings.bronze?.winBy || 2}
                          onChange={(v) => !isBracketLocked && setLocalMedalSettings((prev: any) => ({
                            ...prev,
                            bronze: { ...prev.bronze, winBy: v },
                          }))}
                          options={[{ value: 1, label: '1' }, { value: 2, label: '2' }]}
                          disabled={isBracketLocked}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Plate Bracket Settings */}
                {(activeDivision?.format as any)?.plateEnabled && (
                  <>
                    <div className="pt-4 mt-4 border-t border-gray-700/30">
                      <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">
                        {(activeDivision?.format as any)?.plateName || 'Plate'} Bracket Rules
                      </div>
                    </div>

                    {/* Plate Finals */}
                    <div className="flex items-center justify-between p-3 rounded-lg bg-gray-700/20 border border-gray-600/30">
                      <span className="text-gray-300 font-medium">
                        {(activeDivision?.format as any)?.plateName || 'Plate'} Final
                      </span>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">Best Of</span>
                          <StyledSelect
                            value={localMedalSettings.plateFinals?.bestOf || 1}
                            onChange={(v) => !isBracketLocked && setLocalMedalSettings((prev: any) => ({
                              ...prev,
                              plateFinals: { ...prev.plateFinals, bestOf: v },
                            }))}
                            options={[{ value: 1, label: '1' }, { value: 3, label: '3' }, { value: 5, label: '5' }]}
                            disabled={isBracketLocked}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">Points</span>
                          <StyledSelect
                            value={localMedalSettings.plateFinals?.pointsToWin || 11}
                            onChange={(v) => !isBracketLocked && setLocalMedalSettings((prev: any) => ({
                              ...prev,
                              plateFinals: { ...prev.plateFinals, pointsToWin: v },
                            }))}
                            options={[{ value: 11, label: '11' }, { value: 15, label: '15' }, { value: 21, label: '21' }]}
                            disabled={isBracketLocked}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">Win By</span>
                          <StyledSelect
                            value={localMedalSettings.plateFinals?.winBy || 2}
                            onChange={(v) => !isBracketLocked && setLocalMedalSettings((prev: any) => ({
                              ...prev,
                              plateFinals: { ...prev.plateFinals, winBy: v },
                            }))}
                            options={[{ value: 1, label: '1' }, { value: 2, label: '2' }]}
                            disabled={isBracketLocked}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Plate Bronze */}
                    {(activeDivision?.format as any)?.plateThirdPlace && (
                      <div className="flex items-center justify-between p-3 rounded-lg bg-gray-700/20 border border-gray-600/30">
                        <span className="text-gray-300 font-medium">
                          {(activeDivision?.format as any)?.plateName || 'Plate'} 3rd Place
                        </span>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">Best Of</span>
                            <StyledSelect
                              value={localMedalSettings.plateBronze?.bestOf || 1}
                              onChange={(v) => !isBracketLocked && setLocalMedalSettings((prev: any) => ({
                                ...prev,
                                plateBronze: { ...prev.plateBronze, bestOf: v },
                              }))}
                              options={[{ value: 1, label: '1' }, { value: 3, label: '3' }, { value: 5, label: '5' }]}
                              disabled={isBracketLocked}
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">Points</span>
                            <StyledSelect
                              value={localMedalSettings.plateBronze?.pointsToWin || 11}
                              onChange={(v) => !isBracketLocked && setLocalMedalSettings((prev: any) => ({
                                ...prev,
                                plateBronze: { ...prev.plateBronze, pointsToWin: v },
                              }))}
                              options={[{ value: 11, label: '11' }, { value: 15, label: '15' }, { value: 21, label: '21' }]}
                              disabled={isBracketLocked}
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">Win By</span>
                            <StyledSelect
                              value={localMedalSettings.plateBronze?.winBy || 2}
                              onChange={(v) => !isBracketLocked && setLocalMedalSettings((prev: any) => ({
                                ...prev,
                                plateBronze: { ...prev.plateBronze, winBy: v },
                              }))}
                              options={[{ value: 1, label: '1' }, { value: 2, label: '2' }]}
                              disabled={isBracketLocked}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Save Button */}
              {!isBracketLocked && (
                <div className="pt-4">
                  <button
                    onClick={handleSaveMedalRules}
                    className="
                      px-6 py-2.5 rounded-lg font-semibold text-sm
                      bg-gradient-to-r from-lime-600 to-lime-500
                      hover:from-lime-500 hover:to-lime-400
                      text-gray-900 shadow-lg shadow-lime-500/20
                      transition-all duration-200
                    "
                  >
                    Save Medal Rules
                  </button>
                </div>
              )}
            </div>
          )}
        </SettingsCard>
      )}

      {/* Score Entry Modal */}
      {isScoreModalOpen && scoreModalMatch && (
        <ScoreEntryModal
          isOpen={isScoreModalOpen}
          onClose={() => {
            setIsScoreModalOpen(false);
            setScoreModalMatch(null);
          }}
          match={{
            id: scoreModalMatch.id,
            sideA: {
              id: scoreModalMatch.team1?.id || '',
              name: scoreModalMatch.team1?.name || 'Team A',
              playerIds: [],
            },
            sideB: {
              id: scoreModalMatch.team2?.id || '',
              name: scoreModalMatch.team2?.name || 'Team B',
              playerIds: [],
            },
            gameSettings: (scoreModalMatch as any).gameSettings,
          } as any}
          onSubmit={handleScoreModalSubmit}
          isLoading={isSubmittingScore}
        />
      )}
    </div>
  );
};
