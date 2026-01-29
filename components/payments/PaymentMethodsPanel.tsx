/**
 * PaymentMethodsPanel Component
 *
 * Reusable payment method configuration panel for organizers.
 * Supports Stripe (card payments) and Bank Transfer options.
 *
 * Used by:
 * - League Finance Tab
 * - Weekly Meetup Create/Edit forms
 *
 * @version 07.57
 * @file components/payments/PaymentMethodsPanel.tsx
 */

import React from 'react';
import type { BankDetails } from '../../types';

interface PaymentMethodsPanelProps {
  acceptCardPayments: boolean;
  setAcceptCardPayments: (v: boolean) => void;
  acceptBankTransfer: boolean;
  setAcceptBankTransfer: (v: boolean) => void;
  bankDetails: BankDetails;
  setBankDetails: (v: BankDetails) => void;
  showBankDetails: boolean;
  setShowBankDetails: (v: boolean) => void;
  onSave?: () => Promise<void>;
  saving?: boolean;
  hasChanges?: boolean;
  /** If true, hides the save button (for inline use in forms) */
  hideSaveButton?: boolean;
}

export const PaymentMethodsPanel: React.FC<PaymentMethodsPanelProps> = ({
  acceptCardPayments,
  setAcceptCardPayments,
  acceptBankTransfer,
  setAcceptBankTransfer,
  bankDetails,
  setBankDetails,
  showBankDetails,
  setShowBankDetails,
  onSave,
  saving = false,
  hasChanges = false,
  hideSaveButton = false,
}) => {
  return (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
      <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
        <svg className="w-5 h-5 text-lime-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
        Payment Methods
      </h3>

      <div className="space-y-4">
        {/* Stripe - Always enabled (required for platform revenue) */}
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={true}
            disabled
            className="mt-1 w-4 h-4 rounded border-gray-600 bg-lime-600 text-lime-500 cursor-not-allowed"
          />
          <div>
            <div className="text-white font-medium">Accept card payments (Stripe)</div>
            <div className="text-sm text-gray-400">Players pay online with instant confirmation</div>
          </div>
        </div>

        {/* Bank Transfer Toggle */}
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={acceptBankTransfer}
            onChange={(e) => setAcceptBankTransfer(e.target.checked)}
            className="mt-1 w-4 h-4 rounded border-gray-600 bg-gray-700 text-lime-500 focus:ring-lime-500 focus:ring-offset-gray-900"
          />
          <div>
            <div className="text-white font-medium">Accept bank transfers</div>
            <div className="text-sm text-gray-400">You manually confirm payments after checking your account</div>
          </div>
        </label>

        {/* Bank Details (shown when bank transfer enabled) */}
        {acceptBankTransfer && (
          <div className="mt-4 p-4 bg-gray-700/50 rounded-lg border border-gray-600 space-y-4">
            <h4 className="text-white font-medium flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              Bank Details
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Bank Name</label>
                <input
                  type="text"
                  value={bankDetails.bankName}
                  onChange={(e) => setBankDetails({ ...bankDetails, bankName: e.target.value })}
                  placeholder="e.g., ANZ Bank"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-lime-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Account Name</label>
                <input
                  type="text"
                  value={bankDetails.accountName}
                  onChange={(e) => setBankDetails({ ...bankDetails, accountName: e.target.value })}
                  placeholder="e.g., Monday Night League"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-lime-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Account Number</label>
                <input
                  type="text"
                  value={bankDetails.accountNumber}
                  onChange={(e) => setBankDetails({ ...bankDetails, accountNumber: e.target.value })}
                  placeholder="e.g., 12-3456-7890123-00"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-lime-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Reference Instructions</label>
                <input
                  type="text"
                  value={bankDetails.reference || ''}
                  onChange={(e) => setBankDetails({ ...bankDetails, reference: e.target.value })}
                  placeholder="e.g., Use your team name"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-lime-500"
                />
              </div>
            </div>

            {/* Show bank details toggle */}
            <label className="flex items-center gap-3 cursor-pointer pt-2">
              <input
                type="checkbox"
                checked={showBankDetails}
                onChange={(e) => setShowBankDetails(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-lime-500 focus:ring-lime-500 focus:ring-offset-gray-900"
              />
              <span className="text-sm text-gray-300">Show bank details to players in registration</span>
            </label>
          </div>
        )}

        {/* Card payments always enabled - no warning needed */}

        {/* Save button */}
        {!hideSaveButton && onSave && (
          <div className="pt-2">
            <button
              onClick={onSave}
              disabled={saving || !hasChanges}
              className="px-4 py-2 bg-lime-600 hover:bg-lime-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              {saving ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </button>
            {!hasChanges && !saving && (
              <span className="ml-3 text-sm text-gray-500">No changes to save</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentMethodsPanel;
