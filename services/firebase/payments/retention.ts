/**
 * Retention & Compliance Service
 * 
 * Manages financial record retention for tax compliance:
 * - NZ IRD: 7 years
 * - AU ATO: 5-7 years  
 * - US IRS: 3-7 years
 * 
 * We use 7 years as the standard to satisfy all jurisdictions.
 * 
 * FILE LOCATION: services/firebase/payments/retention.ts
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
} from '@firebase/firestore';
import { db } from '../config';
import type { SupportedCurrency } from './types';

// ============================================
// CONSTANTS
// ============================================

/**
 * Retention periods by jurisdiction (in years)
 */
export const RETENTION_PERIODS = {
  /** New Zealand IRD requirement */
  NZ_IRD: 7,
  /** Australia ATO requirement (general) */
  AU_ATO: 5,
  /** Australia ATO requirement (CGT assets) */
  AU_ATO_CGT: 7,
  /** US IRS requirement (general) */
  US_IRS: 3,
  /** US IRS requirement (fraud/no return) */
  US_IRS_MAX: 7,
  /** Default - use strictest requirement */
  DEFAULT: 7,
} as const;

/**
 * Map currency to primary jurisdiction
 */
export const CURRENCY_JURISDICTION: Record<SupportedCurrency, keyof typeof RETENTION_PERIODS> = {
  nzd: 'NZ_IRD',
  aud: 'AU_ATO_CGT', // Use longer period for safety
  usd: 'US_IRS_MAX', // Use longer period for safety
};

/**
 * Collections that contain financial records requiring retention
 */
export const FINANCIAL_COLLECTIONS = [
  'transactions',
  'payments',
  'refunds',
  'receipts',
  'payouts',
  'paymentAuditLogs',
] as const;

export type FinancialCollection = typeof FINANCIAL_COLLECTIONS[number];

// ============================================
// RETENTION RECORD TYPES
// ============================================

export interface RetentionMetadata {
  /** When the record was created */
  createdAt: number;
  /** When the retention period ends (can be archived after) */
  retentionEndsAt: number;
  /** Whether the record has been archived */
  isArchived: boolean;
  /** When it was archived (if applicable) */
  archivedAt?: number;
  /** Archive location/reference (if applicable) */
  archiveRef?: string;
  /** Retention period applied (in years) */
  retentionYears: number;
  /** Jurisdiction used for retention calculation */
  jurisdiction: string;
}

export interface RetentionStatus {
  /** Whether the record is still in retention period */
  inRetention: boolean;
  /** Days remaining in retention period (negative if expired) */
  daysRemaining: number;
  /** When retention ends */
  retentionEndsAt: number;
  /** Whether it can be safely archived */
  canArchive: boolean;
  /** Whether it has been archived */
  isArchived: boolean;
}

// ============================================
// DATE CALCULATIONS
// ============================================

/**
 * Get retention period for a currency/jurisdiction
 */
export const getRetentionPeriod = (currency: SupportedCurrency): number => {
  const jurisdiction = CURRENCY_JURISDICTION[currency];
  return RETENTION_PERIODS[jurisdiction];
};

/**
 * Calculate when retention period ends
 */
export const calculateRetentionEndDate = (
  createdAt: number,
  currency: SupportedCurrency = 'nzd'
): number => {
  const years = getRetentionPeriod(currency);
  const date = new Date(createdAt);
  date.setFullYear(date.getFullYear() + years);
  return date.getTime();
};

/**
 * Calculate retention end date with custom period
 */
export const calculateCustomRetentionEndDate = (
  createdAt: number,
  years: number
): number => {
  const date = new Date(createdAt);
  date.setFullYear(date.getFullYear() + years);
  return date.getTime();
};

/**
 * Check if a record is still within retention period
 */
export const isInRetentionPeriod = (
  createdAt: number,
  currency: SupportedCurrency = 'nzd'
): boolean => {
  const retentionEndsAt = calculateRetentionEndDate(createdAt, currency);
  return Date.now() < retentionEndsAt;
};

/**
 * Get days remaining in retention period
 */
export const getDaysRemainingInRetention = (
  createdAt: number,
  currency: SupportedCurrency = 'nzd'
): number => {
  const retentionEndsAt = calculateRetentionEndDate(createdAt, currency);
  const now = Date.now();
  const msRemaining = retentionEndsAt - now;
  return Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
};

/**
 * Get full retention status for a record
 */
export const getRetentionStatus = (
  createdAt: number,
  currency: SupportedCurrency = 'nzd',
  isArchived: boolean = false
): RetentionStatus => {
  const retentionEndsAt = calculateRetentionEndDate(createdAt, currency);
  const now = Date.now();
  const daysRemaining = Math.ceil((retentionEndsAt - now) / (1000 * 60 * 60 * 24));
  const inRetention = daysRemaining > 0;

  return {
    inRetention,
    daysRemaining,
    retentionEndsAt,
    canArchive: !inRetention && !isArchived,
    isArchived,
  };
};

// ============================================
// RETENTION METADATA HELPERS
// ============================================

/**
 * Create retention metadata for a new record
 */
export const createRetentionMetadata = (
  createdAt: number = Date.now(),
  currency: SupportedCurrency = 'nzd'
): RetentionMetadata => {
  const jurisdiction = CURRENCY_JURISDICTION[currency];
  const retentionYears = RETENTION_PERIODS[jurisdiction];

  return {
    createdAt,
    retentionEndsAt: calculateRetentionEndDate(createdAt, currency),
    isArchived: false,
    retentionYears,
    jurisdiction,
  };
};

/**
 * Add retention metadata to a record object
 */
export const addRetentionMetadata = <T extends { createdAt: number }>(
  record: T,
  currency: SupportedCurrency = 'nzd'
): T & { retention: RetentionMetadata } => {
  return {
    ...record,
    retention: createRetentionMetadata(record.createdAt, currency),
  };
};

// ============================================
// ARCHIVAL FUNCTIONS
// ============================================

/**
 * Mark a record as archived
 */
export const markAsArchived = async (
  collectionName: FinancialCollection,
  recordId: string,
  archiveRef?: string
): Promise<void> => {
  const docRef = doc(db, collectionName, recordId);
  
  await updateDoc(docRef, {
    'retention.isArchived': true,
    'retention.archivedAt': Date.now(),
    'retention.archiveRef': archiveRef || null,
  });
};

/**
 * Query records that are past retention and ready for archival
 */
export const getRecordsReadyForArchival = async (
  collectionName: FinancialCollection,
  batchSize: number = 100
): Promise<{ id: string; createdAt: number }[]> => {
  const now = Date.now();
  
  // Query records where retention has ended and not yet archived
  // Note: This requires the record to have retention.retentionEndsAt field
  const q = query(
    collection(db, collectionName),
    where('retention.retentionEndsAt', '<', now),
    where('retention.isArchived', '==', false),
    orderBy('retention.retentionEndsAt', 'asc'),
    limit(batchSize)
  );

  const snap = await getDocs(q);
  return snap.docs.map(d => ({
    id: d.id,
    createdAt: d.data().createdAt,
  }));
};

/**
 * Get count of records ready for archival
 */
export const countRecordsReadyForArchival = async (
  collectionName: FinancialCollection
): Promise<number> => {
  const records = await getRecordsReadyForArchival(collectionName, 1000);
  return records.length;
};

/**
 * Batch archive multiple records
 */
export const batchArchiveRecords = async (
  collectionName: FinancialCollection,
  recordIds: string[],
  archiveRef?: string
): Promise<{ success: number; failed: number }> => {
  let success = 0;
  let failed = 0;

  // Process in batches of 500 (Firestore limit)
  const batchSize = 500;
  for (let i = 0; i < recordIds.length; i += batchSize) {
    const batch = writeBatch(db);
    const batchIds = recordIds.slice(i, i + batchSize);

    for (const recordId of batchIds) {
      const docRef = doc(db, collectionName, recordId);
      batch.update(docRef, {
        'retention.isArchived': true,
        'retention.archivedAt': Date.now(),
        'retention.archiveRef': archiveRef || null,
      });
    }

    try {
      await batch.commit();
      success += batchIds.length;
    } catch (error) {
      console.error(`Failed to archive batch starting at ${i}:`, error);
      failed += batchIds.length;
    }
  }

  return { success, failed };
};

// ============================================
// COMPLIANCE HELPERS
// ============================================

/**
 * Compliance check result
 */
export interface ComplianceCheckResult {
  isCompliant: boolean;
  issues: string[];
  warnings: string[];
  stats: {
    totalRecords: number;
    inRetention: number;
    archived: number;
    pendingArchival: number;
  };
}

/**
 * Check if a record meets retention requirements
 */
export const checkRecordCompliance = (
  record: { createdAt: number; retention?: RetentionMetadata },
  currency: SupportedCurrency = 'nzd'
): { compliant: boolean; issue?: string } => {
  // Check if retention metadata exists
  if (!record.retention) {
    return {
      compliant: false,
      issue: 'Missing retention metadata',
    };
  }

  // Check if retention period is correct
  const expectedYears = getRetentionPeriod(currency);
  if (record.retention.retentionYears < expectedYears) {
    return {
      compliant: false,
      issue: `Retention period (${record.retention.retentionYears} years) is less than required (${expectedYears} years)`,
    };
  }

  // Check if archived prematurely
  const status = getRetentionStatus(record.createdAt, currency, record.retention.isArchived);
  if (record.retention.isArchived && status.inRetention) {
    return {
      compliant: false,
      issue: 'Record was archived while still in retention period',
    };
  }

  return { compliant: true };
};

/**
 * Get retention summary for a collection
 */
export const getRetentionSummary = async (
  collectionName: FinancialCollection
): Promise<{
  total: number;
  inRetention: number;
  pastRetention: number;
  archived: number;
  pendingArchival: number;
}> => {
  // This would be expensive for large collections
  // In production, use aggregation or counters
  const snap = await getDocs(collection(db, collectionName));
  
  let total = 0;
  let inRetention = 0;
  let pastRetention = 0;
  let archived = 0;

  snap.forEach(doc => {
    total++;
    const data = doc.data();
    
    if (data.retention?.isArchived) {
      archived++;
    } else if (data.retention?.retentionEndsAt) {
      if (Date.now() < data.retention.retentionEndsAt) {
        inRetention++;
      } else {
        pastRetention++;
      }
    } else if (data.createdAt) {
      // Fallback if no retention metadata
      if (isInRetentionPeriod(data.createdAt)) {
        inRetention++;
      } else {
        pastRetention++;
      }
    }
  });

  return {
    total,
    inRetention,
    pastRetention,
    archived,
    pendingArchival: pastRetention, // Past retention but not archived
  };
};

// ============================================
// TAX YEAR HELPERS
// ============================================

/**
 * Get tax year for a date (varies by country)
 * NZ: April 1 - March 31
 * AU: July 1 - June 30
 * US: January 1 - December 31
 */
export const getTaxYear = (
  date: Date | number,
  currency: SupportedCurrency
): string => {
  const d = typeof date === 'number' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-indexed

  switch (currency) {
    case 'nzd':
      // NZ tax year: April 1 - March 31
      // If Jan-Mar, it's the previous year's tax year
      if (month < 3) {
        return `${year - 1}-${year}`;
      }
      return `${year}-${year + 1}`;

    case 'aud':
      // AU tax year: July 1 - June 30
      // If Jan-Jun, it's the previous year's tax year
      if (month < 6) {
        return `${year - 1}-${year}`;
      }
      return `${year}-${year + 1}`;

    case 'usd':
    default:
      // US/default: Calendar year
      return `${year}`;
  }
};

/**
 * Get date range for a tax year
 */
export const getTaxYearDateRange = (
  taxYear: string,
  currency: SupportedCurrency
): { start: Date; end: Date } => {
  // Parse tax year string
  const parts = taxYear.split('-').map(Number);
  const startYear = parts[0];
  const endYear = parts.length > 1 ? parts[1] : parts[0];

  switch (currency) {
    case 'nzd':
      // NZ: April 1 - March 31
      return {
        start: new Date(startYear, 3, 1), // April 1
        end: new Date(endYear, 2, 31, 23, 59, 59, 999), // March 31
      };

    case 'aud':
      // AU: July 1 - June 30
      return {
        start: new Date(startYear, 6, 1), // July 1
        end: new Date(endYear, 5, 30, 23, 59, 59, 999), // June 30
      };

    case 'usd':
    default:
      // US: Calendar year
      return {
        start: new Date(startYear, 0, 1), // January 1
        end: new Date(startYear, 11, 31, 23, 59, 59, 999), // December 31
      };
  }
};

/**
 * Check if a tax year's records are still in retention
 */
export const isTaxYearInRetention = (
  taxYear: string,
  currency: SupportedCurrency
): boolean => {
  const { end } = getTaxYearDateRange(taxYear, currency);
  return isInRetentionPeriod(end.getTime(), currency);
};

// ============================================
// DISPLAY HELPERS
// ============================================

/**
 * Format retention status for display
 */
export const formatRetentionStatus = (status: RetentionStatus): string => {
  if (status.isArchived) {
    return 'Archived';
  }

  if (status.inRetention) {
    if (status.daysRemaining > 365) {
      const years = Math.floor(status.daysRemaining / 365);
      return `${years} year${years > 1 ? 's' : ''} remaining`;
    }
    if (status.daysRemaining > 30) {
      const months = Math.floor(status.daysRemaining / 30);
      return `${months} month${months > 1 ? 's' : ''} remaining`;
    }
    return `${status.daysRemaining} day${status.daysRemaining > 1 ? 's' : ''} remaining`;
  }

  return 'Ready for archival';
};

/**
 * Get retention requirement description
 */
export const getRetentionRequirementText = (currency: SupportedCurrency): string => {
  const years = getRetentionPeriod(currency);
  const jurisdiction = CURRENCY_JURISDICTION[currency];

  const descriptions: Record<string, string> = {
    NZ_IRD: `New Zealand IRD requires ${years} years retention`,
    AU_ATO: `Australian ATO requires ${years} years retention`,
    AU_ATO_CGT: `Australian ATO requires ${years} years retention (CGT assets)`,
    US_IRS: `US IRS requires ${years} years retention`,
    US_IRS_MAX: `US IRS requires up to ${years} years retention`,
    DEFAULT: `${years} years retention required`,
  };

  return descriptions[jurisdiction] || descriptions.DEFAULT;
};