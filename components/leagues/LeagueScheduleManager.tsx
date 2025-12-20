/**
 * LeagueScheduleManager Component
 * 
 * Organizer tool to generate and manage league match schedules.
 * Supports Round Robin, Swiss, and Box League formats.
 * 
 * FILE LOCATION: components/leagues/LeagueScheduleManager.tsx
 * VERSION: V05.32
 */

import React, { useState, useMemo } from 'react';
import {
  generateLeagueSchedule,
  generateSwissRound,
  clearLeagueMatches,
  type GenerationResult,
} from '../../services/firebase/leagueMatchGeneration';
import type { League, LeagueMember, LeagueMatch, LeagueDivision } from '../../types';

// ============================================
// TYPES
// ============================================

interface LeagueScheduleManagerProps {
  league: League;
  members: LeagueMember[];
  matches: LeagueMatch[];
  divisions: LeagueDivision[];
  onScheduleGenerated: () => void;
}

// ============================================
// COMPONENT
// ============================================

export const LeagueScheduleManager: React.FC<LeagueScheduleManagerProps> = ({
  league,
  members,
  matches,
  divisions,
  onScheduleGenerated,
}) => {
  // State
  const [generating, setGenerating] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDivisionId, setSelectedDivisionId] = useState<string | null>(null);
  const [swissRound, setSwissRound] = useState(1);
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  // ============================================
  // COMPUTED VALUES
  // ============================================

  const activeMembers = useMemo(() => 
    members.filter(m => m.status === 'active'),
    [members]
  );

  const divisionMembers = useMemo(() => 
    selectedDivisionId 
      ? activeMembers.filter(m => m.divisionId === selectedDivisionId)
      : activeMembers,
    [activeMembers, selectedDivisionId]
  );

  const divisionMatches = useMemo(() =>
    selectedDivisionId
      ? matches.filter(m => m.divisionId === selectedDivisionId)
      : matches,
    [matches, selectedDivisionId]
  );

  const matchStats = useMemo(() => {
    const scheduled = divisionMatches.filter(m => m.status === 'scheduled').length;
    const completed = divisionMatches.filter(m => m.status === 'completed').length;
    const pending = divisionMatches.filter(m => m.status === 'pending_confirmation').length;
    const total = divisionMatches.length;
    
    return { scheduled, completed, pending, total };
  }, [divisionMatches]);

  const currentSwissRound = useMemo(() => {
    if (league.format !== 'swiss') return 1;
    const maxRound = Math.max(0, ...divisionMatches.map(m => m.roundNumber || 0));
    return maxRound + 1;
  }, [league.format, divisionMatches]);

  // Format-specific info
  const formatInfo = useMemo(() => {
    switch (league.format) {
      case 'round_robin':
        const rounds = league.settings?.roundRobinSettings?.rounds || 1;
        const n = divisionMembers.length;
        const matchesPerRound = n % 2 === 0 ? (n / 2) * (n - 1) : ((n - 1) / 2) * n;
        const totalMatches = matchesPerRound * rounds;
        return {
          description: `Everyone plays everyone ${rounds === 1 ? 'once' : `${rounds} times`}`,
          expectedMatches: totalMatches,
          weeksNeeded: n % 2 === 0 ? n - 1 : n,
        };
        
      case 'swiss':
        const swissRounds = league.settings?.swissSettings?.rounds || 4;
        return {
          description: `${swissRounds} rounds, paired by standings`,
          expectedMatches: Math.floor(divisionMembers.length / 2) * swissRounds,
          weeksNeeded: swissRounds,
        };
        
      case 'box_league':
        const boxSize = league.settings?.boxSettings?.playersPerBox || 4;
        const numBoxes = Math.ceil(divisionMembers.length / boxSize);
        const matchesPerBox = (boxSize * (boxSize - 1)) / 2;
        return {
          description: `${numBoxes} boxes of ~${boxSize} players each`,
          expectedMatches: numBoxes * matchesPerBox,
          weeksNeeded: boxSize - 1,
        };
        
      case 'ladder':
        return {
          description: 'Challenge system - no pre-generated matches',
          expectedMatches: 0,
          weeksNeeded: 0,
        };
        
      default:
        return { description: '', expectedMatches: 0, weeksNeeded: 0 };
    }
  }, [league.format, league.settings, divisionMembers.length]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleGenerate = async () => {
    if (league.format === 'ladder') {
      setError('Ladder leagues use the challenge system. Matches are created when players challenge each other.');
      return;
    }

    if (divisionMembers.length < 2) {
      setError('Need at least 2 active members to generate a schedule');
      return;
    }

    setGenerating(true);
    setError(null);
    setResult(null);

    try {
      let genResult: GenerationResult;
      
      if (league.format === 'swiss') {
        // Swiss generates one round at a time
        genResult = await generateSwissRound(
          league,
          divisionMembers,
          swissRound,
          divisionMatches,
          selectedDivisionId
        );
        
        if (genResult.success) {
          setSwissRound(swissRound + 1);
        }
      } else {
        // Round Robin and Box League generate full schedule
        genResult = await generateLeagueSchedule(league, activeMembers, {
          divisionId: selectedDivisionId,
        });
      }

      setResult(genResult);
      
      if (genResult.success) {
        onScheduleGenerated();
      } else {
        setError(genResult.error || 'Generation failed');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate schedule');
    } finally {
      setGenerating(false);
    }
  };

  const handleClearMatches = async () => {
    setClearing(true);
    setError(null);

    try {
      const deleted = await clearLeagueMatches(league.id, {
        divisionId: selectedDivisionId,
        statusFilter: ['scheduled'], // Only clear unplayed matches
      });

      setResult({
        success: true,
        matchesCreated: 0,
        error: `Cleared ${deleted} scheduled matches`,
      });
      
      setShowConfirmClear(false);
      onScheduleGenerated();
    } catch (err: any) {
      setError(err.message || 'Failed to clear matches');
    } finally {
      setClearing(false);
    }
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-700 bg-gray-900">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          📅 Schedule Manager
        </h3>
        <p className="text-sm text-gray-400 mt-1">
          Generate and manage match schedules for this league
        </p>
      </div>

      <div className="p-4 space-y-4">
        {/* Division Selector (if league has divisions) */}
        {league.hasDivisions && divisions.length > 0 && (
          <div>
            <label className="block text-sm text-gray-400 mb-2">Select Division</label>
            <select
              value={selectedDivisionId || ''}
              onChange={(e) => setSelectedDivisionId(e.target.value || null)}
              className="w-full bg-gray-900 border border-gray-700 text-white p-2 rounded-lg"
            >
              <option value="">All Divisions</option>
              {divisions.map(div => (
                <option key={div.id} value={div.id}>{div.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Format Info Card */}
        <div className="bg-gray-900 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-white capitalize">
              {league.format.replace('_', ' ')} Format
            </span>
            <span className="text-xs text-gray-500">
              {divisionMembers.length} active {divisionMembers.length === 1 ? 'member' : 'members'}
            </span>
          </div>
          
          <p className="text-sm text-gray-400 mb-3">
            {formatInfo.description}
          </p>
          
          {league.format !== 'ladder' && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500">Expected Matches:</span>
                <span className="text-white ml-2">{formatInfo.expectedMatches}</span>
              </div>
              <div>
                <span className="text-gray-500">Weeks Needed:</span>
                <span className="text-white ml-2">{formatInfo.weeksNeeded}</span>
              </div>
            </div>
          )}
        </div>

        {/* Current Match Stats */}
        {matchStats.total > 0 && (
          <div className="bg-gray-900 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-white mb-3">Current Schedule</h4>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <div className="text-2xl font-bold text-white">{matchStats.total}</div>
                <div className="text-xs text-gray-500">Total</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-400">{matchStats.scheduled}</div>
                <div className="text-xs text-gray-500">Scheduled</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-400">{matchStats.pending}</div>
                <div className="text-xs text-gray-500">Pending</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-400">{matchStats.completed}</div>
                <div className="text-xs text-gray-500">Completed</div>
              </div>
            </div>
          </div>
        )}

        {/* Swiss Round Selector */}
        {league.format === 'swiss' && (
          <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-blue-300 mb-2">Swiss System</h4>
            <p className="text-xs text-gray-400 mb-3">
              Swiss pairs players with similar records. Generate one round at a time after 
              previous round's matches are complete.
            </p>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400">Generate Round:</span>
              <select
                value={swissRound}
                onChange={(e) => setSwissRound(parseInt(e.target.value))}
                className="bg-gray-900 border border-gray-700 text-white p-2 rounded-lg"
              >
                {Array.from({ length: league.settings?.swissSettings?.rounds || 6 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>Round {i + 1}</option>
                ))}
              </select>
              <span className="text-xs text-gray-500">
                (Current: Round {currentSwissRound})
              </span>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Success Display */}
        {result?.success && result.matchesCreated > 0 && (
          <div className="bg-green-900/30 border border-green-700 rounded-lg p-3 text-green-300 text-sm">
            ✓ Generated {result.matchesCreated} matches successfully!
          </div>
        )}

        {result?.success && result.matchesCreated === 0 && result.error && (
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-3 text-yellow-300 text-sm">
            {result.error}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          {league.format !== 'ladder' && (
            <button
              onClick={handleGenerate}
              disabled={generating || divisionMembers.length < 2}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {generating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <span>🎲</span>
                  {league.format === 'swiss' 
                    ? `Generate Round ${swissRound}` 
                    : 'Generate Schedule'}
                </>
              )}
            </button>
          )}

          {matchStats.scheduled > 0 && (
            <button
              onClick={() => setShowConfirmClear(true)}
              disabled={clearing}
              className="px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-colors"
            >
              🗑️ Clear Unplayed
            </button>
          )}
        </div>

        {/* Ladder Info */}
        {league.format === 'ladder' && (
          <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4 text-center">
            <p className="text-yellow-300 text-sm">
              🪜 Ladder leagues don't use pre-generated schedules.
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Players challenge others above them in the standings. 
              Matches are created when challenges are accepted.
            </p>
          </div>
        )}

        {/* Help Text */}
        {league.format !== 'ladder' && divisionMembers.length < 2 && (
          <p className="text-sm text-gray-500 text-center">
            Need at least 2 active members to generate a schedule.
            Currently have {divisionMembers.length} member{divisionMembers.length !== 1 ? 's' : ''}.
          </p>
        )}
      </div>

      {/* Confirm Clear Modal */}
      {showConfirmClear && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl border border-gray-700 max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-white mb-4">Clear Scheduled Matches?</h3>
            <p className="text-gray-400 mb-4">
              This will delete all <strong className="text-yellow-400">{matchStats.scheduled}</strong> scheduled 
              (unplayed) matches. Completed matches will not be affected.
            </p>
            <p className="text-sm text-gray-500 mb-4">
              You can regenerate the schedule after clearing.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmClear(false)}
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleClearMatches}
                disabled={clearing}
                className="flex-1 py-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white rounded-lg font-semibold"
              >
                {clearing ? 'Clearing...' : 'Clear Matches'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeagueScheduleManager;