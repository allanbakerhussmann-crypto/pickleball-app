/**
 * Court Visualization Component
 *
 * Visual representation of a pickleball court showing player positions,
 * current server, and serving side (left/right based on even/odd score).
 *
 * FILE: components/scoring/CourtVisualization.tsx
 * VERSION: V06.04
 */

import React from 'react';
import type { LiveScore } from '../../types/scoring';
import { getServerPosition, getServerInfo } from '../../services/scoring/scoringLogic';

// =============================================================================
// PROPS
// =============================================================================

interface CourtVisualizationProps {
  /** Current live score state */
  state: LiveScore;
  /** Compact mode for smaller displays */
  compact?: boolean;
  /** Show legend below court */
  showLegend?: boolean;
  /** Dark theme (for light backgrounds) */
  darkTheme?: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

export const CourtVisualization: React.FC<CourtVisualizationProps> = ({
  state,
  compact = false,
  showLegend = true,
  darkTheme = false,
}) => {
  const { teamA, teamB, servingTeam, serverNumber, scoreA, scoreB, settings } = state;

  const isDoubles = settings.playType === 'doubles';
  const servingTeamScore = servingTeam === 'A' ? scoreA : scoreB;
  const serverPosition = getServerPosition(servingTeamScore);
  const serverInfo = getServerInfo(state);

  // Get player names for positions
  const getPlayerName = (team: typeof teamA, position: 'left' | 'right'): string => {
    if (team.playerPositions) {
      return team.playerPositions[position];
    }
    // Fallback to players array
    if (team.players && team.players.length > 0) {
      if (!isDoubles) return team.players[0];
      return position === 'right' ? team.players[0] : team.players[1] || team.players[0];
    }
    return position === 'right' ? 'Player 1' : 'Player 2';
  };

  // Check if a player is currently serving
  const isServing = (team: 'A' | 'B', position: 'left' | 'right'): boolean => {
    if (team !== servingTeam) return false;
    return position === serverPosition;
  };

  // Check if this is Server 1 (star indicator)
  const isServer1 = (team: 'A' | 'B', position: 'left' | 'right'): boolean => {
    if (!state.server1PlayerIndex) return false;

    const teamObj = team === 'A' ? teamA : teamB;
    const server1Idx = state.server1PlayerIndex[team];

    if (!teamObj.players || teamObj.players.length < 2) return false;

    const server1Name = teamObj.players[server1Idx];
    const playerAtPosition = getPlayerName(teamObj, position);

    return playerAtPosition === server1Name;
  };

  // Colors
  const bgColor = darkTheme ? 'bg-white' : 'bg-gray-800';
  const textColor = darkTheme ? 'text-gray-800' : 'text-white';
  const courtColor = 'bg-green-600';
  const netColor = darkTheme ? 'bg-gray-600' : 'bg-gray-300';
  const labelColor = darkTheme ? 'text-gray-500' : 'text-gray-400';

  // Sizing
  const height = compact ? 'h-40' : 'h-56';
  const playerBoxSize = compact ? 'w-16 h-12' : 'w-24 h-16';
  const fontSize = compact ? 'text-xs' : 'text-sm';
  const iconSize = compact ? 'text-xs' : 'text-sm';

  // Player box component
  const PlayerBox: React.FC<{
    team: 'A' | 'B';
    position: 'left' | 'right';
    teamColor: string;
  }> = ({ team, position, teamColor }) => {
    const teamObj = team === 'A' ? teamA : teamB;
    const playerName = getPlayerName(teamObj, position);
    const serving = isServing(team, position);
    const server1 = isServer1(team, position);

    return (
      <div
        className={`${playerBoxSize} rounded-lg flex flex-col items-center justify-center relative ${fontSize} font-medium transition-all`}
        style={{
          backgroundColor: serving ? teamColor : `${teamColor}66`,
          border: serving ? '2px solid white' : 'none',
          boxShadow: serving ? '0 0 10px rgba(255,255,255,0.5)' : 'none',
        }}
      >
        {/* Server 1 star indicator */}
        {server1 && isDoubles && (
          <span className={`absolute -top-1 -left-1 ${iconSize}`} title="Server 1">
            ★
          </span>
        )}

        {/* Currently serving indicator */}
        {serving && (
          <span className={`absolute -top-1 -right-1 ${iconSize} animate-pulse`} title="Currently Serving">
            ●
          </span>
        )}

        {/* Player name */}
        <span className="text-white truncate max-w-full px-1">
          {compact ? playerName.split(' ')[0] : playerName}
        </span>

        {/* Serving label */}
        {serving && !compact && (
          <span className="text-white/70 text-[10px] mt-0.5">
            SERVING
          </span>
        )}
      </div>
    );
  };

  return (
    <div className={`${bgColor} rounded-lg p-3 ${textColor}`}>
      {/* Server Position Indicator */}
      <div className="text-center mb-2">
        <span className={`${labelColor} ${fontSize}`}>
          {serverInfo.teamName} serving from{' '}
          <span className="font-bold uppercase">
            {serverPosition}
          </span>
          {isDoubles && (
            <span className="ml-1">
              (Server {serverNumber})
            </span>
          )}
        </span>
      </div>

      {/* Court */}
      <div className={`${courtColor} rounded-lg ${height} relative overflow-hidden`}>
        {/* Team A Side (Top) */}
        <div className="absolute top-0 left-0 right-0 h-[45%] flex items-center justify-center">
          {/* Team label */}
          <div className={`absolute top-1 left-2 ${fontSize} text-white/60`}>
            {teamA.name}
            {servingTeam === 'A' && <span className="ml-1 text-yellow-400">●</span>}
          </div>

          {/* Players */}
          <div className="flex gap-4 items-center">
            {/* Left position */}
            <div className="text-center">
              <div className={`${labelColor} ${fontSize} mb-1`}>LEFT</div>
              {isDoubles ? (
                <PlayerBox team="A" position="left" teamColor={teamA.color} />
              ) : (
                /* Singles - only show player on serving side */
                serverPosition === 'left' && servingTeam === 'A' ? (
                  <PlayerBox team="A" position="left" teamColor={teamA.color} />
                ) : (
                  <div className={`${playerBoxSize} rounded-lg bg-gray-500/20`} />
                )
              )}
            </div>

            {/* Right position */}
            <div className="text-center">
              <div className={`${labelColor} ${fontSize} mb-1`}>RIGHT</div>
              {isDoubles ? (
                <PlayerBox team="A" position="right" teamColor={teamA.color} />
              ) : (
                /* Singles - only show player on serving side */
                serverPosition === 'right' && servingTeam === 'A' ? (
                  <PlayerBox team="A" position="right" teamColor={teamA.color} />
                ) : servingTeam === 'B' ? (
                  /* Receiving side for singles */
                  <PlayerBox team="A" position="right" teamColor={teamA.color} />
                ) : (
                  <div className={`${playerBoxSize} rounded-lg bg-gray-500/20`} />
                )
              )}
            </div>
          </div>
        </div>

        {/* Net */}
        <div className="absolute top-[45%] left-0 right-0 h-[10%] flex items-center justify-center">
          <div className={`${netColor} h-1 w-[90%] rounded-full`} />
          <span className="absolute text-white/40 text-[10px]">NET</span>
        </div>

        {/* Team B Side (Bottom) */}
        <div className="absolute bottom-0 left-0 right-0 h-[45%] flex items-center justify-center">
          {/* Team label */}
          <div className={`absolute bottom-1 right-2 ${fontSize} text-white/60`}>
            {teamB.name}
            {servingTeam === 'B' && <span className="ml-1 text-yellow-400">●</span>}
          </div>

          {/* Players */}
          <div className="flex gap-4 items-center">
            {/* Left position */}
            <div className="text-center">
              {isDoubles ? (
                <PlayerBox team="B" position="left" teamColor={teamB.color} />
              ) : (
                /* Singles */
                serverPosition === 'left' && servingTeam === 'B' ? (
                  <PlayerBox team="B" position="left" teamColor={teamB.color} />
                ) : (
                  <div className={`${playerBoxSize} rounded-lg bg-gray-500/20`} />
                )
              )}
              <div className={`${labelColor} ${fontSize} mt-1`}>LEFT</div>
            </div>

            {/* Right position */}
            <div className="text-center">
              {isDoubles ? (
                <PlayerBox team="B" position="right" teamColor={teamB.color} />
              ) : (
                /* Singles */
                serverPosition === 'right' && servingTeam === 'B' ? (
                  <PlayerBox team="B" position="right" teamColor={teamB.color} />
                ) : servingTeam === 'A' ? (
                  <PlayerBox team="B" position="right" teamColor={teamB.color} />
                ) : (
                  <div className={`${playerBoxSize} rounded-lg bg-gray-500/20`} />
                )
              )}
              <div className={`${labelColor} ${fontSize} mt-1`}>RIGHT</div>
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      {showLegend && (
        <div className={`flex justify-center gap-4 mt-2 ${fontSize} ${labelColor}`}>
          {isDoubles && (
            <span>★ Server 1</span>
          )}
          <span>● Serving</span>
          <span>
            {servingTeamScore % 2 === 0 ? 'Even' : 'Odd'} score = {serverPosition.toUpperCase()}
          </span>
        </div>
      )}
    </div>
  );
};

export default CourtVisualization;
