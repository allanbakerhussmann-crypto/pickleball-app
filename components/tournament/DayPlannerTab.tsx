/**
 * DayPlannerTab - V07.11
 *
 * Tournament Day Planner with drag-and-drop division assignment.
 * Features "Sports Command Center" aesthetic with dramatic visual hierarchy.
 *
 * Key Features:
 * - Day columns showing capacity utilization
 * - Proportionally-sized division bars based on duration
 * - Drag-and-drop to move divisions between days
 * - Unassigned section for divisions without a day
 * - Add Day button to create tournament days post-creation
 * - Start Day button to activate a day's divisions
 * - Split detection for divisions exceeding day capacity (V07.11)
 *
 * @file components/tournament/DayPlannerTab.tsx
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { Tournament, Division, Team, TournamentDay } from '../../types';
import { formatTime } from '../../utils/timeFormat';
import { addTournamentDay, startTournamentDay } from '../../services/firebase/tournaments';
import { RollingTimePicker } from '../shared/RollingTimePicker';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface DayPlannerTabProps {
  tournament: Tournament;
  divisions: Division[];
  teams: Team[];
  courtCount?: number;
  isAdmin?: boolean;
  onDivisionDayChange?: (divisionId: string, newDayId: string) => Promise<void>;
  onTournamentUpdate?: () => void;  // Callback to refresh tournament data after adding a day
}

interface DivisionWithDuration extends Division {
  duration: number;      // Minutes
  teamCount: number;
  matchCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const DIVISION_COLORS = [
  { bg: 'from-blue-600 to-blue-700', border: 'border-blue-500/50', glow: 'shadow-blue-500/20' },
  { bg: 'from-emerald-600 to-emerald-700', border: 'border-emerald-500/50', glow: 'shadow-emerald-500/20' },
  { bg: 'from-violet-600 to-violet-700', border: 'border-violet-500/50', glow: 'shadow-violet-500/20' },
  { bg: 'from-amber-600 to-amber-700', border: 'border-amber-500/50', glow: 'shadow-amber-500/20' },
  { bg: 'from-rose-600 to-rose-700', border: 'border-rose-500/50', glow: 'shadow-rose-500/20' },
  { bg: 'from-cyan-600 to-cyan-700', border: 'border-cyan-500/50', glow: 'shadow-cyan-500/20' },
];

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

const parseTimeToMinutes = (time: string): number => {
  if (!time) return 0;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + (minutes || 0);
};

const formatDuration = (minutes: number): string => {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};

const formatDateDisplay = (dateStr: string): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

// Calculate match count based on format
const calculateMatchCount = (format: string, teamCount: number): number => {
  if (teamCount < 2) return 0;
  switch (format) {
    case 'round_robin': return Math.floor((teamCount * (teamCount - 1)) / 2);
    case 'single_elim':
    case 'singles_elimination': return teamCount - 1;
    case 'double_elim':
    case 'doubles_elimination': return (teamCount - 1) * 2;
    case 'pool_play_medals': return Math.ceil(teamCount * 1.5); // Estimate
    default: return Math.max(teamCount - 1, 0);
  }
};

// Calculate duration based on matches and settings
const calculateDivisionDuration = (
  matchCount: number,
  courtCount: number = 4,
  minutesPerSlot: number = 25
): number => {
  return Math.ceil((matchCount / Math.max(courtCount, 1)) * minutesPerSlot);
};

// ═══════════════════════════════════════════════════════════════════════════
// DRAGGABLE DIVISION BAR
// ═══════════════════════════════════════════════════════════════════════════

interface DraggableDivisionBarProps {
  division: DivisionWithDuration;
  colorIndex: number;
  maxDuration: number;
  isDragging: boolean;
}

const DraggableDivisionBar: React.FC<DraggableDivisionBarProps> = ({
  division,
  colorIndex,
  maxDuration,
  isDragging,
}) => {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: division.id,
    data: { division },
  });

  const colors = DIVISION_COLORS[colorIndex % DIVISION_COLORS.length];

  // Height proportional to duration (min 60px, max 200px)
  const heightPercent = Math.max(0.3, Math.min(1, division.duration / maxDuration));
  const height = 60 + (heightPercent * 140);

  const style = {
    transform: CSS.Translate.toString(transform),
    height: `${height}px`,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={style}
      className={`
        group relative w-full cursor-grab active:cursor-grabbing
        bg-gradient-to-br ${colors.bg}
        border ${colors.border}
        rounded-xl overflow-hidden
        shadow-lg ${colors.glow} hover:shadow-xl
        transition-all duration-200 ease-out
        hover:scale-[1.02] hover:-translate-y-0.5
        ${isDragging ? 'ring-2 ring-white/50 scale-105' : ''}
      `}
    >
      {/* Top highlight */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

      {/* Scanline texture */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)',
      }} />

      {/* Content */}
      <div className="relative h-full p-3 flex flex-col justify-between">
        {/* Header row */}
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-white text-sm truncate pr-2">
              {division.name}
            </h4>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-white/70 text-xs font-medium">
                ~{formatDuration(division.duration)}
              </span>
              <span className="text-white/40">•</span>
              <span className="text-white/60 text-xs">
                {division.teamCount} teams
              </span>
            </div>
          </div>

          {/* Drag handle */}
          <div className="flex-shrink-0 text-white/40 group-hover:text-white/70 transition-colors">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="9" cy="5" r="1.5" />
              <circle cx="15" cy="5" r="1.5" />
              <circle cx="9" cy="12" r="1.5" />
              <circle cx="15" cy="12" r="1.5" />
              <circle cx="9" cy="19" r="1.5" />
              <circle cx="15" cy="19" r="1.5" />
            </svg>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-white/50 text-xs">
          <span>{division.matchCount} matches</span>
          {/* V07.11: Multi-day indicator */}
          {(division as any)._isMultiDay && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-white/10 rounded text-white/70 text-[10px] font-medium">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {(division as any)._dayCount} days
            </span>
          )}
        </div>
      </div>

      {/* Bottom accent line */}
      <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-white/0 via-white/20 to-white/0" />

      {/* V07.11: Multi-day visual indicator stripe */}
      {(division as any)._isMultiDay && (
        <div className="absolute top-0 right-0 w-6 h-full bg-gradient-to-l from-amber-500/20 to-transparent" />
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// ADD DAY MODAL
// ═══════════════════════════════════════════════════════════════════════════

interface DayModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (day: Omit<TournamentDay, 'id'>) => Promise<void>;
  existingDays: TournamentDay[];
  editingDay?: TournamentDay | null;  // If set, we're editing an existing day
}

const DayModal: React.FC<DayModalProps> = ({ isOpen, onClose, onSave, existingDays, editingDay }) => {
  const isEditing = !!editingDay;
  const [label, setLabel] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens or editingDay changes
  React.useEffect(() => {
    if (isOpen) {
      if (editingDay) {
        // Editing mode - populate with existing values
        setLabel(editingDay.label || '');
        setDate(editingDay.date || '');
        setStartTime(editingDay.startTime || '09:00');
        setEndTime(editingDay.endTime || '17:00');
      } else {
        // Add mode - reset to defaults
        setLabel(`Day ${existingDays.length + 1}`);
        setDate('');
        setStartTime('09:00');
        setEndTime('17:00');
      }
      setError(null);
    }
  }, [isOpen, existingDays.length, editingDay]);

  const handleSave = async () => {
    if (!date) {
      setError('Please select a date');
      return;
    }
    if (!startTime || !endTime) {
      setError('Please set start and end times');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave({ label, date, startTime, endTime });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add day');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      {/* Modal container with subtle glow */}
      <div
        className="relative bg-gray-900 rounded-2xl border border-gray-700/80 shadow-2xl w-full max-w-md overflow-hidden"
        style={{ boxShadow: '0 0 60px rgba(0,0,0,0.5), 0 0 20px rgba(132,204,22,0.05)' }}
      >
        {/* Decorative top accent line */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-lime-500/50 to-transparent" />

        {/* Header */}
        <div className="relative px-6 py-5 border-b border-gray-700/50">
          <div className="absolute inset-0 bg-gradient-to-br from-gray-800/60 via-gray-900/20 to-transparent" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${isEditing ? 'from-blue-500/20 to-blue-600/10 border-blue-500/30' : 'from-lime-500/20 to-lime-600/10 border-lime-500/30'} border flex items-center justify-center`}>
                <svg className={`w-5 h-5 ${isEditing ? 'text-blue-400' : 'text-lime-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  {isEditing ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  )}
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">
                  {isEditing ? 'Edit Tournament Day' : 'Add Tournament Day'}
                </h3>
                <p className="text-sm text-gray-400 mt-0.5">
                  {isEditing ? 'Update day details' : 'Create a new day for scheduling divisions'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="px-6 py-6 space-y-5">
          {/* Label */}
          <div className="group">
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Day Label
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., Day 1, Finals Day"
              className="w-full px-4 py-3 bg-gray-800/80 border border-gray-700 rounded-xl text-white placeholder-gray-500
                focus:outline-none focus:ring-2 focus:ring-lime-500/40 focus:border-lime-500/60
                transition-all duration-200"
            />
          </div>

          {/* Date with custom calendar icon */}
          <div className="group">
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Date
            </label>
            <div className="relative">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-3 bg-gray-800/80 border border-gray-700 rounded-xl text-white
                  focus:outline-none focus:ring-2 focus:ring-lime-500/40 focus:border-lime-500/60
                  transition-all duration-200 appearance-none
                  [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:w-12 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
              />
              {/* Custom calendar icon - always visible */}
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-300 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
              </div>
            </div>
          </div>

          {/* Time Range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="group">
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Start Time
              </label>
              <RollingTimePicker
                value={startTime}
                onChange={(time) => setStartTime(time)}
              />
            </div>
            <div className="group">
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                End Time
              </label>
              <RollingTimePicker
                value={endTime}
                onChange={(time) => setEndTime(time)}
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700/50 bg-gray-800/40 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-5 py-2.5 text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-700/50 rounded-lg transition-all duration-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-gradient-to-r from-lime-600 to-lime-500 hover:from-lime-500 hover:to-lime-400
              text-white text-sm font-semibold rounded-lg transition-all duration-200
              disabled:opacity-50 disabled:cursor-not-allowed
              shadow-lg shadow-lime-500/20 hover:shadow-lime-500/30
              flex items-center gap-2"
          >
            {saving && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {saving ? (isEditing ? 'Saving...' : 'Adding...') : (isEditing ? 'Save Changes' : 'Add Day')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// DELETE DAY CONFIRMATION MODAL
// ═══════════════════════════════════════════════════════════════════════════

interface DeleteDayModalProps {
  day: TournamentDay;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

const DeleteDayModal: React.FC<DeleteDayModalProps> = ({ day, onClose, onConfirm }) => {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onConfirm();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div
        className="relative bg-gray-900 rounded-2xl border border-gray-700/80 shadow-2xl w-full max-w-sm overflow-hidden"
        style={{ boxShadow: '0 0 60px rgba(0,0,0,0.5), 0 0 20px rgba(239,68,68,0.1)' }}
      >
        {/* Decorative top accent line */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-red-500/50 to-transparent" />

        {/* Header */}
        <div className="relative px-6 py-5 border-b border-gray-700/50">
          <div className="absolute inset-0 bg-gradient-to-br from-gray-800/60 via-gray-900/20 to-transparent" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500/20 to-red-600/10 border border-red-500/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">Delete Day</h3>
                <p className="text-sm text-gray-400 mt-0.5">This action cannot be undone</p>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          <p className="text-gray-300">
            Are you sure you want to delete <span className="font-semibold text-white">{day.label}</span>?
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Divisions assigned to this day will become unassigned.
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700/50 bg-gray-800/40 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={deleting}
            className="px-5 py-2.5 text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-700/50 rounded-lg transition-all duration-200"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-6 py-2.5 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400
              text-white text-sm font-semibold rounded-lg transition-all duration-200
              disabled:opacity-50 disabled:cursor-not-allowed
              shadow-lg shadow-red-500/20 hover:shadow-red-500/30
              flex items-center gap-2"
          >
            {deleting && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {deleting ? 'Deleting...' : 'Delete Day'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// SPLIT DIVISION MODAL (V07.11)
// ═══════════════════════════════════════════════════════════════════════════

interface SplitInfo {
  division: DivisionWithDuration;
  targetDayId: string;
  targetDay: TournamentDay;
  availableMinutes: number;  // Remaining capacity on target day
  overflowMinutes: number;   // How much exceeds capacity
  availableDays: TournamentDay[];  // Other days that could receive overflow
}

interface SplitDivisionModalProps {
  splitInfo: SplitInfo;
  onClose: () => void;
  onSplit: (splitOption: 'fill_and_overflow' | 'split_evenly' | 'assign_anyway', overflowDayId?: string) => Promise<void>;
}

const SplitDivisionModal: React.FC<SplitDivisionModalProps> = ({ splitInfo, onClose, onSplit }) => {
  const [selectedOption, setSelectedOption] = useState<'fill_and_overflow' | 'split_evenly' | 'assign_anyway'>('fill_and_overflow');
  const [overflowDayId, setOverflowDayId] = useState<string>(splitInfo.availableDays[0]?.id || '');
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await onSplit(selectedOption, overflowDayId);
    } finally {
      setSaving(false);
    }
  };

  // Calculate how the split would work
  const fillPercent = Math.round((splitInfo.availableMinutes / splitInfo.division.duration) * 100);
  const overflowPercent = 100 - fillPercent;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div
        className="relative bg-gray-900 rounded-2xl border border-gray-700/80 shadow-2xl w-full max-w-lg overflow-hidden"
        style={{ boxShadow: '0 0 60px rgba(0,0,0,0.5), 0 0 20px rgba(251,191,36,0.1)' }}
      >
        {/* Decorative top accent line */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />

        {/* Header */}
        <div className="relative px-6 py-5 border-b border-gray-700/50">
          <div className="absolute inset-0 bg-gradient-to-br from-gray-800/60 via-gray-900/20 to-transparent" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">Division Exceeds Day Capacity</h3>
                <p className="text-sm text-gray-400 mt-0.5">Choose how to handle the overflow</p>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-5">
          {/* Division info */}
          <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-white">{splitInfo.division.name}</span>
              <span className="text-amber-400 font-medium">{formatDuration(splitInfo.division.duration)}</span>
            </div>
            <div className="text-sm text-gray-400">
              <p><strong className="text-gray-300">{splitInfo.targetDay.label}</strong> has {formatDuration(splitInfo.availableMinutes)} remaining</p>
              <p className="text-amber-400 mt-1">Overflow: {formatDuration(splitInfo.overflowMinutes)}</p>
            </div>
          </div>

          {/* Split options */}
          <div className="space-y-3">
            {/* Option 1: Fill and overflow */}
            {splitInfo.availableDays.length > 0 && (
              <label
                className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                  selectedOption === 'fill_and_overflow'
                    ? 'bg-lime-500/10 border-lime-500/50 ring-1 ring-lime-500/30'
                    : 'bg-gray-800/30 border-gray-700/50 hover:border-gray-600/50'
                }`}
              >
                <input
                  type="radio"
                  name="splitOption"
                  value="fill_and_overflow"
                  checked={selectedOption === 'fill_and_overflow'}
                  onChange={() => setSelectedOption('fill_and_overflow')}
                  className="mt-1 accent-lime-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-white">Fill {splitInfo.targetDay.label}, overflow to another day</div>
                  <p className="text-sm text-gray-400 mt-1">
                    Play ~{fillPercent}% ({formatDuration(splitInfo.availableMinutes)}) on {splitInfo.targetDay.label},
                    remaining ~{overflowPercent}% ({formatDuration(splitInfo.overflowMinutes)}) on selected day
                  </p>
                  {selectedOption === 'fill_and_overflow' && (
                    <select
                      value={overflowDayId}
                      onChange={(e) => setOverflowDayId(e.target.value)}
                      className="mt-3 w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-lime-500/40"
                    >
                      {splitInfo.availableDays.map(day => (
                        <option key={day.id} value={day.id}>{day.label} - {formatDateDisplay(day.date)}</option>
                      ))}
                    </select>
                  )}
                </div>
              </label>
            )}

            {/* Option 2: Split evenly */}
            {splitInfo.availableDays.length > 0 && (
              <label
                className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                  selectedOption === 'split_evenly'
                    ? 'bg-lime-500/10 border-lime-500/50 ring-1 ring-lime-500/30'
                    : 'bg-gray-800/30 border-gray-700/50 hover:border-gray-600/50'
                }`}
              >
                <input
                  type="radio"
                  name="splitOption"
                  value="split_evenly"
                  checked={selectedOption === 'split_evenly'}
                  onChange={() => setSelectedOption('split_evenly')}
                  className="mt-1 accent-lime-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-white">Split evenly across both days</div>
                  <p className="text-sm text-gray-400 mt-1">
                    Play ~50% ({formatDuration(Math.ceil(splitInfo.division.duration / 2))}) on each day
                  </p>
                  {selectedOption === 'split_evenly' && (
                    <select
                      value={overflowDayId}
                      onChange={(e) => setOverflowDayId(e.target.value)}
                      className="mt-3 w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-lime-500/40"
                    >
                      {splitInfo.availableDays.map(day => (
                        <option key={day.id} value={day.id}>{day.label} - {formatDateDisplay(day.date)}</option>
                      ))}
                    </select>
                  )}
                </div>
              </label>
            )}

            {/* Option 3: Assign anyway */}
            <label
              className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                selectedOption === 'assign_anyway'
                  ? 'bg-amber-500/10 border-amber-500/50 ring-1 ring-amber-500/30'
                  : 'bg-gray-800/30 border-gray-700/50 hover:border-gray-600/50'
              }`}
            >
              <input
                type="radio"
                name="splitOption"
                value="assign_anyway"
                checked={selectedOption === 'assign_anyway'}
                onChange={() => setSelectedOption('assign_anyway')}
                className="mt-1 accent-amber-500"
              />
              <div className="flex-1">
                <div className="font-medium text-white">Assign to {splitInfo.targetDay.label} anyway</div>
                <p className="text-sm text-gray-400 mt-1">
                  The day will be over capacity. You may need to extend hours or run overtime.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700/50 bg-gray-800/40 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-5 py-2.5 text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-700/50 rounded-lg transition-all duration-200"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || (selectedOption !== 'assign_anyway' && !overflowDayId)}
            className="px-6 py-2.5 bg-gradient-to-r from-lime-600 to-lime-500 hover:from-lime-500 hover:to-lime-400
              text-white text-sm font-semibold rounded-lg transition-all duration-200
              disabled:opacity-50 disabled:cursor-not-allowed
              shadow-lg shadow-lime-500/20 hover:shadow-lime-500/30
              flex items-center gap-2"
          >
            {saving && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {saving ? 'Applying...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// DAY COLUMN
// ═══════════════════════════════════════════════════════════════════════════

interface DayColumnProps {
  day: TournamentDay;
  divisions: DivisionWithDuration[];
  globalColorOffset: number;
  maxDuration: number;
  activeDragId: string | null;
  isActiveDay: boolean;
  isAdmin: boolean;
  onStartDay: () => void;
  onEditDay: () => void;
  onDeleteDay: () => void;
}

const DayColumn: React.FC<DayColumnProps> = ({
  day,
  divisions,
  globalColorOffset,
  maxDuration,
  activeDragId,
  isActiveDay,
  isAdmin,
  onStartDay,
  onEditDay,
  onDeleteDay,
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${day.id}`,
    data: { dayId: day.id },
  });

  // Calculate day capacity and utilization
  const dayCapacity = parseTimeToMinutes(day.endTime) - parseTimeToMinutes(day.startTime);
  const usedMinutes = divisions.reduce((sum, d) => sum + d.duration, 0);
  const utilizationPercent = dayCapacity > 0 ? Math.round((usedMinutes / dayCapacity) * 100) : 0;

  // Utilization color
  const utilizationColor = utilizationPercent > 100
    ? 'from-red-500 to-red-600'
    : utilizationPercent > 80
    ? 'from-amber-500 to-amber-600'
    : 'from-lime-500 to-lime-600';

  const utilizationTextColor = utilizationPercent > 100
    ? 'text-red-400'
    : utilizationPercent > 80
    ? 'text-amber-400'
    : 'text-lime-400';

  return (
    <div
      ref={setNodeRef}
      className={`
        relative flex flex-col
        bg-gradient-to-b from-gray-900/90 to-gray-950/90
        border rounded-2xl overflow-hidden
        backdrop-blur-sm
        transition-all duration-300 ease-out
        ${isActiveDay
          ? 'border-lime-500 ring-2 ring-lime-500/30 shadow-lg shadow-lime-500/10'
          : isOver
          ? 'border-lime-500/70 ring-2 ring-lime-500/30 scale-[1.01]'
          : 'border-gray-700/50 hover:border-gray-600/50'}
      `}
    >
      {/* Active Day Indicator */}
      {isActiveDay && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-lime-400 via-lime-500 to-lime-400" />
      )}

      {/* Header */}
      <div className="relative px-5 py-4 border-b border-gray-700/30 bg-gradient-to-br from-gray-800/50 to-transparent">
        {/* Decorative corner accent */}
        <div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl ${isActiveDay ? 'from-lime-500/15' : 'from-lime-500/5'} to-transparent`} />

        <div className="relative">
          {/* Day label + date + Active badge + Edit/Delete */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">
                  {day.label || 'Day'}
                </h3>
                <p className="text-sm text-gray-400 mt-0.5">
                  {formatDateDisplay(day.date)}
                </p>
              </div>
              {isActiveDay && (
                <span className="px-2 py-0.5 bg-lime-500/20 text-lime-400 text-xs font-semibold rounded-full border border-lime-500/30">
                  ACTIVE
                </span>
              )}
            </div>

            {/* Time window + Admin actions */}
            <div className="flex items-center gap-2">
              {/* Edit/Delete buttons for admins */}
              {isAdmin && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={onEditDay}
                    className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-700/50 rounded-lg transition-colors"
                    title="Edit day"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    onClick={onDeleteDay}
                    className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Delete day"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              )}
              {/* Time window badge */}
              <div className="px-3 py-1.5 rounded-lg bg-gray-800/80 border border-gray-700/50">
                <span className="text-xs font-medium text-gray-300">
                  {formatTime(day.startTime)} – {formatTime(day.endTime)}
                </span>
              </div>
            </div>
          </div>

          {/* Utilization bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500 font-medium">Capacity</span>
              <span className={`font-bold ${utilizationTextColor}`}>
                {utilizationPercent}%
              </span>
            </div>
            <div className="relative h-2 bg-gray-800 rounded-full overflow-hidden">
              {/* Animated glow for over-capacity */}
              {utilizationPercent > 100 && (
                <div className="absolute inset-0 animate-pulse bg-red-500/20" />
              )}
              <div
                className={`h-full bg-gradient-to-r ${utilizationColor} rounded-full transition-all duration-500`}
                style={{ width: `${Math.min(utilizationPercent, 100)}%` }}
              />
              {/* Overflow indicator */}
              {utilizationPercent > 100 && (
                <div className="absolute right-0 top-0 h-full w-1 bg-red-500 animate-pulse" />
              )}
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{formatDuration(usedMinutes)} scheduled</span>
              <span>{formatDuration(dayCapacity)} available</span>
            </div>
          </div>

          {/* Start Day Button */}
          {isAdmin && !isActiveDay && divisions.length > 0 && (
            <button
              onClick={onStartDay}
              className="mt-4 w-full py-2 px-4 bg-gradient-to-r from-lime-600 to-lime-700 hover:from-lime-500 hover:to-lime-600 text-white text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Start Day
            </button>
          )}
        </div>
      </div>

      {/* Divisions list */}
      <div className="flex-1 p-4 space-y-3 min-h-[200px]">
        {divisions.length > 0 ? (
          divisions.map((division, idx) => (
            <DraggableDivisionBar
              key={division.id}
              division={division}
              colorIndex={globalColorOffset + idx}
              maxDuration={maxDuration}
              isDragging={activeDragId === division.id}
            />
          ))
        ) : (
          <div className={`
            h-full min-h-[150px] flex items-center justify-center
            border-2 border-dashed rounded-xl
            transition-all duration-300
            ${isOver
              ? 'border-lime-500/50 bg-lime-500/5'
              : 'border-gray-700/50 bg-gray-800/20'}
          `}>
            <div className="text-center">
              <div className={`
                w-12 h-12 mx-auto mb-3 rounded-full
                flex items-center justify-center
                ${isOver ? 'bg-lime-500/20 text-lime-400' : 'bg-gray-800 text-gray-500'}
                transition-colors duration-300
              `}>
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <p className={`text-sm font-medium ${isOver ? 'text-lime-400' : 'text-gray-500'}`}>
                {isOver ? 'Drop here' : 'Drop divisions here'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Division count footer */}
      <div className="px-5 py-3 border-t border-gray-800/50 bg-gray-900/50">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">{divisions.length} division{divisions.length !== 1 ? 's' : ''}</span>
          <span className="text-gray-600">
            {divisions.reduce((sum, d) => sum + d.matchCount, 0)} total matches
          </span>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// UNASSIGNED SECTION
// ═══════════════════════════════════════════════════════════════════════════

interface UnassignedSectionProps {
  divisions: DivisionWithDuration[];
  maxDuration: number;
  activeDragId: string | null;
}

const UnassignedSection: React.FC<UnassignedSectionProps> = ({
  divisions,
  maxDuration,
  activeDragId,
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: 'unassigned',
    data: { dayId: null },
  });

  if (divisions.length === 0 && !activeDragId) return null;

  return (
    <div
      ref={setNodeRef}
      className={`
        relative mt-6 p-5 rounded-2xl border
        transition-all duration-300
        ${isOver
          ? 'bg-amber-950/20 border-amber-500/50 ring-2 ring-amber-500/20'
          : 'bg-gray-900/50 border-gray-700/30'}
      `}
    >
      {/* Warning stripe pattern for unassigned */}
      <div className="absolute inset-0 opacity-[0.02] rounded-2xl overflow-hidden" style={{
        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(251,191,36,0.3) 10px, rgba(251,191,36,0.3) 20px)',
      }} />

      <div className="relative">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-amber-300 text-sm">Unassigned Divisions</h3>
            <p className="text-xs text-gray-500">Drag these to a day above</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {divisions.map((division, idx) => (
            <DraggableDivisionBar
              key={division.id}
              division={division}
              colorIndex={idx}
              maxDuration={maxDuration}
              isDragging={activeDragId === division.id}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const DayPlannerTab: React.FC<DayPlannerTabProps> = ({
  tournament,
  divisions,
  teams,
  courtCount = 4,
  isAdmin = false,
  onDivisionDayChange,
  onTournamentUpdate,
}) => {
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showDayModal, setShowDayModal] = useState(false);
  const [editingDay, setEditingDay] = useState<TournamentDay | null>(null);
  const [deletingDay, setDeletingDay] = useState<TournamentDay | null>(null);
  const [startingDay, setStartingDay] = useState<string | null>(null);
  const [splitInfo, setSplitInfo] = useState<SplitInfo | null>(null);  // V07.11: Split detection

  // Sensors for drag and drop
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 5 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } });
  const sensors = useSensors(pointerSensor, touchSensor);

  // Calculate durations for all divisions
  const divisionsWithDuration: DivisionWithDuration[] = useMemo(() => {
    return divisions.map(division => {
      const teamCount = teams.filter(t => t.divisionId === division.id).length;
      const format = division.format?.competitionFormat || division.format?.mainFormat || 'single_elim';
      const matchCount = calculateMatchCount(format, teamCount);
      const duration = calculateDivisionDuration(matchCount, courtCount);

      return { ...division, duration, teamCount, matchCount };
    });
  }, [divisions, teams, courtCount]);

  // Max duration for proportional sizing
  const maxDuration = useMemo(() => {
    return Math.max(60, ...divisionsWithDuration.map(d => d.duration));
  }, [divisionsWithDuration]);

  // Group divisions by day (V07.11: Handle multi-day divisions with tournamentDayIds array)
  const divisionsByDay = useMemo(() => {
    const grouped: Record<string, DivisionWithDuration[]> = {};
    const unassigned: DivisionWithDuration[] = [];

    divisionsWithDuration.forEach(div => {
      // Check for multi-day divisions first (tournamentDayIds array takes precedence)
      if (div.tournamentDayIds && div.tournamentDayIds.length > 0) {
        // Add to each day in the array
        div.tournamentDayIds.forEach(dayId => {
          if (!grouped[dayId]) grouped[dayId] = [];
          // Mark this division as multi-day for display purposes
          grouped[dayId].push({ ...div, _isMultiDay: true, _dayCount: div.tournamentDayIds!.length } as DivisionWithDuration & { _isMultiDay: boolean; _dayCount: number });
        });
      } else if (div.tournamentDayId) {
        if (!grouped[div.tournamentDayId]) grouped[div.tournamentDayId] = [];
        grouped[div.tournamentDayId].push(div);
      } else {
        unassigned.push(div);
      }
    });

    return { grouped, unassigned };
  }, [divisionsWithDuration]);

  // Handle drag events
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  }, []);

  // Get tournament days
  const tournamentDays = tournament.days || [];

  // Helper to calculate remaining capacity of a day
  const getDayRemainingCapacity = useCallback((dayId: string, excludeDivisionId?: string): number => {
    const day = tournamentDays.find(d => d.id === dayId);
    if (!day) return 0;

    const dayCapacity = parseTimeToMinutes(day.endTime) - parseTimeToMinutes(day.startTime);
    const assignedDivisions = divisionsWithDuration.filter(
      d => d.tournamentDayId === dayId && d.id !== excludeDivisionId
    );
    const usedMinutes = assignedDivisions.reduce((sum, d) => sum + d.duration, 0);
    return dayCapacity - usedMinutes;
  }, [tournamentDays, divisionsWithDuration]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveDragId(null);

    const { active, over } = event;
    if (!over) return;

    const divisionId = active.id as string;
    const overData = over.data.current as { dayId: string | null } | undefined;
    const newDayId = overData?.dayId !== undefined
      ? overData.dayId
      : over.id.toString().replace('day-', '');

    // Find the division
    const division = divisionsWithDuration.find(d => d.id === divisionId);
    if (!division) return;

    // Skip if same day
    if (division.tournamentDayId === newDayId) return;
    if (!division.tournamentDayId && (newDayId === 'unassigned' || newDayId === null)) return;

    // Handle unassigning (dropping to unassigned section)
    if (newDayId === 'unassigned' || newDayId === null || newDayId === '') {
      if (onDivisionDayChange) {
        setSaving(true);
        try {
          await onDivisionDayChange(divisionId, '');
        } finally {
          setSaving(false);
        }
      }
      return;
    }

    // V07.11: Check if division exceeds day capacity
    const targetDay = tournamentDays.find(d => d.id === newDayId);
    if (!targetDay) return;

    const availableMinutes = getDayRemainingCapacity(newDayId, divisionId);

    // If division fits, just assign it
    if (division.duration <= availableMinutes) {
      if (onDivisionDayChange) {
        setSaving(true);
        try {
          await onDivisionDayChange(divisionId, newDayId);
        } finally {
          setSaving(false);
        }
      }
      return;
    }

    // Division exceeds capacity - show split modal
    const overflowMinutes = division.duration - availableMinutes;
    const availableDays = tournamentDays.filter(d => d.id !== newDayId);

    setSplitInfo({
      division,
      targetDayId: newDayId,
      targetDay,
      availableMinutes,
      overflowMinutes,
      availableDays,
    });
  }, [divisionsWithDuration, onDivisionDayChange, tournamentDays, getDayRemainingCapacity]);

  // V07.11: Handle split decision
  const handleSplit = useCallback(async (
    splitOption: 'fill_and_overflow' | 'split_evenly' | 'assign_anyway',
    overflowDayId?: string
  ) => {
    if (!splitInfo) return;

    const { division, targetDayId } = splitInfo;

    if (splitOption === 'assign_anyway') {
      // Just assign to the target day (single day assignment)
      if (onDivisionDayChange) {
        await onDivisionDayChange(division.id, targetDayId);
      }
    } else if (splitOption === 'fill_and_overflow' || splitOption === 'split_evenly') {
      // Multi-day assignment - update division with tournamentDayIds array
      if (overflowDayId) {
        const { updateDivision } = await import('../../services/firebase/tournaments');
        await updateDivision(tournament.id, division.id, {
          tournamentDayId: targetDayId,  // Keep primary day for backwards compatibility
          tournamentDayIds: [targetDayId, overflowDayId],  // New multi-day array
        });
        onTournamentUpdate?.();
      }
    }

    setSplitInfo(null);
  }, [splitInfo, onDivisionDayChange, tournament.id, onTournamentUpdate]);

  // Handle adding a new day
  const handleAddDay = useCallback(async (day: Omit<TournamentDay, 'id'>) => {
    await addTournamentDay(tournament.id, day);
    onTournamentUpdate?.();
  }, [tournament.id, onTournamentUpdate]);

  // Handle saving a day (add or edit)
  const handleSaveDay = useCallback(async (day: Omit<TournamentDay, 'id'>) => {
    if (editingDay) {
      // Import dynamically to avoid circular dependency
      const { updateTournamentDay } = await import('../../services/firebase/tournaments');
      await updateTournamentDay(tournament.id, editingDay.id, day);
    } else {
      await addTournamentDay(tournament.id, day);
    }
    onTournamentUpdate?.();
  }, [tournament.id, editingDay, onTournamentUpdate]);

  // Handle deleting a day
  const handleDeleteDay = useCallback(async () => {
    if (!deletingDay) return;
    const { removeTournamentDay } = await import('../../services/firebase/tournaments');
    await removeTournamentDay(tournament.id, deletingDay.id);
    setDeletingDay(null);
    onTournamentUpdate?.();
  }, [tournament.id, deletingDay, onTournamentUpdate]);

  // Open edit modal
  const openEditModal = useCallback((day: TournamentDay) => {
    setEditingDay(day);
    setShowDayModal(true);
  }, []);

  // Close day modal
  const closeDayModal = useCallback(() => {
    setShowDayModal(false);
    setEditingDay(null);
  }, []);

  // Handle starting a day
  const handleStartDay = useCallback(async (dayId: string) => {
    setStartingDay(dayId);
    try {
      await startTournamentDay(tournament.id, dayId);
      onTournamentUpdate?.();
    } finally {
      setStartingDay(null);
    }
  }, [tournament.id, onTournamentUpdate]);

  // V07.07: For single-day or no-day tournaments, show division overview with durations
  if (tournamentDays.length < 2) {
    const totalMinutes = divisionsWithDuration.reduce((sum, d) => sum + d.duration, 0);

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Day Planner</h2>
            <p className="text-sm text-gray-500 mt-1">
              {tournamentDays.length === 0
                ? 'Add tournament days to enable drag-and-drop scheduling'
                : 'Add more days to enable drag-and-drop between days'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* Court count indicator */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800/60 rounded-lg border border-gray-700/50">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
              <span className="text-sm text-gray-300 font-medium">{courtCount} court{courtCount !== 1 ? 's' : ''}</span>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-400">Total estimated time</p>
              <p className="text-lg font-bold text-lime-400">{formatDuration(totalMinutes)}</p>
            </div>
            {isAdmin && (
              <button
                onClick={() => setShowDayModal(true)}
                className="px-4 py-2 bg-lime-600 hover:bg-lime-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Day
              </button>
            )}
          </div>
        </div>

        {/* Day Modal (Add/Edit) */}
        <DayModal
          isOpen={showDayModal}
          onClose={closeDayModal}
          onSave={handleSaveDay}
          existingDays={tournamentDays}
          editingDay={editingDay}
        />

        {/* Delete Confirmation Modal */}
        {deletingDay && (
          <DeleteDayModal
            day={deletingDay}
            onClose={() => setDeletingDay(null)}
            onConfirm={handleDeleteDay}
          />
        )}

        {/* Split Division Modal (V07.11) */}
        {splitInfo && (
          <SplitDivisionModal
            splitInfo={splitInfo}
            onClose={() => setSplitInfo(null)}
            onSplit={handleSplit}
          />
        )}

        {/* Single day or all divisions view */}
        <div className="bg-gradient-to-b from-gray-900/90 to-gray-950/90 border border-gray-700/50 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-700/30 bg-gradient-to-br from-gray-800/50 to-transparent">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">
                  {tournamentDays.length === 1 ? tournamentDays[0].label || 'Tournament Day' : 'All Divisions'}
                </h3>
                {tournamentDays.length === 1 && tournamentDays[0].date && (
                  <p className="text-sm text-gray-400 mt-0.5">{formatDateDisplay(tournamentDays[0].date)}</p>
                )}
              </div>
              <div className="text-sm text-gray-400">
                {divisionsWithDuration.length} division{divisionsWithDuration.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>

          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {divisionsWithDuration.map((division, idx) => {
              const colors = DIVISION_COLORS[idx % DIVISION_COLORS.length];
              const heightPercent = Math.max(0.3, Math.min(1, division.duration / maxDuration));
              const height = 60 + (heightPercent * 100);

              return (
                <div
                  key={division.id}
                  style={{ minHeight: `${height}px` }}
                  className={`
                    relative w-full bg-gradient-to-br ${colors.bg}
                    border ${colors.border} rounded-xl overflow-hidden
                    shadow-lg ${colors.glow}
                  `}
                >
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                  <div className="relative h-full p-3 flex flex-col justify-between">
                    <div>
                      <h4 className="font-bold text-white text-sm truncate">{division.name}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-white/70 text-xs font-medium">~{formatDuration(division.duration)}</span>
                        <span className="text-white/40">•</span>
                        <span className="text-white/60 text-xs">{division.teamCount} teams</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-white/50 text-xs">
                      <span>{division.matchCount} matches</span>
                    </div>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-white/0 via-white/20 to-white/0" />
                </div>
              );
            })}
          </div>

          {divisionsWithDuration.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              <p>No divisions created yet</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Day Planner</h2>
            <p className="text-sm text-gray-500 mt-1">
              Drag divisions between days to organize your tournament schedule
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Court count indicator */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800/60 rounded-lg border border-gray-700/50">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
              <span className="text-sm text-gray-300 font-medium">{courtCount} court{courtCount !== 1 ? 's' : ''}</span>
            </div>
            {saving && (
              <div className="flex items-center gap-2 text-lime-400 text-sm">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>Saving...</span>
              </div>
            )}
            {isAdmin && (
              <button
                onClick={() => setShowDayModal(true)}
                className="px-4 py-2 bg-lime-600 hover:bg-lime-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Day
              </button>
            )}
          </div>
        </div>

        {/* Day Modal (Add/Edit) */}
        <DayModal
          isOpen={showDayModal}
          onClose={closeDayModal}
          onSave={handleSaveDay}
          existingDays={tournamentDays}
          editingDay={editingDay}
        />

        {/* Delete Confirmation Modal */}
        {deletingDay && (
          <DeleteDayModal
            day={deletingDay}
            onClose={() => setDeletingDay(null)}
            onConfirm={handleDeleteDay}
          />
        )}

        {/* Split Division Modal (V07.11) */}
        {splitInfo && (
          <SplitDivisionModal
            splitInfo={splitInfo}
            onClose={() => setSplitInfo(null)}
            onSplit={handleSplit}
          />
        )}

        {/* Day columns grid */}
        <div className={`grid gap-4 ${
          tournamentDays.length === 2 ? 'grid-cols-1 md:grid-cols-2' :
          tournamentDays.length === 3 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' :
          'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
        }`}>
          {tournamentDays.map((day, dayIdx) => {
            const dayDivisions = divisionsByDay.grouped[day.id] || [];
            const colorOffset = tournamentDays.slice(0, dayIdx).reduce(
              (sum, d) => sum + (divisionsByDay.grouped[d.id]?.length || 0),
              0
            );

            return (
              <DayColumn
                key={day.id}
                day={day}
                divisions={dayDivisions}
                globalColorOffset={colorOffset}
                maxDuration={maxDuration}
                activeDragId={activeDragId}
                isActiveDay={tournament.activeDayId === day.id}
                isAdmin={isAdmin}
                onStartDay={() => handleStartDay(day.id)}
                onEditDay={() => openEditModal(day)}
                onDeleteDay={() => setDeletingDay(day)}
              />
            );
          })}
        </div>

        {/* Unassigned section */}
        <UnassignedSection
          divisions={divisionsByDay.unassigned}
          maxDuration={maxDuration}
          activeDragId={activeDragId}
        />
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeDragId ? (
          <div className="opacity-90 scale-105 rotate-2" style={{ width: '280px' }}>
            {(() => {
              const div = divisionsWithDuration.find(d => d.id === activeDragId);
              if (!div) return null;
              return (
                <DraggableDivisionBar
                  division={div}
                  colorIndex={divisionsWithDuration.indexOf(div)}
                  maxDuration={maxDuration}
                  isDragging={false}
                />
              );
            })()}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
