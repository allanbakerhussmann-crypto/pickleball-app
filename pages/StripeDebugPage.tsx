/**
 * StripeDebugPage - Testing Tool
 * 
 * Shows the status of:
 * - Your personal Stripe Connect account
 * - All clubs you're admin of and their Stripe status
 * - Helps verify the setup is correct
 * 
 * TEMPORARY - Remove before production!
 * 
 * FILE LOCATION: pages/StripeDebugPage.tsx
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getUserClubs } from '../services/firebase';
import { doc, getDoc } from '@firebase/firestore';
import { db } from '../services/firebase';
import type { Club } from '../types';

interface UserStripeInfo {
  stripeConnectedAccountId?: string;
  stripeOnboardingComplete?: boolean;
  stripeChargesEnabled?: boolean;
  stripePayoutsEnabled?: boolean;
  isOrganizer?: boolean;
}

interface ClubWithStripe extends Club {
  stripeConnectedAccountId?: string;
  stripeOnboardingComplete?: boolean;
  stripeChargesEnabled?: boolean;
  stripePayoutsEnabled?: boolean;
}

const StripeDebugPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, userProfile, isOrganizer, isAppAdmin } = useAuth();
  
  const [userStripeInfo, setUserStripeInfo] = useState<UserStripeInfo | null>(null);
  const [userClubs, setUserClubs] = useState<ClubWithStripe[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      if (!currentUser) {
        setLoading(false);
        return;
      }

      try {
        // Load user's Stripe info
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setUserStripeInfo({
            stripeConnectedAccountId: data.stripeConnectedAccountId,
            stripeOnboardingComplete: data.stripeOnboardingComplete,
            stripeChargesEnabled: data.stripeChargesEnabled,
            stripePayoutsEnabled: data.stripePayoutsEnabled,
            isOrganizer: data.roles?.includes('organizer') || data.isOrganizer,
          });
        }

        // Load clubs user is admin of
        const clubs = await getUserClubs(currentUser.uid);
        const adminClubs = clubs.filter(c => 
          c.createdByUserId === currentUser.uid || 
          c.admins?.includes(currentUser.uid)
        );

        // Get Stripe info for each club
        const clubsWithStripe: ClubWithStripe[] = await Promise.all(
          adminClubs.map(async (club) => {
            const clubDoc = await getDoc(doc(db, 'clubs', club.id));
            const data = clubDoc.data();
            return {
              ...club,
              stripeConnectedAccountId: data?.stripeConnectedAccountId,
              stripeOnboardingComplete: data?.stripeOnboardingComplete,
              stripeChargesEnabled: data?.stripeChargesEnabled,
              stripePayoutsEnabled: data?.stripePayoutsEnabled,
            };
          })
        );

        setUserClubs(clubsWithStripe);
      } catch (err) {
        console.error('Failed to load debug data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [currentUser]);

  // Status badge component
  const StatusBadge: React.FC<{ label: string; value: boolean | undefined; trueText?: string; falseText?: string }> = ({ 
    label, value, trueText = 'Yes', falseText = 'No' 
  }) => (
    <div className="flex justify-between items-center py-2 border-b border-gray-700 last:border-0">
      <span className="text-gray-400">{label}</span>
      <span className={`px-2 py-1 rounded text-xs font-medium ${
        value ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
      }`}>
        {value ? trueText : falseText}
      </span>
    </div>
  );

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-700 rounded w-1/3 mb-6"></div>
          <div className="h-64 bg-gray-800 rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center">
        <h1 className="text-2xl font-bold text-red-400 mb-4">Not Logged In</h1>
        <p className="text-gray-400">Please log in to use this debug tool.</p>
      </div>
    );
  }

  const personalStripeReady = userStripeInfo?.stripeChargesEnabled && userStripeInfo?.stripePayoutsEnabled;

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            🔧 Stripe Debug Tool
            <span className="bg-yellow-500/20 text-yellow-400 text-xs px-2 py-1 rounded">DEV ONLY</span>
          </h1>
          <p className="text-gray-400 text-sm mt-1">Check your personal and club Stripe account status</p>
        </div>
        <button
          onClick={() => navigate(-1)}
          className="text-gray-400 hover:text-white"
        >
          ← Back
        </button>
      </div>

      {/* Current User Info */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 mb-6">
        <h2 className="text-lg font-bold text-white mb-3">👤 Current User</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Name:</span>
            <span className="text-white ml-2">{userProfile?.displayName || 'Not set'}</span>
          </div>
          <div>
            <span className="text-gray-500">Email:</span>
            <span className="text-white ml-2">{currentUser.email}</span>
          </div>
          <div>
            <span className="text-gray-500">UID:</span>
            <span className="text-gray-400 ml-2 font-mono text-xs">{currentUser.uid}</span>
          </div>
          <div>
            <span className="text-gray-500">Roles:</span>
            <span className="ml-2">
              {isOrganizer && <span className="bg-purple-900 text-purple-300 px-2 py-0.5 rounded text-xs mr-1">Organizer</span>}
              {isAppAdmin && <span className="bg-red-900 text-red-300 px-2 py-0.5 rounded text-xs">Admin</span>}
              {!isOrganizer && !isAppAdmin && <span className="text-gray-500">Player</span>}
            </span>
          </div>
        </div>
      </div>

      {/* Personal Stripe Account */}
      <div className={`rounded-lg border p-4 mb-6 ${
        personalStripeReady 
          ? 'bg-green-900/20 border-green-700' 
          : 'bg-gray-800 border-gray-700'
      }`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            💳 Personal Stripe Account
            {personalStripeReady && <span className="text-green-400">✓ Ready</span>}
          </h2>
          <button
            onClick={() => navigate('/profile')}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            Go to Profile →
          </button>
        </div>

        {!isOrganizer ? (
          <div className="bg-yellow-900/30 border border-yellow-700/50 rounded p-3">
            <p className="text-yellow-300 text-sm">
              ⚠️ You're not an Organizer yet. You need Organizer status to connect a personal Stripe account.
            </p>
            <p className="text-yellow-400/70 text-xs mt-1">
              Request organizer access from your Profile page.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <StatusBadge 
              label="Account ID" 
              value={!!userStripeInfo?.stripeConnectedAccountId}
              trueText={userStripeInfo?.stripeConnectedAccountId?.slice(0, 20) + '...'}
              falseText="Not Connected"
            />
            <StatusBadge label="Onboarding Complete" value={userStripeInfo?.stripeOnboardingComplete} />
            <StatusBadge label="Charges Enabled" value={userStripeInfo?.stripeChargesEnabled} />
            <StatusBadge label="Payouts Enabled" value={userStripeInfo?.stripePayoutsEnabled} />
          </div>
        )}

        <p className="text-xs text-gray-500 mt-3 italic">
          This account receives payments when you host meetups as "Me (Individual)"
        </p>
      </div>

      {/* Club Stripe Accounts */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">🏢 Club Stripe Accounts</h2>
          <span className="text-gray-500 text-sm">{userClubs.length} club(s) you manage</span>
        </div>

        {userClubs.length === 0 ? (
          <div className="bg-gray-900/50 rounded p-4 text-center">
            <p className="text-gray-400">You're not an admin of any clubs.</p>
            <p className="text-gray-500 text-sm mt-1">Create or join a club as admin to see club Stripe options.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {userClubs.map((club) => {
              const clubStripeReady = club.stripeChargesEnabled && club.stripePayoutsEnabled;
              return (
                <div 
                  key={club.id} 
                  className={`rounded-lg border p-4 ${
                    clubStripeReady 
                      ? 'bg-green-900/20 border-green-700/50' 
                      : 'bg-gray-900/50 border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-white flex items-center gap-2">
                      {club.name}
                      {clubStripeReady && <span className="text-green-400 text-sm">✓ Ready</span>}
                    </h3>
                    <button
                      onClick={() => navigate(`/clubs/${club.id}`)}
                      className="text-sm text-blue-400 hover:text-blue-300"
                    >
                      Go to Club →
                    </button>
                  </div>

                  <div className="space-y-1 text-sm">
                    <StatusBadge 
                      label="Account ID" 
                      value={!!club.stripeConnectedAccountId}
                      trueText={club.stripeConnectedAccountId?.slice(0, 20) + '...'}
                      falseText="Not Connected"
                    />
                    <StatusBadge label="Onboarding Complete" value={club.stripeOnboardingComplete} />
                    <StatusBadge label="Charges Enabled" value={club.stripeChargesEnabled} />
                    <StatusBadge label="Payouts Enabled" value={club.stripePayoutsEnabled} />
                  </div>

                  <p className="text-xs text-gray-500 mt-2 italic">
                    Club ID: {club.id}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-gray-500 mt-4 italic">
          Club accounts receive payments when you host meetups as that club
        </p>
      </div>

      {/* Test Actions */}
      <div className="mt-6 bg-blue-900/20 border border-blue-700/50 rounded-lg p-4">
        <h2 className="text-lg font-bold text-white mb-3">🧪 Test Actions</h2>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate('/meetups/create')}
            className="bg-green-600 hover:bg-green-500 text-white py-2 px-4 rounded-lg font-medium text-sm"
          >
            Create Meetup (Test Host Selection)
          </button>
          <button
            onClick={() => navigate('/profile')}
            className="bg-purple-600 hover:bg-purple-500 text-white py-2 px-4 rounded-lg font-medium text-sm"
          >
            Go to Profile (Personal Stripe)
          </button>
          {userClubs.length > 0 && (
            <button
              onClick={() => navigate(`/clubs/${userClubs[0].id}`)}
              className="bg-blue-600 hover:bg-blue-500 text-white py-2 px-4 rounded-lg font-medium text-sm"
            >
              Go to Club Settings (Club Stripe)
            </button>
          )}
          <button
            onClick={() => window.location.reload()}
            className="bg-gray-600 hover:bg-gray-500 text-white py-2 px-4 rounded-lg font-medium text-sm"
          >
            Refresh Data
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="mt-6 p-4 bg-gray-900 rounded-lg border border-gray-700">
        <h3 className="font-bold text-white mb-2">📋 Summary</h3>
        <ul className="space-y-1 text-sm">
          <li className="flex items-center gap-2">
            {personalStripeReady ? (
              <span className="text-green-400">✓</span>
            ) : (
              <span className="text-red-400">✗</span>
            )}
            <span className={personalStripeReady ? 'text-green-300' : 'text-gray-400'}>
              Personal Stripe: {personalStripeReady ? 'Ready to accept payments' : 'Not ready'}
            </span>
          </li>
          {userClubs.map((club) => {
            const ready = club.stripeChargesEnabled && club.stripePayoutsEnabled;
            return (
              <li key={club.id} className="flex items-center gap-2">
                {ready ? (
                  <span className="text-green-400">✓</span>
                ) : (
                  <span className="text-red-400">✗</span>
                )}
                <span className={ready ? 'text-green-300' : 'text-gray-400'}>
                  {club.name}: {ready ? 'Ready to accept payments' : 'Not ready'}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Remove before production warning */}
      <div className="mt-6 text-center">
        <p className="text-yellow-500 text-xs">
          ⚠️ Remember to remove this debug page before going to production!
        </p>
      </div>
    </div>
  );
};

export default StripeDebugPage;