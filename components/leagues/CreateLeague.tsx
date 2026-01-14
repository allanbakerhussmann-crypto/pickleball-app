/**
 * CreateLeague Component - 7-Step Wizard V07.15
 *
 * UPDATED V07.15:
 * - Complete UI redesign with "Sports Command Center" aesthetic
 * - New animated step indicator with icons
 * - Glass-morphism cards with subtle depth
 * - Improved typography and visual hierarchy
 * - Touch-friendly inputs with smooth animations
 * - Consistent lime/cyan/amber accent system
 *
 * FILE LOCATION: components/leagues/CreateLeague.tsx
 * VERSION: V07.15
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { createLeague, getClubsForUser, createLeagueDivision } from '../../services/firebase';
import type {
  LeagueType, LeagueFormat, LeagueSettings, LeaguePartnerSettings,
  LeaguePricing, LeagueMatchFormat, LeagueChallengeRules,
  LeagueRoundRobinSettings, LeagueSwissSettings, LeagueBoxSettings,
  LeagueTiebreaker, Club, GenderCategory, EventType, LeaguePrizePool,
  LeagueDuprSettings, LeagueDuprMode, ScoreVerificationSettings,
  PointsSystemPreset,
} from '../../types';
import { DEFAULT_SCORE_VERIFICATION, mapLegacyType, mapFormatToLegacy } from '../../types';
import type { CompetitionFormat } from '../../types/formats';
import { getFormatOption } from '../../types/formats';
import { VerificationSettingsForm } from './verification';
import { FormatCards } from '../shared/FormatSelector';
import { formatTime } from '../../utils/timeFormat';
import { StandingsPointsCard, RoundsSlider, type StandingsPointsConfig } from '../shared/PointsSlider';
import { VenueCapacityCalculator, type CapacityResult } from './VenueCapacityCalculator';
import { BoxLeagueVenueConfig } from './BoxLeagueVenueConfig';
import type { BoxLeagueVenueSettings, AbsencePolicyType } from '../../types/rotatingDoublesBox';
import { DEFAULT_BOX_LEAGUE_VENUE } from '../../types/rotatingDoublesBox';
import { DEFAULT_WAIVER_TEXT } from '../../constants';

// ============================================
// LOCAL TYPES
// ============================================

type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

interface LeagueCourt { id: string; name: string; order: number; active: boolean; }

interface LeagueScheduleConfig {
  numberOfWeeks: number;
  matchDays: DayOfWeek[];
  startDate: string;
  matchStartTime: string;
  matchEndTime: string;
  generatedDates: string[];
  skippedDates: string[];
}

interface LeagueVenueSettings {
  venueName: string;
  venueAddress?: string;
  courts: LeagueCourt[];
  matchDurationMinutes: number;
  bufferMinutes: number;
  autoAssignCourts: boolean;
  balanceCourtUsage: boolean;
  // V07.27: Single-session scheduling
  sessionStartTime: string;         // "18:00" format
  sessionEndTime: string;           // "21:00" format
  minRestMinutes: number;           // Player recovery time
  maxTeamsPerDivision?: number;     // Calculated capacity
}

interface CreateLeagueProps { onBack: () => void; onCreated: (leagueId: string) => void; }
interface DivisionDraft { 
  id: string; name: string; type: EventType; gender: GenderCategory; 
  minRating?: number | null; maxRating?: number | null; 
  minAge?: number | null; maxAge?: number | null; 
  maxParticipants?: number | null; 
}

// ============================================
// CONSTANTS
// ============================================

// Step configuration with icons and descriptions
const STEPS = [
  { label: 'Basics', icon: '🎾', desc: 'Name & Format' },
  { label: 'Schedule', icon: '📅', desc: 'Dates & Times' },
  { label: 'Divisions', icon: '🏆', desc: 'Skill Levels' },
  { label: 'Partners', icon: '👥', desc: 'Team Rules' },
  { label: 'Scoring', icon: '📊', desc: 'Points & Rules' },
  { label: 'Payment', icon: '💳', desc: 'Fees & Refunds' },
  { label: 'Review', icon: '✓', desc: 'Confirm & Create' },
];

const WEEKDAYS: { value: DayOfWeek; label: string; short: string }[] = [
  { value: 'monday', label: 'Monday', short: 'Mon' },
  { value: 'tuesday', label: 'Tuesday', short: 'Tue' },
  { value: 'wednesday', label: 'Wednesday', short: 'Wed' },
  { value: 'thursday', label: 'Thursday', short: 'Thu' },
  { value: 'friday', label: 'Friday', short: 'Fri' },
  { value: 'saturday', label: 'Saturday', short: 'Sat' },
  { value: 'sunday', label: 'Sunday', short: 'Sun' },
];

const TYPES: { value: LeagueType; label: string; desc: string }[] = [
  { value: 'singles', label: 'Singles', desc: '1v1' },
  { value: 'doubles', label: 'Doubles', desc: '2v2' },
  { value: 'mixed_doubles', label: 'Mixed', desc: 'M+F' },
];

const DUPR_MODE_OPTIONS: { value: LeagueDuprMode; label: string; desc: string; icon: string }[] = [
  { value: 'none', label: 'No DUPR', desc: 'Casual league - no DUPR accounts required', icon: '🎾' },
  { value: 'optional', label: 'DUPR Optional', desc: 'Players can link DUPR, submit if eligible', icon: '📊' },
  { value: 'required', label: 'DUPR Required', desc: 'All players must have linked DUPR accounts', icon: '✅' },
];

// V07.11: Points system presets for weekly round robin
const POINTS_PRESETS: { value: PointsSystemPreset; label: string; win: number; loss: number; desc: string }[] = [
  { value: 'win_only', label: 'Win Only (1-0)', win: 1, loss: 0, desc: 'Simple: 1 point for win, 0 for loss' },
  { value: 'enhanced', label: 'Enhanced (2-0)', win: 2, loss: 0, desc: 'Faster ladder movement' },
  { value: 'participation', label: 'Participation (2-1)', win: 2, loss: 1, desc: 'Everyone earns points' },
  { value: 'custom', label: 'Custom', win: 3, loss: 0, desc: 'Set your own values' },
];

// V07.11: Default tiebreakers for weekly round robin
const WEEKLY_RR_TIEBREAKERS: LeagueTiebreaker[] = [
  'league_points', 'wins', 'point_diff', 'points_for', 'head_to_head'
];

// ============================================
// HELPER FUNCTIONS
// ============================================

const getDayIndex = (day: DayOfWeek): number => {
  const map: Record<DayOfWeek, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6
  };
  return map[day];
};

const generateMatchDates = (
  startDate: string,
  numberOfWeeks: number,
  matchDays: DayOfWeek[],
  skippedDates: string[] = []
): string[] => {
  if (!startDate || numberOfWeeks <= 0 || matchDays.length === 0) return [];
  
  const dates: string[] = [];
  const start = new Date(startDate);
  const targetDayIndices = matchDays.map(getDayIndex);
  
  let currentDate = new Date(start);
  let weeksGenerated = 0;
  let lastWeekNumber = -1;
  
  while (weeksGenerated < numberOfWeeks) {
    const dayOfWeek = currentDate.getDay();
    const dateStr = currentDate.toISOString().split('T')[0];
    const weekNumber = Math.floor((currentDate.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
    
    if (targetDayIndices.includes(dayOfWeek)) {
      if (weekNumber !== lastWeekNumber) {
        weeksGenerated++;
        lastWeekNumber = weekNumber;
      }
      
      if (weeksGenerated <= numberOfWeeks && !skippedDates.includes(dateStr)) {
        dates.push(dateStr);
      }
    }
    
    currentDate.setDate(currentDate.getDate() + 1);
    if (dates.length > 100) break;
  }
  
  return dates;
};

const formatDateDisplay = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-NZ', { 
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
  });
};

// Use formatTime from utils/timeFormat (aliased as formatTimeDisplay for compatibility)
const formatTimeDisplay = formatTime;

// ============================================
// COMPONENT
// ============================================

export const CreateLeague: React.FC<CreateLeagueProps> = ({ onBack, onCreated }) => {
  const { currentUser, userProfile, isAppAdmin } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clubs, setClubs] = useState<Club[]>([]);
  const hasStripe = userProfile?.stripeConnectedAccountId && userProfile?.stripeChargesEnabled;

  // Step 1: Basic Info
  const [basic, setBasic] = useState({
    name: '', description: '', type: 'singles' as LeagueType, format: 'round_robin' as LeagueFormat,
    clubId: '', location: '', visibility: 'public' as 'public' | 'private' | 'club_only'
  });

  // New unified format (V06.00)
  const [selectedFormat, setSelectedFormat] = useState<CompetitionFormat>('round_robin');
  
  // Step 2: Schedule & Venue
  const [scheduleConfig, setScheduleConfig] = useState<LeagueScheduleConfig>({
    numberOfWeeks: 10, matchDays: ['tuesday'], startDate: '',
    matchStartTime: '18:00', matchEndTime: '21:00', generatedDates: [], skippedDates: [],
  });
  
  const [venueEnabled, setVenueEnabled] = useState(false);
  const [venue, setVenue] = useState<LeagueVenueSettings>({
    venueName: '', venueAddress: '',
    courts: [{ id: 'court_1', name: 'Court 1', order: 1, active: true }],
    matchDurationMinutes: 20, bufferMinutes: 5, autoAssignCourts: true, balanceCourtUsage: true,
    // V07.27: Single-session defaults
    sessionStartTime: '18:00', sessionEndTime: '21:00', minRestMinutes: 10,
  });

  // V07.27: Calculated capacity
  const [calculatedCapacity, setCalculatedCapacity] = useState<CapacityResult | null>(null);
  
  // Step 3: Divisions
  const [hasDivs, setHasDivs] = useState(false);
  const [divs, setDivs] = useState<DivisionDraft[]>([]);
  const [singleDiv, setSingleDiv] = useState<DivisionDraft>({ 
    id: 'default', name: 'Open', type: 'singles', gender: 'open', 
    minRating: null, maxRating: null, minAge: null, maxAge: null, maxParticipants: null 
  });
  
  // Step 4: Partner Settings
  const [partner, setPartner] = useState<LeaguePartnerSettings>({ 
    allowInvitePartner: true, allowOpenTeam: true, allowJoinOpen: true, 
    partnerLockRule: 'registration_close', partnerLockWeek: null, 
    allowSubstitutes: false, teamNameMode: 'auto' 
  });
  
  // Step 5: Scoring & Rules
  const [scoring, setScoring] = useState({
    pointsForWin: 1, pointsForDraw: 0, pointsForLoss: 0, pointsForForfeit: -1, pointsForNoShow: -2
  });
  // V07.11: Points preset selector
  const [pointsPreset, setPointsPreset] = useState<PointsSystemPreset>('win_only');
  const [matchFmt, setMatchFmt] = useState<LeagueMatchFormat>({ bestOf: 1, gamesTo: 11, winBy: 2 });
  const [scoreRep, setScoreRep] = useState({ matchDeadlineDays: 7 });
  const [challenge, setChallenge] = useState<LeagueChallengeRules>({
    challengeRange: 3, responseDeadlineHours: 48, matchDeadlineHours: 168,
    maxActiveChallenges: 2, cooldownDays: 3
  });
  const [rr, setRr] = useState<LeagueRoundRobinSettings>({ rounds: 1, scheduleGeneration: 'auto' });
  const [swiss, setSwiss] = useState<LeagueSwissSettings>({ rounds: 4, pairingMethod: 'adjacent' });
  const [box, setBox] = useState<LeagueBoxSettings>({
    playersPerBox: 4, promotionSpots: 1, relegationSpots: 1, roundsPerBox: 1
  });
  // V07.25: Box League Venue Settings (multi-session support)
  const [boxVenue, setBoxVenue] = useState<BoxLeagueVenueSettings>(DEFAULT_BOX_LEAGUE_VENUE);
  const [boxSize, setBoxSize] = useState<4 | 5 | 6>(5);
  // V07.27: Absence Policy (what happens to absent player's standings)
  const [absencePolicy, setAbsencePolicy] = useState<AbsencePolicyType>('freeze');
  const [allowSubstitutes, setAllowSubstitutes] = useState(true);
  const [tiebreakers, setTiebreakers] = useState<LeagueTiebreaker[]>(['head_to_head', 'game_diff', 'games_won']);
  
  // DUPR Settings (NEW V05.36)
  const [duprSettings, setDuprSettings] = useState<LeagueDuprSettings>({
    mode: 'none', autoSubmit: false, submitTrigger: 'on_confirmation',
    duprClubId: null, useDuprForSkillLevel: false,
    minDuprRating: null, maxDuprRating: null, ratingType: 'doubles',
  });

  // Score Verification Settings (NEW V05.44)
  const [verificationSettings, setVerificationSettings] = useState<ScoreVerificationSettings>(
    DEFAULT_SCORE_VERIFICATION
  );

  // V07.25: Waiver Settings
  const [waiverRequired, setWaiverRequired] = useState(true);
  const [waiverText, setWaiverText] = useState(DEFAULT_WAIVER_TEXT);

  // Step 6: Payment
  // Payment modes: 'free' = no payment, 'external' = collect outside app, 'stripe' = collect via Stripe
  const [paymentMode, setPaymentMode] = useState<'free' | 'external' | 'stripe'>('free');
  const [price, setPrice] = useState({ 
    entryFee: 1500, entryFeeType: 'per_player' as 'per_player' | 'per_team', 
    memberDiscount: 0, earlyBirdEnabled: false, earlyBirdFee: 1000, 
    lateFeeEnabled: false, lateFee: 2000, 
    prizePool: { enabled: false, type: 'none' as 'none' | 'fixed' | 'percentage', 
      amount: 0, distribution: { first: 60, second: 30, third: 10, fourth: 0 } 
    } as LeaguePrizePool,
    feesPaidBy: 'player' as 'player' | 'organizer', 
    refundPolicy: 'partial' as 'full' | 'partial' | 'none' 
  });

  // ============================================
  // EFFECTS
  // ============================================

  useEffect(() => { 
    if (currentUser) getClubsForUser(currentUser.uid).then(setClubs); 
  }, [currentUser]);
  
  useEffect(() => { 
    setSingleDiv(d => ({ ...d, type: basic.type === 'mixed_doubles' ? 'doubles' : basic.type as EventType })); 
  }, [basic.type]);

  useEffect(() => {
    setDuprSettings(d => ({ ...d, ratingType: basic.type === 'singles' ? 'singles' : 'doubles' }));
  }, [basic.type]);

  // Auto-populate duprClubId from selected club (if club has one)
  useEffect(() => {
    const selectedClub = clubs.find(c => c.id === basic.clubId);
    if (selectedClub?.duprClubId) {
      setDuprSettings(d => ({ ...d, duprClubId: selectedClub.duprClubId }));
    }
  }, [basic.clubId, clubs]);

  // Sync legacy format when new unified format changes
  useEffect(() => {
    const legacyFormat = mapFormatToLegacy(selectedFormat);
    setBasic(b => ({ ...b, format: legacyFormat }));
  }, [selectedFormat]);

  // V07.25: Auto-select 'singles' for rotating_doubles_box (individual entry, rotating partners)
  useEffect(() => {
    if (selectedFormat === 'rotating_doubles_box') {
      setBasic(b => ({ ...b, type: 'singles' }));
    }
  }, [selectedFormat]);

  // V07.11: Auto-update tiebreakers when weekly full RR is enabled
  useEffect(() => {
    if (rr.weeklyFullRoundRobin) {
      setTiebreakers(WEEKLY_RR_TIEBREAKERS);
    }
  }, [rr.weeklyFullRoundRobin]);

  // V07.13: Sync rounds with numberOfWeeks for Weekly Full RR
  // This ensures all weeks of matches are generated at once
  useEffect(() => {
    if (rr.weeklyFullRoundRobin) {
      setRr(prev => ({ ...prev, rounds: scheduleConfig.numberOfWeeks }));
    }
  }, [rr.weeklyFullRoundRobin, scheduleConfig.numberOfWeeks]);

  const generatedDates = useMemo(() => {
    return generateMatchDates(scheduleConfig.startDate, scheduleConfig.numberOfWeeks, 
      scheduleConfig.matchDays, scheduleConfig.skippedDates);
  }, [scheduleConfig.startDate, scheduleConfig.numberOfWeeks, scheduleConfig.matchDays, scheduleConfig.skippedDates]);

  const seasonEndDate = useMemo(() => {
    return generatedDates.length > 0 ? generatedDates[generatedDates.length - 1] : '';
  }, [generatedDates]);

  // ============================================
  // COMPUTED VALUES
  // ============================================

  const club = clubs.find(c => c.id === basic.clubId);
  const clubStripe = club?.stripeConnectedAccountId && club?.stripeChargesEnabled;
  const canPay = hasStripe || clubStripe;
  const isDoubles = basic.type === 'doubles' || basic.type === 'mixed_doubles';
  // V07.25: Check if this is a box league format (uses special venue config)
  const isBoxLeague = selectedFormat === 'rotating_doubles_box' || selectedFormat === 'fixed_doubles_box';
  const fmtCur = (c: number) => `$${(c / 100).toFixed(2)}`;
  
  // ============================================
  // VALIDATION
  // ============================================

  const validate = (s: number): string | null => {
    if (s === 1 && !basic.name.trim()) return 'Name required';
    if (s === 2 && !scheduleConfig.startDate) return 'Start date required';
    if (s === 2 && scheduleConfig.matchDays.length === 0) return 'Select at least one match day';
    if (s === 2 && scheduleConfig.numberOfWeeks < 1) return 'Must be at least 1 week';
    // V07.25: Box league requires venue name (always has venue config)
    if (s === 2 && isBoxLeague && !boxVenue.venueName.trim()) return 'Venue name required';
    if (s === 2 && !isBoxLeague && venueEnabled && !venue.venueName.trim()) return 'Venue name required';
    // V07.26: Skip divisions validation for box leagues (no divisions, just boxes)
    if (s === 3 && !isBoxLeague && hasDivs && divs.length === 0) return 'Add at least one division';
    if (s === 6 && paymentMode !== 'free' && price.entryFee < 100) return 'Minimum entry fee is $1';
    return null;
  };

  // ============================================
  // HELPERS
  // ============================================

  const toggleMatchDay = (day: DayOfWeek) => {
    const current = scheduleConfig.matchDays;
    setScheduleConfig({ ...scheduleConfig, 
      matchDays: current.includes(day) ? current.filter(d => d !== day) : [...current, day] 
    });
  };

  const toggleSkipDate = (date: string) => {
    const current = scheduleConfig.skippedDates;
    setScheduleConfig({ ...scheduleConfig, 
      skippedDates: current.includes(date) ? current.filter(d => d !== date) : [...current, date] 
    });
  };

  const addCourt = () => {
    const num = venue.courts.length + 1;
    setVenue({ ...venue, courts: [...venue.courts, { id: `court_${Date.now()}`, name: `Court ${num}`, order: num, active: true }] });
  };

  const updateCourt = (id: string, updates: Partial<LeagueCourt>) => {
    setVenue({ ...venue, courts: venue.courts.map(c => c.id === id ? { ...c, ...updates } : c) });
  };

  const removeCourt = (id: string) => {
    if (venue.courts.length <= 1) return;
    setVenue({ ...venue, courts: venue.courts.filter(c => c.id !== id) });
  };

  const addDiv = () => setDivs([...divs, { 
    id: `div_${Date.now()}`, name: `Division ${divs.length + 1}`, 
    type: basic.type as EventType, gender: 'open', 
    minRating: null, maxRating: null, minAge: null, maxAge: null, maxParticipants: null 
  }]);
  
  const updDiv = (id: string, u: Partial<DivisionDraft>) => setDivs(divs.map(d => d.id === id ? { ...d, ...u } : d));
  const delDiv = (id: string) => setDivs(divs.filter(d => d.id !== id));

  // ============================================
  // SUBMIT
  // ============================================

  const submit = async () => {
    if (!currentUser || !userProfile) return;
    for (let i = 1; i <= 6; i++) { const e = validate(i); if (e) { setError(e); setStep(i); return; } }
    setError(null); setLoading(true);
    
    try {
      const venueSettings = venueEnabled ? {
        venueName: venue.venueName, venueAddress: venue.venueAddress,
        courts: venue.courts, matchDurationMinutes: venue.matchDurationMinutes,
        bufferMinutes: venue.bufferMinutes, autoAssignCourts: venue.autoAssignCourts,
        balanceCourtUsage: venue.balanceCourtUsage, schedulingMode: 'venue_based' as const,
        // V07.27: Single-session scheduling
        sessionStartTime: venue.sessionStartTime,
        sessionEndTime: venue.sessionEndTime,
        minRestMinutes: venue.minRestMinutes,
        maxTeamsPerDivision: venue.maxTeamsPerDivision || calculatedCapacity?.maxTeams || null,
        scheduleConfig: {
          numberOfWeeks: scheduleConfig.numberOfWeeks, matchDays: scheduleConfig.matchDays,
          matchStartTime: scheduleConfig.matchStartTime, matchEndTime: scheduleConfig.matchEndTime,
          matchNights: generatedDates,
        },
      } : null;

      const settings: LeagueSettings = {
        minRating: hasDivs ? null : singleDiv.minRating, 
        maxRating: hasDivs ? null : singleDiv.maxRating,
        minAge: hasDivs ? null : singleDiv.minAge, 
        maxAge: hasDivs ? null : singleDiv.maxAge,
        maxMembers: hasDivs ? null : singleDiv.maxParticipants,
        pointsForWin: scoring.pointsForWin, pointsForDraw: scoring.pointsForDraw, 
        pointsForLoss: scoring.pointsForLoss, pointsForForfeit: scoring.pointsForForfeit, 
        pointsForNoShow: scoring.pointsForNoShow,
        matchFormat: matchFmt, matchDeadlineDays: scoreRep.matchDeadlineDays,
        allowSelfReporting: verificationSettings.entryMode !== 'organizer_only',
        requireConfirmation: verificationSettings.verificationMethod !== 'auto_confirm',
        tiebreakers, matchDays: scheduleConfig.matchDays,
        venueSettings: venueSettings as any,
        duprSettings: duprSettings.mode !== 'none' ? duprSettings : null,
        scoreVerification: verificationSettings,
        waiverRequired,
        waiverText: waiverRequired ? waiverText : null,
      };
      
      if (basic.format === 'ladder') settings.challengeRules = challenge;
      else if (basic.format === 'round_robin') settings.roundRobinSettings = rr;
      else if (basic.format === 'swiss') settings.swissSettings = swiss;
      else if (basic.format === 'box_league') settings.boxSettings = box;
      if (isDoubles) settings.partnerSettings = partner;

      // V07.26: Add rotatingDoublesBox settings for box leagues
      if (isBoxLeague) {
        settings.rotatingDoublesBox = {
          venue: boxVenue,
          settings: {
            boxSize: boxSize,
            gameSettings: { playType: 'doubles', pointsPerGame: 11, winBy: 2, bestOf: 1 },
            promotionCount: 2,
            relegationCount: 2,
            initialSeeding: 'dupr',
            tiebreakers: ['wins', 'game_diff', 'head_to_head'],
            scoreVerification: verificationSettings,
            absencePolicy: { policy: absencePolicy, allowSubstitutes: allowSubstitutes, subApproval: 'organizer_only', maxSubsPerSeason: 2 },
            newPlayerJoinPolicy: { allowMidSeason: true, entryBox: 'bottom', entryPosition: 'bottom' },
            substituteEligibility: { subMustBeMember: false, subAllowedFromBoxes: 'same_or_lower', subMustHaveDuprLinked: duprSettings.mode === 'required', subMustHaveDuprConsent: duprSettings.mode !== 'none' },
          },
        };
      }

      const pricing: LeaguePricing | null = paymentMode !== 'free' ? {
        paymentMode: paymentMode,
        enabled: true, entryFee: price.entryFee, entryFeeType: price.entryFeeType,
        memberDiscount: price.memberDiscount, earlyBirdEnabled: price.earlyBirdEnabled,
        earlyBirdFee: price.earlyBirdFee,
        earlyBirdDeadline: price.earlyBirdEnabled && scheduleConfig.startDate
          ? new Date(scheduleConfig.startDate).getTime() - 604800000 : null,
        lateFeeEnabled: price.lateFeeEnabled, lateFee: price.lateFee,
        lateRegistrationStart: price.lateFeeEnabled && scheduleConfig.startDate
          ? new Date(scheduleConfig.startDate).getTime() - 259200000 : null,
        prizePool: price.prizePool, feesPaidBy: price.feesPaidBy, refundPolicy: price.refundPolicy,
        refundDeadline: scheduleConfig.startDate ? new Date(scheduleConfig.startDate).getTime() : null,
        currency: 'nzd',
      } : null;

      const stripeId = basic.clubId && clubStripe 
        ? club?.stripeConnectedAccountId 
        : hasStripe ? userProfile.stripeConnectedAccountId : null;

      const leagueId = await createLeague({
        name: basic.name.trim(), description: basic.description.trim(),
        type: basic.type, format: basic.format,
        competitionFormat: selectedFormat, // V07.25: Store the new unified format
        clubId: basic.clubId || null, clubName: club?.name || null,
        createdByUserId: currentUser.uid,
        organizerName: userProfile.displayName || userProfile.email,
        seasonStart: new Date(scheduleConfig.startDate).getTime(),
        seasonEnd: seasonEndDate ? new Date(seasonEndDate).getTime() : new Date(scheduleConfig.startDate).getTime() + (scheduleConfig.numberOfWeeks * 7 * 24 * 60 * 60 * 1000),
        registrationOpens: null,
        registrationDeadline: scheduleConfig.startDate ? new Date(scheduleConfig.startDate).getTime() - (2 * 24 * 60 * 60 * 1000) : null,
        pricing, organizerStripeAccountId: stripeId, status: 'draft', settings,
        location: basic.location || null, venue: venueEnabled ? venue.venueName : null,
        visibility: basic.visibility, hasDivisions: hasDivs,
        // V07.27: Single-session scheduling
        timezone: 'Pacific/Auckland',  // Default NZ timezone
        maxTeamsPerDivision: venueEnabled ? (calculatedCapacity?.maxTeams || venue.maxTeamsPerDivision || undefined) : undefined,
        registrationOpen: true,
      });

      if (hasDivs) {
        for (let i = 0; i < divs.length; i++) {
          const d = divs[i];
          await createLeagueDivision(leagueId, { 
            name: d.name, type: d.type, gender: d.gender, 
            minRating: d.minRating, maxRating: d.maxRating, 
            minAge: d.minAge, maxAge: d.maxAge, maxParticipants: d.maxParticipants, 
            registrationOpen: true, order: i 
          });
        }
      }
      
      onCreated(leagueId);
    } catch (e: any) { 
      console.error('Create league error:', e);
      setError(e.message || 'Failed to create league'); 
    } finally { setLoading(false); }
  };

  // ============================================
  // RENDER STEP CONTENT
  // ============================================

  const renderStepContent = () => {
    switch (step) {
      // ==================== STEP 1: BASICS ====================
      case 1:
        return (
          <div className="space-y-8">
            {/* Section Header */}
            <div>
              <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-lime-500/20 text-lime-400 flex items-center justify-center text-xl">🎾</span>
                Basic Info
              </h2>
              <p className="text-gray-500 mt-2">Give your league a name and choose the competition format</p>
            </div>

            {/* League Name */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">
                League Name <span className="text-lime-500">*</span>
              </label>
              <input
                type="text"
                value={basic.name}
                onChange={e => setBasic({ ...basic, name: e.target.value })}
                className="
                  w-full bg-gray-800/50 border-2 border-gray-700/50 text-white p-4 rounded-xl
                  placeholder-gray-500 text-lg
                  focus:outline-none focus:border-lime-500/50 focus:bg-gray-800
                  transition-all duration-200
                "
                placeholder="e.g., Tuesday Night Ladder League"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">
                Description <span className="text-gray-600">(optional)</span>
              </label>
              <textarea
                value={basic.description}
                onChange={e => setBasic({ ...basic, description: e.target.value })}
                className="
                  w-full bg-gray-800/50 border-2 border-gray-700/50 text-white p-4 rounded-xl
                  placeholder-gray-500 min-h-[100px] resize-none
                  focus:outline-none focus:border-lime-500/50 focus:bg-gray-800
                  transition-all duration-200
                "
                placeholder="Tell players what makes this league special..."
              />
            </div>

            {/* Play Type Selection */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-300">
                Play Type <span className="text-lime-500">*</span>
              </label>
              {/* V07.25: Helper text for rotating doubles box */}
              {selectedFormat === 'rotating_doubles_box' && (
                <p className="text-xs text-cyan-400 bg-cyan-500/10 px-3 py-2 rounded-lg border border-cyan-500/20">
                  👤 + 👥 Players enter individually but play doubles matches with rotating partners
                </p>
              )}
              <div className="grid grid-cols-3 gap-3">
                {TYPES.map(t => {
                  // V07.25: For rotating_doubles_box, highlight both Singles AND Doubles
                  const isRotatingDoublesBox = selectedFormat === 'rotating_doubles_box';
                  const isHighlighted = isRotatingDoublesBox
                    ? (t.value === 'singles' || t.value === 'doubles')
                    : basic.type === t.value;
                  const isDisabled = isRotatingDoublesBox && t.value !== 'singles';

                  return (
                    <label
                      key={t.value}
                      className={`
                        relative flex flex-col items-center p-5 rounded-xl border-2
                        transition-all duration-200 group
                        ${isHighlighted
                          ? 'bg-lime-500/10 border-lime-500/50 shadow-lg shadow-lime-500/10'
                          : 'bg-gray-800/30 border-gray-700/50 hover:border-gray-600 hover:bg-gray-800/50'
                        }
                        ${isRotatingDoublesBox ? 'cursor-not-allowed' : 'cursor-pointer'}
                      `}
                    >
                      <input
                        type="radio"
                        checked={basic.type === t.value}
                        onChange={() => !isRotatingDoublesBox && setBasic({ ...basic, type: t.value })}
                        disabled={isRotatingDoublesBox}
                        className="sr-only"
                      />
                      {/* Selection Indicator - show on highlighted items for rotating doubles box */}
                      {isHighlighted && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-lime-500 flex items-center justify-center">
                          <span className="text-xs text-gray-900">✓</span>
                        </div>
                      )}
                      <span className={`
                        text-2xl mb-2
                        ${isHighlighted ? 'scale-110' : 'group-hover:scale-105'}
                        transition-transform
                        ${isDisabled ? 'opacity-100' : ''}
                      `}>
                        {t.value === 'singles' ? '👤' : t.value === 'doubles' ? '👥' : '👫'}
                      </span>
                      <span className={`font-semibold ${isHighlighted ? 'text-lime-400' : 'text-white'}`}>
                        {t.label}
                      </span>
                      <span className="text-xs text-gray-500 mt-1">
                        {isRotatingDoublesBox && t.value === 'singles' ? 'Entry' :
                         isRotatingDoublesBox && t.value === 'doubles' ? 'Gameplay' : t.desc}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Format Selection */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-300">
                Competition Format <span className="text-lime-500">*</span>
              </label>
              <FormatCards
                value={selectedFormat}
                onChange={setSelectedFormat}
                playType={mapLegacyType(basic.type)}
                eventType="league"
                theme="dark"
                isAppAdmin={isAppAdmin}
              />
            </div>

            {/* V07.12: Round Robin Type Selection - Shows when round_robin format selected */}
            {basic.format === 'round_robin' && (
              <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                <label className="block text-sm text-gray-400 mb-3">Round Robin Type *</label>
                <div className="space-y-2">
                  {/* Standard Round Robin */}
                  <label
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      !rr.weeklyFullRoundRobin
                        ? 'bg-lime-900/20 border-lime-600'
                        : 'bg-gray-900/50 border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="roundRobinType"
                      checked={!rr.weeklyFullRoundRobin}
                      onChange={() => setRr({ ...rr, weeklyFullRoundRobin: false })}
                      className="mt-1 accent-lime-500"
                    />
                    <div className="flex-1">
                      <div className="text-white font-medium">Standard Round Robin</div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {isDoubles
                          ? 'Each team plays every other team once, but matches are scheduled across multiple weeks rather than all in the same week.'
                          : 'Each player plays every other player once, but matches are scheduled across multiple weeks rather than all in the same week.'}
                      </p>
                    </div>
                  </label>

                  {/* Weekly Full Round Robin */}
                  <label
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      rr.weeklyFullRoundRobin
                        ? 'bg-lime-900/20 border-lime-600'
                        : 'bg-gray-900/50 border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="roundRobinType"
                      checked={rr.weeklyFullRoundRobin || false}
                      onChange={() => setRr({ ...rr, weeklyFullRoundRobin: true })}
                      className="mt-1 accent-lime-500"
                    />
                    <div className="flex-1">
                      <div className="text-white font-medium">Weekly Full Round Robin</div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {isDoubles
                          ? 'Every week is a full round robin where each team plays all other teams once. The same format repeats every week.'
                          : 'Every week is a full round robin where each player plays all other players once. The same format repeats every week.'}
                      </p>
                    </div>
                  </label>
                </div>

                {/* Max Teams/Players for Round Robin */}
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <label className="block text-sm text-gray-400 mb-2">
                    {isDoubles ? 'Maximum Teams' : 'Maximum Players'}
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      value={singleDiv.maxParticipants || ''}
                      onChange={e => setSingleDiv({ ...singleDiv, maxParticipants: e.target.value ? parseInt(e.target.value) : null })}
                      className="w-32 bg-gray-900 text-white p-2 rounded border border-gray-600"
                      placeholder="Unlimited"
                      min={3}
                      max={32}
                    />
                    {isDoubles && singleDiv.maxParticipants && (
                      <span className="text-sm text-gray-400">
                        = {singleDiv.maxParticipants * 2} players
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {isDoubles
                      ? rr.weeklyFullRoundRobin
                        ? 'Recommended: 4-8 teams. More teams = more matches per week.'
                        : 'Recommended: 4-16 teams for manageable scheduling.'
                      : rr.weeklyFullRoundRobin
                        ? 'Recommended: 4-8 players. More players = more matches per week.'
                        : 'Recommended: 4-16 players for manageable scheduling.'}
                  </p>
                </div>
              </div>
            )}

            {clubs.length > 0 && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Link to Club (optional)</label>
                <select value={basic.clubId} onChange={e => setBasic({ ...basic, clubId: e.target.value })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg">
                  <option value="">No club</option>
                  {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            
            <div>
              <label className="block text-sm text-gray-400 mb-1">Location / Region</label>
              <input type="text" value={basic.location} onChange={e => setBasic({ ...basic, location: e.target.value })} 
                className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg" placeholder="e.g., Auckland, NZ"/>
            </div>
          </div>
        );

      // ==================== STEP 2: SCHEDULE ====================
      case 2:
        return (
          <div className="space-y-8">
            {/* Section Header */}
            <div>
              <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xl">📅</span>
                Schedule & Venue
              </h2>
              <p className="text-gray-500 mt-2">Set up when and where matches will be played</p>
            </div>

            {/* League Duration */}
            <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700/50">
              <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                <span className="text-cyan-400">📅</span> League Duration
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">
                    Number of Weeks <span className="text-lime-500">*</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      value={scheduleConfig.numberOfWeeks}
                      onChange={e => setScheduleConfig({ ...scheduleConfig, numberOfWeeks: parseInt(e.target.value) || 1 })}
                      className="w-24 bg-gray-800 border-2 border-gray-700/50 text-white p-3 rounded-xl text-center text-lg font-semibold focus:outline-none focus:border-cyan-500/50 transition-all"
                      min={1}
                      max={52}
                    />
                    <span className="text-gray-400">weeks</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">
                    First Match Night <span className="text-lime-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={scheduleConfig.startDate}
                    onChange={e => setScheduleConfig({ ...scheduleConfig, startDate: e.target.value })}
                    className="w-full bg-gray-800 border-2 border-gray-700/50 text-white p-3 rounded-xl focus:outline-none focus:border-cyan-500/50 transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Match Days */}
            <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700/50">
              <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
                <span className="text-cyan-400">🔄</span> Match Day(s)
              </h3>
              <p className="text-sm text-gray-500 mb-4">Select which day(s) matches will be played each week</p>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map(day => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleMatchDay(day.value)}
                    className={`
                      px-5 py-3 rounded-xl border-2 font-medium transition-all duration-200
                      ${scheduleConfig.matchDays.includes(day.value)
                        ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400 shadow-lg shadow-cyan-500/10'
                        : 'bg-gray-800 border-gray-700/50 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                      }
                    `}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Match Times */}
            <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700/50">
              <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                <span className="text-cyan-400">🕐</span> Match Times
              </h3>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">Start Time</label>
                  <input
                    type="time"
                    value={scheduleConfig.matchStartTime}
                    onChange={e => setScheduleConfig({ ...scheduleConfig, matchStartTime: e.target.value })}
                    className="w-full bg-gray-800 border-2 border-gray-700/50 text-white p-3 rounded-xl focus:outline-none focus:border-cyan-500/50 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">End Time</label>
                  <input
                    type="time"
                    value={scheduleConfig.matchEndTime}
                    onChange={e => setScheduleConfig({ ...scheduleConfig, matchEndTime: e.target.value })}
                    className="w-full bg-gray-800 border-2 border-gray-700/50 text-white p-3 rounded-xl focus:outline-none focus:border-cyan-500/50 transition-all"
                  />
                </div>
              </div>
            </div>

            {generatedDates.length > 0 && (
              <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-white">📋 Match Nights Preview</h3>
                  <span className="text-sm text-blue-400">{generatedDates.length} nights</span>
                </div>
                <p className="text-xs text-gray-500 mb-3">Click a date to skip it (holidays, etc.)</p>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {generatedDates.map((date, idx) => {
                    const isSkipped = scheduleConfig.skippedDates.includes(date);
                    return (
                      <div key={date} onClick={() => toggleSkipDate(date)}
                        className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${isSkipped ? 'bg-red-900/20 border border-red-800 line-through text-gray-500' : 'bg-gray-900 hover:bg-gray-700'}`}>
                        <div className="flex items-center gap-3">
                          <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isSkipped ? 'bg-red-900/50 text-red-400' : 'bg-blue-900/50 text-blue-400'}`}>{idx + 1}</span>
                          <span className={isSkipped ? 'text-gray-500' : 'text-white'}>{formatDateDisplay(date)}</span>
                        </div>
                        <span className="text-gray-500 text-sm">{formatTimeDisplay(scheduleConfig.matchStartTime)} - {formatTimeDisplay(scheduleConfig.matchEndTime)}</span>
                      </div>
                    );
                  })}
                </div>
                {scheduleConfig.skippedDates.length > 0 && <p className="text-xs text-yellow-500 mt-2">⚠️ {scheduleConfig.skippedDates.length} date(s) skipped</p>}
              </div>
            )}

            {/* V07.25: Box League Venue Config (always shown for box leagues) */}
            {isBoxLeague && (
              <div className="space-y-6">
                <div className="bg-lime-900/20 p-4 rounded-xl border border-lime-700/50">
                  <h3 className="font-semibold text-lime-400 flex items-center gap-2">
                    <span>📦</span> Box League Venue Setup
                  </h3>
                  <p className="text-sm text-gray-400 mt-1">
                    Configure courts and sessions. Each box uses one court per session.
                  </p>
                </div>

                {/* Box Size Selector */}
                <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700/50">
                  <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                    <span className="text-lime-400">👥</span> Box Size
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    {([4, 5, 6] as const).map((size) => {
                      const rounds = size === 4 ? 3 : size === 5 ? 5 : 6;
                      const duration = rounds * (boxVenue.matchDurationMinutes + boxVenue.bufferMinutes);
                      return (
                        <button
                          key={size}
                          type="button"
                          onClick={() => setBoxSize(size)}
                          className={`
                            p-4 rounded-xl border-2 transition-all
                            ${boxSize === size
                              ? 'bg-lime-500/10 border-lime-500/50 shadow-lg shadow-lime-500/10'
                              : 'bg-gray-800 border-gray-700/50 hover:border-gray-600'
                            }
                          `}
                        >
                          <div className={`text-2xl font-bold ${boxSize === size ? 'text-lime-400' : 'text-white'}`}>
                            {size}
                          </div>
                          <div className="text-sm text-gray-400">players</div>
                          <div className="text-xs text-gray-500 mt-2">
                            {rounds} rounds (~{duration} min)
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <BoxLeagueVenueConfig
                  value={boxVenue}
                  onChange={setBoxVenue}
                  boxSize={boxSize}
                />

                {/* V07.27: Absence Policy */}
                <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700/50">
                  <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
                    <span className="text-lime-400">📋</span> Absence Policy
                  </h3>
                  <p className="text-sm text-gray-400 mb-4">
                    What happens to a player's standings when they're absent for a week?
                  </p>

                  {/* Policy Options */}
                  <div className="space-y-2 mb-4">
                    {([
                      { value: 'freeze' as const, label: 'Freeze Position', desc: 'Player stays in their current box position (no movement)' },
                      { value: 'ghost_score' as const, label: 'Ghost Score', desc: 'Player gets 0 wins, 0 points (likely relegates)' },
                      { value: 'average_points' as const, label: 'Average Points', desc: 'Player gets their season average stats (normal movement rules)' },
                      { value: 'auto_relegate' as const, label: 'Auto-Relegate', desc: 'Player automatically drops one box as penalty' },
                    ]).map((option) => (
                      <label
                        key={option.value}
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                          absencePolicy === option.value
                            ? 'bg-lime-500/10 border-lime-500/50'
                            : 'bg-gray-900/50 border-gray-700/50 hover:border-gray-600'
                        }`}
                      >
                        <input
                          type="radio"
                          name="absencePolicy"
                          value={option.value}
                          checked={absencePolicy === option.value}
                          onChange={() => setAbsencePolicy(option.value)}
                          className="mt-1 accent-lime-500"
                        />
                        <div>
                          <div className={`font-medium ${absencePolicy === option.value ? 'text-lime-400' : 'text-white'}`}>
                            {option.label}
                          </div>
                          <div className="text-sm text-gray-400">{option.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>

                  {/* Allow Substitutes Toggle */}
                  <div className="border-t border-gray-700/50 pt-4 mt-4">
                    <label className="flex items-center justify-between cursor-pointer">
                      <div>
                        <div className="font-medium text-white">Allow Ghost Players (Substitutes)</div>
                        <div className="text-sm text-gray-400">
                          Fill absent spots with temporary players so games can happen
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAllowSubstitutes(!allowSubstitutes)}
                        className={`w-12 h-6 rounded-full transition-colors ${
                          allowSubstitutes ? 'bg-lime-500' : 'bg-gray-600'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 bg-white rounded-full transition-transform ${
                            allowSubstitutes ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </label>
                    {allowSubstitutes && (
                      <p className="text-xs text-gray-500 mt-2">
                        Ghost player matches are NOT submitted to DUPR. The substitute is just filling a spot - results don't count for anyone's rating.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Regular Venue Toggle (non-box leagues) */}
            {!isBoxLeague && (
              <label className="flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-700 cursor-pointer">
                <div><div className="font-semibold text-white">🏟️ Venue-Based Scheduling</div><div className="text-sm text-gray-400">Assign courts to matches at a specific venue</div></div>
                <button type="button" onClick={() => setVenueEnabled(!venueEnabled)} className={`w-12 h-6 rounded-full transition-colors ${venueEnabled ? 'bg-blue-600' : 'bg-gray-600'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform ${venueEnabled ? 'translate-x-6' : 'translate-x-1'}`}/>
                </button>
              </label>
            )}

            {!isBoxLeague && venueEnabled && (
              <div className="space-y-4">
                <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                  <h3 className="font-semibold text-white mb-3">📍 Venue Details</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Venue Name *</label>
                      <input type="text" value={venue.venueName} onChange={e => setVenue({ ...venue, venueName: e.target.value })} 
                        className="w-full bg-gray-900 border border-gray-700 text-white p-2.5 rounded-lg" placeholder="e.g., Auckland Pickleball Centre"/>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Address</label>
                      <input type="text" value={venue.venueAddress || ''} onChange={e => setVenue({ ...venue, venueAddress: e.target.value })} 
                        className="w-full bg-gray-900 border border-gray-700 text-white p-2.5 rounded-lg" placeholder="123 Main St, Auckland"/>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-white">🎾 Courts ({venue.courts.length})</h3>
                    <button type="button" onClick={addCourt} className="text-blue-400 hover:text-blue-300 text-sm font-medium">+ Add Court</button>
                  </div>
                  <div className="space-y-2">
                    {venue.courts.map((court) => (
                      <div key={court.id} className="flex items-center gap-2 bg-gray-900 p-2 rounded-lg">
                        <input type="text" value={court.name} onChange={e => updateCourt(court.id, { name: e.target.value })} 
                          className="flex-1 bg-gray-800 border border-gray-700 text-white px-3 py-1.5 rounded text-sm"/>
                        <label className="flex items-center gap-1.5 text-sm text-gray-400 cursor-pointer">
                          <input type="checkbox" checked={court.active} onChange={e => updateCourt(court.id, { active: e.target.checked })} className="accent-green-500"/>Active
                        </label>
                        {venue.courts.length > 1 && <button type="button" onClick={() => removeCourt(court.id)} className="text-red-400 hover:text-red-300 p-1">✕</button>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* V07.27: Session Time Window */}
                <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                  <h3 className="font-semibold text-white mb-3">🕐 Session Time Window</h3>
                  <p className="text-xs text-gray-500 mb-3">Define when your league session runs (all matches must fit in this window)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Session Start</label>
                      <input type="time" value={venue.sessionStartTime} onChange={e => setVenue({ ...venue, sessionStartTime: e.target.value })}
                        className="w-full bg-gray-900 border border-gray-700 text-white p-2.5 rounded-lg"/>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Session End</label>
                      <input type="time" value={venue.sessionEndTime} onChange={e => setVenue({ ...venue, sessionEndTime: e.target.value })}
                        className="w-full bg-gray-900 border border-gray-700 text-white p-2.5 rounded-lg"/>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                  <h3 className="font-semibold text-white mb-3">⏱️ Match Timing</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Match Duration (min)</label>
                      <input type="number" value={venue.matchDurationMinutes} onChange={e => setVenue({ ...venue, matchDurationMinutes: parseInt(e.target.value) || 20 })}
                        className="w-full bg-gray-900 border border-gray-700 text-white p-2.5 rounded-lg" min={10} max={60}/>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Buffer (court)</label>
                      <input type="number" value={venue.bufferMinutes} onChange={e => setVenue({ ...venue, bufferMinutes: parseInt(e.target.value) || 5 })}
                        className="w-full bg-gray-900 border border-gray-700 text-white p-2.5 rounded-lg" min={0} max={30}/>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Rest (player)</label>
                      <input type="number" value={venue.minRestMinutes} onChange={e => setVenue({ ...venue, minRestMinutes: parseInt(e.target.value) || 10 })}
                        className="w-full bg-gray-900 border border-gray-700 text-white p-2.5 rounded-lg" min={0} max={60}/>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 mt-2">Buffer = court turnaround time. Rest = min gap before same team plays again.</p>
                </div>

                {/* V07.27: Capacity Calculator */}
                <VenueCapacityCalculator
                  courts={venue.courts.filter(c => c.active).length}
                  sessionStartTime={venue.sessionStartTime}
                  sessionEndTime={venue.sessionEndTime}
                  matchDurationMinutes={venue.matchDurationMinutes}
                  bufferMinutes={venue.bufferMinutes}
                  minRestMinutes={venue.minRestMinutes}
                  onCapacityCalculated={(result) => {
                    setCalculatedCapacity(result);
                    setVenue(prev => ({ ...prev, maxTeamsPerDivision: result.maxTeams }));
                  }}
                />
              </div>
            )}

            {!isBoxLeague && !venueEnabled && (
              <div className="bg-gray-700/30 p-4 rounded-lg border border-gray-600">
                <p className="text-gray-400 text-sm"><strong className="text-white">Self-Scheduled Mode:</strong> Players arrange their own match times and venues.</p>
              </div>
            )}
          </div>
        );

      // ==================== STEP 3: DIVISIONS ====================
      case 3:
        return (
          <div className="space-y-8">
            {/* Section Header */}
            <div>
              <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-xl">🏆</span>
                Divisions
              </h2>
              <p className="text-gray-500 mt-2">Optionally split players into skill levels or age groups</p>
            </div>

            {/* Multiple Divisions Toggle */}
            <div
              onClick={() => setHasDivs(!hasDivs)}
              className={`
                flex items-center justify-between p-5 rounded-xl border-2 cursor-pointer transition-all duration-200
                ${hasDivs
                  ? 'bg-amber-500/10 border-amber-500/50'
                  : 'bg-gray-800/50 border-gray-700/50 hover:border-gray-600'
                }
              `}
            >
              <div className="flex items-center gap-4">
                <span className="text-2xl">{hasDivs ? '📊' : '📋'}</span>
                <div>
                  <div className="font-semibold text-white">Multiple Divisions</div>
                  <div className="text-sm text-gray-400">e.g., A/B grades, age groups, skill levels</div>
                </div>
              </div>
              <div className={`w-14 h-8 rounded-full transition-all duration-200 flex items-center ${hasDivs ? 'bg-amber-500 justify-end' : 'bg-gray-700 justify-start'}`}>
                <div className="w-6 h-6 bg-white rounded-full mx-1 shadow-md" />
              </div>
            </div>
            
            {!hasDivs ? (
              <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-3">
                <h3 className="font-semibold text-white">Entry Restrictions (Optional)</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs text-gray-500">Min Rating</label><input type="number" step="0.1" value={singleDiv.minRating || ''} onChange={e => setSingleDiv({ ...singleDiv, minRating: e.target.value ? parseFloat(e.target.value) : null })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600" placeholder="Any"/></div>
                  <div><label className="block text-xs text-gray-500">Max Rating</label><input type="number" step="0.1" value={singleDiv.maxRating || ''} onChange={e => setSingleDiv({ ...singleDiv, maxRating: e.target.value ? parseFloat(e.target.value) : null })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600" placeholder="Any"/></div>
                  <div><label className="block text-xs text-gray-500">Min Age</label><input type="number" value={singleDiv.minAge || ''} onChange={e => setSingleDiv({ ...singleDiv, minAge: e.target.value ? parseInt(e.target.value) : null })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600" placeholder="Any"/></div>
                  <div><label className="block text-xs text-gray-500">Max Players</label><input type="number" value={singleDiv.maxParticipants || ''} onChange={e => setSingleDiv({ ...singleDiv, maxParticipants: e.target.value ? parseInt(e.target.value) : null })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600" placeholder="Unlimited"/></div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {divs.map(d => (
                  <div key={d.id} className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <input type="text" value={d.name} onChange={e => updDiv(d.id, { name: e.target.value })} className="bg-gray-900 text-white px-3 py-1.5 rounded border border-gray-600 font-semibold"/>
                      <button type="button" onClick={() => delDiv(d.id)} className="text-red-400 hover:text-red-300 text-sm">Remove</button>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-sm">
                      <div><label className="block text-xs text-gray-500">Min Rating</label><input type="number" step="0.1" value={d.minRating || ''} onChange={e => updDiv(d.id, { minRating: e.target.value ? parseFloat(e.target.value) : null })} className="w-full bg-gray-900 text-white p-1.5 rounded border border-gray-600"/></div>
                      <div><label className="block text-xs text-gray-500">Max Rating</label><input type="number" step="0.1" value={d.maxRating || ''} onChange={e => updDiv(d.id, { maxRating: e.target.value ? parseFloat(e.target.value) : null })} className="w-full bg-gray-900 text-white p-1.5 rounded border border-gray-600"/></div>
                      <div><label className="block text-xs text-gray-500">Min Age</label><input type="number" value={d.minAge || ''} onChange={e => updDiv(d.id, { minAge: e.target.value ? parseInt(e.target.value) : null })} className="w-full bg-gray-900 text-white p-1.5 rounded border border-gray-600"/></div>
                      <div><label className="block text-xs text-gray-500">Max</label><input type="number" value={d.maxParticipants || ''} onChange={e => updDiv(d.id, { maxParticipants: e.target.value ? parseInt(e.target.value) : null })} className="w-full bg-gray-900 text-white p-1.5 rounded border border-gray-600"/></div>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={addDiv} className="w-full py-3 border border-dashed border-gray-600 text-gray-400 rounded-lg hover:border-gray-500 hover:text-gray-300">+ Add Division</button>
              </div>
            )}
          </div>
        );

      // ==================== STEP 4: PARTNERS ====================
      case 4:
        if (!isDoubles) return (
          <div className="text-center py-16">
            <span className="text-6xl mb-4 block">👤</span>
            <p className="text-gray-400 text-lg">Partner settings are only available for doubles leagues</p>
          </div>
        );
        return (
          <div className="space-y-8">
            {/* Section Header */}
            <div>
              <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center text-xl">👥</span>
                Partner Settings
              </h2>
              <p className="text-gray-500 mt-2">Configure how players find and manage their partners</p>
            </div>
            <label className="flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-700 cursor-pointer">
              <div><div className="text-white font-semibold">Invite Partner</div><div className="text-sm text-gray-400">Players can invite specific partner</div></div>
              <input type="checkbox" checked={partner.allowInvitePartner} onChange={e => setPartner({ ...partner, allowInvitePartner: e.target.checked })} className="w-5 h-5 accent-blue-500"/>
            </label>
            <label className="flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-700 cursor-pointer">
              <div><div className="text-white font-semibold">Create Open Team</div><div className="text-sm text-gray-400">Register without partner</div></div>
              <input type="checkbox" checked={partner.allowOpenTeam} onChange={e => setPartner({ ...partner, allowOpenTeam: e.target.checked })} className="w-5 h-5 accent-blue-500"/>
            </label>
            <label className="flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-700 cursor-pointer">
              <div><div className="text-white font-semibold">Join Open Team</div><div className="text-sm text-gray-400">Join someone looking for partner</div></div>
              <input type="checkbox" checked={partner.allowJoinOpen} onChange={e => setPartner({ ...partner, allowJoinOpen: e.target.checked })} className="w-5 h-5 accent-blue-500"/>
            </label>
            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <label className="block text-sm text-gray-400 mb-2">Partner Lock</label>
              <div className="space-y-2">
                {(['registration_close', 'season_start', 'anytime', 'specific_week'] as const).map(r => (
                  <label key={r} className={`flex items-center gap-2 p-2 rounded cursor-pointer ${partner.partnerLockRule === r ? 'bg-gray-700' : ''}`}>
                    <input type="radio" checked={partner.partnerLockRule === r} onChange={() => setPartner({ ...partner, partnerLockRule: r })} className="accent-blue-500"/>
                    <span className="text-white text-sm">{r === 'registration_close' ? 'When registration closes' : r === 'season_start' ? 'When season starts' : r === 'anytime' ? 'Can change anytime' : 'After specific week'}</span>
                    {r === 'specific_week' && partner.partnerLockRule === r && <input type="number" min={1} max={20} value={partner.partnerLockWeek || 1} onChange={e => setPartner({ ...partner, partnerLockWeek: parseInt(e.target.value) })} className="w-14 bg-gray-700 text-white p-1 rounded text-center"/>}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-700 cursor-pointer">
              <span className="text-white font-semibold">Allow Substitutes</span>
              <input type="checkbox" checked={partner.allowSubstitutes} onChange={e => setPartner({ ...partner, allowSubstitutes: e.target.checked })} className="w-5 h-5 accent-blue-500"/>
            </label>
          </div>
        );

      // ==================== STEP 5: SCORING & DUPR ====================
      case 5:
        return (
          <div className="space-y-8">
            {/* Section Header */}
            <div>
              <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center text-xl">📊</span>
                Scoring & Rules
              </h2>
              <p className="text-gray-500 mt-2">Set up points system, match format, and competition rules</p>
            </div>

            {/* Points System */}
            <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700/50">
              <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                <span className="text-orange-400">🏆</span> Points System
              </h3>

              {/* V07.11: Preset dropdown */}
              <div className="mb-3">
                <label className="block text-xs text-gray-500 mb-1">Points Preset</label>
                <select
                  value={pointsPreset}
                  onChange={(e) => {
                    const preset = e.target.value as PointsSystemPreset;
                    setPointsPreset(preset);
                    const config = POINTS_PRESETS.find(p => p.value === preset);
                    if (config && preset !== 'custom') {
                      setScoring(s => ({ ...s, pointsForWin: config.win, pointsForLoss: config.loss, pointsForDraw: 0 }));
                    }
                  }}
                  className="w-full bg-gray-900 text-white p-2.5 rounded border border-gray-600"
                >
                  {POINTS_PRESETS.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">{POINTS_PRESETS.find(p => p.value === pointsPreset)?.desc}</p>
              </div>

              {/* Show full manual inputs only for custom - using new slider UI */}
              {pointsPreset === 'custom' && (
                <div className="mt-4 -mx-4 -mb-4">
                  <StandingsPointsCard
                    values={{
                      win: scoring.pointsForWin,
                      draw: scoring.pointsForDraw,
                      loss: scoring.pointsForLoss,
                      forfeit: scoring.pointsForForfeit,
                      noShow: scoring.pointsForNoShow,
                    }}
                    onChange={(newValues: StandingsPointsConfig) => setScoring({
                      ...scoring,
                      pointsForWin: newValues.win,
                      pointsForDraw: newValues.draw,
                      pointsForLoss: newValues.loss,
                      pointsForForfeit: newValues.forfeit,
                      pointsForNoShow: newValues.noShow,
                    })}
                  />
                </div>
              )}
            </div>
            
            {/* Match Format */}
            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <h3 className="font-semibold text-white mb-2">🎾 Match Format</h3>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="block text-xs text-gray-500">Best Of</label><select value={matchFmt.bestOf} onChange={e => setMatchFmt({ ...matchFmt, bestOf: parseInt(e.target.value) as 1|3|5 })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"><option value={1}>1 game</option><option value={3}>3 games</option><option value={5}>5 games</option></select></div>
                <div><label className="block text-xs text-gray-500">Points/Game</label><select value={matchFmt.gamesTo} onChange={e => setMatchFmt({ ...matchFmt, gamesTo: parseInt(e.target.value) as 11|15|21 })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"><option value={11}>11</option><option value={15}>15</option><option value={21}>21</option></select></div>
                <div><label className="block text-xs text-gray-500">Win By</label><select value={matchFmt.winBy} onChange={e => setMatchFmt({ ...matchFmt, winBy: parseInt(e.target.value) as 1|2 })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"><option value={1}>1</option><option value={2}>2</option></select></div>
              </div>
            </div>

            {/* Score Verification (NEW V05.44) */}
            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <h3 className="font-semibold text-white mb-3">📝 Score Verification</h3>
              <VerificationSettingsForm
                settings={verificationSettings}
                onChange={setVerificationSettings}
                leagueFormat={basic.format}
                duprMode={duprSettings.mode}
              />
            </div>

            {/* V07.25: Waiver Settings - Purple Theme */}
            <div className="bg-gray-800 p-4 rounded-lg border border-violet-500/30">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600/30 to-purple-600/30 flex items-center justify-center">
                  📋
                </div>
                <h3 className="font-semibold text-white">Waiver / Liability Agreement</h3>
              </div>
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer p-3 bg-gray-900/50 rounded-lg border border-violet-500/20 hover:border-violet-500/40 transition-colors">
                  <input
                    type="checkbox"
                    checked={waiverRequired}
                    onChange={(e) => setWaiverRequired(e.target.checked)}
                    className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-violet-500 focus:ring-violet-500 accent-violet-500"
                  />
                  <span className="text-white">Require waiver acceptance before joining</span>
                </label>
                {waiverRequired && (
                  <div className="space-y-2">
                    <label className="block text-sm text-gray-400">Waiver Text (14 sections - comprehensive legal coverage)</label>
                    <div className="bg-gray-900/50 rounded-lg border border-violet-500/20 overflow-hidden">
                      <div className="px-3 py-2 border-b border-violet-500/20 bg-gradient-to-r from-violet-600/10 to-purple-600/10">
                        <span className="text-xs text-violet-400">Preview - scroll to review all sections</span>
                      </div>
                      <textarea
                        value={waiverText}
                        onChange={(e) => setWaiverText(e.target.value)}
                        rows={8}
                        className="w-full bg-transparent text-gray-300 p-3 text-sm resize-none focus:outline-none"
                        placeholder="Enter waiver/liability text that players must accept..."
                      />
                    </div>
                    <p className="text-xs text-gray-500">Players must check a box agreeing to this text before joining</p>
                  </div>
                )}
              </div>
            </div>

            {/* Match Deadline - Not needed for Weekly Full RR or Box Leagues (matches happen same night at venue) */}
            {!rr.weeklyFullRoundRobin && !isBoxLeague && (
              <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                <h3 className="font-semibold text-white mb-2">⏰ Match Deadline</h3>
                <div className="flex items-center gap-2">
                  <input type="number" value={scoreRep.matchDeadlineDays} onChange={e => setScoreRep({ ...scoreRep, matchDeadlineDays: parseInt(e.target.value) || 7 })} className="w-20 bg-gray-900 text-white p-2 rounded border border-gray-600 text-center" min={1} max={30}/>
                  <span className="text-gray-400">days to complete each round</span>
                </div>
              </div>
            )}

            {/* ==================== DUPR INTEGRATION (NEW V05.36) ==================== */}
            <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 p-4 rounded-lg border border-purple-600/50">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                <span className="text-2xl">📊</span> DUPR Integration
              </h3>
              <p className="text-sm text-gray-400 mb-4">
                Connect your league to DUPR for official rating tracking
              </p>
              
              {/* DUPR Mode Selection - 'optional' hidden for now but kept in code for future use */}
              <div className="space-y-2 mb-4">
                {DUPR_MODE_OPTIONS.filter(opt => opt.value !== 'optional').map(opt => (
                  <label 
                    key={opt.value}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      duprSettings.mode === opt.value 
                        ? 'bg-purple-900/40 border-purple-500' 
                        : 'bg-gray-900/50 border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <input 
                      type="radio" 
                      checked={duprSettings.mode === opt.value} 
                      onChange={() => setDuprSettings({ ...duprSettings, mode: opt.value })} 
                      className="mt-1 accent-purple-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{opt.icon}</span>
                        <span className="text-white font-medium">{opt.label}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>

              {/* Additional DUPR Options (only show if not 'none') */}
              {duprSettings.mode !== 'none' && (
                <div className="space-y-3 pt-3 border-t border-gray-700">
                  {/* DUPR Compliance Notice - V07.12 */}
                  <div className="p-3 bg-lime-900/20 rounded-lg border border-lime-700/50">
                    <p className="text-xs text-lime-300">
                      <strong>DUPR Compliance:</strong> Only organiser-finalised results can be submitted to DUPR.
                      Players may propose and acknowledge scores, but the organiser must approve the official result.
                    </p>
                  </div>

                  {/* Auto-Queue Toggle (renamed from Auto-Submit) - V07.12 */}
                  <label className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg cursor-pointer">
                    <div>
                      <div className="text-white font-medium text-sm">Auto-queue matches for DUPR review</div>
                      <div className="text-xs text-gray-500">Eligible matches are added to the organiser's DUPR review queue. An organiser must finalise the official result and submit.</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={duprSettings.autoSubmit}
                      onChange={e => setDuprSettings({ ...duprSettings, autoSubmit: e.target.checked })}
                      className="w-5 h-5 accent-purple-500"
                    />
                  </label>

                  {/* DUPR Rating Restrictions */}
                  <label className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg cursor-pointer">
                    <div>
                      <div className="text-white font-medium text-sm">Use DUPR for Skill Restrictions</div>
                      <div className="text-xs text-gray-500">Enforce min/max DUPR ratings to join</div>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={duprSettings.useDuprForSkillLevel} 
                      onChange={e => setDuprSettings({ ...duprSettings, useDuprForSkillLevel: e.target.checked })} 
                      className="w-5 h-5 accent-purple-500"
                    />
                  </label>

                  {/* DUPR Rating Range (only if using DUPR for skill) */}
                  {duprSettings.useDuprForSkillLevel && (
                    <div className="p-3 bg-gray-900/50 rounded-lg space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Min DUPR Rating</label>
                          <input 
                            type="number" 
                            step="0.1" 
                            value={duprSettings.minDuprRating || ''} 
                            onChange={e => setDuprSettings({ ...duprSettings, minDuprRating: e.target.value ? parseFloat(e.target.value) : null })} 
                            className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600" 
                            placeholder="Any"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Max DUPR Rating</label>
                          <input 
                            type="number" 
                            step="0.1" 
                            value={duprSettings.maxDuprRating || ''} 
                            onChange={e => setDuprSettings({ ...duprSettings, maxDuprRating: e.target.value ? parseFloat(e.target.value) : null })} 
                            className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600" 
                            placeholder="Any"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Rating Type</label>
                        <select 
                          value={duprSettings.ratingType} 
                          onChange={e => setDuprSettings({ ...duprSettings, ratingType: e.target.value as 'singles' | 'doubles' | 'both' })} 
                          className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600"
                        >
                          <option value="singles">Singles Rating</option>
                          <option value="doubles">Doubles Rating</option>
                          <option value="both">Higher of Both</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Info Box - V07.12 Updated */}
                  <div className="p-3 bg-blue-900/20 rounded-lg border border-blue-800/50">
                    <p className="text-xs text-blue-300">
                      <strong>ℹ️ Note:</strong> DUPR submissions require all players to have linked DUPR accounts and an organiser-finalised official result.
                      {duprSettings.mode === 'optional' && ' Players without DUPR can still participate but their matches won\'t be submitted.'}
                      {duprSettings.mode === 'required' && ' Players must link their DUPR account before joining.'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Format-specific rules */}
            {basic.format === 'ladder' && (
              <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                <h3 className="font-semibold text-white mb-2">🪜 Ladder Rules</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs text-gray-500">Challenge Range</label><input type="number" value={challenge.challengeRange} onChange={e => setChallenge({ ...challenge, challengeRange: parseInt(e.target.value) || 3 })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600" min={1} max={10}/><span className="text-xs text-gray-500">positions up</span></div>
                  <div><label className="block text-xs text-gray-500">Response Time (hrs)</label><input type="number" value={challenge.responseDeadlineHours} onChange={e => setChallenge({ ...challenge, responseDeadlineHours: parseInt(e.target.value) || 48 })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"/></div>
                </div>
              </div>
            )}

            {basic.format === 'swiss' && (
              <RoundsSlider
                value={swiss.rounds}
                onChange={(v) => setSwiss({ ...swiss, rounds: v })}
                min={2}
                max={10}
                label="Swiss Rounds"
                hint="Number of rounds in the Swiss system tournament"
              />
            )}

            {/* V07.26: Hide for rotating/fixed doubles box - already configured in Schedule step */}
            {basic.format === 'box_league' && !isBoxLeague && (
              <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                <h3 className="font-semibold text-white mb-2">📦 Box League</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div><label className="block text-xs text-gray-500">Players/Box</label><input type="number" value={box.playersPerBox} onChange={e => setBox({ ...box, playersPerBox: parseInt(e.target.value) || 4 })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600" min={3} max={8}/></div>
                  <div><label className="block text-xs text-gray-500">Promote</label><input type="number" value={box.promotionSpots} onChange={e => setBox({ ...box, promotionSpots: parseInt(e.target.value) || 1 })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600" min={0} max={3}/></div>
                  <div><label className="block text-xs text-gray-500">Relegate</label><input type="number" value={box.relegationSpots} onChange={e => setBox({ ...box, relegationSpots: parseInt(e.target.value) || 1 })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600" min={0} max={3}/></div>
                </div>
              </div>
            )}
          </div>
        );

      // ==================== STEP 6: PAYMENT ====================
      case 6:
        return (
          <div className="space-y-8">
            {/* Section Header */}
            <div>
              <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xl">💳</span>
                Payment
              </h2>
              <p className="text-gray-500 mt-2">Choose how players will pay to join your league</p>
            </div>

            {/* Payment Mode Selection */}
            <div className="space-y-4">
              {/* Free League Option */}
              <label
                className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                  paymentMode === 'free'
                    ? 'bg-green-900/20 border-green-600'
                    : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                }`}
                onClick={() => setPaymentMode('free')}
              >
                <input type="radio" name="paymentMode" checked={paymentMode === 'free'} onChange={() => setPaymentMode('free')} className="sr-only"/>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMode === 'free' ? 'border-green-500' : 'border-gray-500'}`}>
                  {paymentMode === 'free' && <div className="w-2.5 h-2.5 rounded-full bg-green-500"/>}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-white">Free League</div>
                  <div className="text-sm text-gray-400">No payment required to join</div>
                </div>
              </label>

              {/* External Payment Option */}
              <label
                className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                  paymentMode === 'external'
                    ? 'bg-blue-900/20 border-blue-600'
                    : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                }`}
                onClick={() => setPaymentMode('external')}
              >
                <input type="radio" name="paymentMode" checked={paymentMode === 'external'} onChange={() => setPaymentMode('external')} className="sr-only"/>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMode === 'external' ? 'border-blue-500' : 'border-gray-500'}`}>
                  {paymentMode === 'external' && <div className="w-2.5 h-2.5 rounded-full bg-blue-500"/>}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-white">Collect Payment Outside App</div>
                  <div className="text-sm text-gray-400">Entry fee shown but you collect payment directly</div>
                </div>
              </label>

              {/* Stripe Payment Option */}
              <label
                className={`flex items-center gap-3 p-4 rounded-lg border transition-colors ${
                  !canPay
                    ? 'opacity-50 cursor-not-allowed bg-gray-800 border-gray-700'
                    : paymentMode === 'stripe'
                      ? 'bg-purple-900/20 border-purple-600 cursor-pointer'
                      : 'bg-gray-800 border-gray-700 hover:border-gray-600 cursor-pointer'
                }`}
                onClick={() => canPay && setPaymentMode('stripe')}
              >
                <input type="radio" name="paymentMode" checked={paymentMode === 'stripe'} onChange={() => canPay && setPaymentMode('stripe')} disabled={!canPay} className="sr-only"/>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMode === 'stripe' ? 'border-purple-500' : 'border-gray-500'}`}>
                  {paymentMode === 'stripe' && <div className="w-2.5 h-2.5 rounded-full bg-purple-500"/>}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-white flex items-center gap-2">
                    Collect via Stripe
                    <span className="text-xs px-1.5 py-0.5 rounded bg-purple-600/30 text-purple-300">⚡ Recommended</span>
                  </div>
                  <div className="text-sm text-gray-400">Secure online payments, automatic registration</div>
                </div>
                {!canPay && (
                  <span className="text-xs text-yellow-400">Setup Required</span>
                )}
              </label>

              {!canPay && (
                <div className="bg-yellow-900/20 border border-yellow-600 p-3 rounded-lg">
                  <p className="text-yellow-400 text-sm">💳 Connect Stripe to accept online payments. Go to Settings → Stripe to set up.</p>
                </div>
              )}
            </div>

            {/* Fee Details (shown for external and stripe modes) */}
            {paymentMode !== 'free' && (
              <div className="space-y-4 mt-4">
                <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                  {/* Entry Fee Dropdown */}
                  <div className="mb-4">
                    <label className="block text-sm text-gray-400 mb-2">Entry Fee</label>
                    <select
                      value={Math.round(price.entryFee / 100)}
                      onChange={(e) => setPrice({ ...price, entryFee: parseInt(e.target.value) * 100 })}
                      className="w-full bg-gray-900 text-white text-lg font-semibold p-3 rounded-lg border border-gray-600 focus:border-lime-500 focus:outline-none"
                    >
                      {Array.from({ length: 201 }, (_, i) => i).map((amt) => (
                        <option key={amt} value={amt}>
                          ${amt}
                        </option>
                      ))}
                    </select>
                    {/* Quick presets */}
                    <div className="flex flex-wrap gap-2 mt-3">
                      {[10, 15, 20, 25, 30, 40, 50, 75, 100].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setPrice({ ...price, entryFee: amt * 100 })}
                          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                            Math.round(price.entryFee / 100) === amt
                              ? 'bg-lime-500 text-gray-900'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          ${amt}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Fee Type */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Fee Type</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setPrice({ ...price, entryFeeType: 'per_player' })}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                          price.entryFeeType === 'per_player'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        Per Player
                      </button>
                      <button
                        type="button"
                        onClick={() => setPrice({ ...price, entryFeeType: 'per_team' })}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                          price.entryFeeType === 'per_team'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        Per Team
                      </button>
                    </div>
                  </div>
                </div>
                {paymentMode === 'stripe' && (
                  <>
                    {/* Who pays fees */}
                    <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                      <label className="block text-sm text-gray-400 mb-2">Who Pays Processing Fees?</label>
                      <p className="text-xs text-gray-500 mb-3">
                        Platform fee (1.5%) + Stripe fee (2.9% + 30¢) are charged on each payment
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setPrice({ ...price, feesPaidBy: 'organizer' })}
                          className={`p-3 rounded-lg border-2 transition-all ${
                            price.feesPaidBy === 'organizer'
                              ? 'border-lime-500 bg-lime-500/10'
                              : 'border-gray-600 hover:border-gray-500'
                          }`}
                        >
                          <div className={`font-medium ${price.feesPaidBy === 'organizer' ? 'text-lime-400' : 'text-white'}`}>
                            I'll absorb fees
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            Players pay ${Math.round(price.entryFee / 100)} exactly
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPrice({ ...price, feesPaidBy: 'player' })}
                          className={`p-3 rounded-lg border-2 transition-all ${
                            price.feesPaidBy === 'player'
                              ? 'border-lime-500 bg-lime-500/10'
                              : 'border-gray-600 hover:border-gray-500'
                          }`}
                        >
                          <div className={`font-medium ${price.feesPaidBy === 'player' ? 'text-lime-400' : 'text-white'}`}>
                            Player pays fees
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            ~${(Math.round(price.entryFee / 100) + Math.ceil(price.entryFee * 0.044 / 100) + 1).toFixed(0)} total
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* Refund Policy */}
                    <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                      <label className="block text-sm text-gray-400 mb-2">Refund Policy</label>
                      <select
                        value={price.refundPolicy}
                        onChange={(e) => setPrice({ ...price, refundPolicy: e.target.value as typeof price.refundPolicy })}
                        className="w-full bg-gray-900 text-white p-2.5 rounded border border-gray-600"
                      >
                        <option value="full">100% refund before league starts</option>
                        <option value="full_14days">100% refund up to 14 days before</option>
                        <option value="full_7days">100% refund up to 7 days before</option>
                        <option value="75_percent">75% refund before league starts</option>
                        <option value="partial">50% refund before league starts</option>
                        <option value="25_percent">25% refund before league starts</option>
                        <option value="admin_fee_only">Full refund minus $5 admin fee</option>
                        <option value="none">No refunds</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );

      // ==================== STEP 7: REVIEW ====================
      case 7:
        return (
          <div className="space-y-8">
            {/* Section Header */}
            <div>
              <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-lime-500/20 text-lime-400 flex items-center justify-center text-xl">✓</span>
                Review & Create
              </h2>
              <p className="text-gray-500 mt-2">Double-check your settings before creating the league</p>
            </div>

            {/* Summary Cards */}
            <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700/50">
              <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                <span className="text-lime-400">📋</span> Basic Info
              </h3>
              <div className="grid grid-cols-2 gap-1 text-sm">
                <span className="text-gray-400">Name:</span><span className="text-white">{basic.name}</span>
                <span className="text-gray-400">Type:</span><span className="text-white capitalize">{basic.type.replace('_', ' ')}</span>
                <span className="text-gray-400">Format:</span><span className="text-white">{getFormatOption(selectedFormat)?.label || selectedFormat}</span>
              </div>
            </div>
            
            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <h3 className="font-semibold text-white mb-2">📅 Schedule</h3>
              <div className="text-sm space-y-1">
                <div><span className="text-gray-400">Duration:</span> <span className="text-white">{scheduleConfig.numberOfWeeks} weeks</span></div>
                <div><span className="text-gray-400">Match Days:</span> <span className="text-white">{scheduleConfig.matchDays.map(d => WEEKDAYS.find(w => w.value === d)?.label).join(', ')}</span></div>
                <div><span className="text-gray-400">Time:</span> <span className="text-white">{formatTimeDisplay(scheduleConfig.matchStartTime)} - {formatTimeDisplay(scheduleConfig.matchEndTime)}</span></div>
                <div><span className="text-gray-400">Match Nights:</span> <span className="text-blue-400">{generatedDates.length} nights scheduled</span></div>
                {scheduleConfig.startDate && <div><span className="text-gray-400">First Night:</span> <span className="text-white">{formatDateDisplay(scheduleConfig.startDate)}</span></div>}
                {seasonEndDate && <div><span className="text-gray-400">Last Night:</span> <span className="text-white">{formatDateDisplay(seasonEndDate)}</span></div>}
              </div>
              {venueEnabled && <div className="mt-2 pt-2 border-t border-gray-700 text-sm"><span className="text-gray-400">Venue:</span><span className="text-white ml-2">{venue.venueName}</span><span className="text-gray-500 ml-2">({venue.courts.length} courts)</span></div>}
            </div>
            
            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <h3 className="font-semibold text-white mb-2">🎯 Scoring & Verification</h3>
              <div className="text-sm text-white">W:{scoring.pointsForWin} D:{scoring.pointsForDraw} L:{scoring.pointsForLoss}</div>
              <div className="text-sm text-gray-400">Best of {matchFmt.bestOf}, to {matchFmt.gamesTo}</div>
              <div className="mt-2 pt-2 border-t border-gray-700 text-sm space-y-1">
                <div><span className="text-gray-400">Entry:</span> <span className="text-white">{verificationSettings.entryMode.replace('_', ' ')}</span></div>
                <div><span className="text-gray-400">Verification:</span> <span className="text-white">{verificationSettings.verificationMethod.replace('_', ' ')}</span></div>
                {verificationSettings.autoFinalizeHours > 0 && (
                  <div><span className="text-gray-400">Auto-finalize:</span> <span className="text-white">{verificationSettings.autoFinalizeHours}h</span></div>
                )}
                <div><span className="text-gray-400">Disputes:</span> <span className="text-white">{verificationSettings.allowDisputes ? 'Allowed' : 'Not allowed'}</span></div>
              </div>
            </div>

            {/* DUPR Summary */}
            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <h3 className="font-semibold text-white mb-2">📊 DUPR Integration</h3>
              <div className="text-sm">
                {duprSettings.mode === 'none' && <span className="text-gray-400">No DUPR tracking (casual league)</span>}
                {duprSettings.mode === 'optional' && (
                  <div className="space-y-1">
                    <span className="text-blue-400">DUPR Optional</span>
                    {duprSettings.autoSubmit && <div className="text-gray-400">• Auto-submit enabled</div>}
                  </div>
                )}
                {duprSettings.mode === 'required' && (
                  <div className="space-y-1">
                    <span className="text-green-400">DUPR Required ✓</span>
                    {duprSettings.autoSubmit && <div className="text-gray-400">• Auto-submit enabled</div>}
                    {duprSettings.useDuprForSkillLevel && (
                      <div className="text-gray-400">• Rating range: {duprSettings.minDuprRating || 'Any'} - {duprSettings.maxDuprRating || 'Any'}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <h3 className="font-semibold text-white mb-2">💰 Payment</h3>
              {paymentMode === 'free' ? (
                <div className="text-sm text-green-400">Free - No payment required</div>
              ) : (
                <div className="text-sm space-y-1">
                  <div className="text-white">{fmtCur(price.entryFee)} per {price.entryFeeType === 'per_team' ? 'team' : 'player'}</div>
                  <div className="text-gray-400">
                    {paymentMode === 'stripe' ? 'Collected via Stripe' : 'Collected outside app'}
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // ============================================
  // MAIN RENDER
  // ============================================

  return (
    <div className="max-w-4xl mx-auto px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="group flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <span className="w-8 h-8 rounded-lg bg-gray-800/80 border border-gray-700/50 flex items-center justify-center group-hover:bg-gray-700/80 group-hover:border-gray-600 transition-all">
              ←
            </span>
            <span className="hidden sm:inline text-sm">Back</span>
          </button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Create League</h1>
            <p className="text-gray-500 text-sm mt-0.5">Step {step} of 7 • {STEPS[step - 1].desc}</p>
          </div>
        </div>
      </div>

      {/* Step Indicator - Horizontal Progress */}
      <div className="mb-8">
        {/* Progress Bar Background */}
        <div className="relative">
          <div className="absolute top-5 left-0 right-0 h-1 bg-gray-800 rounded-full" />
          <div
            className="absolute top-5 left-0 h-1 bg-gradient-to-r from-lime-500 to-lime-400 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${((step - 1) / 6) * 100}%` }}
          />

          {/* Step Dots */}
          <div className="relative flex justify-between">
            {STEPS.map((s, i) => {
              const n = i + 1;
              const active = step === n;
              const done = step > n;
              // Skip Divisions (3) and Partners (4) for box leagues; Skip Partners (4) for singles
              const skip = (isBoxLeague && (n === 3 || n === 4)) || (n === 4 && !isDoubles);

              return (
                <div
                  key={n}
                  className={`flex flex-col items-center transition-all duration-300 ${skip ? 'opacity-40' : ''}`}
                >
                  {/* Step Circle */}
                  <div
                    className={`
                      w-10 h-10 rounded-xl flex items-center justify-center text-lg
                      transition-all duration-300 transform
                      ${active
                        ? 'bg-gradient-to-br from-lime-500 to-lime-600 text-gray-900 scale-110 shadow-lg shadow-lime-500/30 ring-4 ring-lime-500/20'
                        : done
                          ? 'bg-lime-600/20 text-lime-400 border-2 border-lime-500/50'
                          : 'bg-gray-800 text-gray-500 border-2 border-gray-700'
                      }
                    `}
                  >
                    {done ? '✓' : s.icon}
                  </div>

                  {/* Step Label */}
                  <span className={`
                    text-xs font-medium mt-2 transition-colors hidden sm:block
                    ${active ? 'text-lime-400' : done ? 'text-gray-400' : 'text-gray-600'}
                  `}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-950/50 border border-red-500/30 flex items-start gap-3">
          <span className="text-red-400 text-xl">⚠️</span>
          <div>
            <p className="text-red-400 font-medium">Please fix the following:</p>
            <p className="text-red-300/80 text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Main Content Card */}
      <div className="relative">
        {/* Glow Effect */}
        <div className="absolute -inset-1 bg-gradient-to-r from-lime-500/10 via-transparent to-cyan-500/10 rounded-2xl blur-xl opacity-50" />

        {/* Card */}
        <div className="relative bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50 overflow-hidden">
          {/* Card Header Accent */}
          <div className="h-1 bg-gradient-to-r from-lime-500 via-cyan-500 to-lime-500" />

          {/* Content */}
          <div className="p-6 sm:p-8">
            {renderStepContent()}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-8 pb-8">
        <button
          onClick={() => {
            let prevStep = step - 1;
            // Box leagues: skip back over steps 3 and 4
            if (isBoxLeague && prevStep === 4) prevStep = 2;
            else if (isBoxLeague && prevStep === 3) prevStep = 2;
            // Singles: skip back over step 4
            else if (!isDoubles && prevStep === 4) prevStep = 3;
            setStep(Math.max(1, prevStep));
          }}
          disabled={step === 1}
          className={`
            group flex items-center gap-2 px-5 py-3 rounded-xl font-medium
            transition-all duration-200
            ${step === 1
              ? 'text-gray-600 cursor-not-allowed'
              : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
            }
          `}
        >
          <span className="group-hover:-translate-x-1 transition-transform">←</span>
          Previous
        </button>

        {step < 7 ? (
          <button
            onClick={() => {
              const e = validate(step);
              if (e) setError(e);
              else {
                setError(null);
                let nextStep = step + 1;
                // Box leagues: skip steps 3 and 4 (Divisions & Partners)
                if (isBoxLeague && step === 2) nextStep = 5;
                // Singles: skip step 4 (Partners)
                else if (!isDoubles && step === 3) nextStep = 5;
                setStep(nextStep);
              }
            }}
            className="
              group flex items-center gap-2 px-8 py-3 rounded-xl font-semibold
              bg-gradient-to-r from-lime-500 to-lime-600
              hover:from-lime-400 hover:to-lime-500
              text-gray-900
              shadow-lg shadow-lime-500/25 hover:shadow-lime-500/40
              transition-all duration-200
            "
          >
            Continue
            <span className="group-hover:translate-x-1 transition-transform">→</span>
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={loading}
            className={`
              group flex items-center gap-2 px-8 py-3 rounded-xl font-semibold
              transition-all duration-200
              ${loading
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white shadow-lg shadow-green-500/25 hover:shadow-green-500/40'
              }
            `}
          >
            {loading ? (
              <>
                <span className="animate-spin">⏳</span>
                Creating...
              </>
            ) : (
              <>
                Create League
                <span className="group-hover:scale-110 transition-transform">✓</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default CreateLeague;