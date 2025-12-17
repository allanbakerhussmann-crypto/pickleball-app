/**
 * ReceiptViewer Component
 * 
 * Displays and allows download/print of receipts.
 * 
 * FILE LOCATION: components/payments/ReceiptViewer.tsx
 */

import React from 'react';
import { useReceipt } from '../../hooks/payments';
import type { Receipt, ClubBranding, SupportedCurrency } from '../../services/firebase/payments';

// ============================================
// TYPES
// ============================================

export interface ReceiptViewerProps {
  receipt: Receipt;
  branding?: ClubBranding;
  showActions?: boolean;
  onClose?: () => void;
  className?: string;
}

export interface ReceiptListItemProps {
  receipt: Receipt;
  onClick?: (receipt: Receipt) => void;
  className?: string;
}

// ============================================
// RECEIPT VIEWER COMPONENT
// ============================================

export const ReceiptViewer: React.FC<ReceiptViewerProps> = ({
  receipt,
  branding,
  showActions = true,
  onClose,
  className = '',
}) => {
  const {
    downloadReceipt,
    printReceipt,
    getTypeLabel,
    getStatusColor,
    formatReceiptAmount,
  } = useReceipt({});

  const handleDownload = () => {
    downloadReceipt(receipt, branding);
  };

  const handlePrint = () => {
    printReceipt(receipt, branding);
  };

  const statusColors: Record<string, string> = {
    green: '#16a34a',
    blue: '#2563eb',
    red: '#dc2626',
    gray: '#6b7280',
  };

  const statusColor = getStatusColor(receipt.status as any);

  return (
    <div className={`receipt-viewer ${className}`}>
      <div className="receipt-viewer__header">
        <div className="receipt-viewer__header-content">
          <h3 className="receipt-viewer__title">{getTypeLabel(receipt.type)}</h3>
          <span className="receipt-viewer__number">{receipt.receiptNumber}</span>
        </div>
        {onClose && (
          <button className="receipt-viewer__close" onClick={onClose}>
            ✕
          </button>
        )}
      </div>

      <div className="receipt-viewer__body">
        {/* Status */}
        <div className="receipt-viewer__status-row">
          <span 
            className="receipt-viewer__status"
            style={{ 
              backgroundColor: `${statusColors[statusColor]}20`, 
              color: statusColors[statusColor] 
            }}
          >
            {receipt.status.charAt(0).toUpperCase() + receipt.status.slice(1)}
          </span>
          <span className="receipt-viewer__date">
            {formatDate(receipt.createdAt)}
          </span>
        </div>

        {/* Reference */}
        <div className="receipt-viewer__section">
          <span className="receipt-viewer__section-label">For</span>
          <span className="receipt-viewer__section-value">{receipt.referenceName}</span>
        </div>

        {/* Items */}
        <div className="receipt-viewer__items">
          <div className="receipt-viewer__items-header">
            <span>Item</span>
            <span>Amount</span>
          </div>
          {receipt.items.map((item, index) => (
            <div key={index} className="receipt-viewer__item">
              <span className="receipt-viewer__item-label">{item.label}</span>
              <span className={`receipt-viewer__item-amount ${item.type === 'discount' ? 'receipt-viewer__item-amount--discount' : ''}`}>
                {item.type === 'discount' ? '-' : ''}
                {formatReceiptAmount(Math.abs(item.amount), receipt.currency)}
              </span>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="receipt-viewer__totals">
          {receipt.taxAmount && receipt.taxAmount > 0 && (
            <div className="receipt-viewer__total-row">
              <span>Tax ({receipt.taxRate}%)</span>
              <span>{formatReceiptAmount(receipt.taxAmount, receipt.currency)}</span>
            </div>
          )}
          <div className="receipt-viewer__total-row receipt-viewer__total-row--main">
            <span>Total</span>
            <span>{formatReceiptAmount(receipt.amount, receipt.currency)}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      {showActions && (
        <div className="receipt-viewer__actions">
          <button 
            className="receipt-viewer__btn receipt-viewer__btn--secondary"
            onClick={handleDownload}
          >
            📥 Download
          </button>
          <button 
            className="receipt-viewer__btn receipt-viewer__btn--secondary"
            onClick={handlePrint}
          >
            🖨️ Print
          </button>
        </div>
      )}
    </div>
  );
};

// ============================================
// RECEIPT LIST ITEM COMPONENT
// ============================================

export const ReceiptListItem: React.FC<ReceiptListItemProps> = ({
  receipt,
  onClick,
  className = '',
}) => {
  const { getTypeLabel, formatReceiptAmount } = useReceipt({});

  return (
    <div 
      className={`receipt-list-item ${onClick ? 'receipt-list-item--clickable' : ''} ${className}`}
      onClick={() => onClick?.(receipt)}
    >
      <div className="receipt-list-item__icon">
        {getReceiptIcon(receipt.type)}
      </div>
      
      <div className="receipt-list-item__details">
        <span className="receipt-list-item__name">{receipt.referenceName}</span>
        <span className="receipt-list-item__meta">
          {getTypeLabel(receipt.type)} • {receipt.receiptNumber}
        </span>
      </div>
      
      <div className="receipt-list-item__right">
        <span className="receipt-list-item__amount">
          {formatReceiptAmount(receipt.amount, receipt.currency)}
        </span>
        <span className="receipt-list-item__date">
          {formatShortDate(receipt.createdAt)}
        </span>
      </div>
    </div>
  );
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShortDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'short',
  });
}

function getReceiptIcon(type: string): string {
  const icons: Record<string, string> = {
    payment: '🧾',
    refund: '↩️',
    topup: '💰',
    payout: '🏦',
  };
  return icons[type] || '📄';
}

// ============================================
// STYLES
// ============================================

export const receiptViewerStyles = `
.receipt-viewer {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  max-width: 400px;
}

.receipt-viewer__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 20px;
  background: #1a1a2e;
  color: white;
}

.receipt-viewer__title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 4px 0;
}

.receipt-viewer__number {
  font-size: 14px;
  opacity: 0.8;
}

.receipt-viewer__close {
  background: none;
  border: none;
  color: white;
  font-size: 20px;
  cursor: pointer;
  opacity: 0.8;
  padding: 0;
  line-height: 1;
}

.receipt-viewer__close:hover {
  opacity: 1;
}

.receipt-viewer__body {
  padding: 20px;
}

.receipt-viewer__status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.receipt-viewer__status {
  font-size: 12px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 12px;
}

.receipt-viewer__date {
  font-size: 14px;
  color: #666;
}

.receipt-viewer__section {
  margin-bottom: 16px;
}

.receipt-viewer__section-label {
  display: block;
  font-size: 12px;
  color: #999;
  text-transform: uppercase;
  margin-bottom: 4px;
}

.receipt-viewer__section-value {
  font-size: 16px;
  color: #333;
  font-weight: 500;
}

.receipt-viewer__items {
  background: #f9f9f9;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
}

.receipt-viewer__items-header {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #999;
  text-transform: uppercase;
  padding-bottom: 8px;
  border-bottom: 1px solid #e0e0e0;
  margin-bottom: 8px;
}

.receipt-viewer__item {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 14px;
}

.receipt-viewer__item-label {
  color: #333;
}

.receipt-viewer__item-amount {
  font-weight: 500;
  color: #333;
}

.receipt-viewer__item-amount--discount {
  color: #16a34a;
}

.receipt-viewer__totals {
  border-top: 1px solid #eee;
  padding-top: 12px;
}

.receipt-viewer__total-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 14px;
  color: #666;
}

.receipt-viewer__total-row--main {
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.receipt-viewer__actions {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  background: #f9f9f9;
  border-top: 1px solid #eee;
}

.receipt-viewer__btn {
  flex: 1;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.receipt-viewer__btn--secondary {
  background: white;
  color: #333;
  border: 1px solid #ddd;
}

.receipt-viewer__btn--secondary:hover {
  background: #f5f5f5;
}

/* Receipt List Item Styles */
.receipt-list-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: white;
  border-bottom: 1px solid #f0f0f0;
  transition: background 0.2s;
}

.receipt-list-item--clickable {
  cursor: pointer;
}

.receipt-list-item--clickable:hover {
  background: #f9f9f9;
}

.receipt-list-item__icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
  border-radius: 10px;
  font-size: 18px;
}

.receipt-list-item__details {
  flex: 1;
  min-width: 0;
}

.receipt-list-item__name {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.receipt-list-item__meta {
  display: block;
  font-size: 12px;
  color: #999;
  margin-top: 2px;
}

.receipt-list-item__right {
  text-align: right;
}

.receipt-list-item__amount {
  display: block;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.receipt-list-item__date {
  display: block;
  font-size: 12px;
  color: #999;
  margin-top: 2px;
}
`;

export default ReceiptViewer;