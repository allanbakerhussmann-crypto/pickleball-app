/**
 * DayPlannerTab - V07.10
 *
 * Tournament Day Planner with drag-and-drop division assignment.
 * Features "Sports Command Center" aesthetic with dramatic visual hierarchy.
 *
 * Key Features:
 * - Day columns showing capacity utilization
 * - Proportionally-sized division bars based on duration
 * - Drag-and-drop to move divisions between days
 * - Unassigned section for divisions without a day
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

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface DayPlannerTabProps {
  tournament: Tournament;
  divisions: Division[];
  teams: Team[];
  courtCount?: number;
  onDivisionDayChange?: (divisionId: string, newDayId: string) => Promise<void>;
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
        <div className="flex items-center gap-2 text-white/50 text-xs">
          <span>{division.matchCount} matches</span>
        </div>
      </div>

      {/* Bottom accent line */}
      <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-white/0 via-white/20 to-white/0" />
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
}

const DayColumn: React.FC<DayColumnProps> = ({
  day,
  divisions,
  globalColorOffset,
  maxDuration,
  activeDragId,
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
        ${isOver
          ? 'border-lime-500/70 ring-2 ring-lime-500/30 scale-[1.01]'
          : 'border-gray-700/50 hover:border-gray-600/50'}
      `}
    >
      {/* Header */}
      <div className="relative px-5 py-4 border-b border-gray-700/30 bg-gradient-to-br from-gray-800/50 to-transparent">
        {/* Decorative corner accent */}
        <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-lime-500/5 to-transparent" />

        <div className="relative">
          {/* Day label + date */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">
                {day.label || 'Day'}
              </h3>
              <p className="text-sm text-gray-400 mt-0.5">
                {formatDateDisplay(day.date)}
              </p>
            </div>

            {/* Time window badge */}
            <div className="px-3 py-1.5 rounded-lg bg-gray-800/80 border border-gray-700/50">
              <span className="text-xs font-medium text-gray-300">
                {formatTime(day.startTime)} – {formatTime(day.endTime)}
              </span>
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
  onDivisionDayChange,
}) => {
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  // Group divisions by day
  const divisionsByDay = useMemo(() => {
    const grouped: Record<string, DivisionWithDuration[]> = {};
    const unassigned: DivisionWithDuration[] = [];

    divisionsWithDuration.forEach(div => {
      if (div.tournamentDayId) {
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

    // Update via callback
    if (onDivisionDayChange) {
      setSaving(true);
      try {
        const finalDayId = newDayId === 'unassigned' || newDayId === null ? '' : newDayId;
        await onDivisionDayChange(divisionId, finalDayId);
      } finally {
        setSaving(false);
      }
    }
  }, [divisionsWithDuration, onDivisionDayChange]);

  // Get tournament days
  const tournamentDays = tournament.days || [];

  if (tournamentDays.length < 2) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-gray-400 font-medium">Day Planner</p>
          <p className="text-gray-500 text-sm mt-1">Only available for multi-day tournaments</p>
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
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Day Planner</h2>
            <p className="text-sm text-gray-500 mt-1">
              Drag divisions between days to organize your tournament schedule
            </p>
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
        </div>

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
