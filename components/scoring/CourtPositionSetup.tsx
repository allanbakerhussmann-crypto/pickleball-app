/**
 * Court Position Setup Component
 *
 * Pre-game setup screen for positioning players on the court.
 * - Drag players to left/right positions
 * - Select Server 1 for each team
 * - Select which team serves first
 *
 * FILE: components/scoring/CourtPositionSetup.tsx
 * VERSION: V06.04
 */

import React, { useState, useEffect } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { ScoringTeam, PlayerPositions, PlayType } from '../../types/scoring';

// =============================================================================
// PROPS
// =============================================================================

interface CourtPositionSetupProps {
  teamA: ScoringTeam;
  teamB: ScoringTeam;
  playType: PlayType;
  onSetupComplete: (config: {
    teamA: ScoringTeam;
    teamB: ScoringTeam;
    firstServingTeam: 'A' | 'B';
    server1Index: { A: 0 | 1; B: 0 | 1 };
  }) => void;
  onCancel?: () => void;
}

// =============================================================================
// DRAGGABLE PLAYER CHIP
// =============================================================================

interface PlayerChipProps {
  id: string;
  name: string;
  color: string;
  isServer1: boolean;
  onToggleServer1?: () => void;
  isDragging?: boolean;
}

const PlayerChip: React.FC<PlayerChipProps> = ({
  id,
  name,
  color,
  isServer1,
  onToggleServer1,
  isDragging = false,
}) => {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        backgroundColor: color,
        opacity: isDragging ? 0.5 : 1,
      }}
      {...listeners}
      {...attributes}
      className="px-4 py-3 rounded-lg cursor-grab active:cursor-grabbing text-white font-medium flex items-center gap-2 min-w-[100px] justify-center relative touch-none"
    >
      {isServer1 && (
        <span className="absolute -top-1 -left-1 text-yellow-400 text-lg" title="Server 1">
          ★
        </span>
      )}
      <span className="truncate">{name}</span>
      {onToggleServer1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleServer1();
          }}
          className="ml-1 text-xs bg-white/20 hover:bg-white/30 rounded px-1.5 py-0.5"
          title={isServer1 ? 'Remove Server 1' : 'Set as Server 1'}
        >
          {isServer1 ? '★' : '☆'}
        </button>
      )}
    </div>
  );
};

// =============================================================================
// DROPPABLE COURT ZONE
// =============================================================================

interface CourtDropZoneProps {
  id: string;
  label: string;
  player: string | null;
  color: string;
  isServer1: boolean;
  onToggleServer1?: () => void;
  isEmpty: boolean;
}

const CourtDropZone: React.FC<CourtDropZoneProps> = ({
  id,
  label,
  player,
  color,
  isServer1,
  onToggleServer1,
  isEmpty,
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id,
  });

  return (
    <div className="text-center">
      <div className="text-gray-400 text-xs mb-1">{label}</div>
      <div
        ref={setNodeRef}
        className={`w-24 h-16 rounded-lg border-2 border-dashed flex items-center justify-center transition-all ${
          isOver
            ? 'border-white bg-white/20 scale-105'
            : isEmpty
            ? 'border-gray-500 bg-gray-700/50'
            : 'border-transparent'
        }`}
      >
        {player ? (
          <div
            className="px-3 py-2 rounded text-white font-medium text-sm flex items-center gap-1 relative"
            style={{ backgroundColor: color }}
          >
            {isServer1 && (
              <span className="absolute -top-1 -left-1 text-yellow-400 text-sm">★</span>
            )}
            <span className="truncate max-w-[60px]">{player}</span>
            {onToggleServer1 && (
              <button
                onClick={onToggleServer1}
                className="text-xs bg-white/20 hover:bg-white/30 rounded px-1 py-0.5 ml-1"
                title={isServer1 ? 'Remove Server 1' : 'Set as Server 1'}
              >
                {isServer1 ? '★' : '☆'}
              </button>
            )}
          </div>
        ) : (
          <span className="text-gray-500 text-xs">Drop here</span>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const CourtPositionSetup: React.FC<CourtPositionSetupProps> = ({
  teamA,
  teamB,
  playType,
  onSetupComplete,
  onCancel,
}) => {
  const isDoubles = playType === 'doubles';

  // State for player positions
  const [teamAPositions, setTeamAPositions] = useState<PlayerPositions | null>(null);
  const [teamBPositions, setTeamBPositions] = useState<PlayerPositions | null>(null);

  // State for Server 1 selection (index in players array)
  const [server1A, setServer1A] = useState<0 | 1>(0);
  const [server1B, setServer1B] = useState<0 | 1>(0);

  // State for first serving team
  const [firstServingTeam, setFirstServingTeam] = useState<'A' | 'B'>('A');

  // Dragging state
  const [activeId, setActiveId] = useState<string | null>(null);

  // Sensors for drag-and-drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  // Initialize positions for singles (auto-place)
  useEffect(() => {
    if (!isDoubles) {
      const playerA = teamA.players?.[0] || 'Player A';
      const playerB = teamB.players?.[0] || 'Player B';

      // For singles, player is on right at start (even score = 0)
      setTeamAPositions({ left: '', right: playerA });
      setTeamBPositions({ left: '', right: playerB });
    }
  }, [isDoubles, teamA.players, teamB.players]);

  // Get unplaced players for a team
  const getUnplacedPlayers = (
    team: ScoringTeam,
    positions: PlayerPositions | null
  ): string[] => {
    if (!team.players) return [];
    if (!positions) return team.players;

    return team.players.filter(
      (p) => p !== positions.left && p !== positions.right
    );
  };

  const unplacedA = getUnplacedPlayers(teamA, teamAPositions);
  const unplacedB = getUnplacedPlayers(teamB, teamBPositions);

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const playerId = active.id as string;
    const dropZone = over.id as string;

    // Parse drop zone (e.g., "A-left", "B-right")
    const [team, position] = dropZone.split('-') as ['A' | 'B', 'left' | 'right'];

    // Find which team the player belongs to
    const isTeamAPlayer = teamA.players?.includes(playerId);
    const isTeamBPlayer = teamB.players?.includes(playerId);

    // Only allow dropping on same team's side
    if ((team === 'A' && !isTeamAPlayer) || (team === 'B' && !isTeamBPlayer)) {
      return;
    }

    // Update positions
    if (team === 'A') {
      setTeamAPositions((prev) => {
        const newPositions: PlayerPositions = {
          left: prev?.left || '',
          right: prev?.right || '',
        };

        // Remove player from old position if they were already placed
        if (prev?.left === playerId) newPositions.left = '';
        if (prev?.right === playerId) newPositions.right = '';

        // If the target position has a player, swap them
        const existingPlayer = prev?.[position] || '';
        if (existingPlayer && existingPlayer !== playerId) {
          // Find old position of dragged player
          const oldPosition = prev?.left === playerId ? 'left' : prev?.right === playerId ? 'right' : null;
          if (oldPosition) {
            newPositions[oldPosition] = existingPlayer;
          }
        }

        // Place player in new position
        newPositions[position] = playerId;
        return newPositions;
      });
    } else {
      setTeamBPositions((prev) => {
        const newPositions: PlayerPositions = {
          left: prev?.left || '',
          right: prev?.right || '',
        };

        if (prev?.left === playerId) newPositions.left = '';
        if (prev?.right === playerId) newPositions.right = '';

        const existingPlayer = prev?.[position] || '';
        if (existingPlayer && existingPlayer !== playerId) {
          const oldPosition = prev?.left === playerId ? 'left' : prev?.right === playerId ? 'right' : null;
          if (oldPosition) {
            newPositions[oldPosition] = existingPlayer;
          }
        }

        newPositions[position] = playerId;
        return newPositions;
      });
    }
  };

  // Check if setup is complete
  const isSetupComplete = () => {
    if (!isDoubles) {
      // Singles just needs first serving team selection
      return true;
    }

    // Doubles needs all 4 players positioned
    return (
      teamAPositions?.left &&
      teamAPositions?.right &&
      teamBPositions?.left &&
      teamBPositions?.right
    );
  };

  // Handle complete
  const handleComplete = () => {
    if (!isSetupComplete()) return;

    // Build final team objects with positions
    const finalTeamA: ScoringTeam = {
      ...teamA,
      playerPositions: isDoubles
        ? teamAPositions!
        : { left: '', right: teamA.players?.[0] || '' },
    };

    const finalTeamB: ScoringTeam = {
      ...teamB,
      playerPositions: isDoubles
        ? teamBPositions!
        : { left: '', right: teamB.players?.[0] || '' },
    };

    onSetupComplete({
      teamA: finalTeamA,
      teamB: finalTeamB,
      firstServingTeam,
      server1Index: { A: server1A, B: server1B },
    });
  };

  // Get active player name for drag overlay
  const getActivePlayerName = (): string | null => {
    if (!activeId) return null;
    if (teamA.players?.includes(activeId)) return activeId;
    if (teamB.players?.includes(activeId)) return activeId;
    return null;
  };

  const activePlayerName = getActivePlayerName();
  const activePlayerTeam = activeId && teamA.players?.includes(activeId) ? 'A' : 'B';
  const activePlayerColor = activePlayerTeam === 'A' ? teamA.color : teamB.color;

  // Check if a player is Server 1 based on their position
  const isPlayerServer1 = (team: 'A' | 'B', playerName: string): boolean => {
    const teamObj = team === 'A' ? teamA : teamB;
    const server1Idx = team === 'A' ? server1A : server1B;
    return teamObj.players?.[server1Idx] === playerName;
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="bg-gray-900 min-h-screen text-white p-4">
        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold mb-2">Position Setup</h2>
          <p className="text-gray-400">
            {isDoubles
              ? 'Drag players to their starting positions'
              : 'Select who serves first'}
          </p>
        </div>

        {/* First Serving Team Selection */}
        <div className="mb-6">
          <div className="text-center text-sm text-gray-400 mb-2">
            Who serves first?
          </div>
          <div className="flex justify-center gap-4">
            <button
              onClick={() => setFirstServingTeam('A')}
              className={`px-6 py-3 rounded-lg font-medium transition-all ${
                firstServingTeam === 'A'
                  ? 'ring-2 ring-white scale-105'
                  : 'opacity-60 hover:opacity-80'
              }`}
              style={{ backgroundColor: teamA.color }}
            >
              {teamA.name}
            </button>
            <button
              onClick={() => setFirstServingTeam('B')}
              className={`px-6 py-3 rounded-lg font-medium transition-all ${
                firstServingTeam === 'B'
                  ? 'ring-2 ring-white scale-105'
                  : 'opacity-60 hover:opacity-80'
              }`}
              style={{ backgroundColor: teamB.color }}
            >
              {teamB.name}
            </button>
          </div>
        </div>

        {/* Court and Positions (Doubles only) */}
        {isDoubles && (
          <>
            {/* Unplaced Players - Team A */}
            {unplacedA.length > 0 && (
              <div className="mb-4">
                <div className="text-center text-sm text-gray-400 mb-2">
                  {teamA.name} - Drag to court
                </div>
                <div className="flex justify-center gap-3">
                  {unplacedA.map((player) => (
                    <PlayerChip
                      key={player}
                      id={player}
                      name={player}
                      color={teamA.color}
                      isServer1={isPlayerServer1('A', player)}
                      onToggleServer1={() => {
                        const idx = teamA.players?.indexOf(player) ?? 0;
                        setServer1A(idx as 0 | 1);
                      }}
                      isDragging={activeId === player}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Court Diagram */}
            <div className="bg-green-600 rounded-lg p-4 mb-4">
              {/* Team A Side */}
              <div className="mb-2">
                <div className="text-center text-white/60 text-sm mb-2">
                  {teamA.name} Side
                </div>
                <div className="flex justify-center gap-8">
                  <CourtDropZone
                    id="A-left"
                    label="LEFT"
                    player={teamAPositions?.left || null}
                    color={teamA.color}
                    isServer1={teamAPositions?.left ? isPlayerServer1('A', teamAPositions.left) : false}
                    onToggleServer1={
                      teamAPositions?.left
                        ? () => {
                            const idx = teamA.players?.indexOf(teamAPositions.left) ?? 0;
                            setServer1A(idx as 0 | 1);
                          }
                        : undefined
                    }
                    isEmpty={!teamAPositions?.left}
                  />
                  <CourtDropZone
                    id="A-right"
                    label="RIGHT"
                    player={teamAPositions?.right || null}
                    color={teamA.color}
                    isServer1={teamAPositions?.right ? isPlayerServer1('A', teamAPositions.right) : false}
                    onToggleServer1={
                      teamAPositions?.right
                        ? () => {
                            const idx = teamA.players?.indexOf(teamAPositions.right) ?? 0;
                            setServer1A(idx as 0 | 1);
                          }
                        : undefined
                    }
                    isEmpty={!teamAPositions?.right}
                  />
                </div>
              </div>

              {/* Net */}
              <div className="flex items-center justify-center my-4">
                <div className="bg-gray-300 h-1 w-3/4 rounded-full" />
                <span className="absolute text-white/40 text-xs">NET</span>
              </div>

              {/* Team B Side */}
              <div>
                <div className="flex justify-center gap-8">
                  <CourtDropZone
                    id="B-left"
                    label="LEFT"
                    player={teamBPositions?.left || null}
                    color={teamB.color}
                    isServer1={teamBPositions?.left ? isPlayerServer1('B', teamBPositions.left) : false}
                    onToggleServer1={
                      teamBPositions?.left
                        ? () => {
                            const idx = teamB.players?.indexOf(teamBPositions.left) ?? 0;
                            setServer1B(idx as 0 | 1);
                          }
                        : undefined
                    }
                    isEmpty={!teamBPositions?.left}
                  />
                  <CourtDropZone
                    id="B-right"
                    label="RIGHT"
                    player={teamBPositions?.right || null}
                    color={teamB.color}
                    isServer1={teamBPositions?.right ? isPlayerServer1('B', teamBPositions.right) : false}
                    onToggleServer1={
                      teamBPositions?.right
                        ? () => {
                            const idx = teamB.players?.indexOf(teamBPositions.right) ?? 0;
                            setServer1B(idx as 0 | 1);
                          }
                        : undefined
                    }
                    isEmpty={!teamBPositions?.right}
                  />
                </div>
                <div className="text-center text-white/60 text-sm mt-2">
                  {teamB.name} Side
                </div>
              </div>
            </div>

            {/* Unplaced Players - Team B */}
            {unplacedB.length > 0 && (
              <div className="mb-4">
                <div className="text-center text-sm text-gray-400 mb-2">
                  {teamB.name} - Drag to court
                </div>
                <div className="flex justify-center gap-3">
                  {unplacedB.map((player) => (
                    <PlayerChip
                      key={player}
                      id={player}
                      name={player}
                      color={teamB.color}
                      isServer1={isPlayerServer1('B', player)}
                      onToggleServer1={() => {
                        const idx = teamB.players?.indexOf(player) ?? 0;
                        setServer1B(idx as 0 | 1);
                      }}
                      isDragging={activeId === player}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Legend */}
            <div className="text-center text-sm text-gray-400 mb-4">
              <span className="text-yellow-400">★</span> = Server 1 (tap player's star to change)
            </div>
          </>
        )}

        {/* Singles Info */}
        {!isDoubles && (
          <div className="bg-gray-800 rounded-lg p-4 mb-6 text-center">
            <p className="text-gray-400 mb-2">Singles match</p>
            <p className="text-sm text-gray-500">
              Server starts on the RIGHT (even score = 0)
              <br />
              Position changes automatically based on score
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-4 justify-center">
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleComplete}
            disabled={!isSetupComplete()}
            className={`px-8 py-3 rounded-lg font-medium transition-all ${
              isSetupComplete()
                ? 'bg-green-600 hover:bg-green-500'
                : 'bg-gray-600 opacity-50 cursor-not-allowed'
            }`}
          >
            Start Match
          </button>
        </div>

        {/* Validation message */}
        {isDoubles && !isSetupComplete() && (
          <p className="text-center text-yellow-500 text-sm mt-4">
            Place all players on the court to continue
          </p>
        )}
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activePlayerName && (
          <div
            className="px-4 py-3 rounded-lg text-white font-medium shadow-lg"
            style={{ backgroundColor: activePlayerColor }}
          >
            {activePlayerName}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
};

export default CourtPositionSetup;
