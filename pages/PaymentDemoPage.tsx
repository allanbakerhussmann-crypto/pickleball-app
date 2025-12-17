/**
 * PaymentDemoPage
 * 
 * Demo page to preview all payment components.
 * This is for development/testing purposes only.
 * 
 * FILE LOCATION: pages/PaymentDemoPage.tsx
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Mock data for demo purposes
const mockWallet = {
  id: 'wallet-123',
  odUserId: 'user-123',
  odClubId: 'club-123',
  balance: 15000, // $150.00 in cents
  currency: 'nzd' as const,
  status: 'active' as const,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const mockTransactions = [
  {
    id: 'tx-1',
    type: 'payment' as const,
    amount: -2500,
    currency: 'nzd' as const,
    status: 'completed' as const,
    referenceName: 'Court Booking - Court 1',
    referenceType: 'court_booking' as const,
    referenceId: 'booking-123',
    createdAt: Date.now() - 86400000, // Yesterday
    paymentMethod: 'wallet' as const,
    breakdown: { items: [], subtotal: 2500, discounts: 0, fees: 0, tax: 0, total: 2500 },
  },
  {
    id: 'tx-2',
    type: 'topup' as const,
    amount: 5000,
    currency: 'nzd' as const,
    status: 'completed' as const,
    referenceName: 'Wallet Top-up',
    referenceType: 'wallet_topup' as const,
    referenceId: 'topup-123',
    createdAt: Date.now() - 172800000, // 2 days ago
    paymentMethod: 'card' as const,
    breakdown: { items: [], subtotal: 5000, discounts: 0, fees: 0, tax: 0, total: 5000 },
  },
  {
    id: 'tx-3',
    type: 'payment' as const,
    amount: -7500,
    currency: 'nzd' as const,
    status: 'completed' as const,
    referenceName: 'Tournament Entry - Summer Open',
    referenceType: 'tournament' as const,
    referenceId: 'tournament-123',
    createdAt: Date.now() - 604800000, // 1 week ago
    paymentMethod: 'card' as const,
    breakdown: { items: [], subtotal: 7500, discounts: 0, fees: 0, tax: 0, total: 7500 },
  },
];

const mockAnnualPass = {
  id: 'pass-123',
  odUserId: 'user-123',
  odClubId: 'club-123',
  status: 'active' as const,
  startDate: '2024-01-01',
  endDate: '2024-12-31',
  purchasePrice: 50000,
  currency: 'nzd' as const,
  benefits: {
    freeCourtBookings: true,
    discountPercent: 20,
    guestPasses: 5,
    priorityBooking: true,
  },
  createdAt: Date.now(),
};

const PaymentDemoPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'wallet' | 'transactions' | 'payment' | 'pass'>('wallet');

  const formatCurrency = (cents: number) => {
    return `NZ$${(Math.abs(cents) / 100).toFixed(2)}`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-NZ', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="max-w-4xl mx-auto p-6 animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-4"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back
        </button>
        <h1 className="text-2xl font-bold text-white">Payment System Demo</h1>
        <p className="text-gray-400 text-sm mt-1">Preview payment components (mock data)</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-700 pb-2">
        {(['wallet', 'transactions', 'payment', 'pass'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-t font-medium transition-colors ${
              activeTab === tab
                ? 'bg-green-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {tab === 'wallet' && '💳 Wallet'}
            {tab === 'transactions' && '📋 Transactions'}
            {tab === 'payment' && '💵 Payment Form'}
            {tab === 'pass' && '🎫 Annual Pass'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        
        {/* Wallet Tab */}
        {activeTab === 'wallet' && (
          <div>
            <h2 className="text-xl font-bold text-white mb-4">Wallet Card Component</h2>
            
            {/* Mock Wallet Card */}
            <div className="bg-gradient-to-br from-green-600 to-green-800 rounded-xl p-6 text-white max-w-sm">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <p className="text-green-200 text-sm">Club Wallet</p>
                  <p className="text-lg font-medium">Demo Pickleball Club</p>
                </div>
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                  💳
                </div>
              </div>
              
              <div className="mb-6">
                <p className="text-green-200 text-sm">Available Balance</p>
                <p className="text-3xl font-bold">{formatCurrency(mockWallet.balance)}</p>
              </div>
              
              <div className="flex gap-3">
                <button className="flex-1 bg-white/20 hover:bg-white/30 py-2 rounded-lg font-medium transition-colors">
                  Top Up
                </button>
                <button className="flex-1 bg-white/20 hover:bg-white/30 py-2 rounded-lg font-medium transition-colors">
                  History
                </button>
              </div>
            </div>

            <div className="mt-6 p-4 bg-gray-900 rounded-lg">
              <p className="text-gray-400 text-sm">
                <strong className="text-white">Note:</strong> This is a preview with mock data. 
                When connected to Stripe, users can top up their wallet and use the balance for bookings.
              </p>
            </div>
          </div>
        )}

        {/* Transactions Tab */}
        {activeTab === 'transactions' && (
          <div>
            <h2 className="text-xl font-bold text-white mb-4">Transaction List Component</h2>
            
            {/* Filters */}
            <div className="mb-4">
              <select className="bg-gray-900 text-white px-4 py-2 rounded border border-gray-600">
                <option value="">All Transactions</option>
                <option value="payment">Payments</option>
                <option value="topup">Top-ups</option>
                <option value="refund">Refunds</option>
              </select>
            </div>

            {/* Transaction List */}
            <div className="space-y-2">
              {mockTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center gap-4 p-4 bg-gray-900 rounded-lg hover:bg-gray-850 transition-colors cursor-pointer"
                >
                  <div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center text-lg">
                    {tx.type === 'payment' ? '💳' : tx.type === 'topup' ? '➕' : '↩️'}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{tx.referenceName}</p>
                    <p className="text-gray-400 text-sm">
                      {tx.type.charAt(0).toUpperCase() + tx.type.slice(1)} • {formatDate(tx.createdAt)}
                    </p>
                  </div>
                  
                  <div className="text-right">
                    <p className={`font-bold ${tx.amount > 0 ? 'text-green-400' : 'text-white'}`}>
                      {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
                    </p>
                    <p className="text-xs text-green-400 bg-green-400/20 px-2 py-0.5 rounded">
                      {tx.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 p-4 bg-gray-900 rounded-lg">
              <p className="text-gray-400 text-sm">
                <strong className="text-white">Note:</strong> This shows mock transactions. 
                Real transactions will be stored in Firestore and updated in real-time.
              </p>
            </div>
          </div>
        )}

        {/* Payment Form Tab */}
        {activeTab === 'payment' && (
          <div>
            <h2 className="text-xl font-bold text-white mb-4">Payment Form Component</h2>
            
            {/* Mock Payment Form */}
            <div className="max-w-md">
              <div className="bg-gray-900 rounded-lg p-6 mb-4">
                <h3 className="text-lg font-bold text-white mb-1">Complete Payment</h3>
                <p className="text-gray-400 text-sm mb-4">Court Booking - Court 1</p>
                
                {/* Order Summary */}
                <div className="border-t border-gray-700 pt-4 mb-4">
                  <h4 className="text-sm font-medium text-gray-300 mb-2">Order Summary</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Court Hire (1 hour)</span>
                      <span className="text-white">$25.00</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Member Discount (20%)</span>
                      <span className="text-green-400">-$5.00</span>
                    </div>
                    <div className="flex justify-between border-t border-gray-700 pt-2 font-bold">
                      <span className="text-white">Total</span>
                      <span className="text-white">$20.00</span>
                    </div>
                  </div>
                </div>

                {/* Payment Method */}
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-300 mb-2">Payment Method</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <button className="p-3 bg-green-600 border-2 border-green-500 rounded-lg text-white text-sm font-medium">
                      💳 Card
                    </button>
                    <button className="p-3 bg-gray-800 border-2 border-gray-600 rounded-lg text-gray-300 text-sm font-medium hover:border-gray-500">
                      👛 Wallet ($150.00)
                    </button>
                  </div>
                </div>

                {/* Card Input (Mock) */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-300 mb-1">Card Details</label>
                  <div className="bg-gray-800 border border-gray-600 rounded-lg p-3 text-gray-500 text-sm">
                    Stripe Card Element would appear here
                  </div>
                </div>

                {/* Submit */}
                <button className="w-full bg-green-600 hover:bg-green-500 text-white py-3 rounded-lg font-bold transition-colors">
                  Pay $20.00
                </button>
              </div>

              <div className="p-4 bg-gray-900 rounded-lg">
                <p className="text-gray-400 text-sm">
                  <strong className="text-white">Note:</strong> This is a UI preview. 
                  To process real payments, you need to connect Stripe.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Annual Pass Tab */}
        {activeTab === 'pass' && (
          <div>
            <h2 className="text-xl font-bold text-white mb-4">Annual Pass Card Component</h2>
            
            {/* Mock Annual Pass Card */}
            <div className="max-w-sm">
              <div className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-xl p-6 text-white">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-purple-200 text-sm">Annual Pass</p>
                    <p className="text-xl font-bold">Demo Pickleball Club</p>
                  </div>
                  <div className="bg-green-400 text-green-900 text-xs font-bold px-2 py-1 rounded">
                    ACTIVE
                  </div>
                </div>

                <div className="mb-4">
                  <p className="text-purple-200 text-sm">Valid Until</p>
                  <p className="text-lg font-medium">December 31, 2024</p>
                </div>

                <div className="border-t border-purple-500/30 pt-4">
                  <p className="text-purple-200 text-sm mb-2">Benefits</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-green-400">✓</span>
                      <span>Free Bookings</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-green-400">✓</span>
                      <span>20% Discount</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-green-400">✓</span>
                      <span>5 Guest Passes</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-green-400">✓</span>
                      <span>Priority Booking</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 p-4 bg-gray-900 rounded-lg">
                <p className="text-gray-400 text-sm">
                  <strong className="text-white">Note:</strong> Annual passes give members 
                  discounts and benefits. Passes are stored in Firestore.
                </p>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Info Box */}
      <div className="mt-6 bg-blue-900/30 border border-blue-700 rounded-lg p-4">
        <h3 className="text-blue-400 font-bold mb-2">💡 About the Payment System</h3>
        <ul className="text-gray-300 text-sm space-y-1">
          <li>• <strong>UI Components:</strong> Built and ready ✅</li>
          <li>• <strong>Firebase Services:</strong> Built and ready ✅</li>
          <li>• <strong>Stripe Integration:</strong> Not connected yet ⏳</li>
          <li>• <strong>To enable real payments:</strong> Connect Stripe API keys</li>
        </ul>
      </div>
    </div>
  );
};

export default PaymentDemoPage;