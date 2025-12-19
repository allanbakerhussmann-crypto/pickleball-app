/**
 * CreateMeetup Component (Extended with Payments, Competition & Club Hosting)
 * 
 * Form for creating a new meetup with:
 * - Host selection (Individual Organizer OR Club)
 * - Basic info (title, date, location)
 * - Pricing options (entry fee, prize pool)
 * - Fee handling (organizer or player pays)
 * - Competition type selection
 * - Stripe Connect requirement for paid meetups
 * 
 * FILE LOCATION: components/meetups/CreateMeetup.tsx
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { createMeetup, getUserClubs } from '../../services/firebase';
import { doc, getDoc } from '@firebase/firestore';
import { db } from '../../services/firebase';
import { LocationPicker } from './LocationPicker';
import { 
  calculateFees, 
  PLATFORM_FEE_PERCENT,
  STRIPE_FEE_PERCENT,
  STRIPE_FEE_FIXED,
} from '../../services/stripe';
import type { Club } from '../../types';

// ============================================
// TYPES
// ============================================

type MeetupCompetitionType = 
  | 'casual'
  | 'round_robin'
  | 'single_elimination'
  | 'double_elimination'
  | 'king_of_court'
  | 'ladder'
  | 'swiss'
  | 'pool_play_knockout';

type FeePaidBy = 'organizer' | 'player';
type HostType = 'organizer' | 'club';

interface CreateMeetupProps {
  onBack: () => void;
  onCreated: () => void;
}

// ============================================
// CONSTANTS
// ============================================

const COMPETITION_TYPES: { value: MeetupCompetitionType; label: string; description: string }[] = [
  { value: 'casual', label: 'Casual Play', description: 'No formal competition, just social games' },
  { value: 'round_robin', label: 'Round Robin', description: 'Everyone plays everyone, points determine winner' },
  { value: 'single_elimination', label: 'Single Elimination', description: 'Lose once and you\'re out' },
  { value: 'double_elimination', label: 'Double Elimination', description: 'Must lose twice to be eliminated' },
  { value: 'king_of_court', label: 'King of the Court', description: 'Winners stay on, losers rotate out' },
  { value: 'ladder', label: 'Ladder', description: 'Challenge players above you to move up' },
  { value: 'swiss', label: 'Swiss System', description: 'Players paired by similar records each round' },
  { value: 'pool_play_knockout', label: 'Pool Play + Knockout', description: 'Group stage then elimination bracket' },
];

const PRIZE_DISTRIBUTIONS = [
  { label: 'Winner Takes All', value: { first: 100, second: 0, third: 0 } },
  { label: 'Top 2 (70/30)', value: { first: 70, second: 30, third: 0 } },
  { label: 'Top 3 (50/30/20)', value: { first: 50, second: 30, third: 20 } },
  { label: 'Top 4 (40/30/20/10)', value: { first: 40, second: 30, third: 20, fourth: 10 } },
];

// ============================================
// COMPONENT
// ============================================

export const CreateMeetup: React.FC<CreateMeetupProps> = ({ onBack, onCreated }) => {
  const { currentUser, userProfile } = useAuth();
  
  // Step management
  const [step, setStep] = useState(1);
  
  // Host selection
  const [hostType, setHostType] = useState<HostType>('organizer');
  const [selectedClubId, setSelectedClubId] = useState<string>('');
  const [userClubs, setUserClubs] = useState<Club[]>([]);
  const [loadingClubs, setLoadingClubs] = useState(true);
  
  // Basic info
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [maxPlayers, setMaxPlayers] = useState('16');
  const [locationName, setLocationName] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [visibility, setVisibility] = useState<'public' | 'linkOnly' | 'private'>('public');
  
  // Pricing
  const [pricingEnabled, setPricingEnabled] = useState(false);
  const [entryFee, setEntryFee] = useState('');
  const [prizePoolEnabled, setPrizePoolEnabled] = useState(false);
  const [prizePoolContribution, setPrizePoolContribution] = useState('');
  const [prizeDistributionIndex, setPrizeDistributionIndex] = useState(2);
  const [feesPaidBy, setFeesPaidBy] = useState<FeePaidBy>('organizer');
  
  // Competition
  const [competitionType, setCompetitionType] = useState<MeetupCompetitionType>('casual');
  const [managedInApp, setManagedInApp] = useState(true);
  
  // Stripe status - organizer
  const [organizerStripeAccountId, setOrganizerStripeAccountId] = useState<string | null>(null);
  const [organizerStripeReady, setOrganizerStripeReady] = useState(false);
  
  // Stripe status - club
  const [clubStripeAccountId, setClubStripeAccountId] = useState<string | null>(null);
  const [clubStripeReady, setClubStripeReady] = useState(false);
  
  const [loadingStripe, setLoadingStripe] = useState(true);
  
  // Form state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================
  // LOAD USER'S CLUBS
  // ============================================

  useEffect(() => {
    const loadClubs = async () => {
      if (!currentUser) {
        setLoadingClubs(false);
        return;
      }
      try {
        const clubs = await getUserClubs(currentUser.uid);
        const adminClubs = clubs.filter(c => 
          c.createdByUserId === currentUser.uid || 
          c.admins?.includes(currentUser.uid)
        );
        setUserClubs(adminClubs);
      } catch (err) {
        console.error('Failed to load clubs:', err);
      } finally {
        setLoadingClubs(false);
      }
    };
    loadClubs();
  }, [currentUser]);

  // ============================================
  // LOAD ORGANIZER STRIPE STATUS
  // ============================================

  useEffect(() => {
    const loadOrganizerStripeStatus = async () => {
      if (!currentUser) {
        setLoadingStripe(false);
        return;
      }
      try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.stripeConnectedAccountId && data.stripeChargesEnabled) {
            setOrganizerStripeAccountId(data.stripeConnectedAccountId);
            setOrganizerStripeReady(true);
          }
        }
      } catch (err) {
        console.error('Failed to load organizer Stripe status:', err);
      } finally {
        setLoadingStripe(false);
      }
    };
    loadOrganizerStripeStatus();
  }, [currentUser]);

  // ============================================
  // LOAD CLUB STRIPE STATUS WHEN CLUB SELECTED
  // ============================================

  useEffect(() => {
    const loadClubStripeStatus = async () => {
      if (!selectedClubId) {
        setClubStripeAccountId(null);
        setClubStripeReady(false);
        return;
      }
      try {
        const clubDoc = await getDoc(doc(db, 'clubs', selectedClubId));
        if (clubDoc.exists()) {
          const data = clubDoc.data();
          if (data.stripeConnectedAccountId && data.stripeChargesEnabled) {
            setClubStripeAccountId(data.stripeConnectedAccountId);
            setClubStripeReady(true);
          } else {
            setClubStripeAccountId(null);
            setClubStripeReady(false);
          }
        }
      } catch (err) {
        console.error('Failed to load club Stripe status:', err);
        setClubStripeAccountId(null);
        setClubStripeReady(false);
      }
    };
    loadClubStripeStatus();
  }, [selectedClubId]);

  // ============================================
  // COMPUTED VALUES
  // ============================================

  const stripeReady = hostType === 'club' ? clubStripeReady : organizerStripeReady;
  const selectedClub = userClubs.find(c => c.id === selectedClubId);

  const entryFeeCents = useMemo(() => {
    const fee = parseFloat(entryFee) || 0;
    return Math.round(fee * 100);
  }, [entryFee]);

  const prizePoolCents = useMemo(() => {
    const pool = parseFloat(prizePoolContribution) || 0;
    return Math.round(pool * 100);
  }, [prizePoolContribution]);

  const totalPerPersonCents = useMemo(() => {
    return entryFeeCents + (prizePoolEnabled ? prizePoolCents : 0);
  }, [entryFeeCents, prizePoolCents, prizePoolEnabled]);

  const feeCalculation = useMemo(() => {
    if (totalPerPersonCents === 0) return null;
    return calculateFees(totalPerPersonCents, feesPaidBy);
  }, [totalPerPersonCents, feesPaidBy]);

  const estimatedPrizePool = useMemo(() => {
    if (!prizePoolEnabled || !prizePoolCents) return 0;
    const players = parseInt(maxPlayers) || 0;
    return prizePoolCents * players;
  }, [prizePoolEnabled, prizePoolCents, maxPlayers]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleLocationChange = (address: string, newLat: number, newLng: number) => {
    setLocationName(address);
    setLat(newLat);
    setLng(newLng);
  };

  const validateStep1 = (): boolean => {
    if (hostType === 'club' && !selectedClubId) {
      setError('Please select a club to host this meetup');
      return false;
    }
    if (!title.trim()) {
      setError('Please enter a title');
      return false;
    }
    if (!date) {
      setError('Please select a date');
      return false;
    }
    if (!time) {
      setError('Please select a start time');
      return false;
    }
    if (!locationName) {
      setError('Please select a location');
      return false;
    }
    setError(null);
    return true;
  };

  const validateStep2 = (): boolean => {
    if (pricingEnabled && !stripeReady) {
      const hostName = hostType === 'club' ? 'This club' : 'You';
      setError(`${hostName} must connect Stripe to accept payments`);
      return false;
    }
    if (pricingEnabled && entryFeeCents === 0 && !prizePoolEnabled) {
      setError('Please set an entry fee or enable prize pool');
      return false;
    }
    if (prizePoolEnabled && prizePoolCents === 0) {
      setError('Please set a prize pool contribution amount');
      return false;
    }
    setError(null);
    return true;
  };

  const handleSubmit = async () => {
    if (!currentUser) return;
    setError(null);
    setIsSubmitting(true);

    try {
      const when = new Date(date + 'T' + time).getTime();
      if (isNaN(when)) throw new Error('Invalid date/time');

      const meetupData: any = {
        title: title.trim(),
        description: description.trim(),
        when,
        endTime: endTime ? new Date(date + 'T' + endTime).getTime() : null,
        visibility,
        maxPlayers: parseInt(maxPlayers, 10) || 0,
        locationName,
        createdByUserId: currentUser.uid,
        status: 'active',
      };

      if (hostType === 'club' && selectedClub) {
        meetupData.clubId = selectedClub.id;
        meetupData.clubName = selectedClub.name;
        meetupData.organizerName = selectedClub.name;
        meetupData.hostedBy = 'club';
      } else {
        meetupData.organizerName = userProfile?.displayName || 'Organizer';
        meetupData.hostedBy = 'organizer';
      }

      if (lat && lng) {
        meetupData.location = { lat, lng };
      }

      if (pricingEnabled && totalPerPersonCents > 0) {
        meetupData.pricing = {
          enabled: true,
          entryFee: entryFeeCents,
          prizePoolEnabled,
          prizePoolContribution: prizePoolEnabled ? prizePoolCents : 0,
          prizeDistribution: prizePoolEnabled ? PRIZE_DISTRIBUTIONS[prizeDistributionIndex].value : null,
          feesPaidBy,
          totalPerPerson: feeCalculation?.playerPays || totalPerPersonCents,
          currency: 'nzd',
        };
        
        if (hostType === 'club' && clubStripeAccountId) {
          meetupData.organizerStripeAccountId = clubStripeAccountId;
        } else if (organizerStripeAccountId) {
          meetupData.organizerStripeAccountId = organizerStripeAccountId;
        }
      }

      if (competitionType !== 'casual') {
        meetupData.competition = {
          managedInApp,
          type: competitionType,
          settings: { gamesPerMatch: 1, pointsPerWin: 1, pointsPerDraw: 0 },
        };
      }

      await createMeetup(meetupData);
      onCreated();
    } catch (err: any) {
      console.error('Failed to create meetup:', err);
      setError(err.message || 'Failed to create meetup');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (cents: number): string => `\$${(cents / 100).toFixed(2)}`;

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="max-w-2xl mx-auto p-4">
      <button onClick={onBack} className="text-gray-400 hover:text-white mb-4 flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      {/* Progress Steps */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3].map((s) => (
          <React.Fragment key={s}>
            <button
              onClick={() => s < step && setStep(s)}
              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${
                s === step ? 'bg-green-600 text-white' : s < step ? 'bg-green-900 text-green-400 hover:bg-green-800' : 'bg-gray-700 text-gray-500'
              }`}
            >
              {s}
            </button>
            {s < 3 && <div className={`flex-1 h-1 rounded ${s < step ? 'bg-green-600' : 'bg-gray-700'}`}></div>}
          </React.Fragment>
        ))}
      </div>

      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-2xl font-bold text-white mb-6">
          {step === 1 ? 'Create Meetup' : step === 2 ? 'Pricing' : 'Competition Format'}
        </h2>

        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-4">{error}</div>
        )}

        {/* Step 1: Basic Info */}
        {step === 1 && (
          <div className="space-y-4">
            {/* HOST SELECTION */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-400 mb-2">Who is hosting this meetup?</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => { setHostType('organizer'); setSelectedClubId(''); }}
                  className={`p-4 rounded-lg border text-left transition-colors ${
                    hostType === 'organizer' ? 'border-green-500 bg-green-900/30' : 'border-gray-600 bg-gray-900/50 hover:border-gray-500'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${hostType === 'organizer' ? 'bg-green-600' : 'bg-gray-700'}`}>
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div>
                      <p className={`font-medium ${hostType === 'organizer' ? 'text-green-400' : 'text-white'}`}>Me (Individual)</p>
                      <p className="text-xs text-gray-500">Host as yourself</p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setHostType('club')}
                  disabled={userClubs.length === 0 && !loadingClubs}
                  className={`p-4 rounded-lg border text-left transition-colors ${
                    hostType === 'club' ? 'border-green-500 bg-green-900/30'
                      : userClubs.length === 0 && !loadingClubs ? 'border-gray-700 bg-gray-900/30 cursor-not-allowed opacity-50'
                      : 'border-gray-600 bg-gray-900/50 hover:border-gray-500'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${hostType === 'club' ? 'bg-green-600' : 'bg-gray-700'}`}>
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </div>
                    <div>
                      <p className={`font-medium ${hostType === 'club' ? 'text-green-400' : 'text-white'}`}>My Club</p>
                      <p className="text-xs text-gray-500">{loadingClubs ? 'Loading...' : userClubs.length === 0 ? 'No clubs available' : 'Host as a club'}</p>
                    </div>
                  </div>
                </button>
              </div>

              {hostType === 'club' && userClubs.length > 0 && (
                <div className="mt-3">
                  <select
                    value={selectedClubId}
                    onChange={(e) => setSelectedClubId(e.target.value)}
                    className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                  >
                    <option value="">Select a club...</option>
                    {userClubs.map((club) => (
                      <option key={club.id} value={club.id}>{club.name}</option>
                    ))}
                  </select>
                  
                  {selectedClub && (
                    <div className="mt-2 p-3 bg-gray-900/50 rounded-lg border border-gray-700">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-900/50 flex items-center justify-center">
                          <span className="text-blue-400 font-bold">{selectedClub.name[0]}</span>
                        </div>
                        <div>
                          <p className="text-white font-medium">{selectedClub.name}</p>
                          <p className="text-xs text-gray-500">
                            {clubStripeReady ? <span className="text-green-400">✓ Payments enabled</span> : <span className="text-yellow-400">⚠ Stripe not connected</span>}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {hostType === 'club' && userClubs.length === 0 && !loadingClubs && (
                <div className="mt-3 p-3 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
                  <p className="text-yellow-400 text-sm">You're not an admin of any clubs. Create a club first or host as an individual organizer.</p>
                </div>
              )}
            </div>

            <hr className="border-gray-700 my-4" />

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Meetup Title *</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g., Friday Night Pickleball" className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What should players know about this meetup?" rows={3} className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none resize-none" />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Date *</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Start Time *</label>
                <input type="time" value={time} onChange={e => setTime(e.target.value)} className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">End Time</label>
                <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Max Players</label>
              <input type="number" value={maxPlayers} onChange={e => setMaxPlayers(e.target.value)} min="2" max="100" className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Location *</label>
              <LocationPicker address={locationName} lat={lat} lng={lng} onLocationChange={handleLocationChange} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Visibility</label>
              <select value={visibility} onChange={e => setVisibility(e.target.value as any)} className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none">
                <option value="public">Public - Anyone can see and join</option>
                <option value="linkOnly">Link Only - Only people with the link</option>
                <option value="private">Private - Invite only</option>
              </select>
            </div>

            <div className="flex justify-end pt-4">
              <button onClick={() => validateStep1() && setStep(2)} className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-semibold">Next: Pricing</button>
            </div>
          </div>
        )}

        {/* Step 2: Pricing */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg">
              <div>
                <h3 className="text-white font-medium">Charge for this meetup?</h3>
                <p className="text-sm text-gray-400">Collect entry fees and/or prize pool contributions</p>
              </div>
              <button onClick={() => setPricingEnabled(!pricingEnabled)} className={`relative w-14 h-8 rounded-full transition-colors ${pricingEnabled ? 'bg-green-600' : 'bg-gray-600'}`}>
                <span className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-transform ${pricingEnabled ? 'translate-x-7' : 'translate-x-1'}`}></span>
              </button>
            </div>

            {pricingEnabled && (
              <>
                {loadingStripe ? (
                  <div className="bg-gray-900/50 rounded-lg p-4 text-center">
                    <div className="animate-spin w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                    <p className="text-gray-400 text-sm">Checking payment setup...</p>
                  </div>
                ) : !stripeReady ? (
                  <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <svg className="w-6 h-6 text-yellow-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <div>
                        <p className="text-yellow-300 font-medium">{hostType === 'club' ? 'Club needs to connect Stripe' : 'Connect Stripe to accept payments'}</p>
                        <p className="text-yellow-400/70 text-sm mt-1">{hostType === 'club' ? 'The selected club must have Stripe connected.' : 'You need to connect your Stripe account.'}</p>
                        <a href={hostType === 'club' ? `/#/clubs/${selectedClubId}` : '/#/profile'} className="inline-flex items-center gap-2 bg-yellow-600 hover:bg-yellow-500 text-white px-4 py-2 rounded-lg text-sm font-medium mt-3">
                          {hostType === 'club' ? 'Go to Club Settings' : 'Connect Stripe'}
                        </a>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-green-900/30 border border-green-700/50 rounded-lg p-3 flex items-center gap-2">
                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-green-300 text-sm">{hostType === 'club' ? `${selectedClub?.name} - Stripe connected` : 'Stripe connected - ready to accept payments'}</span>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Entry Fee (goes to {hostType === 'club' ? 'club' : 'you'})</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                    <input type="number" value={entryFee} onChange={e => setEntryFee(e.target.value)} min="0" step="0.50" placeholder="0.00" className="w-full bg-gray-900 text-white p-3 pl-8 rounded border border-gray-600 focus:border-green-500 outline-none" />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-white font-medium">Prize Pool</h4>
                      <p className="text-sm text-gray-400">Players contribute to a prize pool for winners</p>
                    </div>
                    <button onClick={() => setPrizePoolEnabled(!prizePoolEnabled)} className={`relative w-14 h-8 rounded-full transition-colors ${prizePoolEnabled ? 'bg-green-600' : 'bg-gray-600'}`}>
                      <span className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-transform ${prizePoolEnabled ? 'translate-x-7' : 'translate-x-1'}`}></span>
                    </button>
                  </div>

                  {prizePoolEnabled && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Prize Pool Contribution (per person)</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                          <input type="number" value={prizePoolContribution} onChange={e => setPrizePoolContribution(e.target.value)} min="0" step="1" placeholder="0.00" className="w-full bg-gray-900 text-white p-3 pl-8 rounded border border-gray-600 focus:border-green-500 outline-none" />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Prize Distribution</label>
                        <select value={prizeDistributionIndex} onChange={e => setPrizeDistributionIndex(parseInt(e.target.value))} className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none">
                          {PRIZE_DISTRIBUTIONS.map((dist, idx) => (
                            <option key={idx} value={idx}>{dist.label}</option>
                          ))}
                        </select>
                      </div>

                      {estimatedPrizePool > 0 && (
                        <div className="bg-gray-900/50 rounded-lg p-3 text-sm">
                          <p className="text-gray-400">Estimated prize pool ({maxPlayers} players): <span className="text-green-400 font-bold ml-1">{formatCurrency(estimatedPrizePool)}</span></p>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Who pays platform & Stripe fees?</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setFeesPaidBy('organizer')} className={`p-3 rounded-lg border text-left transition-colors ${feesPaidBy === 'organizer' ? 'border-green-500 bg-green-900/30' : 'border-gray-600 bg-gray-900/50 hover:border-gray-500'}`}>
                      <p className={`font-medium ${feesPaidBy === 'organizer' ? 'text-green-400' : 'text-white'}`}>{hostType === 'club' ? 'Club absorbs fees' : "I'll absorb fees"}</p>
                      <p className="text-xs text-gray-400 mt-1">Players pay {formatCurrency(totalPerPersonCents)}</p>
                    </button>
                    <button onClick={() => setFeesPaidBy('player')} className={`p-3 rounded-lg border text-left transition-colors ${feesPaidBy === 'player' ? 'border-green-500 bg-green-900/30' : 'border-gray-600 bg-gray-900/50 hover:border-gray-500'}`}>
                      <p className={`font-medium ${feesPaidBy === 'player' ? 'text-green-400' : 'text-white'}`}>Players pay fees</p>
                      <p className="text-xs text-gray-400 mt-1">Players pay {feeCalculation ? formatCurrency(feeCalculation.playerPays) : formatCurrency(totalPerPersonCents)}</p>
                    </button>
                  </div>
                </div>

                {feeCalculation && totalPerPersonCents > 0 && (
                  <div className="bg-gray-900/50 rounded-lg p-4">
                    <h4 className="text-white font-medium mb-3">Payment Summary</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-gray-400">Entry fee</span><span className="text-white">{formatCurrency(entryFeeCents)}</span></div>
                      {prizePoolEnabled && <div className="flex justify-between"><span className="text-gray-400">Prize pool contribution</span><span className="text-white">{formatCurrency(prizePoolCents)}</span></div>}
                      <div className="flex justify-between text-gray-500"><span>Platform fee ({PLATFORM_FEE_PERCENT}%)</span><span>{formatCurrency(feeCalculation.platformFee)}</span></div>
                      <div className="flex justify-between text-gray-500"><span>Stripe fee (~{STRIPE_FEE_PERCENT}% + {STRIPE_FEE_FIXED}¢)</span><span>{formatCurrency(feeCalculation.stripeFee)}</span></div>
                      <hr className="border-gray-700" />
                      <div className="flex justify-between font-bold"><span className="text-gray-300">Player pays</span><span className="text-green-400">{formatCurrency(feeCalculation.playerPays)}</span></div>
                      <div className="flex justify-between font-bold"><span className="text-gray-300">{hostType === 'club' ? 'Club receives' : 'You receive'}</span><span className="text-white">{formatCurrency(feeCalculation.organizerReceives)}</span></div>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="flex justify-between pt-4">
              <button onClick={() => setStep(1)} className="text-gray-400 hover:text-white px-4 py-2">Back</button>
              <button onClick={() => validateStep2() && setStep(3)} className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-semibold">Next: Competition</button>
            </div>
          </div>
        )}

        {/* Step 3: Competition */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-3">Competition Format</label>
              <div className="grid gap-3">
                {COMPETITION_TYPES.map((type) => (
                  <button key={type.value} onClick={() => setCompetitionType(type.value)} className={`p-4 rounded-lg border text-left transition-colors ${competitionType === type.value ? 'border-green-500 bg-green-900/30' : 'border-gray-600 bg-gray-900/50 hover:border-gray-500'}`}>
                    <p className={`font-medium ${competitionType === type.value ? 'text-green-400' : 'text-white'}`}>{type.label}</p>
                    <p className="text-sm text-gray-500">{type.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {competitionType !== 'casual' && (
              <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg">
                <div>
                  <h3 className="text-white font-medium">Manage brackets in app?</h3>
                  <p className="text-sm text-gray-400">Track matches and standings automatically</p>
                </div>
                <button onClick={() => setManagedInApp(!managedInApp)} className={`relative w-14 h-8 rounded-full transition-colors ${managedInApp ? 'bg-green-600' : 'bg-gray-600'}`}>
                  <span className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-transform ${managedInApp ? 'translate-x-7' : 'translate-x-1'}`}></span>
                </button>
              </div>
            )}

            <div className="bg-gray-900/50 rounded-lg p-4">
              <h4 className="text-white font-medium mb-3">Meetup Summary</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">Host</span><span className="text-white">{hostType === 'club' ? selectedClub?.name : userProfile?.displayName || 'You'}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Title</span><span className="text-white truncate ml-4">{title}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Date</span><span className="text-white">{date} at {time}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Max Players</span><span className="text-white">{maxPlayers}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Entry</span><span className="text-white">{pricingEnabled && totalPerPersonCents > 0 ? formatCurrency(feeCalculation?.playerPays || totalPerPersonCents) : 'Free'}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Format</span><span className="text-white">{COMPETITION_TYPES.find(t => t.value === competitionType)?.label}</span></div>
              </div>
            </div>

            <div className="flex justify-between pt-4">
              <button onClick={() => setStep(2)} className="text-gray-400 hover:text-white px-4 py-2">Back</button>
              <button onClick={handleSubmit} disabled={isSubmitting} className="bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white px-6 py-2 rounded-lg font-semibold flex items-center gap-2">
                {isSubmitting ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>Creating...</>) : 'Create Meetup'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreateMeetup;