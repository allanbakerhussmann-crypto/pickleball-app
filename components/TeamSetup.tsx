/**
 * TeamSetup Component
 *
 * Allows adding/removing teams and generating schedule.
 *
 * V06.17 Changes:
 * - Improved division code generation to handle similar names
 * - "md open" and "md open 60 plus" now get different codes (includes numbers)
 *
 * V06.16 Changes:
 * - "Add Test Entry" form now only visible in test mode
 * - Test entries use `test_player_` prefix for clearability
 * - Yellow styling to indicate test-only feature
 *
 * V06.10 Changes:
 * - Added payment status display
 * - Added "Mark as Paid" button for organizers (manual payments)
 *
 * @version 06.17
 * @file components/TeamSetup.tsx
 */
import React, { useState } from 'react';
import type { Team, Division, UserProfile } from '../types';
import { markTeamAsPaid, ensureTeamExists } from '../services/firebase';

interface TeamSetupProps {
  teams: Team[];
  activeDivision: Division;
  playersCache: Record<string, UserProfile>;
  onAddTeam: (data: { name: string; playerIds: string[] }) => Promise<void>;
  onDeleteTeam: (id: string) => Promise<void>;
  onGenerateSchedule: () => Promise<void>;
  scheduleGenerated: boolean;
  isVerified: boolean;
  /** True if any match has started (in_progress or completed) */
  playHasStarted?: boolean;
  /** Tournament ID (required for payment actions) */
  tournamentId?: string;
  /** Entry fee for this tournament (0 = free) */
  entryFee?: number;
  /** Current user ID (for marking payments) */
  currentUserId?: string;
  /** Whether current user can manage tournament */
  canManage?: boolean;
  /** Whether test mode is active (shows manual entry form) */
  testMode?: boolean;
  /** Division name for unique test player IDs */
  divisionName?: string;
}

const generateId = () => Date.now().toString();

export const TeamSetup: React.FC<TeamSetupProps> = ({
  teams,
  activeDivision,
  playersCache,
  onAddTeam,
  onDeleteTeam,
  onGenerateSchedule,
  scheduleGenerated,
  isVerified,
  playHasStarted = false,
  tournamentId,
  entryFee = 0,
  currentUserId,
  canManage = false,
  testMode = false,
  divisionName,
}) => {
  const [p1Name, setP1Name] = useState('');
  const [p2Name, setP2Name] = useState('');
  const [teamName, setTeamName] = useState('');
  const [loading, setLoading] = useState(false);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);

  const handleMarkAsPaid = async (team: Team) => {
    if (!tournamentId || !currentUserId) return;
    setMarkingPaid(team.id);
    try {
      await markTeamAsPaid(tournamentId, team.id, entryFee, currentUserId);
    } catch (error) {
      console.error('Failed to mark team as paid:', error);
    } finally {
      setMarkingPaid(null);
    }
  };

  // Get payment badge for a team
  const getPaymentBadge = (team: Team) => {
    if (entryFee === 0) return null; // Free event, no badge needed

    const status = team.paymentStatus || 'pending';
    const method = team.paymentMethod;

    if (status === 'paid') {
      return (
        <span className={`text-xs px-2 py-0.5 rounded ${
          method === 'stripe' ? 'bg-green-600 text-white' : 'bg-green-700 text-green-100'
        }`}>
          {method === 'stripe' ? '✓ Paid (Card)' : '✓ Paid (Cash)'}
        </span>
      );
    }

    if (status === 'processing') {
      return <span className="text-xs px-2 py-0.5 rounded bg-yellow-600 text-white">Processing...</span>;
    }

    // Pending
    return <span className="text-xs px-2 py-0.5 rounded bg-orange-600 text-white">Pending</span>;
  };

  const isDoubles = activeDivision.type === 'doubles';

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tournamentId || !currentUserId) {
      alert('Missing tournament ID or user ID');
      return;
    }
    setLoading(true);

    // Use test_player_ prefix so entries can be cleared with "Clear Test Data"
    const timestamp = Date.now();
    // Generate unique division code that includes numbers (e.g., "60 plus" → "60")
    const getDivCode = (name?: string): string => {
      if (!name) return 'xxx';
      const tokens = name.toLowerCase().split(/[\s\-_\/]+/).filter(Boolean);
      let code = '';
      for (const token of tokens) {
        if (/^\d+$/.test(token)) {
          code += token.slice(0, 2); // Add numbers
        } else {
          code += token.replace(/[^a-z]/g, '').charAt(0) || '';
        }
      }
      return code.slice(0, 4) || 'xxx';
    };
    const divCode = getDivCode(divisionName);
    const p1Id = `test_player_${p1Name.toLowerCase().replace(/\s+/g, '_')}_${divCode}_${timestamp}_1`;
    const p2Id = `test_player_${p2Name.toLowerCase().replace(/\s+/g, '_')}_${divCode}_${timestamp}_2`;

    try {
      // Use direct Firestore write for test entries (bypasses Cloud Function which has CORS issues)
      const generatedTeamName = teamName || (isDoubles ? `${p1Name} & ${p2Name}` : p1Name);
      const playerIds = isDoubles ? [p1Id, p2Id] : [p1Id];

      await ensureTeamExists(
        tournamentId,
        activeDivision.id,
        playerIds,
        generatedTeamName,
        currentUserId,
        { status: 'active', paymentStatus: 'paid' } // Test entries are auto-paid
      );

      setP1Name('');
      setP2Name('');
      setTeamName('');
    } catch (error) {
      console.error('Failed to add test team:', error);
      alert('Failed to add test entry. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Test Entry Form - Only visible in test mode */}
      {testMode && (
        <form onSubmit={handleAdd} className="bg-gray-700/50 p-4 rounded border border-yellow-600/50">
          <h4 className="text-yellow-400 font-bold mb-4 text-sm flex items-center gap-2">
            <span>&#9888;</span> Add Test Entry
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <input value={p1Name} onChange={e => setP1Name(e.target.value)} placeholder="Player 1 Name" className="bg-gray-800 text-white p-2 rounded border border-gray-600" />
            {isDoubles && <input value={p2Name} onChange={e => setP2Name(e.target.value)} placeholder="Player 2 Name" className="bg-gray-800 text-white p-2 rounded border border-gray-600" />}
          </div>
          {isDoubles && <input value={teamName} onChange={e => setTeamName(e.target.value)} placeholder="Team Name (Optional)" className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 mb-4" />}
          <button disabled={loading || !p1Name.trim()} className="bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-600 text-white px-4 py-2 rounded font-bold w-full">{loading ? 'Adding...' : 'Add Test Entry'}</button>
          <p className="text-xs text-gray-500 mt-2 text-center">Test entries can be cleared with "Clear Test Data"</p>
        </form>
      )}

      <div className="space-y-2">
        {teams.map((t, i) => {
          // Render player names, but if team only has 1 player and pendingInvitedUserId exists,
          // show the pending partner (displayName or 'Pending')
          const p1 = (t.players && t.players[0]) ? playersCache[t.players[0]]?.displayName || 'Manual Entry' : 'Manual Entry';
          const p2FromPlayers = (t.players && t.players[1]) ? playersCache[t.players[1]]?.displayName || 'Manual Entry' : null;
          const pendingInvitedName = t.pendingInvitedUserId ? playersCache[t.pendingInvitedUserId]?.displayName || 'Pending' : null;
          const paymentBadge = getPaymentBadge(t);
          const isPending = entryFee > 0 && (!t.paymentStatus || t.paymentStatus === 'pending');

          return (
            <div key={t.id} className="bg-gray-900 p-3 rounded flex justify-between items-center border border-gray-700">
              <div className="flex items-center gap-3">
                <span className="text-gray-500 w-6">{i+1}.</span>
                <div>
                  <div className="text-white font-bold flex items-center gap-2">
                    {t.teamName || 'Team'}
                    {paymentBadge}
                  </div>
                  <div className="text-xs text-gray-400">
                    {p1}
                    {isDoubles && (
                      <>
                        {' / '}
                        {p2FromPlayers ?? pendingInvitedName ?? '-'}
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Mark as Paid button for organizers */}
                {canManage && isPending && (
                  <button
                    onClick={() => handleMarkAsPaid(t)}
                    disabled={markingPaid === t.id}
                    className="text-xs px-2 py-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white rounded transition-colors"
                  >
                    {markingPaid === t.id ? '...' : '✓ Paid'}
                  </button>
                )}
                <button onClick={() => onDeleteTeam(t.id)} className="text-red-400 text-xl">&times;</button>
              </div>
            </div>
          );
        })}
        {teams.length === 0 && <div className="text-gray-500 text-center italic">No teams yet.</div>}
      </div>

      {/* Disable regeneration once play has started */}
      <button
        onClick={onGenerateSchedule}
        disabled={teams.length < 2 || playHasStarted}
        className="w-full bg-blue-600 text-white font-bold py-3 rounded hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed"
        title={playHasStarted ? 'Cannot regenerate schedule after play has started' : undefined}
      >
        {scheduleGenerated ? 'Regenerate Schedule' : 'Generate Schedule'}
      </button>
      {playHasStarted && scheduleGenerated && (
        <p className="text-amber-400 text-xs text-center mt-2">
          Schedule cannot be regenerated after matches have started
        </p>
      )}
    </div>
  );
};
/* ---- END TeamSetup.tsx ---- */
