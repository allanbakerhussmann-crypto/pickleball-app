/**
 * BankDetailsDisplay Component
 *
 * Read-only display of bank details for players making bank transfers.
 * Includes copy-to-clipboard functionality for account number.
 *
 * Used by:
 * - League Registration flow
 * - Weekly Meetup Registration flow
 *
 * @version 07.57
 * @file components/payments/BankDetailsDisplay.tsx
 */

import React, { useState } from 'react';
import type { BankDetails } from '../../types';

interface BankDetailsDisplayProps {
  bankDetails: BankDetails;
  /** Suggested reference prefix (e.g., player name) */
  referencePrefix?: string;
  /** Amount to pay */
  amount?: number;
  /** Currency for formatting */
  currency?: 'nzd' | 'aud' | 'usd';
}

const formatCurrency = (cents: number, currency: string = 'nzd'): string => {
  const symbol = currency === 'usd' ? 'US$' : currency === 'aud' ? 'A$' : '$';
  return `${symbol}${(cents / 100).toFixed(2)}`;
};

export const BankDetailsDisplay: React.FC<BankDetailsDisplayProps> = ({
  bankDetails,
  referencePrefix,
  amount,
  currency = 'nzd',
}) => {
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(field);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const suggestedReference = referencePrefix
    ? `${referencePrefix}${bankDetails.reference ? ` - ${bankDetails.reference}` : ''}`
    : bankDetails.reference || '';

  return (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
      <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
        <svg className="w-5 h-5 text-lime-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
        Bank Transfer Details
      </h3>

      <div className="space-y-4">
        {/* Amount to pay */}
        {amount && (
          <div className="p-3 bg-lime-600/20 border border-lime-500/30 rounded-lg">
            <div className="text-sm text-lime-300">Amount to pay</div>
            <div className="text-2xl font-bold text-lime-400">{formatCurrency(amount, currency)}</div>
          </div>
        )}

        {/* Bank Name */}
        <div className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
          <div>
            <div className="text-sm text-gray-400">Bank</div>
            <div className="text-white font-medium">{bankDetails.bankName || '-'}</div>
          </div>
        </div>

        {/* Account Name */}
        <div className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
          <div>
            <div className="text-sm text-gray-400">Account Name</div>
            <div className="text-white font-medium">{bankDetails.accountName || '-'}</div>
          </div>
        </div>

        {/* Account Number - with copy button */}
        <div className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
          <div>
            <div className="text-sm text-gray-400">Account Number</div>
            <div className="text-white font-medium font-mono">{bankDetails.accountNumber || '-'}</div>
          </div>
          {bankDetails.accountNumber && (
            <button
              onClick={() => handleCopy(bankDetails.accountNumber!, 'account')}
              className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white rounded-lg text-sm transition-colors flex items-center gap-1"
            >
              {copied === 'account' ? (
                <>
                  <svg className="w-4 h-4 text-lime-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Copied
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy
                </>
              )}
            </button>
          )}
        </div>

        {/* Reference */}
        {suggestedReference && (
          <div className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
            <div>
              <div className="text-sm text-gray-400">Reference (use this)</div>
              <div className="text-white font-medium">{suggestedReference}</div>
            </div>
            <button
              onClick={() => handleCopy(suggestedReference, 'reference')}
              className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white rounded-lg text-sm transition-colors flex items-center gap-1"
            >
              {copied === 'reference' ? (
                <>
                  <svg className="w-4 h-4 text-lime-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Copied
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy
                </>
              )}
            </button>
          </div>
        )}

        {/* Instructions */}
        <div className="p-3 bg-blue-900/30 border border-blue-700/50 rounded-lg text-blue-300 text-sm">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              After making the transfer, the organizer will confirm your payment.
              This may take 1-2 business days.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BankDetailsDisplay;
