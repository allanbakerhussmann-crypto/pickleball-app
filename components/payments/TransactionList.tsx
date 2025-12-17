/**
 * TransactionList Component
 * 
 * Displays transaction history with filtering.
 * 
 * FILE LOCATION: components/payments/TransactionList.tsx
 */

import React, { useState } from 'react';
import { useTransactions, type TransactionFilters } from '../../hooks/payments';
import type { Transaction, TransactionType, SupportedCurrency } from '../../services/firebase/payments';

// ============================================
// TYPES
// ============================================

export interface TransactionListProps {
  userId?: string;
  clubId?: string;
  walletId?: string;
  limit?: number;
  showFilters?: boolean;
  showSummary?: boolean;
  onTransactionClick?: (transaction: Transaction) => void;
  emptyMessage?: string;
  className?: string;
}

// ============================================
// SUB-COMPONENTS
// ============================================

interface TransactionItemProps {
  transaction: Transaction;
  onClick?: (transaction: Transaction) => void;
}

const TransactionItem: React.FC<TransactionItemProps> = ({ transaction, onClick }) => {
  const isCredit = transaction.amount > 0;
  const formattedAmount = formatTransactionAmount(transaction.amount, transaction.currency);
  const formattedDate = new Date(transaction.createdAt).toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const formattedTime = new Date(transaction.createdAt).toLocaleTimeString('en-NZ', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div 
      className={`transaction-item ${onClick ? 'transaction-item--clickable' : ''}`}
      onClick={() => onClick?.(transaction)}
    >
      <div className="transaction-item__icon">
        {getTransactionIcon(transaction.type)}
      </div>
      
      <div className="transaction-item__details">
        <span className="transaction-item__name">{transaction.referenceName}</span>
        <span className="transaction-item__meta">
          {getTransactionTypeLabel(transaction.type)} • {formattedDate} at {formattedTime}
        </span>
      </div>
      
      <div className={`transaction-item__amount ${isCredit ? 'transaction-item__amount--credit' : 'transaction-item__amount--debit'}`}>
        {isCredit ? '+' : ''}{formattedAmount}
      </div>
      
      <div className={`transaction-item__status transaction-item__status--${transaction.status}`}>
        {getStatusLabel(transaction.status)}
      </div>
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

export const TransactionList: React.FC<TransactionListProps> = ({
  userId,
  clubId,
  walletId,
  limit = 20,
  showFilters = true,
  showSummary = false,
  onTransactionClick,
  emptyMessage = 'No transactions yet',
  className = '',
}) => {
  const [filterType, setFilterType] = useState<TransactionType | ''>('');
  
  const filters: TransactionFilters = filterType ? { type: filterType as TransactionType } : {};
  
  const {
    transactions,
    loading,
    error,
    hasMore,
    summary,
    loadMore,
    setFilters,
    clearFilters,
  } = useTransactions({
    userId,
    clubId,
    walletId,
    filters,
    limit,
    realtime: true,
  });

  const handleFilterChange = (type: string) => {
    setFilterType(type as TransactionType | '');
    if (type) {
      setFilters({ type: type as TransactionType });
    } else {
      clearFilters();
    }
  };

  if (error) {
    return (
      <div className={`transaction-list transaction-list--error ${className}`}>
        <p className="transaction-list__error">Failed to load transactions</p>
      </div>
    );
  }

  return (
    <div className={`transaction-list ${className}`}>
      {showFilters && (
        <div className="transaction-list__filters">
          <select 
            className="transaction-list__filter-select"
            value={filterType}
            onChange={(e) => handleFilterChange(e.target.value)}
          >
            <option value="">All Transactions</option>
            <option value="payment">Payments</option>
            <option value="refund">Refunds</option>
            <option value="topup">Top-ups</option>
            <option value="payout">Payouts</option>
          </select>
        </div>
      )}

      {showSummary && summary && (
        <div className="transaction-list__summary">
          <div className="transaction-list__summary-item">
            <span className="transaction-list__summary-label">Total</span>
            <span className="transaction-list__summary-value">{summary.totalCount}</span>
          </div>
          <div className="transaction-list__summary-item">
            <span className="transaction-list__summary-label">Amount</span>
            <span className="transaction-list__summary-value">
              {formatTransactionAmount(summary.totalAmount, 'nzd')}
            </span>
          </div>
        </div>
      )}

      <div className="transaction-list__items">
        {loading && transactions.length === 0 ? (
          <div className="transaction-list__loading">
            {[1, 2, 3].map((i) => (
              <div key={i} className="transaction-item transaction-item--skeleton">
                <div className="skeleton-circle" />
                <div className="skeleton-lines">
                  <div className="skeleton-line" />
                  <div className="skeleton-line skeleton-line--short" />
                </div>
                <div className="skeleton-line skeleton-line--amount" />
              </div>
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="transaction-list__empty">
            <p>{emptyMessage}</p>
          </div>
        ) : (
          <>
            {transactions.map((tx) => (
              <TransactionItem
                key={tx.id}
                transaction={tx}
                onClick={onTransactionClick}
              />
            ))}
            
            {hasMore && (
              <button 
                className="transaction-list__load-more"
                onClick={loadMore}
                disabled={loading}
              >
                {loading ? 'Loading...' : 'Load More'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function formatTransactionAmount(amount: number, currency: SupportedCurrency): string {
  const symbols: Record<SupportedCurrency, string> = {
    nzd: 'NZ$',
    aud: 'A$',
    usd: '$',
  };
  const dollars = Math.abs(amount) / 100;
  return `${symbols[currency]}${dollars.toFixed(2)}`;
}

function getTransactionTypeLabel(type: TransactionType): string {
  const labels: Record<TransactionType, string> = {
    payment: 'Payment',
    refund: 'Refund',
    topup: 'Top-up',
    payout: 'Payout',
    transfer: 'Transfer',
    adjustment: 'Adjustment',
  };
  return labels[type] || type;
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Pending',
    processing: 'Processing',
    completed: 'Completed',
    failed: 'Failed',
    cancelled: 'Cancelled',
  };
  return labels[status] || status;
}

function getTransactionIcon(type: TransactionType): string {
  const icons: Record<TransactionType, string> = {
    payment: '💳',
    refund: '↩️',
    topup: '➕',
    payout: '🏦',
    transfer: '↔️',
    adjustment: '⚙️',
  };
  return icons[type] || '📋';
}

// ============================================
// STYLES
// ============================================

export const transactionListStyles = `
.transaction-list {
  background: white;
  border-radius: 12px;
  overflow: hidden;
}

.transaction-list--error {
  padding: 40px;
  text-align: center;
}

.transaction-list__error {
  color: #dc2626;
}

.transaction-list__filters {
  padding: 16px;
  border-bottom: 1px solid #eee;
}

.transaction-list__filter-select {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  background: white;
  cursor: pointer;
}

.transaction-list__summary {
  display: flex;
  gap: 24px;
  padding: 16px;
  background: #f9f9f9;
  border-bottom: 1px solid #eee;
}

.transaction-list__summary-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.transaction-list__summary-label {
  font-size: 12px;
  color: #666;
  text-transform: uppercase;
}

.transaction-list__summary-value {
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.transaction-list__items {
  padding: 8px 0;
}

.transaction-list__loading,
.transaction-list__empty {
  padding: 40px;
  text-align: center;
  color: #666;
}

.transaction-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid #f0f0f0;
  transition: background 0.2s;
}

.transaction-item:last-child {
  border-bottom: none;
}

.transaction-item--clickable {
  cursor: pointer;
}

.transaction-item--clickable:hover {
  background: #f9f9f9;
}

.transaction-item--skeleton {
  pointer-events: none;
}

.transaction-item__icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
  border-radius: 10px;
  font-size: 18px;
}

.transaction-item__details {
  flex: 1;
  min-width: 0;
}

.transaction-item__name {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.transaction-item__meta {
  display: block;
  font-size: 12px;
  color: #999;
  margin-top: 2px;
}

.transaction-item__amount {
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
}

.transaction-item__amount--credit {
  color: #16a34a;
}

.transaction-item__amount--debit {
  color: #333;
}

.transaction-item__status {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 12px;
  white-space: nowrap;
}

.transaction-item__status--pending {
  background: #fef3c7;
  color: #d97706;
}

.transaction-item__status--processing {
  background: #dbeafe;
  color: #2563eb;
}

.transaction-item__status--completed {
  background: #dcfce7;
  color: #16a34a;
}

.transaction-item__status--failed {
  background: #fee2e2;
  color: #dc2626;
}

.transaction-item__status--cancelled {
  background: #f3f4f6;
  color: #6b7280;
}

.transaction-list__load-more {
  display: block;
  width: calc(100% - 32px);
  margin: 16px;
  padding: 12px;
  background: #f5f5f5;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  color: #666;
  cursor: pointer;
  transition: background 0.2s;
}

.transaction-list__load-more:hover:not(:disabled) {
  background: #e8e8e8;
}

.transaction-list__load-more:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.skeleton-circle {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

.skeleton-lines {
  flex: 1;
}

.skeleton-line {
  height: 14px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
  margin-bottom: 6px;
}

.skeleton-line--short {
  width: 60%;
}

.skeleton-line--amount {
  width: 80px;
  height: 20px;
}
`;

export default TransactionList;