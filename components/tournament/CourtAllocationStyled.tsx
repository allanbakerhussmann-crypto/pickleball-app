/**
 * CourtAllocationStyled - V07.02
 *
 * Redesigned Court Allocation with "Sports Command Center" aesthetic.
 * Matches the visual style of DivisionSettingsTab.
 *
 * @file components/tournament/CourtAllocationStyled.tsx
 */
import React, { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
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
import type { Match as UniversalMatch, GameScore } from '../../types/game/match';
import type { GameSettings } from '../../types/game/gameSettings';
import { ScoreEntryModal } from '../shared/ScoreEntryModal';

// Import types from original CourtAllocation
export type MatchStatus = 'WAITING' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED';
export type CourtStatus = 'AVAILABLE' | 'ASSIGNED' | 'IN_USE' | 'OUT_OF_SERVICE';

export interface Court {
  id: string;
  name: string;
  status: CourtStatus;
  currentMatchId?: string;
}

export interface CourtMatch {
  id: string;
  division: string;
  roundLabel: string;
  matchLabel: string;
  teamAName: string;
  teamBName: string;
  status: MatchStatus;
  courtId?: string;
  courtName?: string;
  restingUntil?: number;
  isReady?: boolean;
}

// V07.02: Import court settings type
import type { TournamentCourtSettings, Court as FirestoreCourt } from '../../types';

// V07.02: Court tier type for badge display
type CourtTier = 'gold' | 'plate' | 'semi' | 'regular';

interface CourtAllocationStyledProps {
  courts: Court[];
  matches: CourtMatch[];
  filteredQueue?: CourtMatch[];
  courtSettings?: TournamentCourtSettings;  // V07.02: Premier court settings
  firestoreCourts?: FirestoreCourt[];  // V07.02: For ID-to-name mapping
  gameSettings?: GameSettings;  // V07.03: Game settings for ScoreEntryModal
  onAssignMatchToCourt: (matchId: string, courtId: string) => void;
  onStartMatchOnCourt: (courtId: string) => void;
  onFinishMatchOnCourt: (courtId: string, scoreTeamA?: number, scoreTeamB?: number, scores?: GameScore[]) => void;
  onReorderQueue?: (matchIds: string[]) => void;
}

// Glass card component
const GlassCard: React.FC<{
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, badge, children, className = '' }) => (
  <div className={`
    relative overflow-hidden rounded-xl border backdrop-blur-sm
    bg-gradient-to-br from-gray-900/80 to-gray-900/40
    border-gray-700/50
    ${className}
  `}>
    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

    <div className="px-5 py-4 border-b border-gray-700/30 flex items-center justify-between">
      <div>
        <h3 className="font-bold text-white">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {badge}
    </div>

    <div className="p-4">
      {children}
    </div>
  </div>
);

// Sortable match item for queue
const SortableMatchItem: React.FC<{
  match: CourtMatch;
  index: number;
  courts: Court[];
  onAssignMatchToCourt: (matchId: string, courtId: string) => void;
}> = ({ match, index, courts, onAssignMatchToCourt }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: match.id });
  const [now, setNow] = useState(Date.now());

  const isReady = match.isReady ?? true;
  const isResting = !isReady && match.restingUntil && match.restingUntil > now;

  useEffect(() => {
    if (!isResting) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isResting]);

  const secondsRemaining = isResting ? Math.ceil((match.restingUntil! - now) / 1000) : 0;
  const formatCountdown = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  const availableCourts = courts.filter(c => c.status === 'AVAILABLE');

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        group relative rounded-xl p-4
        transition-all duration-200 ease-out
        ${isDragging
          ? 'bg-gray-800/90 border-2 border-lime-500 shadow-2xl shadow-lime-500/20 scale-[1.02]'
          : isResting
            ? 'bg-gray-800/50 border border-amber-700/50'
            : 'bg-gray-800/50 border border-gray-700/50 hover:border-gray-600/70'}
      `}
    >
      <div className="flex items-start gap-3">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className={`
            mt-1 p-2 rounded-lg cursor-grab active:cursor-grabbing
            transition-colors duration-200
            ${isDragging ? 'bg-lime-500/20 text-lime-400' : 'bg-gray-700/50 text-gray-500 hover:text-gray-300'}
          `}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
          </svg>
        </button>

        {/* Queue position badge */}
        <div className="
          w-8 h-8 rounded-lg flex items-center justify-center
          bg-gradient-to-br from-gray-600 to-gray-700
          text-white font-bold text-sm shadow-md
        ">
          {index + 1}
        </div>

        {/* Match info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-semibold text-white truncate">{match.division}</span>
            <div className="flex items-center gap-2">
              {isResting && (
                <span className="px-2 py-0.5 text-xs rounded-md bg-amber-500/20 text-amber-400 font-mono border border-amber-500/30">
                  Rest {formatCountdown(secondsRemaining)}
                </span>
              )}
              <span className="px-2 py-0.5 text-xs rounded-md bg-blue-500/20 text-blue-400 font-medium">
                Waiting
              </span>
            </div>
          </div>

          <p className="text-xs text-gray-500 mb-2">
            {match.roundLabel} • {match.matchLabel}
          </p>

          {/* Teams */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-200 truncate">{match.teamAName}</span>
            <span className="text-gray-600 text-xs">vs</span>
            <span className="text-gray-200 truncate">{match.teamBName}</span>
          </div>

          {/* Court assignment buttons */}
          <div className="mt-3 flex flex-wrap gap-2">
            {availableCourts.length === 0 ? (
              <span className="text-xs text-gray-500 italic">No courts available</span>
            ) : (
              availableCourts.map(court => (
                <button
                  key={court.id}
                  onClick={() => !isResting && onAssignMatchToCourt(match.id, court.id)}
                  disabled={!!isResting}
                  className={`
                    px-3 py-1.5 text-xs font-medium rounded-lg
                    transition-all duration-200
                    ${isResting
                      ? 'bg-gray-700/50 text-gray-600 cursor-not-allowed'
                      : 'bg-gray-700/70 text-gray-200 hover:bg-lime-600 hover:text-white border border-gray-600/50 hover:border-lime-500'}
                  `}
                >
                  → {court.name}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// V07.02: Court tier badge configs
const tierBadgeConfigs: Record<CourtTier, { emoji: string; label: string; bgColor: string; borderColor: string; textColor: string } | null> = {
  gold: { emoji: '🥇', label: 'Gold', bgColor: 'bg-yellow-500/20', borderColor: 'border-yellow-500/30', textColor: 'text-yellow-400' },
  plate: { emoji: '🥈', label: 'Plate', bgColor: 'bg-slate-400/20', borderColor: 'border-slate-400/30', textColor: 'text-slate-300' },
  semi: { emoji: '⭐', label: 'Semi', bgColor: 'bg-purple-500/20', borderColor: 'border-purple-500/30', textColor: 'text-purple-400' },
  regular: null, // No badge for regular courts
};

// Court card component
const CourtCard: React.FC<{
  court: Court;
  match?: CourtMatch;
  tier?: CourtTier;  // V07.02: Court tier for badge display
  onStartMatch: () => void;
  onOpenScoreModal: () => void;  // V07.03: Open ScoreEntryModal instead of inline inputs
}> = ({ court, match, tier, onStartMatch, onOpenScoreModal }) => {
  const statusStyles: Record<CourtStatus, { bg: string; text: string; label: string }> = {
    AVAILABLE: { bg: 'bg-lime-500/20 border-lime-500/30', text: 'text-lime-400', label: 'Available' },
    ASSIGNED: { bg: 'bg-blue-500/20 border-blue-500/30', text: 'text-blue-400', label: 'Assigned' },
    IN_USE: { bg: 'bg-amber-500/20 border-amber-500/30', text: 'text-amber-400', label: 'In Play' },
    OUT_OF_SERVICE: { bg: 'bg-gray-700/50 border-gray-600/30', text: 'text-gray-500', label: 'Out of Service' },
  };

  const status = statusStyles[court.status];
  const tierBadge = tier ? tierBadgeConfigs[tier] : null;

  return (
    <div className={`
      relative overflow-hidden rounded-xl border
      bg-gradient-to-br from-gray-800/80 to-gray-900/60
      ${status.bg}
      transition-all duration-200 ease-out
      hover:shadow-lg
    `}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-white">{court.name}</span>
          {/* V07.02: Court tier badge */}
          {tierBadge && (
            <span className={`
              inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-md
              ${tierBadge.bgColor} ${tierBadge.borderColor} ${tierBadge.textColor} border
            `}>
              <span>{tierBadge.emoji}</span>
              <span>{tierBadge.label}</span>
            </span>
          )}
        </div>
        <span className={`px-2.5 py-1 text-xs font-bold rounded-md uppercase tracking-wide border ${status.bg} ${status.text}`}>
          {status.label}
        </span>
      </div>

      {/* Content */}
      <div className="p-4">
        {court.status === 'OUT_OF_SERVICE' && (
          <p className="text-sm text-gray-500">Court is currently unavailable.</p>
        )}

        {court.status === 'AVAILABLE' && !match && (
          <div className="text-center py-4">
            <p className="text-gray-500 text-sm">No match assigned.</p>
            <p className="text-gray-600 text-xs mt-1">Waiting for assignment...</p>
          </div>
        )}

        {match && (court.status === 'ASSIGNED' || court.status === 'IN_USE') && (
          <div className="space-y-3">
            {/* Match info */}
            <div className="text-xs text-gray-500 mb-2">
              {match.division} • {match.roundLabel}
            </div>

            {/* Teams - V07.03: Removed inline inputs, using ScoreEntryModal instead */}
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-gray-700/30 rounded-lg px-3 py-2">
                <span className="text-white font-medium truncate">{match.teamAName}</span>
              </div>
              <div className="text-center text-gray-600 text-xs">vs</div>
              <div className="flex items-center justify-between bg-gray-700/30 rounded-lg px-3 py-2">
                <span className="text-white font-medium truncate">{match.teamBName}</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="pt-2">
              {court.status === 'ASSIGNED' && (
                <button
                  onClick={onStartMatch}
                  className="
                    w-full py-2.5 rounded-lg font-semibold text-sm
                    bg-gradient-to-r from-lime-600 to-lime-500 text-gray-900
                    hover:from-lime-500 hover:to-lime-400
                    shadow-lg shadow-lime-500/20
                    transition-all duration-200
                    flex items-center justify-center gap-2
                  "
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  </svg>
                  Start Match
                </button>
              )}

              {court.status === 'IN_USE' && (
                <button
                  onClick={onOpenScoreModal}
                  className="
                    w-full py-2.5 rounded-lg font-semibold text-sm
                    bg-gradient-to-r from-amber-600 to-amber-500 text-white
                    hover:from-amber-500 hover:to-amber-400
                    shadow-lg shadow-amber-500/20
                    transition-all duration-200
                    flex items-center justify-center gap-2
                  "
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Enter Score
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const CourtAllocationStyled: React.FC<CourtAllocationStyledProps> = ({
  courts,
  matches,
  filteredQueue,
  courtSettings,  // V07.02: Premier court settings
  firestoreCourts: _firestoreCourts,  // V07.02: For ID-to-name mapping (kept for future use)
  gameSettings,  // V07.03: Game settings for ScoreEntryModal
  onAssignMatchToCourt,
  onStartMatchOnCourt,
  onFinishMatchOnCourt,
  onReorderQueue,
}) => {
  // V07.03: State for score entry modal
  const [scoreModalData, setScoreModalData] = useState<{
    courtId: string;
    match: CourtMatch;
  } | null>(null);
  const [isSubmittingScore, setIsSubmittingScore] = useState(false);

  // V07.03: Default game settings if not provided
  const defaultGameSettings: GameSettings = gameSettings || {
    playType: 'doubles',
    pointsPerGame: 11,
    winBy: 2,
    bestOf: 1,
  };

  // V07.03: Handle score submission from modal
  const handleScoreSubmit = async (scores: GameScore[], _winnerId: string) => {
    if (!scoreModalData) return;

    setIsSubmittingScore(true);
    try {
      // Extract first game score for legacy compatibility
      const scoreA = scores[0]?.scoreA;
      const scoreB = scores[0]?.scoreB;
      onFinishMatchOnCourt(scoreModalData.courtId, scoreA, scoreB, scores);
      setScoreModalData(null);
    } catch (error) {
      console.error('Failed to submit score:', error);
      alert('Failed to submit score. Please try again.');
    } finally {
      setIsSubmittingScore(false);
    }
  };

  // V07.03: Convert CourtMatch to Match for ScoreEntryModal
  const getMatchForModal = (): UniversalMatch | null => {
    if (!scoreModalData) return null;
    const { match } = scoreModalData;
    return {
      id: match.id,
      eventType: 'tournament',
      eventId: '',
      format: 'pool_play_medals',
      sideA: {
        id: match.teamAName,
        name: match.teamAName,
        playerIds: [],
      },
      sideB: {
        id: match.teamBName,
        name: match.teamBName,
        playerIds: [],
      },
      gameSettings: defaultGameSettings,
      status: 'in_progress',
      scores: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  };

  // Legacy score input state removed in V07.03 - now using ScoreEntryModal

  const waitingMatches = filteredQueue ?? matches.filter(m => m.status === 'WAITING');

  // V07.02: Get court tier based on courtSettings
  const getCourtTier = (courtId: string): CourtTier => {
    if (!courtSettings) return 'regular';

    // Find the Firestore court ID from the court view model
    // The court view model ID should match the Firestore court ID
    if (courtSettings.goldCourtId === courtId) return 'gold';
    if (courtSettings.plateCourtId === courtId) return 'plate';
    if (courtSettings.semiCourtIds?.includes(courtId)) return 'semi';
    return 'regular';
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id && onReorderQueue) {
      const oldIndex = waitingMatches.findIndex(m => m.id === active.id);
      const newIndex = waitingMatches.findIndex(m => m.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(waitingMatches, oldIndex, newIndex);
        onReorderQueue(newOrder.map(m => m.id));
      }
    }
  };

  const getMatchForCourt = (court: Court): CourtMatch | undefined =>
    matches.find(m => m.id === court.currentMatchId);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-lime-500/20 to-lime-600/10 flex items-center justify-center border border-lime-500/20">
          <svg className="w-5 h-5 text-lime-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">Court Allocation</h2>
          <p className="text-sm text-gray-500">Assign matches to courts, start and finish matches in real time.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Match Queue */}
        <GlassCard
          title="Match Queue"
          subtitle="Drag to reorder priority"
          badge={
            waitingMatches.length > 0 && (
              <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30">
                {waitingMatches.length} waiting
              </span>
            )
          }
          className="lg:col-span-1"
        >
          {waitingMatches.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-800/50 flex items-center justify-center">
                <span className="text-3xl">🎾</span>
              </div>
              <p className="text-gray-400 font-medium">Queue is empty</p>
              <p className="text-xs text-gray-600 mt-1">All matches are assigned or completed</p>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={waitingMatches.map(m => m.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                  {waitingMatches.map((match, index) => (
                    <SortableMatchItem
                      key={match.id}
                      match={match}
                      index={index}
                      courts={courts}
                      onAssignMatchToCourt={onAssignMatchToCourt}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </GlassCard>

        {/* Courts Grid */}
        <GlassCard
          title="Courts"
          subtitle={`${courts.filter(c => c.status === 'AVAILABLE').length} available`}
          className="lg:col-span-2"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {courts.map(court => {
              const match = getMatchForCourt(court);

              return (
                <CourtCard
                  key={court.id}
                  court={court}
                  match={match}
                  tier={getCourtTier(court.id)}
                  onStartMatch={() => onStartMatchOnCourt(court.id)}
                  onOpenScoreModal={() => match && setScoreModalData({ courtId: court.id, match })}
                />
              );
            })}
          </div>
        </GlassCard>
      </div>

      {/* V07.03: Score Entry Modal */}
      {scoreModalData && (
        <ScoreEntryModal
          isOpen={!!scoreModalData}
          onClose={() => setScoreModalData(null)}
          match={getMatchForModal()!}
          onSubmit={handleScoreSubmit}
          isLoading={isSubmittingScore}
        />
      )}
    </div>
  );
};
