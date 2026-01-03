/**
 * TiebreakerSettingsStyled - V07.02
 *
 * Redesigned tiebreaker settings with "scoreboard" aesthetic.
 * Features enhanced drag handles, rank badges, and smooth animations.
 *
 * @file components/tournament/TiebreakerSettingsStyled.tsx
 */
import React from 'react';
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type TiebreakerKey = 'wins' | 'head_to_head' | 'point_diff' | 'points_scored';

interface TiebreakerSettingsStyledProps {
  tiebreakers: TiebreakerKey[];
  onChange: (newOrder: TiebreakerKey[]) => void;
  disabled?: boolean;
}

const TIEBREAKER_INFO: Record<TiebreakerKey, {
  label: string;
  description: string;
  icon: React.ReactNode;
}> = {
  wins: {
    label: 'Wins',
    description: 'Total match wins',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  head_to_head: {
    label: 'Head-to-Head',
    description: 'Result of direct match between tied teams',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    ),
  },
  point_diff: {
    label: 'Point Differential',
    description: 'Points scored minus points allowed',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    ),
  },
  points_scored: {
    label: 'Points Scored',
    description: 'Total points scored',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
  },
};

// Rank badge component
const RankBadge: React.FC<{ rank: number }> = ({ rank }) => {
  const colors = [
    'from-amber-400 to-amber-600 text-amber-950', // 1st - gold
    'from-gray-300 to-gray-400 text-gray-800',     // 2nd - silver
    'from-orange-400 to-orange-600 text-orange-950', // 3rd - bronze
    'from-gray-500 to-gray-600 text-gray-200',     // 4th
  ];

  return (
    <div className={`
      w-8 h-8 rounded-lg flex items-center justify-center
      font-bold text-sm
      bg-gradient-to-br ${colors[rank - 1] || colors[3]}
      shadow-md
    `}>
      {rank}
    </div>
  );
};

// Drag handle with grip texture
const DragHandle: React.FC<{ isDragging: boolean; disabled: boolean }> = ({ isDragging, disabled }) => (
  <div className={`
    flex flex-col justify-center items-center gap-1 p-2 rounded-lg
    transition-all duration-200
    ${isDragging ? 'bg-lime-500/20' : 'bg-gray-700/50'}
    ${disabled ? 'opacity-30' : 'hover:bg-gray-600/50'}
  `}>
    <div className="flex gap-1">
      <div className={`w-1.5 h-1.5 rounded-full ${isDragging ? 'bg-lime-400' : 'bg-gray-500'}`} />
      <div className={`w-1.5 h-1.5 rounded-full ${isDragging ? 'bg-lime-400' : 'bg-gray-500'}`} />
    </div>
    <div className="flex gap-1">
      <div className={`w-1.5 h-1.5 rounded-full ${isDragging ? 'bg-lime-400' : 'bg-gray-500'}`} />
      <div className={`w-1.5 h-1.5 rounded-full ${isDragging ? 'bg-lime-400' : 'bg-gray-500'}`} />
    </div>
    <div className="flex gap-1">
      <div className={`w-1.5 h-1.5 rounded-full ${isDragging ? 'bg-lime-400' : 'bg-gray-500'}`} />
      <div className={`w-1.5 h-1.5 rounded-full ${isDragging ? 'bg-lime-400' : 'bg-gray-500'}`} />
    </div>
  </div>
);

// Sortable tiebreaker item
const SortableTiebreaker: React.FC<{
  id: TiebreakerKey;
  index: number;
  disabled: boolean;
}> = ({ id, index, disabled }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  const info = TIEBREAKER_INFO[id];

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`
        group relative
        flex items-center gap-4 p-3 rounded-xl
        transition-all duration-200 ease-out
        ${isDragging
          ? 'bg-gray-800/90 border-2 border-lime-500 shadow-2xl shadow-lime-500/20 scale-[1.02]'
          : 'bg-gray-800/50 border border-gray-700/50 hover:border-gray-600/70 hover:bg-gray-800/70'}
        ${disabled
          ? 'cursor-not-allowed opacity-60'
          : 'cursor-grab active:cursor-grabbing'}
      `}
    >
      {/* Drag Handle */}
      <DragHandle isDragging={isDragging} disabled={disabled} />

      {/* Rank Badge */}
      <RankBadge rank={index + 1} />

      {/* Icon */}
      <div className={`
        w-10 h-10 rounded-lg flex items-center justify-center
        transition-colors duration-200
        ${isDragging ? 'bg-lime-500/20 text-lime-400' : 'bg-gray-700/50 text-gray-400 group-hover:text-gray-300'}
      `}>
        {info.icon}
      </div>

      {/* Label and Description */}
      <div className="flex-1 min-w-0">
        <div className={`
          font-semibold transition-colors duration-200
          ${isDragging ? 'text-lime-300' : 'text-white'}
        `}>
          {info.label}
        </div>
        <div className="text-xs text-gray-500 truncate">{info.description}</div>
      </div>

      {/* Priority indicator */}
      <div className={`
        text-xs font-medium px-2 py-1 rounded-md
        transition-colors duration-200
        ${index === 0
          ? 'bg-lime-500/20 text-lime-400'
          : 'bg-gray-700/50 text-gray-500'}
      `}>
        {index === 0 ? 'Primary' : `Fallback ${index}`}
      </div>
    </div>
  );
};

export const TiebreakerSettingsStyled: React.FC<TiebreakerSettingsStyledProps> = ({
  tiebreakers,
  onChange,
  disabled = false,
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = tiebreakers.indexOf(active.id as TiebreakerKey);
    const newIndex = tiebreakers.indexOf(over.id as TiebreakerKey);
    onChange(arrayMove(tiebreakers, oldIndex, newIndex));
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-400 mb-4">
        When teams have the same number of wins, rankings are determined by these rules in order.
        {!disabled && (
          <span className="text-lime-500/70 ml-1">Drag to reorder priority.</span>
        )}
      </p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={tiebreakers} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {tiebreakers.map((key, index) => (
              <SortableTiebreaker key={key} id={key} index={index} disabled={disabled} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Visual hierarchy legend */}
      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-700/30">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div className="w-3 h-3 rounded bg-gradient-to-br from-amber-400 to-amber-600" />
          <span>Primary tiebreaker</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div className="w-3 h-3 rounded bg-gradient-to-br from-gray-300 to-gray-400" />
          <span>First fallback</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div className="w-3 h-3 rounded bg-gradient-to-br from-orange-400 to-orange-600" />
          <span>Second fallback</span>
        </div>
      </div>
    </div>
  );
};
