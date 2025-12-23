/**
 * Box Player Drag Drop Component V05.44
 *
 * Allows organizers to drag players between boxes for rebalancing.
 * Uses @dnd-kit library for accessible, mobile-friendly drag-and-drop.
 *
 * FILE LOCATION: components/leagues/boxLeague/BoxPlayerDragDrop.tsx
 * VERSION: V05.44
 */

import React, { useState, useEffect } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { BoxLeaguePlayer } from '../../../types/boxLeague';
import {
  movePlayerBetweenBoxes,
  reorderPlayersInBox,
} from '../../../services/firebase';

// ============================================
// TYPES
// ============================================

interface BoxPlayerDragDropProps {
  leagueId: string;
  players: BoxLeaguePlayer[];
  boxCount: number;
  boxSize: number;
  onPlayersUpdated?: () => void;
  disabled?: boolean;
}

interface PlayerCardProps {
  player: BoxLeaguePlayer;
  isDragging?: boolean;
}

// ============================================
// SORTABLE PLAYER CARD
// ============================================

const SortablePlayerCard: React.FC<{
  player: BoxLeaguePlayer;
  disabled?: boolean;
}> = ({ player, disabled }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: player.id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`bg-gray-700 rounded-lg p-3 flex items-center justify-between cursor-grab active:cursor-grabbing ${
        isDragging ? 'shadow-lg ring-2 ring-primary' : ''
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-sm font-bold text-white">
          {player.positionInBox}
        </div>
        <div>
          <div className="font-medium text-white">{player.displayName}</div>
          {player.duprDoublesRating && (
            <div className="text-xs text-gray-400">
              DUPR: {player.duprDoublesRating.toFixed(2)}
            </div>
          )}
        </div>
      </div>
      <div className="text-gray-500">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
        </svg>
      </div>
    </div>
  );
};

// ============================================
// DRAGGING PLAYER OVERLAY
// ============================================

const PlayerDragOverlay: React.FC<PlayerCardProps> = ({ player }) => (
  <div className="bg-gray-700 rounded-lg p-3 flex items-center justify-between shadow-2xl ring-2 ring-primary">
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-sm font-bold text-white">
        {player.positionInBox}
      </div>
      <div>
        <div className="font-medium text-white">{player.displayName}</div>
        {player.duprDoublesRating && (
          <div className="text-xs text-gray-400">
            DUPR: {player.duprDoublesRating.toFixed(2)}
          </div>
        )}
      </div>
    </div>
  </div>
);

// ============================================
// DROPPABLE BOX
// ============================================

const DroppableBox: React.FC<{
  boxNumber: number;
  players: BoxLeaguePlayer[];
  isOver?: boolean;
  disabled?: boolean;
}> = ({ boxNumber, players, isOver, disabled }) => {
  return (
    <div
      className={`bg-gray-800 rounded-xl p-4 border transition-colors ${
        isOver ? 'border-primary bg-primary/10' : 'border-gray-700'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-white">Box {boxNumber}</h3>
        <span className="text-xs text-gray-500">{players.length} players</span>
      </div>
      <SortableContext
        items={players.map(p => p.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2 min-h-[100px]">
          {players.length === 0 ? (
            <div className="text-center text-gray-500 py-4">
              Drop players here
            </div>
          ) : (
            players.map((player) => (
              <SortablePlayerCard
                key={player.id}
                player={player}
                disabled={disabled}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

export const BoxPlayerDragDrop: React.FC<BoxPlayerDragDropProps> = ({
  leagueId,
  players,
  boxCount,
  boxSize: _boxSize, // Reserved for future validation
  onPlayersUpdated,
  disabled = false,
}) => {
  const [activePlayer, setActivePlayer] = useState<BoxLeaguePlayer | null>(null);
  const [overBoxNumber, setOverBoxNumber] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localPlayers, setLocalPlayers] = useState<BoxLeaguePlayer[]>(players);

  // Update local players when props change
  useEffect(() => {
    setLocalPlayers(players);
  }, [players]);

  // Sensors for drag detection
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Group players by box
  const playersByBox: Record<number, BoxLeaguePlayer[]> = {};
  for (let i = 1; i <= boxCount; i++) {
    playersByBox[i] = localPlayers
      .filter(p => p.currentBoxNumber === i)
      .sort((a, b) => a.positionInBox - b.positionInBox);
  }

  // Find which box a player ID belongs to
  const findBoxForPlayer = (playerId: string): number | null => {
    const player = localPlayers.find(p => p.id === playerId);
    return player?.currentBoxNumber || null;
  };

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    const player = localPlayers.find(p => p.id === event.active.id);
    if (player) {
      setActivePlayer(player);
    }
  };

  // Handle drag over (for visual feedback)
  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (over) {
      // Check if we're over a box container
      const overPlayerId = over.id as string;
      const overBox = findBoxForPlayer(overPlayerId);
      setOverBoxNumber(overBox);
    } else {
      setOverBoxNumber(null);
    }
  };

  // Handle drag end
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    setActivePlayer(null);
    setOverBoxNumber(null);

    if (!over || active.id === over.id) return;

    const activePlayerId = active.id as string;
    const overPlayerId = over.id as string;

    const activePlayer = localPlayers.find(p => p.id === activePlayerId);
    const overPlayer = localPlayers.find(p => p.id === overPlayerId);

    if (!activePlayer || !overPlayer) return;

    const fromBox = activePlayer.currentBoxNumber;
    const toBox = overPlayer.currentBoxNumber;

    setSaving(true);
    setError(null);

    try {
      if (fromBox === toBox) {
        // Reordering within the same box
        const boxPlayers = playersByBox[fromBox];
        const oldIndex = boxPlayers.findIndex(p => p.id === activePlayerId);
        const newIndex = boxPlayers.findIndex(p => p.id === overPlayerId);

        const newOrder = [...boxPlayers];
        const [removed] = newOrder.splice(oldIndex, 1);
        newOrder.splice(newIndex, 0, removed);

        // Optimistic update
        setLocalPlayers(prev => {
          const updated = [...prev];
          newOrder.forEach((player, index) => {
            const idx = updated.findIndex(p => p.id === player.id);
            if (idx >= 0) {
              updated[idx] = { ...updated[idx], positionInBox: index + 1 };
            }
          });
          return updated;
        });

        const result = await reorderPlayersInBox(
          leagueId,
          fromBox,
          newOrder.map(p => p.id)
        );

        if (!result.success) {
          setError(result.message);
          setLocalPlayers(players); // Revert
        } else {
          onPlayersUpdated?.();
        }
      } else {
        // Moving between boxes
        const newPosition = overPlayer.positionInBox;

        // Optimistic update
        setLocalPlayers(prev => {
          return prev.map(p => {
            if (p.id === activePlayerId) {
              return { ...p, currentBoxNumber: toBox, positionInBox: newPosition };
            }
            return p;
          });
        });

        const result = await movePlayerBetweenBoxes(
          leagueId,
          activePlayerId,
          fromBox,
          toBox,
          newPosition
        );

        if (!result.success) {
          setError(result.message);
          setLocalPlayers(players); // Revert
        } else {
          onPlayersUpdated?.();
        }
      }
    } catch (err: any) {
      console.error('Drag operation failed:', err);
      setError(err.message || 'Failed to move player');
      setLocalPlayers(players); // Revert
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Manage Boxes</h2>
        {saving && (
          <span className="text-sm text-primary animate-pulse">Saving...</span>
        )}
      </div>

      {/* Instructions */}
      <p className="text-sm text-gray-400">
        Drag players to reorder within a box or move them between boxes.
      </p>

      {/* Error message */}
      {error && (
        <div className="bg-red-900/30 border border-red-600 rounded-lg p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Drag context */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {/* Boxes grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: boxCount }, (_, i) => i + 1).map(boxNumber => (
            <DroppableBox
              key={boxNumber}
              boxNumber={boxNumber}
              players={playersByBox[boxNumber] || []}
              isOver={overBoxNumber === boxNumber}
              disabled={disabled || saving}
            />
          ))}
        </div>

        {/* Drag overlay */}
        <DragOverlay>
          {activePlayer ? <PlayerDragOverlay player={activePlayer} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
};

export default BoxPlayerDragDrop;
