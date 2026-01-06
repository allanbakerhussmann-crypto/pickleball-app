/**
 * SMSCreditsCard - Display SMS credits balance with buy button
 *
 * Shows:
 * - Current SMS credits balance
 * - Low credits warning
 * - "Buy More" button to open bundle selector
 *
 * FILE LOCATION: components/sms/SMSCreditsCard.tsx
 * VERSION: 07.19
 */

import React, { useEffect, useState } from 'react';
import type { SMSCredits } from '../../types';
import {
  subscribeToSMSCredits,
  getOrCreateSMSCredits,
  getBalanceColorClass,
  isCreditsLow,
} from '../../services/firebase/smsCredits';

interface SMSCreditsCardProps {
  userId: string;
  onBuyMore?: () => void;
  compact?: boolean;  // Smaller version for headers
}

export const SMSCreditsCard: React.FC<SMSCreditsCardProps> = ({
  userId,
  onBuyMore,
  compact = false,
}) => {
  const [credits, setCredits] = useState<SMSCredits | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    // Initialize credits if they don't exist
    getOrCreateSMSCredits(userId).catch(console.error);

    // Subscribe to real-time updates
    const unsub = subscribeToSMSCredits(userId, (data) => {
      setCredits(data);
      setLoading(false);
    });

    return unsub;
  }, [userId]);

  if (loading) {
    return (
      <div className={`animate-pulse ${compact ? 'inline-flex items-center gap-2' : 'bg-gray-900 rounded-lg p-4'}`}>
        <div className={compact ? 'w-16 h-4 bg-gray-700 rounded' : 'w-24 h-6 bg-gray-700 rounded'} />
      </div>
    );
  }

  const balance = credits?.balance ?? 0;
  const colorClass = getBalanceColorClass(balance);
  const showWarning = credits && isCreditsLow(credits);

  if (compact) {
    return (
      <div className="inline-flex items-center gap-2 bg-gray-800/50 rounded-lg px-3 py-1.5">
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <span className="text-sm text-gray-400">SMS:</span>
        <span className={`font-medium ${colorClass}`}>{balance}</span>
        {showWarning && (
          <span className="text-xs text-yellow-400">(Low)</span>
        )}
        {onBuyMore && (
          <button
            onClick={onBuyMore}
            className="text-xs text-lime-400 hover:text-lime-300 ml-1"
          >
            Buy
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gray-800 rounded-lg">
            <svg className="w-6 h-6 text-lime-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <div>
            <p className="text-sm text-gray-400">SMS Credits</p>
            <p className={`text-2xl font-bold ${colorClass}`}>{balance}</p>
          </div>
        </div>

        {onBuyMore && (
          <button
            onClick={onBuyMore}
            className="px-4 py-2 bg-lime-500 hover:bg-lime-400 text-gray-900 font-medium rounded-lg transition-colors"
          >
            Buy More
          </button>
        )}
      </div>

      {showWarning && (
        <div className="mt-3 flex items-center gap-2 text-sm text-yellow-400 bg-yellow-900/20 rounded-lg px-3 py-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>Low credits - purchase more to continue sending SMS</span>
        </div>
      )}

      {balance === 0 && (
        <div className="mt-3 flex items-center gap-2 text-sm text-red-400 bg-red-900/20 rounded-lg px-3 py-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>No credits remaining - SMS sending is disabled</span>
        </div>
      )}

      {credits && (
        <div className="mt-3 pt-3 border-t border-gray-800 grid grid-cols-3 gap-2 text-sm">
          <div className="text-center">
            <p className="text-gray-500">Purchased</p>
            <p className="text-gray-300">{credits.totalPurchased}</p>
          </div>
          <div className="text-center">
            <p className="text-gray-500">Free</p>
            <p className="text-gray-300">{credits.totalFreeCredits}</p>
          </div>
          <div className="text-center">
            <p className="text-gray-500">Used</p>
            <p className="text-gray-300">{credits.totalUsed}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SMSCreditsCard;
