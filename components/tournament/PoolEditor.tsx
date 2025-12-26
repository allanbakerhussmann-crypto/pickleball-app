/**
 * Pool Editor Component
 *
 * Allows organizers to drag-and-drop teams between pools for manual seeding.
 * Uses @dnd-kit library for accessible, mobile-friendly drag-and-drop.
 *
 * @version 06.04
 * @file components/tournament/PoolEditor.tsx
 */

import React, { useState, useEffect, useMemo } from 'react';
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
import type { Team, Match, PoolAssignment } from '../../types';
import {
  generatePoolAssignments,
  savePoolAssignments,
  moveTeamBetweenPools,
  reorderTeamsInPool,
  getPoolLockStatus,
  validatePoolBalance,
} from '../../services/firebase/poolAssignments';

// ============================================
// TYPES
// ============================================

interface PoolEditorProps {
  tournamentId: string;
  divisionId: string;
  teams: Team[];
  matches: Match[];
  initialAssignments?: PoolAssignment[] | null;
  poolSize: number;
  onAssignmentsChange?: (assignments: PoolAssignment[]) => void;
  onSave?: () => void;
  getTeamDisplayName?: (teamId: string) => string;
}

interface TeamCardProps {
  team: Team;
  displayName: string;
  isDragging?: boolean;
  isLocked?: boolean;
}

// ============================================
// SORTABLE TEAM CARD
// ============================================

const SortableTeamCard: React.FC<{
  team: Team;
  displayName: string;
  isLocked?: boolean;
}> = ({ team, displayName, isLocked }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: team.id, disabled: isLocked });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Get DUPR rating if available
  const rating = team.avgDuprRating || team.seed;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`bg-gray-700 rounded-lg p-3 flex items-center justify-between ${
        isLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'
      } ${isDragging ? 'shadow-lg ring-2 ring-green-500' : ''}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex-shrink-0">
          {isLocked ? (
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
          )}
        </div>
        <div className="min-w-0">
          <div className="font-medium text-white truncate">{displayName}</div>
          {rating && (
            <div className="text-xs text-gray-400">
              {typeof rating === 'number' && rating > 0 ? `DUPR: ${rating.toFixed(2)}` : `Seed: ${rating}`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================
// TEAM DRAG OVERLAY
// ============================================

const TeamDragOverlay: React.FC<TeamCardProps> = ({ displayName }) => (
  <div className="bg-gray-700 rounded-lg p-3 flex items-center justify-between shadow-2xl ring-2 ring-green-500">
    <div className="flex items-center gap-3">
      <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
      </svg>
      <div className="font-medium text-white">{displayName}</div>
    </div>
  </div>
);

// ============================================
// DROPPABLE POOL COLUMN
// ============================================

const DroppablePool: React.FC<{
  poolName: string;
  teamIds: string[];
  teams: Team[];
  isOver?: boolean;
  isLocked?: boolean;
  getTeamDisplayName: (teamId: string) => string;
  onDeletePool?: (poolName: string) => void;
  canDelete?: boolean;
}> = ({ poolName, teamIds, teams, isOver, isLocked, getTeamDisplayName, onDeletePool, canDelete }) => {
  const poolTeams = teamIds
    .map(id => teams.find(t => t.id === id))
    .filter((t): t is Team => t !== undefined);

  return (
    <div
      className={`bg-gray-800 rounded-xl p-4 border transition-colors flex-1 min-w-[200px] ${
        isOver ? 'border-green-500 bg-green-900/10' : 'border-gray-700'
      } ${isLocked ? 'opacity-75' : ''}`}
    >
      {/* Pool Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-white">{poolName}</h3>
          {isLocked && (
            <span className="bg-red-600/20 text-red-400 text-[10px] px-1.5 py-0.5 rounded border border-red-600/30">
              Locked
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{poolTeams.length} teams</span>
          {/* Delete button for empty pools */}
          {teamIds.length === 0 && !isLocked && canDelete && onDeletePool && (
            <button
              onClick={() => onDeletePool(poolName)}
              className="text-red-400 hover:text-red-300 p-1 hover:bg-red-900/20 rounded transition-colors"
              title="Delete empty pool"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Sortable Team List */}
      <SortableContext
        items={teamIds}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2 min-h-[100px]">
          {poolTeams.length === 0 ? (
            <div className="text-center text-gray-500 py-4 text-sm">
              Drop teams here
            </div>
          ) : (
            poolTeams.map((team) => (
              <SortableTeamCard
                key={team.id}
                team={team}
                displayName={getTeamDisplayName(team.id)}
                isLocked={isLocked}
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

export const PoolEditor: React.FC<PoolEditorProps> = ({
  tournamentId,
  divisionId,
  teams,
  matches,
  initialAssignments,
  poolSize,
  onAssignmentsChange,
  onSave,
  getTeamDisplayName: externalGetTeamDisplayName,
}) => {
  const [assignments, setAssignments] = useState<PoolAssignment[]>([]);
  const [activeTeam, setActiveTeam] = useState<Team | null>(null);
  const [overPoolName, setOverPoolName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize assignments
  useEffect(() => {
    if (initialAssignments && initialAssignments.length > 0) {
      setAssignments(initialAssignments);
    } else if (teams.length > 0) {
      // Auto-generate pools
      const generated = generatePoolAssignments({ teams, poolSize });
      setAssignments(generated);
    }
  }, [initialAssignments, teams, poolSize]);

  // Get team display name helper
  const getTeamDisplayName = (teamId: string): string => {
    if (externalGetTeamDisplayName) {
      return externalGetTeamDisplayName(teamId);
    }
    const team = teams.find(t => t.id === teamId);
    return team?.teamName || team?.name || 'Unknown Team';
  };

  // Get pool lock status
  const lockStatus = useMemo(() => {
    return getPoolLockStatus(assignments, matches);
  }, [assignments, matches]);

  const isPoolLocked = (poolName: string): boolean => {
    const status = lockStatus.find(s => s.poolName === poolName);
    return status?.isLocked || false;
  };

  const hasAnyLockedPools = lockStatus.some(s => s.isLocked);

  // Validate balance
  const balanceValidation = useMemo(() => {
    return validatePoolBalance(assignments);
  }, [assignments]);

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

  // Find which pool a team belongs to
  const findPoolForTeam = (teamId: string): string | null => {
    for (const pool of assignments) {
      if (pool.teamIds.includes(teamId)) {
        return pool.poolName;
      }
    }
    return null;
  };

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    const team = teams.find(t => t.id === event.active.id);
    if (team) {
      setActiveTeam(team);
    }
  };

  // Handle drag over (for visual feedback)
  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (over) {
      const overTeamId = over.id as string;
      const overPool = findPoolForTeam(overTeamId);
      setOverPoolName(overPool);
    } else {
      setOverPoolName(null);
    }
  };

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    setActiveTeam(null);
    setOverPoolName(null);

    if (!over || active.id === over.id) return;

    const activeTeamId = active.id as string;
    const overTeamId = over.id as string;

    const fromPool = findPoolForTeam(activeTeamId);
    const toPool = findPoolForTeam(overTeamId);

    if (!fromPool || !toPool) return;

    // Check if source pool is locked
    if (isPoolLocked(fromPool)) {
      setError(`Cannot move teams from ${fromPool} - matches have started`);
      return;
    }

    // Check if target pool is locked
    if (isPoolLocked(toPool)) {
      setError(`Cannot move teams to ${toPool} - matches have started`);
      return;
    }

    setError(null);

    if (fromPool === toPool) {
      // Reordering within the same pool
      const pool = assignments.find(p => p.poolName === fromPool);
      if (!pool) return;

      const oldIndex = pool.teamIds.indexOf(activeTeamId);
      const newIndex = pool.teamIds.indexOf(overTeamId);
      const newOrder = arrayMove(pool.teamIds, oldIndex, newIndex);

      const newAssignments = reorderTeamsInPool(assignments, fromPool, newOrder);
      setAssignments(newAssignments);
      setHasChanges(true);
      onAssignmentsChange?.(newAssignments);
    } else {
      // Moving between pools
      const newAssignments = moveTeamBetweenPools(
        assignments,
        activeTeamId,
        fromPool,
        toPool
      );
      setAssignments(newAssignments);
      setHasChanges(true);
      onAssignmentsChange?.(newAssignments);
    }
  };

  // Reset to auto-seeding
  const handleReset = () => {
    if (hasAnyLockedPools) {
      setError('Cannot reset - some pools have started matches');
      return;
    }

    const generated = generatePoolAssignments({ teams, poolSize });
    setAssignments(generated);
    setHasChanges(true);
    setError(null);
    onAssignmentsChange?.(generated);
  };

  // Save assignments
  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      await savePoolAssignments(tournamentId, divisionId, assignments);
      setHasChanges(false);
      onSave?.();
    } catch (err) {
      console.error('Failed to save pool assignments:', err);
      setError('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  // Delete an empty pool
  const handleDeletePool = (poolName: string) => {
    const pool = assignments.find(p => p.poolName === poolName);
    if (!pool || pool.teamIds.length > 0) {
      setError('Cannot delete pool with teams');
      return;
    }

    // Require at least 2 pools
    if (assignments.length <= 2) {
      setError('Cannot delete - minimum 2 pools required');
      return;
    }

    const newAssignments = assignments.filter(p => p.poolName !== poolName);
    setAssignments(newAssignments);
    setHasChanges(true);
    setError(null);
    onAssignmentsChange?.(newAssignments);
  };

  if (teams.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <p className="text-gray-400 text-sm italic">
          No teams registered yet. Add teams before editing pools.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-green-400">Edit Pools</h2>
          <p className="text-sm text-gray-400">
            Drag teams between pools to adjust seeding
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            disabled={hasAnyLockedPools || saving}
            className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 text-gray-300 rounded transition-colors"
          >
            Reset to Auto-Seed
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="px-4 py-1.5 text-sm bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded transition-colors"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Validation Warning */}
      {!balanceValidation.isBalanced && (
        <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-3 text-sm text-yellow-400">
          <span className="font-medium">Warning:</span> {balanceValidation.message}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-900/30 border border-red-600/50 rounded-lg p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Lock Info */}
      {hasAnyLockedPools && (
        <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-3 text-sm text-gray-400">
          <span className="text-gray-300 font-medium">Note:</span> Some pools are locked because matches have started.
          You can only edit unlocked pools.
        </div>
      )}

      {/* Pool Columns */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {assignments.map((pool) => (
            <DroppablePool
              key={pool.poolName}
              poolName={pool.poolName}
              teamIds={pool.teamIds}
              teams={teams}
              isOver={overPoolName === pool.poolName}
              isLocked={isPoolLocked(pool.poolName)}
              getTeamDisplayName={getTeamDisplayName}
              onDeletePool={handleDeletePool}
              canDelete={assignments.length > 2}
            />
          ))}
        </div>

        {/* Drag Overlay */}
        <DragOverlay>
          {activeTeam && (
            <TeamDragOverlay
              team={activeTeam}
              displayName={getTeamDisplayName(activeTeam.id)}
            />
          )}
        </DragOverlay>
      </DndContext>

      {/* Pool Stats */}
      <div className="bg-gray-900/50 rounded-lg p-4 text-sm">
        <div className="flex flex-wrap gap-4 text-gray-400">
          <span>
            <span className="text-gray-300 font-medium">{teams.length}</span> teams
          </span>
          <span>
            <span className="text-gray-300 font-medium">{assignments.length}</span> pools
          </span>
          <span>
            <span className="text-gray-300 font-medium">{poolSize}</span> teams per pool (target)
          </span>
        </div>
      </div>
    </div>
  );
};

export default PoolEditor;
