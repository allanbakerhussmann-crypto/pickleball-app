/**
 * DuprControlPanel - Main DUPR Organiser Control Panel
 *
 * Orchestrates the DUPR tab for both Tournament and League managers.
 * Provides match review, finalization, and bulk submission to DUPR.
 *
 * V07.53: Pass currentUserId to DuprReviewModal for participant check
 *
 * @version V07.53
 * @file components/shared/DuprControlPanel.tsx
 */

import { useState, useMemo, useCallback } from 'react';
import { httpsCallable } from '@firebase/functions';
import { functions } from '../../services/firebase/config';
import type { Match, GameScore, Division } from '../../types';
import type {
  DuprMatchCategory,
  DuprFilterOption,
  DuprReviewModalData,
} from '../../types/duprPanel';
import {
  getDuprPanelStats,
  buildAllMatchRowData,
  filterMatchesByCategory,
  sortMatchesForDuprPanel,
} from '../../services/firebase/duprMatchStatus';
import {
  finaliseResult,
  setDuprEligibility,
  requestDuprSubmission,
  requestBulkDuprSubmission,
  retryFailedDuprSubmissions,
} from '../../services/firebase/duprScoring';
import { DuprSummaryCards } from './DuprSummaryCards';
import { DuprMatchTable } from './DuprMatchTable';
import { DuprBulkSubmit } from './DuprBulkSubmit';
import { DuprReviewModal } from './DuprReviewModal';

// Type for test submission response
interface TestSubmitOneMatchResponse {
  ok: boolean;
  stage: string;
  error?: string;
  matchMetadata?: {
    hasOfficialResult: boolean;
    scoreCount: number;
    hasSideA: boolean;
    hasSideB: boolean;
    gameCount: number;
  };
  payloadMetadata?: {
    identifier: string;
    matchSource: string;
    format: string;
    gameCount: number;
    hasClubId: boolean;
  };
  warnings?: string[];
  duprResponse?: {
    status: number;
    statusText: string;
    body: string;
  };
}

interface DuprControlPanelProps {
  eventType: 'tournament' | 'league';
  eventId: string;
  eventName: string;
  matches: Match[];
  divisions?: Division[];
  divisionId?: string;
  divisionName?: string;
  isOrganizer: boolean;
  isAppAdmin?: boolean; // Show diagnostic tools (Test Match button) only for app admins
  currentUserId: string;
  playersCache?: Record<string, { firstName?: string; lastName?: string; displayName?: string }>;
  onMatchUpdate?: () => void;
}

export function DuprControlPanel({
  eventType,
  eventId,
  eventName,
  matches,
  divisions: _divisions,
  divisionId,
  divisionName: _divisionName,
  isOrganizer,
  isAppAdmin = false,
  currentUserId,
  playersCache = {},
  onMatchUpdate,
}: DuprControlPanelProps) {
  // State
  const [filter, setFilter] = useState<DuprFilterOption>('all');
  const [activeCategory, setActiveCategory] = useState<DuprMatchCategory | 'all'>('all');
  const [reviewModalData, setReviewModalData] = useState<DuprReviewModalData | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Test Single Match State
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testMatchId, setTestMatchId] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestSubmitOneMatchResponse | null>(null);

  // Filter matches by division if specified
  const filteredMatches = useMemo(() => {
    if (divisionId) {
      return matches.filter(m => m.divisionId === divisionId);
    }
    return matches;
  }, [matches, divisionId]);

  // Calculate stats
  const stats = useMemo(() => getDuprPanelStats(filteredMatches), [filteredMatches]);

  // Build row data
  const allRowData = useMemo(() => {
    const rows = buildAllMatchRowData(filteredMatches);
    return sortMatchesForDuprPanel(rows);
  }, [filteredMatches]);

  // Filter row data
  const displayedRows = useMemo(() => {
    return filterMatchesByCategory(allRowData, filter);
  }, [allRowData, filter]);

  // Get player name helper
  const getPlayerName = useCallback((playerId: string): string => {
    const player = playersCache[playerId];
    if (player) {
      if (player.displayName) return player.displayName;
      if (player.firstName || player.lastName) {
        return `${player.firstName || ''} ${player.lastName || ''}`.trim();
      }
    }
    return playerId.slice(0, 8);
  }, [playersCache]);

  // Show toast
  const showToast = (type: 'success' | 'error', message: string) => {
    setToastMessage({ type, message });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Handle card click
  const handleCardClick = (category: DuprMatchCategory | 'all') => {
    setActiveCategory(category);
    if (category === 'all') {
      setFilter('all');
    } else if (category === 'needs_review' || category === 'proposed') {
      setFilter('needs_review');
    } else if (category === 'ready_for_dupr') {
      setFilter('ready_for_dupr');
    } else if (category === 'submitted') {
      setFilter('submitted');
    } else if (category === 'failed') {
      setFilter('failed');
    } else if (category === 'blocked') {
      setFilter('blocked');
    }
  };

  // Handle review
  const handleReview = (match: Match) => {
    // Build modal data
    const sideAPlayerNames = (match.sideA?.playerIds || []).map(getPlayerName);
    const sideBPlayerNames = (match.sideB?.playerIds || []).map(getPlayerName);

    const modalData: DuprReviewModalData = {
      match,
      eventType,
      eventId,
      eventName,
      sideAPlayerNames,
      sideBPlayerNames,
    };

    // Add proposal data if exists
    if (match.scoreProposal) {
      modalData.proposal = {
        scores: match.scoreProposal.scores,
        winnerId: match.scoreProposal.winnerId,
        winnerName: match.scoreProposal.winnerName,
        enteredByName: getPlayerName(match.scoreProposal.enteredByUserId),
        enteredAt: match.scoreProposal.enteredAt,
        status: match.scoreProposal.status,
        signedByName: match.scoreProposal.signedByUserId
          ? getPlayerName(match.scoreProposal.signedByUserId)
          : undefined,
        signedAt: match.scoreProposal.signedAt,
        disputedByName: match.scoreProposal.disputedByUserId
          ? getPlayerName(match.scoreProposal.disputedByUserId)
          : undefined,
        disputedAt: match.scoreProposal.disputedAt,
        disputeReason: match.scoreProposal.disputeReason,
      };
    }

    // Add official data if exists
    if (match.officialResult) {
      modalData.official = {
        scores: match.officialResult.scores,
        winnerId: match.officialResult.winnerId,
        winnerName: match.officialResult.winnerName,
        finalisedByName: getPlayerName(match.officialResult.finalisedByUserId),
        finalisedAt: match.officialResult.finalisedAt,
        version: match.officialResult.version,
      };
    }

    setReviewModalData(modalData);
    setIsReviewModalOpen(true);
  };

  // Handle finalise (same as review for now)
  const handleFinalise = (match: Match) => {
    handleReview(match);
  };

  // Handle modal finalise
  const handleModalFinalise = async (
    matchId: string,
    scores: GameScore[],
    winnerId: string,
    duprEligible: boolean
  ) => {
    setIsSaving(true);
    try {
      await finaliseResult(
        eventType,
        eventId,
        matchId,
        scores,
        winnerId,
        currentUserId,
        duprEligible
      );
      showToast('success', 'Match result finalized successfully');
      setIsReviewModalOpen(false);
      onMatchUpdate?.();
    } catch (error: any) {
      showToast('error', error.message || 'Failed to finalize result');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle submit single
  const handleSubmit = async (match: Match) => {
    try {
      const result = await requestDuprSubmission(eventType, eventId, match.id, currentUserId);
      showToast('success', result.message || 'Match submitted to DUPR');
      onMatchUpdate?.();
    } catch (error: any) {
      showToast('error', error.message || 'Failed to submit to DUPR');
    }
  };

  // Handle toggle eligibility
  const handleToggleEligibility = async (match: Match, eligible: boolean) => {
    try {
      await setDuprEligibility(eventType, eventId, match.id, eligible, currentUserId);
      onMatchUpdate?.();
    } catch (error: any) {
      showToast('error', error.message || 'Failed to update eligibility');
    }
  };

  // Handle submit all
  const handleSubmitAll = async () => {
    setIsSubmitting(true);
    try {
      const result = await requestBulkDuprSubmission(eventType, eventId, currentUserId);

      // Show appropriate message based on results
      if (result.successCount === 0 && result.failedCount === 0) {
        showToast('success', 'No matches to submit - all already submitted');
      } else if (result.failedCount === 0) {
        showToast('success', `Successfully submitted ${result.successCount} matches to DUPR`);
      } else if (result.successCount === 0) {
        showToast('error', `Failed to submit ${result.failedCount} matches`);
      } else {
        // Partial success - use success toast but note failures
        showToast('success', `Submitted ${result.successCount} matches (${result.failedCount} failed)`);
      }

      onMatchUpdate?.();
    } catch (error: any) {
      showToast('error', error.message || 'Failed to submit matches');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle retry failed
  const handleRetryFailed = async () => {
    setIsRetrying(true);
    try {
      const result = await retryFailedDuprSubmissions(eventType, eventId, currentUserId);

      // Show appropriate message based on results
      if (result.retriedCount === 0) {
        showToast('success', 'No failed matches to retry');
      } else if (result.failedCount === 0) {
        showToast('success', `Successfully resubmitted ${result.successCount} matches to DUPR`);
      } else if (result.successCount === 0) {
        showToast('error', `All ${result.failedCount} retries failed`);
      } else {
        showToast('success', `Resubmitted ${result.successCount} matches (${result.failedCount} still failing)`);
      }

      onMatchUpdate?.();
    } catch (error: any) {
      showToast('error', error.message || 'Failed to retry submissions');
    } finally {
      setIsRetrying(false);
    }
  };

  // Handle test single match submission
  const handleTestSingleMatch = async () => {
    if (!testMatchId.trim()) {
      showToast('error', 'Please enter a match ID');
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const testSubmitOneMatch = httpsCallable<
        { matchId: string; eventType: string; eventId: string },
        TestSubmitOneMatchResponse
      >(functions, 'dupr_testSubmitOneMatch');

      const result = await testSubmitOneMatch({
        matchId: testMatchId.trim(),
        eventType,
        eventId,
      });

      setTestResult(result.data);

      if (result.data.ok) {
        showToast('success', 'Test submission successful! Check result details.');
      } else {
        showToast('error', `Test failed at stage: ${result.data.stage}`);
      }
    } catch (error: any) {
      console.error('[DUPR Test] Error:', error);
      setTestResult({
        ok: false,
        stage: 'call',
        error: error.message || 'Failed to call test function',
      });
      showToast('error', error.message || 'Failed to test submission');
    } finally {
      setIsTesting(false);
    }
  };

  // Open test modal with a match ID
  const handleOpenTestModal = (match?: Match) => {
    if (match) {
      setTestMatchId(match.id);
    }
    setTestResult(null);
    setIsTestModalOpen(true);
  };

  if (!isOrganizer) {
    return (
      <div className="p-8 text-center text-gray-500">
        <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <p>DUPR management is only available to organizers.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg ${
            toastMessage.type === 'success'
              ? 'bg-lime-500 text-gray-900'
              : 'bg-red-500 text-white'
          }`}
        >
          {toastMessage.message}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">DUPR Management</h2>
          <p className="text-sm text-gray-400 mt-1">
            Review match scores, finalize official results, and submit to DUPR
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Test Single Match Button - App Admin only */}
          {isAppAdmin && (
            <button
              onClick={() => handleOpenTestModal()}
              className="px-3 py-2 text-sm border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-800 hover:text-white flex items-center gap-2"
              title="Test a single match submission to debug DUPR issues"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Test Match
            </button>
          )}
          <DuprBulkSubmit
            readyCount={stats.readyForDupr}
            failedCount={stats.failed}
            onSubmitAll={handleSubmitAll}
            onRetryFailed={handleRetryFailed}
            isSubmitting={isSubmitting}
            isRetrying={isRetrying}
          />
        </div>
      </div>

      {/* Summary Cards */}
      <DuprSummaryCards
        stats={stats}
        onCardClick={handleCardClick}
        activeCategory={activeCategory}
      />

      {/* Match Table */}
      <DuprMatchTable
        matches={displayedRows}
        filter={filter}
        onFilterChange={setFilter}
        onReview={handleReview}
        onFinalise={handleFinalise}
        onSubmit={handleSubmit}
        onToggleEligibility={handleToggleEligibility}
        onTest={isAppAdmin ? handleOpenTestModal : undefined}
      />

      {/* Review Modal */}
      <DuprReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        data={reviewModalData}
        onFinalise={handleModalFinalise}
        isSaving={isSaving}
        isOrganizer={isOrganizer}
        currentUserId={currentUserId}
      />

      {/* Test Single Match Modal */}
      {isTestModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h3 className="text-lg font-semibold text-white">Test Single Match DUPR Submission</h3>
              <button
                onClick={() => {
                  setIsTestModalOpen(false);
                  setTestResult(null);
                  setTestMatchId('');
                }}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-4">
              {/* Input Section */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">Match ID</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={testMatchId}
                    onChange={(e) => setTestMatchId(e.target.value)}
                    placeholder="Enter match ID to test..."
                    className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-lime-500"
                  />
                  <button
                    onClick={handleTestSingleMatch}
                    disabled={isTesting || !testMatchId.trim()}
                    className="px-4 py-2 bg-lime-500 text-gray-900 font-medium rounded-lg hover:bg-lime-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isTesting ? (
                      <>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Testing...
                      </>
                    ) : (
                      'Test Submission'
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  This will attempt to submit the match to DUPR UAT and show the full response for debugging.
                </p>
              </div>

              {/* Results Section */}
              {testResult && (
                <div className="space-y-3">
                  {/* Status Badge */}
                  <div className={`p-3 rounded-lg ${testResult.ok ? 'bg-green-900/30 border border-green-700' : 'bg-red-900/30 border border-red-700'}`}>
                    <div className="flex items-center gap-2">
                      {testResult.ok ? (
                        <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                      <span className={`font-medium ${testResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                        {testResult.ok ? 'Submission Successful!' : `Failed at stage: ${testResult.stage}`}
                      </span>
                    </div>
                    {testResult.error && (
                      <p className="mt-2 text-sm text-red-300">{testResult.error}</p>
                    )}
                  </div>

                  {/* Warnings */}
                  {testResult.warnings && testResult.warnings.length > 0 && (
                    <div className="p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg">
                      <h4 className="text-sm font-medium text-yellow-400 mb-1">Warnings</h4>
                      <ul className="text-sm text-yellow-300 list-disc list-inside">
                        {testResult.warnings.map((warning, idx) => (
                          <li key={idx}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Match Metadata */}
                  {testResult.matchMetadata && (
                    <div className="p-3 bg-gray-800 rounded-lg">
                      <h4 className="text-sm font-medium text-gray-300 mb-2">Match Data</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="text-gray-400">Has Official Result:</div>
                        <div className={testResult.matchMetadata.hasOfficialResult ? 'text-green-400' : 'text-red-400'}>
                          {testResult.matchMetadata.hasOfficialResult ? 'Yes' : 'No'}
                        </div>
                        <div className="text-gray-400">Score Count:</div>
                        <div className="text-white">{testResult.matchMetadata.scoreCount}</div>
                        <div className="text-gray-400">Has Side A:</div>
                        <div className={testResult.matchMetadata.hasSideA ? 'text-green-400' : 'text-red-400'}>
                          {testResult.matchMetadata.hasSideA ? 'Yes' : 'No'}
                        </div>
                        <div className="text-gray-400">Has Side B:</div>
                        <div className={testResult.matchMetadata.hasSideB ? 'text-green-400' : 'text-red-400'}>
                          {testResult.matchMetadata.hasSideB ? 'Yes' : 'No'}
                        </div>
                        <div className="text-gray-400">Game Count:</div>
                        <div className="text-white">{testResult.matchMetadata.gameCount}</div>
                      </div>
                    </div>
                  )}

                  {/* Payload Metadata */}
                  {testResult.payloadMetadata && (
                    <div className="p-3 bg-gray-800 rounded-lg">
                      <h4 className="text-sm font-medium text-gray-300 mb-2">Payload Built</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="text-gray-400">Identifier:</div>
                        <div className="text-white font-mono text-xs break-all">{testResult.payloadMetadata.identifier}</div>
                        <div className="text-gray-400">Match Source:</div>
                        <div className="text-white">{testResult.payloadMetadata.matchSource}</div>
                        <div className="text-gray-400">Format:</div>
                        <div className="text-white">{testResult.payloadMetadata.format}</div>
                        <div className="text-gray-400">Game Count:</div>
                        <div className="text-white">{testResult.payloadMetadata.gameCount}</div>
                        <div className="text-gray-400">Has Club ID:</div>
                        <div className={testResult.payloadMetadata.hasClubId ? 'text-lime-400' : 'text-gray-500'}>
                          {testResult.payloadMetadata.hasClubId ? 'Yes' : 'No (PARTNER)'}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* DUPR Response */}
                  {testResult.duprResponse && (
                    <div className="p-3 bg-gray-800 rounded-lg">
                      <h4 className="text-sm font-medium text-gray-300 mb-2">DUPR Response</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex gap-2">
                          <span className="text-gray-400">Status:</span>
                          <span className={testResult.duprResponse.status >= 200 && testResult.duprResponse.status < 300 ? 'text-green-400' : 'text-red-400'}>
                            {testResult.duprResponse.status} {testResult.duprResponse.statusText}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400">Body:</span>
                          <pre className="mt-1 p-2 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap">
                            {testResult.duprResponse.body}
                          </pre>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-2 p-4 border-t border-gray-700">
              <button
                onClick={() => {
                  setIsTestModalOpen(false);
                  setTestResult(null);
                  setTestMatchId('');
                }}
                className="px-4 py-2 text-gray-300 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DuprControlPanel;
