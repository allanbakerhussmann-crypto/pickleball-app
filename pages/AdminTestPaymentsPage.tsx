/**
 * AdminTestPaymentsPage
 * 
 * TESTING ONLY - Remove before going live!
 * 
 * Allows admins to:
 * - Add funds to user wallets
 * - Simulate purchases (court bookings, tournaments, passes)
 * - View all transactions
 * - Test the complete payment flow
 * 
 * FILE LOCATION: pages/AdminTestPaymentsPage.tsx
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  updateDoc, 
  addDoc,
  query, 
  orderBy,
} from '@firebase/firestore';
import { db } from '../services/firebase';
import type { UserProfile } from '../types';

// ============================================
// TYPES
// ============================================

interface TestWallet {
  id: string;
  odUserId: string;
  odClubId: string;
  balance: number;
  currency: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  userName?: string;
  userEmail?: string;
}

interface TestTransaction {
  id: string;
  walletId: string;
  odUserId: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  referenceName: string;
  referenceType: string;
  referenceId: string;
  createdAt: number;
}

// ============================================
// MOCK PRODUCTS FOR TESTING
// ============================================

const TEST_PRODUCTS = {
  court_bookings: [
    { id: 'court-1hr-peak', name: 'Court Booking - 1hr Peak', price: 2500, type: 'court_booking' },
    { id: 'court-1hr-offpeak', name: 'Court Booking - 1hr Off-Peak', price: 1500, type: 'court_booking' },
    { id: 'court-2hr-peak', name: 'Court Booking - 2hr Peak', price: 4500, type: 'court_booking' },
  ],
  tournaments: [
    { id: 'tournament-singles', name: 'Tournament Entry - Singles', price: 3500, type: 'tournament' },
    { id: 'tournament-doubles', name: 'Tournament Entry - Doubles', price: 5000, type: 'tournament' },
    { id: 'tournament-mixed', name: 'Tournament Entry - Mixed', price: 5000, type: 'tournament' },
  ],
  memberships: [
    { id: 'annual-pass-basic', name: 'Annual Pass - Basic', price: 25000, type: 'annual_pass' },
    { id: 'annual-pass-premium', name: 'Annual Pass - Premium', price: 45000, type: 'annual_pass' },
    { id: 'monthly-membership', name: 'Monthly Membership', price: 5000, type: 'membership' },
  ],
  other: [
    { id: 'guest-pass', name: 'Guest Pass (Single Visit)', price: 1000, type: 'visitor_fee' },
    { id: 'equipment-rental', name: 'Equipment Rental', price: 500, type: 'court_booking' },
    { id: 'coaching-session', name: 'Coaching Session (1hr)', price: 7500, type: 'court_booking' },
  ],
};

// ============================================
// MAIN COMPONENT
// ============================================

const AdminTestPaymentsPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAppAdmin } = useAuth();
  
  // State
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [wallets, setWallets] = useState<TestWallet[]>([]);
  const [transactions, setTransactions] = useState<TestTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'wallets' | 'purchase' | 'transactions'>('wallets');
  
  // Wallet management state
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [addFundsAmount, setAddFundsAmount] = useState<string>('50');
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Purchase state
  const [selectedProduct, setSelectedProduct] = useState<typeof TEST_PRODUCTS.court_bookings[0] | null>(null);
  const [purchaseUserId, setPurchaseUserId] = useState<string>('');

  // ============================================
  // DATA LOADING
  // ============================================

  useEffect(() => {
    if (!isAppAdmin) return;

    const loadData = async () => {
      setLoading(true);
      try {
        // Load users
        const usersSnap = await getDocs(collection(db, 'users'));
        const usersData = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as UserProfile));
        setUsers(usersData);

        // Load wallets
        const walletsSnap = await getDocs(collection(db, 'wallets'));
        const walletsData = walletsSnap.docs.map(d => {
          const data = d.data();
          const user = usersData.find(u => u.id === data.odUserId);
          return {
            id: d.id,
            ...data,
            userName: user?.displayName || 'Unknown',
            userEmail: user?.email || '',
          } as TestWallet;
        });
        setWallets(walletsData);

        // Load recent transactions
        const txSnap = await getDocs(
          query(collection(db, 'transactions'), orderBy('createdAt', 'desc'))
        );
        const txData = txSnap.docs.map(d => ({ id: d.id, ...d.data() } as TestTransaction));
        setTransactions(txData);

      } catch (err) {
        console.error('Failed to load data:', err);
        setMessage({ type: 'error', text: 'Failed to load data' });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isAppAdmin]);

  // ============================================
  // WALLET FUNCTIONS
  // ============================================

  const createWalletForUser = async (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    setIsProcessing(true);
    try {
      const walletId = `wallet-${userId}-test`;
      await setDoc(doc(db, 'wallets', walletId), {
        odUserId: userId,
        odClubId: 'test-club',
        balance: 0,
        currency: 'nzd',
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // Refresh wallets
      const newWallet: TestWallet = {
        id: walletId,
        odUserId: userId,
        odClubId: 'test-club',
        balance: 0,
        currency: 'nzd',
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        userName: user.displayName,
        userEmail: user.email,
      };
      setWallets(prev => [...prev, newWallet]);
      setMessage({ type: 'success', text: `Wallet created for ${user.displayName}` });
    } catch (err) {
      console.error('Failed to create wallet:', err);
      setMessage({ type: 'error', text: 'Failed to create wallet' });
    } finally {
      setIsProcessing(false);
    }
  };

  const addFundsToWallet = async (walletId: string, amountDollars: number) => {
    const wallet = wallets.find(w => w.id === walletId);
    if (!wallet) return;

    const amountCents = Math.round(amountDollars * 100);
    setIsProcessing(true);
    
    try {
      // Update wallet balance
      const newBalance = wallet.balance + amountCents;
      await updateDoc(doc(db, 'wallets', walletId), {
        balance: newBalance,
        updatedAt: Date.now(),
      });

      // Create transaction record
      const txRef = await addDoc(collection(db, 'transactions'), {
        walletId,
        odUserId: wallet.odUserId,
        odClubId: wallet.odClubId,
        type: 'topup',
        amount: amountCents,
        currency: 'nzd',
        status: 'completed',
        paymentMethod: 'admin_test',
        referenceType: 'wallet_topup',
        referenceId: `topup-${Date.now()}`,
        referenceName: `Admin Test Top-up - $${amountDollars.toFixed(2)}`,
        balanceBefore: wallet.balance,
        balanceAfter: newBalance,
        breakdown: {
          items: [{ label: 'Top-up', amount: amountCents, type: 'charge' }],
          subtotal: amountCents,
          discounts: 0,
          fees: 0,
          tax: 0,
          total: amountCents,
        },
        createdAt: Date.now(),
        completedAt: Date.now(),
      });

      // Update local state
      setWallets(prev => prev.map(w => 
        w.id === walletId ? { ...w, balance: newBalance } : w
      ));

      setTransactions(prev => [{
        id: txRef.id,
        walletId,
        odUserId: wallet.odUserId,
        type: 'topup',
        amount: amountCents,
        currency: 'nzd',
        status: 'completed',
        referenceName: `Admin Test Top-up - $${amountDollars.toFixed(2)}`,
        referenceType: 'wallet_topup',
        referenceId: `topup-${Date.now()}`,
        createdAt: Date.now(),
      }, ...prev]);

      setMessage({ type: 'success', text: `Added $${amountDollars.toFixed(2)} to wallet` });
      setAddFundsAmount('50');
    } catch (err) {
      console.error('Failed to add funds:', err);
      setMessage({ type: 'error', text: 'Failed to add funds' });
    } finally {
      setIsProcessing(false);
    }
  };

  // ============================================
  // PURCHASE FUNCTIONS
  // ============================================

  const processPurchase = async () => {
    if (!selectedProduct || !purchaseUserId) {
      setMessage({ type: 'error', text: 'Select a user and product' });
      return;
    }

    const wallet = wallets.find(w => w.odUserId === purchaseUserId);
    if (!wallet) {
      setMessage({ type: 'error', text: 'User has no wallet. Create one first!' });
      return;
    }

    if (wallet.balance < selectedProduct.price) {
      setMessage({ type: 'error', text: `Insufficient funds. Balance: $${(wallet.balance / 100).toFixed(2)}, Price: $${(selectedProduct.price / 100).toFixed(2)}` });
      return;
    }

    setIsProcessing(true);
    try {
      // Deduct from wallet
      const newBalance = wallet.balance - selectedProduct.price;
      await updateDoc(doc(db, 'wallets', wallet.id), {
        balance: newBalance,
        updatedAt: Date.now(),
      });

      // Create transaction record
      const txRef = await addDoc(collection(db, 'transactions'), {
        walletId: wallet.id,
        odUserId: wallet.odUserId,
        odClubId: wallet.odClubId,
        type: 'payment',
        amount: -selectedProduct.price,
        currency: 'nzd',
        status: 'completed',
        paymentMethod: 'wallet',
        referenceType: selectedProduct.type,
        referenceId: `${selectedProduct.id}-${Date.now()}`,
        referenceName: selectedProduct.name,
        balanceBefore: wallet.balance,
        balanceAfter: newBalance,
        breakdown: {
          items: [{ label: selectedProduct.name, amount: selectedProduct.price, type: 'charge' }],
          subtotal: selectedProduct.price,
          discounts: 0,
          fees: 0,
          tax: 0,
          total: selectedProduct.price,
        },
        createdAt: Date.now(),
        completedAt: Date.now(),
      });

      // Update local state
      setWallets(prev => prev.map(w => 
        w.id === wallet.id ? { ...w, balance: newBalance } : w
      ));

      setTransactions(prev => [{
        id: txRef.id,
        walletId: wallet.id,
        odUserId: wallet.odUserId,
        type: 'payment',
        amount: -selectedProduct.price,
        currency: 'nzd',
        status: 'completed',
        referenceName: selectedProduct.name,
        referenceType: selectedProduct.type,
        referenceId: `${selectedProduct.id}-${Date.now()}`,
        createdAt: Date.now(),
      }, ...prev]);

      setMessage({ type: 'success', text: `Purchase complete! ${selectedProduct.name}` });
      setSelectedProduct(null);
    } catch (err) {
      console.error('Failed to process purchase:', err);
      setMessage({ type: 'error', text: 'Failed to process purchase' });
    } finally {
      setIsProcessing(false);
    }
  };

  // ============================================
  // HELPERS
  // ============================================

  const formatCurrency = (cents: number) => {
    const prefix = cents < 0 ? '-' : '';
    return `${prefix}NZ$${(Math.abs(cents) / 100).toFixed(2)}`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('en-NZ', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // ============================================
  // ACCESS CHECK
  // ============================================

  if (!isAppAdmin) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-8 text-center">
          <h2 className="text-xl font-bold text-red-400 mb-2">Access Denied</h2>
          <p className="text-gray-400">Only App Admins can access this page.</p>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="max-w-6xl mx-auto p-6 animate-fade-in">
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
        
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold text-white">🧪 Test Payment System</h1>
          <span className="bg-yellow-500/20 text-yellow-400 text-xs font-bold px-2 py-1 rounded">
            TESTING ONLY
          </span>
        </div>
        <p className="text-gray-400 text-sm">
          Add funds, simulate purchases, and test the payment flow. Remove this page before going live!
        </p>
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-4 p-4 rounded-lg ${
          message.type === 'success' 
            ? 'bg-green-900/50 border border-green-700 text-green-400' 
            : 'bg-red-900/50 border border-red-700 text-red-400'
        }`}>
          {message.text}
          <button 
            onClick={() => setMessage(null)}
            className="float-right text-gray-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-700 pb-2">
        {(['wallets', 'purchase', 'transactions'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-t font-medium transition-colors ${
              activeTab === tab
                ? 'bg-green-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {tab === 'wallets' && '💳 Wallets'}
            {tab === 'purchase' && '🛒 Test Purchase'}
            {tab === 'transactions' && '📋 Transactions'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          
          {/* ==================== WALLETS TAB ==================== */}
          {activeTab === 'wallets' && (
            <div>
              <h2 className="text-xl font-bold text-white mb-4">User Wallets</h2>
              
              {/* Create Wallet Section */}
              <div className="bg-gray-900 rounded-lg p-4 mb-6">
                <h3 className="text-sm font-medium text-gray-300 mb-3">Create Wallet for User</h3>
                <div className="flex gap-3">
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    className="flex-1 bg-gray-800 text-white px-4 py-2 rounded border border-gray-600"
                  >
                    <option value="">Select a user...</option>
                    {users
                      .filter(u => !wallets.some(w => w.odUserId === u.id))
                      .map(u => (
                        <option key={u.id} value={u.id}>
                          {u.displayName} ({u.email})
                        </option>
                      ))
                    }
                  </select>
                  <button
                    onClick={() => selectedUserId && createWalletForUser(selectedUserId)}
                    disabled={!selectedUserId || isProcessing}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded font-medium"
                  >
                    Create Wallet
                  </button>
                </div>
              </div>

              {/* Wallets List */}
              {wallets.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  No wallets yet. Create one above!
                </div>
              ) : (
                <div className="space-y-3">
                  {wallets.map((wallet) => (
                    <div
                      key={wallet.id}
                      className="bg-gray-900 rounded-lg p-4 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-white font-medium">{wallet.userName}</p>
                        <p className="text-gray-400 text-sm">{wallet.userEmail}</p>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-2xl font-bold text-green-400">
                            {formatCurrency(wallet.balance)}
                          </p>
                          <p className="text-xs text-gray-500">Balance</p>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="1"
                            max="1000"
                            value={addFundsAmount}
                            onChange={(e) => setAddFundsAmount(e.target.value)}
                            className="w-20 bg-gray-800 text-white px-2 py-1 rounded border border-gray-600 text-center"
                          />
                          <button
                            onClick={() => addFundsToWallet(wallet.id, parseFloat(addFundsAmount) || 0)}
                            disabled={isProcessing}
                            className="px-3 py-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white rounded text-sm font-medium"
                          >
                            + Add $
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ==================== PURCHASE TAB ==================== */}
          {activeTab === 'purchase' && (
            <div>
              <h2 className="text-xl font-bold text-white mb-4">Test Purchase</h2>
              
              {/* Select User */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Select User (Buyer)
                </label>
                <select
                  value={purchaseUserId}
                  onChange={(e) => setPurchaseUserId(e.target.value)}
                  className="w-full bg-gray-900 text-white px-4 py-3 rounded border border-gray-600"
                >
                  <option value="">Select a user...</option>
                  {wallets.map(w => (
                    <option key={w.odUserId} value={w.odUserId}>
                      {w.userName} - Balance: {formatCurrency(w.balance)}
                    </option>
                  ))}
                </select>
                {purchaseUserId && !wallets.some(w => w.odUserId === purchaseUserId) && (
                  <p className="text-yellow-400 text-sm mt-1">
                    ⚠️ This user has no wallet. Create one in the Wallets tab first.
                  </p>
                )}
              </div>

              {/* Product Categories */}
              <div className="space-y-6">
                {Object.entries(TEST_PRODUCTS).map(([category, products]) => (
                  <div key={category}>
                    <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
                      {category.replace('_', ' ')}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {products.map((product) => (
                        <button
                          key={product.id}
                          onClick={() => setSelectedProduct(product)}
                          className={`p-4 rounded-lg border text-left transition-all ${
                            selectedProduct?.id === product.id
                              ? 'bg-green-600/20 border-green-500 ring-2 ring-green-500'
                              : 'bg-gray-900 border-gray-700 hover:border-gray-500'
                          }`}
                        >
                          <p className="text-white font-medium">{product.name}</p>
                          <p className="text-green-400 font-bold mt-1">
                            {formatCurrency(product.price)}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Purchase Button */}
              {selectedProduct && (
                <div className="mt-6 bg-gray-900 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400">Selected:</p>
                      <p className="text-white font-bold text-lg">{selectedProduct.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-gray-400">Total:</p>
                      <p className="text-green-400 font-bold text-2xl">
                        {formatCurrency(selectedProduct.price)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={processPurchase}
                    disabled={!purchaseUserId || isProcessing}
                    className="w-full mt-4 py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white rounded-lg font-bold text-lg transition-colors"
                  >
                    {isProcessing ? 'Processing...' : '💳 Complete Purchase'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ==================== TRANSACTIONS TAB ==================== */}
          {activeTab === 'transactions' && (
            <div>
              <h2 className="text-xl font-bold text-white mb-4">
                Transaction History ({transactions.length})
              </h2>
              
              {transactions.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  No transactions yet. Add funds or make a purchase!
                </div>
              ) : (
                <div className="space-y-2">
                  {transactions.map((tx) => {
                    const wallet = wallets.find(w => w.id === tx.walletId);
                    return (
                      <div
                        key={tx.id}
                        className="bg-gray-900 rounded-lg p-4 flex items-center gap-4"
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${
                          tx.amount > 0 ? 'bg-green-900/50' : 'bg-red-900/50'
                        }`}>
                          {tx.type === 'topup' ? '➕' : '💳'}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium truncate">{tx.referenceName}</p>
                          <p className="text-gray-400 text-sm">
                            {wallet?.userName || 'Unknown'} • {formatDate(tx.createdAt)}
                          </p>
                        </div>
                        
                        <div className="text-right">
                          <p className={`font-bold text-lg ${
                            tx.amount > 0 ? 'text-green-400' : 'text-white'
                          }`}>
                            {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
                          </p>
                          <p className="text-xs text-green-400 bg-green-400/20 px-2 py-0.5 rounded inline-block">
                            {tx.status}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* Warning Footer */}
      <div className="mt-6 bg-yellow-900/30 border border-yellow-700 rounded-lg p-4">
        <p className="text-yellow-400 text-sm">
          <strong>⚠️ Testing Only:</strong> This page bypasses normal payment processing. 
          All transactions are marked as "admin_test". Remove this page before launching to production!
        </p>
      </div>
    </div>
  );
};

export default AdminTestPaymentsPage;