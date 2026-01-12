/**
 * Box Draft Week Panel Component V07.43
 *
 * Allows organizers to edit box assignments for draft weeks before activation.
 * Features drag-drop reordering within and between boxes.
 *
 * FILE LOCATION: components/leagues/boxLeague/BoxDraftWeekPanel.tsx
 * VERSION: V07.43
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
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { LeagueMember } from '../../../types';
import type { BoxLeagueWeek, BoxAssignment, WeekAbsence } from '../../../types/rotatingDoublesBox';
import {
  updateBoxAssignments,
  refreshDraftWeekAssignments,
  activateWeek,
} from '../../../services/rotatingDoublesBox';

// ============================================
// TYPES
// ============================================

interface BoxDraftWeekPanelProps {
  leagueId: string;
  week: BoxLeagueWeek;
  members: LeagueMember[];
  userRatings: Map<string, number | undefined>;
  isOrganizer: boolean;
  currentUserId: string;
  onClose: () => void;
  onActivated: () => void;
}

interface DraftPlayer {
  odUserId: string;
  displayName: string;
  duprRating?: number;
  boxNumber: number;
  position: number;
  isAbsent: boolean;
  substituteName?: string;
}

// Box colors - gradient from darker (top box) to lighter (bottom box)
const BOX_COLORS = [
  { bg: 'bg-blue-900', border: 'border-blue-700', hover: 'hover:bg-blue-800' },
  { bg: 'bg-blue-800', border: 'border-blue-600', hover: 'hover:bg-blue-700' },
  { bg: 'bg-blue-700', border: 'border-blue-500', hover: 'hover:bg-blue-600' },
  { bg: 'bg-sky-700', border: 'border-sky-500', hover: 'hover:bg-sky-600' },
  { bg: 'bg-sky-600', border: 'border-sky-400', hover: 'hover:bg-sky-500' },
  { bg: 'bg-cyan-600', border: 'border-cyan-400', hover: 'hover:bg-cyan-500' },
  { bg: 'bg-cyan-500', border: 'border-cyan-300', hover: 'hover:bg-cyan-400' },
  { bg: 'bg-teal-500', border: 'border-teal-300', hover: 'hover:bg-teal-400' },
];

const getBoxColors = (boxNumber: number) => {
  const index = Math.min(boxNumber - 1, BOX_COLORS.length - 1);
  return BOX_COLORS[index] || BOX_COLORS[BOX_COLORS.length - 1];
};

// ============================================
// SORTABLE PLAYER CARD
// ============================================

interface SortablePlayerCardProps {
  player: DraftPlayer;
  disabled?: boolean;
}

const SortablePlayerCard: React.FC<SortablePlayerCardProps> = ({ player, disabled }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: player.odUserId, disabled });

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
      className={`bg-gray-700/50 rounded-lg p-2 flex items-center justify-between cursor-grab active:cursor-grabbing ${
        isDragging ? 'shadow-lg ring-2 ring-lime-500' : ''
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${
        player.isAbsent ? 'border border-orange-500/50' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center text-xs font-bold text-white">
          {player.position}
        </div>
        <div>
          <div className="font-medium text-white text-sm flex items-center gap-2">
            {player.displayName}
            {player.isAbsent && (
              <span className="px-1.5 py-0.5 bg-orange-500/30 text-orange-300 rounded text-xs">
                Absent
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            {player.duprRating && (
              <span>DUPR: {player.duprRating.toFixed(2)}</span>
            )}
            {player.substituteName && (
              <span className="text-cyan-400">Sub: {player.substituteName}</span>
            )}
          </div>
        </div>
      </div>
      <div className="text-gray-500">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
        </svg>
      </div>
    </div>
  );
};

// ============================================
// PLAYER DRAG OVERLAY
// ============================================

const PlayerDragOverlay: React.FC<{ player: DraftPlayer }> = ({ player }) => (
  <div className="bg-gray-700 rounded-lg p-2 flex items-center justify-between shadow-2xl ring-2 ring-lime-500">
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 rounded-full bg-lime-500 flex items-center justify-center text-xs font-bold text-white">
        {player.position}
      </div>
      <div>
        <div className="font-medium text-white text-sm">{player.displayName}</div>
        {player.duprRating && (
          <div className="text-xs text-gray-400">DUPR: {player.duprRating.toFixed(2)}</div>
        )}
      </div>
    </div>
  </div>
);

// ============================================
// DROPPABLE BOX
// ============================================

interface DroppableBoxProps {
  boxNumber: number;
  players: DraftPlayer[];
  isOver?: boolean;
  disabled?: boolean;
  totalBoxes: number;
  isExpanded: boolean;
  onToggle: () => void;
}

const DroppableBox: React.FC<DroppableBoxProps> = ({
  boxNumber,
  players,
  isOver,
  disabled,
  totalBoxes,
  isExpanded,
  onToggle,
}) => {
  const colors = getBoxColors(boxNumber);
  const isValidSize = players.length >= 4 && players.length <= 6;

  return (
    <div
      className={`rounded-xl border-2 ${colors.border} overflow-hidden transition-all ${
        isOver ? 'ring-2 ring-lime-500 scale-[1.02]' : ''
      }`}
    >
      {/* Box Header - Clickable to toggle */}
      <button
        onClick={onToggle}
        className={`${colors.bg} px-3 py-2 flex items-center justify-between w-full text-left hover:brightness-110 transition-all`}
      >
        <div className="flex items-center gap-2">
          {/* Expand/Collapse Icon */}
          <svg
            className={`w-4 h-4 text-white/70 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-lg font-bold text-white">Box {boxNumber}</span>
          {boxNumber === 1 && (
            <span className="px-1.5 py-0.5 bg-yellow-400/20 text-yellow-400 rounded text-xs">
              Top
            </span>
          )}
          {boxNumber === totalBoxes && (
            <span className="px-1.5 py-0.5 bg-gray-600/50 text-gray-400 rounded text-xs">
              Entry
            </span>
          )}
        </div>
        <span className={`text-xs ${isValidSize ? 'text-white/70' : 'text-red-400 font-medium'}`}>
          {players.length} player{players.length !== 1 ? 's' : ''}
          {!isValidSize && ' (need 4-6)'}
        </span>
      </button>

      {/* Collapsed Preview - Show player names */}
      {!isExpanded && players.length > 0 && (
        <div className={`${colors.bg} bg-opacity-30 px-3 py-2 text-xs text-white/60 truncate`}>
          {players.map(p => p.displayName).join(' • ')}
        </div>
      )}

      {/* Players List - Only when expanded */}
      {isExpanded && (
        <SortableContext
          items={players.map(p => p.odUserId)}
          strategy={verticalListSortingStrategy}
        >
          <div className={`${colors.bg} bg-opacity-50 p-2 space-y-1 min-h-[120px]`}>
            {players.length === 0 ? (
              <div className="text-center text-gray-500 py-4 text-sm">
                Drop players here
              </div>
            ) : (
              players.map((player) => (
                <SortablePlayerCard
                  key={player.odUserId}
                  player={player}
                  disabled={disabled}
                />
              ))
            )}
          </div>
        </SortableContext>
      )}
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

export const BoxDraftWeekPanel: React.FC<BoxDraftWeekPanelProps> = ({
  leagueId,
  week,
  members,
  userRatings,
  isOrganizer: _isOrganizer, // Reserved for future access control
  currentUserId,
  onClose,
  onActivated,
}) => {
  // State
  const [localAssignments, setLocalAssignments] = useState<BoxAssignment[]>([]);
  const [activePlayer, setActivePlayer] = useState<DraftPlayer | null>(null);
  const [overBoxNumber, setOverBoxNumber] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [expandedBoxes, setExpandedBoxes] = useState<Set<number>>(new Set([1])); // Box 1 expanded by default

  // Initialize local assignments from week
  useEffect(() => {
    if (week.boxAssignments) {
      setLocalAssignments(week.boxAssignments);
      setHasChanges(false);
    }
  }, [week.boxAssignments]);

  // Build member lookup
  const memberMap = new Map(members.map(m => [m.userId, m]));

  // Build absence lookup
  const absenceMap = new Map<string, WeekAbsence>();
  if (week.absences) {
    for (const absence of week.absences) {
      absenceMap.set(absence.playerId, absence);
    }
  }

  // Convert assignments to DraftPlayer arrays grouped by box
  const playersByBox: Map<number, DraftPlayer[]> = new Map();

  for (const box of localAssignments) {
    const players: DraftPlayer[] = box.playerIds.map((userId, index) => {
      const member = memberMap.get(userId);
      const absence = absenceMap.get(userId);

      return {
        odUserId: userId,
        displayName: member?.displayName || 'Unknown Player',
        duprRating: userRatings.get(userId),
        boxNumber: box.boxNumber,
        position: index + 1,
        isAbsent: !!absence,
        substituteName: absence?.substituteName,
      };
    });

    playersByBox.set(box.boxNumber, players);
  }

  // Flatten all players for lookup
  const allPlayers: DraftPlayer[] = Array.from(playersByBox.values()).flat();

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

  // Find player by ID
  const findPlayer = (playerId: string): DraftPlayer | undefined => {
    return allPlayers.find(p => p.odUserId === playerId);
  };

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    const player = findPlayer(event.active.id as string);
    if (player) {
      setActivePlayer(player);
    }
  };

  // Handle drag over
  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (over) {
      const overPlayer = findPlayer(over.id as string);
      setOverBoxNumber(overPlayer?.boxNumber || null);
    } else {
      setOverBoxNumber(null);
    }
  };

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    setActivePlayer(null);
    setOverBoxNumber(null);

    if (!over || active.id === over.id) return;

    const activePlayerId = active.id as string;
    const overPlayerId = over.id as string;

    const activePlayerData = findPlayer(activePlayerId);
    const overPlayerData = findPlayer(overPlayerId);

    if (!activePlayerData || !overPlayerData) return;

    const fromBox = activePlayerData.boxNumber;
    const toBox = overPlayerData.boxNumber;

    setLocalAssignments(prev => {
      const newAssignments = [...prev];

      if (fromBox === toBox) {
        // Reordering within the same box
        const boxIndex = newAssignments.findIndex(b => b.boxNumber === fromBox);
        if (boxIndex === -1) return prev;

        const box = newAssignments[boxIndex];
        const oldIndex = box.playerIds.indexOf(activePlayerId);
        const newIndex = box.playerIds.indexOf(overPlayerId);

        if (oldIndex === -1 || newIndex === -1) return prev;

        newAssignments[boxIndex] = {
          ...box,
          playerIds: arrayMove(box.playerIds, oldIndex, newIndex),
        };
      } else {
        // Moving between boxes
        const fromBoxIndex = newAssignments.findIndex(b => b.boxNumber === fromBox);
        const toBoxIndex = newAssignments.findIndex(b => b.boxNumber === toBox);

        if (fromBoxIndex === -1 || toBoxIndex === -1) return prev;

        // Remove from source box
        const fromBoxData = newAssignments[fromBoxIndex];
        const fromPlayerIds = fromBoxData.playerIds.filter(id => id !== activePlayerId);

        // Add to target box at the position of the over player
        const toBoxData = newAssignments[toBoxIndex];
        const insertIndex = toBoxData.playerIds.indexOf(overPlayerId);
        const toPlayerIds = [...toBoxData.playerIds];
        toPlayerIds.splice(insertIndex, 0, activePlayerId);

        newAssignments[fromBoxIndex] = { ...fromBoxData, playerIds: fromPlayerIds };
        newAssignments[toBoxIndex] = { ...toBoxData, playerIds: toPlayerIds };
      }

      return newAssignments;
    });

    setHasChanges(true);
    setError(null);
  };

  // Validate assignments
  const validateAssignments = (): string | null => {
    for (const box of localAssignments) {
      if (box.playerIds.length < 4) {
        return `Box ${box.boxNumber} has only ${box.playerIds.length} players (minimum 4 required)`;
      }
      if (box.playerIds.length > 6) {
        return `Box ${box.boxNumber} has ${box.playerIds.length} players (maximum 6 allowed)`;
      }
    }
    return null;
  };

  // Save changes
  const handleSave = async () => {
    const validationError = validateAssignments();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await updateBoxAssignments(leagueId, week.weekNumber, localAssignments);
      setHasChanges(false);
    } catch (err) {
      console.error('Failed to save assignments:', err);
      setError((err as Error).message || 'Failed to save assignments');
    } finally {
      setSaving(false);
    }
  };

  // Reset to auto-calculated
  const handleReset = async () => {
    if (week.weekNumber < 2) {
      setError('Week 1 cannot be reset - it uses initial box assignments');
      return;
    }

    setResetting(true);
    setError(null);

    try {
      await refreshDraftWeekAssignments(leagueId, week.weekNumber);
      setHasChanges(false);
      // The parent will re-render with updated week data
    } catch (err) {
      console.error('Failed to reset assignments:', err);
      setError((err as Error).message || 'Failed to reset assignments');
    } finally {
      setResetting(false);
    }
  };

  // Activate week
  const handleActivate = async () => {
    const validationError = validateAssignments();
    if (validationError) {
      setError(validationError);
      return;
    }

    // Save any pending changes first
    if (hasChanges) {
      await handleSave();
    }

    setActivating(true);
    setError(null);

    try {
      await activateWeek(leagueId, week.weekNumber, currentUserId);
      onActivated();
    } catch (err) {
      console.error('Failed to activate week:', err);
      setError((err as Error).message || 'Failed to activate week');
    } finally {
      setActivating(false);
    }
  };

  const totalBoxes = localAssignments.length;
  const boxNumbers = localAssignments.map(b => b.boxNumber).sort((a, b) => a - b);

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="bg-gray-800 px-4 py-3 flex items-center justify-between border-b border-gray-700">
        <div>
          <h3 className="text-lg font-bold text-white">Week {week.weekNumber} Draft</h3>
          <p className="text-sm text-gray-400">Drag players to reorder or move between boxes</p>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Action Buttons */}
      <div className="px-4 py-3 bg-gray-800/50 border-b border-gray-700 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {week.weekNumber >= 2 && (
            <button
              onClick={handleReset}
              disabled={resetting || saving || activating}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {resetting ? 'Resetting...' : 'Reset to Auto'}
            </button>
          )}
          {hasChanges && (
            <button
              onClick={handleSave}
              disabled={saving || activating}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>

        {/* Only show Activate when no unsaved changes */}
        {!hasChanges && (
          <button
            onClick={handleActivate}
            disabled={activating || saving || resetting}
            className="px-4 py-2 bg-lime-600 hover:bg-lime-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {activating ? 'Activating...' : 'Activate Week'}
          </button>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mx-4 mt-3 bg-red-900/30 border border-red-600 rounded-lg p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Unsaved Changes Indicator */}
      {hasChanges && (
        <div className="mx-4 mt-3 bg-yellow-900/30 border border-yellow-600 rounded-lg p-3 text-sm text-yellow-300">
          You have unsaved changes
        </div>
      )}

      {/* Boxes Grid */}
      <div className="p-4">
        {/* Expand/Collapse Controls */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-400">{totalBoxes} boxes</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExpandedBoxes(new Set(boxNumbers))}
              className="px-2 py-1 text-xs text-gray-400 hover:text-white transition-colors"
            >
              Expand All
            </button>
            <span className="text-gray-600">|</span>
            <button
              onClick={() => setExpandedBoxes(new Set())}
              className="px-2 py-1 text-xs text-gray-400 hover:text-white transition-colors"
            >
              Collapse All
            </button>
          </div>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {boxNumbers.map(boxNumber => (
              <DroppableBox
                key={boxNumber}
                boxNumber={boxNumber}
                players={playersByBox.get(boxNumber) || []}
                isOver={overBoxNumber === boxNumber}
                disabled={saving || activating || resetting}
                totalBoxes={totalBoxes}
                isExpanded={expandedBoxes.has(boxNumber)}
                onToggle={() => {
                  setExpandedBoxes(prev => {
                    const next = new Set(prev);
                    if (next.has(boxNumber)) {
                      next.delete(boxNumber);
                    } else {
                      next.add(boxNumber);
                    }
                    return next;
                  });
                }}
              />
            ))}
          </div>

          {/* Drag Overlay */}
          <DragOverlay>
            {activePlayer ? <PlayerDragOverlay player={activePlayer} /> : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Absences Summary */}
      {week.absences && week.absences.length > 0 && (
        <div className="px-4 pb-4">
          <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
            <h4 className="text-sm font-medium text-white mb-2">
              Declared Absences ({week.absences.length})
            </h4>
            <div className="space-y-1">
              {week.absences.map(absence => {
                const member = memberMap.get(absence.playerId);
                return (
                  <div key={absence.playerId} className="flex items-center justify-between text-sm">
                    <span className="text-gray-300">
                      {member?.displayName || 'Unknown'} (Box {absence.boxNumber})
                      {absence.reason && (
                        <span className="text-gray-500 ml-2">- {absence.reason}</span>
                      )}
                    </span>
                    {absence.substituteName ? (
                      <span className="text-cyan-400">Sub: {absence.substituteName}</span>
                    ) : (
                      <span className="text-orange-400">No substitute</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BoxDraftWeekPanel;
