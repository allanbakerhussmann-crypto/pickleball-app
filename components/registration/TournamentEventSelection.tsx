import React, { useEffect, useMemo, useState } from 'react';
import { getAllTournaments } from '../../services/firebase';
import type { Tournament } from '../../types';

interface TournamentWithDivisions extends Tournament {
  // Make minimal assumptions about the shape of divisions so we don't
  // break your existing types. This will happily work even if your
  // Tournament type already has a more specific "divisions" field.
  divisions?: {
    id: string;
    name?: string;
    label?: string;
    type?: string; // 'singles' | 'doubles' | 'mixed' | etc.
    isOpen?: boolean;
    [key: string]: any;
  }[];
}

interface TournamentEventSelectionProps {
  tournamentId: string;
  preselectedDivisionIds: string[];
  onBack: () => void;
  // Called when the user confirms which divisions they want
  onContinue: (selectedDivisionIds: string[]) => void;
}

/**
 * TournamentEventSelection
 *
 * After the player has responded to partner invites for a specific
 * tournament, this screen lets them:
 *
 *  - See all divisions/events for that tournament
 *  - Keep any events linked to accepted partner invites pre-selected
 *  - Tick additional events (e.g. Singles) to register at the same time
 */
export const TournamentEventSelection: React.FC<TournamentEventSelectionProps> = ({
  tournamentId,
  preselectedDivisionIds,
  onBack,
  onContinue,
}) => {
  const [tournament, setTournament] = useState<TournamentWithDivisions | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDivisionIds, setSelectedDivisionIds] = useState<string[]>(preselectedDivisionIds);
  const [error, setError] = useState<string | null>(null);

  // Load tournament + its divisions using existing firebase helper
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const all = await getAllTournaments(200);
        const found = (all as TournamentWithDivisions[]).find((t) => t.id === tournamentId) || null;
        if (!found) {
          setError('Tournament not found.');
        }
        setTournament(found || null);

        // Ensure we keep only valid preselected ids
        if (found?.divisions?.length && preselectedDivisionIds.length) {
          const validIds = preselectedDivisionIds.filter((id) =>
            found.divisions!.some((d) => d.id === id),
          );
          setSelectedDivisionIds(validIds.length ? validIds : preselectedDivisionIds);
        }
      } catch (e) {
        console.error('Failed to load tournament', e);
        setError('Unable to load tournament details. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    if (tournamentId) {
      load();
    }
  }, [tournamentId, preselectedDivisionIds]);

  const divisions = useMemo(
    () => tournament?.divisions ?? [],
    [tournament],
  );

  const toggleDivision = (divisionId: string) => {
    setSelectedDivisionIds((current) =>
      current.includes(divisionId)
        ? current.filter((id) => id !== divisionId)
        : [...current, divisionId],
    );
  };

  const handleContinue = () => {
    if (!selectedDivisionIds.length) {
      // You can replace this with a nicer toast/snackbar if you already have one
      alert('Please select at least one event to continue.');
      return;
    }

    onContinue(selectedDivisionIds);
  };

  const getDivisionLabel = (division: TournamentWithDivisions['divisions'][number], index: number) => {
    const base = division.name || division.label || `Division ${index + 1}`;
    return base;
  };

  const getDivisionTypeTag = (division: TournamentWithDivisions['divisions'][number]) => {
    const typeRaw =
      division.type ||
      division.category ||
      division.format ||
      '';

    const type = typeof typeRaw === 'string' ? typeRaw.toLowerCase() : '';

    if (type.includes('single')) return 'Singles';
    if (type.includes('mixed')) return 'Mixed doubles';
    if (type.includes('double')) return 'Doubles';

    // Fallback to a best-guess based on the name
    const name = (division.name || division.label || '').toLowerCase();
    if (name.includes('single')) return 'Singles';
    if (name.includes('mixed')) return 'Mixed doubles';
    if (name.includes('double')) return 'Doubles';

    return '';
  };

  const isPreselected = (id: string) => preselectedDivisionIds.includes(id);

  return (
    <div className="max-w-3xl mx-auto px-4 pb-24 pt-4 animate-fade-in">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-green-400 uppercase mb-2">
            Tournament events
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">
            Choose your events
          </h1>
          <p className="mt-2 text-sm sm:text-base text-gray-400">
            You can join singles and doubles for the same tournament here. Events already
            linked to accepted partner invites are pre-selected.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="hidden sm:inline-flex items-center rounded-full border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800/80"
        >
          ← Back
        </button>
      </div>

      {loading ? (
        <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 text-center text-gray-400">
          Loading tournament events...
        </div>
      ) : error || !tournament ? (
        <div className="bg-red-950/40 border border-red-700/60 rounded-2xl p-6 text-center">
          <p className="text-sm text-red-300">{error || 'Tournament not found.'}</p>
          <button
            type="button"
            onClick={onBack}
            className="mt-3 inline-flex items-center rounded-full border border-red-500/60 px-3 py-1.5 text-xs text-red-100 hover:bg-red-900/40"
          >
            ← Back
          </button>
        </div>
      ) : (
        <>
          <div className="mb-4 rounded-2xl border border-gray-800 bg-gray-950/80 p-4">
            <p className="text-xs text-gray-400 uppercase tracking-[0.18em] mb-1">
              Tournament
            </p>
            <p className="text-base font-semibold text-white">{tournament.name}</p>
            {tournament.location && (
              <p className="mt-1 text-xs text-gray-400">{tournament.location}</p>
            )}
          </div>

          {divisions.length === 0 ? (
            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 text-center text-gray-400">
              No events are currently available for this tournament.
            </div>
          ) : (
            <div className="space-y-3">
              {divisions.map((division, index) => {
                const id = division.id;
                const selected = selectedDivisionIds.includes(id);
                const pre = isPreselected(id);
                const label = getDivisionLabel(division, index);
                const typeTag = getDivisionTypeTag(division);
                const isDisabled = division.isOpen === false;

                return (
                  <button
                    key={id}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => !isDisabled && toggleDivision(id)}
                    className={`w-full text-left rounded-2xl border p-4 sm:p-5 transition flex items-start gap-3 sm:gap-4 ${
                      isDisabled
                        ? 'border-gray-800 bg-gray-900/60 cursor-not-allowed opacity-60'
                        : selected
                        ? 'border-green-400/80 bg-gradient-to-br from-green-500/10 to-emerald-900/20 shadow-lg shadow-emerald-900/30'
                        : 'border-gray-800 bg-gradient-to-br from-gray-950/80 to-gray-900/80 hover:border-gray-700 hover:bg-gray-900'
                    }`}
                  >
                    <div className="mt-1">
                      <div
                        className={`h-5 w-5 rounded-full border flex items-center justify-center ${
                          selected
                            ? 'border-green-400 bg-green-500/20'
                            : 'border-gray-600 bg-gray-900'
                        }`}
                      >
                        {selected && (
                          <svg
                            className="h-3 w-3 text-green-300"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2.5}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <p className="text-sm sm:text-base font-semibold text-white">
                          {label}
                        </p>
                        {typeTag && (
                          <span className="inline-flex items-center rounded-full bg-gray-800/90 px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.12em] text-gray-300">
                            {typeTag}
                          </span>
                        )}
                        {pre && (
                          <span className="inline-flex items-center rounded-full bg-emerald-500/15 border border-emerald-400/50 px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.12em] text-emerald-200">
                            From partner invite
                          </span>
                        )}
                      </div>
                      <p className="text-xs sm:text-sm text-gray-400">
                        Tap to {selected ? 'remove this event from' : 'add this event to'} your
                        registration for this tournament.
                      </p>
                      {isDisabled && (
                        <p className="mt-1 text-[0.7rem] text-red-300">
                          This event is currently closed.
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Mobile back button */}
      <button
        type="button"
        onClick={onBack}
        className="mt-4 inline-flex sm:hidden items-center rounded-full border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800/80"
      >
        ← Back
      </button>

      {/* Sticky footer with primary continue action */}
      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-gray-950 via-gray-950/98 to-gray-950/90 border-t border-gray-800/80">
        <div className="max-w-3xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
          <p className="text-xs sm:text-sm text-gray-400 flex-1">
            {divisions.length === 0
              ? 'There are no open events for this tournament right now.'
              : 'Select all the events you want to enter for this tournament, then continue.'}
          </p>
          <button
            type="button"
            disabled={divisions.length === 0}
            onClick={handleContinue}
            className={`w-full sm:w-auto inline-flex items-center justify-center rounded-full px-4 sm:px-6 py-2 text-xs sm:text-sm font-semibold tracking-wide transition ${
              divisions.length === 0
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700'
                : 'bg-green-500 text-gray-900 hover:bg-green-400 border border-green-400 shadow-lg shadow-green-900/30'
            }`}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};
