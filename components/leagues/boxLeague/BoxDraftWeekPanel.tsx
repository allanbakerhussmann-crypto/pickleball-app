/**
 * Box Draft Week Panel Component V07.44
 *
 * Allows organizers to edit box assignments for draft weeks before activation.
 * Features drag-drop reordering within and between boxes.
 * NEW: Visual Absent/Substitutes area for managing absences and subs.
 *
 * FILE LOCATION: components/leagues/boxLeague/BoxDraftWeekPanel.tsx
 * VERSION: V07.44
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
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { League, LeagueMember } from '../../../types';
import type { BoxLeagueWeek, BoxAssignment } from '../../../types/rotatingDoublesBox';
import {
  updateBoxAssignments,
  refreshDraftWeekAssignments,
  activateWeek,
  declareAbsence,
  cancelAbsence,
  assignSubstitute,
  getEligibleSubstitutesWithDetails,
} from '../../../services/rotatingDoublesBox';
import type { EligibleSubstitute } from '../../../services/rotatingDoublesBox';

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
  league: League;
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

interface AbsentPlayer {
  odUserId: string;
  displayName: string;
  duprRating?: number;
  originalBox: number;
  reason?: string;
}

interface SubstitutePlayer {
  odUserId: string;
  displayName: string;
  duprRating?: number;
  duprId?: string;
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
      className={`bg-gray-700/50 rounded px-2 py-1.5 flex items-center justify-between cursor-grab active:cursor-grabbing ${
        isDragging ? 'shadow-lg ring-2 ring-lime-500' : ''
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <div className="w-5 h-5 rounded-full bg-gray-600 flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white">
          {player.position}
        </div>
        <div className="min-w-0">
          <div className="font-medium text-white text-xs truncate">{player.displayName}</div>
          {player.duprRating && (
            <div className="text-[10px] text-gray-400">{player.duprRating.toFixed(2)}</div>
          )}
        </div>
      </div>
      <div className="text-gray-500 flex-shrink-0">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
        </svg>
      </div>
    </div>
  );
};

// ============================================
// ABSENT PLAYER CARD (draggable from absent area)
// ============================================

interface AbsentPlayerCardProps {
  player: AbsentPlayer;
  disabled?: boolean;
}

const AbsentPlayerCard: React.FC<AbsentPlayerCardProps> = ({ player, disabled }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `absent-${player.odUserId}`, disabled });

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
      className={`bg-gray-700/50 rounded-lg p-2 cursor-grab active:cursor-grabbing ${
        isDragging ? 'shadow-lg ring-2 ring-purple-500' : ''
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="text-gray-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
          </div>
          <div>
            <div className="font-medium text-white text-sm">{player.displayName}</div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>Box {player.originalBox}</span>
              {player.duprRating && <span>• {player.duprRating.toFixed(2)}</span>}
            </div>
          </div>
        </div>
      </div>
      {player.reason && (
        <div className="mt-1 text-xs text-gray-500 capitalize">{player.reason}</div>
      )}
    </div>
  );
};

// ============================================
// SUBSTITUTE PLAYER CARD
// ============================================

interface SubPlayerCardProps {
  sub: SubstitutePlayer;
  disabled?: boolean;
  onRemove: () => void;
}

const SubPlayerCard: React.FC<SubPlayerCardProps> = ({ sub, disabled, onRemove }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `sub-${sub.odUserId}`, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-gray-700/50 rounded-lg p-2 ${
        isDragging ? 'shadow-lg ring-2 ring-cyan-500' : ''
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center justify-between">
        <div
          {...attributes}
          {...listeners}
          className="flex items-center gap-2 flex-1 cursor-grab active:cursor-grabbing"
        >
          <div className="text-gray-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
          </div>
          <div>
            <div className="font-medium text-white text-sm flex items-center gap-2">
              {sub.displayName}
              <span className="px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 rounded text-xs">sub</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              {sub.duprRating && <span>{sub.duprRating.toFixed(2)}</span>}
              {sub.duprId && <span className="text-green-400">DUPR ✓</span>}
            </div>
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="p-1 text-gray-500 hover:text-red-400 transition-colors"
          title="Remove substitute"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

// ============================================
// PLAYER DRAG OVERLAY
// ============================================

interface DragOverlayContentProps {
  player: DraftPlayer | null;
  absentPlayer: AbsentPlayer | null;
  substitute: SubstitutePlayer | null;
}

const DragOverlayContent: React.FC<DragOverlayContentProps> = ({ player, absentPlayer, substitute }) => {
  if (player) {
    return (
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
  }

  if (absentPlayer) {
    return (
      <div className="bg-gray-700 rounded-lg p-2 shadow-2xl ring-2 ring-purple-500">
        <div className="font-medium text-white text-sm">{absentPlayer.displayName}</div>
        <div className="text-xs text-gray-400">From Box {absentPlayer.originalBox}</div>
      </div>
    );
  }

  if (substitute) {
    return (
      <div className="bg-gray-700 rounded-lg p-2 shadow-2xl ring-2 ring-cyan-500">
        <div className="font-medium text-white text-sm flex items-center gap-2">
          {substitute.displayName}
          <span className="px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 rounded text-xs">sub</span>
        </div>
        {substitute.duprRating && (
          <div className="text-xs text-gray-400">{substitute.duprRating.toFixed(2)}</div>
        )}
      </div>
    );
  }

  return null;
};

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

  // Make the box header droppable for subs/absent players
  const { setNodeRef } = useDroppable({
    id: `box-drop-${boxNumber}`,
  });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border ${colors.border} overflow-hidden transition-all ${
        isOver ? 'ring-2 ring-lime-500 scale-[1.01]' : ''
      }`}
    >
      {/* Box Header - Clickable to toggle */}
      <button
        onClick={onToggle}
        className={`${colors.bg} px-2 py-1.5 flex items-center justify-between w-full text-left hover:brightness-110 transition-all`}
      >
        <div className="flex items-center gap-1.5">
          {/* Expand/Collapse Icon */}
          <svg
            className={`w-3 h-3 text-white/70 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-bold text-white">Box {boxNumber}</span>
          {boxNumber === 1 && (
            <span className="px-1 py-0.5 bg-yellow-400/20 text-yellow-400 rounded text-[10px]">
              Top
            </span>
          )}
          {boxNumber === totalBoxes && (
            <span className="px-1 py-0.5 bg-gray-600/50 text-gray-400 rounded text-[10px]">
              Entry
            </span>
          )}
        </div>
        <span className={`text-[10px] ${isValidSize ? 'text-white/70' : 'text-red-400 font-medium'}`}>
          {players.length}
          {!isValidSize && ' (4-6)'}
        </span>
      </button>

      {/* Collapsed Preview - Show player names */}
      {!isExpanded && players.length > 0 && (
        <div className={`${colors.bg} bg-opacity-30 px-2 py-1 text-[10px] text-white/60 truncate`}>
          {players.map(p => p.displayName).join(' • ')}
        </div>
      )}

      {/* Players List - Only when expanded */}
      {isExpanded && (
        <SortableContext
          items={players.map(p => p.odUserId)}
          strategy={verticalListSortingStrategy}
        >
          <div className={`${colors.bg} bg-opacity-50 p-1.5 space-y-0.5 min-h-[80px]`}>
            {players.length === 0 ? (
              <div className="text-center text-gray-500 py-3 text-xs">
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
// ABSENT/SUBS DROP AREA
// ============================================

interface AbsentSubsAreaProps {
  absentPlayers: AbsentPlayer[];
  availableSubs: SubstitutePlayer[];
  onAddSub: () => void;
  onRemoveSub: (subId: string) => void;
  isOver: boolean;
  disabled: boolean;
}

const AbsentSubsArea: React.FC<AbsentSubsAreaProps> = ({
  absentPlayers,
  availableSubs,
  onAddSub,
  onRemoveSub,
  isOver,
  disabled,
}) => {
  const { setNodeRef } = useDroppable({
    id: 'absent-area',
  });

  return (
    <div
      ref={setNodeRef}
      className={`bg-purple-500/5 rounded-xl border-2 transition-all ${
        isOver ? 'border-purple-500 ring-2 ring-purple-500/50' : 'border-purple-500/20'
      }`}
    >
      {/* Header */}
      <div className="px-4 py-3 bg-purple-500/10 border-b border-purple-500/20 flex items-center justify-between">
        <h4 className="font-semibold text-purple-400 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Absent / Substitutes
        </h4>
        <button
          onClick={onAddSub}
          disabled={disabled}
          className="px-3 py-1.5 bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 disabled:opacity-50 rounded text-sm font-medium transition-colors flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Player
        </button>
      </div>

      {/* Two Columns */}
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Absent Column */}
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">
            Absent ({absentPlayers.length})
          </div>
          <SortableContext
            items={absentPlayers.map(p => `absent-${p.odUserId}`)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2 min-h-[80px]">
              {absentPlayers.length === 0 ? (
                <div className="text-center text-gray-600 py-4 text-sm border-2 border-dashed border-gray-700 rounded-lg">
                  Drag players here to mark absent
                </div>
              ) : (
                absentPlayers.map((player) => (
                  <AbsentPlayerCard
                    key={player.odUserId}
                    player={player}
                    disabled={disabled}
                  />
                ))
              )}
            </div>
          </SortableContext>
        </div>

        {/* Substitutes Column */}
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">
            Available Subs ({availableSubs.length})
          </div>
          <SortableContext
            items={availableSubs.map(s => `sub-${s.odUserId}`)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2 min-h-[80px]">
              {availableSubs.length === 0 ? (
                <div className="text-center text-gray-600 py-4 text-sm border-2 border-dashed border-gray-700 rounded-lg">
                  <p>Click "Add Player" to find subs</p>
                  <p className="text-xs mt-1">Then drag into a box</p>
                </div>
              ) : (
                availableSubs.map((sub) => (
                  <SubPlayerCard
                    key={sub.odUserId}
                    sub={sub}
                    disabled={disabled}
                    onRemove={() => onRemoveSub(sub.odUserId)}
                  />
                ))
              )}
            </div>
          </SortableContext>
        </div>
      </div>
    </div>
  );
};

// ============================================
// ADD SUBSTITUTE MODAL
// ============================================

interface AddSubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (sub: EligibleSubstitute) => void;
  leagueId: string;
  week: BoxLeagueWeek;
  league: League;
  existingSubIds: Set<string>;
}

const AddSubModal: React.FC<AddSubModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  leagueId,
  week,
  league,
  existingSubIds,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<EligibleSubstitute[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const isDuprLeague = league.settings?.duprSettings?.mode === 'required';

  // Fetch substitutes when search changes
  useEffect(() => {
    if (!isOpen) return;

    const fetchSubs = async () => {
      setIsLoading(true);
      try {
        const settings = league.settings?.rotatingDoublesBox?.settings?.substituteEligibility || {
          subMustBeMember: false,
          subAllowedFromBoxes: 'same_or_lower' as const,
          subMustHaveDuprLinked: isDuprLeague,
          subMustHaveDuprConsent: isDuprLeague,
        };

        // Use empty string to get first batch without search
        const subs = await getEligibleSubstitutesWithDetails(
          leagueId,
          '', // No specific absent player - just finding available subs
          week,
          settings,
          searchQuery.trim() || undefined
        );

        // Filter out already added subs
        const filtered = subs.filter(s => !existingSubIds.has(s.id));
        setResults(filtered);
        setHasSearched(true);
      } catch (err) {
        console.error('Failed to fetch substitutes:', err);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    };

    // Debounce search
    const timer = setTimeout(fetchSubs, searchQuery ? 300 : 0);
    return () => clearTimeout(timer);
  }, [isOpen, searchQuery, leagueId, week, league, isDuprLeague, existingSubIds]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl border border-gray-700 max-w-md w-full p-6">
        <h3 className="text-xl font-bold text-white mb-2">Add Substitute Player</h3>
        <p className="text-sm text-gray-400 mb-4">
          Search for a player to add as a substitute for Week {week.weekNumber}
        </p>

        {/* Search input */}
        <div className="mb-4">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or DUPR ID..."
              className="w-full bg-gray-900 border border-gray-700 text-white pl-9 pr-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-500 text-sm"
              autoFocus
            />
            {isLoading ? (
              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4">
                <div className="animate-spin h-4 w-4 border-2 border-lime-500 border-t-transparent rounded-full"></div>
              </div>
            ) : (
              <svg
                className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Showing players NOT already playing this week
          </p>
        </div>

        {/* Results */}
        <div className="mb-4 max-h-60 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin h-6 w-6 border-2 border-lime-500 border-t-transparent rounded-full"></div>
            </div>
          ) : results.length === 0 ? (
            <div className="text-center text-gray-400 py-8 text-sm">
              {hasSearched && searchQuery
                ? `No players found matching "${searchQuery}"`
                : 'Type to search for available players'}
            </div>
          ) : (
            <div className="space-y-2">
              {results.map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => {
                    onSelect(sub);
                    onClose();
                  }}
                  className="w-full text-left p-3 rounded-lg bg-gray-900/50 hover:bg-gray-900 border border-gray-700/50 hover:border-gray-600 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-white font-medium">{sub.name}</span>
                      {sub.duprDoublesRating && (
                        <span className="ml-2 text-xs text-gray-400">
                          ({sub.duprDoublesRating.toFixed(2)})
                        </span>
                      )}
                    </div>
                    {isDuprLeague && (
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        sub.duprId
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {sub.duprId ? 'DUPR ✓' : 'No DUPR'}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
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
  isOrganizer: _isOrganizer,
  currentUserId,
  league,
  onClose,
  onActivated,
}) => {
  // State
  const [localAssignments, setLocalAssignments] = useState<BoxAssignment[]>([]);
  const [absentPlayers, setAbsentPlayers] = useState<AbsentPlayer[]>([]);
  const [availableSubs, setAvailableSubs] = useState<SubstitutePlayer[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overDroppableId, setOverDroppableId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [expandedBoxes, setExpandedBoxes] = useState<Set<number>>(new Set([1]));
  const [showAddSubModal, setShowAddSubModal] = useState(false);

  // Build member lookup
  const memberMap = useMemo(() => new Map(members.map(m => [m.userId, m])), [members]);

  // Initialize from week data
  useEffect(() => {
    if (week.boxAssignments) {
      setLocalAssignments(week.boxAssignments);
    }

    // Initialize absent players from week.absences
    if (week.absences) {
      const absents: AbsentPlayer[] = week.absences.map(absence => {
        const member = memberMap.get(absence.playerId);
        return {
          odUserId: absence.playerId,
          displayName: member?.displayName || absence.playerName || 'Unknown',
          duprRating: userRatings.get(absence.playerId),
          originalBox: absence.boxNumber,
          reason: absence.reason,
        };
      });
      setAbsentPlayers(absents);
    }

    setHasChanges(false);
  }, [week.boxAssignments, week.absences, memberMap, userRatings]);

  // Convert assignments to DraftPlayer arrays grouped by box
  const playersByBox: Map<number, DraftPlayer[]> = useMemo(() => {
    const result = new Map<number, DraftPlayer[]>();

    for (const box of localAssignments) {
      const players: DraftPlayer[] = box.playerIds
        .filter(userId => !absentPlayers.some(a => a.odUserId === userId))
        .map((userId, index) => {
          const member = memberMap.get(userId);
          return {
            odUserId: userId,
            displayName: member?.displayName || 'Unknown Player',
            duprRating: userRatings.get(userId),
            boxNumber: box.boxNumber,
            position: index + 1,
            isAbsent: false,
            substituteName: undefined,
          };
        });

      result.set(box.boxNumber, players);
    }

    return result;
  }, [localAssignments, absentPlayers, memberMap, userRatings]);

  // Flatten all players for lookup
  const allPlayers = useMemo(() => Array.from(playersByBox.values()).flat(), [playersByBox]);

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

  // Find items by ID
  const findPlayer = (playerId: string): DraftPlayer | undefined => {
    return allPlayers.find(p => p.odUserId === playerId);
  };

  const findAbsentPlayer = (id: string): AbsentPlayer | undefined => {
    if (id.startsWith('absent-')) {
      const odUserId = id.replace('absent-', '');
      return absentPlayers.find(p => p.odUserId === odUserId);
    }
    return undefined;
  };

  const findSubstitute = (id: string): SubstitutePlayer | undefined => {
    if (id.startsWith('sub-')) {
      const odUserId = id.replace('sub-', '');
      return availableSubs.find(s => s.odUserId === odUserId);
    }
    return undefined;
  };

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  // Handle drag over
  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (over) {
      setOverDroppableId(over.id as string);
    } else {
      setOverDroppableId(null);
    }
  };

  // Handle drag end
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverDroppableId(null);

    if (!over) return;

    const activeIdStr = active.id as string;
    const overIdStr = over.id as string;

    // Determine what was dragged
    const draggedPlayer = findPlayer(activeIdStr);
    const draggedAbsent = findAbsentPlayer(activeIdStr);
    const draggedSub = findSubstitute(activeIdStr);

    // Determine where it was dropped
    const isDropOnAbsentArea = overIdStr === 'absent-area';
    const isDropOnBox = overIdStr.startsWith('box-drop-');
    const targetBoxNumber = isDropOnBox ? parseInt(overIdStr.replace('box-drop-', '')) : null;

    // Case 1: Player dragged to absent area
    if (draggedPlayer && isDropOnAbsentArea) {
      await markPlayerAbsent(draggedPlayer);
      return;
    }

    // Case 2: Absent player dragged back to a box
    if (draggedAbsent && targetBoxNumber !== null) {
      await returnAbsentToBox(draggedAbsent, targetBoxNumber);
      return;
    }

    // Case 3: Substitute dragged to a box
    if (draggedSub && targetBoxNumber !== null) {
      await addSubToBox(draggedSub, targetBoxNumber);
      return;
    }

    // Case 4: Normal player reordering (drop on another player)
    if (draggedPlayer && !isDropOnAbsentArea && !isDropOnBox) {
      const overPlayer = findPlayer(overIdStr);
      if (overPlayer && activeIdStr !== overIdStr) {
        reorderPlayers(draggedPlayer, overPlayer);
      }
    }
  };

  // Mark player as absent
  const markPlayerAbsent = async (player: DraftPlayer) => {
    // Add to absent list
    const newAbsent: AbsentPlayer = {
      odUserId: player.odUserId,
      displayName: player.displayName,
      duprRating: player.duprRating,
      originalBox: player.boxNumber,
      reason: 'personal',
    };
    setAbsentPlayers(prev => [...prev, newAbsent]);

    // Remove from box assignments
    setLocalAssignments(prev => {
      return prev.map(box => {
        if (box.boxNumber === player.boxNumber) {
          return {
            ...box,
            playerIds: box.playerIds.filter(id => id !== player.odUserId),
          };
        }
        return box;
      });
    });

    setHasChanges(true);

    // Call service to persist
    try {
      const member = memberMap.get(player.odUserId);
      const absencePolicy = league.settings?.rotatingDoublesBox?.settings?.absencePolicy?.policy || 'freeze';
      await declareAbsence(leagueId, week.weekNumber, player.odUserId, currentUserId, {
        reason: 'personal',
        playerName: member?.displayName,
        absencePolicy,
      });
    } catch (err) {
      console.error('Failed to declare absence:', err);
      setError((err as Error).message);
    }
  };

  // Return absent player to a box
  const returnAbsentToBox = async (absent: AbsentPlayer, boxNumber: number) => {
    // Remove from absent list
    setAbsentPlayers(prev => prev.filter(p => p.odUserId !== absent.odUserId));

    // Add to box assignments
    setLocalAssignments(prev => {
      return prev.map(box => {
        if (box.boxNumber === boxNumber) {
          return {
            ...box,
            playerIds: [...box.playerIds, absent.odUserId],
          };
        }
        return box;
      });
    });

    setHasChanges(true);

    // Call service to cancel absence
    try {
      await cancelAbsence(leagueId, week.weekNumber, absent.odUserId, true);
    } catch (err) {
      console.error('Failed to cancel absence:', err);
      setError((err as Error).message);
    }
  };

  // Add substitute to a box
  const addSubToBox = async (sub: SubstitutePlayer, boxNumber: number) => {
    // Find an absent player from this box to assign the sub to
    const absentFromBox = absentPlayers.find(a => a.originalBox === boxNumber);

    if (!absentFromBox) {
      setError(`No absent player in Box ${boxNumber} to replace. Drag to their original box.`);
      return;
    }

    // Remove from available subs
    setAvailableSubs(prev => prev.filter(s => s.odUserId !== sub.odUserId));

    // Add to box assignments (replacing the absent player's spot)
    setLocalAssignments(prev => {
      return prev.map(box => {
        if (box.boxNumber === boxNumber) {
          return {
            ...box,
            playerIds: [...box.playerIds, sub.odUserId],
          };
        }
        return box;
      });
    });

    setHasChanges(true);

    // Call service to assign substitute
    try {
      await assignSubstitute(
        leagueId,
        week.weekNumber,
        absentFromBox.odUserId,
        sub.odUserId,
        currentUserId,
        sub.displayName
      );
    } catch (err) {
      console.error('Failed to assign substitute:', err);
      setError((err as Error).message);
    }
  };

  // Reorder players within/between boxes
  const reorderPlayers = (active: DraftPlayer, over: DraftPlayer) => {
    const fromBox = active.boxNumber;
    const toBox = over.boxNumber;

    setLocalAssignments(prev => {
      const newAssignments = [...prev];

      if (fromBox === toBox) {
        // Reordering within the same box
        const boxIndex = newAssignments.findIndex(b => b.boxNumber === fromBox);
        if (boxIndex === -1) return prev;

        const box = newAssignments[boxIndex];
        const oldIndex = box.playerIds.indexOf(active.odUserId);
        const newIndex = box.playerIds.indexOf(over.odUserId);

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

        const fromBoxData = newAssignments[fromBoxIndex];
        const fromPlayerIds = fromBoxData.playerIds.filter(id => id !== active.odUserId);

        const toBoxData = newAssignments[toBoxIndex];
        const insertIndex = toBoxData.playerIds.indexOf(over.odUserId);
        const toPlayerIds = [...toBoxData.playerIds];
        toPlayerIds.splice(insertIndex, 0, active.odUserId);

        newAssignments[fromBoxIndex] = { ...fromBoxData, playerIds: fromPlayerIds };
        newAssignments[toBoxIndex] = { ...toBoxData, playerIds: toPlayerIds };
      }

      return newAssignments;
    });

    setHasChanges(true);
    setError(null);
  };

  // Add substitute from modal
  const handleAddSub = (sub: EligibleSubstitute) => {
    const newSub: SubstitutePlayer = {
      odUserId: sub.id,
      displayName: sub.name,
      duprRating: sub.duprDoublesRating,
      duprId: sub.duprId,
    };
    setAvailableSubs(prev => [...prev, newSub]);
  };

  // Remove substitute
  const handleRemoveSub = (subId: string) => {
    setAvailableSubs(prev => prev.filter(s => s.odUserId !== subId));
  };

  // Validate assignments
  const validateAssignments = (): string | null => {
    for (const box of localAssignments) {
      const activePlayers = box.playerIds.filter(
        id => !absentPlayers.some(a => a.odUserId === id)
      );
      if (activePlayers.length < 4) {
        return `Box ${box.boxNumber} has only ${activePlayers.length} active players (minimum 4 required)`;
      }
      if (activePlayers.length > 6) {
        return `Box ${box.boxNumber} has ${activePlayers.length} players (maximum 6 allowed)`;
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
  const isDisabled = saving || activating || resetting;

  // Get currently dragged item for overlay
  const activePlayer = activeId ? findPlayer(activeId) : null;
  const activeAbsent = activeId ? findAbsentPlayer(activeId) : null;
  const activeSub = activeId ? findSubstitute(activeId) : null;

  // Determine what area is being hovered
  const isOverAbsentArea = overDroppableId === 'absent-area';
  const overBoxNumber = overDroppableId?.startsWith('box-drop-')
    ? parseInt(overDroppableId.replace('box-drop-', ''))
    : null;

  return (
    <div className="bg-gray-800/30 rounded-lg border border-gray-700/50 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-4 flex items-start justify-between border-b border-gray-700/50">
        <div>
          <h3 className="text-lg font-semibold text-white">Week {week.weekNumber} Draft</h3>
          <p className="text-sm text-gray-500 mt-0.5">Drag players to reorder, move between boxes, or mark as absent</p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-gray-500 hover:text-white transition-colors"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Action Bar */}
      <div className="px-4 py-3 bg-gray-900/30 border-b border-gray-700/50 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {week.weekNumber >= 2 && (
            <button
              onClick={handleReset}
              disabled={isDisabled}
              className="px-3 py-1.5 bg-gray-700/50 hover:bg-gray-700 disabled:opacity-50 text-gray-300 rounded text-sm font-medium transition-colors"
            >
              {resetting ? 'Resetting...' : 'Reset to Auto'}
            </button>
          )}
          {hasChanges && (
            <button
              onClick={handleSave}
              disabled={isDisabled}
              className="px-3 py-1.5 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 disabled:opacity-50 rounded text-sm font-medium transition-colors"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>

        {!hasChanges && (
          <button
            onClick={handleActivate}
            disabled={isDisabled}
            className="px-4 py-1.5 bg-lime-600 hover:bg-lime-500 disabled:opacity-50 text-white rounded text-sm font-medium transition-colors"
          >
            {activating ? 'Activating...' : 'Activate Week'}
          </button>
        )}
      </div>

      {/* Status Messages */}
      <div className="px-4 pt-3 space-y-2">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
            {error}
          </div>
        )}
        {hasChanges && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-sm text-yellow-400 flex items-center gap-2">
            <span>●</span>
            <span>You have unsaved changes</span>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="p-4 space-y-4">
        {/* Expand/Collapse Controls */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">{totalBoxes} boxes</span>
          <div className="flex items-center gap-3 text-xs">
            <button
              onClick={() => setExpandedBoxes(new Set(boxNumbers))}
              className="text-gray-400 hover:text-lime-400 transition-colors"
            >
              Expand All
            </button>
            <button
              onClick={() => setExpandedBoxes(new Set())}
              className="text-gray-400 hover:text-lime-400 transition-colors"
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
          {/* Boxes Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {boxNumbers.map(boxNumber => (
              <DroppableBox
                key={boxNumber}
                boxNumber={boxNumber}
                players={playersByBox.get(boxNumber) || []}
                isOver={overBoxNumber === boxNumber}
                disabled={isDisabled}
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

          {/* Absent/Substitutes Area */}
          <AbsentSubsArea
            absentPlayers={absentPlayers}
            availableSubs={availableSubs}
            onAddSub={() => setShowAddSubModal(true)}
            onRemoveSub={handleRemoveSub}
            isOver={isOverAbsentArea}
            disabled={isDisabled}
          />

          {/* Drag Overlay */}
          <DragOverlay>
            <DragOverlayContent
              player={activePlayer || null}
              absentPlayer={activeAbsent || null}
              substitute={activeSub || null}
            />
          </DragOverlay>
        </DndContext>
      </div>

      {/* Add Substitute Modal */}
      <AddSubModal
        isOpen={showAddSubModal}
        onClose={() => setShowAddSubModal(false)}
        onSelect={handleAddSub}
        leagueId={leagueId}
        week={week}
        league={league}
        existingSubIds={new Set(availableSubs.map(s => s.odUserId))}
      />
    </div>
  );
};

export default BoxDraftWeekPanel;
