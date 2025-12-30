import React, { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/**
 * Shared status types for courts and matches in the allocation view.
 * We keep them narrow and focused on what the court board needs.
 * Later we can align these with your global types in types.ts if you like.
 */
export type MatchStatus = "WAITING" | "ASSIGNED" | "IN_PROGRESS" | "COMPLETED";
export type CourtStatus = "AVAILABLE" | "ASSIGNED" | "IN_USE" | "OUT_OF_SERVICE";

export interface Court {
  id: string;
  name: string;
  status: CourtStatus;
  currentMatchId?: string;
}

/**
 * This is a "view model" for matches on the court board.
 * It doesn't care about every tournament field, only what we need to show.
 * We'll map your real match objects into this shape in the parent component.
 */
export interface CourtMatch {
  id: string;
  division: string;
  roundLabel: string; // e.g. "Round 1", "Pool A", etc.
  matchLabel: string; // e.g. "Match 3"
  teamAName: string;
  teamBName: string;
  status: MatchStatus;
  courtId?: string;
  // V06.22: Rest timer info for queue display
  restingUntil?: number;  // Timestamp when all players have sufficient rest
  isReady?: boolean;      // True if match can be assigned now
}

interface CourtAllocationProps {
  courts: Court[];
  matches: CourtMatch[];

  /**
   * SMART filtered queue - matches that are eligible to be assigned
   * (teams not busy, sufficient rest time, etc.)
   * If provided, this is used for the Match Queue display instead of
   * filtering all matches by status === 'WAITING'
   */
  filteredQueue?: CourtMatch[];

  // Called when the organizer assigns a waiting match to a court
  onAssignMatchToCourt: (matchId: string, courtId: string) => void;

  // Called when the organizer (or later, players) start a match on a court
  onStartMatchOnCourt: (courtId: string) => void;

   // Called when the match on a court is finished (scores submitted)
  // Optional scores are provided so the parent can validate & record them.
  onFinishMatchOnCourt: (courtId: string, scoreTeamA?: number, scoreTeamB?: number) => void;

  // Called when the organizer reorders the waiting matches queue
  onReorderQueue?: (matchIds: string[]) => void;
}


/**
 * Sortable Match Item for drag & drop queue management
 */
interface SortableMatchItemProps {
  match: CourtMatch;
  index: number;
  courts: Court[];
  onAssignMatchToCourt: (matchId: string, courtId: string) => void;
  renderMatchStatusBadge: (status: MatchStatus) => React.ReactNode;
}

const SortableMatchItem: React.FC<SortableMatchItemProps> = ({
  match,
  index,
  courts,
  onAssignMatchToCourt,
  renderMatchStatusBadge,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: match.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border rounded p-3 text-sm bg-gray-900 ${
        isDragging ? "border-indigo-500 shadow-lg shadow-indigo-500/20" : "border-gray-700"
      }`}
    >
      <div className="flex items-start gap-2">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="mt-1 p-1 rounded hover:bg-gray-700 cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-300"
          title="Drag to reorder"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
          </svg>
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-mono">#{index + 1}</span>
              <span className="font-medium text-white">{match.division}</span>
            </div>
            {renderMatchStatusBadge(match.status)}
          </div>

          <div className="text-xs text-gray-400 mt-0.5">
            {match.roundLabel} • {match.matchLabel}
          </div>

          <div className="mt-1 text-gray-200">
            <div>{match.teamAName}</div>
            <div className="text-gray-500 text-xs">vs</div>
            <div>{match.teamBName}</div>
          </div>

          <div className="mt-2">
            <label className="block text-xs text-gray-300 mb-1">
              Assign to court:
            </label>
            <div className="flex gap-2 flex-wrap">
              {courts
                .filter((c) => c.status === "AVAILABLE")
                .map((court) => (
                  <button
                    key={court.id}
                    className="px-2 py-1 text-xs border border-gray-600 text-gray-200 rounded hover:bg-gray-700 hover:border-gray-500 transition-colors"
                    onClick={() => onAssignMatchToCourt(match.id, court.id)}
                  >
                    {court.name}
                  </button>
                ))}

              {courts.filter((c) => c.status === "AVAILABLE").length === 0 && (
                <span className="text-xs text-gray-500">
                  No available courts.
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * CourtAllocation is now a "real" component:
 * - It shows whatever courts + matches you pass in
 * - It notifies the parent when actions happen
 * - It does NOT store its own mock data
 *
 * The parent (e.g. TournamentManager) will:
 * - Load real data from Firebase
 * - Hold the state
 * - Pass down courts + matches + handlers
 */
export const CourtAllocation: React.FC<CourtAllocationProps> = ({
  courts,
  matches,
  filteredQueue,
  onAssignMatchToCourt,
  onStartMatchOnCourt,
  onFinishMatchOnCourt,
  onReorderQueue,
}) => {
  const [scoreInputs, setScoreInputs] = useState<Record<string, { teamA: string; teamB: string }>>({});

  const getScoresForMatch = (matchId: string) =>
    scoreInputs[matchId] ?? { teamA: "", teamB: "" };

  const handleScoreChange = (
    matchId: string,
    team: "A" | "B",
    value: string
  ) => {
    setScoreInputs(prev => ({
      ...prev,
      [matchId]: {
        teamA: team === "A" ? value : prev[matchId]?.teamA ?? "",
        teamB: team === "B" ? value : prev[matchId]?.teamB ?? "",
      },
    }));
  };

  // Waiting = use smart filtered queue if provided, otherwise fallback to status filter
  // filteredQueue is the SMART queue that accounts for busy teams, rest time, etc.
  const waitingMatches = filteredQueue ?? matches.filter((m) => m.status === "WAITING");

  // Drag & Drop sensors - support mouse, touch (mobile/app), and keyboard
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Prevent accidental drags
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200, // Long press to start drag on touch devices
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end - reorder the queue
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id && onReorderQueue) {
      const oldIndex = waitingMatches.findIndex((m) => m.id === active.id);
      const newIndex = waitingMatches.findIndex((m) => m.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(waitingMatches, oldIndex, newIndex);
        onReorderQueue(newOrder.map((m) => m.id));
      }
    }
  };

  // Helper to find the match currently on a court
  const getMatchForCourt = (court: Court): CourtMatch | undefined =>
    matches.find((m) => m.id === court.currentMatchId);

    const renderMatchStatusBadge = (status: MatchStatus) => {
    const base =
      "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide";

    switch (status) {
      case "WAITING":
        return (
          <span className={`${base} bg-amber-500 text-gray-900`}>
            Waiting
          </span>
        );
      case "ASSIGNED":
        return (
          <span className={`${base} bg-blue-500 text-white`}>
            Assigned
          </span>
        );
      case "IN_PROGRESS":
        return (
          <span className={`${base} bg-emerald-500 text-gray-900`}>
            Playing
          </span>
        );
      case "COMPLETED":
        return (
          <span className={`${base} bg-gray-600 text-gray-100`}>
            Done
          </span>
        );
      default:
        return null;
    }
  };


    const renderCourtStatusBadge = (status: CourtStatus) => {
    const base =
      "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide";

    switch (status) {
      case "AVAILABLE":
        return (
          <span className={`${base} bg-emerald-600 text-white`}>
            Available
          </span>
        );
      case "ASSIGNED":
        return (
          <span className={`${base} bg-blue-600 text-white`}>
            Assigned
          </span>
        );
      case "IN_USE":
        return (
          <span className={`${base} bg-red-600 text-white`}>
            In Use
          </span>
        );
      case "OUT_OF_SERVICE":
        return (
          <span className={`${base} bg-gray-700 text-gray-100`}>
            Out of Service
          </span>
        );
      default:
        return null;
    }
  };


  return (
  <div className="p-4 space-y-4 text-gray-200">
    {/* Header */}
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold text-white">Court Allocation</h1>
        <p className="text-sm text-gray-400">
          Assign matches to courts, start and finish matches in real time.
        </p>
      </div>
    </div>

    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Waiting Matches Queue with Drag & Drop */}
      <div className="lg:col-span-1 border rounded-lg p-3 bg-gray-800 border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-white">Match Queue</h2>
          {waitingMatches.length > 0 && (
            <span className="text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded">
              {waitingMatches.length} waiting
            </span>
          )}
        </div>

        {onReorderQueue && waitingMatches.length > 1 && (
          <p className="text-xs text-gray-500 mb-3 flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
            </svg>
            Drag to reorder • Long press on mobile
          </p>
        )}

        {waitingMatches.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-3xl mb-2">🎾</div>
            <p className="text-sm text-gray-500">Queue is empty</p>
            <p className="text-xs text-gray-600 mt-1">All matches are assigned or completed</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={waitingMatches.map((m) => m.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {waitingMatches.map((match, index) => (
                  <SortableMatchItem
                    key={match.id}
                    match={match}
                    index={index}
                    courts={courts}
                    onAssignMatchToCourt={onAssignMatchToCourt}
                    renderMatchStatusBadge={renderMatchStatusBadge}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Courts */}
      <div className="lg:col-span-2 border rounded-lg p-3 bg-gray-800 border-gray-700">
        <h2 className="font-semibold mb-2 text-white">Courts</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          {courts.map((court) => {
            const match = getMatchForCourt(court);

            return (
              <div
                key={court.id}
                className="border border-gray-700 rounded p-3 bg-gray-900 flex flex-col justify-between min-h-[140px]"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-semibold text-white">
                      {court.name}
                    </div>
                    <div className="mt-1">
                      {renderCourtStatusBadge(court.status)}
                    </div>
                  </div>
                  {match && renderMatchStatusBadge(match.status)}
                </div>

                <div className="mt-2 text-sm text-gray-200">
                  {match ? (
                    <>
                      <div className="text-xs text-gray-400">
                        {match.division} • {match.roundLabel} •{" "}
                        {match.matchLabel}
                      </div>
                      <div className="mt-1">
                        <div>{match.teamAName}</div>
                        <div className="text-gray-500 text-xs">vs</div>
                        <div>{match.teamBName}</div>
                      </div>
                      {court.status === "IN_USE" && (
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <label className="block text-gray-400">
                              {match.teamAName}
                            </label>
                            <input
                              type="number"
                              className="mt-1 w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-xs text-white"
                              value={getScoresForMatch(match.id).teamA}
                              onChange={e =>
                                handleScoreChange(match.id, "A", e.target.value)
                              }
                              placeholder="Score"
                            />
                          </div>
                          <div>
                            <label className="block text-gray-400">
                              {match.teamBName}
                            </label>
                            <input
                              type="number"
                              className="mt-1 w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-xs text-white"
                              value={getScoresForMatch(match.id).teamB}
                              onChange={e =>
                                handleScoreChange(match.id, "B", e.target.value)
                              }
                              placeholder="Score"
                            />
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-xs text-gray-500">
                      No match assigned.
                    </div>
                  )}
                </div>

                <div className="mt-3 flex gap-2 flex-wrap">
                  {court.status === "ASSIGNED" && (
                    <button
                      className="px-2 py-1 text-xs border border-gray-600 rounded text-gray-200 hover:bg-green-700 hover:border-green-600"
                      onClick={() => onStartMatchOnCourt(court.id)}
                    >
                      Start Match
                    </button>
                  )}

                  {court.status === "IN_USE" && match && (
                    <button
                      className="px-2 py-1 text-xs border border-blue-600 rounded text-gray-200 hover:bg-blue-700 hover:border-blue-500"
                      onClick={() => {
                        const scores = getScoresForMatch(match.id);
                        const scoreA = parseInt(scores.teamA, 10);
                        const scoreB = parseInt(scores.teamB, 10);
                        onFinishMatchOnCourt(court.id, scoreA, scoreB);
                      }}
                    >
                      Finish Match
                    </button>
                  )}


                  {court.status === "AVAILABLE" && !match && (
                    <span className="text-xs text-gray-500">
                      Waiting for assignment…
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  </div>
);
};