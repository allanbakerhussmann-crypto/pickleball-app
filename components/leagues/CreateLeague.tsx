/**
 * CreateLeague Component - 7-Step Wizard V06.00
 *
 * UPDATED V06.00:
 * - Replaced FORMATS constant with FormatCards component
 * - Now uses unified CompetitionFormat from types/formats
 * - Shows all 10 formats with dark theme styling
 * - Filters formats by play type (singles/doubles/mixed)
 *
 * UPDATED V05.50:
 * - Added payment mode selector (Free/External/Stripe) in Step 6
 *
 * UPDATED V05.44:
 * - Added Score Verification Settings in Step 5
 * - Uses VerificationSettingsForm component
 *
 * FILE LOCATION: components/leagues/CreateLeague.tsx
 * VERSION: V06.00
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
} from '../../types';
import { DEFAULT_SCORE_VERIFICATION, mapLegacyType, mapFormatToLegacy } from '../../types';
import type { CompetitionFormat } from '../../types/formats';
import { getFormatOption } from '../../types/formats';
import { VerificationSettingsForm } from './verification';
import { FormatCards } from '../shared/FormatSelector';

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

const STEPS = ['Basics', 'Schedule', 'Divisions', 'Partners', 'Scoring', 'Payment', 'Review'];

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

const formatTimeDisplay = (time: string): string => {
  const [hours, mins] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${mins.toString().padStart(2, '0')} ${period}`;
};

// ============================================
// COMPONENT
// ============================================

export const CreateLeague: React.FC<CreateLeagueProps> = ({ onBack, onCreated }) => {
  const { currentUser, userProfile } = useAuth();
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
  });
  
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
    pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0, pointsForForfeit: -1, pointsForNoShow: -2 
  });
  const [matchFmt, setMatchFmt] = useState<LeagueMatchFormat>({ bestOf: 3, gamesTo: 11, winBy: 2 });
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
  const [tiebreakers] = useState<LeagueTiebreaker[]>(['head_to_head', 'game_diff', 'games_won']);
  
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
  const fmtCur = (c: number) => `$${(c / 100).toFixed(2)}`;
  const parseCur = (v: string) => Math.round((parseFloat(v.replace(/[^0-9.]/g, '')) || 0) * 100);
  
  // ============================================
  // VALIDATION
  // ============================================

  const validate = (s: number): string | null => {
    if (s === 1 && !basic.name.trim()) return 'Name required';
    if (s === 2 && !scheduleConfig.startDate) return 'Start date required';
    if (s === 2 && scheduleConfig.matchDays.length === 0) return 'Select at least one match day';
    if (s === 2 && scheduleConfig.numberOfWeeks < 1) return 'Must be at least 1 week';
    if (s === 2 && venueEnabled && !venue.venueName.trim()) return 'Venue name required';
    if (s === 3 && hasDivs && divs.length === 0) return 'Add at least one division';
    if (s === 6 && paymentMode !== 'free' && price.entryFee < 100) return 'Minimum $1.00';
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
      };
      
      if (basic.format === 'ladder') settings.challengeRules = challenge;
      else if (basic.format === 'round_robin') settings.roundRobinSettings = rr;
      else if (basic.format === 'swiss') settings.swissSettings = swiss;
      else if (basic.format === 'box_league') settings.boxSettings = box;
      if (isDoubles) settings.partnerSettings = partner;

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
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white">Basic Info</h2>
            
            <div>
              <label className="block text-sm text-gray-400 mb-1">League Name *</label>
              <input type="text" value={basic.name} onChange={e => setBasic({ ...basic, name: e.target.value })} 
                className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg" 
                placeholder="e.g., Tuesday Night Ladder League"/>
            </div>
            
            <div>
              <label className="block text-sm text-gray-400 mb-1">Description</label>
              <textarea value={basic.description} onChange={e => setBasic({ ...basic, description: e.target.value })} 
                className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg min-h-[80px]" 
                placeholder="Optional description..."/>
            </div>
            
            <div>
              <label className="block text-sm text-gray-400 mb-2">Type *</label>
              <div className="grid grid-cols-3 gap-2">
                {TYPES.map(t => (
                  <label key={t.value} className={`flex flex-col items-center p-3 rounded-lg border cursor-pointer transition-colors ${basic.type === t.value ? 'bg-blue-900/30 border-blue-500' : 'bg-gray-900 border-gray-700 hover:border-gray-600'}`}>
                    <input type="radio" checked={basic.type === t.value} onChange={() => setBasic({ ...basic, type: t.value })} className="sr-only"/>
                    <span className="text-white font-semibold">{t.label}</span>
                    <span className="text-xs text-gray-500">{t.desc}</span>
                  </label>
                ))}
              </div>
            </div>
            
            <div>
              <label className="block text-sm text-gray-400 mb-2">Format *</label>
              <FormatCards
                value={selectedFormat}
                onChange={setSelectedFormat}
                playType={mapLegacyType(basic.type)}
                theme="dark"
              />
            </div>
            
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
          <div className="space-y-5">
            <h2 className="text-xl font-bold text-white">Schedule & Venue</h2>
            
            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <h3 className="font-semibold text-white mb-3">📅 League Duration</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Number of Weeks *</label>
                  <div className="flex items-center gap-2">
                    <input type="number" value={scheduleConfig.numberOfWeeks} 
                      onChange={e => setScheduleConfig({ ...scheduleConfig, numberOfWeeks: parseInt(e.target.value) || 1 })} 
                      className="w-24 bg-gray-900 border border-gray-700 text-white p-2.5 rounded-lg text-center" min={1} max={52}/>
                    <span className="text-gray-400">weeks</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">First Match Night *</label>
                  <input type="date" value={scheduleConfig.startDate} 
                    onChange={e => setScheduleConfig({ ...scheduleConfig, startDate: e.target.value })} 
                    className="w-full bg-gray-900 border border-gray-700 text-white p-2.5 rounded-lg"/>
                </div>
              </div>
            </div>

            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <h3 className="font-semibold text-white mb-3">🔄 Match Day(s)</h3>
              <p className="text-sm text-gray-400 mb-3">Select which day(s) matches will be played each week</p>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map(day => (
                  <button key={day.value} type="button" onClick={() => toggleMatchDay(day.value)}
                    className={`px-4 py-2 rounded-lg border font-medium transition-colors ${scheduleConfig.matchDays.includes(day.value) ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'}`}>
                    {day.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <h3 className="font-semibold text-white mb-3">🕐 Match Times</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Start Time</label>
                  <input type="time" value={scheduleConfig.matchStartTime} 
                    onChange={e => setScheduleConfig({ ...scheduleConfig, matchStartTime: e.target.value })} 
                    className="w-full bg-gray-900 border border-gray-700 text-white p-2.5 rounded-lg"/>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">End Time</label>
                  <input type="time" value={scheduleConfig.matchEndTime} 
                    onChange={e => setScheduleConfig({ ...scheduleConfig, matchEndTime: e.target.value })} 
                    className="w-full bg-gray-900 border border-gray-700 text-white p-2.5 rounded-lg"/>
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

            <label className="flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-700 cursor-pointer">
              <div><div className="font-semibold text-white">🏟️ Venue-Based Scheduling</div><div className="text-sm text-gray-400">Assign courts to matches at a specific venue</div></div>
              <button type="button" onClick={() => setVenueEnabled(!venueEnabled)} className={`w-12 h-6 rounded-full transition-colors ${venueEnabled ? 'bg-blue-600' : 'bg-gray-600'}`}>
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${venueEnabled ? 'translate-x-6' : 'translate-x-1'}`}/>
              </button>
            </label>

            {venueEnabled && (
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

                <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                  <h3 className="font-semibold text-white mb-3">⏱️ Match Timing</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Match Duration (min)</label>
                      <input type="number" value={venue.matchDurationMinutes} onChange={e => setVenue({ ...venue, matchDurationMinutes: parseInt(e.target.value) || 20 })} 
                        className="w-full bg-gray-900 border border-gray-700 text-white p-2.5 rounded-lg" min={10} max={60}/>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Buffer Between (min)</label>
                      <input type="number" value={venue.bufferMinutes} onChange={e => setVenue({ ...venue, bufferMinutes: parseInt(e.target.value) || 5 })} 
                        className="w-full bg-gray-900 border border-gray-700 text-white p-2.5 rounded-lg" min={0} max={30}/>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!venueEnabled && (
              <div className="bg-gray-700/30 p-4 rounded-lg border border-gray-600">
                <p className="text-gray-400 text-sm"><strong className="text-white">Self-Scheduled Mode:</strong> Players arrange their own match times and venues.</p>
              </div>
            )}
          </div>
        );

      // ==================== STEP 3: DIVISIONS ====================
      case 3:
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white">Divisions</h2>
            
            <label className="flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-700 cursor-pointer">
              <div><div className="font-semibold text-white">Multiple Divisions</div><div className="text-sm text-gray-400">e.g., A/B grades, age groups</div></div>
              <button type="button" onClick={() => setHasDivs(!hasDivs)} className={`w-12 h-6 rounded-full ${hasDivs ? 'bg-blue-600' : 'bg-gray-600'}`}>
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${hasDivs ? 'translate-x-6' : 'translate-x-1'}`}/>
              </button>
            </label>
            
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
        if (!isDoubles) return <div className="text-center py-8 text-gray-400">Partner settings for doubles only</div>;
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white">Partner Settings</h2>
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
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white">Scoring & Rules</h2>
            
            {/* Points System */}
            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <h3 className="font-semibold text-white mb-2">🏆 Points System</h3>
              <div className="grid grid-cols-5 gap-2">
                {[{ k: 'pointsForWin', l: 'Win' }, { k: 'pointsForDraw', l: 'Draw' }, { k: 'pointsForLoss', l: 'Loss' }, { k: 'pointsForForfeit', l: 'Forfeit' }, { k: 'pointsForNoShow', l: 'No-Show' }].map(p => (
                  <div key={p.k}><label className="block text-xs text-gray-500">{p.l}</label><input type="number" value={(scoring as any)[p.k]} onChange={e => setScoring({ ...scoring, [p.k]: parseInt(e.target.value) || 0 })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600 text-center"/></div>
                ))}
              </div>
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
              />
            </div>

            {/* Match Deadline */}
            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <h3 className="font-semibold text-white mb-2">⏰ Match Deadline</h3>
              <div className="flex items-center gap-2">
                <input type="number" value={scoreRep.matchDeadlineDays} onChange={e => setScoreRep({ ...scoreRep, matchDeadlineDays: parseInt(e.target.value) || 7 })} className="w-20 bg-gray-900 text-white p-2 rounded border border-gray-600 text-center" min={1} max={30}/>
                <span className="text-gray-400">days to complete each round</span>
              </div>
            </div>

            {/* ==================== DUPR INTEGRATION (NEW V05.36) ==================== */}
            <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 p-4 rounded-lg border border-purple-600/50">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                <span className="text-2xl">📊</span> DUPR Integration
              </h3>
              <p className="text-sm text-gray-400 mb-4">
                Connect your league to DUPR for official rating tracking
              </p>
              
              {/* DUPR Mode Selection */}
              <div className="space-y-2 mb-4">
                {DUPR_MODE_OPTIONS.map(opt => (
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
                  {/* Auto Submit Toggle */}
                  <label className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg cursor-pointer">
                    <div>
                      <div className="text-white font-medium text-sm">Auto-Submit to DUPR</div>
                      <div className="text-xs text-gray-500">Automatically submit eligible matches</div>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={duprSettings.autoSubmit} 
                      onChange={e => setDuprSettings({ ...duprSettings, autoSubmit: e.target.checked })} 
                      className="w-5 h-5 accent-purple-500"
                    />
                  </label>

                  {/* Submit Trigger (only if auto-submit enabled) */}
                  {duprSettings.autoSubmit && (
                    <div className="p-3 bg-gray-900/50 rounded-lg">
                      <label className="block text-xs text-gray-500 mb-1">When to Submit</label>
                      <select 
                        value={duprSettings.submitTrigger} 
                        onChange={e => setDuprSettings({ ...duprSettings, submitTrigger: e.target.value as 'on_confirmation' | 'on_completion' | 'manual' })} 
                        className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600"
                      >
                        <option value="on_confirmation">When opponent confirms score</option>
                        <option value="on_completion">When match marked complete</option>
                        <option value="manual">Manual only (organizer submits)</option>
                      </select>
                    </div>
                  )}

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

                  {/* Info Box */}
                  <div className="p-3 bg-blue-900/20 rounded-lg border border-blue-800/50">
                    <p className="text-xs text-blue-300">
                      <strong>ℹ️ Note:</strong> DUPR submission requires all players to have linked DUPR accounts. 
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

            {basic.format === 'round_robin' && (
              <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                <h3 className="font-semibold text-white mb-2">🔄 Round Robin</h3>
                <div><label className="block text-xs text-gray-500">Rounds (play everyone X times)</label><input type="number" value={rr.rounds} onChange={e => setRr({ ...rr, rounds: parseInt(e.target.value) || 1 })} className="w-24 bg-gray-900 text-white p-2 rounded border border-gray-600" min={1} max={4}/></div>
              </div>
            )}

            {basic.format === 'swiss' && (
              <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                <h3 className="font-semibold text-white mb-2">🎯 Swiss System</h3>
                <div><label className="block text-xs text-gray-500">Number of Rounds</label><input type="number" value={swiss.rounds} onChange={e => setSwiss({ ...swiss, rounds: parseInt(e.target.value) || 4 })} className="w-24 bg-gray-900 text-white p-2 rounded border border-gray-600" min={2} max={10}/></div>
              </div>
            )}

            {basic.format === 'box_league' && (
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
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white">Payment</h2>
            
            {/* Payment Mode Selection */}
            <div className="space-y-3">
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
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs text-gray-500 mb-1">Entry Fee *</label><input type="text" value={fmtCur(price.entryFee)} onChange={e => setPrice({ ...price, entryFee: parseCur(e.target.value) })} className="w-full bg-gray-900 text-white p-2.5 rounded border border-gray-600"/></div>
                    <div><label className="block text-xs text-gray-500 mb-1">Fee Type</label><select value={price.entryFeeType} onChange={e => setPrice({ ...price, entryFeeType: e.target.value as 'per_player' | 'per_team' })} className="w-full bg-gray-900 text-white p-2.5 rounded border border-gray-600"><option value="per_player">Per Player</option><option value="per_team">Per Team</option></select></div>
                  </div>
                </div>
                {paymentMode === 'stripe' && (
                  <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                    <label className="block text-xs text-gray-500 mb-1">Refund Policy</label>
                    <div className="flex gap-2">
                      {(['full', 'partial', 'none'] as const).map(p => (
                        <label key={p} className={`flex-1 text-center py-2 rounded cursor-pointer border ${price.refundPolicy === p ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400'}`}>
                          <input type="radio" checked={price.refundPolicy === p} onChange={() => setPrice({ ...price, refundPolicy: p })} className="sr-only"/>
                          {p === 'full' ? 'Full Refund' : p === 'partial' ? '50% Refund' : 'No Refunds'}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );

      // ==================== STEP 7: REVIEW ====================
      case 7:
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white">Review & Create</h2>
            
            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <h3 className="font-semibold text-white mb-2">📋 Basic Info</h3>
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
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="text-gray-400 hover:text-white">← Back</button>
        <h1 className="text-2xl font-bold text-white">Create League</h1>
      </div>
      
      {/* Step Indicator */}
      <div className="flex items-center justify-center mb-6 overflow-x-auto">
        {STEPS.map((t, i) => { 
          const n = i + 1; const active = step === n; const done = step > n;
          const skip = n === 4 && !isDoubles; 
          return (
            <React.Fragment key={n}>
              <div className="flex flex-col items-center min-w-[40px]">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${skip ? 'bg-gray-700 text-gray-500' : active ? 'bg-blue-600 text-white' : done ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400'}`}>{done ? '✓' : n}</div>
                <span className={`text-xs mt-1 hidden md:block ${active ? 'text-blue-400' : 'text-gray-500'}`}>{t}</span>
              </div>
              {n < 7 && <div className={`w-4 md:w-6 h-0.5 ${step > n ? 'bg-green-600' : 'bg-gray-700'}`}/>}
            </React.Fragment>
          ); 
        })}
      </div>
      
      {error && <div className="bg-red-900/20 border border-red-600 rounded-lg p-3 mb-4 text-red-400">{error}</div>}
      
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 mb-4">
        {renderStepContent()}
      </div>
      
      <div className="flex justify-between">
        <button onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1} className="px-6 py-2 text-gray-400 hover:text-white disabled:opacity-30">← Prev</button>
        
        {step < 7 ? (
          <button onClick={() => { const e = validate(step); if (e) setError(e); else { setError(null); setStep(step === 3 && !isDoubles ? 5 : step + 1); } }} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-semibold">Next →</button>
        ) : (
          <button onClick={submit} disabled={loading} className="bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white px-8 py-2 rounded-lg font-semibold">{loading ? '⏳ Creating...' : '✓ Create League'}</button>
        )}
      </div>
    </div>
  );
};

export default CreateLeague;