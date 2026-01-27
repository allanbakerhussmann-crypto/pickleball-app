/**
 * StepSchedule Component
 *
 * Step 4: Configure schedule, capacity, and tiebreakers.
 *
 * FILE LOCATION: components/teamLeague/wizard/StepSchedule.tsx
 * VERSION: V07.55
 */

import React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getMinimumWeeksRequired } from '../../../types/teamLeague';

export interface ScheduleData {
  maxTeams: number;
  numberOfWeeks: number;
  scheduleType: 'round_robin' | 'double_round_robin' | 'custom';
  defaultMatchDay: number;
  defaultMatchTime: string;
  tieBreakerOrder: ('matchWins' | 'boardDiff' | 'headToHead' | 'pointDiff')[];
}

interface StepScheduleProps {
  data: ScheduleData;
  onChange: (data: ScheduleData) => void;
  errors: Record<string, string>;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const TIEBREAKER_OPTIONS = [
  { value: 'matchWins', label: 'Match Wins' },
  { value: 'boardDiff', label: 'Board Differential' },
  { value: 'headToHead', label: 'Head-to-Head' },
  { value: 'pointDiff', label: 'Point Differential' },
];

// ============================================
// SORTABLE TIEBREAKER ITEM
// ============================================

interface SortableTiebreakerItemProps {
  id: string;
  index: number;
  label: string;
}

const SortableTiebreakerItem: React.FC<SortableTiebreakerItemProps> = ({ id, index, label }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        flex items-center gap-3 p-3 bg-gray-700/50 rounded-lg
        ${isDragging ? 'opacity-80 shadow-lg ring-2 ring-amber-500' : ''}
      `}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-white touch-none"
        {...attributes}
        {...listeners}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
        </svg>
      </button>
      <span className="w-6 h-6 rounded-full bg-gray-600 text-gray-300 flex items-center justify-center text-sm font-bold">
        {index + 1}
      </span>
      <span className="flex-1 text-white">{label}</span>
    </div>
  );
};

export const StepSchedule: React.FC<StepScheduleProps> = ({
  data,
  onChange,
  errors,
}) => {
  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleChange = (field: keyof ScheduleData, value: unknown) => {
    onChange({ ...data, [field]: value });
  };

  const minWeeksRequired = getMinimumWeeksRequired(data.maxTeams, data.scheduleType);
  const hasEnoughWeeks = data.numberOfWeeks >= minWeeksRequired;
  const extraWeeks = data.numberOfWeeks - minWeeksRequired;

  // Handle drag end for tiebreaker reordering
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = data.tieBreakerOrder.indexOf(active.id as typeof data.tieBreakerOrder[number]);
      const newIndex = data.tieBreakerOrder.indexOf(over.id as typeof data.tieBreakerOrder[number]);
      const newOrder = arrayMove(data.tieBreakerOrder, oldIndex, newIndex);
      onChange({ ...data, tieBreakerOrder: newOrder });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Schedule & Capacity</h2>
        <p className="text-gray-400 text-sm">Configure league capacity and scheduling preferences.</p>
      </div>

      {/* League Capacity */}
      <div className={`
        bg-gray-800/50 border rounded-lg p-4
        ${errors.schedule ? 'border-red-500' : 'border-amber-600/50'}
      `}>
        <div className="flex items-center gap-2 mb-4">
          <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3 className="text-lg font-semibold text-white">League Capacity</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Maximum Teams
            </label>
            <input
              type="number"
              min="2"
              max="20"
              value={data.maxTeams}
              onChange={(e) => handleChange('maxTeams', parseInt(e.target.value) || 8)}
              className="w-full bg-gray-700 text-white p-3 rounded-lg border border-gray-600 focus:border-amber-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Number of Weeks
            </label>
            <input
              type="number"
              min="1"
              max="52"
              value={data.numberOfWeeks}
              onChange={(e) => handleChange('numberOfWeeks', parseInt(e.target.value) || 10)}
              className={`
                w-full bg-gray-700 text-white p-3 rounded-lg border
                ${!hasEnoughWeeks ? 'border-red-500' : 'border-gray-600'}
                focus:border-amber-500 outline-none
              `}
            />
          </div>
        </div>

        {/* Info box */}
        <div className={`
          p-3 rounded-lg flex items-start gap-3
          ${hasEnoughWeeks ? 'bg-blue-900/30 border border-blue-800' : 'bg-red-900/30 border border-red-800'}
        `}>
          <svg className={`w-5 h-5 shrink-0 mt-0.5 ${hasEnoughWeeks ? 'text-blue-400' : 'text-red-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className={`text-sm ${hasEnoughWeeks ? 'text-blue-300' : 'text-red-300'}`}>
            {hasEnoughWeeks ? (
              <>
                {data.scheduleType === 'round_robin' ? 'Round Robin' : 'Double Round Robin'} with {data.maxTeams} teams requires {minWeeksRequired} weeks.
                {extraWeeks > 0 && (
                  <> You have {extraWeeks} extra week{extraWeeks !== 1 ? 's' : ''} for postponements/playoffs.</>
                )}
              </>
            ) : (
              <>
                {data.scheduleType === 'double_round_robin' ? 'Double Round Robin' : 'Round Robin'} with {data.maxTeams} teams requires at least {minWeeksRequired} weeks.
                Please increase the number of weeks.
              </>
            )}
          </div>
        </div>

        {errors.schedule && <p className="mt-2 text-sm text-red-400">{errors.schedule}</p>}
      </div>

      {/* Schedule Type */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Schedule Type</h3>

        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-700/50 transition-colors">
            <input
              type="radio"
              name="scheduleType"
              checked={data.scheduleType === 'round_robin'}
              onChange={() => handleChange('scheduleType', 'round_robin')}
              className="w-5 h-5 border-gray-600 bg-gray-700 text-amber-600 focus:ring-amber-500"
            />
            <div>
              <span className="text-white font-medium">Round Robin</span>
              <p className="text-xs text-gray-500">Every team plays every other team once</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-700/50 transition-colors">
            <input
              type="radio"
              name="scheduleType"
              checked={data.scheduleType === 'double_round_robin'}
              onChange={() => handleChange('scheduleType', 'double_round_robin')}
              className="w-5 h-5 border-gray-600 bg-gray-700 text-amber-600 focus:ring-amber-500"
            />
            <div>
              <span className="text-white font-medium">Double Round Robin</span>
              <p className="text-xs text-gray-500">Home and away matches (requires 2x weeks)</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-700/50 transition-colors">
            <input
              type="radio"
              name="scheduleType"
              checked={data.scheduleType === 'custom'}
              onChange={() => handleChange('scheduleType', 'custom')}
              className="w-5 h-5 border-gray-600 bg-gray-700 text-amber-600 focus:ring-amber-500"
            />
            <div>
              <span className="text-white font-medium">Custom Schedule</span>
              <p className="text-xs text-gray-500">Set matches manually after league creation</p>
            </div>
          </label>
        </div>
      </div>

      {/* Default Match Day/Time */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Default Match Day & Time</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Default Match Day
            </label>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((day, index) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleChange('defaultMatchDay', index)}
                  className={`
                    px-3 py-2 rounded-lg text-sm font-medium transition-colors
                    ${data.defaultMatchDay === index
                      ? 'bg-amber-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }
                  `}
                >
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Default Start Time
            </label>
            <input
              type="time"
              value={data.defaultMatchTime}
              onChange={(e) => handleChange('defaultMatchTime', e.target.value)}
              className="w-full bg-gray-700 text-white p-3 rounded-lg border border-gray-600 focus:border-amber-500 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Tiebreaker Order */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Tiebreaker Order</h3>
        <p className="text-sm text-gray-400 mb-4">
          Drag to reorder how ties in standings are resolved:
        </p>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={data.tieBreakerOrder}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {data.tieBreakerOrder.map((tb, index) => {
                const option = TIEBREAKER_OPTIONS.find(o => o.value === tb);
                return (
                  <SortableTiebreakerItem
                    key={tb}
                    id={tb}
                    index={index}
                    label={option?.label || tb}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
};

export default StepSchedule;
