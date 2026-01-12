/**
 * Standings Module
 *
 * Exports shared standings calculation functions used by
 * both UI components and database persistence.
 *
 * @version V07.30
 * @file services/standings/index.ts
 */

export {
  calculatePoolStandings,
  DEFAULT_TIEBREAKERS,
  type TiebreakerKey,
  type PoolStandingRow,
} from './poolStandings';
