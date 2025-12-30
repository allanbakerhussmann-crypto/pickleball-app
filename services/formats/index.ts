/**
 * Format Services Index
 *
 * Re-exports all format generators for easy importing.
 *
 * Usage:
 *   import { generateRoundRobinMatches, generateEliminationBracket } from '../services/formats';
 *
 * FILE LOCATION: services/formats/index.ts
 * VERSION: V06.21
 */

// Round Robin
export {
  type RoundRobinParticipant,
  type RoundRobinConfig,
  type RoundRobinResult,
  type RoundRobinRound,
  type RoundRobinStanding,
  generateRoundRobinPairings,
  generateRoundRobinMatches,
  calculateRoundRobinStandings,
} from './roundRobin';

// Elimination Brackets
export {
  type BracketParticipant,
  type BracketConfig,
  type BracketMatch,
  type BracketResult,
  seedByDupr,
  calculateBracketSize,
  calculateRounds,
  generateSeedPositions,
  placementBracket,
  generateEliminationBracket,
  advanceWinner,
  getRoundName,
} from './elimination';

// Rotating Doubles Box
export {
  type BoxPlayer,
  type BoxConfig,
  type BoxMatch,
  type BoxResult,
  type BoxPlayerStanding,
  generateRotatingPairings,
  generateRotatingDoublesBoxMatches,
  calculateBoxPlayerStandings,
  getExpectedMatchCount,
} from './rotatingDoublesBox';

// Fixed Doubles Box
export {
  type DoublesTeam,
  type FixedBoxConfig,
  type FixedBoxResult,
  type FixedBoxRound,
  type BoxTeamStanding,
  type PromotionRelegationResult,
  generateFixedTeamPairings,
  generateFixedDoublesBoxMatches,
  calculateFixedBoxTeamStandings,
  determinePromotionRelegation,
} from './fixedDoublesBox';

// Swiss System
export {
  type SwissParticipant,
  type SwissConfig,
  type SwissRoundResult,
  type SwissPairing,
  type SwissStanding,
  generateSwissRound,
  calculateSwissStandings,
  recommendedSwissRounds,
} from './swiss';

// Ladder
export {
  type LadderPlayer,
  type LadderChallenge,
  type LadderConfig,
  type RankAdjustment,
  type ChallengeValidation,
  initializeLadderRankings,
  validateChallenge,
  createChallenge,
  createChallengeMatch,
  processLadderResult,
  getValidChallengeTargets,
  getLadderStandings,
  expireOldChallenges,
} from './ladder';

// King of the Court
export {
  type KingPlayer,
  type CourtState,
  type KingOfCourtConfig,
  type KingOfCourtState,
  type KingOfCourtStanding,
  initializeKingOfCourt,
  startNextMatch,
  recordMatchResult,
  calculateKingOfCourtStandings,
  getQueue,
  getActiveMatches,
  isSessionComplete,
} from './kingOfCourt';

// Pool Play → Medals
export {
  type PoolParticipant,
  type Pool,
  type PoolPlayConfig,
  type PoolStanding,
  type PoolPlayResult,
  type MedalBracketConfig,
  type MedalBracketResult,
  type PoolPlayMedalsResult,
  type BracketReadiness,
  getPoolName,
  assignParticipantsToPools,
  calculatePoolCount,
  generatePoolStage,
  calculatePoolStandings,
  determineQualifiers,
  getQualifiedParticipants,
  generateMedalBracket,
  generatePoolPlayMedals,
  isPoolStageComplete,
  getPoolStageProgress,
  getMatchesForPool,
  validateBracketReadiness,
} from './poolPlayMedals';

// Pool Match Utilities (V06.21 - Idempotent Match Generation)
export {
  normalizePoolKey,
  sortTeamIds,
  generatePoolMatchId,
  generateBracketMatchId,
  parsePoolMatchId,
  isCanonicalPoolMatchId,
} from './poolMatchUtils';

// Round Robin Validation (V06.21 - Fail Closed Validation)
export {
  type ValidationResult,
  type MatchValidationStats,
  type MatchValidationResult,
  type PoolForValidation,
  type MatchForValidation,
  validatePoolsBeforeGeneration,
  validateMatchesBeforeWrite,
  assertValidMatches,
  assertValidPools,
  checkPoolFairness,
} from './roundRobinValidator';
