/**
 * AdminDashboard Component
 * 
 * Master admin view showing:
 * - Platform statistics
 * - All users with roles and Stripe status
 * - All clubs with Stripe status
 * - All organizers and their payment setup
 * - Quick actions for common admin tasks
 * 
 * FILE LOCATION: pages/AdminDashboard.tsx
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { collection, getDocs } from '@firebase/firestore';
import { getFunctions, httpsCallable } from '@firebase/functions';
import { db } from '../services/firebase';
import { testDuprConnection } from '../services/dupr';
import type { UserProfile, Club } from '../types';

// ============================================
// TYPES
// ============================================

interface UserWithStripe extends UserProfile {
  stripeConnectedAccountId?: string;
  stripeChargesEnabled?: boolean;
  stripePayoutsEnabled?: boolean;
  isOrganizer?: boolean;
  isAppAdmin?: boolean;
}

interface ClubWithStripe extends Club {
  stripeConnectedAccountId?: string;
  stripeChargesEnabled?: boolean;
  stripePayoutsEnabled?: boolean;
  adminNames?: string[];
}

interface MeetupData {
  id: string;
  title?: string;
  hostedBy?: string;
  clubName?: string;
  organizerName?: string;
  status?: string;
  when?: string | number;
  pricing?: {
    enabled?: boolean;
    totalPerPerson?: number;
  };
}

interface PlatformStats {
  totalUsers: number;
  totalOrganizers: number;
  totalClubs: number;
  organizersWithStripe: number;
  clubsWithStripe: number;
  totalMeetups: number;
  paidMeetups: number;
}

// ============================================
// COMPONENT
// ============================================

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { isAppAdmin } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'organizers' | 'clubs' | 'meetups'>('overview');
  
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [users, setUsers] = useState<UserWithStripe[]>([]);
  const [clubs, setClubs] = useState<ClubWithStripe[]>([]);
  const [meetups, setMeetups] = useState<MeetupData[]>([]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [duprTestResult, setDuprTestResult] = useState<{
    testing: boolean;
    result?: { success: boolean; error?: string; environment?: string };
  } | null>(null);

  const [smsBundleSeed, setSmsBundleSeed] = useState<{
    seeding: boolean;
    result?: { success: boolean; message?: string; error?: string };
  } | null>(null);

  const [duprSubscribeAll, setDuprSubscribeAll] = useState<{
    subscribing: boolean;
    result?: { success: boolean; message?: string; subscribedCount?: number; totalUsers?: number; error?: string; errors?: string[] };
  } | null>(null);

  // ============================================
  // LOAD DATA
  // ============================================

  useEffect(() => {
    if (!isAppAdmin) return;

    const loadAllData = async () => {
      setLoading(true);
      try {
        // Load all users
        const usersSnap = await getDocs(collection(db, 'users'));
        const usersData: UserWithStripe[] = usersSnap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            odUserId: d.id,
            email: data.email || '',
            displayName: data.displayName || 'Unknown',
            roles: data.roles || ['player'],
            stripeConnectedAccountId: data.stripeConnectedAccountId,
            stripeChargesEnabled: data.stripeChargesEnabled,
            stripePayoutsEnabled: data.stripePayoutsEnabled,
            isOrganizer: data.roles?.includes('organizer') || data.isOrganizer,
            isAppAdmin: data.roles?.includes('app_admin') || data.isAppAdmin || data.isRootAdmin,
            createdAt: data.createdAt,
          } as UserWithStripe;
        });
        setUsers(usersData);

        // Load all clubs
        const clubsSnap = await getDocs(collection(db, 'clubs'));
        const clubsData: ClubWithStripe[] = clubsSnap.docs.map(d => {
          const data = d.data();
          // Find admin names
          const adminIds = [...(data.admins || []), data.createdByUserId].filter(Boolean);
          const adminNames = adminIds
            .map(id => usersData.find(u => u.id === id)?.displayName)
            .filter(Boolean) as string[];
          
          return {
            id: d.id,
            name: data.name || 'Unknown Club',
            description: data.description,
            region: data.region,
            members: data.members || [],
            admins: data.admins || [],
            createdByUserId: data.createdByUserId,
            stripeConnectedAccountId: data.stripeConnectedAccountId,
            stripeChargesEnabled: data.stripeChargesEnabled,
            stripePayoutsEnabled: data.stripePayoutsEnabled,
            adminNames,
            createdAt: data.createdAt,
          } as ClubWithStripe;
        });
        setClubs(clubsData);

        // Load meetups
        const meetupsSnap = await getDocs(collection(db, 'meetups'));
        const meetupsData: MeetupData[] = meetupsSnap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            title: data.title,
            hostedBy: data.hostedBy,
            clubName: data.clubName,
            organizerName: data.organizerName,
            status: data.status,
            when: data.when,
            pricing: data.pricing,
          };
        });
        setMeetups(meetupsData);

        // Calculate stats
        const organizers = usersData.filter(u => u.isOrganizer);
        const organizersWithStripe = organizers.filter(u => u.stripeChargesEnabled && u.stripePayoutsEnabled);
        const clubsWithStripe = clubsData.filter(c => c.stripeChargesEnabled && c.stripePayoutsEnabled);
        const paidMeetups = meetupsData.filter(m => m.pricing?.enabled);

        setStats({
          totalUsers: usersData.length,
          totalOrganizers: organizers.length,
          totalClubs: clubsData.length,
          organizersWithStripe: organizersWithStripe.length,
          clubsWithStripe: clubsWithStripe.length,
          totalMeetups: meetupsData.length,
          paidMeetups: paidMeetups.length,
        });

      } catch (err) {
        console.error('Failed to load admin data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadAllData();
  }, [isAppAdmin]);

  // ============================================
  // COMPUTED VALUES
  // ============================================

  const organizers = users.filter(u => u.isOrganizer);
  
  const filteredUsers = users.filter(u => 
    u.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredOrganizers = organizers.filter(u =>
    u.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredClubs = clubs.filter(c =>
    c.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ============================================
  // RENDER HELPERS
  // ============================================

  const StatusBadge: React.FC<{ ready: boolean; label?: string }> = ({ ready, label }) => (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
      ready ? 'bg-green-900 text-green-300' : 'bg-red-900/50 text-red-400'
    }`}>
      {label || (ready ? '✓ Ready' : '✗ Not Ready')}
    </span>
  );

  const RoleBadge: React.FC<{ role: string }> = ({ role }) => {
    const colors: Record<string, string> = {
      app_admin: 'bg-red-900 text-red-300',
      organizer: 'bg-purple-900 text-purple-300',
      player: 'bg-gray-700 text-gray-400',
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[role] || colors.player}`}>
        {role}
      </span>
    );
  };

  // ============================================
  // ACCESS CHECK
  // ============================================

  if (!isAppAdmin) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center">
        <h1 className="text-2xl font-bold text-red-400 mb-4">Access Denied</h1>
        <p className="text-gray-400">You need App Admin permissions to view this page.</p>
        <button
          onClick={() => navigate('/')}
          className="mt-4 text-blue-400 hover:text-blue-300"
        >
          ← Go Home
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-700 rounded w-1/3 mb-6"></div>
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[1,2,3,4].map(i => <div key={i} className="h-24 bg-gray-800 rounded-lg"></div>)}
          </div>
          <div className="h-96 bg-gray-800 rounded-lg"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            🛡️ Admin Dashboard
            <span className="bg-red-500/20 text-red-400 text-xs px-2 py-1 rounded">ADMIN ONLY</span>
          </h1>
          <p className="text-gray-400 text-sm mt-1">Platform overview and management</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="text-gray-400 hover:text-white text-sm flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-xs uppercase">Users</p>
            <p className="text-2xl font-bold text-white">{stats.totalUsers}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-xs uppercase">Organizers</p>
            <p className="text-2xl font-bold text-purple-400">{stats.totalOrganizers}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-xs uppercase">Org + Stripe</p>
            <p className="text-2xl font-bold text-green-400">{stats.organizersWithStripe}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-xs uppercase">Clubs</p>
            <p className="text-2xl font-bold text-blue-400">{stats.totalClubs}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-xs uppercase">Club + Stripe</p>
            <p className="text-2xl font-bold text-green-400">{stats.clubsWithStripe}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-xs uppercase">Meetups</p>
            <p className="text-2xl font-bold text-white">{stats.totalMeetups}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-xs uppercase">Paid Meetups</p>
            <p className="text-2xl font-bold text-yellow-400">{stats.paidMeetups}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {(['overview', 'organizers', 'clubs', 'users', 'meetups'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-colors ${
              activeTab === tab
                ? 'bg-green-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Search */}
      {activeTab !== 'overview' && (
        <div className="mb-4">
          <input
            type="text"
            placeholder={`Search ${activeTab}...`}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full md:w-96 bg-gray-900 text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-green-500 outline-none"
          />
        </div>
      )}

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Quick Actions */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
            <h3 className="text-lg font-bold text-white mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <button
                onClick={() => navigate('/admin/users')}
                className="w-full text-left px-4 py-3 bg-gray-900 hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-3"
              >
                <span className="text-2xl">👥</span>
                <div>
                  <p className="text-white font-medium">Manage Users</p>
                  <p className="text-gray-500 text-xs">Edit roles, promote/demote</p>
                </div>
              </button>
              <button
                onClick={() => navigate('/admin/organizer-requests')}
                className="w-full text-left px-4 py-3 bg-gray-900 hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-3"
              >
                <span className="text-2xl">📋</span>
                <div>
                  <p className="text-white font-medium">Organizer Requests</p>
                  <p className="text-gray-500 text-xs">Approve pending requests</p>
                </div>
              </button>
              <button
                onClick={() => navigate('/admin/test-payments')}
                className="w-full text-left px-4 py-3 bg-gray-900 hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-3"
              >
                <span className="text-2xl">💳</span>
                <div>
                  <p className="text-white font-medium">Test Payments</p>
                  <p className="text-gray-500 text-xs">Wallets and transactions</p>
                </div>
              </button>
              <button
                onClick={async () => {
                  setDuprTestResult({ testing: true });
                  try {
                    const result = await testDuprConnection();
                    setDuprTestResult({ testing: false, result });
                  } catch (err) {
                    setDuprTestResult({
                      testing: false,
                      result: { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
                    });
                  }
                }}
                className="w-full text-left px-4 py-3 bg-gray-900 hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-3"
              >
                <span className="text-2xl">🔗</span>
                <div className="flex-1">
                  <p className="text-white font-medium">Test DUPR Connection</p>
                  <p className="text-gray-500 text-xs">
                    {duprTestResult?.testing
                      ? 'Testing...'
                      : duprTestResult?.result
                        ? duprTestResult.result.success
                          ? `✓ Connected (${duprTestResult.result.environment})`
                          : `✗ ${duprTestResult.result.error}`
                        : 'Verify API credentials'
                    }
                  </p>
                </div>
                {duprTestResult?.testing && (
                  <svg className="w-5 h-5 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                )}
                {duprTestResult?.result && !duprTestResult.testing && (
                  <span className={duprTestResult.result.success ? 'text-green-400' : 'text-red-400'}>
                    {duprTestResult.result.success ? '✓' : '✗'}
                  </span>
                )}
              </button>
              <button
                onClick={async () => {
                  setDuprSubscribeAll({ subscribing: true });
                  try {
                    const functions = getFunctions();
                    const subscribeAll = httpsCallable<void, {
                      success: boolean;
                      message: string;
                      subscribedCount: number;
                      totalUsers: number;
                      errors?: string[];
                    }>(functions, 'dupr_subscribeAllUsers');
                    const result = await subscribeAll();
                    setDuprSubscribeAll({
                      subscribing: false,
                      result: {
                        success: result.data.success,
                        message: result.data.message,
                        subscribedCount: result.data.subscribedCount,
                        totalUsers: result.data.totalUsers,
                        errors: result.data.errors,
                      }
                    });
                  } catch (err) {
                    setDuprSubscribeAll({
                      subscribing: false,
                      result: { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
                    });
                  }
                }}
                className="w-full text-left px-4 py-3 bg-gray-900 hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-3"
              >
                <span className="text-2xl">📡</span>
                <div className="flex-1">
                  <p className="text-white font-medium">Subscribe All DUPR Users</p>
                  <p className="text-gray-500 text-xs">
                    {duprSubscribeAll?.subscribing
                      ? 'Subscribing...'
                      : duprSubscribeAll?.result
                        ? duprSubscribeAll.result.success
                          ? `✓ ${duprSubscribeAll.result.message}`
                          : `✗ ${duprSubscribeAll.result.message || duprSubscribeAll.result.errors?.[0] || duprSubscribeAll.result.error || 'Failed'}`
                        : 'Subscribe all users to DUPR rating webhooks'
                    }
                  </p>
                </div>
                {duprSubscribeAll?.subscribing && (
                  <svg className="w-5 h-5 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                )}
                {duprSubscribeAll?.result && !duprSubscribeAll.subscribing && (
                  <span className={duprSubscribeAll.result.success ? 'text-green-400' : 'text-red-400'}>
                    {duprSubscribeAll.result.success ? '✓' : '✗'}
                  </span>
                )}
              </button>
              <button
                onClick={() => navigate('/admin/privacy-security')}
                className="w-full text-left px-4 py-3 bg-gray-900 hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-3"
              >
                <span className="text-2xl">🔒</span>
                <div>
                  <p className="text-white font-medium">Privacy & Security</p>
                  <p className="text-gray-500 text-xs">Breaches, requests, data retention</p>
                </div>
              </button>
              <button
                onClick={() => navigate('/admin/finance')}
                className="w-full text-left px-4 py-3 bg-gray-900 hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-3"
              >
                <span className="text-2xl">💰</span>
                <div>
                  <p className="text-white font-medium">Platform Finance</p>
                  <p className="text-gray-500 text-xs">Revenue, transactions, reconciliation</p>
                </div>
              </button>
              <button
                onClick={async () => {
                  setSmsBundleSeed({ seeding: true });
                  try {
                    const functions = getFunctions();
                    const seedBundles = httpsCallable<void, { success: boolean; message: string }>(
                      functions,
                      'stripe_seedSMSBundles'
                    );
                    const result = await seedBundles();
                    setSmsBundleSeed({ seeding: false, result: { success: true, message: result.data.message } });
                  } catch (err) {
                    setSmsBundleSeed({
                      seeding: false,
                      result: { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
                    });
                  }
                }}
                className="w-full text-left px-4 py-3 bg-gray-900 hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-3"
              >
                <span className="text-2xl">📦</span>
                <div className="flex-1">
                  <p className="text-white font-medium">Seed SMS Bundles</p>
                  <p className="text-gray-500 text-xs">
                    {smsBundleSeed?.seeding
                      ? 'Seeding...'
                      : smsBundleSeed?.result
                        ? smsBundleSeed.result.success
                          ? `✓ ${smsBundleSeed.result.message}`
                          : `✗ ${smsBundleSeed.result.error}`
                        : 'Populate sms_bundles collection'
                    }
                  </p>
                </div>
                {smsBundleSeed?.seeding && (
                  <svg className="w-5 h-5 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                )}
                {smsBundleSeed?.result && !smsBundleSeed.seeding && (
                  <span className={smsBundleSeed.result.success ? 'text-green-400' : 'text-red-400'}>
                    {smsBundleSeed.result.success ? '✓' : '✗'}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Stripe Status Summary */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
            <h3 className="text-lg font-bold text-white mb-4">💳 Stripe Status</h3>
            
            <div className="space-y-4">
              {/* Organizers */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-400">Organizers with Stripe</span>
                  <span className="text-white font-bold">
                    {stats?.organizersWithStripe} / {stats?.totalOrganizers}
                  </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-green-500 h-2 rounded-full transition-all"
                    style={{ width: stats?.totalOrganizers ? `${(stats.organizersWithStripe / stats.totalOrganizers) * 100}%` : '0%' }}
                  ></div>
                </div>
              </div>

              {/* Clubs */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-400">Clubs with Stripe</span>
                  <span className="text-white font-bold">
                    {stats?.clubsWithStripe} / {stats?.totalClubs}
                  </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: stats?.totalClubs ? `${(stats.clubsWithStripe / stats.totalClubs) * 100}%` : '0%' }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Organizers without Stripe */}
            {organizers.filter(o => !o.stripeChargesEnabled).length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-700">
                <p className="text-yellow-400 text-sm mb-2">⚠️ Organizers without Stripe:</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {organizers.filter(o => !o.stripeChargesEnabled).slice(0, 5).map(o => (
                    <p key={o.id} className="text-gray-400 text-xs">{o.displayName} ({o.email})</p>
                  ))}
                  {organizers.filter(o => !o.stripeChargesEnabled).length > 5 && (
                    <p className="text-gray-500 text-xs">+{organizers.filter(o => !o.stripeChargesEnabled).length - 5} more</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 md:col-span-2">
            <h3 className="text-lg font-bold text-white mb-4">📊 Platform Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="p-3 bg-gray-900 rounded-lg">
                <p className="text-3xl font-bold text-green-400">{stats?.organizersWithStripe || 0}</p>
                <p className="text-gray-500 text-xs">Ready to accept payments</p>
              </div>
              <div className="p-3 bg-gray-900 rounded-lg">
                <p className="text-3xl font-bold text-yellow-400">{stats?.paidMeetups || 0}</p>
                <p className="text-gray-500 text-xs">Paid meetups created</p>
              </div>
              <div className="p-3 bg-gray-900 rounded-lg">
                <p className="text-3xl font-bold text-blue-400">{stats?.totalClubs || 0}</p>
                <p className="text-gray-500 text-xs">Active clubs</p>
              </div>
              <div className="p-3 bg-gray-900 rounded-lg">
                <p className="text-3xl font-bold text-purple-400">{users.filter(u => u.isAppAdmin).length}</p>
                <p className="text-gray-500 text-xs">App admins</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Organizers Tab */}
      {activeTab === 'organizers' && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-900">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase">Organizer</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase">Personal Stripe</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase">Account ID</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase">Clubs Admin Of</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {filteredOrganizers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      No organizers found
                    </td>
                  </tr>
                ) : (
                  filteredOrganizers.map(user => {
                    const userClubs = clubs.filter(c => 
                      c.createdByUserId === user.id || c.admins?.includes(user.id)
                    );
                    const stripeReady = !!(user.stripeChargesEnabled && user.stripePayoutsEnabled);
                    
                    return (
                      <tr key={user.id} className="hover:bg-gray-700/50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-medium">{user.displayName}</span>
                            {user.isAppAdmin && <RoleBadge role="app_admin" />}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-sm">{user.email}</td>
                        <td className="px-4 py-3">
                          <StatusBadge ready={stripeReady} />
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">
                          {user.stripeConnectedAccountId 
                            ? user.stripeConnectedAccountId.slice(0, 15) + '...'
                            : '-'
                          }
                        </td>
                        <td className="px-4 py-3">
                          {userClubs.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {userClubs.map(c => (
                                <span 
                                  key={c.id} 
                                  className="bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded text-xs"
                                >
                                  {c.name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-500 text-sm">None</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Clubs Tab */}
      {activeTab === 'clubs' && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-900">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase">Club Name</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase">Region</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase">Members</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase">Admins</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase">Club Stripe</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase">Account ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {filteredClubs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      No clubs found
                    </td>
                  </tr>
                ) : (
                  filteredClubs.map(club => {
                    const stripeReady = !!(club.stripeChargesEnabled && club.stripePayoutsEnabled);
                    
                    return (
                      <tr key={club.id} className="hover:bg-gray-700/50">
                        <td className="px-4 py-3">
                          <button
                            onClick={() => navigate(`/clubs/${club.id}`)}
                            className="text-white font-medium hover:text-green-400"
                          >
                            {club.name}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-sm">{club.region || '-'}</td>
                        <td className="px-4 py-3 text-gray-400">{club.members?.length || 0}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {club.adminNames?.map((name, i) => (
                              <span key={i} className="text-purple-300 text-xs">{name}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge ready={stripeReady} />
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">
                          {club.stripeConnectedAccountId 
                            ? club.stripeConnectedAccountId.slice(0, 15) + '...'
                            : '-'
                          }
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-900">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase">User</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase">Roles</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase">Stripe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      No users found
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map(user => {
                    const stripeReady = !!(user.stripeChargesEnabled && user.stripePayoutsEnabled);
                    return (
                      <tr key={user.id} className="hover:bg-gray-700/50">
                        <td className="px-4 py-3 text-white font-medium">{user.displayName}</td>
                        <td className="px-4 py-3 text-gray-400 text-sm">{user.email}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {user.isAppAdmin && <RoleBadge role="app_admin" />}
                            {user.isOrganizer && <RoleBadge role="organizer" />}
                            {!user.isAppAdmin && !user.isOrganizer && <RoleBadge role="player" />}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {user.isOrganizer ? (
                            <StatusBadge ready={stripeReady} />
                          ) : (
                            <span className="text-gray-500 text-xs">N/A</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 bg-gray-900 text-gray-500 text-sm">
            Showing {filteredUsers.length} of {users.length} users
          </div>
        </div>
      )}

      {/* Meetups Tab */}
      {activeTab === 'meetups' && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-900">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase">Title</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase">Host</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase">Price</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {meetups.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      No meetups found
                    </td>
                  </tr>
                ) : (
                  meetups.slice(0, 50).map(meetup => (
                    <tr key={meetup.id} className="hover:bg-gray-700/50">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => navigate(`/meetups/${meetup.id}`)}
                          className="text-white font-medium hover:text-green-400"
                        >
                          {meetup.title || 'Untitled'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-sm">
                        {meetup.clubName || meetup.organizerName || 'Unknown'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          meetup.hostedBy === 'club' 
                            ? 'bg-blue-900/50 text-blue-300' 
                            : 'bg-gray-700 text-gray-300'
                        }`}>
                          {meetup.hostedBy === 'club' ? 'Club' : 'Individual'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {meetup.pricing?.enabled ? (
                          <span className="text-green-400 font-medium">
                            ${((meetup.pricing.totalPerPerson || 0) / 100).toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-gray-500">Free</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          meetup.status === 'active' 
                            ? 'bg-green-900/50 text-green-300' 
                            : meetup.status === 'cancelled'
                              ? 'bg-red-900/50 text-red-300'
                              : 'bg-gray-700 text-gray-400'
                        }`}>
                          {meetup.status || 'active'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-sm">
                        {meetup.when ? new Date(meetup.when).toLocaleDateString() : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {meetups.length > 50 && (
            <div className="px-4 py-3 bg-gray-900 text-gray-500 text-sm">
              Showing 50 of {meetups.length} meetups
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;