/**
 * CreateTournament Component
 *
 * UPDATED V06.00:
 * - Integrated FormatCards for unified format selection
 * - Maps CompetitionFormat to DivisionFormat structure
 * - Visual format cards with dark theme styling
 * - Pool Play → Medals integration with generator settings
 * - NEW: Tournament Planner integration for capacity planning
 *
 * FILE LOCATION: components/CreateTournament.tsx
 * VERSION: V06.00
 */
import React, { useState, useEffect } from 'react';
import type {
    Tournament,
    Division,
    EventType,
    GenderCategory,
    DivisionFormat,
    MainFormat,
    Stage2Format,
    PlateFormat,
    Club,
    SeedingMethod,
    TieBreaker,
    TournamentPlannerSettings,
    PlannerDivision
} from '../types';
import { saveTournament, getUserClubs, getAllClubs } from '../services/firebase';
import { createOrganizerRequest, getOrganizerRequestByUserId } from '../services/firebase/organizerRequests';
import { useAuth } from '../contexts/AuthContext';
import type { CompetitionFormat, PoolPlayMedalsSettings } from '../types/formats';
import { getFormatOption, DEFAULT_POOL_PLAY_MEDALS_SETTINGS } from '../types/formats';
import { FormatCards } from './shared/FormatSelector';
import { TournamentPlanner } from './tournament/planner';
import { PhoneVerificationModal } from './auth/PhoneVerificationModal';

interface CreateTournamentProps {
  onCreateTournament: (tournament: Tournament) => Promise<void> | void;
  onCancel: () => void;
  onCreateClub: () => void;
  userId: string;
}

const generateId = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36);

const DEFAULT_FORMAT: DivisionFormat = {
    stageMode: 'single_stage',
    mainFormat: 'round_robin',
    stage1Format: 'round_robin_pools',
    stage2Format: 'single_elim',
    numberOfPools: 2,
    teamsPerPool: 4,
    advanceToMainPerPool: 2,
    advanceToPlatePerPool: 0,
    plateEnabled: false,
    plateFormat: 'single_elim',
    plateName: 'Plate Finals',
    bestOfGames: 1,
    pointsPerGame: 11,
    winBy: 2,
    hasBronzeMatch: false,
    seedingMethod: 'rating',
    tieBreakerPrimary: 'match_wins',
    tieBreakerSecondary: 'point_diff',
    tieBreakerTertiary: 'head_to_head'
};

/**
 * Map CompetitionFormat to DivisionFormat settings
 */
const mapCompetitionToTournamentFormat = (format: CompetitionFormat): Partial<DivisionFormat> => {
    switch (format) {
        case 'pool_play_medals':
            return {
                stageMode: 'two_stage',
                stage1Format: 'round_robin_pools',
                stage2Format: 'single_elim',
                numberOfPools: 2,
                teamsPerPool: 4,
                advanceToMainPerPool: 2,
                hasBronzeMatch: true,
            };
        case 'round_robin':
            return {
                stageMode: 'single_stage',
                mainFormat: 'round_robin',
            };
        case 'singles_elimination':
        case 'doubles_elimination':
            return {
                stageMode: 'single_stage',
                mainFormat: 'single_elim',
            };
        case 'swiss':
            return {
                stageMode: 'single_stage',
                mainFormat: 'round_robin', // Swiss maps to round robin for now
            };
        case 'ladder':
            return {
                stageMode: 'single_stage',
                mainFormat: 'ladder',
            };
        case 'rotating_doubles_box':
        case 'fixed_doubles_box':
            return {
                stageMode: 'single_stage',
                mainFormat: 'round_robin', // Box leagues use round robin within boxes
            };
        case 'king_of_court':
        case 'team_league_interclub':
        default:
            return {
                stageMode: 'single_stage',
                mainFormat: 'round_robin',
            };
    }
};

export const CreateTournament: React.FC<CreateTournamentProps> = ({ onCreateTournament, onCancel, onCreateClub, userId }) => {
  const { isAppAdmin, isOrganizer, userProfile, currentUser } = useAuth();
  // Step: 0 = mode selection, 'planner' = planner flow, 1 = basic info, 2 = divisions
  const [step, setStep] = useState<number | 'planner'>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Club Fetching
  const [availableClubs, setAvailableClubs] = useState<Club[]>([]);
  const [loadingClubs, setLoadingClubs] = useState(true);

  // Phone verification & Organizer request state
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [requestReason, setRequestReason] = useState('');
  const [requestExperience, setRequestExperience] = useState('');
  const [requestStatus, setRequestStatus] = useState<'none' | 'pending' | 'denied' | 'approved'>('none');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [denialReason, setDenialReason] = useState<string | null>(null);

  // Computed values
  const isPhoneVerified = userProfile?.phoneVerified === true;
  const hasStripeConnected = !!(userProfile?.stripeConnectedAccountId && userProfile?.stripeChargesEnabled);

  // Tournament Draft
  const [formData, setFormData] = useState<Partial<Tournament>>({
    name: '',
    description: '',
    visibility: 'public',
    sport: 'Pickleball',
    status: 'draft',
    registrationMode: 'organiser_provided',
    createdByUserId: userId,
    organizerId: userId,
    organizerName: userProfile?.displayName || '',
    clubId: '' // Required
  });

  // Planner settings (if using planner flow)
  const [plannerSettings, setPlannerSettings] = useState<TournamentPlannerSettings | null>(null);

  // Divisions List
  const [divisions, setDivisions] = useState<Division[]>([]);
  
  // Editing State
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // New Division State
  const [newDivBasic, setNewDivBasic] = useState<{
      gender: GenderCategory;
      type: EventType;
      minRating: string;
      maxRating: string;
      minAge: string;
      maxAge: string;
  }>({
      gender: 'mixed',
      type: 'doubles',
      minRating: '',
      maxRating: '',
      minAge: '',
      maxAge: ''
  });

  const [newDivFormat, setNewDivFormat] = useState<DivisionFormat>(DEFAULT_FORMAT);

  // Selected format from FormatCards (V06.00)
  const [selectedFormat, setSelectedFormat] = useState<CompetitionFormat>('round_robin');

  // Pool Play → Medals specific settings
  const [poolPlaySettings, setPoolPlaySettings] = useState<PoolPlayMedalsSettings>(
    DEFAULT_POOL_PLAY_MEDALS_SETTINGS
  );

  // Handle format card selection - update DivisionFormat settings
  const handleFormatSelect = (format: CompetitionFormat) => {
    setSelectedFormat(format);
    const mappedSettings = mapCompetitionToTournamentFormat(format);
    setNewDivFormat(prev => ({ ...prev, ...mappedSettings }));

    // Reset pool play settings when switching to pool_play_medals
    if (format === 'pool_play_medals') {
      setPoolPlaySettings(DEFAULT_POOL_PLAY_MEDALS_SETTINGS);
    }
  };

  // Convert planner division to tournament division
  const convertPlannerDivision = (plannerDiv: PlannerDivision, settings: TournamentPlannerSettings): Division => {
    const formatSettings = mapCompetitionToTournamentFormat(plannerDiv.format);

    // Build division format with planner game settings
    const divFormat: DivisionFormat = {
      ...DEFAULT_FORMAT,
      ...formatSettings,
      bestOfGames: settings.gameSettings.bestOf,
      pointsPerGame: settings.gameSettings.pointsToWin,
      winBy: settings.gameSettings.winBy,
      // Pool play specific
      ...(plannerDiv.format === 'pool_play_medals' && plannerDiv.poolSize && {
        teamsPerPool: plannerDiv.poolSize,
        numberOfPools: plannerDiv.poolCount || Math.ceil(plannerDiv.expectedPlayers / plannerDiv.poolSize),
      }),
    };

    return {
      id: plannerDiv.id,
      tournamentId: '', // Set on save
      name: plannerDiv.name,
      type: plannerDiv.playType === 'singles' ? 'singles' : 'doubles',
      gender: plannerDiv.gender || 'open',
      // Transfer DUPR ratings from planner
      minRating: plannerDiv.minRating ?? null,
      maxRating: plannerDiv.maxRating ?? null,
      minAge: plannerDiv.minAge ?? null,
      maxAge: plannerDiv.maxAge ?? null,
      registrationOpen: true,
      format: divFormat,
      createdByUserId: userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      // Store expected players for reference
      maxTeams: plannerDiv.expectedPlayers,
      // Entry fee for this division (in cents)
      entryFee: plannerDiv.entryFee,
      // Day assignment for multi-day tournaments
      tournamentDayId: plannerDiv.assignedDayId,
      scheduledStartTime: plannerDiv.estimatedStartTime,
      scheduledEndTime: plannerDiv.estimatedEndTime,
    };
  };

  // Handle planner completion
  const handlePlannerComplete = (settings: TournamentPlannerSettings) => {
    setPlannerSettings(settings);

    // Convert planner divisions to tournament divisions
    const convertedDivisions = settings.divisions.map(d => convertPlannerDivision(d, settings));
    setDivisions(convertedDivisions);

    // Calculate tournament dates from planner days
    const tournamentDays = settings.days && settings.days.length > 0 ? settings.days : [];
    const firstDay = tournamentDays[0];
    const lastDay = tournamentDays[tournamentDays.length - 1] || firstDay;

    // Build start and end datetime
    const startDatetime = firstDay
      ? `${firstDay.date}T${firstDay.startTime}:00`
      : new Date().toISOString();
    const endDatetime = lastDay
      ? `${lastDay.date}T${lastDay.endTime}:00`
      : startDatetime;

    // Store planner-specific data in tournament
    setFormData(prev => ({
      ...prev,
      // Set tournament dates from planner
      startDatetime,
      endDatetime,
      // Store court count and time settings for future use
      courts: settings.courts,
      startTime: settings.startTime,
      endTime: settings.endTime,
      // Store the full days array for multi-day tournaments
      tournamentDays: tournamentDays,
      // Registration & Payment from planner
      registrationOpens: settings.registrationOpens,
      registrationDeadline: settings.registrationDeadline,
      // Payment mode and fees
      paymentMode: settings.paymentMode || 'free',
      isFreeEvent: settings.paymentMode === 'free' || settings.isFreeEvent,
      entryFee: settings.adminFee || settings.entryFee || 0, // Admin fee becomes tournament-level fee
      // Only include bankDetails if defined (Firestore rejects undefined values)
      ...(settings.bankDetails && { bankDetails: settings.bankDetails }),
      ...(settings.showBankDetails !== undefined && { showBankDetails: settings.showBankDetails }),
      // Store timing settings as custom field
      plannerSettings: {
        matchPreset: settings.matchPreset,
        gameSettings: settings.gameSettings,
        timingSettings: settings.timingSettings,
      },
    }));

    // Move to step 1 (basic info)
    setStep(1);
  };

  // Handle planner back (return to mode selection)
  const handlePlannerBack = () => {
    setStep(0);
  };

  // Load Clubs
  useEffect(() => {
      const loadClubs = async () => {
          setLoadingClubs(true);
          try {
              let clubs: Club[] = [];
              if (isAppAdmin) {
                  clubs = await getAllClubs();
              } else {
                  clubs = await getUserClubs(userId);
              }
              setAvailableClubs(clubs);
              
              if (clubs.length === 1) {
                  setFormData(prev => ({ ...prev, clubId: clubs[0].id }));
              }
          } catch (e) {
              console.error("Failed to load clubs", e);
          } finally {
              setLoadingClubs(false);
          }
      };
      loadClubs();
  }, [userId, isAppAdmin]);

  // Load existing organizer request status
  useEffect(() => {
    const loadRequestStatus = async () => {
      if (!isOrganizer && userId) {
        try {
          const existing = await getOrganizerRequestByUserId(userId);
          if (existing) {
            setRequestStatus(existing.status);
            if (existing.status === 'denied') {
              setDenialReason(existing.denialReason || null);
            }
          }
        } catch (err) {
          console.error('Failed to load organizer request status:', err);
        }
      }
    };
    loadRequestStatus();
  }, [userId, isOrganizer]);

  useEffect(() => {
    if (formData.name && step === 1) {
      const slug = formData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      setFormData(prev => ({ ...prev, slug }));
    }
  }, [formData.name, step]);

  // Handle organizer request submission
  const handleRequestOrganizer = async () => {
    if (!requestReason.trim()) {
      alert('Please provide a reason for your request');
      return;
    }
    setSubmittingRequest(true);
    try {
      await createOrganizerRequest({
        odUserId: userId,
        userEmail: currentUser?.email || '',
        userName: userProfile?.displayName || 'User',
        userPhotoURL: userProfile?.photoURL,
        reason: requestReason.trim(),
        experience: requestExperience.trim() || undefined,
      });
      setRequestStatus('pending');
    } catch (err: any) {
      alert(err.message || 'Failed to submit request');
    } finally {
      setSubmittingRequest(false);
    }
  };

  const handleEditDivision = (div: Division) => {
    setNewDivBasic({
        gender: div.gender,
        type: div.type,
        minRating: div.minRating ? div.minRating.toString() : '',
        maxRating: div.maxRating ? div.maxRating.toString() : '',
        minAge: div.minAge ? div.minAge.toString() : '',
        maxAge: div.maxAge ? div.maxAge.toString() : ''
    });
    setNewDivFormat({ ...div.format });
    setEditingId(div.id);
    setErrorMessage(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setNewDivBasic(prev => ({ ...prev, minRating: '', maxRating: '', minAge: '', maxAge: '' }));
    setNewDivFormat(DEFAULT_FORMAT);
    setErrorMessage(null);
  };

  const handleSaveDivision = () => {
      setErrorMessage(null);

      // Validation for pool play medals
      if (selectedFormat === 'pool_play_medals') {
          if (poolPlaySettings.poolSize < 3) return setErrorMessage("Pool size must be at least 3.");
      }

      // Validation for legacy two-stage
      if (newDivFormat.stageMode === 'two_stage' && selectedFormat !== 'pool_play_medals') {
          const pools = newDivFormat.numberOfPools || 0;
          const tpp = newDivFormat.teamsPerPool || 0;
          const advMain = newDivFormat.advanceToMainPerPool || 0;
          const advPlate = newDivFormat.advanceToPlatePerPool || 0;

          if (pools < 2) return setErrorMessage("Must have at least 2 pools.");
          if (pools % 2 !== 0) return setErrorMessage("Number of pools must be an EVEN number (2, 4, 6...).");
          if (tpp < 4) return setErrorMessage("Minimum 4 teams per pool required.");

          if (advMain < 1) return setErrorMessage("At least one team must advance to Main.");
          if ((advMain + advPlate) > tpp) return setErrorMessage("Total advancing teams cannot exceed teams per pool.");
      }

      // Generate Name based on format
      const genderLabel = newDivBasic.gender.charAt(0).toUpperCase() + newDivBasic.gender.slice(1);
      const typeLabel = newDivBasic.type === 'doubles' ? 'Doubles' : 'Singles';

      let formatLabel: string;
      if (selectedFormat === 'pool_play_medals') {
          const advRule = poolPlaySettings.advancementRule === 'top_1' ? 'Top 1'
            : poolPlaySettings.advancementRule === 'top_2' ? 'Top 2'
            : 'Top + Best';
          formatLabel = `Pool Play → Medals (${poolPlaySettings.poolSize}/pool, ${advRule})`;
      } else if (newDivFormat.stageMode === 'single_stage') {
          formatLabel = getFormatOption(selectedFormat)?.label || newDivFormat.mainFormat?.replace('_', ' ') || 'Format';
      } else {
          formatLabel = `${newDivFormat.numberOfPools} Pools → ${newDivFormat.stage2Format?.replace('_', ' ')}`;
      }

      const ratingLabel = newDivBasic.minRating
        ? `(${newDivBasic.minRating}${newDivBasic.maxRating ? `-${newDivBasic.maxRating}` : '+'})`
        : '';

      const ageLabel = newDivBasic.minAge
        ? `(${newDivBasic.minAge}${newDivBasic.maxAge ? `-${newDivBasic.maxAge}` : '+'} yrs)`
        : '';

      const name = `${genderLabel} ${typeLabel} ${ratingLabel} ${ageLabel} - ${formatLabel}`.trim().replace(/\s+/g, ' ');

      // Build format object with pool play settings if applicable
      const divisionFormat: DivisionFormat = {
          ...newDivFormat,
          // Store pool play settings in format for generator access
          ...(selectedFormat === 'pool_play_medals' && {
              poolPlayMedalsSettings: poolPlaySettings,
              competitionFormat: selectedFormat,
          }),
      };

      const div: Division = {
          id: editingId || generateId(),
          tournamentId: '', // set on save
          name: name,
          type: newDivBasic.type,
          gender: newDivBasic.gender,
          minRating: newDivBasic.minRating ? parseFloat(newDivBasic.minRating) : null,
          maxRating: newDivBasic.maxRating ? parseFloat(newDivBasic.maxRating) : null,
          minAge: newDivBasic.minAge ? parseInt(newDivBasic.minAge) : null,
          maxAge: newDivBasic.maxAge ? parseInt(newDivBasic.maxAge) : null,
          registrationOpen: true,
          format: divisionFormat,
          createdByUserId: userId,
          createdAt: Date.now(),
          updatedAt: Date.now()
      };
      
      if (editingId) {
          setDivisions(prev => prev.map(d => d.id === editingId ? div : d));
          setEditingId(null);
      } else {
          setDivisions(prev => [...prev, div]);
      }
      
      setNewDivBasic(prev => ({ ...prev, minRating: '', maxRating: '', minAge: '', maxAge: '' }));
      setNewDivFormat(DEFAULT_FORMAT);
  };

  const handleNext = () => {
      if (!formData.name) return setErrorMessage("Name is required");
      // Club is now optional - organizers can host independently
      setStep(2);
      setErrorMessage(null);
  };

  const handleSubmit = async () => {
      if (divisions.length === 0) return setErrorMessage("Add at least one division");

      setIsSubmitting(true);
      try {
          const tId = generateId();

          // Determine Stripe account: use club's if selected, otherwise use organizer's
          const selectedClub = formData.clubId
            ? availableClubs.find(c => c.id === formData.clubId)
            : null;
          const stripeAccountId = selectedClub?.stripeConnectedAccountId
            || userProfile?.stripeConnectedAccountId
            || undefined;

          const tournament: Tournament = {
              ...formData as Tournament,
              id: tId,
              startDatetime: formData.startDatetime || new Date().toISOString(),
              venue: formData.venue || 'TBD',
              // Map tournamentDays to days for multi-day tournament support
              days: (formData as any).tournamentDays || undefined,
              // Payment routing: club's Stripe or organizer's Stripe
              stripeConnectedAccountId: stripeAccountId,
          };

          await saveTournament(tournament, divisions);
          await onCreateTournament(tournament);
      } catch (e: any) {
          setErrorMessage(e.message);
      } finally {
          setIsSubmitting(false);
      }
  };

  if (loadingClubs) return <div className="p-8 text-center">Loading Clubs...</div>;

  // Show requirements flow if user doesn't have access yet
  // App admins skip this check
  // Organizers need: phone verified + organizer role + Stripe connected
  if ((!isOrganizer || !hasStripeConnected) && !isAppAdmin) {
    // Determine which step is active
    const step1Complete = isPhoneVerified;
    const step2Complete = isOrganizer;
    const step2Pending = requestStatus === 'pending';
    const step3Complete = hasStripeConnected;

    return (
      <div className="max-w-2xl mx-auto bg-gray-800 rounded-lg p-8 border border-gray-700 mt-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-lime-500/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-lime-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl text-white font-bold mb-2">Host a Tournament</h2>
          <p className="text-gray-400">Complete these steps to start hosting tournaments</p>
        </div>

        {/* Requirements Checklist */}
        <div className="space-y-3 mb-8">
          {/* Step 1: Phone Verification */}
          <div className={`p-4 rounded-lg border ${step1Complete ? 'border-green-500/50 bg-green-900/20' : 'border-gray-600 bg-gray-900/50'}`}>
            <div className="flex items-center gap-3">
              {step1Complete ? (
                <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full border-2 border-red-500 flex items-center justify-center">
                  <span className="text-red-500 text-xs font-bold">1</span>
                </div>
              )}
              <div className="flex-1">
                <p className={`font-medium ${step1Complete ? 'text-green-400' : 'text-white'}`}>
                  Verify Phone Number
                </p>
                <p className="text-sm text-gray-400">Required for identity verification</p>
              </div>
            </div>
          </div>

          {/* Step 2: Organizer Access */}
          <div className={`p-4 rounded-lg border ${
            step2Complete ? 'border-green-500/50 bg-green-900/20' :
            step2Pending ? 'border-yellow-500/50 bg-yellow-900/20' :
            !step1Complete ? 'border-gray-700 bg-gray-900/30 opacity-60' :
            'border-gray-600 bg-gray-900/50'
          }`}>
            <div className="flex items-center gap-3">
              {step2Complete ? (
                <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              ) : step2Pending ? (
                <div className="w-6 h-6 rounded-full bg-yellow-500 flex items-center justify-center">
                  <svg className="w-4 h-4 text-white animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              ) : !step1Complete ? (
                <div className="w-6 h-6 rounded-full border-2 border-gray-600 flex items-center justify-center">
                  <svg className="w-3 h-3 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 17a2 2 0 002-2V9a2 2 0 10-4 0v6a2 2 0 002 2zm-1-9h2v6h-2V8z"/>
                  </svg>
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full border-2 border-red-500 flex items-center justify-center">
                  <span className="text-red-500 text-xs font-bold">2</span>
                </div>
              )}
              <div className="flex-1">
                <p className={`font-medium ${
                  step2Complete ? 'text-green-400' :
                  step2Pending ? 'text-yellow-400' :
                  !step1Complete ? 'text-gray-500' : 'text-white'
                }`}>
                  Organizer Access {!step1Complete && '(locked)'}
                </p>
                <p className="text-sm text-gray-400">
                  {step2Pending ? 'Your request is pending admin review' : 'Request approval to host tournaments'}
                </p>
              </div>
            </div>
          </div>

          {/* Step 3: Connect Stripe */}
          <div className={`p-4 rounded-lg border ${
            step3Complete ? 'border-green-500/50 bg-green-900/20' :
            !step2Complete ? 'border-gray-700 bg-gray-900/30 opacity-60' :
            'border-gray-600 bg-gray-900/50'
          }`}>
            <div className="flex items-center gap-3">
              {step3Complete ? (
                <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              ) : !step2Complete ? (
                <div className="w-6 h-6 rounded-full border-2 border-gray-600 flex items-center justify-center">
                  <svg className="w-3 h-3 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 17a2 2 0 002-2V9a2 2 0 10-4 0v6a2 2 0 002 2zm-1-9h2v6h-2V8z"/>
                  </svg>
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full border-2 border-red-500 flex items-center justify-center">
                  <span className="text-red-500 text-xs font-bold">3</span>
                </div>
              )}
              <div className="flex-1">
                <p className={`font-medium ${
                  step3Complete ? 'text-green-400' :
                  !step2Complete ? 'text-gray-500' : 'text-white'
                }`}>
                  Connect Stripe Account {!step2Complete && '(locked)'}
                </p>
                <p className="text-sm text-gray-400">Required for receiving tournament payments</p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Section - based on current step */}
        {!step1Complete ? (
          // Step 1: Phone verification needed
          <div className="space-y-4">
            <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
              <p className="text-blue-300 text-sm">
                Verify your mobile number to continue. We'll send a 6-digit code via SMS.
              </p>
            </div>
            <div className="flex justify-between">
              <button onClick={onCancel} className="text-gray-400 hover:text-white px-4 py-2">
                Back
              </button>
              <button
                onClick={() => setShowPhoneModal(true)}
                className="bg-lime-500 hover:bg-lime-400 text-gray-900 font-bold px-6 py-3 rounded-lg transition-colors"
              >
                Verify Phone Number
              </button>
            </div>
          </div>
        ) : !step2Complete && !step2Pending ? (
          // Step 2: Organizer request form
          <div className="space-y-4">
            {requestStatus === 'denied' && (
              <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
                <p className="text-red-300 text-sm font-medium mb-1">Previous request was denied</p>
                {denialReason && (
                  <p className="text-red-400 text-sm">Reason: {denialReason}</p>
                )}
                <p className="text-gray-400 text-sm mt-2">You can submit a new request below.</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Why do you want to become an organizer? <span className="text-red-400">*</span>
              </label>
              <textarea
                value={requestReason}
                onChange={(e) => setRequestReason(e.target.value)}
                placeholder="Tell us about the tournaments or events you'd like to organize..."
                className="w-full bg-gray-900 border border-gray-600 text-white p-3 rounded-lg min-h-[100px] resize-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Event organizing experience (optional)
              </label>
              <textarea
                value={requestExperience}
                onChange={(e) => setRequestExperience(e.target.value)}
                placeholder="Any previous experience organizing pickleball or other events..."
                className="w-full bg-gray-900 border border-gray-600 text-white p-3 rounded-lg min-h-[80px] resize-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500"
              />
            </div>

            <div className="flex justify-between pt-2">
              <button onClick={onCancel} className="text-gray-400 hover:text-white px-4 py-2">
                Back
              </button>
              <button
                onClick={handleRequestOrganizer}
                disabled={submittingRequest || !requestReason.trim()}
                className="bg-lime-500 hover:bg-lime-400 disabled:bg-gray-600 disabled:cursor-not-allowed text-gray-900 font-bold px-6 py-3 rounded-lg transition-colors"
              >
                {submittingRequest ? 'Submitting...' : 'Request Organizer Access'}
              </button>
            </div>
          </div>
        ) : step2Pending ? (
          // Step 2: Request pending
          <div className="space-y-4">
            <div className="p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-lg text-center">
              <p className="text-yellow-300 font-medium mb-1">Request Submitted</p>
              <p className="text-gray-400 text-sm">
                Your organizer request is being reviewed by our admin team.
                We'll notify you once it's approved.
              </p>
            </div>
            <div className="flex justify-center">
              <button onClick={onCancel} className="text-gray-400 hover:text-white px-4 py-2">
                Back
              </button>
            </div>
          </div>
        ) : (
          // Step 3: Organizer approved, need Stripe
          <div className="space-y-4">
            <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
              <p className="text-blue-300 text-sm">
                You're an approved organizer! Connect your Stripe account to receive tournament payments.
              </p>
            </div>
            <div className="flex justify-between">
              <button onClick={onCancel} className="text-gray-400 hover:text-white px-4 py-2">
                Back
              </button>
              <a
                href="/#/profile"
                className="bg-lime-500 hover:bg-lime-400 text-gray-900 font-bold px-6 py-3 rounded-lg transition-colors inline-block"
              >
                Connect Stripe Account
              </a>
            </div>
          </div>
        )}

        {/* Phone Verification Modal */}
        {showPhoneModal && (
          <PhoneVerificationModal
            onClose={() => setShowPhoneModal(false)}
            onVerified={() => {
              setShowPhoneModal(false);
              // userProfile will update via AuthContext subscription
            }}
            initialPhone={userProfile?.phone}
            canSkip={false}
          />
        )}
      </div>
    );
  }

  // If using planner flow, show the planner component
  if (step === 'planner') {
    return (
      <TournamentPlanner
        onComplete={handlePlannerComplete}
        onBack={handlePlannerBack}
      />
    );
  }

  return (
      <div className="max-w-4xl mx-auto bg-gray-800 rounded-lg p-8 border border-gray-700 mb-10">
          {/* Step 0: Mode Selection */}
          {step === 0 && (
            <div className="text-center py-8">
              <h2 className="text-3xl text-white font-bold mb-4">Create Tournament</h2>
              <p className="text-gray-400 mb-10 max-w-lg mx-auto">
                Choose how you'd like to set up your tournament
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
                {/* Planner Option */}
                <button
                  onClick={() => setStep('planner')}
                  className="group bg-gradient-to-br from-blue-900/50 to-blue-800/30 border-2 border-blue-600/50 hover:border-blue-500 rounded-xl p-8 text-left transition-all hover:shadow-lg hover:shadow-blue-500/10"
                >
                  <div className="text-4xl mb-4">📊</div>
                  <h3 className="text-xl font-bold text-white mb-2 group-hover:text-blue-400 transition-colors">
                    Use Tournament Planner
                  </h3>
                  <p className="text-sm text-gray-400 mb-4">
                    Answer a few questions about your courts, time, and divisions.
                    We'll help you plan capacity and timing.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-2 py-1 bg-blue-900/50 text-blue-300 text-xs rounded">Capacity planning</span>
                    <span className="px-2 py-1 bg-blue-900/50 text-blue-300 text-xs rounded">Time estimates</span>
                    <span className="px-2 py-1 bg-blue-900/50 text-blue-300 text-xs rounded">Guided setup</span>
                  </div>
                </button>

                {/* Manual Option */}
                <button
                  onClick={() => setStep(1)}
                  className="group bg-gradient-to-br from-gray-700/50 to-gray-800/30 border-2 border-gray-600/50 hover:border-gray-500 rounded-xl p-8 text-left transition-all hover:shadow-lg hover:shadow-gray-500/10"
                >
                  <div className="text-4xl mb-4">✏️</div>
                  <h3 className="text-xl font-bold text-white mb-2 group-hover:text-gray-300 transition-colors">
                    Create Manually
                  </h3>
                  <p className="text-sm text-gray-400 mb-4">
                    Jump straight into creating divisions and setting up formats.
                    Best if you know exactly what you want.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-2 py-1 bg-gray-700/50 text-gray-400 text-xs rounded">Full control</span>
                    <span className="px-2 py-1 bg-gray-700/50 text-gray-400 text-xs rounded">Quick setup</span>
                    <span className="px-2 py-1 bg-gray-700/50 text-gray-400 text-xs rounded">Experienced users</span>
                  </div>
                </button>
              </div>

              <button
                onClick={onCancel}
                className="mt-8 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Step 1: Basic Info */}
          {step === 1 && (
            <>
              <h2 className="text-2xl text-white font-bold mb-6">
                {plannerSettings ? 'Tournament Details' : 'Create Tournament'}
              </h2>
              {plannerSettings && (
                <div className="mb-6 p-4 bg-blue-900/30 border border-blue-700 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-blue-400">📊</span>
                    <span className="text-blue-300 font-medium">Planner Summary</span>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span className="text-gray-300">
                      <strong className="text-white">{plannerSettings.courts}</strong> courts
                    </span>
                    <span className="text-gray-300">
                      <strong className="text-white">{plannerSettings.startTime}</strong> - <strong className="text-white">{plannerSettings.endTime}</strong>
                    </span>
                    <span className="text-gray-300">
                      <strong className="text-white">{divisions.length}</strong> divisions pre-configured
                    </span>
                  </div>
                </div>
              )}
              {errorMessage && <div className="bg-red-900/50 text-red-200 p-3 mb-4 rounded text-sm font-bold border border-red-800">{errorMessage}</div>}
              <div className="space-y-4">
                  <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">Tournament Name</label>
                      <input 
                        className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none" 
                        placeholder="e.g. Summer Smash 2024"
                        value={formData.name} 
                        onChange={e => setFormData({...formData, name: e.target.value})}
                      />
                  </div>

                  <div>
                      <div className="flex justify-between items-end mb-1">
                          <label className="block text-sm font-medium text-gray-400">
                            Hosting Club <span className="text-gray-500">(Optional)</span>
                          </label>
                          {isAppAdmin && (
                              <button onClick={onCreateClub} className="text-xs text-green-400 hover:underline">
                                  + New Club
                              </button>
                          )}
                      </div>

                      <select
                        className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                        value={formData.clubId}
                        onChange={e => setFormData({...formData, clubId: e.target.value})}
                      >
                          <option value="">None (Independent Tournament)</option>
                          {availableClubs.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        Select a club for branding, or leave empty to host independently
                      </p>
                  </div>

                  <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">Description</label>
                      <textarea
                        className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none h-24"
                        placeholder="Tell players about your event..."
                        value={formData.description}
                        onChange={e => setFormData({...formData, description: e.target.value})}
                      />
                  </div>

                  {/* Registration Window */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                          <label className="block text-sm font-medium text-gray-400 mb-1">Registration Opens</label>
                          <input
                            type="datetime-local"
                            className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                            value={formData.registrationOpens ? new Date(formData.registrationOpens).toISOString().slice(0, 16) : ''}
                            onChange={e => setFormData({...formData, registrationOpens: e.target.value ? new Date(e.target.value).getTime() : undefined})}
                          />
                          <p className="text-xs text-gray-500 mt-1">When players can start registering</p>
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-400 mb-1">Registration Closes</label>
                          <input
                            type="datetime-local"
                            className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                            value={formData.registrationDeadline ? new Date(formData.registrationDeadline).toISOString().slice(0, 16) : ''}
                            onChange={e => setFormData({...formData, registrationDeadline: e.target.value ? new Date(e.target.value).getTime() : undefined})}
                          />
                          <p className="text-xs text-gray-500 mt-1">Last day to register</p>
                      </div>
                  </div>

                  {/* Payment Options */}
                  <div className="bg-gray-700/50 rounded-lg p-4 border border-gray-600">
                      <h4 className="text-sm font-medium text-gray-300 mb-3">Payment Options</h4>

                      {/* Free Event Toggle */}
                      <label className="flex items-center gap-3 cursor-pointer mb-4">
                          <input
                            type="checkbox"
                            checked={formData.isFreeEvent || false}
                            onChange={e => setFormData({...formData, isFreeEvent: e.target.checked, entryFee: e.target.checked ? 0 : formData.entryFee})}
                            className="w-5 h-5 rounded bg-gray-900 border-gray-600 text-green-600 focus:ring-green-500"
                          />
                          <span className="text-white">Free event (no entry fee)</span>
                      </label>

                      {/* Entry Fee (only if not free) */}
                      {!formData.isFreeEvent && (
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Entry Fee (per registration)</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="25.00"
                                className="w-full bg-gray-900 text-white p-3 pl-8 rounded border border-gray-600 focus:border-green-500 outline-none"
                                value={formData.entryFee || ''}
                                onChange={e => setFormData({...formData, entryFee: parseFloat(e.target.value) || 0})}
                              />
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                              Players can pay via credit card (Stripe) or cash/direct deposit. You'll receive ${formData.entryFee?.toFixed(2) || '0.00'} per registration.
                            </p>
                        </div>
                      )}
                  </div>

                  {/* Draft Mode Notice */}
                  <div className="flex items-center gap-2 p-3 bg-blue-900/30 rounded-lg border border-blue-700/50">
                      <span className="text-blue-400">ℹ️</span>
                      <p className="text-sm text-blue-300">
                        Tournament will be created as <strong>Draft</strong>. Publish when ready to make it visible to players.
                      </p>
                  </div>

                   <div className="flex justify-between items-center pt-4">
                      <button
                        onClick={() => plannerSettings ? setStep(0) : onCancel()}
                        className="text-gray-400 hover:text-white"
                      >
                        {plannerSettings ? 'Back to Options' : 'Cancel'}
                      </button>
                      <button onClick={handleNext} className="bg-green-600 text-white px-6 py-2 rounded font-bold hover:bg-green-500">
                        {plannerSettings && divisions.length > 0 ? 'Review Divisions' : 'Next: Divisions'}
                      </button>
                   </div>
              </div>
            </>
          )}

          {step === 2 && (
              <div className="space-y-8">
                  {/* Planner Summary Banner */}
                  {plannerSettings && (
                    <div className="mb-2 p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-blue-400">📊</span>
                          <span className="text-blue-300 font-medium text-sm">From Planner</span>
                        </div>
                        <span className="text-xs text-gray-400">
                          {plannerSettings.courts} courts • {plannerSettings.startTime} - {plannerSettings.endTime}
                        </span>
                      </div>
                      {divisions.length > 0 && (
                        <p className="text-xs text-gray-400 mt-2">
                          {divisions.length} divisions pre-configured from planner. You can edit or add more below.
                        </p>
                      )}
                    </div>
                  )}

                  {/* ADD DIVISION PANEL */}
                  <div className={`bg-gray-700/50 p-6 rounded border ${editingId ? 'border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.1)]' : 'border-gray-600'} space-y-6 transition-all duration-300`}>
                      <div className="flex justify-between items-center border-b border-gray-600 pb-2">
                          <h3 className="text-white font-bold text-lg">
                              {editingId ? 'Edit Division' : 'Add Division'}
                          </h3>
                          {editingId && (
                              <span className="text-xs text-green-400 font-bold uppercase tracking-wider animate-pulse">
                                  Editing Mode
                              </span>
                          )}
                      </div>
                      
                      {/* 1. Basic Info */}
                      <div>
                          <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">1. Basic Info</h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Gender</label>
                                    <select 
                                        className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 focus:border-green-500 outline-none"
                                        value={newDivBasic.gender}
                                        onChange={e => setNewDivBasic({...newDivBasic, gender: e.target.value as GenderCategory})}
                                    >
                                        <option value="men">Men</option>
                                        <option value="women">Women</option>
                                        <option value="mixed">Mixed</option>
                                        <option value="open">Open</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Type</label>
                                    <select 
                                        className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 focus:border-green-500 outline-none"
                                        value={newDivBasic.type}
                                        onChange={e => setNewDivBasic({...newDivBasic, type: e.target.value as EventType})}
                                    >
                                        <option value="doubles">Doubles</option>
                                        <option value="singles">Singles</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Min Rating</label>
                                    <input 
                                        type="number" step="0.1" placeholder="e.g. 3.0"
                                        className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 focus:border-green-500 outline-none"
                                        value={newDivBasic.minRating}
                                        onChange={e => setNewDivBasic({...newDivBasic, minRating: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Max Rating (Opt)</label>
                                    <input 
                                        type="number" step="0.1" placeholder="e.g. 4.0"
                                        className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 focus:border-green-500 outline-none"
                                        value={newDivBasic.maxRating}
                                        onChange={e => setNewDivBasic({...newDivBasic, maxRating: e.target.value})}
                                    />
                                </div>
                          </div>
                          
                          {/* Age Limits */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Min Age (Years)</label>
                                    <input 
                                        type="number" placeholder="e.g. 50"
                                        className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 focus:border-green-500 outline-none"
                                        value={newDivBasic.minAge}
                                        onChange={e => setNewDivBasic({...newDivBasic, minAge: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Max Age (Years)</label>
                                    <input 
                                        type="number" placeholder="e.g. 18"
                                        className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 focus:border-green-500 outline-none"
                                        value={newDivBasic.maxAge}
                                        onChange={e => setNewDivBasic({...newDivBasic, maxAge: e.target.value})}
                                    />
                                </div>
                          </div>
                      </div>

                      {/* 2. Format */}
                      <div>
                          <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">2. Competition Format</h4>

                          {/* Format Cards Selection (V06.00) */}
                          <div className="mb-4">
                              <FormatCards
                                  value={selectedFormat}
                                  onChange={handleFormatSelect}
                                  playType={newDivBasic.type === 'singles' ? 'singles' : 'doubles'}
                                  theme="dark"
                              />
                          </div>

                          {/* Advanced Settings Panel */}
                          <div className="bg-gray-800 p-4 rounded border border-gray-600">
                              <div className="mb-4">
                                   <label className="block text-xs text-gray-400 mb-1">Seeding Method</label>
                                   <select
                                      className="w-full bg-gray-900 text-white p-2 rounded border border-gray-700"
                                      value={newDivFormat.seedingMethod || 'rating'}
                                      onChange={e => setNewDivFormat({...newDivFormat, seedingMethod: e.target.value as SeedingMethod})}
                                   >
                                       <option value="rating">Rating Based (DUPR)</option>
                                       <option value="random">Random</option>
                                   </select>
                              </div>

                              {/* Pool Play → Medals Settings */}
                              {selectedFormat === 'pool_play_medals' && (
                                  <div className="space-y-4">
                                      <div className="p-3 bg-blue-900/20 border border-blue-700/30 rounded">
                                          <p className="text-xs text-blue-300">
                                            <strong>Pool Play → Medals:</strong> Teams play round robin in pools, then top finishers advance to a medal bracket.
                                          </p>
                                      </div>

                                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                          <div>
                                              <label className="block text-xs text-gray-400 mb-1">Pool Size</label>
                                              <select
                                                  className="w-full bg-gray-900 text-white p-2 rounded border border-gray-700"
                                                  value={poolPlaySettings.poolSize}
                                                  onChange={e => setPoolPlaySettings({...poolPlaySettings, poolSize: parseInt(e.target.value) as 3|4|5|6})}
                                              >
                                                  <option value="3">3 teams per pool</option>
                                                  <option value="4">4 teams per pool</option>
                                                  <option value="5">5 teams per pool</option>
                                                  <option value="6">6 teams per pool</option>
                                              </select>
                                          </div>
                                          <div>
                                              <label className="block text-xs text-gray-400 mb-1">Advancement Rule</label>
                                              <select
                                                  className="w-full bg-gray-900 text-white p-2 rounded border border-gray-700"
                                                  value={poolPlaySettings.advancementRule}
                                                  onChange={e => setPoolPlaySettings({...poolPlaySettings, advancementRule: e.target.value as 'top_1'|'top_2'|'top_n_plus_best'})}
                                              >
                                                  <option value="top_1">Top 1 from each pool</option>
                                                  <option value="top_2">Top 2 from each pool</option>
                                                  <option value="top_n_plus_best">Top 1 + Best remaining</option>
                                              </select>
                                          </div>
                                          <div>
                                              <label className="block text-xs text-gray-400 mb-1">Bronze Medal Match</label>
                                              <select
                                                  className="w-full bg-gray-900 text-white p-2 rounded border border-gray-700"
                                                  value={poolPlaySettings.bronzeMatch}
                                                  onChange={e => setPoolPlaySettings({...poolPlaySettings, bronzeMatch: e.target.value as 'yes'|'shared'|'no'})}
                                              >
                                                  <option value="yes">Yes - Play for bronze</option>
                                                  <option value="shared">Shared bronze (no match)</option>
                                                  <option value="no">No bronze medal</option>
                                              </select>
                                          </div>
                                      </div>

                                      <div className="p-3 bg-gray-900/50 rounded border border-gray-700/50">
                                          <label className="block text-xs text-gray-400 mb-2">Pool Standings Tiebreakers (in order)</label>
                                          <div className="flex flex-wrap gap-2">
                                              {poolPlaySettings.tiebreakers.map((tb, idx) => (
                                                  <span key={tb} className="px-2 py-1 bg-gray-800 text-gray-300 rounded text-xs">
                                                      {idx + 1}. {tb.replace('_', ' ')}
                                                  </span>
                                              ))}
                                          </div>
                                          <p className="text-[10px] text-gray-500 mt-1">
                                              Wins → Head-to-Head → Point Diff → Points Scored
                                          </p>
                                      </div>

                                      {/* Consolation bracket option */}
                                      <div className="flex items-center gap-4 p-3 bg-gray-900/30 rounded border border-gray-700/30">
                                          <label className="flex items-center gap-2">
                                              <input
                                                  type="checkbox"
                                                  checked={newDivFormat.plateEnabled}
                                                  onChange={e => setNewDivFormat({...newDivFormat, plateEnabled: e.target.checked})}
                                                  className="rounded bg-gray-900 border-gray-700 text-green-600"
                                              />
                                              <span className="text-sm text-white">Enable Consolation Bracket</span>
                                          </label>
                                          <span className="text-xs text-gray-500">(Medal bracket uses single elimination)</span>
                                      </div>
                                  </div>
                              )}

                              <div className="mt-6 pt-4 border-t border-gray-700">
                                  <h5 className="text-xs font-bold text-gray-500 uppercase mb-2">Match Rules</h5>
                                  <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
                                      <div>
                                          <label className="block text-xs text-gray-400 mb-1">Best of (Games)</label>
                                          <select
                                              className="w-full bg-gray-900 text-white p-2 rounded border border-gray-700"
                                              value={newDivFormat.bestOfGames}
                                              onChange={e => setNewDivFormat({...newDivFormat, bestOfGames: parseInt(e.target.value) as 1|3|5})}
                                          >
                                              <option value="1">1 Game</option>
                                              <option value="3">3 Games</option>
                                              <option value="5">5 Games</option>
                                          </select>
                                      </div>
                                      <div>
                                          <label className="block text-xs text-gray-400 mb-1">Points per Game</label>
                                          <select
                                              className="w-full bg-gray-900 text-white p-2 rounded border border-gray-700"
                                              value={newDivFormat.pointsPerGame}
                                              onChange={e => setNewDivFormat({...newDivFormat, pointsPerGame: parseInt(e.target.value) as 11|15|21})}
                                          >
                                              <option value="11">11 Points</option>
                                              <option value="15">15 Points</option>
                                              <option value="21">21 Points</option>
                                          </select>
                                      </div>
                                      <div>
                                          <label className="block text-xs text-gray-400 mb-1">Win by</label>
                                          <select
                                              className="w-full bg-gray-900 text-white p-2 rounded border border-gray-700"
                                              value={newDivFormat.winBy}
                                              onChange={e => setNewDivFormat({...newDivFormat, winBy: parseInt(e.target.value) as 1|2})}
                                          >
                                              <option value="1">1 Point</option>
                                              <option value="2">2 Points</option>
                                          </select>
                                      </div>
                                      <div className="flex items-end pb-2">
                                          <label className="flex items-center gap-2">
                                              <input 
                                                  type="checkbox" 
                                                  checked={newDivFormat.hasBronzeMatch}
                                                  onChange={e => setNewDivFormat({...newDivFormat, hasBronzeMatch: e.target.checked})}
                                                  className="rounded bg-gray-900 border-gray-700 text-green-600"
                                              />
                                              <span className="text-xs text-gray-300">Bronze Match?</span>
                                          </label>
                                      </div>
                                  </div>
                              </div>
                          </div>
                      </div>

                      <div className="flex justify-end pt-2 gap-2">
                          {editingId && (
                              <button 
                                  onClick={handleCancelEdit} 
                                  className="text-gray-400 hover:text-white px-4 py-2 text-sm font-bold"
                              >
                                  Cancel Edit
                              </button>
                          )}
                          <button 
                              onClick={handleSaveDivision} 
                              className={`${editingId ? 'bg-green-600 hover:bg-green-500' : 'bg-blue-600 hover:bg-blue-500'} text-white rounded font-bold px-6 py-2 transition-colors`}
                          >
                              {editingId ? 'Update Division' : 'Add Division'}
                          </button>
                      </div>
                  </div>

                  {/* LIST */}
                  <div className="space-y-2">
                      <h4 className="text-white font-bold">Divisions List</h4>
                      {divisions.length === 0 ? (
                          <p className="text-gray-500 italic text-sm">No divisions added yet.</p>
                      ) : (
                          divisions.map(d => (
                              <div key={d.id} className={`bg-gray-900 p-4 rounded flex justify-between items-center text-white border ${editingId === d.id ? 'border-green-500/50 bg-green-900/10' : 'border-gray-800'}`}>
                                  <div>
                                      <div className="font-bold flex items-center gap-2">
                                          {d.name}
                                          {editingId === d.id && <span className="text-[10px] bg-green-600 text-white px-1.5 rounded uppercase">Editing</span>}
                                      </div>
                                      <div className="text-xs text-gray-400 mt-1 space-x-3">
                                          <span>
                                            {d.format.stageMode === 'single_stage' 
                                                ? `Single Stage: ${d.format.mainFormat?.replace('_', ' ')}` 
                                                : `Two Stage: ${d.format.numberOfPools} Pools → ${d.format.stage2Format?.replace('_', ' ')}`
                                            }
                                          </span>
                                          <span>|</span>
                                          <span>Best of {d.format.bestOfGames} to {d.format.pointsPerGame}</span>
                                          {d.format.hasBronzeMatch && <span>| +Bronze</span>}
                                          {d.format.plateEnabled && <span>| +Plate</span>}
                                      </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                      <button 
                                          onClick={() => handleEditDivision(d)} 
                                          className="text-blue-400 hover:text-blue-300 text-sm font-medium"
                                      >
                                          Edit
                                      </button>
                                      <button 
                                          onClick={() => setDivisions(divisions.filter(x => x.id !== d.id))} 
                                          className="text-red-400 hover:text-red-300 text-sm font-medium"
                                      >
                                          Remove
                                      </button>
                                  </div>
                              </div>
                          ))
                      )}
                  </div>

                  <div className="flex justify-between pt-4 border-t border-gray-700">
                      <button onClick={() => setStep(1)} className="text-gray-400 hover:text-white">Back</button>
                      <button onClick={handleSubmit} disabled={isSubmitting} className="bg-green-600 hover:bg-green-500 text-white px-8 py-3 rounded font-bold shadow-lg">
                          {isSubmitting ? 'Creating...' : 'Create Tournament'}
                      </button>
                  </div>
              </div>
          )}
      </div>
  );
};
