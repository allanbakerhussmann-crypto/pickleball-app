/**
 * PendingPaymentsList Component
 *
 * Reusable list showing pending bank transfer payments.
 * Allows organizers to mark payments as received.
 *
 * Used by:
 * - League Finance Tab
 * - Weekly Meetup Detail (StandingMeetupDetail)
 *
 * @version 07.57
 * @file components/payments/PendingPaymentsList.tsx
 */

import React from 'react';

export interface PendingPaymentItem {
  id: string;
  displayName: string;
  amount: number;
  reference?: string;
  /** Optional extra info like registration date */
  subtitle?: string;
}

interface PendingPaymentsListProps {
  items: PendingPaymentItem[];
  onMarkAsPaid: (id: string, amount: number) => Promise<void>;
  markingPaidId: string | null;
  formatCurrency: (cents: number) => string;
  /** Custom title (default: "Pending Payments") */
  title?: string;
}

export const PendingPaymentsList: React.FC<PendingPaymentsListProps> = ({
  items,
  onMarkAsPaid,
  markingPaidId,
  formatCurrency,
  title = 'Pending Payments',
}) => {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="bg-gray-800 rounded-xl p-5 border border-yellow-500/30">
      <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
        <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {title} ({items.length})
      </h3>
      <div className="space-y-2">
        {items.map((item) => {
          const isMarking = markingPaidId === item.id;
          return (
            <div
              key={item.id}
              className="flex items-center justify-between bg-gray-700/50 rounded-lg p-3"
            >
              <div>
                <div className="text-white font-medium">{item.displayName}</div>
                <div className="text-sm text-gray-400">
                  {formatCurrency(item.amount)}
                  {item.reference && (
                    <span className="ml-2 text-gray-500">Ref: {item.reference}</span>
                  )}
                </div>
                {item.subtitle && (
                  <div className="text-xs text-gray-500 mt-1">{item.subtitle}</div>
                )}
              </div>
              <button
                onClick={() => onMarkAsPaid(item.id, item.amount)}
                disabled={isMarking}
                className="px-4 py-2 bg-lime-600 hover:bg-lime-500 disabled:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                {isMarking ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Marking...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Mark as Paid
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PendingPaymentsList;
