/**
 * useReports Hook
 * 
 * React hook for generating and viewing financial reports.
 * 
 * FILE LOCATION: hooks/payments/useReports.ts
 */

import { useState, useCallback } from 'react';
import {
  generateRevenueSummaryReport,
  generateTransactionDetailReport,
  generateTaxSummaryReport,
  generatePayoutSummaryReport,
  generateRefundSummaryReport,
  generateAnnualPassSummaryReport,
  getClubReports,
  getReport,
  getDateRangeForPeriod,
  formatDateRange,
  getReportTypeLabel,
  getPeriodLabel,
  formatReportAmount,
  calculateGrowthRate,
  type ReportType,
  type ReportPeriod,
  type DateRange,
  type BaseReport,
  type RevenueSummaryReport,
  type TransactionDetailReport,
  type TaxSummaryReport,
  type PayoutSummaryReport,
  type RefundSummaryReport,
  type AnnualPassSummaryReport,
  type ReportOptions,
  type SupportedCurrency,
} from '../../services/firebase/payments';

// ============================================
// TYPES
// ============================================

export interface UseReportsOptions {
  clubId?: string;
  currency?: SupportedCurrency;
  userId?: string; // For audit trail
}

export interface UseReportsReturn {
  // State
  currentReport: BaseReport | null;
  reports: BaseReport[];
  loading: boolean;
  generating: boolean;
  error: Error | null;
  
  // Report generation
  generateRevenueReport: (dateRange: DateRange, period?: ReportPeriod, includeComparison?: boolean) => Promise<RevenueSummaryReport>;
  generateTransactionReport: (dateRange: DateRange, period?: ReportPeriod) => Promise<TransactionDetailReport>;
  generateTaxReport: (dateRange: DateRange, period?: ReportPeriod, taxRate?: number) => Promise<TaxSummaryReport>;
  generatePayoutReport: (dateRange: DateRange, period?: ReportPeriod) => Promise<PayoutSummaryReport>;
  generateRefundReport: (dateRange: DateRange, period?: ReportPeriod) => Promise<RefundSummaryReport>;
  generateAnnualPassReport: (dateRange: DateRange, period?: ReportPeriod) => Promise<AnnualPassSummaryReport>;
  
  // Report retrieval
  loadReport: (reportId: string) => Promise<BaseReport | null>;
  loadClubReports: (type?: ReportType, limit?: number) => Promise<void>;
  
  // Helpers
  getDateRange: (period: ReportPeriod, referenceDate?: Date) => DateRange;
  formatRange: (dateRange: DateRange) => string;
  getTypeLabel: (type: ReportType) => string;
  getPeriodLabel: (period: ReportPeriod) => string;
  formatAmount: (amount: number) => string;
  getGrowth: (previous: number, current: number) => { rate: number; direction: 'up' | 'down' | 'flat' };
}

// ============================================
// HOOK IMPLEMENTATION
// ============================================

export const useReports = (options: UseReportsOptions = {}): UseReportsReturn => {
  const {
    clubId,
    currency = 'nzd',
    userId,
  } = options;

  // State
  const [currentReport, setCurrentReport] = useState<BaseReport | null>(null);
  const [reports, setReports] = useState<BaseReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Base options builder
  const buildOptions = useCallback((
    dateRange: DateRange,
    period?: ReportPeriod
  ): ReportOptions => ({
    clubId,
    dateRange,
    period,
    currency,
    generatedBy: userId,
  }), [clubId, currency, userId]);

  // Generate revenue report
  const generateRevenueReport = useCallback(async (
    dateRange: DateRange,
    period: ReportPeriod = 'monthly',
    includeComparison: boolean = false
  ): Promise<RevenueSummaryReport> => {
    try {
      setGenerating(true);
      setError(null);

      const report = await generateRevenueSummaryReport({
        ...buildOptions(dateRange, period),
        includeComparison,
      });

      setCurrentReport(report);
      return report;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to generate revenue report');
      setError(error);
      throw error;
    } finally {
      setGenerating(false);
    }
  }, [buildOptions]);

  // Generate transaction report
  const generateTransactionReport = useCallback(async (
    dateRange: DateRange,
    period: ReportPeriod = 'monthly'
  ): Promise<TransactionDetailReport> => {
    try {
      setGenerating(true);
      setError(null);

      const report = await generateTransactionDetailReport(buildOptions(dateRange, period));

      setCurrentReport(report);
      return report;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to generate transaction report');
      setError(error);
      throw error;
    } finally {
      setGenerating(false);
    }
  }, [buildOptions]);

  // Generate tax report
  const generateTaxReport = useCallback(async (
    dateRange: DateRange,
    period: ReportPeriod = 'monthly',
    taxRate: number = 15
  ): Promise<TaxSummaryReport> => {
    try {
      setGenerating(true);
      setError(null);

      const report = await generateTaxSummaryReport({
        ...buildOptions(dateRange, period),
        taxRate,
      });

      setCurrentReport(report);
      return report;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to generate tax report');
      setError(error);
      throw error;
    } finally {
      setGenerating(false);
    }
  }, [buildOptions]);

  // Generate payout report
  const generatePayoutReport = useCallback(async (
    dateRange: DateRange,
    period: ReportPeriod = 'monthly'
  ): Promise<PayoutSummaryReport> => {
    if (!clubId) {
      throw new Error('Club ID required for payout report');
    }

    try {
      setGenerating(true);
      setError(null);

      const report = await generatePayoutSummaryReport(buildOptions(dateRange, period));

      setCurrentReport(report);
      return report;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to generate payout report');
      setError(error);
      throw error;
    } finally {
      setGenerating(false);
    }
  }, [clubId, buildOptions]);

  // Generate refund report
  const generateRefundReport = useCallback(async (
    dateRange: DateRange,
    period: ReportPeriod = 'monthly'
  ): Promise<RefundSummaryReport> => {
    try {
      setGenerating(true);
      setError(null);

      const report = await generateRefundSummaryReport(buildOptions(dateRange, period));

      setCurrentReport(report);
      return report;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to generate refund report');
      setError(error);
      throw error;
    } finally {
      setGenerating(false);
    }
  }, [buildOptions]);

  // Generate annual pass report
  const generateAnnualPassReport = useCallback(async (
    dateRange: DateRange,
    period: ReportPeriod = 'monthly'
  ): Promise<AnnualPassSummaryReport> => {
    if (!clubId) {
      throw new Error('Club ID required for annual pass report');
    }

    try {
      setGenerating(true);
      setError(null);

      const report = await generateAnnualPassSummaryReport(buildOptions(dateRange, period));

      setCurrentReport(report);
      return report;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to generate annual pass report');
      setError(error);
      throw error;
    } finally {
      setGenerating(false);
    }
  }, [clubId, buildOptions]);

  // Load a specific report
  const loadReport = useCallback(async (reportId: string): Promise<BaseReport | null> => {
    try {
      setLoading(true);
      setError(null);

      const report = await getReport(reportId);
      if (report) {
        setCurrentReport(report);
      }
      return report;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load report');
      setError(error);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Load club's reports
  const loadClubReports = useCallback(async (
    type?: ReportType,
    limit: number = 20
  ): Promise<void> => {
    if (!clubId) {
      setError(new Error('Club ID required'));
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const clubReports = await getClubReports(clubId, type, limit);
      setReports(clubReports);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load reports'));
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  // Helper functions
  const getDateRange = useCallback((
    period: ReportPeriod,
    referenceDate?: Date
  ): DateRange => {
    return getDateRangeForPeriod(period, referenceDate);
  }, []);

  const formatRange = useCallback((dateRange: DateRange): string => {
    return formatDateRange(dateRange);
  }, []);

  const getTypeLabel = useCallback((type: ReportType): string => {
    return getReportTypeLabel(type);
  }, []);

  const getPeriodLabelFn = useCallback((period: ReportPeriod): string => {
    return getPeriodLabel(period);
  }, []);

  const formatAmount = useCallback((amount: number): string => {
    return formatReportAmount(amount, currency);
  }, [currency]);

  const getGrowth = useCallback((
    previous: number,
    current: number
  ): { rate: number; direction: 'up' | 'down' | 'flat' } => {
    return calculateGrowthRate(previous, current);
  }, []);

  return {
    // State
    currentReport,
    reports,
    loading,
    generating,
    error,
    
    // Report generation
    generateRevenueReport,
    generateTransactionReport,
    generateTaxReport,
    generatePayoutReport,
    generateRefundReport,
    generateAnnualPassReport,
    
    // Report retrieval
    loadReport,
    loadClubReports,
    
    // Helpers
    getDateRange,
    formatRange,
    getTypeLabel,
    getPeriodLabel: getPeriodLabelFn,
    formatAmount,
    getGrowth,
  };
};

export default useReports;