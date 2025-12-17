/**
 * Payment Components - Main Entry Point
 * 
 * Re-exports all payment-related React components.
 * 
 * FILE LOCATION: components/payments/index.ts
 */

// ============================================
// WALLET COMPONENTS
// ============================================

export {
  WalletCard,
  walletCardStyles,
  type WalletCardProps,
} from './WalletCard';

// ============================================
// TRANSACTION COMPONENTS
// ============================================

export {
  TransactionList,
  transactionListStyles,
  type TransactionListProps,
} from './TransactionList';

// ============================================
// PAYMENT COMPONENTS
// ============================================

export {
  PaymentForm,
  paymentFormStyles,
  type PaymentFormProps,
} from './PaymentForm';

// ============================================
// ANNUAL PASS COMPONENTS
// ============================================

export {
  AnnualPassCard,
  annualPassCardStyles,
  type AnnualPassCardProps,
} from './AnnualPassCard';

// ============================================
// REFUND COMPONENTS
// ============================================

export {
  RefundRequestForm,
  refundRequestFormStyles,
  type RefundRequestFormProps,
} from './RefundRequestForm';

// ============================================
// PRICING COMPONENTS
// ============================================

export {
  PricingDisplay,
  MultiSlotPricingDisplay,
  pricingDisplayStyles,
  type PricingDisplayProps,
  type MultiSlotPricingDisplayProps,
} from './PricingDisplay';

// ============================================
// RECEIPT COMPONENTS
// ============================================

export {
  ReceiptViewer,
  ReceiptListItem,
  receiptViewerStyles,
  type ReceiptViewerProps,
  type ReceiptListItemProps,
} from './ReceiptViewer';

// ============================================
// COMBINED STYLES
// ============================================

/**
 * All payment component styles combined.
 * Import and add to your global stylesheet or use with styled-jsx.
 */
export const allPaymentStyles = `
${walletCardStyles}
${transactionListStyles}
${paymentFormStyles}
${annualPassCardStyles}
${refundRequestFormStyles}
${pricingDisplayStyles}
${receiptViewerStyles}
`;

// Re-import for combined export
import { walletCardStyles } from './WalletCard';
import { transactionListStyles } from './TransactionList';
import { paymentFormStyles } from './PaymentForm';
import { annualPassCardStyles } from './AnnualPassCard';
import { refundRequestFormStyles } from './RefundRequestForm';
import { pricingDisplayStyles } from './PricingDisplay';
import { receiptViewerStyles } from './ReceiptViewer';