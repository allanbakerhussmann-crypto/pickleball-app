/**
 * Player Seeding List Component V05.44
 *
 * Allows organizers to reorder player seeding via drag-and-drop.
 * Works for ladder, swiss, and round-robin league formats.
 *
 * FILE LOCATION: components/leagues/PlayerSeedingList.tsx
 * VERSION: V05.44
 */

import React, { useState, useEffect } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
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
import type { LeagueMember } from '../../types';
import { updateMemberStats } from '../../services/firebase';

// ============================================
// TYPES
// ============================================

interface PlayerSeedingListProps {
  leagueId: string;
  members: LeagueMember[];
  onMembersUpdated?: () => void;
  disabled?: boolean;
  showStats?: boolean;
}

// ============================================
// SORTABLE MEMBER CARD
// ============================================

const SortableMemberCard: React.FC<{
  member: LeagueMember;
  rank: number;
  disabled?: boolean;
  showStats?: boolean;
}> = ({ member, rank, disabled, showStats }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: member.id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const stats = member.stats;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`bg-gray-800 rounded-lg p-3 flex items-center justify-between cursor-grab active:cursor-grabbing border ${
        isDragging ? 'shadow-lg ring-2 ring-primary border-primary' : 'border-gray-700'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <div className="flex items-center gap-3">
        {/* Rank Badge */}
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
          {rank}
        </div>

        {/* Player Info */}
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-white">
              {member.displayName}
              {/* V07.32: Show partner name for doubles teams */}
              {member.partnerDisplayName && (
                <span className="text-gray-400"> / {member.partnerDisplayName}</span>
              )}
            </span>
            {/* V07.26: Pending Partner Badge */}
            {member.status === 'pending_partner' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Pending Partner
              </span>
            )}
          </div>
          {showStats && stats && (
            <div className="text-xs text-gray-500">
              {stats.wins}W - {stats.losses}L
              {stats.draws > 0 && ` - ${stats.draws}D`}
            </div>
          )}
        </div>
      </div>

      {/* Points (if available) */}
      <div className="flex items-center gap-3">
        {showStats && stats && (
          <div className="text-sm text-gray-400">
            {stats.points} pts
          </div>
        )}

        {/* Drag Handle */}
        <div className="text-gray-500">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
          </svg>
        </div>
      </div>
    </div>
  );
};

// ============================================
// DRAG OVERLAY CARD
// ============================================

const MemberDragOverlay: React.FC<{
  member: LeagueMember;
  rank: number;
  showStats?: boolean;
}> = ({ member, rank, showStats }) => {
  const stats = member.stats;
  return (
    <div className="bg-gray-800 rounded-lg p-3 flex items-center justify-between shadow-2xl ring-2 ring-primary border border-primary">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-sm font-bold text-white">
          {rank}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-white">
              {member.displayName}
              {/* V07.32: Show partner name for doubles teams */}
              {member.partnerDisplayName && (
                <span className="text-gray-400"> / {member.partnerDisplayName}</span>
              )}
            </span>
            {/* V07.26: Pending Partner Badge */}
            {member.status === 'pending_partner' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Pending Partner
              </span>
            )}
          </div>
          {showStats && stats && (
            <div className="text-xs text-gray-500">
              {stats.wins}W - {stats.losses}L
            </div>
          )}
        </div>
      </div>
      {showStats && stats && (
        <div className="text-sm text-gray-400">
          {stats.points} pts
        </div>
      )}
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

export const PlayerSeedingList: React.FC<PlayerSeedingListProps> = ({
  leagueId,
  members,
  onMembersUpdated,
  disabled = false,
  showStats = true,
}) => {
  const [activeMember, setActiveMember] = useState<LeagueMember | null>(null);
  const [activeRank, setActiveRank] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localMembers, setLocalMembers] = useState<LeagueMember[]>(members);

  // Update local members when props change - sort by currentRank
  useEffect(() => {
    setLocalMembers([...members].sort((a, b) => (a.currentRank || 999) - (b.currentRank || 999)));
  }, [members]);

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

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    const member = localMembers.find(m => m.id === event.active.id);
    if (member) {
      setActiveMember(member);
      setActiveRank(localMembers.findIndex(m => m.id === member.id) + 1);
    }
  };

  // Handle drag end
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    setActiveMember(null);
    setActiveRank(0);

    if (!over || active.id === over.id) return;

    const oldIndex = localMembers.findIndex(m => m.id === active.id);
    const newIndex = localMembers.findIndex(m => m.id === over.id);

    // Optimistic update
    const newOrder = arrayMove(localMembers, oldIndex, newIndex);
    setLocalMembers(newOrder);

    setSaving(true);
    setError(null);

    try {
      // Update ranks for all affected members
      const updates: Promise<void>[] = [];
      for (let i = 0; i < newOrder.length; i++) {
        const member = newOrder[i];
        if (member.currentRank !== i + 1) {
          // Pass empty stats update and newRank to update the rank
          updates.push(
            updateMemberStats(leagueId, member.id, {}, i + 1)
          );
        }
      }

      await Promise.all(updates);
      onMembersUpdated?.();
    } catch (err: any) {
      console.error('Failed to update seeding:', err);
      setError(err.message || 'Failed to update seeding');
      setLocalMembers(members); // Revert
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Player Seeding</h2>
        <div className="flex items-center gap-2">
          {saving && (
            <span className="text-sm text-primary animate-pulse">Saving...</span>
          )}
          <span className="text-sm text-gray-500">{localMembers.length} players</span>
        </div>
      </div>

      {/* Instructions */}
      <p className="text-sm text-gray-400">
        Drag players to reorder their seeding. Position 1 is the top seed.
      </p>

      {/* Error message */}
      {error && (
        <div className="bg-red-900/30 border border-red-600 rounded-lg p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Sortable list */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={localMembers.map(m => m.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {localMembers.map((member, index) => (
              <SortableMemberCard
                key={member.id}
                member={member}
                rank={index + 1}
                disabled={disabled || saving}
                showStats={showStats}
              />
            ))}
          </div>
        </SortableContext>

        {/* Drag overlay */}
        <DragOverlay>
          {activeMember ? (
            <MemberDragOverlay
              member={activeMember}
              rank={activeRank}
              showStats={showStats}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
};

export default PlayerSeedingList;
