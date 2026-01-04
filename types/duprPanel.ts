/**
 * DUPR Panel Types
 *
 * TypeScript interfaces for the DUPR Organiser Control Panel.
 * Used by both Tournament and League DUPR tabs.
 *
 * @version V07.10
 * @file types/duprPanel.ts
 */

import type { Match, GameScore } from '../types';

// ============================================
// MATCH CATEGORIZATION
// ============================================

/**
 * Categories for DUPR panel filtering and display
 */
export type DuprMatchCategory =
  | 'none'           // No score submitted (scoreState === 'none' or undefined)
  | 'proposed'       // Awaiting opponent (scoreState === 'proposed')
  | 'needs_review'   // Signed or disputed, awaiting organizer
  | 'ready_for_dupr' // Official + eligible + not submitted + not needs correction
  | 'submitted'      // Successfully submitted to DUPR
  | 'failed'         // Submission error exists
  | 'blocked';       // Cannot proceed (disputed without official, needs correction, etc.)

/**
 * Summary statistics for DUPR panel dashboard
 */
export interface DuprPanelStats {
  total: number;
  none: number;
  proposed: number;
  needsReview: number;
  readyForDupr: number;
  submitted: number;
  failed: number;
  blocked: number;
}

/**
 * Categorized matches for DUPR panel
 */
export interface CategorizedMatches {
  none: Match[];
  proposed: Match[];
  needsReview: Match[];
  readyForDupr: Match[];
  submitted: Match[];
  failed: Match[];
  blocked: Match[];
}

// ============================================
// MATCH ROW DATA
// ============================================

/**
 * Extended match data for DUPR table rows
 */
export interface DuprMatchRowData {
  match: Match;
  category: DuprMatchCategory;

  // Action availability
  canReview: boolean;       // Can open review modal
  canFinalise: boolean;     // Can write officialResult
  canSubmit: boolean;       // Can request DUPR submission
  canToggleEligibility: boolean; // Can toggle dupr.eligible

  // Block reasons
  blockReason?: string;
  eligibilityLockReason?: string;

  // Display helpers
  scoreStateLabel: string;
  duprStatusLabel: string;
  proposalSummary?: string;
  officialSummary?: string;
}

// ============================================
// ELIGIBILITY CHECK
// ============================================

/**
 * Result of canSubmitToDupr check
 */
export interface DuprEligibilityResult {
  eligible: boolean;
  reason?: string;
}

/**
 * Result of eligibility toggle check
 */
export interface EligibilityToggleState {
  canToggle: boolean;
  isEnabled: boolean;
  isLocked: boolean;
  tooltip: string;
}

// ============================================
// BULK OPERATIONS
// ============================================

/**
 * Result of bulk submission request
 */
export interface BulkSubmissionResult {
  success: boolean;
  batchId: string;
  queuedCount: number;
  skippedCount: number;
  failedCount: number;
  error?: string;
}

/**
 * Result of retry failed request
 */
export interface RetryFailedResult {
  success: boolean;
  batchId: string;
  retriedCount: number;
  error?: string;
}

// ============================================
// REVIEW MODAL
// ============================================

/**
 * Data passed to review modal
 */
export interface DuprReviewModalData {
  match: Match;
  eventType: 'tournament' | 'league';
  eventId: string;
  eventName: string;

  // Team data from teamSnapshot
  sideAPlayerNames: string[];
  sideBPlayerNames: string[];

  // Score proposal data (if exists)
  proposal?: {
    scores: GameScore[];
    winnerId: string;
    winnerName?: string;
    enteredByName?: string;
    enteredAt: number;
    status: 'proposed' | 'signed' | 'disputed';
    signedByName?: string;
    signedAt?: number;
    disputedByName?: string;
    disputedAt?: number;
    disputeReason?: string;
  };

  // Official result data (if exists)
  official?: {
    scores: GameScore[];
    winnerId: string;
    winnerName?: string;
    finalisedByName?: string;
    finalisedAt: number;
    version: number;
  };
}

// ============================================
// FILTER OPTIONS
// ============================================

/**
 * Filter options for DUPR match table
 */
export type DuprFilterOption =
  | 'all'
  | 'needs_review'
  | 'ready_for_dupr'
  | 'submitted'
  | 'failed'
  | 'blocked';

/**
 * Filter configuration
 */
export interface DuprFilterConfig {
  id: DuprFilterOption;
  label: string;
  count: number;
  color: string;
}

// ============================================
// COMPONENT PROPS
// ============================================

/**
 * Props for DuprControlPanel
 */
export interface DuprControlPanelProps {
  eventType: 'tournament' | 'league';
  eventId: string;
  eventName: string;
  matches: Match[];
  divisionId?: string;       // For tournament filtering
  divisionName?: string;
  isOrganizer: boolean;
  currentUserId: string;
  onMatchUpdate?: () => void;
}

/**
 * Props for DuprSummaryCards
 */
export interface DuprSummaryCardsProps {
  stats: DuprPanelStats;
  onCardClick?: (category: DuprMatchCategory) => void;
  activeCategory?: DuprMatchCategory | 'all';
}

/**
 * Props for DuprMatchTable
 */
export interface DuprMatchTableProps {
  matches: DuprMatchRowData[];
  filter: DuprFilterOption;
  onFilterChange: (filter: DuprFilterOption) => void;
  onReview: (match: Match) => void;
  onFinalise: (match: Match) => void;
  onSubmit: (match: Match) => void;
  onToggleEligibility: (match: Match, eligible: boolean) => void;
  isLoading?: boolean;
}

/**
 * Props for DuprBulkSubmit
 */
export interface DuprBulkSubmitProps {
  readyCount: number;
  failedCount: number;
  onSubmitAll: () => Promise<void>;
  onRetryFailed: () => Promise<void>;
  isSubmitting: boolean;
  isRetrying: boolean;
}

/**
 * Props for DuprReviewModal
 */
export interface DuprReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: DuprReviewModalData | null;
  onFinalise: (
    matchId: string,
    scores: GameScore[],
    winnerId: string,
    duprEligible: boolean
  ) => Promise<void>;
  isSaving: boolean;
}
