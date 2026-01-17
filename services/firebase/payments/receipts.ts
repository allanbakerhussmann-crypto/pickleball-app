/**
 * Receipt Generator Service
 * 
 * Generates and manages receipts for:
 * - Court bookings
 * - Tournament registrations
 * - League memberships
 * - Annual pass purchases
 * - Wallet top-ups
 * - Refunds
 * 
 * All amounts are in CENTS.
 * 
 * FILE LOCATION: services/firebase/payments/receipts.ts
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
  onSnapshot,
  type Unsubscribe,
} from '@firebase/firestore';
import { db } from '../config';
import type {
  Receipt,
  ReceiptItem,
  Transaction,
  Payment,
  Refund,
  ClubBranding,
  SupportedCurrency,
  ReferenceType,
  TransactionBreakdown,
} from './types';

// ============================================
// CONSTANTS
// ============================================

const RECEIPTS_COLLECTION = 'receipts';

/**
 * Receipt number prefix by type
 */
export const RECEIPT_PREFIXES: Record<string, string> = {
  payment: 'RCP',
  refund: 'RFD',
  topup: 'TOP',
  payout: 'PAY',
};

/**
 * Receipt status
 */
export type ReceiptStatus = 'draft' | 'generated' | 'sent' | 'voided';

// ============================================
// TYPES
// ============================================

/**
 * Receipt generation input
 */
export interface GenerateReceiptInput {
  /** Transaction or Payment ID */
  referenceId: string;
  /** Type of receipt */
  type: 'payment' | 'refund' | 'topup' | 'payout';
  /** User receiving the receipt */
  userId: string;
  /** User's email for sending */
  userEmail?: string;
  /** User's name */
  userName?: string;
  /** Club ID (if applicable) */
  clubId?: string;
  /** Amount in cents */
  amount: number;
  /** Currency */
  currency: SupportedCurrency;
  /** Line items */
  items: ReceiptItem[];
  /** Tax amount (if any) */
  taxAmount?: number;
  /** Tax rate applied */
  taxRate?: number;
  /** Platform fee (shown separately) */
  platformFee?: number;
  /** What this is for */
  referenceType: ReferenceType;
  referenceName: string;
  /** Payment method used */
  paymentMethod?: string;
  /** Last 4 digits of card (if applicable) */
  cardLast4?: string;
  /** Club branding for receipt */
  branding?: ClubBranding;
  /** Additional notes */
  notes?: string;
}

/**
 * Receipt template data
 */
export interface ReceiptTemplateData {
  receiptNumber: string;
  receiptDate: string;
  receiptTime: string;
  
  // Recipient
  customerName: string;
  customerEmail?: string;
  
  // Seller/Club
  clubName?: string;
  clubLogo?: string;
  clubAddress?: string;
  clubPhone?: string;
  clubEmail?: string;
  clubGstNumber?: string;
  
  // Transaction details
  transactionType: string;
  referenceType: string;
  referenceName: string;
  paymentMethod: string;
  cardLast4?: string;
  
  // Line items
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: string;
    total: string;
  }>;
  
  // Totals
  subtotal: string;
  discounts?: string;
  taxLabel?: string;
  taxAmount?: string;
  platformFee?: string;
  total: string;
  
  // Currency
  currency: string;
  currencySymbol: string;
  
  // Footer
  notes?: string;
  termsUrl?: string;
  supportEmail?: string;
}

/**
 * Email receipt options
 */
export interface EmailReceiptOptions {
  to: string;
  subject?: string;
  includeAttachment: boolean;
  sendCopy?: string; // CC address
}

/**
 * Receipt search options
 */
export interface ReceiptSearchOptions {
  userId?: string;
  clubId?: string;
  type?: string;
  startDate?: number;
  endDate?: number;
  limit?: number;
}

// ============================================
// ID GENERATION
// ============================================

/**
 * Generate a unique receipt ID
 */
export const generateReceiptId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `rcpt_${timestamp}${random}`;
};

/**
 * Generate a human-readable receipt number
 */
export const generateReceiptNumber = (
  type: string = 'payment',
  sequence?: number
): string => {
  const prefix = RECEIPT_PREFIXES[type] || 'RCP';
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const seq = sequence || Math.floor(Math.random() * 10000);
  
  return `${prefix}-${year}${month}${day}-${String(seq).padStart(4, '0')}`;
};

// ============================================
// RECEIPT CRUD OPERATIONS
// ============================================

/**
 * Create a new receipt
 */
export const createReceipt = async (
  input: GenerateReceiptInput
): Promise<Receipt> => {
  const receiptId = generateReceiptId();
  const receiptNumber = generateReceiptNumber(input.type);
  const now = Date.now();
  
  const receipt: Receipt = {
    id: receiptId,
    receiptNumber,
    odUserId: input.userId,
    odClubId: input.clubId,
    transactionId: input.referenceId,
    type: input.type,
    amount: input.amount,
    currency: input.currency,
    items: input.items,
    taxAmount: input.taxAmount,
    taxRate: input.taxRate,
    referenceType: input.referenceType,
    referenceName: input.referenceName,
    status: 'generated',
    createdAt: now,
  };
  
  const docRef = doc(db, RECEIPTS_COLLECTION, receiptId);
  await setDoc(docRef, receipt);
  
  return receipt;
};

/**
 * Get a receipt by ID
 */
export const getReceipt = async (
  receiptId: string
): Promise<Receipt | null> => {
  const docRef = doc(db, RECEIPTS_COLLECTION, receiptId);
  const snap = await getDoc(docRef);
  
  if (!snap.exists()) {
    return null;
  }
  
  return { id: snap.id, ...snap.data() } as Receipt;
};

/**
 * Get receipt by receipt number
 */
export const getReceiptByNumber = async (
  receiptNumber: string
): Promise<Receipt | null> => {
  const q = query(
    collection(db, RECEIPTS_COLLECTION),
    where('receiptNumber', '==', receiptNumber),
    limit(1)
  );
  
  const snap = await getDocs(q);
  if (snap.empty) {
    return null;
  }
  
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as Receipt;
};

/**
 * Get receipt for a transaction
 */
export const getReceiptForTransaction = async (
  transactionId: string
): Promise<Receipt | null> => {
  const q = query(
    collection(db, RECEIPTS_COLLECTION),
    where('transactionId', '==', transactionId),
    limit(1)
  );
  
  const snap = await getDocs(q);
  if (snap.empty) {
    return null;
  }
  
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as Receipt;
};

/**
 * Get user's receipts
 */
export const getUserReceipts = async (
  userId: string,
  limitCount: number = 50
): Promise<Receipt[]> => {
  const q = query(
    collection(db, RECEIPTS_COLLECTION),
    where('odUserId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Receipt));
};

/**
 * Get club's receipts
 */
export const getClubReceipts = async (
  clubId: string,
  limitCount: number = 100
): Promise<Receipt[]> => {
  const q = query(
    collection(db, RECEIPTS_COLLECTION),
    where('odClubId', '==', clubId),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Receipt));
};

/**
 * Search receipts with filters
 */
export const searchReceipts = async (
  options: ReceiptSearchOptions
): Promise<Receipt[]> => {
  let q = query(collection(db, RECEIPTS_COLLECTION));
  
  // Build query based on options
  const constraints: any[] = [];
  
  if (options.userId) {
    constraints.push(where('odUserId', '==', options.userId));
  }
  if (options.clubId) {
    constraints.push(where('odClubId', '==', options.clubId));
  }
  if (options.type) {
    constraints.push(where('type', '==', options.type));
  }
  if (options.startDate) {
    constraints.push(where('createdAt', '>=', options.startDate));
  }
  if (options.endDate) {
    constraints.push(where('createdAt', '<=', options.endDate));
  }
  
  constraints.push(orderBy('createdAt', 'desc'));
  constraints.push(limit(options.limit || 50));
  
  q = query(collection(db, RECEIPTS_COLLECTION), ...constraints);
  
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Receipt));
};

/**
 * Subscribe to user's receipts
 */
export const subscribeToUserReceipts = (
  userId: string,
  callback: (receipts: Receipt[]) => void
): Unsubscribe => {
  const q = query(
    collection(db, RECEIPTS_COLLECTION),
    where('odUserId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(20)
  );
  
  return onSnapshot(q, (snap) => {
    const receipts = snap.docs.map(d => ({ id: d.id, ...d.data() } as Receipt));
    callback(receipts);
  });
};

// ============================================
// RECEIPT STATUS MANAGEMENT
// ============================================

/**
 * Update receipt status
 */
export const updateReceiptStatus = async (
  receiptId: string,
  status: ReceiptStatus
): Promise<void> => {
  const docRef = doc(db, RECEIPTS_COLLECTION, receiptId);
  await updateDoc(docRef, { status });
};

/**
 * Mark receipt as sent
 */
export const markReceiptSent = async (
  receiptId: string,
  sentTo: string
): Promise<void> => {
  const docRef = doc(db, RECEIPTS_COLLECTION, receiptId);
  await updateDoc(docRef, {
    status: 'sent',
    sentAt: Date.now(),
    sentTo,
  });
};

/**
 * Void a receipt
 */
export const voidReceipt = async (
  receiptId: string,
  reason: string
): Promise<void> => {
  const docRef = doc(db, RECEIPTS_COLLECTION, receiptId);
  await updateDoc(docRef, {
    status: 'voided',
    voidedAt: Date.now(),
    voidReason: reason,
  });
};

/**
 * Set receipt PDF URL
 */
export const setReceiptPdfUrl = async (
  receiptId: string,
  pdfUrl: string
): Promise<void> => {
  const docRef = doc(db, RECEIPTS_COLLECTION, receiptId);
  await updateDoc(docRef, { pdfUrl });
};

// ============================================
// RECEIPT TEMPLATE DATA GENERATION
// ============================================

/**
 * Build template data for receipt generation
 */
export const buildReceiptTemplateData = (
  input: GenerateReceiptInput,
  receiptNumber: string,
  branding?: ClubBranding
): ReceiptTemplateData => {
  const now = new Date();
  const currencySymbol = getCurrencySymbol(input.currency);
  
  // Calculate totals
  const subtotal = input.items.reduce((sum, item) => sum + (item.amount * (item.quantity || 1)), 0);
  const discounts = input.items
    .filter(item => item.type === 'discount')
    .reduce((sum, item) => sum + Math.abs(item.amount), 0);
  
  return {
    receiptNumber,
    receiptDate: formatDate(now),
    receiptTime: formatTime(now),
    
    // Customer
    customerName: input.userName || 'Customer',
    customerEmail: input.userEmail,
    
    // Club/Seller
    clubName: branding?.clubName,
    clubLogo: branding?.logoUrl,
    clubAddress: branding?.address,
    clubPhone: branding?.phone,
    clubEmail: branding?.email,
    clubGstNumber: branding?.gstNumber,
    
    // Transaction
    transactionType: getTransactionTypeLabel(input.type),
    referenceType: getReferenceTypeLabel(input.referenceType),
    referenceName: input.referenceName,
    paymentMethod: input.paymentMethod || 'Card',
    cardLast4: input.cardLast4,
    
    // Line items
    items: input.items.map(item => ({
      description: item.label,
      quantity: item.quantity || 1,
      unitPrice: formatAmount(item.amount, currencySymbol),
      total: formatAmount(item.amount * (item.quantity || 1), currencySymbol),
    })),
    
    // Totals
    subtotal: formatAmount(subtotal, currencySymbol),
    discounts: discounts > 0 ? formatAmount(discounts, currencySymbol) : undefined,
    taxLabel: input.taxRate ? `GST (${input.taxRate}%)` : undefined,
    taxAmount: input.taxAmount ? formatAmount(input.taxAmount, currencySymbol) : undefined,
    platformFee: input.platformFee ? formatAmount(input.platformFee, currencySymbol) : undefined,
    total: formatAmount(input.amount, currencySymbol),
    
    // Currency
    currency: input.currency.toUpperCase(),
    currencySymbol,
    
    // Footer
    notes: input.notes,
    termsUrl: branding?.termsUrl,
    supportEmail: branding?.supportEmail || branding?.email,
  };
};

/**
 * Generate receipt from a transaction
 */
export const generateReceiptFromTransaction = async (
  transaction: Transaction,
  userName?: string,
  userEmail?: string,
  branding?: ClubBranding
): Promise<Receipt> => {
  // Convert breakdown to receipt items
  const items: ReceiptItem[] = transaction.breakdown.items.map(item => ({
    label: item.label,
    amount: item.amount,
    type: item.type,
    quantity: 1,
  }));
  
  const input: GenerateReceiptInput = {
    referenceId: transaction.id,
    type: transaction.type === 'refund' ? 'refund' : 
          transaction.type === 'topup' ? 'topup' : 'payment',
    userId: transaction.odUserId,
    userEmail,
    userName,
    clubId: transaction.odClubId,
    amount: Math.abs(transaction.amount),
    currency: transaction.currency,
    items,
    taxAmount: transaction.taxAmount,
    platformFee: transaction.platformFee,
    referenceType: transaction.referenceType,
    referenceName: transaction.referenceName,
    paymentMethod: transaction.paymentMethod,
    branding,
  };
  
  return createReceipt(input);
};

/**
 * Generate receipt from a payment
 */
export const generateReceiptFromPayment = async (
  payment: Payment,
  userName?: string,
  userEmail?: string,
  branding?: ClubBranding
): Promise<Receipt> => {
  // Convert breakdown to receipt items
  const items: ReceiptItem[] = payment.breakdown.items.map(item => ({
    label: item.label,
    amount: item.amount,
    type: item.type,
    quantity: 1,
  }));
  
  const input: GenerateReceiptInput = {
    referenceId: payment.id,
    type: 'payment',
    userId: payment.odUserId,
    userEmail,
    userName,
    clubId: payment.odClubId,
    amount: payment.amount,
    currency: payment.currency,
    items,
    taxAmount: payment.taxAmount,
    platformFee: payment.platformFee,
    referenceType: payment.referenceType,
    referenceName: payment.referenceName,
    branding,
  };
  
  return createReceipt(input);
};

/**
 * Generate receipt from a refund
 */
export const generateReceiptFromRefund = async (
  refund: Refund,
  userName?: string,
  userEmail?: string,
  branding?: ClubBranding
): Promise<Receipt> => {
  const items: ReceiptItem[] = [
    {
      label: `Refund - ${refund.referenceName}`,
      amount: refund.refundAmount,
      type: 'charge',
      quantity: 1,
    },
  ];
  
  if (refund.cancellationFee && refund.cancellationFee > 0) {
    items.push({
      label: 'Cancellation Fee',
      amount: -refund.cancellationFee,
      type: 'fee',
      quantity: 1,
    });
  }
  
  const input: GenerateReceiptInput = {
    referenceId: refund.id,
    type: 'refund',
    userId: refund.odUserId,
    userEmail,
    userName,
    clubId: refund.odClubId,
    amount: refund.refundAmount,
    currency: refund.currency,
    items,
    referenceType: refund.referenceType,
    referenceName: refund.referenceName,
    branding,
    notes: `Refund reason: ${refund.reason}`,
  };
  
  return createReceipt(input);
};

// ============================================
// HTML RECEIPT GENERATION
// ============================================

/**
 * Generate HTML receipt content
 */
export const generateReceiptHtml = (
  data: ReceiptTemplateData
): string => {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Receipt ${data.receiptNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #333;
      background: #f5f5f5;
      padding: 20px;
    }
    .receipt {
      max-width: 600px;
      margin: 0 auto;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .header {
      background: #1a1a2e;
      color: white;
      padding: 24px;
      text-align: center;
    }
    .header h1 { font-size: 24px; margin-bottom: 8px; }
    .header .receipt-number { opacity: 0.8; font-size: 14px; }
    .logo { max-width: 150px; margin-bottom: 16px; }
    .content { padding: 24px; }
    .section { margin-bottom: 24px; }
    .section-title {
      font-size: 12px;
      text-transform: uppercase;
      color: #666;
      margin-bottom: 8px;
      letter-spacing: 0.5px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
    }
    .info-label { color: #666; }
    .info-value { font-weight: 500; }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
    }
    .items-table th {
      text-align: left;
      padding: 12px 8px;
      border-bottom: 2px solid #eee;
      font-size: 12px;
      text-transform: uppercase;
      color: #666;
    }
    .items-table td {
      padding: 12px 8px;
      border-bottom: 1px solid #eee;
    }
    .items-table .amount { text-align: right; }
    .totals {
      background: #f9f9f9;
      padding: 16px;
      border-radius: 8px;
      margin-top: 16px;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
    }
    .total-row.grand-total {
      border-top: 2px solid #ddd;
      margin-top: 8px;
      padding-top: 16px;
      font-size: 18px;
      font-weight: 600;
    }
    .footer {
      text-align: center;
      padding: 24px;
      color: #666;
      font-size: 12px;
      border-top: 1px solid #eee;
    }
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 500;
      background: #4CAF50;
      color: white;
    }
    @media print {
      body { background: white; padding: 0; }
      .receipt { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      ${data.clubLogo ? `<img src="${data.clubLogo}" alt="Logo" class="logo">` : ''}
      <h1>${data.clubName || 'Receipt'}</h1>
      <div class="receipt-number">${data.receiptNumber}</div>
    </div>
    
    <div class="content">
      <div class="section">
        <div class="info-row">
          <span class="info-label">Date</span>
          <span class="info-value">${data.receiptDate} at ${data.receiptTime}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Customer</span>
          <span class="info-value">${data.customerName}</span>
        </div>
        ${data.customerEmail ? `
        <div class="info-row">
          <span class="info-label">Email</span>
          <span class="info-value">${data.customerEmail}</span>
        </div>
        ` : ''}
        <div class="info-row">
          <span class="info-label">Transaction Type</span>
          <span class="info-value">${data.transactionType}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Payment Method</span>
          <span class="info-value">${data.paymentMethod}${data.cardLast4 ? ` •••• ${data.cardLast4}` : ''}</span>
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">Items</div>
        <table class="items-table">
          <thead>
            <tr>
              <th>Description</th>
              <th class="amount">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${data.items.map(item => `
            <tr>
              <td>${item.description}${item.quantity > 1 ? ` (x${item.quantity})` : ''}</td>
              <td class="amount">${item.total}</td>
            </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      
      <div class="totals">
        <div class="total-row">
          <span>Subtotal</span>
          <span>${data.subtotal}</span>
        </div>
        ${data.discounts ? `
        <div class="total-row">
          <span>Discounts</span>
          <span>-${data.discounts}</span>
        </div>
        ` : ''}
        ${data.taxAmount ? `
        <div class="total-row">
          <span>${data.taxLabel || 'Tax'}</span>
          <span>${data.taxAmount}</span>
        </div>
        ` : ''}
        <div class="total-row grand-total">
          <span>Total</span>
          <span>${data.total} ${data.currency}</span>
        </div>
      </div>
      
      ${data.notes ? `
      <div class="section">
        <div class="section-title">Notes</div>
        <p>${data.notes}</p>
      </div>
      ` : ''}
    </div>
    
    <div class="footer">
      ${data.clubGstNumber ? `<p>GST Number: ${data.clubGstNumber}</p>` : ''}
      ${data.clubAddress ? `<p>${data.clubAddress}</p>` : ''}
      ${data.supportEmail ? `<p>Questions? Contact ${data.supportEmail}</p>` : ''}
      <p style="margin-top: 16px;">Thank you for your business!</p>
    </div>
  </div>
</body>
</html>
  `.trim();
};

// ============================================
// RECEIPT STATISTICS
// ============================================

/**
 * Get receipt statistics for a club
 */
export const getClubReceiptStats = async (
  clubId: string,
  startDate: number,
  endDate: number
): Promise<{
  totalReceipts: number;
  totalAmount: number;
  byType: Record<string, { count: number; amount: number }>;
  byReferenceType: Record<string, { count: number; amount: number }>;
}> => {
  const q = query(
    collection(db, RECEIPTS_COLLECTION),
    where('odClubId', '==', clubId),
    where('createdAt', '>=', startDate),
    where('createdAt', '<=', endDate)
  );
  
  const snap = await getDocs(q);
  const receipts = snap.docs.map(d => ({ id: d.id, ...d.data() } as Receipt));
  
  const validReceipts = receipts.filter(r => r.status !== 'voided');
  const totalAmount = validReceipts.reduce((sum, r) => sum + r.amount, 0);
  
  const byType: Record<string, { count: number; amount: number }> = {};
  const byReferenceType: Record<string, { count: number; amount: number }> = {};
  
  for (const receipt of validReceipts) {
    // By type
    if (!byType[receipt.type]) {
      byType[receipt.type] = { count: 0, amount: 0 };
    }
    byType[receipt.type].count++;
    byType[receipt.type].amount += receipt.amount;
    
    // By reference type
    if (!byReferenceType[receipt.referenceType]) {
      byReferenceType[receipt.referenceType] = { count: 0, amount: 0 };
    }
    byReferenceType[receipt.referenceType].count++;
    byReferenceType[receipt.referenceType].amount += receipt.amount;
  }
  
  return {
    totalReceipts: validReceipts.length,
    totalAmount,
    byType,
    byReferenceType,
  };
};

/**
 * Get user's receipt summary
 */
export const getUserReceiptSummary = async (
  userId: string,
  year?: number
): Promise<{
  totalReceipts: number;
  totalSpent: number;
  totalRefunded: number;
  byMonth: Record<string, number>;
}> => {
  const targetYear = year || new Date().getFullYear();
  const startDate = new Date(targetYear, 0, 1).getTime();
  const endDate = new Date(targetYear, 11, 31, 23, 59, 59).getTime();
  
  const q = query(
    collection(db, RECEIPTS_COLLECTION),
    where('odUserId', '==', userId),
    where('createdAt', '>=', startDate),
    where('createdAt', '<=', endDate)
  );
  
  const snap = await getDocs(q);
  const receipts = snap.docs.map(d => ({ id: d.id, ...d.data() } as Receipt));
  
  const validReceipts = receipts.filter(r => r.status !== 'voided');
  const payments = validReceipts.filter(r => r.type === 'payment' || r.type === 'topup');
  const refunds = validReceipts.filter(r => r.type === 'refund');
  
  const totalSpent = payments.reduce((sum, r) => sum + r.amount, 0);
  const totalRefunded = refunds.reduce((sum, r) => sum + r.amount, 0);
  
  // Group by month
  const byMonth: Record<string, number> = {};
  for (const receipt of payments) {
    const date = new Date(receipt.createdAt);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    byMonth[monthKey] = (byMonth[monthKey] || 0) + receipt.amount;
  }
  
  return {
    totalReceipts: validReceipts.length,
    totalSpent,
    totalRefunded,
    byMonth,
  };
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get currency symbol
 */
export const getCurrencySymbol = (currency: SupportedCurrency): string => {
  const symbols: Record<SupportedCurrency, string> = {
    nzd: 'NZ$',
    aud: 'A$',
    usd: '$',
  };
  return symbols[currency] || '$';
};

/**
 * Format amount for display
 */
export const formatAmount = (
  amount: number,
  symbol: string = '$'
): string => {
  const dollars = Math.abs(amount) / 100;
  const formatted = dollars.toFixed(2);
  return amount < 0 ? `-${symbol}${formatted}` : `${symbol}${formatted}`;
};

/**
 * Format date for receipt
 */
export const formatDate = (date: Date): string => {
  return date.toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

/**
 * Format time for receipt
 */
export const formatTime = (date: Date): string => {
  return date.toLocaleTimeString('en-NZ', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Get transaction type label
 */
export const getTransactionTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    payment: 'Payment',
    refund: 'Refund',
    topup: 'Wallet Top-up',
    payout: 'Payout',
  };
  return labels[type] || type;
};

/**
 * Get reference type label
 */
export const getReferenceTypeLabel = (type: ReferenceType): string => {
  const labels: Record<ReferenceType, string> = {
    court_booking: 'Court Booking',
    tournament: 'Tournament Registration',
    league: 'League Membership',
    annual_pass: 'Annual Pass',
    wallet_topup: 'Wallet Top-up',
    membership: 'Club Membership',
    visitor_fee: 'Visitor Fee',
  };
  return labels[type] || type;
};

/**
 * Get receipt type label
 */
export const getReceiptTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    payment: 'Payment Receipt',
    refund: 'Refund Receipt',
    topup: 'Top-up Receipt',
    payout: 'Payout Receipt',
  };
  return labels[type] || 'Receipt';
};

/**
 * Get receipt status color
 */
export const getReceiptStatusColor = (status: ReceiptStatus): string => {
  const colors: Record<ReceiptStatus, string> = {
    draft: 'gray',
    generated: 'blue',
    sent: 'green',
    voided: 'red',
  };
  return colors[status] || 'gray';
};

/**
 * Check if receipt can be voided
 */
export const canVoidReceipt = (receipt: Receipt): boolean => {
  // Can only void receipts that aren't already voided
  // and were created within the last 30 days
  if (receipt.status === 'voided') {
    return false;
  }
  
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  return receipt.createdAt > thirtyDaysAgo;
};

/**
 * Generate receipt filename
 */
export const generateReceiptFilename = (
  receiptNumber: string,
  format: 'pdf' | 'html' = 'pdf'
): string => {
  const sanitized = receiptNumber.replace(/[^a-zA-Z0-9-]/g, '_');
  return `receipt_${sanitized}.${format}`;
};

// ============================================
// CLOUD FUNCTION WRAPPERS (V07.51)
// ============================================

import { getFunctions, httpsCallable } from '@firebase/functions';

/**
 * Resend a receipt email via Cloud Function
 *
 * @param receiptId - The ID of the receipt to resend
 * @returns Promise that resolves when email is sent
 */
export const resendReceipt = async (receiptId: string): Promise<void> => {
  const functions = getFunctions();
  const resendFn = httpsCallable(functions, 'receipt_resend');
  await resendFn({ receiptId });
};