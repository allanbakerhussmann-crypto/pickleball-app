/**
 * useReceipt Hook
 * 
 * React hook for receipt management including:
 * - Receipt generation
 * - Receipt history
 * - PDF download
 * - Email receipts
 * 
 * FILE LOCATION: hooks/payments/useReceipt.ts
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getReceipt,
  getReceiptByNumber,
  getUserReceipts,
  getClubReceipts,
  subscribeToUserReceipts,
  createReceipt,
  generateReceiptFromTransaction,
  generateReceiptFromPayment,
  generateReceiptFromRefund,
  generateReceiptHtml,
  buildReceiptTemplateData,
  markReceiptSent,
  voidReceipt,
  getUserReceiptSummary,
  getClubReceiptStats,
  getReceiptTypeLabel,
  getReceiptStatusColor,
  generateReceiptFilename,
  canVoidReceipt,
  formatAmount,
  type Receipt,
  type ReceiptStatus,
  type GenerateReceiptInput,
  type ReceiptTemplateData,
  type Transaction,
  type Payment,
  type Refund,
  type ClubBranding,
  type SupportedCurrency,
} from '../../services/firebase/payments';

// ============================================
// TYPES
// ============================================

export interface UseReceiptOptions {
  /** User ID */
  userId?: string;
  /** Club ID (for club admin view) */
  clubId?: string;
  /** Enable real-time updates */
  realtime?: boolean;
}

export interface ReceiptSummary {
  totalReceipts: number;
  totalSpent: number;
  totalRefunded: number;
  byMonth: Record<string, number>;
}

export interface UseReceiptReturn {
  // State
  receipt: Receipt | null;
  receipts: Receipt[];
  loading: boolean;
  error: Error | null;
  
  // Summary
  summary: ReceiptSummary | null;
  
  // Actions
  refetch: () => Promise<void>;
  getReceiptById: (receiptId: string) => Promise<Receipt | null>;
  getReceiptByNum: (receiptNumber: string) => Promise<Receipt | null>;
  generateFromTransaction: (transaction: Transaction, userName?: string, userEmail?: string, branding?: ClubBranding) => Promise<Receipt>;
  generateFromPayment: (payment: Payment, userName?: string, userEmail?: string, branding?: ClubBranding) => Promise<Receipt>;
  generateFromRefund: (refund: Refund, userName?: string, userEmail?: string, branding?: ClubBranding) => Promise<Receipt>;
  generateCustomReceipt: (input: GenerateReceiptInput) => Promise<Receipt>;
  markAsSent: (receiptId: string, email: string) => Promise<void>;
  voidReceiptById: (receiptId: string, reason: string) => Promise<void>;
  loadSummary: (year?: number) => Promise<void>;
  
  // HTML/PDF generation
  getReceiptHtml: (receipt: Receipt, branding?: ClubBranding) => string;
  downloadReceipt: (receipt: Receipt, branding?: ClubBranding) => void;
  printReceipt: (receipt: Receipt, branding?: ClubBranding) => void;
  
  // Helpers
  getTypeLabel: (type: string) => string;
  getStatusColor: (status: ReceiptStatus) => string;
  getFilename: (receiptNumber: string) => string;
  canVoid: (receipt: Receipt) => boolean;
  formatReceiptAmount: (amount: number, currency: SupportedCurrency) => string;
}

// ============================================
// HOOK IMPLEMENTATION
// ============================================

export const useReceipt = (options: UseReceiptOptions = {}): UseReceiptReturn => {
  const {
    userId,
    clubId,
    realtime = true,
  } = options;

  // State
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [summary, setSummary] = useState<ReceiptSummary | null>(null);

  // Fetch receipts
  const fetchReceipts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (clubId) {
        const clubReceipts = await getClubReceipts(clubId);
        setReceipts(clubReceipts);
      } else if (userId) {
        const userReceipts = await getUserReceipts(userId);
        setReceipts(userReceipts);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch receipts'));
    } finally {
      setLoading(false);
    }
  }, [userId, clubId]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!realtime || !userId) {
      fetchReceipts();
      return;
    }

    setLoading(true);

    const unsubscribe = subscribeToUserReceipts(userId, (updatedReceipts) => {
      setReceipts(updatedReceipts);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId, realtime, fetchReceipts]);

  // Actions
  const refetch = useCallback(async () => {
    await fetchReceipts();
  }, [fetchReceipts]);

  const getReceiptById = useCallback(async (receiptId: string): Promise<Receipt | null> => {
    try {
      const r = await getReceipt(receiptId);
      if (r) {
        setReceipt(r);
      }
      return r;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to get receipt'));
      return null;
    }
  }, []);

  const getReceiptByNum = useCallback(async (receiptNumber: string): Promise<Receipt | null> => {
    try {
      const r = await getReceiptByNumber(receiptNumber);
      if (r) {
        setReceipt(r);
      }
      return r;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to get receipt'));
      return null;
    }
  }, []);

  const generateFromTransaction = useCallback(async (
    transaction: Transaction,
    userName?: string,
    userEmail?: string,
    branding?: ClubBranding
  ): Promise<Receipt> => {
    try {
      setLoading(true);
      const newReceipt = await generateReceiptFromTransaction(transaction, userName, userEmail, branding);
      setReceipt(newReceipt);
      return newReceipt;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to generate receipt');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const generateFromPayment = useCallback(async (
    payment: Payment,
    userName?: string,
    userEmail?: string,
    branding?: ClubBranding
  ): Promise<Receipt> => {
    try {
      setLoading(true);
      const newReceipt = await generateReceiptFromPayment(payment, userName, userEmail, branding);
      setReceipt(newReceipt);
      return newReceipt;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to generate receipt');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const generateFromRefund = useCallback(async (
    refund: Refund,
    userName?: string,
    userEmail?: string,
    branding?: ClubBranding
  ): Promise<Receipt> => {
    try {
      setLoading(true);
      const newReceipt = await generateReceiptFromRefund(refund, userName, userEmail, branding);
      setReceipt(newReceipt);
      return newReceipt;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to generate receipt');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const generateCustomReceipt = useCallback(async (input: GenerateReceiptInput): Promise<Receipt> => {
    try {
      setLoading(true);
      const newReceipt = await createReceipt(input);
      setReceipt(newReceipt);
      return newReceipt;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to create receipt');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const markAsSent = useCallback(async (receiptId: string, email: string): Promise<void> => {
    await markReceiptSent(receiptId, email);
  }, []);

  const voidReceiptById = useCallback(async (receiptId: string, reason: string): Promise<void> => {
    await voidReceipt(receiptId, reason);
  }, []);

  const loadSummary = useCallback(async (year?: number): Promise<void> => {
    if (!userId) return;

    try {
      const result = await getUserReceiptSummary(userId, year);
      setSummary(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load summary'));
    }
  }, [userId]);

  // HTML/PDF generation
  const getReceiptHtml = useCallback((
    receipt: Receipt,
    branding?: ClubBranding
  ): string => {
    const templateData = buildReceiptTemplateData(
      {
        referenceId: receipt.transactionId || receipt.id,
        type: receipt.type as any,
        userId: receipt.odUserId,
        clubId: receipt.odClubId,
        amount: receipt.amount,
        currency: receipt.currency,
        items: receipt.items,
        taxAmount: receipt.taxAmount,
        taxRate: receipt.taxRate,
        referenceType: receipt.referenceType,
        referenceName: receipt.referenceName,
        branding,
      },
      receipt.receiptNumber,
      branding
    );
    return generateReceiptHtml(templateData);
  }, []);

  const downloadReceipt = useCallback((
    receipt: Receipt,
    branding?: ClubBranding
  ): void => {
    const html = getReceiptHtml(receipt, branding);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = generateReceiptFilename(receipt.receiptNumber, 'html');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [getReceiptHtml]);

  const printReceipt = useCallback((
    receipt: Receipt,
    branding?: ClubBranding
  ): void => {
    const html = getReceiptHtml(receipt, branding);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.print();
    }
  }, [getReceiptHtml]);

  // Helpers
  const getTypeLabel = useCallback((type: string): string => {
    return getReceiptTypeLabel(type);
  }, []);

  const getStatusColor = useCallback((status: ReceiptStatus): string => {
    return getReceiptStatusColor(status);
  }, []);

  const getFilename = useCallback((receiptNumber: string): string => {
    return generateReceiptFilename(receiptNumber);
  }, []);

  const canVoid = useCallback((receipt: Receipt): boolean => {
    return canVoidReceipt(receipt);
  }, []);

  const formatReceiptAmount = useCallback((amount: number, currency: SupportedCurrency): string => {
    return formatAmount(amount, currency === 'nzd' ? 'NZ$' : currency === 'aud' ? 'A$' : '$');
  }, []);

  return {
    // State
    receipt,
    receipts,
    loading,
    error,
    
    // Summary
    summary,
    
    // Actions
    refetch,
    getReceiptById,
    getReceiptByNum,
    generateFromTransaction,
    generateFromPayment,
    generateFromRefund,
    generateCustomReceipt,
    markAsSent,
    voidReceiptById,
    loadSummary,
    
    // HTML/PDF generation
    getReceiptHtml,
    downloadReceipt,
    printReceipt,
    
    // Helpers
    getTypeLabel,
    getStatusColor,
    getFilename,
    canVoid,
    formatReceiptAmount,
  };
};

export default useReceipt;