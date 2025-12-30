/**
 * TournamentSeedButton
 *
 * Admin utility button to seed tournaments with test data.
 * Creates fake teams and optionally generates matches for testing.
 *
 * FILE LOCATION: components/tournament/TournamentSeedButton.tsx
 * VERSION: V06.15
 *
 * V06.15 Changes:
 * - Added "Clear Orphaned Matches" button to delete matches where teams no longer exist
 * - Clear button now also clears orphaned matches automatically
 *
 * V06.14 Changes:
 * - Now detects division type (singles/doubles) and creates appropriate teams
 * - Singles divisions get 1 player per team
 * - Doubles/mixed divisions get 2 players per team
 *
 * TESTING ONLY - Shows only for app_admin users.
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  seedTournamentWithTestTeams,
  clearTestData,
  hasTestData,
  clearOrphanedMatches,
} from '../../services/tournamentSeeder';
import type { Division } from '../../types';

interface TournamentSeedButtonProps {
  tournamentId: string;
  divisions: Division[];
  onDataChanged?: () => void;
  /** Only show button when test mode is active */
  requireTestMode?: boolean;
  /** Current test mode state (required if requireTestMode is true) */
  testMode?: boolean;
}

export const TournamentSeedButton: React.FC<TournamentSeedButtonProps> = ({
  tournamentId,
  divisions,
  onDataChanged,
  requireTestMode = true,
  testMode = false,
}) => {
  const { isAppAdmin, currentUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>('');
  const [teamCount, setTeamCount] = useState<number>(8);
  const [generateMatches, setGenerateMatches] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [hasExistingTestData, setHasExistingTestData] = useState(false);

  // Check for existing test data when division changes
  useEffect(() => {
    const checkTestData = async () => {
      if (!selectedDivisionId || !tournamentId) {
        setHasExistingTestData(false);
        return;
      }
      try {
        const exists = await hasTestData(tournamentId, selectedDivisionId);
        setHasExistingTestData(exists);
      } catch (err) {
        console.error('Failed to check test data:', err);
      }
    };
    checkTestData();
  }, [tournamentId, selectedDivisionId]);

  // Only show for app admins, and only in test mode if required
  if (!isAppAdmin) {
    return null;
  }

  // If test mode is required but not active, don't show
  if (requireTestMode && !testMode) {
    return null;
  }

  const handleSeed = async () => {
    if (!selectedDivisionId || !currentUser) {
      setMessage({ type: 'error', text: 'Please select a division' });
      return;
    }

    setIsProcessing(true);
    setMessage(null);

    try {
      // Get the selected division to determine play type and name
      const selectedDivision = divisions.find(d => d.id === selectedDivisionId);
      const playType = selectedDivision?.type === 'singles' ? 'singles' : 'doubles';
      const divisionName = selectedDivision?.name; // Pass division name for unique player names

      const result = await seedTournamentWithTestTeams({
        tournamentId,
        divisionId: selectedDivisionId,
        divisionName, // Pass division name for unique names across divisions
        teamCount,
        generateMatches,
        userId: currentUser.uid,
        playType, // Pass the play type for correct team structure
      });

      setMessage({ type: 'success', text: result.message });
      setHasExistingTestData(true);
      onDataChanged?.();
    } catch (err) {
      console.error('Seed failed:', err);
      setMessage({ type: 'error', text: 'Failed to seed test data' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClear = async () => {
    if (!selectedDivisionId) {
      setMessage({ type: 'error', text: 'Please select a division' });
      return;
    }

    const confirmed = window.confirm(
      'Are you sure you want to delete all test teams and their matches from this division?'
    );
    if (!confirmed) return;

    setIsProcessing(true);
    setMessage(null);

    try {
      // Clear test data (teams + associated matches)
      const result = await clearTestData(tournamentId, selectedDivisionId);

      // Also clear any orphaned matches (teams deleted but matches remain)
      const orphanResult = await clearOrphanedMatches(tournamentId, selectedDivisionId);

      const totalMatches = result.matchesDeleted + orphanResult.matchesDeleted;
      setMessage({
        type: 'success',
        text: `Deleted ${result.teamsDeleted} test teams and ${totalMatches} matches`,
      });
      setHasExistingTestData(false);
      onDataChanged?.();
    } catch (err) {
      console.error('Clear failed:', err);
      setMessage({ type: 'error', text: 'Failed to clear test data' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearOrphaned = async () => {
    if (!selectedDivisionId) {
      setMessage({ type: 'error', text: 'Please select a division' });
      return;
    }

    const confirmed = window.confirm(
      'Delete all orphaned matches (matches where teams no longer exist)?'
    );
    if (!confirmed) return;

    setIsProcessing(true);
    setMessage(null);

    try {
      const result = await clearOrphanedMatches(tournamentId, selectedDivisionId);
      setMessage({
        type: 'success',
        text: `Deleted ${result.matchesDeleted} orphaned matches`,
      });
      onDataChanged?.();
    } catch (err) {
      console.error('Clear orphaned failed:', err);
      setMessage({ type: 'error', text: 'Failed to clear orphaned matches' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setMessage(null);
  };

  // Modal content rendered via portal
  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-20"
      onClick={handleClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Modal Panel */}
      <div
        className="relative w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-2 right-2 text-gray-400 hover:text-white"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Warning Header */}
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-700">
          <span className="text-yellow-400 text-lg">&#9888;</span>
          <div>
            <p className="text-yellow-400 font-medium text-sm">Testing Only</p>
            <p className="text-gray-400 text-xs">Creates fake teams for testing</p>
          </div>
        </div>

        {/* Division Select */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-400 mb-1">Division</label>
          <select
            value={selectedDivisionId}
            onChange={(e) => setSelectedDivisionId(e.target.value)}
            className="w-full bg-gray-900 text-white px-3 py-2 rounded border border-gray-600 text-sm"
          >
            <option value="">Select a division...</option>
            {divisions.map((div) => (
              <option key={div.id} value={div.id}>
                {div.name}
              </option>
            ))}
          </select>
        </div>

        {/* Team Count */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-400 mb-1">Team Count</label>
          <div className="flex gap-2">
            {[4, 8, 16].map((count) => (
              <button
                key={count}
                onClick={() => setTeamCount(count)}
                className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${
                  teamCount === count
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {count}
              </button>
            ))}
          </div>
        </div>

        {/* Generate Matches Toggle */}
        <div className="mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={generateMatches}
              onChange={(e) => setGenerateMatches(e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-green-500 focus:ring-green-500"
            />
            <span className="text-sm text-gray-300">Generate matches (round-robin)</span>
          </label>
        </div>

        {/* Message */}
        {message && (
          <div
            className={`mb-4 p-2 rounded text-sm ${
              message.type === 'success'
                ? 'bg-green-900/50 text-green-400 border border-green-700'
                : 'bg-red-900/50 text-red-400 border border-red-700'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleSeed}
            disabled={!selectedDivisionId || isProcessing}
            className="flex-1 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white rounded text-sm font-medium transition-colors"
          >
            {isProcessing ? 'Processing...' : 'Seed Now'}
          </button>

          {hasExistingTestData && (
            <button
              onClick={handleClear}
              disabled={!selectedDivisionId || isProcessing}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white rounded text-sm font-medium transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {/* Clear Orphaned Button - always visible for cleanup */}
        <button
          onClick={handleClearOrphaned}
          disabled={!selectedDivisionId || isProcessing}
          className="w-full mt-2 py-2 bg-orange-600/20 hover:bg-orange-600/30 disabled:bg-gray-600/20 text-orange-400 border border-orange-600/50 rounded text-sm font-medium transition-colors"
        >
          Clear Orphaned Matches
        </button>

        {/* Info about what gets created */}
        <div className="mt-4 pt-3 border-t border-gray-700">
          {(() => {
            const selectedDivision = divisions.find(d => d.id === selectedDivisionId);
            const isSingles = selectedDivision?.type === 'singles';
            const playerCount = isSingles ? teamCount : teamCount * 2;
            const teamLabel = isSingles ? 'players' : 'teams';
            return (
              <p className="text-xs text-gray-500">
                Creates {teamCount} test {teamLabel} ({playerCount} fake {isSingles ? 'entries' : 'players'})
                {generateMatches && (
                  <span>
                    {' '}
                    and {(teamCount * (teamCount - 1)) / 2} matches
                  </span>
                )}
              </p>
            );
          })()}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 border border-yellow-600/50 rounded-lg transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
          />
        </svg>
        Seed Test Data
      </button>

      {/* Modal - Rendered via Portal */}
      {isOpen && createPortal(modalContent, document.body)}
    </>
  );
};

export default TournamentSeedButton;
