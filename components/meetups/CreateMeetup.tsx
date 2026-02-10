/**
 * CreateMeetup Component (Enhanced with Game Format Settings)
 *
 * Form for creating a new meetup with:
 * - Host selection (Individual Organizer OR Club)
 * - Basic info (title, date, location)
 * - Pricing options (entry fee, prize pool)
 * - Fee handling (organizer or player pays)
 * - Competition type selection (using FormatCards V06.00)
 * - Game format settings (points, games, scoring system)
 * - Stripe Connect requirement for paid meetups
 *
 * FILE LOCATION: components/meetups/CreateMeetup.tsx
 * VERSION: V06.00 - Integrated FormatCards for unified format selection
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
import type { CompetitionFormat } from '../../types/formats';
import { getFormatOption } from '../../types/formats';
import { FormatCards } from '../shared/FormatSelector';
import { RollingTimePicker } from '../shared/RollingTimePicker';
import { CoHostPicker } from './CoHostPicker';

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
type ScoringSystem = 'rally' | 'traditional';

interface CreateMeetupProps {
  onBack: () => void;
  onCreated: () => void;
}

interface GameFormatSettings {
  pointsToWin: 11 | 15 | 21;
  winBy: 1 | 2;
  gamesPerMatch: 1 | 3 | 5;
  scoringSystem: ScoringSystem;
  timeLimit: number | null; // minutes, null = no limit
  // Standings points (for round robin, swiss, pool play)
  pointsPerWin: number;
  pointsPerDraw: number;
  pointsPerLoss: number;
}

// ============================================
// CONSTANTS
// ============================================

const COMPETITION_TYPES: { value: MeetupCompetitionType; label: string; description: string; icon: string }[] = [
  { value: 'casual', label: 'Casual Play', description: 'No formal competition, just social games', icon: '🎾' },
  { value: 'round_robin', label: 'Round Robin', description: 'Everyone plays everyone, points determine winner', icon: '🔄' },
  { value: 'single_elimination', label: 'Single Elimination', description: 'Lose once and you\'re out', icon: '🏆' },
  { value: 'double_elimination', label: 'Double Elimination', description: 'Must lose twice to be eliminated', icon: '🥇' },
  { value: 'king_of_court', label: 'King of the Court', description: 'Winners stay on, losers rotate out', icon: '👑' },
  { value: 'ladder', label: 'Ladder', description: 'Challenge players above you to move up', icon: '🪜' },
  { value: 'swiss', label: 'Swiss System', description: 'Players paired by similar records each round', icon: '🎯' },
  { value: 'pool_play_knockout', label: 'Pool Play + Knockout', description: 'Group stage then elimination bracket', icon: '📊' },
];

const PRIZE_DISTRIBUTIONS = [
  { label: 'Winner Takes All', value: { first: 100, second: 0, third: 0 } },
  { label: 'Top 2 (70/30)', value: { first: 70, second: 30, third: 0 } },
  { label: 'Top 3 (50/30/20)', value: { first: 50, second: 30, third: 20 } },
  { label: 'Top 4 (40/30/20/10)', value: { first: 40, second: 30, third: 20, fourth: 10 } },
];

const POINTS_OPTIONS = [
  { value: 11, label: '11 Points', description: 'Standard recreational' },
  { value: 15, label: '15 Points', description: 'Extended games' },
  { value: 21, label: '21 Points', description: 'Tournament standard' },
];

const GAMES_PER_MATCH_OPTIONS = [
  { value: 1, label: 'Single Game', description: 'Quick matches' },
  { value: 3, label: 'Best of 3', description: 'Standard format' },
  { value: 5, label: 'Best of 5', description: 'Extended matches' },
];

const TIME_LIMIT_OPTIONS = [
  { value: null, label: 'No Limit', description: 'Play to completion' },
  { value: 10, label: '10 Minutes', description: 'Quick games' },
  { value: 15, label: '15 Minutes', description: 'Standard time cap' },
  { value: 20, label: '20 Minutes', description: 'Extended time cap' },
  { value: 30, label: '30 Minutes', description: 'Long matches' },
];

// Default game format settings
const DEFAULT_GAME_FORMAT: GameFormatSettings = {
  pointsToWin: 11,
  winBy: 2,
  gamesPerMatch: 1,
  scoringSystem: 'rally',
  timeLimit: null,
  pointsPerWin: 2,
  pointsPerDraw: 1,
  pointsPerLoss: 0,
};

/**
 * Map CompetitionFormat to MeetupCompetitionType
 * Meetups use slightly different type names
 */
const mapCompetitionFormatToMeetup = (format: CompetitionFormat): MeetupCompetitionType => {
  switch (format) {
    case 'round_robin':
      return 'round_robin';
    case 'singles_elimination':
    case 'doubles_elimination':
      return 'single_elimination';
    case 'king_of_court':
      return 'king_of_court';
    case 'ladder':
      return 'ladder';
    case 'swiss':
      return 'swiss';
    case 'pool_play_medals':
      return 'pool_play_knockout';
    case 'rotating_doubles_box':
    case 'fixed_doubles_box':
      return 'round_robin'; // Box formats map to round robin for meetups
    case 'team_league_interclub':
      return 'round_robin'; // Team league maps to round robin for meetups
    default:
      return 'casual';
  }
};

// ============================================
// COMPONENT
// ============================================

export const CreateMeetup: React.FC<CreateMeetupProps> = ({ onBack, onCreated }) => {
  const { currentUser, userProfile, isAppAdmin } = useAuth();
  
  // Step management
  const [step, setStep] = useState(1);
  
  // Host selection
  const [hostType, setHostType] = useState<HostType>('organizer');
  const [selectedClubId, setSelectedClubId] = useState<string>('');
  const [userClubs, setUserClubs] = useState<Club[]>([]);
  const [, setLoadingClubs] = useState(true); // Used in useEffect
  
  // Basic info
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('08:00');
  const [endTime, setEndTime] = useState('10:00');
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
  const [selectedFormat, setSelectedFormat] = useState<CompetitionFormat | 'casual'>('casual');
  const [managedInApp, setManagedInApp] = useState(true);

  // Handle format card selection
  const handleFormatSelect = (format: CompetitionFormat) => {
    setSelectedFormat(format);
    setCompetitionType(mapCompetitionFormatToMeetup(format));
  };

  // Handle casual selection (special case - not in FormatCards)
  const handleCasualSelect = () => {
    setSelectedFormat('casual');
    setCompetitionType('casual');
  };
  
  // Game Format Settings (NEW)
  const [gameFormat, setGameFormat] = useState<GameFormatSettings>(DEFAULT_GAME_FORMAT);
  
  // Format-specific settings
  const [numberOfRounds, setNumberOfRounds] = useState(3); // Swiss
  const [poolSize, setPoolSize] = useState(4); // Pool play
  const [teamsAdvancing, setTeamsAdvancing] = useState(2); // Pool play
  const [winStreak, setWinStreak] = useState(2); // King of court
  const [consolationBracket, setConsolationBracket] = useState(false); // Elimination
  const [thirdPlaceMatch, setThirdPlaceMatch] = useState(true); // Elimination
  
  // Stripe status - organizer
  const [organizerStripeAccountId, setOrganizerStripeAccountId] = useState<string | null>(null);
  const [organizerStripeReady, setOrganizerStripeReady] = useState(false);
  
  // Stripe status - club
  const [clubStripeAccountId, setClubStripeAccountId] = useState<string | null>(null);
  const [clubStripeReady, setClubStripeReady] = useState(false);
  
  const [, setLoadingStripe] = useState(true); // Used in useEffect
  
  // RSVP Settings (new)
  const [requirePayment, setRequirePayment] = useState(true);
  const [waitlistEnabled, setWaitlistEnabled] = useState(true);
  const [refundDeadlineHours, setRefundDeadlineHours] = useState(24);
  const [checkInEnabled, setCheckInEnabled] = useState(true);
  const [rsvpSettingsExpanded, setRsvpSettingsExpanded] = useState(false);

  // Co-hosts (new)
  const [coHostIds, setCoHostIds] = useState<string[]>([]);

  // Court Rotation (new)
  const [rotationEnabled, setRotationEnabled] = useState(false);
  const [rotationCourts, setRotationCourts] = useState(2);
  const [rotationPlayersPerCourt, setRotationPlayersPerCourt] = useState(4);

  // More Options (new)
  const [moreOptionsExpanded, setMoreOptionsExpanded] = useState(false);

  // Form state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================
  // COMPUTED VALUES
  // ============================================

  const selectedClub = useMemo(() => {
    return userClubs.find(c => c.id === selectedClubId) || null;
  }, [userClubs, selectedClubId]);

  const entryFeeCents = useMemo(() => Math.round((parseFloat(entryFee) || 0) * 100), [entryFee]);
  const prizePoolCents = useMemo(() => Math.round((parseFloat(prizePoolContribution) || 0) * 100), [prizePoolContribution]);
  const totalPerPersonCents = useMemo(() => entryFeeCents + prizePoolCents, [entryFeeCents, prizePoolCents]);

  const feeCalculation = useMemo(() => {
    if (!pricingEnabled || totalPerPersonCents <= 0) return null;
    return calculateFees(totalPerPersonCents, feesPaidBy);
  }, [pricingEnabled, totalPerPersonCents, feesPaidBy]);

  const canAcceptPayments = useMemo(() => {
    if (hostType === 'club') {
      return clubStripeReady;
    }
    return organizerStripeReady;
  }, [hostType, clubStripeReady, organizerStripeReady]);

  // Check if format needs standings points
  const needsStandingsPoints = useMemo(() => {
    return ['round_robin', 'swiss', 'pool_play_knockout', 'ladder'].includes(competitionType);
  }, [competitionType]);

  // Check if format has specific settings
  const hasFormatSpecificSettings = useMemo(() => {
    return ['swiss', 'pool_play_knockout', 'king_of_court', 'single_elimination', 'double_elimination'].includes(competitionType);
  }, [competitionType]);

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
        // getUserClubs already returns clubs where user is admin/member
        setUserClubs(clubs);
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
    const checkOrganizerStripe = async () => {
      if (!currentUser) {
        setLoadingStripe(false);
        return;
      }
      try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setOrganizerStripeAccountId(data.stripeConnectedAccountId || null);
          setOrganizerStripeReady(data.stripeChargesEnabled === true && data.stripePayoutsEnabled === true);
        }
      } catch (err) {
        console.error('Failed to check organizer Stripe status:', err);
      } finally {
        setLoadingStripe(false);
      }
    };
    checkOrganizerStripe();
  }, [currentUser]);

  // ============================================
  // LOAD CLUB STRIPE STATUS
  // ============================================

  useEffect(() => {
    const checkClubStripe = async () => {
      if (!selectedClub) {
        setClubStripeAccountId(null);
        setClubStripeReady(false);
        return;
      }
      setClubStripeAccountId(selectedClub.stripeConnectedAccountId || null);
      setClubStripeReady(selectedClub.stripeChargesEnabled === true);
    };
    checkClubStripe();
  }, [selectedClub]);

  // ============================================
  // VALIDATION
  // ============================================

  const validateStep1 = (): boolean => {
    if (!title.trim()) {
      setError('Please enter a title');
      return false;
    }
    if (!date || !time) {
      setError('Please select date and time');
      return false;
    }
    if (!locationName.trim()) {
      setError('Please enter a location');
      return false;
    }
    setError(null);
    return true;
  };

  const validateStep2 = (): boolean => {
    if (pricingEnabled && totalPerPersonCents > 0) {
      // Check if trying to create paid meetup as non-admin club member
      if (hostType === 'club' && selectedClub) {
        const isAdmin = selectedClub.adminIds?.includes(currentUser?.uid || '');
        if (!isAdmin) {
          setError('Only club admins can create paid meetups on behalf of a club. You can create a paid meetup as yourself instead.');
          return false;
        }
      }
      // Check if host has Stripe connected
      if (!canAcceptPayments) {
        setError(`${hostType === 'club' ? 'This club' : 'You'} must connect Stripe before creating paid meetups. Go to ${hostType === 'club' ? 'Club Settings' : 'Profile'} → Payments to set up.`);
        return false;
      }
      // Also verify we actually have a Stripe account ID
      const stripeAccountId = hostType === 'club' ? clubStripeAccountId : organizerStripeAccountId;
      if (!stripeAccountId) {
        setError(`${hostType === 'club' ? 'This club' : 'You'} must connect Stripe before creating paid meetups.`);
        return false;
      }
    }
    setError(null);
    return true;
  };

  // ============================================
  // SUBMIT
  // ============================================

  const handleSubmit = async () => {
    console.log('handleSubmit called, currentUser:', currentUser?.uid);
    if (!currentUser) {
      console.log('No currentUser, returning early');
      return;
    }
    setIsSubmitting(true);
    setError(null);

    try {
      console.log('Starting meetup creation...');
      const meetupData: any = {
        title: title.trim(),
        description: description.trim(),
        when: new Date(date + 'T' + time).getTime(),
        endTime: endTime ? new Date(date + 'T' + endTime).getTime() : null,
        visibility,
        maxPlayers: parseInt(maxPlayers, 10) || 0,
        locationName,
        createdByUserId: currentUser.uid,
        status: 'active',
      };

      // Host info
      meetupData.hostId = currentUser.uid;
      meetupData.hostName = userProfile?.displayName || 'Organizer';
      if (hostType === 'club' && selectedClub) {
        meetupData.clubId = selectedClub.id;
        meetupData.clubName = selectedClub.name;
        meetupData.organizerName = selectedClub.name;
        meetupData.hostedBy = 'club';
      } else {
        meetupData.organizerName = userProfile?.displayName || 'Organizer';
        meetupData.hostedBy = 'organizer';
      }

      // Location coordinates
      if (lat && lng) {
        meetupData.location = { lat, lng };
      }

      // Pricing
      if (pricingEnabled && totalPerPersonCents > 0) {
        // Final safety check - must have Stripe account for paid meetups
        const stripeAccountId = hostType === 'club' ? clubStripeAccountId : organizerStripeAccountId;
        if (!stripeAccountId) {
          throw new Error(`Cannot create paid meetup: ${hostType === 'club' ? 'Club' : 'Organizer'} has no Stripe account connected.`);
        }

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

        meetupData.organizerStripeAccountId = stripeAccountId;

        // RSVP settings for paid meetups
        meetupData.rsvpSettings = {
          requirePayment,
          autoConfirm: true,
          refundDeadlineHours,
        };

        meetupData.cancellationPolicy = {
          refundDeadlineHours,
          noRefundAfterDeadline: true,
        };
      }

      // Waitlist
      meetupData.waitlistEnabled = waitlistEnabled;

      // Check-in
      meetupData.checkInEnabled = checkInEnabled;

      // Visibility (already set in meetupData from earlier)
      meetupData.visibility = visibility;

      // Initialize counters
      meetupData.confirmedCount = 0;
      meetupData.waitlistCount = 0;
      meetupData.checkedInCount = 0;
      meetupData.cancelledCount = 0;
      meetupData.noShowCount = 0;
      meetupData.guestCount = 0;
      meetupData.guestRevenue = 0;

      // Co-hosts
      if (coHostIds.length > 0) {
        meetupData.coHostIds = coHostIds;
      }

      // Court rotation
      if (rotationEnabled) {
        meetupData.rotationSettings = {
          courts: rotationCourts,
          playersPerCourt: rotationPlayersPerCourt,
          rotationType: 'round_robin',
          trackSitOuts: true,
        };
      }

      // Competition settings
      if (competitionType !== 'casual') {
        meetupData.competition = {
          managedInApp,
          type: competitionType,
          settings: {
            // Game format
            pointsToWin: gameFormat.pointsToWin,
            winBy: gameFormat.winBy,
            gamesPerMatch: gameFormat.gamesPerMatch,
            scoringSystem: gameFormat.scoringSystem,
            timeLimit: gameFormat.timeLimit,
            // Standings points
            pointsPerWin: gameFormat.pointsPerWin,
            pointsPerDraw: gameFormat.pointsPerDraw,
            pointsPerLoss: gameFormat.pointsPerLoss,
            // Format-specific
            ...(competitionType === 'swiss' && { numberOfRounds }),
            ...(competitionType === 'pool_play_knockout' && { poolSize, teamsAdvancing }),
            ...(competitionType === 'king_of_court' && { winStreak }),
            ...((competitionType === 'single_elimination' || competitionType === 'double_elimination') && { 
              consolationBracket, 
              thirdPlaceMatch 
            }),
          },
        };
      }

      console.log('Calling createMeetup with data:', meetupData);
      const meetupId = await createMeetup(meetupData);
      console.log('Meetup created successfully with ID:', meetupId);
      onCreated();
    } catch (err: any) {
      console.error('Failed to create meetup:', err);
      console.error('Error details:', JSON.stringify(err, null, 2));
      setError(err.message || 'Failed to create meetup');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================
  // HELPERS
  // ============================================

  const formatCurrency = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

  const updateGameFormat = (key: keyof GameFormatSettings, value: any) => {
    setGameFormat(prev => ({ ...prev, [key]: value }));
  };

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
                s === step ? 'bg-green-600 text-white' : s < step ? 'bg-green-600/50 text-green-200 cursor-pointer' : 'bg-gray-700 text-gray-400'
              }`}
            >
              {s}
            </button>
            {s < 3 && <div className={`flex-1 h-1 rounded ${s < step ? 'bg-green-600' : 'bg-gray-700'}`} />}
          </React.Fragment>
        ))}
      </div>

      {/* Step Labels */}
      <div className="flex justify-between mb-6 text-xs text-gray-500">
        <span className={step === 1 ? 'text-green-400' : ''}>Basic Info</span>
        <span className={step === 2 ? 'text-green-400' : ''}>Pricing</span>
        <span className={step === 3 ? 'text-green-400' : ''}>Competition</span>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-200 text-sm">
          {error}
        </div>
      )}

      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        
        {/* ============================================ */}
        {/* STEP 1: Basic Info */}
        {/* ============================================ */}
        {step === 1 && (
          <div className="space-y-6">
            {/* Host Selection */}
            {userClubs.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Host As</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => { setHostType('organizer'); setSelectedClubId(''); }}
                    className={`flex-1 p-3 rounded-lg border text-center transition-colors ${
                      hostType === 'organizer' ? 'border-green-500 bg-green-900/30 text-green-400' : 'border-gray-600 text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    👤 Myself
                  </button>
                  <button
                    onClick={() => setHostType('club')}
                    className={`flex-1 p-3 rounded-lg border text-center transition-colors ${
                      hostType === 'club' ? 'border-green-500 bg-green-900/30 text-green-400' : 'border-gray-600 text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    🏢 My Club
                  </button>
                </div>
                {hostType === 'club' && (
                  <select
                    value={selectedClubId}
                    onChange={(e) => setSelectedClubId(e.target.value)}
                    className="w-full mt-3 bg-gray-900 border border-gray-600 text-white p-3 rounded-lg focus:outline-none focus:border-green-500"
                  >
                    <option value="">Select a club...</option>
                    {userClubs.map((club) => {
                      const isAdmin = club.adminIds?.includes(currentUser?.uid || '');
                      return (
                        <option key={club.id} value={club.id}>
                          {club.name}{isAdmin ? ' (Admin)' : ''}
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>
            )}

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 text-white p-3 rounded-lg focus:outline-none focus:border-green-500"
                placeholder="e.g., Saturday Morning Pickleball"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 text-white p-3 rounded-lg focus:outline-none focus:border-green-500 min-h-[80px] resize-none"
                placeholder="Tell people what to expect..."
              />
            </div>

            {/* Date & Time */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Date *</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 text-white p-3 rounded-lg focus:outline-none focus:border-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Start *</label>
                <RollingTimePicker
                  value={time}
                  onChange={setTime}
                  placeholder="--:-- --"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">End</label>
                <RollingTimePicker
                  value={endTime}
                  onChange={setEndTime}
                  placeholder="--:-- --"
                />
              </div>
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Location *</label>
              <LocationPicker
                address={locationName}
                lat={lat}
                lng={lng}
                onLocationChange={(address: string, newLat: number, newLng: number) => {
                  setLocationName(address);
                  setLat(newLat);
                  setLng(newLng);
                }}
              />
            </div>

            {/* Max Players & Visibility */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Max Players</label>
                <input
                  type="number"
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 text-white p-3 rounded-lg focus:outline-none focus:border-green-500"
                  min="2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1 flex items-center gap-1">
                  Visibility
                  <div className="relative group">
                    <span className="inline-flex items-center justify-center w-4 h-4 text-xs bg-gray-700 text-gray-400 rounded-full cursor-help hover:bg-gray-600 hover:text-white">?</span>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-gray-800 border border-gray-600 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                      <div className="text-xs text-gray-300 space-y-2">
                        <div><span className="text-white font-medium">Public:</span> Appears in meetup listings. Anyone can discover and join.</div>
                        <div><span className="text-white font-medium">Link Only:</span> Hidden from listings. Only accessible via shared link.</div>
                        <div><span className="text-white font-medium">Private:</span> Invite only. You must add participants manually.</div>
                      </div>
                      <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-800"></div>
                    </div>
                  </div>
                </label>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as any)}
                  className="w-full bg-gray-900 border border-gray-600 text-white p-3 rounded-lg focus:outline-none focus:border-green-500"
                >
                  <option value="public">Public</option>
                  <option value="linkOnly">Link Only</option>
                  <option value="private">Private</option>
                </select>
                {visibility === 'private' && (
                  <div className="mt-2 p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg text-yellow-300 text-sm">
                    Private meetups are invite-only. After creating, use the Manage tab to invite players.
                  </div>
                )}
              </div>
            </div>

            {/* Next Button */}
            <div className="flex justify-end pt-4">
              <button
                onClick={() => validateStep1() && setStep(2)}
                className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-semibold"
              >
                Next: Pricing
              </button>
            </div>
          </div>
        )}

        {/* ============================================ */}
        {/* STEP 2: Pricing */}
        {/* ============================================ */}
        {step === 2 && (
          <div className="space-y-6">
            {/* Enable Pricing Toggle */}
            <div className="flex items-center justify-between gap-4 p-4 bg-gray-900 rounded-lg border border-gray-700">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-green-600/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-xl">💰</span>
                </div>
                <div className="min-w-0">
                  <h3 className="text-white font-semibold">Charge Entry Fee</h3>
                  <p className="text-sm text-gray-400">Collect payment from players</p>
                </div>
              </div>
              <button
                onClick={() => setPricingEnabled(!pricingEnabled)}
                className={`relative w-12 h-6 flex-shrink-0 rounded-full transition-colors ${pricingEnabled ? 'bg-green-500' : 'bg-gray-600'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${pricingEnabled ? 'translate-x-6' : 'translate-x-0'}`}></span>
              </button>
            </div>

            {pricingEnabled && (
              <>
                {/* Stripe Warning */}
                {!canAcceptPayments && (
                  <div className="p-4 bg-yellow-900/30 border border-yellow-600 rounded-lg">
                    <p className="text-yellow-400 text-sm">
                      ⚠️ {hostType === 'club' ? 'This club' : 'You'} need to connect Stripe to accept payments.
                      Go to {hostType === 'club' ? 'Club Settings' : 'Profile'} → Payments to set up.
                    </p>
                  </div>
                )}

                {/* Non-admin club warning */}
                {hostType === 'club' && selectedClub && !selectedClub.adminIds?.includes(currentUser?.uid || '') && (
                  <div className="p-4 bg-yellow-900/30 border border-yellow-600 rounded-lg">
                    <p className="text-yellow-400 text-sm">
                      ⚠️ Only club admins can create paid meetups on behalf of a club.
                      Select "Myself" as host to charge entry fees with your own Stripe account.
                    </p>
                  </div>
                )}

                {/* Entry Fee */}
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">Entry Fee (NZD)</label>
                  <input
                    type="number"
                    value={entryFee}
                    onChange={(e) => setEntryFee(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-600 text-white p-3 rounded-lg focus:outline-none focus:border-green-500 placeholder-gray-500"
                    placeholder="0.00"
                    step="0.50"
                    min="0"
                  />
                </div>

                {/* Prize Pool Toggle */}
                <div className="flex items-center justify-between gap-4 p-4 bg-gray-900 rounded-lg border border-gray-700">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-amber-600/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-xl">🏆</span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-white font-semibold">Prize Pool</h3>
                      <p className="text-sm text-gray-400">Collect additional for prizes</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setPrizePoolEnabled(!prizePoolEnabled)}
                    className={`relative w-12 h-6 flex-shrink-0 rounded-full transition-colors ${prizePoolEnabled ? 'bg-green-500' : 'bg-gray-600'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${prizePoolEnabled ? 'translate-x-6' : 'translate-x-0'}`}></span>
                  </button>
                </div>

                {prizePoolEnabled && (
                  <>
                    <div>
                      <label className="block text-sm font-semibold text-gray-300 mb-2">Prize Contribution per Person (NZD)</label>
                      <input
                        type="number"
                        value={prizePoolContribution}
                        onChange={(e) => setPrizePoolContribution(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-600 text-white p-3 rounded-lg focus:outline-none focus:border-green-500 placeholder-gray-500"
                        placeholder="0.00"
                        step="0.50"
                        min="0"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-300 mb-2">Prize Distribution</label>
                      <select
                        value={prizeDistributionIndex}
                        onChange={(e) => setPrizeDistributionIndex(parseInt(e.target.value))}
                        className="w-full bg-gray-900 border border-gray-600 text-white p-3 rounded-lg focus:outline-none focus:border-green-500"
                      >
                        {PRIZE_DISTRIBUTIONS.map((dist, i) => (
                          <option key={i} value={i}>{dist.label}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                {/* Who Pays Fees */}
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">Processing Fees Paid By</label>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setFeesPaidBy('organizer')}
                      className={`flex-1 p-3 rounded-lg border text-center transition-colors ${
                        feesPaidBy === 'organizer' ? 'border-green-500 bg-green-900/30 text-green-400' : 'border-gray-600 text-gray-300'
                      }`}
                    >
                      {hostType === 'club' ? 'Club' : 'Organizer'}
                    </button>
                    <button
                      onClick={() => setFeesPaidBy('player')}
                      className={`flex-1 p-3 rounded-lg border text-center transition-colors ${
                        feesPaidBy === 'player' ? 'border-green-500 bg-green-900/30 text-green-400' : 'border-gray-600 text-gray-300'
                      }`}
                    >
                      Player
                    </button>
                  </div>
                </div>

                {/* Fee Summary */}
                {feeCalculation && (
                  <div className="bg-gray-900 rounded-lg p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Base Price</span>
                      <span className="text-white">{formatCurrency(totalPerPersonCents)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Platform Fee ({PLATFORM_FEE_PERCENT}%)</span>
                      <span className="text-white">{formatCurrency(feeCalculation.platformFee)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Stripe Fee ({STRIPE_FEE_PERCENT}% + {STRIPE_FEE_FIXED}¢)</span>
                      <span className="text-white">{formatCurrency(feeCalculation.stripeFee)}</span>
                    </div>
                    <div className="border-t border-gray-700 pt-2 flex justify-between font-semibold">
                      <span className="text-gray-300">Player Pays</span>
                      <span className="text-green-400">{formatCurrency(feeCalculation.playerPays)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">{hostType === 'club' ? 'Club receives' : 'You receive'}</span>
                      <span className="text-white">{formatCurrency(feeCalculation.organizerReceives)}</span>
                    </div>
                  </div>
                )}

                {/* RSVP Settings (Expandable) */}
                <button
                  type="button"
                  onClick={() => setRsvpSettingsExpanded(!rsvpSettingsExpanded)}
                  className="w-full flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors"
                >
                  <span className="text-gray-300 font-medium">RSVP Settings</span>
                  <svg className={`w-5 h-5 text-gray-400 transition-transform ${rsvpSettingsExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {rsvpSettingsExpanded && (
                  <div className="space-y-4 p-4 bg-gray-800/30 rounded-lg border border-gray-700">
                    {/* Require payment to confirm */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white text-sm font-medium">Require payment to confirm spot</p>
                        <p className="text-xs text-gray-500">Reduces no-shows by requiring payment upfront</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setRequirePayment(!requirePayment)}
                        className={`relative w-12 h-6 flex-shrink-0 rounded-full transition-colors ${requirePayment ? 'bg-lime-500' : 'bg-gray-600'}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${requirePayment ? 'translate-x-6' : 'translate-x-0'}`} />
                      </button>
                    </div>

                    {/* Enable waitlist */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white text-sm font-medium">Enable waitlist when full</p>
                        <p className="text-xs text-gray-500">Players auto-promoted when spots open. 15-min payment hold.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setWaitlistEnabled(!waitlistEnabled)}
                        className={`relative w-12 h-6 flex-shrink-0 rounded-full transition-colors ${waitlistEnabled ? 'bg-lime-500' : 'bg-gray-600'}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${waitlistEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                      </button>
                    </div>

                    {/* Refund deadline */}
                    <div>
                      <p className="text-white text-sm font-medium mb-2">Refund deadline</p>
                      <p className="text-xs text-gray-500 mb-3">Full refund if cancelled before deadline. No refund after.</p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setRefundDeadlineHours(Math.max(0, refundDeadlineHours - 6))}
                          className="w-12 h-12 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-white text-2xl font-bold"
                        >
                          -
                        </button>
                        <div className="flex-1 h-12 bg-gray-700 border border-gray-600 rounded-lg flex items-center justify-center">
                          <span className="text-lime-400 text-lg font-bold font-mono">
                            {refundDeadlineHours} hours before
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setRefundDeadlineHours(Math.min(168, refundDeadlineHours + 6))}
                          className="w-12 h-12 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-white text-2xl font-bold"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Navigation */}
            <div className="flex justify-between pt-4">
              <button onClick={() => setStep(1)} className="text-gray-400 hover:text-white px-4 py-2">Back</button>
              <button
                onClick={() => validateStep2() && setStep(3)}
                className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-semibold"
              >
                Next: Competition
              </button>
            </div>
          </div>
        )}

        {/* ============================================ */}
        {/* STEP 3: Competition & Game Format */}
        {/* ============================================ */}
        {step === 3 && (
          <div className="space-y-6">
            
            {/* Competition Format Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-3">Competition Format</label>

              {/* Casual Option (special - not in FormatCards) */}
              <button
                onClick={handleCasualSelect}
                className={`w-full p-4 mb-3 rounded-lg border text-left transition-colors flex items-center gap-3 ${
                  selectedFormat === 'casual'
                    ? 'border-blue-500 bg-blue-900/30'
                    : 'border-gray-600 bg-gray-900/50 hover:border-gray-500'
                }`}
              >
                <span className="text-2xl">🎾</span>
                <div>
                  <p className={`font-medium ${selectedFormat === 'casual' ? 'text-blue-400' : 'text-white'}`}>
                    Casual Play
                  </p>
                  <p className="text-sm text-gray-500">No formal competition, just social games</p>
                </div>
                {selectedFormat === 'casual' && (
                  <svg className="w-5 h-5 ml-auto text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
              </button>

              {/* Competition Formats (FormatCards) */}
              <FormatCards
                value={selectedFormat === 'casual' ? '' : selectedFormat}
                onChange={handleFormatSelect}
                eventType="meetup"
                theme="dark"
                isAppAdmin={isAppAdmin}
              />
            </div>

            {/* Game Format Settings - Only show for competitive formats */}
            {competitionType !== 'casual' && (
              <>
                {/* Manage in App Toggle */}
                <div className="flex items-center justify-between p-4 bg-gray-900 rounded-lg border border-gray-700">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
                      <span className="text-xl">📱</span>
                    </div>
                    <div>
                      <h3 className="text-white font-semibold">Manage in App</h3>
                      <p className="text-sm text-gray-400">Track matches, scores & standings automatically</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setManagedInApp(!managedInApp)}
                    className={`relative w-12 h-6 rounded-full transition-colors ${managedInApp ? 'bg-green-500' : 'bg-gray-600'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${managedInApp ? 'translate-x-6' : 'translate-x-0'}`}></span>
                  </button>
                </div>

                {/* Game Format Section */}
                <div className="bg-gray-900/50 rounded-lg p-4">
                  <h3 className="text-white font-medium mb-4 flex items-center gap-2">
                    🎾 Game Format
                  </h3>
                  
                  <div className="space-y-4">
                    {/* Points to Win */}
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Points per Game</label>
                      <div className="grid grid-cols-3 gap-2">
                        {POINTS_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => updateGameFormat('pointsToWin', opt.value)}
                            className={`p-3 rounded-lg border text-center transition-colors ${
                              gameFormat.pointsToWin === opt.value
                                ? 'border-blue-500 bg-blue-900/30 text-blue-400'
                                : 'border-gray-600 text-gray-300 hover:border-gray-500'
                            }`}
                          >
                            <div className="font-semibold">{opt.value}</div>
                            <div className="text-xs text-gray-500">{opt.description}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Win By */}
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Win By</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => updateGameFormat('winBy', 1)}
                          className={`p-3 rounded-lg border text-center transition-colors ${
                            gameFormat.winBy === 1
                              ? 'border-blue-500 bg-blue-900/30 text-blue-400'
                              : 'border-gray-600 text-gray-300 hover:border-gray-500'
                          }`}
                        >
                          <div className="font-semibold">Win by 1</div>
                          <div className="text-xs text-gray-500">First to points wins</div>
                        </button>
                        <button
                          onClick={() => updateGameFormat('winBy', 2)}
                          className={`p-3 rounded-lg border text-center transition-colors ${
                            gameFormat.winBy === 2
                              ? 'border-blue-500 bg-blue-900/30 text-blue-400'
                              : 'border-gray-600 text-gray-300 hover:border-gray-500'
                          }`}
                        >
                          <div className="font-semibold">Win by 2</div>
                          <div className="text-xs text-gray-500">Must win by 2 points</div>
                        </button>
                      </div>
                    </div>

                    {/* Games per Match */}
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Match Format</label>
                      <div className="grid grid-cols-3 gap-2">
                        {GAMES_PER_MATCH_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => updateGameFormat('gamesPerMatch', opt.value)}
                            className={`p-3 rounded-lg border text-center transition-colors ${
                              gameFormat.gamesPerMatch === opt.value
                                ? 'border-blue-500 bg-blue-900/30 text-blue-400'
                                : 'border-gray-600 text-gray-300 hover:border-gray-500'
                            }`}
                          >
                            <div className="font-semibold">{opt.label}</div>
                            <div className="text-xs text-gray-500">{opt.description}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Scoring System */}
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Scoring System</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => updateGameFormat('scoringSystem', 'rally')}
                          className={`p-3 rounded-lg border text-center transition-colors ${
                            gameFormat.scoringSystem === 'rally'
                              ? 'border-blue-500 bg-blue-900/30 text-blue-400'
                              : 'border-gray-600 text-gray-300 hover:border-gray-500'
                          }`}
                        >
                          <div className="font-semibold">Rally Scoring</div>
                          <div className="text-xs text-gray-500">Point every rally (standard)</div>
                        </button>
                        <button
                          onClick={() => updateGameFormat('scoringSystem', 'traditional')}
                          className={`p-3 rounded-lg border text-center transition-colors ${
                            gameFormat.scoringSystem === 'traditional'
                              ? 'border-blue-500 bg-blue-900/30 text-blue-400'
                              : 'border-gray-600 text-gray-300 hover:border-gray-500'
                          }`}
                        >
                          <div className="font-semibold">Traditional</div>
                          <div className="text-xs text-gray-500">Side-out scoring</div>
                        </button>
                      </div>
                    </div>

                    {/* Time Limit */}
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Time Limit per Game</label>
                      <select
                        value={gameFormat.timeLimit ?? 'null'}
                        onChange={(e) => updateGameFormat('timeLimit', e.target.value === 'null' ? null : parseInt(e.target.value))}
                        className="w-full bg-gray-900 border border-gray-600 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500"
                      >
                        {TIME_LIMIT_OPTIONS.map((opt) => (
                          <option key={String(opt.value)} value={opt.value ?? 'null'}>
                            {opt.label} - {opt.description}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Standings Points - Only for formats that need them */}
                {needsStandingsPoints && (
                  <div className="bg-gray-900/50 rounded-lg p-4">
                    <h3 className="text-white font-medium mb-4 flex items-center gap-2">
                      🏆 Standings Points
                    </h3>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Win</label>
                        <input
                          type="number"
                          value={gameFormat.pointsPerWin}
                          onChange={(e) => updateGameFormat('pointsPerWin', parseInt(e.target.value) || 0)}
                          className="w-full bg-gray-900 border border-gray-600 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500"
                          min="0"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Draw</label>
                        <input
                          type="number"
                          value={gameFormat.pointsPerDraw}
                          onChange={(e) => updateGameFormat('pointsPerDraw', parseInt(e.target.value) || 0)}
                          className="w-full bg-gray-900 border border-gray-600 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500"
                          min="0"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Loss</label>
                        <input
                          type="number"
                          value={gameFormat.pointsPerLoss}
                          onChange={(e) => updateGameFormat('pointsPerLoss', parseInt(e.target.value) || 0)}
                          className="w-full bg-gray-900 border border-gray-600 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500"
                          min="0"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Format-Specific Settings */}
                {hasFormatSpecificSettings && (
                  <div className="bg-gray-900/50 rounded-lg p-4">
                    <h3 className="text-white font-medium mb-4 flex items-center gap-2">
                      ⚙️ {COMPETITION_TYPES.find(t => t.value === competitionType)?.label} Settings
                    </h3>
                    
                    {/* Swiss Settings */}
                    {competitionType === 'swiss' && (
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Number of Rounds</label>
                        <input
                          type="number"
                          value={numberOfRounds}
                          onChange={(e) => setNumberOfRounds(parseInt(e.target.value) || 3)}
                          className="w-full bg-gray-900 border border-gray-600 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500"
                          min="1"
                          max="10"
                        />
                        <p className="text-xs text-gray-500 mt-1">Typically log₂(players) rounds</p>
                      </div>
                    )}

                    {/* Pool Play Settings */}
                    {competitionType === 'pool_play_knockout' && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm text-gray-400 mb-1">Players per Pool</label>
                          <select
                            value={poolSize}
                            onChange={(e) => setPoolSize(parseInt(e.target.value))}
                            className="w-full bg-gray-900 border border-gray-600 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500"
                          >
                            {[3, 4, 5, 6].map(n => (
                              <option key={n} value={n}>{n} players</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm text-gray-400 mb-1">Teams Advancing per Pool</label>
                          <select
                            value={teamsAdvancing}
                            onChange={(e) => setTeamsAdvancing(parseInt(e.target.value))}
                            className="w-full bg-gray-900 border border-gray-600 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500"
                          >
                            {[1, 2, 3, 4].map(n => (
                              <option key={n} value={n}>Top {n}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    {/* King of Court Settings */}
                    {competitionType === 'king_of_court' && (
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Wins to Stay On</label>
                        <select
                          value={winStreak}
                          onChange={(e) => setWinStreak(parseInt(e.target.value))}
                          className="w-full bg-gray-900 border border-gray-600 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500"
                        >
                          {[1, 2, 3, 4, 5].map(n => (
                            <option key={n} value={n}>{n} win{n > 1 ? 's' : ''}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Elimination Settings */}
                    {(competitionType === 'single_elimination' || competitionType === 'double_elimination') && (
                      <div className="space-y-3">
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={thirdPlaceMatch}
                            onChange={(e) => setThirdPlaceMatch(e.target.checked)}
                            className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500"
                          />
                          <span className="text-gray-300">3rd Place Match</span>
                        </label>
                        {competitionType === 'single_elimination' && (
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={consolationBracket}
                              onChange={(e) => setConsolationBracket(e.target.checked)}
                              className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500"
                            />
                            <span className="text-gray-300">Consolation Bracket</span>
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Summary */}
            <div className="bg-gray-900/50 rounded-lg p-4">
              <h4 className="text-white font-medium mb-3">📋 Meetup Summary</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Host</span>
                  <span className="text-white">{hostType === 'club' ? selectedClub?.name : userProfile?.displayName || 'You'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Title</span>
                  <span className="text-white truncate ml-4">{title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Date</span>
                  <span className="text-white">{date} at {time}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Max Players</span>
                  <span className="text-white">{maxPlayers}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Entry</span>
                  <span className="text-white">
                    {pricingEnabled && totalPerPersonCents > 0 ? formatCurrency(feeCalculation?.playerPays || totalPerPersonCents) : 'Free'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Format</span>
                  <span className="text-white">
                    {selectedFormat === 'casual' ? 'Casual Play' : getFormatOption(selectedFormat)?.label || competitionType}
                  </span>
                </div>
                {competitionType !== 'casual' && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Game Format</span>
                    <span className="text-white">
                      {gameFormat.gamesPerMatch === 1 ? '1 game' : `Best of ${gameFormat.gamesPerMatch}`} to {gameFormat.pointsToWin}, win by {gameFormat.winBy}
                    </span>
                  </div>
                )}
                {pricingEnabled && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-400">RSVP</span>
                      <span className="text-white">
                        {requirePayment ? 'Pay-to-play' : 'Free RSVP'} - Waitlist {waitlistEnabled ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Refund</span>
                      <span className="text-white">{refundDeadlineHours}hr deadline</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* More Options (Expandable) */}
            <button
              type="button"
              onClick={() => setMoreOptionsExpanded(!moreOptionsExpanded)}
              className="w-full flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors"
            >
              <span className="text-gray-300 font-medium">More Options</span>
              <svg className={`w-5 h-5 text-gray-400 transition-transform ${moreOptionsExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {moreOptionsExpanded && (
              <div className="space-y-5 p-4 bg-gray-800/30 rounded-lg border border-gray-700">
                {/* Co-hosts */}
                {currentUser && (
                  <CoHostPicker
                    selectedIds={coHostIds}
                    onChange={setCoHostIds}
                    hostId={currentUser.uid}
                  />
                )}

                {/* Check-in */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white text-sm font-medium">Enable manual check-in</p>
                    <p className="text-xs text-gray-500">Track who shows up</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCheckInEnabled(!checkInEnabled)}
                    className={`relative w-12 h-6 flex-shrink-0 rounded-full transition-colors ${checkInEnabled ? 'bg-lime-500' : 'bg-gray-600'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${checkInEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                {/* Court Rotation */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-white text-sm font-medium">Track sit-outs</p>
                      <p className="text-xs text-gray-500">Calculate who sits out each round</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRotationEnabled(!rotationEnabled)}
                      className={`relative w-12 h-6 flex-shrink-0 rounded-full transition-colors ${rotationEnabled ? 'bg-lime-500' : 'bg-gray-600'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${rotationEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  {rotationEnabled && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Courts</label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setRotationCourts(Math.max(1, rotationCourts - 1))}
                            className="w-10 h-10 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-white text-xl font-bold"
                          >
                            -
                          </button>
                          <div className="flex-1 h-10 bg-gray-700 border border-gray-600 rounded-lg flex items-center justify-center">
                            <span className="text-lime-400 font-bold font-mono">{rotationCourts}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setRotationCourts(Math.min(20, rotationCourts + 1))}
                            className="w-10 h-10 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-white text-xl font-bold"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Players/Court</label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setRotationPlayersPerCourt(Math.max(2, rotationPlayersPerCourt - 1))}
                            className="w-10 h-10 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-white text-xl font-bold"
                          >
                            -
                          </button>
                          <div className="flex-1 h-10 bg-gray-700 border border-gray-600 rounded-lg flex items-center justify-center">
                            <span className="text-lime-400 font-bold font-mono">{rotationPlayersPerCourt}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setRotationPlayersPerCourt(Math.min(8, rotationPlayersPerCourt + 1))}
                            className="w-10 h-10 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-white text-xl font-bold"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between pt-4">
              <button onClick={() => setStep(2)} className="text-gray-400 hover:text-white px-4 py-2">Back</button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white px-6 py-2 rounded-lg font-semibold flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Creating...
                  </>
                ) : (
                  'Create Meetup'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreateMeetup;