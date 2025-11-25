
import React, { useState } from 'react';
import type { Team, Division, UserProfile } from '../types';

interface TeamSetupProps {
  teams: Team[];
  activeDivision: Division;
  playersCache: Record<string, UserProfile>;
  onAddTeam: (data: { name: string; playerIds: string[] }) => Promise<void>;
  onDeleteTeam: (id: string) => Promise<void>;
  onGenerateSchedule: () => Promise<void>;
  scheduleGenerated: boolean;
  isVerified: boolean;
}

// Dummy manual player create for demo (would usually use existing users)
const generateId = () => Date.now().toString();

export const TeamSetup: React.FC<TeamSetupProps> = ({
  teams,
  activeDivision,
  playersCache,
  onAddTeam,
  onDeleteTeam,
  onGenerateSchedule,
  scheduleGenerated,
  isVerified
}) => {
  const [p1Name, setP1Name] = useState('');
  const [p2Name, setP2Name] = useState('');
  const [teamName, setTeamName] = useState('');
  const [loading, setLoading] = useState(false);

  const isDoubles = activeDivision.type === 'doubles';

  const handleAdd = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      
      // In a real app, we'd search for users. Here we use ID placeholders or create dummy users if simple manual entry.
      // For the purpose of this "Manager" view, let's assume manual entry creates placeholder IDs if not searching DB.
      // Since we removed Player management from tournament array, we just pass IDs.
      // NOTE: To make this work visually without real UserProfiles, the parent needs to handle "unknown" IDs gracefully 
      // or we mock the IDs.
      
      const p1Id = `manual_${generateId()}_1`;
      const p2Id = `manual_${generateId()}_2`;
      
      // Note: In a full implementation, we'd create UserProfiles for these manual entries 
      // or search existing. Passing just IDs for now.
      
      await onAddTeam({
          name: teamName || p1Name, // fallback
          playerIds: isDoubles ? [p1Id, p2Id] : [p1Id]
      });
      
      setP1Name('');
      setP2Name('');
      setTeamName('');
      setLoading(false);
  };

  return (
    <div className="space-y-6">
        <form onSubmit={handleAdd} className="bg-gray-700/50 p-4 rounded border border-gray-600">
            <h4 className="text-white font-bold mb-4 text-sm">Add Manual Entry</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <input 
                    value={p1Name} onChange={e => setP1Name(e.target.value)}
                    placeholder="Player 1 Name"
                    className="bg-gray-800 text-white p-2 rounded border border-gray-600"
                />
                {isDoubles && (
                    <input 
                        value={p2Name} onChange={e => setP2Name(e.target.value)}
                        placeholder="Player 2 Name"
                        className="bg-gray-800 text-white p-2 rounded border border-gray-600"
                    />
                )}
            </div>
            {isDoubles && (
                <input 
                    value={teamName} onChange={e => setTeamName(e.target.value)}
                    placeholder="Team Name (Optional)"
                    className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 mb-4"
                />
            )}
            <button disabled={loading} className="bg-green-600 text-white px-4 py-2 rounded font-bold w-full">
                {loading ? 'Adding...' : 'Add Team'}
            </button>
        </form>

        <div className="space-y-2">
            {teams.map((t, i) => (
                <div key={t.id} className="bg-gray-900 p-3 rounded flex justify-between items-center border border-gray-700">
                    <div className="flex items-center gap-3">
                        <span className="text-gray-500 w-6">{i+1}.</span>
                        <div>
                            <div className="text-white font-bold">{t.teamName || 'Team'}</div>
                            <div className="text-xs text-gray-400">
                                {t.players.map(pid => playersCache[pid]?.displayName || 'Manual Entry').join(' / ')}
                            </div>
                        </div>
                    </div>
                    <button onClick={() => onDeleteTeam(t.id)} className="text-red-400 text-xl">&times;</button>
                </div>
            ))}
            {teams.length === 0 && <div className="text-gray-500 text-center italic">No teams yet.</div>}
        </div>

        <button 
            onClick={onGenerateSchedule}
            disabled={teams.length < 2}
            className="w-full bg-blue-600 text-white font-bold py-3 rounded hover:bg-blue-500 disabled:bg-gray-700"
        >
            {scheduleGenerated ? 'Regenerate Schedule' : 'Generate Schedule'}
        </button>
    </div>
  );
};
