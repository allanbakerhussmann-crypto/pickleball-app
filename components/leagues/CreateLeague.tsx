/**
 * CreateLeague Component - 7-Step Wizard V05.34
 * 
 * NEW: Venue & Court Settings in Step 2 (Schedule & Venue)
 * FIXED: prizePool type, removed unused variables
 * 
 * FILE: src/components/leagues/CreateLeague.tsx
 */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { createLeague, getClubsForUser, createLeagueDivision } from '../../services/firebase';
import type { 
  LeagueType, LeagueFormat, LeagueSettings, LeaguePartnerSettings, 
  LeaguePricing, LeagueMatchFormat, LeagueChallengeRules, 
  LeagueRoundRobinSettings, LeagueSwissSettings, LeagueBoxSettings, 
  LeagueTiebreaker, Club, GenderCategory, EventType, LeaguePrizePool
} from '../../types';

// ============================================
// LOCAL TYPES (will be added to types.ts)
// ============================================

type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
type ScoreEntryPermission = 'either_participant' | 'winner_only' | 'organizer_only';
type ScoreConfirmation = 'always_required' | 'auto_confirm_24h' | 'auto_confirm_48h' | 'auto_confirm_72h' | 'no_confirmation';
type ScoreDetailLevel = 'win_loss_only' | 'games_only' | 'full_scores';
type DisputeResolution = 'organizer_decides' | 'match_replayed' | 'both_lose';

interface LeagueCourt { id: string; name: string; order: number; active: boolean; }
interface LeagueTimeSlot { id: string; dayOfWeek: DayOfWeek; startTime: string; endTime: string; label?: string; }
interface LeagueVenueSettings {
  venueName: string;
  venueAddress?: string;
  courts: LeagueCourt[];
  timeSlots: LeagueTimeSlot[];
  matchDurationMinutes: number;
  bufferMinutes: number;
  schedulingMode: 'venue_based' | 'self_scheduled';
  autoAssignCourts: boolean;
  balanceCourtUsage: boolean;
}

interface ScoreEntrySettings { 
  entryPermission: ScoreEntryPermission; 
  confirmationRequired: ScoreConfirmation; 
  detailLevel: ScoreDetailLevel; 
  disputeResolution: DisputeResolution; 
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
const DAYS: { v: DayOfWeek; l: string; s: string }[] = [
  { v: 'monday', l: 'Monday', s: 'Mon' },
  { v: 'tuesday', l: 'Tuesday', s: 'Tue' },
  { v: 'wednesday', l: 'Wednesday', s: 'Wed' },
  { v: 'thursday', l: 'Thursday', s: 'Thu' },
  { v: 'friday', l: 'Friday', s: 'Fri' },
  { v: 'saturday', l: 'Saturday', s: 'Sat' },
  { v: 'sunday', l: 'Sunday', s: 'Sun' },
];
const TYPES: { value: LeagueType; label: string; desc: string }[] = [
  { value: 'singles', label: 'Singles', desc: '1v1' },
  { value: 'doubles', label: 'Doubles', desc: '2v2' },
  { value: 'mixed_doubles', label: 'Mixed', desc: 'M+F' },
];
const FORMATS: { value: LeagueFormat; label: string; desc: string }[] = [
  { value: 'ladder', label: '🪜 Ladder', desc: 'Challenge up' },
  { value: 'round_robin', label: '🔄 Round Robin', desc: 'Play everyone' },
  { value: 'swiss', label: '🎯 Swiss', desc: 'Similar skill' },
  { value: 'box_league', label: '📦 Box League', desc: 'Small groups' },
];
const ENTRY_OPTS: { v: ScoreEntryPermission; l: string; d: string }[] = [
  { v: 'either_participant', l: 'Either Player', d: 'Any participant can enter' },
  { v: 'winner_only', l: 'Winner Only', d: 'Only winner enters score' },
  { v: 'organizer_only', l: 'Organizer Only', d: 'Organizer enters all scores' },
];
const CONFIRM_OPTS: { v: ScoreConfirmation; l: string; d: string }[] = [
  { v: 'always_required', l: 'Always Required', d: 'Opponent must confirm' },
  { v: 'auto_confirm_24h', l: 'Auto 24h', d: 'Auto-confirm after 24h' },
  { v: 'auto_confirm_48h', l: 'Auto 48h', d: 'Auto-confirm after 48h' },
  { v: 'auto_confirm_72h', l: 'Auto 72h', d: 'Auto-confirm after 72h' },
  { v: 'no_confirmation', l: 'No Confirmation', d: 'Trust first entry' },
];
const DETAIL_OPTS: { v: ScoreDetailLevel; l: string; d: string }[] = [
  { v: 'full_scores', l: 'Full Scores', d: 'Game-by-game (11-7, 11-9)' },
  { v: 'games_only', l: 'Games Only', d: 'Just games won (2-1)' },
  { v: 'win_loss_only', l: 'Win/Loss Only', d: 'Just who won' },
];
const DISPUTE_OPTS: { v: DisputeResolution; l: string; d: string }[] = [
  { v: 'organizer_decides', l: 'Organizer Decides', d: 'Review & decide' },
  { v: 'match_replayed', l: 'Replay Match', d: 'Must play again' },
  { v: 'both_lose', l: 'Both Lose', d: 'Both get a loss' },
];

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
    name: '', description: '', type: 'singles' as LeagueType, format: 'ladder' as LeagueFormat, 
    clubId: '', location: '', visibility: 'public' as 'public' | 'private' | 'club_only' 
  });
  
  // Step 2: Schedule & Venue
  const [sched, setSched] = useState({ 
    seasonStart: '', seasonEnd: '', registrationOpens: '', registrationDeadline: '' 
  });
  const [venueEnabled, setVenueEnabled] = useState(false);
  const [venue, setVenue] = useState<LeagueVenueSettings>({
    venueName: '',
    venueAddress: '',
    courts: [{ id: 'court_1', name: 'Court 1', order: 1, active: true }],
    timeSlots: [],
    matchDurationMinutes: 20,
    bufferMinutes: 5,
    schedulingMode: 'venue_based',
    autoAssignCourts: true,
    balanceCourtUsage: true,
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
  const [scoreEntry, setScoreEntry] = useState<ScoreEntrySettings>({
    entryPermission: 'either_participant',
    confirmationRequired: 'auto_confirm_48h',
    detailLevel: 'full_scores',
    disputeResolution: 'organizer_decides',
  });
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
  
  // Step 6: Payment
  const [pricingOn, setPricingOn] = useState(false);
  const [price, setPrice] = useState({ 
    entryFee: 1500, 
    entryFeeType: 'per_player' as 'per_player' | 'per_team', 
    memberDiscount: 0, 
    earlyBirdEnabled: false, 
    earlyBirdFee: 1000, 
    lateFeeEnabled: false, 
    lateFee: 2000, 
    prizePool: { 
      enabled: false, 
      type: 'none' as 'none' | 'fixed' | 'percentage', 
      amount: 0, 
      distribution: { first: 60, second: 30, third: 10, fourth: 0 } 
    } as LeaguePrizePool,
    feesPaidBy: 'player' as 'player' | 'organizer', 
    refundPolicy: 'partial' as 'full' | 'partial' | 'none' 
  });

  // Load clubs
  useEffect(() => { 
    if (currentUser) getClubsForUser(currentUser.uid).then(setClubs); 
  }, [currentUser]);
  
  // Sync division type
  useEffect(() => { 
    setSingleDiv(d => ({ ...d, type: basic.type === 'mixed_doubles' ? 'doubles' : basic.type as EventType })); 
  }, [basic.type]);

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
    if (s === 2 && (!sched.seasonStart || !sched.seasonEnd)) return 'Dates required';
    if (s === 2 && new Date(sched.seasonEnd) <= new Date(sched.seasonStart)) return 'End must be after start';
    if (s === 2 && venueEnabled && !venue.venueName.trim()) return 'Venue name required';
    if (s === 2 && venueEnabled && venue.courts.length === 0) return 'Add at least one court';
    if (s === 3 && hasDivs && divs.length === 0) return 'Add at least one division';
    if (s === 6 && pricingOn && price.entryFee < 100) return 'Minimum $1.00';
    return null;
  };

  // ============================================
  // VENUE HELPERS
  // ============================================

  const addCourt = () => {
    const num = venue.courts.length + 1;
    setVenue({
      ...venue,
      courts: [...venue.courts, { id: `court_${Date.now()}`, name: `Court ${num}`, order: num, active: true }]
    });
  };

  const updateCourt = (id: string, updates: Partial<LeagueCourt>) => {
    setVenue({
      ...venue,
      courts: venue.courts.map(c => c.id === id ? { ...c, ...updates } : c)
    });
  };

  const removeCourt = (id: string) => {
    if (venue.courts.length <= 1) return;
    setVenue({ ...venue, courts: venue.courts.filter(c => c.id !== id) });
  };

  const addTimeSlot = () => {
    setVenue({
      ...venue,
      timeSlots: [...venue.timeSlots, { 
        id: `slot_${Date.now()}`, 
        dayOfWeek: 'tuesday', 
        startTime: '18:00', 
        endTime: '21:00' 
      }]
    });
  };

  const updateTimeSlot = (id: string, updates: Partial<LeagueTimeSlot>) => {
    setVenue({
      ...venue,
      timeSlots: venue.timeSlots.map(s => s.id === id ? { ...s, ...updates } : s)
    });
  };

  const removeTimeSlot = (id: string) => {
    setVenue({ ...venue, timeSlots: venue.timeSlots.filter(s => s.id !== id) });
  };

  // ============================================
  // DIVISION HELPERS
  // ============================================

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
    for (let i = 1; i <= 6; i++) { 
      const e = validate(i); 
      if (e) { setError(e); setStep(i); return; } 
    }
    setError(null); 
    setLoading(true);
    
    try {
      const settings: LeagueSettings = {
        minRating: hasDivs ? null : singleDiv.minRating, 
        maxRating: hasDivs ? null : singleDiv.maxRating,
        minAge: hasDivs ? null : singleDiv.minAge, 
        maxAge: hasDivs ? null : singleDiv.maxAge,
        maxMembers: hasDivs ? null : singleDiv.maxParticipants,
        pointsForWin: scoring.pointsForWin, 
        pointsForDraw: scoring.pointsForDraw, 
        pointsForLoss: scoring.pointsForLoss,
        pointsForForfeit: scoring.pointsForForfeit, 
        pointsForNoShow: scoring.pointsForNoShow,
        matchFormat: matchFmt, 
        matchDeadlineDays: scoreRep.matchDeadlineDays,
        allowSelfReporting: scoreEntry.entryPermission !== 'organizer_only',
        requireConfirmation: scoreEntry.confirmationRequired !== 'no_confirmation',
        tiebreakers,
        // Venue settings (NEW V05.34)
        venueSettings: venueEnabled ? venue : null,
      };
      
      if (basic.format === 'ladder') settings.challengeRules = challenge;
      else if (basic.format === 'round_robin') settings.roundRobinSettings = rr;
      else if (basic.format === 'swiss') settings.swissSettings = swiss;
      else if (basic.format === 'box_league') settings.boxSettings = box;
      if (isDoubles) settings.partnerSettings = partner;

      const pricing: LeaguePricing | null = pricingOn ? {
        enabled: true, 
        entryFee: price.entryFee, 
        entryFeeType: price.entryFeeType, 
        memberDiscount: price.memberDiscount,
        earlyBirdEnabled: price.earlyBirdEnabled, 
        earlyBirdFee: price.earlyBirdFee,
        earlyBirdDeadline: price.earlyBirdEnabled && sched.registrationDeadline 
          ? new Date(sched.registrationDeadline).getTime() - 604800000 : null,
        lateFeeEnabled: price.lateFeeEnabled, 
        lateFee: price.lateFee,
        lateRegistrationStart: price.lateFeeEnabled && sched.registrationDeadline 
          ? new Date(sched.registrationDeadline).getTime() - 259200000 : null,
        prizePool: price.prizePool, 
        feesPaidBy: price.feesPaidBy, 
        refundPolicy: price.refundPolicy,
        refundDeadline: sched.seasonStart ? new Date(sched.seasonStart).getTime() : null, 
        currency: 'nzd',
      } : null;

      const stripeId = basic.clubId && clubStripe 
        ? club?.stripeConnectedAccountId 
        : hasStripe ? userProfile.stripeConnectedAccountId : null;

      const leagueId = await createLeague({
        name: basic.name.trim(), 
        description: basic.description.trim(), 
        type: basic.type, 
        format: basic.format,
        clubId: basic.clubId || null, 
        clubName: club?.name || null, 
        createdByUserId: currentUser.uid,
        organizerName: userProfile.displayName || userProfile.email,
        seasonStart: new Date(sched.seasonStart).getTime(), 
        seasonEnd: new Date(sched.seasonEnd).getTime(),
        registrationOpens: sched.registrationOpens ? new Date(sched.registrationOpens).getTime() : null,
        registrationDeadline: sched.registrationDeadline ? new Date(sched.registrationDeadline).getTime() : null,
        pricing, 
        organizerStripeAccountId: stripeId, 
        status: 'draft', 
        settings,
        location: basic.location || null, 
        venue: venueEnabled ? venue.venueName : null, 
        visibility: basic.visibility,
        hasDivisions: hasDivs,
      });

      if (hasDivs) {
        for (let i = 0; i < divs.length; i++) {
          const d = divs[i];
          await createLeagueDivision(leagueId, { 
            name: d.name, type: d.type, gender: d.gender, 
            minRating: d.minRating, maxRating: d.maxRating, 
            minAge: d.minAge, maxAge: d.maxAge, 
            maxParticipants: d.maxParticipants, 
            registrationOpen: true, order: i 
          });
        }
      }
      
      onCreated(leagueId);
    } catch (e: any) { 
      console.error('Create league error:', e);
      setError(e.message || 'Failed to create league'); 
    } finally { 
      setLoading(false); 
    }
  };

  // ============================================
  // STEP RENDERERS
  // ============================================

  // STEP 1: Basic Info
  const Step1 = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Basic Info</h2>
      
      <div>
        <label className="block text-sm text-gray-400 mb-1">League Name *</label>
        <input 
          type="text" 
          value={basic.name} 
          onChange={e => setBasic({ ...basic, name: e.target.value })} 
          className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg" 
          placeholder="e.g., Summer Ladder League 2025"
        />
      </div>
      
      <div>
        <label className="block text-sm text-gray-400 mb-1">Description</label>
        <textarea 
          value={basic.description} 
          onChange={e => setBasic({ ...basic, description: e.target.value })} 
          className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg min-h-[80px]" 
          placeholder="Optional description..."
        />
      </div>
      
      <div>
        <label className="block text-sm text-gray-400 mb-2">Type *</label>
        <div className="grid grid-cols-3 gap-2">
          {TYPES.map(t => (
            <label 
              key={t.value} 
              className={`flex flex-col items-center p-3 rounded-lg border cursor-pointer transition-colors ${
                basic.type === t.value ? 'bg-blue-900/30 border-blue-500' : 'bg-gray-900 border-gray-700 hover:border-gray-600'
              }`}
            >
              <input 
                type="radio" 
                checked={basic.type === t.value} 
                onChange={() => setBasic({ ...basic, type: t.value })} 
                className="sr-only"
              />
              <span className="text-white font-semibold">{t.label}</span>
              <span className="text-xs text-gray-500">{t.desc}</span>
            </label>
          ))}
        </div>
      </div>
      
      <div>
        <label className="block text-sm text-gray-400 mb-2">Format *</label>
        <div className="grid grid-cols-2 gap-2">
          {FORMATS.map(f => (
            <label 
              key={f.value} 
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                basic.format === f.value ? 'bg-blue-900/30 border-blue-500' : 'bg-gray-900 border-gray-700 hover:border-gray-600'
              }`}
            >
              <input 
                type="radio" 
                checked={basic.format === f.value} 
                onChange={() => setBasic({ ...basic, format: f.value })} 
                className="sr-only"
              />
              <div>
                <div className="text-white font-medium">{f.label}</div>
                <div className="text-xs text-gray-500">{f.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>
      
      {clubs.length > 0 && (
        <div>
          <label className="block text-sm text-gray-400 mb-1">Link to Club (optional)</label>
          <select 
            value={basic.clubId} 
            onChange={e => setBasic({ ...basic, clubId: e.target.value })} 
            className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg"
          >
            <option value="">No club</option>
            {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
      
      <div>
        <label className="block text-sm text-gray-400 mb-1">Location / Region</label>
        <input 
          type="text" 
          value={basic.location} 
          onChange={e => setBasic({ ...basic, location: e.target.value })} 
          className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg" 
          placeholder="e.g., Auckland, NZ"
        />
      </div>
    </div>
  );

  // STEP 2: Schedule & Venue (UPDATED V05.34)
  const Step2 = () => (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-white">Schedule & Venue</h2>
      
      {/* Season Dates */}
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h3 className="font-semibold text-white mb-3">📅 Season Dates</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Start Date *</label>
            <input 
              type="date" 
              value={sched.seasonStart} 
              onChange={e => setSched({ ...sched, seasonStart: e.target.value })} 
              className="w-full bg-gray-900 border border-gray-700 text-white p-2.5 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">End Date *</label>
            <input 
              type="date" 
              value={sched.seasonEnd} 
              onChange={e => setSched({ ...sched, seasonEnd: e.target.value })} 
              className="w-full bg-gray-900 border border-gray-700 text-white p-2.5 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Registration Opens</label>
            <input 
              type="date" 
              value={sched.registrationOpens} 
              onChange={e => setSched({ ...sched, registrationOpens: e.target.value })} 
              className="w-full bg-gray-900 border border-gray-700 text-white p-2.5 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Registration Deadline</label>
            <input 
              type="date" 
              value={sched.registrationDeadline} 
              onChange={e => setSched({ ...sched, registrationDeadline: e.target.value })} 
              className="w-full bg-gray-900 border border-gray-700 text-white p-2.5 rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Venue Toggle */}
      <label className="flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-700 cursor-pointer">
        <div>
          <div className="font-semibold text-white">🏟️ Venue-Based Scheduling</div>
          <div className="text-sm text-gray-400">Assign courts & time slots to matches</div>
        </div>
        <button 
          type="button"
          onClick={() => setVenueEnabled(!venueEnabled)} 
          className={`w-12 h-6 rounded-full transition-colors ${venueEnabled ? 'bg-blue-600' : 'bg-gray-600'}`}
        >
          <div className={`w-5 h-5 bg-white rounded-full transition-transform ${venueEnabled ? 'translate-x-6' : 'translate-x-1'}`}/>
        </button>
      </label>

      {/* Venue Settings */}
      {venueEnabled && (
        <div className="space-y-4">
          {/* Venue Info */}
          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <h3 className="font-semibold text-white mb-3">📍 Venue Details</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Venue Name *</label>
                <input 
                  type="text" 
                  value={venue.venueName} 
                  onChange={e => setVenue({ ...venue, venueName: e.target.value })} 
                  className="w-full bg-gray-900 border border-gray-700 text-white p-2.5 rounded-lg" 
                  placeholder="e.g., Auckland Pickleball Centre"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Address</label>
                <input 
                  type="text" 
                  value={venue.venueAddress || ''} 
                  onChange={e => setVenue({ ...venue, venueAddress: e.target.value })} 
                  className="w-full bg-gray-900 border border-gray-700 text-white p-2.5 rounded-lg" 
                  placeholder="123 Main St, Auckland"
                />
              </div>
            </div>
          </div>

          {/* Courts */}
          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-white">🎾 Courts ({venue.courts.length})</h3>
              <button 
                type="button"
                onClick={addCourt} 
                className="text-blue-400 hover:text-blue-300 text-sm font-medium"
              >
                + Add Court
              </button>
            </div>
            <div className="space-y-2">
              {venue.courts.map((court) => (
                <div key={court.id} className="flex items-center gap-2 bg-gray-900 p-2 rounded-lg">
                  <input 
                    type="text" 
                    value={court.name} 
                    onChange={e => updateCourt(court.id, { name: e.target.value })} 
                    className="flex-1 bg-gray-800 border border-gray-700 text-white px-3 py-1.5 rounded text-sm"
                    placeholder="Court name"
                  />
                  <label className="flex items-center gap-1.5 text-sm text-gray-400 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={court.active} 
                      onChange={e => updateCourt(court.id, { active: e.target.checked })} 
                      className="accent-green-500"
                    />
                    Active
                  </label>
                  {venue.courts.length > 1 && (
                    <button 
                      type="button"
                      onClick={() => removeCourt(court.id)} 
                      className="text-red-400 hover:text-red-300 p-1"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Time Slots */}
          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-white">🕐 Match Times</h3>
              <button 
                type="button"
                onClick={addTimeSlot} 
                className="text-blue-400 hover:text-blue-300 text-sm font-medium"
              >
                + Add Time Slot
              </button>
            </div>
            
            {venue.timeSlots.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-4">
                No time slots defined. Add slots for weekly league nights.
              </p>
            ) : (
              <div className="space-y-2">
                {venue.timeSlots.map(slot => (
                  <div key={slot.id} className="flex items-center gap-2 bg-gray-900 p-2 rounded-lg">
                    <select 
                      value={slot.dayOfWeek} 
                      onChange={e => updateTimeSlot(slot.id, { dayOfWeek: e.target.value as DayOfWeek })} 
                      className="bg-gray-800 border border-gray-700 text-white px-2 py-1.5 rounded text-sm"
                    >
                      {DAYS.map(d => <option key={d.v} value={d.v}>{d.s}</option>)}
                    </select>
                    <input 
                      type="time" 
                      value={slot.startTime} 
                      onChange={e => updateTimeSlot(slot.id, { startTime: e.target.value })} 
                      className="bg-gray-800 border border-gray-700 text-white px-2 py-1.5 rounded text-sm"
                    />
                    <span className="text-gray-500">→</span>
                    <input 
                      type="time" 
                      value={slot.endTime} 
                      onChange={e => updateTimeSlot(slot.id, { endTime: e.target.value })} 
                      className="bg-gray-800 border border-gray-700 text-white px-2 py-1.5 rounded text-sm"
                    />
                    <button 
                      type="button"
                      onClick={() => removeTimeSlot(slot.id)} 
                      className="text-red-400 hover:text-red-300 p-1"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Match Timing */}
          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <h3 className="font-semibold text-white mb-3">⏱️ Match Timing</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Match Duration (min)</label>
                <input 
                  type="number" 
                  value={venue.matchDurationMinutes} 
                  onChange={e => setVenue({ ...venue, matchDurationMinutes: parseInt(e.target.value) || 20 })} 
                  className="w-full bg-gray-900 border border-gray-700 text-white p-2.5 rounded-lg"
                  min={10} max={60}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Buffer Between (min)</label>
                <input 
                  type="number" 
                  value={venue.bufferMinutes} 
                  onChange={e => setVenue({ ...venue, bufferMinutes: parseInt(e.target.value) || 5 })} 
                  className="w-full bg-gray-900 border border-gray-700 text-white p-2.5 rounded-lg"
                  min={0} max={30}
                />
              </div>
            </div>
          </div>

          {/* Auto-Assignment Options */}
          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-3">
            <h3 className="font-semibold text-white mb-2">⚡ Court Assignment</h3>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-gray-300">Auto-assign courts when generating schedule</span>
              <input 
                type="checkbox" 
                checked={venue.autoAssignCourts} 
                onChange={e => setVenue({ ...venue, autoAssignCourts: e.target.checked })} 
                className="w-5 h-5 accent-blue-500"
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-gray-300">Balance court usage evenly</span>
              <input 
                type="checkbox" 
                checked={venue.balanceCourtUsage} 
                onChange={e => setVenue({ ...venue, balanceCourtUsage: e.target.checked })} 
                className="w-5 h-5 accent-blue-500"
              />
            </label>
          </div>
        </div>
      )}

      {!venueEnabled && (
        <div className="bg-gray-700/30 p-4 rounded-lg border border-gray-600">
          <p className="text-gray-400 text-sm">
            <strong className="text-white">Self-Scheduled Mode:</strong> Players will arrange their own match times and venues. 
            Good for ladder leagues where players have flexible schedules.
          </p>
        </div>
      )}
    </div>
  );

  // STEP 3: Divisions
  const Step3 = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Divisions</h2>
      
      <label className="flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-700 cursor-pointer">
        <div>
          <div className="font-semibold text-white">Multiple Divisions</div>
          <div className="text-sm text-gray-400">e.g., A/B grades, age groups</div>
        </div>
        <button 
          type="button"
          onClick={() => setHasDivs(!hasDivs)} 
          className={`w-12 h-6 rounded-full ${hasDivs ? 'bg-blue-600' : 'bg-gray-600'}`}
        >
          <div className={`w-5 h-5 bg-white rounded-full transition-transform ${hasDivs ? 'translate-x-6' : 'translate-x-1'}`}/>
        </button>
      </label>
      
      {!hasDivs ? (
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-3">
          <h3 className="font-semibold text-white">Entry Restrictions (Optional)</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500">Min Rating</label>
              <input 
                type="number" 
                step="0.1" 
                value={singleDiv.minRating || ''} 
                onChange={e => setSingleDiv({ ...singleDiv, minRating: e.target.value ? parseFloat(e.target.value) : null })} 
                className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600" 
                placeholder="Any"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500">Max Rating</label>
              <input 
                type="number" 
                step="0.1" 
                value={singleDiv.maxRating || ''} 
                onChange={e => setSingleDiv({ ...singleDiv, maxRating: e.target.value ? parseFloat(e.target.value) : null })} 
                className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600" 
                placeholder="Any"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500">Min Age</label>
              <input 
                type="number" 
                value={singleDiv.minAge || ''} 
                onChange={e => setSingleDiv({ ...singleDiv, minAge: e.target.value ? parseInt(e.target.value) : null })} 
                className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600" 
                placeholder="Any"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500">Max Players</label>
              <input 
                type="number" 
                value={singleDiv.maxParticipants || ''} 
                onChange={e => setSingleDiv({ ...singleDiv, maxParticipants: e.target.value ? parseInt(e.target.value) : null })} 
                className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600" 
                placeholder="Unlimited"
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {divs.map(d => (
            <div key={d.id} className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <input 
                  type="text" 
                  value={d.name} 
                  onChange={e => updDiv(d.id, { name: e.target.value })} 
                  className="bg-gray-900 text-white px-3 py-1.5 rounded border border-gray-600 font-semibold"
                />
                <button 
                  type="button"
                  onClick={() => delDiv(d.id)} 
                  className="text-red-400 hover:text-red-300 text-sm"
                >
                  Remove
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2 text-sm">
                <div>
                  <label className="block text-xs text-gray-500">Min Rating</label>
                  <input 
                    type="number" 
                    step="0.1" 
                    value={d.minRating || ''} 
                    onChange={e => updDiv(d.id, { minRating: e.target.value ? parseFloat(e.target.value) : null })} 
                    className="w-full bg-gray-900 text-white p-1.5 rounded border border-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Max Rating</label>
                  <input 
                    type="number" 
                    step="0.1" 
                    value={d.maxRating || ''} 
                    onChange={e => updDiv(d.id, { maxRating: e.target.value ? parseFloat(e.target.value) : null })} 
                    className="w-full bg-gray-900 text-white p-1.5 rounded border border-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Min Age</label>
                  <input 
                    type="number" 
                    value={d.minAge || ''} 
                    onChange={e => updDiv(d.id, { minAge: e.target.value ? parseInt(e.target.value) : null })} 
                    className="w-full bg-gray-900 text-white p-1.5 rounded border border-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Max</label>
                  <input 
                    type="number" 
                    value={d.maxParticipants || ''} 
                    onChange={e => updDiv(d.id, { maxParticipants: e.target.value ? parseInt(e.target.value) : null })} 
                    className="w-full bg-gray-900 text-white p-1.5 rounded border border-gray-600"
                  />
                </div>
              </div>
            </div>
          ))}
          <button 
            type="button"
            onClick={addDiv} 
            className="w-full py-3 border border-dashed border-gray-600 text-gray-400 rounded-lg hover:border-gray-500 hover:text-gray-300"
          >
            + Add Division
          </button>
        </div>
      )}
    </div>
  );

  // STEP 4: Partner Settings (Doubles only)
  const Step4 = () => (
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
              <span className="text-white text-sm">
                {r === 'registration_close' ? 'When registration closes' : 
                 r === 'season_start' ? 'When season starts' : 
                 r === 'anytime' ? 'Can change anytime' : 'After specific week'}
              </span>
              {r === 'specific_week' && partner.partnerLockRule === r && (
                <input type="number" min={1} max={20} value={partner.partnerLockWeek || 1} onChange={e => setPartner({ ...partner, partnerLockWeek: parseInt(e.target.value) })} className="w-14 bg-gray-700 text-white p-1 rounded text-center"/>
              )}
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

  // STEP 5: Scoring & Rules
  const Step5 = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Scoring & Rules</h2>
      
      {/* Points System */}
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h3 className="font-semibold text-white mb-2">🏆 Points System</h3>
        <div className="grid grid-cols-5 gap-2">
          {[
            { k: 'pointsForWin', l: 'Win' }, 
            { k: 'pointsForDraw', l: 'Draw' }, 
            { k: 'pointsForLoss', l: 'Loss' }, 
            { k: 'pointsForForfeit', l: 'Forfeit' }, 
            { k: 'pointsForNoShow', l: 'No-Show' }
          ].map(p => (
            <div key={p.k}>
              <label className="block text-xs text-gray-500">{p.l}</label>
              <input 
                type="number" 
                value={(scoring as any)[p.k]} 
                onChange={e => setScoring({ ...scoring, [p.k]: parseInt(e.target.value) || 0 })} 
                className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600 text-center"
              />
            </div>
          ))}
        </div>
      </div>
      
      {/* Match Format */}
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h3 className="font-semibold text-white mb-2">🎾 Match Format</h3>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-500">Best Of</label>
            <select 
              value={matchFmt.bestOf} 
              onChange={e => setMatchFmt({ ...matchFmt, bestOf: parseInt(e.target.value) as 1|3|5 })} 
              className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"
            >
              <option value={1}>1 game</option>
              <option value={3}>3 games</option>
              <option value={5}>5 games</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500">Points/Game</label>
            <select 
              value={matchFmt.gamesTo} 
              onChange={e => setMatchFmt({ ...matchFmt, gamesTo: parseInt(e.target.value) as 11|15|21 })} 
              className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"
            >
              <option value={11}>11</option>
              <option value={15}>15</option>
              <option value={21}>21</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500">Win By</label>
            <select 
              value={matchFmt.winBy} 
              onChange={e => setMatchFmt({ ...matchFmt, winBy: parseInt(e.target.value) as 1|2 })} 
              className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </div>
        </div>
      </div>

      {/* Score Entry Settings */}
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h3 className="font-semibold text-white mb-3">📝 Score Entry</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Who Can Enter Scores</label>
            <select 
              value={scoreEntry.entryPermission} 
              onChange={e => setScoreEntry({ ...scoreEntry, entryPermission: e.target.value as ScoreEntryPermission })} 
              className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"
            >
              {ENTRY_OPTS.map(o => <option key={o.v} value={o.v}>{o.l} - {o.d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Score Detail Level</label>
            <select 
              value={scoreEntry.detailLevel} 
              onChange={e => setScoreEntry({ ...scoreEntry, detailLevel: e.target.value as ScoreDetailLevel })} 
              className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"
            >
              {DETAIL_OPTS.map(o => <option key={o.v} value={o.v}>{o.l} - {o.d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Confirmation Required</label>
            <select 
              value={scoreEntry.confirmationRequired} 
              onChange={e => setScoreEntry({ ...scoreEntry, confirmationRequired: e.target.value as ScoreConfirmation })} 
              className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"
            >
              {CONFIRM_OPTS.map(o => <option key={o.v} value={o.v}>{o.l} - {o.d}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Dispute Resolution */}
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h3 className="font-semibold text-white mb-2">⚠️ Dispute Resolution</h3>
        <select 
          value={scoreEntry.disputeResolution} 
          onChange={e => setScoreEntry({ ...scoreEntry, disputeResolution: e.target.value as DisputeResolution })} 
          className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"
        >
          {DISPUTE_OPTS.map(o => <option key={o.v} value={o.v}>{o.l} - {o.d}</option>)}
        </select>
      </div>

      {/* Match Deadline */}
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h3 className="font-semibold text-white mb-2">⏰ Match Deadline</h3>
        <div className="flex items-center gap-2">
          <input 
            type="number" 
            value={scoreRep.matchDeadlineDays} 
            onChange={e => setScoreRep({ ...scoreRep, matchDeadlineDays: parseInt(e.target.value) || 7 })} 
            className="w-20 bg-gray-900 text-white p-2 rounded border border-gray-600 text-center"
            min={1} max={30}
          />
          <span className="text-gray-400">days to complete each round</span>
        </div>
      </div>

      {/* Format-Specific Settings */}
      {basic.format === 'ladder' && (
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h3 className="font-semibold text-white mb-2">🪜 Ladder Rules</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500">Challenge Range</label>
              <input 
                type="number" 
                value={challenge.challengeRange} 
                onChange={e => setChallenge({ ...challenge, challengeRange: parseInt(e.target.value) || 3 })} 
                className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"
                min={1} max={10}
              />
              <span className="text-xs text-gray-500">positions up</span>
            </div>
            <div>
              <label className="block text-xs text-gray-500">Response Time (hrs)</label>
              <input 
                type="number" 
                value={challenge.responseDeadlineHours} 
                onChange={e => setChallenge({ ...challenge, responseDeadlineHours: parseInt(e.target.value) || 48 })} 
                className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"
              />
            </div>
          </div>
        </div>
      )}

      {basic.format === 'round_robin' && (
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h3 className="font-semibold text-white mb-2">🔄 Round Robin</h3>
          <div>
            <label className="block text-xs text-gray-500">Rounds (play everyone X times)</label>
            <input 
              type="number" 
              value={rr.rounds} 
              onChange={e => setRr({ ...rr, rounds: parseInt(e.target.value) || 1 })} 
              className="w-24 bg-gray-900 text-white p-2 rounded border border-gray-600"
              min={1} max={4}
            />
          </div>
        </div>
      )}

      {basic.format === 'swiss' && (
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h3 className="font-semibold text-white mb-2">🎯 Swiss System</h3>
          <div>
            <label className="block text-xs text-gray-500">Number of Rounds</label>
            <input 
              type="number" 
              value={swiss.rounds} 
              onChange={e => setSwiss({ ...swiss, rounds: parseInt(e.target.value) || 4 })} 
              className="w-24 bg-gray-900 text-white p-2 rounded border border-gray-600"
              min={2} max={10}
            />
          </div>
        </div>
      )}

      {basic.format === 'box_league' && (
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h3 className="font-semibold text-white mb-2">📦 Box League</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500">Players/Box</label>
              <input 
                type="number" 
                value={box.playersPerBox} 
                onChange={e => setBox({ ...box, playersPerBox: parseInt(e.target.value) || 4 })} 
                className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"
                min={3} max={8}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500">Promote</label>
              <input 
                type="number" 
                value={box.promotionSpots} 
                onChange={e => setBox({ ...box, promotionSpots: parseInt(e.target.value) || 1 })} 
                className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"
                min={0} max={3}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500">Relegate</label>
              <input 
                type="number" 
                value={box.relegationSpots} 
                onChange={e => setBox({ ...box, relegationSpots: parseInt(e.target.value) || 1 })} 
                className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"
                min={0} max={3}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // STEP 6: Payment
  const Step6 = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Payment</h2>
      
      {!canPay ? (
        <div className="bg-yellow-900/20 border border-yellow-600 p-4 rounded-lg">
          <p className="text-yellow-400 text-sm">
            💳 Connect Stripe to accept payments. Without it, only free leagues can be created.
          </p>
        </div>
      ) : (
        <>
          <label className="flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-700 cursor-pointer">
            <div>
              <div className="font-semibold text-white">Enable Paid Entry</div>
              <div className="text-sm text-gray-400">Collect entry fees via Stripe</div>
            </div>
            <button 
              type="button"
              onClick={() => setPricingOn(!pricingOn)} 
              className={`w-12 h-6 rounded-full ${pricingOn ? 'bg-green-600' : 'bg-gray-600'}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full transition-transform ${pricingOn ? 'translate-x-6' : 'translate-x-1'}`}/>
            </button>
          </label>
          
          {pricingOn && (
            <div className="space-y-4">
              <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Entry Fee *</label>
                    <input 
                      type="text" 
                      value={fmtCur(price.entryFee)} 
                      onChange={e => setPrice({ ...price, entryFee: parseCur(e.target.value) })} 
                      className="w-full bg-gray-900 text-white p-2.5 rounded border border-gray-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Fee Type</label>
                    <select 
                      value={price.entryFeeType} 
                      onChange={e => setPrice({ ...price, entryFeeType: e.target.value as 'per_player' | 'per_team' })} 
                      className="w-full bg-gray-900 text-white p-2.5 rounded border border-gray-600"
                    >
                      <option value="per_player">Per Player</option>
                      <option value="per_team">Per Team</option>
                    </select>
                  </div>
                </div>
              </div>
              
              <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                <label className="block text-xs text-gray-500 mb-1">Refund Policy</label>
                <div className="flex gap-2">
                  {(['full', 'partial', 'none'] as const).map(p => (
                    <label 
                      key={p} 
                      className={`flex-1 text-center py-2 rounded cursor-pointer border ${
                        price.refundPolicy === p ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400'
                      }`}
                    >
                      <input 
                        type="radio" 
                        checked={price.refundPolicy === p} 
                        onChange={() => setPrice({ ...price, refundPolicy: p })} 
                        className="sr-only"
                      />
                      {p === 'full' ? 'Full Refund' : p === 'partial' ? '50% Refund' : 'No Refunds'}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  // STEP 7: Review
  const Step7 = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Review & Create</h2>
      
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h3 className="font-semibold text-white mb-2">📋 Basic Info</h3>
        <div className="grid grid-cols-2 gap-1 text-sm">
          <span className="text-gray-400">Name:</span><span className="text-white">{basic.name}</span>
          <span className="text-gray-400">Type:</span><span className="text-white capitalize">{basic.type.replace('_', ' ')}</span>
          <span className="text-gray-400">Format:</span><span className="text-white capitalize">{basic.format.replace('_', ' ')}</span>
        </div>
      </div>
      
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h3 className="font-semibold text-white mb-2">📅 Schedule</h3>
        <div className="text-sm">
          <span className="text-gray-400">Season:</span> 
          <span className="text-white ml-2">{sched.seasonStart} → {sched.seasonEnd}</span>
        </div>
        {venueEnabled && (
          <div className="mt-2 text-sm">
            <span className="text-gray-400">Venue:</span> 
            <span className="text-white ml-2">{venue.venueName}</span>
            <span className="text-gray-500 ml-2">({venue.courts.length} courts)</span>
          </div>
        )}
      </div>
      
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h3 className="font-semibold text-white mb-2">🎯 Scoring</h3>
        <div className="text-sm text-white">W:{scoring.pointsForWin} D:{scoring.pointsForDraw} L:{scoring.pointsForLoss}</div>
        <div className="text-sm text-gray-400">Best of {matchFmt.bestOf}, to {matchFmt.gamesTo}</div>
      </div>
      
      {pricingOn && (
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h3 className="font-semibold text-white mb-2">💰 Payment</h3>
          <div className="text-sm text-white">{fmtCur(price.entryFee)} per {price.entryFeeType === 'per_team' ? 'team' : 'player'}</div>
        </div>
      )}
    </div>
  );

  // ============================================
  // MAIN RENDER
  // ============================================

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="text-gray-400 hover:text-white">← Back</button>
        <h1 className="text-2xl font-bold text-white">Create League</h1>
      </div>
      
      {/* Step Indicator */}
      <div className="flex items-center justify-center mb-6 overflow-x-auto">
        {STEPS.map((t, i) => { 
          const n = i + 1;
          const active = step === n;
          const done = step > n;
          const skip = n === 4 && !isDoubles; 
          return (
            <React.Fragment key={n}>
              <div className="flex flex-col items-center min-w-[40px]">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  skip ? 'bg-gray-700 text-gray-500' : 
                  active ? 'bg-blue-600 text-white' : 
                  done ? 'bg-green-600 text-white' : 
                  'bg-gray-700 text-gray-400'
                }`}>
                  {done ? '✓' : n}
                </div>
                <span className={`text-xs mt-1 hidden md:block ${active ? 'text-blue-400' : 'text-gray-500'}`}>
                  {t}
                </span>
              </div>
              {n < 7 && <div className={`w-4 md:w-6 h-0.5 ${step > n ? 'bg-green-600' : 'bg-gray-700'}`}/>}
            </React.Fragment>
          ); 
        })}
      </div>
      
      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-600 rounded-lg p-3 mb-4 text-red-400">
          {error}
        </div>
      )}
      
      {/* Step Content */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 mb-4">
        {step === 1 && <Step1/>}
        {step === 2 && <Step2/>}
        {step === 3 && <Step3/>}
        {step === 4 && (isDoubles ? <Step4/> : <div className="text-center py-8 text-gray-400">Partner settings for doubles only</div>)}
        {step === 5 && <Step5/>}
        {step === 6 && <Step6/>}
        {step === 7 && <Step7/>}
      </div>
      
      {/* Navigation */}
      <div className="flex justify-between">
        <button 
          onClick={() => setStep(Math.max(1, step - 1))} 
          disabled={step === 1} 
          className="px-6 py-2 text-gray-400 hover:text-white disabled:opacity-30"
        >
          ← Prev
        </button>
        
        {step < 7 ? (
          <button 
            onClick={() => { 
              const e = validate(step); 
              if (e) setError(e); 
              else { 
                setError(null); 
                // Skip step 4 for singles
                setStep(step === 3 && !isDoubles ? 5 : step + 1); 
              } 
            }} 
            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-semibold"
          >
            Next →
          </button>
        ) : (
          <button 
            onClick={submit} 
            disabled={loading} 
            className="bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white px-8 py-2 rounded-lg font-semibold"
          >
            {loading ? '⏳ Creating...' : '✓ Create League'}
          </button>
        )}
      </div>
    </div>
  );
};

export default CreateLeague;