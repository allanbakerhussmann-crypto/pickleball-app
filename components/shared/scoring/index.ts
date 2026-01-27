/**
 * Shared Scoring Components
 *
 * Reusable components for the unified EventScoreEntryModal.
 *
 * @version V07.53
 * @file components/shared/scoring/index.ts
 */

export { ScoreHeader } from './ScoreHeader';
export { ScoreStatusBanner, ScoreStatusFooter } from './ScoreStatusBanner';
export { MatchInfo } from './MatchInfo';
export {
  GameScoreEntry,
  validateGame,
  calculateWinner,
  type GameInput,
} from './GameScoreEntry';
export { ScoreSummary } from './ScoreSummary';
