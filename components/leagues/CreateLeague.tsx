/**
 * CreateLeague Component - Complete 7-Step Wizard
 * 
 * FILE: src/components/leagues/CreateLeague.tsx
 * VERSION: V05.17
 * 
 * Steps: Basic Info → Schedule → Divisions → Partner Settings → Scoring → Payments → Review
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { createLeague, getClubsForUser, createLeagueDivision } from '../../services/firebase';
import type { 
  LeagueType, LeagueFormat, LeagueSettings, LeaguePartnerSettings, LeaguePricing,
  LeagueMatchFormat, LeagueChallengeRules, LeagueRoundRobinSettings, LeagueSwissSettings,
  LeagueBoxSettings, LeagueTiebreaker, Club, GenderCategory, EventType,
} from '../../types';

interface CreateLeagueProps {
  onBack: () => void;
  onCreated: (leagueId: string) => void;
}

interface DivisionDraft {
  id: string; name: string; type: EventType; gender: GenderCategory;
  minRating?: number | null; maxRating?: number | null;
  minAge?: number | null; maxAge?: number | null; maxParticipants?: number | null;
}

const STEP_TITLES = ['Basic Info', 'Schedule', 'Divisions', 'Partner Settings', 'Scoring & Rules', 'Payments', 'Review'];

const LEAGUE_TYPE_OPTIONS: { value: LeagueType; label: string; desc: string }[] = [
  { value: 'singles', label: 'Singles', desc: 'Individual players' },
  { value: 'doubles', label: 'Doubles', desc: 'Pairs compete' },
  { value: 'mixed_doubles', label: 'Mixed Doubles', desc: 'M/F pairs' },
  { value: 'team', label: 'Team', desc: '3+ players' },
];

const LEAGUE_FORMAT_OPTIONS: { value: LeagueFormat; label: string; desc: string }[] = [
  { value: 'ladder', label: '🪜 Ladder', desc: 'Challenge players above' },
  { value: 'round_robin', label: '🔄 Round Robin', desc: 'Everyone plays everyone' },
  { value: 'swiss', label: '🎯 Swiss', desc: 'Paired by records' },
  { value: 'box_league', label: '📦 Box League', desc: 'Groups with promotion' },
];

// TIEBREAKER_OPTIONS - Available for future tiebreaker selection UI
// const TIEBREAKER_OPTIONS: { value: LeagueTiebreaker; label: string }[] = [
//   { value: 'head_to_head', label: 'Head-to-Head' },
//   { value: 'game_diff', label: 'Game Difference' },
//   { value: 'games_won', label: 'Games Won' },
//   { value: 'points_for', label: 'Points Scored' },
// ];

export const CreateLeague: React.FC<CreateLeagueProps> = ({ onBack, onCreated }) => {
  const { currentUser, userProfile } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clubs, setClubs] = useState<Club[]>([]);
  
  const hasStripeAccount = userProfile?.stripeConnectedAccountId && userProfile?.stripeChargesEnabled;
  
  // Step 1: Basic Info
  const [basicInfo, setBasicInfo] = useState({
    name: '', description: '', type: 'singles' as LeagueType, format: 'ladder' as LeagueFormat,
    clubId: '', location: '', venue: '', visibility: 'public' as 'public' | 'private' | 'club_only',
  });
  
  // Step 2: Schedule
  const [schedule, setSchedule] = useState({ seasonStart: '', seasonEnd: '', registrationOpens: '', registrationDeadline: '' });
  
  // Step 3: Divisions
  const [hasDivisions, setHasDivisions] = useState(false);
  const [divisions, setDivisions] = useState<DivisionDraft[]>([]);
  const [singleDivision, setSingleDivision] = useState<DivisionDraft>({
    id: 'default', name: 'Open', type: 'singles', gender: 'open',
    minRating: null, maxRating: null, minAge: null, maxAge: null, maxParticipants: null,
  });
  
  // Step 4: Partner Settings
  const [partnerSettings, setPartnerSettings] = useState<LeaguePartnerSettings>({
    allowInvitePartner: true, allowOpenTeam: true, allowJoinOpen: true,
    partnerLockRule: 'registration_close', partnerLockWeek: null, allowSubstitutes: false, teamNameMode: 'auto',
  });
  
  // Step 5: Scoring
  const [scoringSettings, setScoringSettings] = useState({ pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0, pointsForForfeit: -1, pointsForNoShow: -2 });
  const [matchFormat, setMatchFormat] = useState<LeagueMatchFormat>({ bestOf: 3, gamesTo: 11, winBy: 2, allowDraw: false });
  const [challengeRules, setChallengeRules] = useState<LeagueChallengeRules>({ challengeRange: 3, responseDeadlineHours: 48, completionDeadlineDays: 7, forfeitOnDecline: false, maxActiveChallenges: 2, cooldownDays: 7 });
  const [roundRobinSettings, setRoundRobinSettings] = useState<LeagueRoundRobinSettings>({ rounds: 1, matchesPerWeek: 2, scheduleGeneration: 'auto' });
  const [swissSettings] = useState<LeagueSwissSettings>({ rounds: 5, pairingMethod: 'adjacent' });
  const [boxSettings] = useState<LeagueBoxSettings>({ playersPerBox: 4, promotionSpots: 1, relegationSpots: 1, roundsPerBox: 1 });
  const [tiebreakers] = useState<LeagueTiebreaker[]>(['head_to_head', 'game_diff', 'games_won']);
  const [scoreReporting, setScoreReporting] = useState({ allowSelfReporting: true, requireConfirmation: true, matchDeadlineDays: 7 });
  
  // Step 6: Payments
  const [pricingEnabled, setPricingEnabled] = useState(false);
  const [pricing, setPricing] = useState({
    entryFee: 2000, entryFeeType: 'per_player' as 'per_player' | 'per_team', memberDiscount: 0,
    earlyBirdEnabled: false, earlyBirdFee: 1500, lateFeeEnabled: false, lateFee: 500,
    prizePool: { enabled: false, type: 'none' as 'none' | 'fixed' | 'percentage', amount: 0, distribution: { first: 60, second: 30, third: 10, fourth: 0 } },
    feesPaidBy: 'player' as 'player' | 'organizer', refundPolicy: 'full' as 'full' | 'partial' | 'none',
  });

  useEffect(() => { if (currentUser) getClubsForUser(currentUser.uid).then(setClubs).catch(console.error); }, [currentUser]);
  useEffect(() => { setSingleDivision(prev => ({ ...prev, type: basicInfo.type === 'mixed_doubles' ? 'doubles' : basicInfo.type as EventType })); }, [basicInfo.type]);

  const selectedClub = clubs.find(c => c.id === basicInfo.clubId);
  const clubHasStripe = selectedClub?.stripeConnectedAccountId && selectedClub?.stripeChargesEnabled;
  const canAcceptPayments = hasStripeAccount || clubHasStripe;
  const isDoublesOrMixed = basicInfo.type === 'doubles' || basicInfo.type === 'mixed_doubles';
  
  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const parseCurrency = (v: string) => Math.round((parseFloat(v.replace(/[^0-9.]/g, '')) || 0) * 100);

  const validateStep = (s: number): string | null => {
    if (s === 1 && !basicInfo.name.trim()) return 'League name is required';
    if (s === 2 && (!schedule.seasonStart || !schedule.seasonEnd)) return 'Season dates are required';
    if (s === 2 && new Date(schedule.seasonEnd) <= new Date(schedule.seasonStart)) return 'End must be after start';
    if (s === 3 && hasDivisions && divisions.length === 0) return 'Add at least one division';
    if (s === 6 && pricingEnabled && pricing.entryFee < 100) return 'Min fee is $1.00';
    return null;
  };

  const addDivision = () => setDivisions([...divisions, { id: `div_${Date.now()}`, name: `Division ${divisions.length + 1}`, type: basicInfo.type as EventType, gender: 'open', minRating: null, maxRating: null, minAge: null, maxAge: null, maxParticipants: null }]);
  const updateDivision = (id: string, updates: Partial<DivisionDraft>) => setDivisions(divisions.map(d => d.id === id ? { ...d, ...updates } : d));
  const removeDivision = (id: string) => setDivisions(divisions.filter(d => d.id !== id));

  const handleSubmit = async () => {
    if (!currentUser || !userProfile) return;
    for (let i = 1; i <= 6; i++) { const err = validateStep(i); if (err) { setError(err); setStep(i); return; } }
    
    setError(null); setLoading(true);
    try {
      const settings: LeagueSettings = {
        minRating: hasDivisions ? null : singleDivision.minRating, maxRating: hasDivisions ? null : singleDivision.maxRating,
        minAge: hasDivisions ? null : singleDivision.minAge, maxAge: hasDivisions ? null : singleDivision.maxAge,
        maxMembers: hasDivisions ? null : singleDivision.maxParticipants,
        pointsForWin: scoringSettings.pointsForWin, pointsForDraw: scoringSettings.pointsForDraw, pointsForLoss: scoringSettings.pointsForLoss,
        pointsForForfeit: scoringSettings.pointsForForfeit, pointsForNoShow: scoringSettings.pointsForNoShow,
        matchFormat, matchDeadlineDays: scoreReporting.matchDeadlineDays,
        allowSelfReporting: scoreReporting.allowSelfReporting, requireConfirmation: scoreReporting.requireConfirmation, tiebreakers,
      };
      if (basicInfo.format === 'ladder') settings.challengeRules = challengeRules;
      else if (basicInfo.format === 'round_robin') settings.roundRobinSettings = roundRobinSettings;
      else if (basicInfo.format === 'swiss') settings.swissSettings = swissSettings;
      else if (basicInfo.format === 'box_league') settings.boxSettings = boxSettings;
      if (isDoublesOrMixed) settings.partnerSettings = partnerSettings;

      const leaguePricing: LeaguePricing | null = pricingEnabled ? {
        enabled: true, entryFee: pricing.entryFee, entryFeeType: pricing.entryFeeType, memberDiscount: pricing.memberDiscount,
        earlyBirdEnabled: pricing.earlyBirdEnabled, earlyBirdFee: pricing.earlyBirdFee,
        earlyBirdDeadline: pricing.earlyBirdEnabled && schedule.registrationDeadline ? new Date(schedule.registrationDeadline).getTime() - 604800000 : undefined,
        lateFeeEnabled: pricing.lateFeeEnabled, lateFee: pricing.lateFee,
        lateRegistrationStart: pricing.lateFeeEnabled && schedule.registrationDeadline ? new Date(schedule.registrationDeadline).getTime() - 259200000 : undefined,
        prizePool: pricing.prizePool, feesPaidBy: pricing.feesPaidBy, refundPolicy: pricing.refundPolicy,
        refundDeadline: schedule.seasonStart ? new Date(schedule.seasonStart).getTime() : undefined, currency: 'nzd',
      } : null;

      const stripeAccountId = basicInfo.clubId && clubHasStripe ? selectedClub?.stripeConnectedAccountId : hasStripeAccount ? userProfile.stripeConnectedAccountId : null;

      const leagueId = await createLeague({
        name: basicInfo.name.trim(), description: basicInfo.description.trim(), type: basicInfo.type, format: basicInfo.format,
        clubId: basicInfo.clubId || null, clubName: selectedClub?.name || null, createdByUserId: currentUser.uid,
        organizerName: userProfile.displayName || userProfile.email,
        seasonStart: new Date(schedule.seasonStart).getTime(), seasonEnd: new Date(schedule.seasonEnd).getTime(),
        registrationOpens: schedule.registrationOpens ? new Date(schedule.registrationOpens).getTime() : null,
        registrationDeadline: schedule.registrationDeadline ? new Date(schedule.registrationDeadline).getTime() : null,
        status: 'draft', settings, pricing: leaguePricing, organizerStripeAccountId: stripeAccountId,
        location: basicInfo.location || null, venue: basicInfo.venue || null, visibility: basicInfo.visibility, hasDivisions,
      });

      if (hasDivisions) {
        for (let i = 0; i < divisions.length; i++) {
          await createLeagueDivision(leagueId, { ...divisions[i], registrationOpen: true, order: i });
        }
      }
      onCreated(leagueId);
    } catch (e: any) { setError(e.message || 'Failed'); setLoading(false); }
  };

  // ======== RENDER STEPS ========
  const renderStep1 = () => (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-white">Basic Information</h2>
      <div>
        <label className="block text-sm text-gray-400 mb-1">League Name *</label>
        <input value={basicInfo.name} onChange={(e) => setBasicInfo({ ...basicInfo, name: e.target.value })} placeholder="e.g., Summer Ladder 2025" className="w-full bg-gray-900 text-white p-3 rounded-lg border border-gray-600 focus:border-blue-500 outline-none"/>
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">Description</label>
        <textarea value={basicInfo.description} onChange={(e) => setBasicInfo({ ...basicInfo, description: e.target.value })} rows={3} className="w-full bg-gray-900 text-white p-3 rounded-lg border border-gray-600 outline-none resize-none"/>
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-2">League Type</label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {LEAGUE_TYPE_OPTIONS.map(o => (
            <button key={o.value} onClick={() => setBasicInfo({ ...basicInfo, type: o.value })} className={`p-3 rounded-lg border text-left ${basicInfo.type === o.value ? 'bg-blue-600/20 border-blue-500' : 'bg-gray-800 border-gray-700'}`}>
              <div className="font-semibold text-sm text-white">{o.label}</div>
              <div className="text-xs text-gray-400">{o.desc}</div>
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-2">Format</label>
        <div className="grid grid-cols-2 gap-2">
          {LEAGUE_FORMAT_OPTIONS.map(o => (
            <button key={o.value} onClick={() => setBasicInfo({ ...basicInfo, format: o.value })} className={`p-3 rounded-lg border text-left ${basicInfo.format === o.value ? 'bg-blue-600/20 border-blue-500' : 'bg-gray-800 border-gray-700'}`}>
              <div className="font-semibold text-sm text-white">{o.label}</div>
              <div className="text-xs text-gray-400">{o.desc}</div>
            </button>
          ))}
        </div>
      </div>
      {clubs.length > 0 && (
        <div>
          <label className="block text-sm text-gray-400 mb-1">Host Club</label>
          <select value={basicInfo.clubId} onChange={(e) => setBasicInfo({ ...basicInfo, clubId: e.target.value })} className="w-full bg-gray-900 text-white p-3 rounded-lg border border-gray-600">
            <option value="">No club</option>
            {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div><label className="block text-sm text-gray-400 mb-1">Location</label><input value={basicInfo.location} onChange={(e) => setBasicInfo({ ...basicInfo, location: e.target.value })} placeholder="City" className="w-full bg-gray-900 text-white p-3 rounded-lg border border-gray-600"/></div>
        <div><label className="block text-sm text-gray-400 mb-1">Venue</label><input value={basicInfo.venue} onChange={(e) => setBasicInfo({ ...basicInfo, venue: e.target.value })} placeholder="Courts" className="w-full bg-gray-900 text-white p-3 rounded-lg border border-gray-600"/></div>
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">Visibility</label>
        <select value={basicInfo.visibility} onChange={(e) => setBasicInfo({ ...basicInfo, visibility: e.target.value as any })} className="w-full bg-gray-900 text-white p-3 rounded-lg border border-gray-600">
          <option value="public">Public</option><option value="private">Private</option>{basicInfo.clubId && <option value="club_only">Club Only</option>}
        </select>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-white">Schedule</h2>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="block text-sm text-gray-400 mb-1">Season Start *</label><input type="date" value={schedule.seasonStart} onChange={(e) => setSchedule({ ...schedule, seasonStart: e.target.value })} className="w-full bg-gray-900 text-white p-3 rounded-lg border border-gray-600"/></div>
        <div><label className="block text-sm text-gray-400 mb-1">Season End *</label><input type="date" value={schedule.seasonEnd} onChange={(e) => setSchedule({ ...schedule, seasonEnd: e.target.value })} min={schedule.seasonStart} className="w-full bg-gray-900 text-white p-3 rounded-lg border border-gray-600"/></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="block text-sm text-gray-400 mb-1">Registration Opens</label><input type="date" value={schedule.registrationOpens} onChange={(e) => setSchedule({ ...schedule, registrationOpens: e.target.value })} className="w-full bg-gray-900 text-white p-3 rounded-lg border border-gray-600"/></div>
        <div><label className="block text-sm text-gray-400 mb-1">Registration Deadline</label><input type="date" value={schedule.registrationDeadline} onChange={(e) => setSchedule({ ...schedule, registrationDeadline: e.target.value })} className="w-full bg-gray-900 text-white p-3 rounded-lg border border-gray-600"/></div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-white">Divisions</h2>
      <label className="flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-700 cursor-pointer">
        <div><div className="font-semibold text-white">Multiple Divisions</div><div className="text-sm text-gray-400">Separate by skill/age/gender</div></div>
        <button onClick={() => setHasDivisions(!hasDivisions)} className={`w-12 h-6 rounded-full ${hasDivisions ? 'bg-blue-600' : 'bg-gray-600'}`}><div className={`w-5 h-5 bg-white rounded-full transition-transform ${hasDivisions ? 'translate-x-6' : 'translate-x-0.5'}`}/></button>
      </label>
      {!hasDivisions ? (
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-4">
          <h3 className="font-semibold text-white">Restrictions</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-gray-500">Gender</label><select value={singleDivision.gender} onChange={(e) => setSingleDivision({ ...singleDivision, gender: e.target.value as GenderCategory })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"><option value="open">Open</option><option value="men">Men</option><option value="women">Women</option></select></div>
            <div><label className="block text-xs text-gray-500">Max Players</label><input type="number" value={singleDivision.maxParticipants || ''} onChange={(e) => setSingleDivision({ ...singleDivision, maxParticipants: e.target.value ? parseInt(e.target.value) : null })} placeholder="∞" className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"/></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-gray-500">Min Rating</label><input type="number" step="0.1" value={singleDivision.minRating || ''} onChange={(e) => setSingleDivision({ ...singleDivision, minRating: e.target.value ? parseFloat(e.target.value) : null })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"/></div>
            <div><label className="block text-xs text-gray-500">Max Rating</label><input type="number" step="0.1" value={singleDivision.maxRating || ''} onChange={(e) => setSingleDivision({ ...singleDivision, maxRating: e.target.value ? parseFloat(e.target.value) : null })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"/></div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {divisions.map(d => (
            <div key={d.id} className="bg-gray-800 p-3 rounded-lg border border-gray-700">
              <div className="flex justify-between mb-2"><input value={d.name} onChange={(e) => updateDivision(d.id, { name: e.target.value })} className="font-semibold bg-transparent text-white border-b border-gray-600"/><button onClick={() => removeDivision(d.id)} className="text-red-400 text-sm">Remove</button></div>
              <div className="grid grid-cols-4 gap-2 text-sm">
                <select value={d.gender} onChange={(e) => updateDivision(d.id, { gender: e.target.value as GenderCategory })} className="bg-gray-900 text-white p-2 rounded border border-gray-600"><option value="open">Open</option><option value="men">Men</option><option value="women">Women</option><option value="mixed">Mixed</option></select>
                <input type="number" step="0.1" value={d.minRating || ''} onChange={(e) => updateDivision(d.id, { minRating: e.target.value ? parseFloat(e.target.value) : null })} placeholder="Min Rtg" className="bg-gray-900 text-white p-2 rounded border border-gray-600"/>
                <input type="number" step="0.1" value={d.maxRating || ''} onChange={(e) => updateDivision(d.id, { maxRating: e.target.value ? parseFloat(e.target.value) : null })} placeholder="Max Rtg" className="bg-gray-900 text-white p-2 rounded border border-gray-600"/>
                <input type="number" value={d.maxParticipants || ''} onChange={(e) => updateDivision(d.id, { maxParticipants: e.target.value ? parseInt(e.target.value) : null })} placeholder="Max" className="bg-gray-900 text-white p-2 rounded border border-gray-600"/>
              </div>
            </div>
          ))}
          <button onClick={addDivision} className="w-full p-3 border-2 border-dashed border-gray-600 rounded-lg text-gray-400 hover:border-blue-500">+ Add Division</button>
        </div>
      )}
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-white">Partner Settings</h2>
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-3">
        <h3 className="font-semibold text-white">Partner Finding Options</h3>
        {[{ key: 'allowInvitePartner', label: 'Invite Specific Partner', desc: 'Search & invite' }, { key: 'allowOpenTeam', label: 'Create Open Team', desc: '"Looking for partner"' }, { key: 'allowJoinOpen', label: 'Join Open Teams', desc: 'Browse available' }].map(opt => (
          <label key={opt.key} className="flex items-center justify-between p-3 bg-gray-900 rounded-lg cursor-pointer">
            <div><div className="font-medium text-white">{opt.label}</div><div className="text-xs text-gray-400">{opt.desc}</div></div>
            <input type="checkbox" checked={(partnerSettings as any)[opt.key]} onChange={(e) => setPartnerSettings({ ...partnerSettings, [opt.key]: e.target.checked })} className="w-5 h-5 accent-blue-500"/>
          </label>
        ))}
      </div>
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-3">
        <h3 className="font-semibold text-white">Partner Lock Rule</h3>
        {[{ val: 'registration_close', label: 'When registration closes' }, { val: 'anytime', label: 'Allow changes anytime' }, { val: 'after_week', label: 'Lock after week' }].map(opt => (
          <label key={opt.val} className="flex items-center gap-3 p-3 bg-gray-900 rounded-lg cursor-pointer">
            <input type="radio" checked={partnerSettings.partnerLockRule === opt.val} onChange={() => setPartnerSettings({ ...partnerSettings, partnerLockRule: opt.val as any })} className="accent-blue-500"/>
            <span className="text-white">{opt.label}</span>
            {opt.val === 'after_week' && partnerSettings.partnerLockRule === 'after_week' && <input type="number" min="1" value={partnerSettings.partnerLockWeek || 2} onChange={(e) => setPartnerSettings({ ...partnerSettings, partnerLockWeek: parseInt(e.target.value) })} className="w-16 bg-gray-700 text-white p-1 rounded text-center"/>}
          </label>
        ))}
      </div>
      <label className="flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-700 cursor-pointer">
        <div><div className="font-semibold text-white">Allow Substitutes</div><div className="text-xs text-gray-400">Temp subs when partner unavailable</div></div>
        <input type="checkbox" checked={partnerSettings.allowSubstitutes} onChange={(e) => setPartnerSettings({ ...partnerSettings, allowSubstitutes: e.target.checked })} className="w-5 h-5 accent-blue-500"/>
      </label>
    </div>
  );

  const renderStep5 = () => (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-white">Scoring & Rules</h2>
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h3 className="font-semibold text-white mb-3">Points System</h3>
        <div className="grid grid-cols-5 gap-2">
          {[{ key: 'pointsForWin', label: 'Win' }, { key: 'pointsForDraw', label: 'Draw' }, { key: 'pointsForLoss', label: 'Loss' }, { key: 'pointsForForfeit', label: 'Forfeit' }, { key: 'pointsForNoShow', label: 'No-Show' }].map(p => (
            <div key={p.key}><label className="block text-xs text-gray-500">{p.label}</label><input type="number" value={(scoringSettings as any)[p.key]} onChange={(e) => setScoringSettings({ ...scoringSettings, [p.key]: parseInt(e.target.value) || 0 })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600 text-center"/></div>
          ))}
        </div>
      </div>
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h3 className="font-semibold text-white mb-3">Match Format</h3>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="block text-xs text-gray-500">Best Of</label><select value={matchFormat.bestOf} onChange={(e) => setMatchFormat({ ...matchFormat, bestOf: parseInt(e.target.value) as 1|3|5 })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"><option value={1}>1</option><option value={3}>3</option><option value={5}>5</option></select></div>
          <div><label className="block text-xs text-gray-500">Points/Game</label><select value={matchFormat.gamesTo} onChange={(e) => setMatchFormat({ ...matchFormat, gamesTo: parseInt(e.target.value) as 11|15|21 })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"><option value={11}>11</option><option value={15}>15</option><option value={21}>21</option></select></div>
          <div><label className="block text-xs text-gray-500">Win By</label><select value={matchFormat.winBy} onChange={(e) => setMatchFormat({ ...matchFormat, winBy: parseInt(e.target.value) as 1|2 })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"><option value={1}>1</option><option value={2}>2</option></select></div>
        </div>
      </div>
      {basicInfo.format === 'ladder' && (
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h3 className="font-semibold text-white mb-3">🪜 Ladder Rules</h3>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-xs text-gray-500">Challenge Range</label><div className="flex items-center gap-1"><input type="number" min="1" value={challengeRules.challengeRange} onChange={(e) => setChallengeRules({ ...challengeRules, challengeRange: parseInt(e.target.value) || 3 })} className="w-16 bg-gray-900 text-white p-2 rounded border border-gray-600 text-center"/><span className="text-gray-400 text-xs">up</span></div></div>
            <div><label className="block text-xs text-gray-500">Response</label><div className="flex items-center gap-1"><input type="number" value={challengeRules.responseDeadlineHours} onChange={(e) => setChallengeRules({ ...challengeRules, responseDeadlineHours: parseInt(e.target.value) || 48 })} className="w-16 bg-gray-900 text-white p-2 rounded border border-gray-600 text-center"/><span className="text-gray-400 text-xs">hrs</span></div></div>
            <div><label className="block text-xs text-gray-500">Complete</label><div className="flex items-center gap-1"><input type="number" value={challengeRules.completionDeadlineDays} onChange={(e) => setChallengeRules({ ...challengeRules, completionDeadlineDays: parseInt(e.target.value) || 7 })} className="w-16 bg-gray-900 text-white p-2 rounded border border-gray-600 text-center"/><span className="text-gray-400 text-xs">days</span></div></div>
          </div>
        </div>
      )}
      {basicInfo.format === 'round_robin' && (
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h3 className="font-semibold text-white mb-3">🔄 Round Robin</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-gray-500">Rounds</label><select value={roundRobinSettings.rounds} onChange={(e) => setRoundRobinSettings({ ...roundRobinSettings, rounds: parseInt(e.target.value) })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"><option value={1}>Single</option><option value={2}>Double</option></select></div>
            <div><label className="block text-xs text-gray-500">Matches/Week</label><input type="number" value={roundRobinSettings.matchesPerWeek} onChange={(e) => setRoundRobinSettings({ ...roundRobinSettings, matchesPerWeek: parseInt(e.target.value) })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"/></div>
          </div>
        </div>
      )}
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-3">
        <h3 className="font-semibold text-white">Score Reporting</h3>
        <label className="flex items-center justify-between p-3 bg-gray-900 rounded-lg cursor-pointer"><div className="text-white">Allow Self-Reporting</div><input type="checkbox" checked={scoreReporting.allowSelfReporting} onChange={(e) => setScoreReporting({ ...scoreReporting, allowSelfReporting: e.target.checked })} className="w-5 h-5 accent-blue-500"/></label>
        <label className="flex items-center justify-between p-3 bg-gray-900 rounded-lg cursor-pointer"><div className="text-white">Require Confirmation</div><input type="checkbox" checked={scoreReporting.requireConfirmation} onChange={(e) => setScoreReporting({ ...scoreReporting, requireConfirmation: e.target.checked })} className="w-5 h-5 accent-blue-500"/></label>
      </div>
    </div>
  );

  const renderStep6 = () => (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-white">Payments</h2>
      {!canAcceptPayments ? (
        <div className="bg-yellow-900/20 border border-yellow-600 rounded-lg p-4">
          <h3 className="font-semibold text-yellow-400">⚠️ Stripe Not Connected</h3>
          <p className="text-sm text-gray-300 mt-2">Connect Stripe in Profile → Payment Settings to accept payments. For now, create a free league.</p>
        </div>
      ) : (
        <>
          <label className="flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-700 cursor-pointer">
            <div><div className="font-semibold text-white">Charge Entry Fee</div><div className="text-sm text-gray-400">Collect payment on registration</div></div>
            <button onClick={() => setPricingEnabled(!pricingEnabled)} className={`w-12 h-6 rounded-full ${pricingEnabled ? 'bg-blue-600' : 'bg-gray-600'}`}><div className={`w-5 h-5 bg-white rounded-full transition-transform ${pricingEnabled ? 'translate-x-6' : 'translate-x-0.5'}`}/></button>
          </label>
          {pricingEnabled && (
            <>
              <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-4">
                <h3 className="font-semibold text-white">Entry Fee</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs text-gray-500">Amount (NZD)</label><div className="relative"><span className="absolute left-3 top-2 text-gray-400">$</span><input type="number" step="0.01" value={(pricing.entryFee / 100).toFixed(2)} onChange={(e) => setPricing({ ...pricing, entryFee: parseCurrency(e.target.value) })} className="w-full bg-gray-900 text-white p-2 pl-8 rounded border border-gray-600"/></div></div>
                  <div><label className="block text-xs text-gray-500">Type</label><select value={pricing.entryFeeType} onChange={(e) => setPricing({ ...pricing, entryFeeType: e.target.value as any })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"><option value="per_player">Per Player</option><option value="per_team">Per Team</option></select></div>
                </div>
              </div>
              <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={pricing.earlyBirdEnabled} onChange={(e) => setPricing({ ...pricing, earlyBirdEnabled: e.target.checked })} className="w-5 h-5 accent-blue-500"/><div><span className="font-semibold text-white">Early Bird Pricing</span></div></label>
                {pricing.earlyBirdEnabled && <div><label className="block text-xs text-gray-500">Early Bird Fee</label><div className="relative w-48"><span className="absolute left-3 top-2 text-gray-400">$</span><input type="number" step="0.01" value={((pricing.earlyBirdFee || 0) / 100).toFixed(2)} onChange={(e) => setPricing({ ...pricing, earlyBirdFee: parseCurrency(e.target.value) })} className="w-full bg-gray-900 text-white p-2 pl-8 rounded border border-gray-600"/></div></div>}
              </div>
              <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={pricing.prizePool.enabled} onChange={(e) => setPricing({ ...pricing, prizePool: { ...pricing.prizePool, enabled: e.target.checked, type: e.target.checked ? 'fixed' : 'none' } })} className="w-5 h-5 accent-blue-500"/><span className="font-semibold text-white">Prize Pool</span></label>
                {pricing.prizePool.enabled && (
                  <div className="space-y-3">
                    <div className="flex gap-3"><label className="flex items-center gap-2"><input type="radio" checked={pricing.prizePool.type === 'fixed'} onChange={() => setPricing({ ...pricing, prizePool: { ...pricing.prizePool, type: 'fixed' } })} className="accent-blue-500"/><span className="text-white">Fixed</span></label><label className="flex items-center gap-2"><input type="radio" checked={pricing.prizePool.type === 'percentage'} onChange={() => setPricing({ ...pricing, prizePool: { ...pricing.prizePool, type: 'percentage' } })} className="accent-blue-500"/><span className="text-white">% of Fees</span></label></div>
                    <div className="relative w-48">{pricing.prizePool.type === 'fixed' && <span className="absolute left-3 top-2 text-gray-400">$</span>}<input type="number" value={pricing.prizePool.type === 'fixed' ? ((pricing.prizePool.amount || 0) / 100).toFixed(2) : pricing.prizePool.amount} onChange={(e) => setPricing({ ...pricing, prizePool: { ...pricing.prizePool, amount: pricing.prizePool.type === 'fixed' ? parseCurrency(e.target.value) : parseInt(e.target.value) || 0 } })} className={`w-full bg-gray-900 text-white p-2 rounded border border-gray-600 ${pricing.prizePool.type === 'fixed' ? 'pl-8' : ''}`}/>{pricing.prizePool.type === 'percentage' && <span className="absolute right-3 top-2 text-gray-400">%</span>}</div>
                  </div>
                )}
              </div>
              <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-2">
                <h3 className="font-semibold text-white">Fee Handling</h3>
                <label className="flex items-center gap-3 p-2 bg-gray-900 rounded cursor-pointer"><input type="radio" checked={pricing.feesPaidBy === 'player'} onChange={() => setPricing({ ...pricing, feesPaidBy: 'player' })} className="accent-blue-500"/><span className="text-white">Player Pays Fees</span></label>
                <label className="flex items-center gap-3 p-2 bg-gray-900 rounded cursor-pointer"><input type="radio" checked={pricing.feesPaidBy === 'organizer'} onChange={() => setPricing({ ...pricing, feesPaidBy: 'organizer' })} className="accent-blue-500"/><span className="text-white">Organizer Absorbs Fees</span></label>
                <p className="text-xs text-gray-500">Platform: 1.5% • Stripe: 2.9% + $0.30</p>
              </div>
              <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-2">
                <h3 className="font-semibold text-white">Refund Policy</h3>
                {['full', 'partial', 'none'].map(p => <label key={p} className="flex items-center gap-3 p-2 bg-gray-900 rounded cursor-pointer"><input type="radio" checked={pricing.refundPolicy === p} onChange={() => setPricing({ ...pricing, refundPolicy: p as any })} className="accent-blue-500"/><span className="text-white capitalize">{p === 'full' ? 'Full Refund' : p === 'partial' ? '50% Refund' : 'No Refunds'}</span></label>)}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );

  const renderStep7 = () => (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-white">Review & Create</h2>
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h3 className="font-semibold text-white mb-2">📋 Basic Info</h3>
        <div className="grid grid-cols-2 gap-1 text-sm"><span className="text-gray-400">Name:</span><span className="text-white">{basicInfo.name}</span><span className="text-gray-400">Type:</span><span className="text-white">{basicInfo.type}</span><span className="text-gray-400">Format:</span><span className="text-white">{basicInfo.format}</span></div>
      </div>
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h3 className="font-semibold text-white mb-2">📅 Schedule</h3>
        <div className="grid grid-cols-2 gap-1 text-sm"><span className="text-gray-400">Season:</span><span className="text-white">{schedule.seasonStart} to {schedule.seasonEnd}</span></div>
      </div>
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h3 className="font-semibold text-white mb-2">🎯 Scoring</h3>
        <div className="text-sm text-white">Win: {scoringSettings.pointsForWin} | Draw: {scoringSettings.pointsForDraw} | Loss: {scoringSettings.pointsForLoss}</div>
        <div className="text-sm text-gray-400">Best of {matchFormat.bestOf}, to {matchFormat.gamesTo}</div>
      </div>
      {pricingEnabled && (
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h3 className="font-semibold text-white mb-2">💰 Payments</h3>
          <div className="text-sm text-white">Entry: {formatCurrency(pricing.entryFee)} {pricing.entryFeeType}</div>
        </div>
      )}
    </div>
  );

  // ======== MAIN RENDER ========
  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="text-gray-400 hover:text-white">← Back</button>
        <h1 className="text-2xl font-bold text-white">Create League</h1>
      </div>
      
      {/* Step Indicator */}
      <div className="flex items-center justify-center mb-6 overflow-x-auto">
        {STEP_TITLES.map((t, i) => {
          const n = i + 1, active = step === n, done = step > n, skip = n === 4 && !isDoublesOrMixed;
          return (<React.Fragment key={n}>
            <div className="flex flex-col items-center min-w-[50px]">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${skip ? 'bg-gray-700 text-gray-500' : active ? 'bg-blue-600 text-white' : done ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400'}`}>{done ? '✓' : n}</div>
              <span className={`text-xs mt-1 hidden md:block ${active ? 'text-blue-400' : 'text-gray-500'}`}>{t}</span>
            </div>
            {n < 7 && <div className={`w-4 md:w-8 h-0.5 ${step > n ? 'bg-green-600' : 'bg-gray-700'}`}/>}
          </React.Fragment>);
        })}
      </div>

      {error && <div className="bg-red-900/20 border border-red-600 rounded-lg p-3 mb-4 text-red-400">{error}</div>}
      
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 mb-4">
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && (isDoublesOrMixed ? renderStep4() : <div className="text-center py-8 text-gray-400">Partner settings only for Doubles/Mixed. Click Next.</div>)}
        {step === 5 && renderStep5()}
        {step === 6 && renderStep6()}
        {step === 7 && renderStep7()}
      </div>
      
      <div className="flex justify-between">
        <button onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1} className="px-6 py-2 text-gray-400 hover:text-white disabled:opacity-30">← Previous</button>
        {step < 7 ? (
          <button onClick={() => { const e = validateStep(step); if (e) setError(e); else { setError(null); setStep(step === 3 && !isDoublesOrMixed ? 5 : step + 1); } }} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-semibold">Next →</button>
        ) : (
          <button onClick={handleSubmit} disabled={loading} className="bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white px-8 py-2 rounded-lg font-semibold">{loading ? '⏳ Creating...' : '✓ Create League'}</button>
        )}
      </div>
    </div>
  );
};

export default CreateLeague;