/**
 * TiebreakerSettings - V06.37
 * Configure pool play tiebreaker order via drag-and-drop.
 *
 * Allows organizers to see and reorder the tiebreaker rules used
 * to determine pool standings when teams have the same wins.
 *
 * @file components/tournament/TiebreakerSettings.tsx
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

interface TiebreakerSettingsProps {
  tiebreakers: TiebreakerKey[];
  onChange: (newOrder: TiebreakerKey[]) => void;
  disabled?: boolean;
}

const TIEBREAKER_INFO: Record<TiebreakerKey, { label: string; description: string }> = {
  wins: { label: 'Wins', description: 'Total match wins' },
  head_to_head: { label: 'Head-to-Head', description: 'Result of direct match between tied teams' },
  point_diff: { label: 'Point Differential', description: 'Points scored minus points allowed' },
  points_scored: { label: 'Points Scored', description: 'Total points scored' },
};

// Sortable item component
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
    opacity: isDragging ? 0.5 : 1,
  };

  const info = TIEBREAKER_INFO[id];

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`flex items-start gap-3 p-3 bg-gray-800 rounded-lg border ${
        isDragging ? 'border-green-500 shadow-lg' : 'border-gray-600'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing hover:border-gray-500'}`}
    >
      {/* Drag handle icon */}
      <div className="text-gray-500 mt-0.5">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
        </svg>
      </div>
      {/* Number */}
      <span className="text-green-500 font-bold min-w-[20px]">{index + 1}.</span>
      {/* Label and description */}
      <div className="flex-1">
        <div className="text-white font-medium">{info.label}</div>
        <div className="text-xs text-gray-400">{info.description}</div>
      </div>
    </div>
  );
};

export const TiebreakerSettings: React.FC<TiebreakerSettingsProps> = ({
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
    <div className="mb-4 p-4 bg-gray-700/30 rounded-lg border border-gray-600">
      <label className="block text-xs text-gray-400 mb-2">Pool Tiebreaker Rules</label>
      <p className="text-xs text-gray-500 mb-3">
        When teams have the same number of wins, rankings are determined by these rules in order.
        {!disabled && ' Drag to reorder.'}
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
    </div>
  );
};
