
import React, { useEffect, useMemo, useState } from 'react';
import { getAllTournaments, subscribeToDivisions, getActiveTeamCountForDivision } from '../../services/firebase';
import type { Tournament, Division } from '../../types';

interface DivisionOption {
  id: string;
  name: string;
  type?: string;
  isOpen?: boolean;
  teamCount?: number;
  maxTeams?: number;
}

interface TournamentEventSelectionProps {
  tournamentId: string;
  preselectedDivisionIds: string[];
  onBack: () => void;
  onContinue: (selectedDivisionIds: string[]) => void;
}

export const TournamentEventSelection: React.FC<TournamentEventSelectionProps> = ({
  tournamentId,
  preselectedDivisionIds,
  onBack,
  onContinue,
}) => {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [selectedDivisionIds, setSelectedDivisionIds] = useState<string[]>(preselectedDivisionIds);
  const [teamCounts, setTeamCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const all = await getAllTournaments(200);
        const found = all.find((t) => t.id === tournamentId) || null;
        setTournament(found);
      } catch (e) {
        console.error('Failed to load tournament', e);
        setError('Unable to load tournament data.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [tournamentId]);

  useEffect(() => {
    if (tournamentId) {
        const unsub = subscribeToDivisions(tournamentId, setDivisions);
        return () => unsub();
    }
  }, [tournamentId]);

  // Load team counts for capacity checking
  useEffect(() => {
    const loadTeamCounts = async () => {
      if (divisions.length === 0) return;
      const counts: Record<string, number> = {};
      await Promise.all(
        divisions.map(async (div) => {
          counts[div.id] = await getActiveTeamCountForDivision(tournamentId, div.id);
        })
      );
      setTeamCounts(counts);
    };
    loadTeamCounts();
  }, [tournamentId, divisions]);

  const divisionOptions: DivisionOption[] = useMemo(() => {
    return divisions.map(div => ({
      id: div.id,
      name: div.name,
      type: div.type,
      isOpen: div.registrationOpen,
      teamCount: teamCounts[div.id] ?? 0,
      maxTeams: div.maxTeams,
    }));
  }, [divisions, teamCounts]);

  const toggleDivision = (id: string, isFull: boolean) => {
    // Don't allow selecting full divisions
    if (isFull && !selectedDivisionIds.includes(id)) return;
    setSelectedDivisionIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  const handleContinue = () => {
    if (!selectedDivisionIds.length) {
      alert('Please select at least one event to continue.');
      return;
    }
    onContinue(selectedDivisionIds);
  };

  if (loading) return <div className="p-4 text-gray-400">Loading tournament events...</div>;
  if (error || !tournament) return <div className="p-4 text-red-400">{error || 'Tournament not found.'}</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 pb-24 pt-4 animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Choose Your Events</h1>
        <p className="text-sm text-gray-400">
          You can join multiple events for this tournament. Partner invite events are pre-selected.
        </p>
      </div>

      <div className="space-y-3">
        {divisionOptions.map((division) => {
          const isFull = division.maxTeams ? (division.teamCount ?? 0) >= division.maxTeams : false;
          const isSelected = selectedDivisionIds.includes(division.id);
          const isDisabled = division.isOpen === false || (isFull && !isSelected);

          return (
            <button
              key={division.id}
              onClick={() => toggleDivision(division.id, isFull)}
              disabled={isDisabled}
              className={`w-full text-left rounded-xl border p-4 transition-all ${
                isDisabled
                  ? 'bg-gray-800/40 border-gray-700 opacity-60 cursor-not-allowed'
                  : isSelected
                    ? 'bg-green-600/20 border-green-400'
                    : 'bg-gray-800/40 border-gray-700 hover:border-gray-600'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-white font-medium">{division.name}</span>
                <div className="flex items-center gap-2">
                  {division.maxTeams && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      isFull ? 'bg-red-900/40 text-red-400' : 'bg-gray-900 text-gray-400'
                    }`}>
                      {division.teamCount}/{division.maxTeams}
                    </span>
                  )}
                  {division.type && (
                    <span className="text-xs uppercase tracking-wide text-gray-400 bg-gray-900 px-2 py-0.5 rounded-full">
                      {division.type}
                    </span>
                  )}
                </div>
              </div>
              {division.isOpen === false && (
                <p className="text-xs text-red-400 mt-1">This event is currently closed.</p>
              )}
              {isFull && !isSelected && (
                <p className="text-xs text-orange-400 mt-1">This event is full.</p>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-8 flex justify-between items-center">
        <button
          onClick={onBack}
          className="text-sm text-gray-400 hover:text-white px-4 py-2 border border-gray-700 rounded-full"
        >
          ← Back
        </button>
        <button
          onClick={handleContinue}
          className="bg-green-500 hover:bg-green-400 text-black font-semibold px-6 py-2 rounded-full"
        >
          Continue
        </button>
      </div>
    </div>
  );
};
