/**
 * DuprControlPanel - Main DUPR Organiser Control Panel
 *
 * Orchestrates the DUPR tab for both Tournament and League managers.
 * Provides match review, finalization, and bulk submission to DUPR.
 *
 * @version V07.10
 * @file components/shared/DuprControlPanel.tsx
 */

import { useState, useMemo, useCallback } from 'react';
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

interface DuprControlPanelProps {
  eventType: 'tournament' | 'league';
  eventId: string;
  eventName: string;
  matches: Match[];
  divisions?: Division[];
  divisionId?: string;
  divisionName?: string;
  isOrganizer: boolean;
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
      await requestDuprSubmission(eventType, eventId, match.id, currentUserId);
      showToast('success', 'Match queued for DUPR submission');
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
      showToast('success', `${result.queuedCount} matches queued for DUPR submission`);
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
      showToast('success', `${result.retriedCount} failed submissions queued for retry`);
      onMatchUpdate?.();
    } catch (error: any) {
      showToast('error', error.message || 'Failed to retry submissions');
    } finally {
      setIsRetrying(false);
    }
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
        <DuprBulkSubmit
          readyCount={stats.readyForDupr}
          failedCount={stats.failed}
          onSubmitAll={handleSubmitAll}
          onRetryFailed={handleRetryFailed}
          isSubmitting={isSubmitting}
          isRetrying={isRetrying}
        />
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
      />

      {/* Review Modal */}
      <DuprReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        data={reviewModalData}
        onFinalise={handleModalFinalise}
        isSaving={isSaving}
      />
    </div>
  );
}

export default DuprControlPanel;
