/**
 * CreateLeague Component - 7-Step Wizard V05.33
 * FILE: src/components/leagues/CreateLeague.tsx
 * NEW: Score Entry Settings, Dispute Resolution, DUPR Integration
 */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { createLeague, getClubsForUser, createLeagueDivision } from '../../services/firebase';
import type { LeagueType, LeagueFormat, LeagueSettings, LeaguePartnerSettings, LeaguePricing, LeagueMatchFormat, LeagueChallengeRules, LeagueRoundRobinSettings, LeagueSwissSettings, LeagueBoxSettings, LeagueTiebreaker, Club, GenderCategory, EventType } from '../../types';

type ScoreEntryPermission = 'either_participant' | 'winner_only' | 'organizer_only';
type ScoreConfirmation = 'always_required' | 'auto_confirm_24h' | 'auto_confirm_48h' | 'auto_confirm_72h' | 'no_confirmation';
type ScoreDetailLevel = 'win_loss_only' | 'games_only' | 'full_scores';
type DisputeResolution = 'organizer_decides' | 'match_replayed' | 'both_lose';
type DuprSyncMode = 'auto_submit' | 'batch_sync' | 'manual_submit' | 'no_dupr';

interface ScoreEntrySettings { entryPermission: ScoreEntryPermission; confirmationRequired: ScoreConfirmation; detailLevel: ScoreDetailLevel; disputeResolution: DisputeResolution; duprSync: DuprSyncMode; }
interface CreateLeagueProps { onBack: () => void; onCreated: (leagueId: string) => void; }
interface DivisionDraft { id: string; name: string; type: EventType; gender: GenderCategory; minRating?: number | null; maxRating?: number | null; minAge?: number | null; maxAge?: number | null; maxParticipants?: number | null; }

const STEPS = ['Basic Info', 'Schedule', 'Divisions', 'Partners', 'Scoring', 'Payments', 'Review'];
const TYPES: { value: LeagueType; label: string; desc: string }[] = [{ value: 'singles', label: 'Singles', desc: 'Individual' }, { value: 'doubles', label: 'Doubles', desc: 'Pairs' }, { value: 'mixed_doubles', label: 'Mixed', desc: 'M/F pairs' }, { value: 'team', label: 'Team', desc: '3+ players' }];
const FORMATS: { value: LeagueFormat; label: string; desc: string }[] = [{ value: 'ladder', label: '🪜 Ladder', desc: 'Challenge up' }, { value: 'round_robin', label: '🔄 Round Robin', desc: 'Play all' }, { value: 'swiss', label: '🎯 Swiss', desc: 'By record' }, { value: 'box_league', label: '📦 Box', desc: 'Groups' }];
const ENTRY_OPTS: { v: ScoreEntryPermission; l: string; d: string }[] = [{ v: 'either_participant', l: 'Either Participant', d: 'Any player can submit' }, { v: 'winner_only', l: 'Winner Only', d: 'Only winner submits' }, { v: 'organizer_only', l: 'Organizer Only', d: 'Only organizer enters' }];
const CONFIRM_OPTS: { v: ScoreConfirmation; l: string; d: string }[] = [{ v: 'always_required', l: 'Always Required', d: 'Must confirm every score' }, { v: 'auto_confirm_24h', l: 'Auto (24h)', d: 'Auto-confirm after 24h' }, { v: 'auto_confirm_48h', l: 'Auto (48h)', d: 'Auto-confirm after 48h' }, { v: 'auto_confirm_72h', l: 'Auto (72h)', d: 'Auto-confirm after 72h' }, { v: 'no_confirmation', l: 'No Confirmation', d: 'Immediate (trust)' }];
const DETAIL_OPTS: { v: ScoreDetailLevel; l: string; d: string; ex: string }[] = [{ v: 'win_loss_only', l: 'Win/Loss Only', d: 'Just winner', ex: 'Allan won' }, { v: 'games_only', l: 'Games Only', d: 'Games count', ex: '2-1' }, { v: 'full_scores', l: 'Full Scores', d: 'All points', ex: '11-7, 9-11, 11-5' }];
const DISPUTE_OPTS: { v: DisputeResolution; l: string; d: string }[] = [{ v: 'organizer_decides', l: 'Organizer Decides', d: 'Organizer reviews & decides' }, { v: 'match_replayed', l: 'Match Replayed', d: 'Must replay match' }, { v: 'both_lose', l: 'Both Lose', d: 'Both get a loss' }];
const DUPR_OPTS: { v: DuprSyncMode; l: string; d: string }[] = [{ v: 'auto_submit', l: 'Auto-Submit', d: 'Auto sync to DUPR' }, { v: 'batch_sync', l: 'Batch Sync', d: 'Organizer triggers sync' }, { v: 'manual_submit', l: 'Manual', d: 'Players submit manually' }, { v: 'no_dupr', l: 'No DUPR', d: 'No integration' }];

export const CreateLeague: React.FC<CreateLeagueProps> = ({ onBack, onCreated }) => {
  const { currentUser, userProfile } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clubs, setClubs] = useState<Club[]>([]);
  const hasStripe = userProfile?.stripeConnectedAccountId && userProfile?.stripeChargesEnabled;

  const [basic, setBasic] = useState({ name: '', description: '', type: 'singles' as LeagueType, format: 'ladder' as LeagueFormat, clubId: '', location: '', venue: '', visibility: 'public' as 'public' | 'private' | 'club_only' });
  const [sched, setSched] = useState({ seasonStart: '', seasonEnd: '', registrationOpens: '', registrationDeadline: '' });
  const [hasDivs, setHasDivs] = useState(false);
  const [divs, setDivs] = useState<DivisionDraft[]>([]);
  const [singleDiv, setSingleDiv] = useState<DivisionDraft>({ id: 'default', name: 'Open', type: 'singles', gender: 'open', minRating: null, maxRating: null, minAge: null, maxAge: null, maxParticipants: null });
  const [partner, setPartner] = useState<LeaguePartnerSettings>({ allowInvitePartner: true, allowOpenTeam: true, allowJoinOpen: true, partnerLockRule: 'registration_close', partnerLockWeek: null, allowSubstitutes: false, teamNameMode: 'auto' });
  const [scoring, setScoring] = useState({ pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0, pointsForForfeit: -1, pointsForNoShow: -2 });
  const [matchFmt, setMatchFmt] = useState<LeagueMatchFormat>({ bestOf: 3, gamesTo: 11, winBy: 2, allowDraw: false });
  const [challenge, setChallenge] = useState<LeagueChallengeRules>({ challengeRange: 3, responseDeadlineHours: 48, completionDeadlineDays: 7, forfeitOnDecline: false, maxActiveChallenges: 2, cooldownDays: 7 });
  const [rr, setRR] = useState<LeagueRoundRobinSettings>({ rounds: 1, matchesPerWeek: 2, scheduleGeneration: 'auto' });
  const [swiss] = useState<LeagueSwissSettings>({ rounds: 5, pairingMethod: 'adjacent' });
  const [box] = useState<LeagueBoxSettings>({ playersPerBox: 4, promotionSpots: 1, relegationSpots: 1, roundsPerBox: 1 });
  const [tiebreakers] = useState<LeagueTiebreaker[]>(['head_to_head', 'game_diff', 'games_won']);
  const [scoreRep, setScoreRep] = useState({ matchDeadlineDays: 7 });
  const [scoreEntry, setScoreEntry] = useState<ScoreEntrySettings>({ entryPermission: 'either_participant', confirmationRequired: 'auto_confirm_48h', detailLevel: 'full_scores', disputeResolution: 'organizer_decides', duprSync: 'manual_submit' });
  const [pricingOn, setPricingOn] = useState(false);
  const [price, setPrice] = useState({ entryFee: 2000, entryFeeType: 'per_player' as 'per_player' | 'per_team', memberDiscount: 0, earlyBirdEnabled: false, earlyBirdFee: 1500, lateFeeEnabled: false, lateFee: 500, prizePool: { enabled: false, type: 'none' as 'none' | 'fixed' | 'percentage', amount: 0, distribution: { first: 60, second: 30, third: 10, fourth: 0 } }, feesPaidBy: 'player' as 'player' | 'organizer', refundPolicy: 'full' as 'full' | 'partial' | 'none' });

  useEffect(() => { if (currentUser) getClubsForUser(currentUser.uid).then(setClubs).catch(console.error); }, [currentUser]);
  useEffect(() => { setSingleDiv(p => ({ ...p, type: basic.type === 'mixed_doubles' ? 'doubles' : basic.type as EventType })); }, [basic.type]);

  const club = clubs.find(c => c.id === basic.clubId);
  const clubStripe = club?.stripeConnectedAccountId && club?.stripeChargesEnabled;
  const canPay = hasStripe || clubStripe;
  const isDoubles = basic.type === 'doubles' || basic.type === 'mixed_doubles';
  const fmtCur = (c: number) => `$${(c / 100).toFixed(2)}`;
  const parseCur = (v: string) => Math.round((parseFloat(v.replace(/[^0-9.]/g, '')) || 0) * 100);

  const validate = (s: number): string | null => {
    if (s === 1 && !basic.name.trim()) return 'Name required';
    if (s === 2 && (!sched.seasonStart || !sched.seasonEnd)) return 'Dates required';
    if (s === 2 && new Date(sched.seasonEnd) <= new Date(sched.seasonStart)) return 'End after start';
    if (s === 3 && hasDivs && divs.length === 0) return 'Add division';
    if (s === 6 && pricingOn && price.entryFee < 100) return 'Min $1.00';
    return null;
  };

  const addDiv = () => setDivs([...divs, { id: `div_${Date.now()}`, name: `Division ${divs.length + 1}`, type: basic.type as EventType, gender: 'open', minRating: null, maxRating: null, minAge: null, maxAge: null, maxParticipants: null }]);
  const updDiv = (id: string, u: Partial<DivisionDraft>) => setDivs(divs.map(d => d.id === id ? { ...d, ...u } : d));
  const delDiv = (id: string) => setDivs(divs.filter(d => d.id !== id));

  const submit = async () => {
    if (!currentUser || !userProfile) return;
    for (let i = 1; i <= 6; i++) { const e = validate(i); if (e) { setError(e); setStep(i); return; } }
    setError(null); setLoading(true);
    try {
      const settings: LeagueSettings = {
        minRating: hasDivs ? null : singleDiv.minRating, maxRating: hasDivs ? null : singleDiv.maxRating,
        minAge: hasDivs ? null : singleDiv.minAge, maxAge: hasDivs ? null : singleDiv.maxAge,
        maxMembers: hasDivs ? null : singleDiv.maxParticipants,
        pointsForWin: scoring.pointsForWin, pointsForDraw: scoring.pointsForDraw, pointsForLoss: scoring.pointsForLoss,
        pointsForForfeit: scoring.pointsForForfeit, pointsForNoShow: scoring.pointsForNoShow,
        matchFormat: matchFmt, matchDeadlineDays: scoreRep.matchDeadlineDays,
        allowSelfReporting: scoreEntry.entryPermission !== 'organizer_only',
        requireConfirmation: scoreEntry.confirmationRequired !== 'no_confirmation',
        tiebreakers, scoreEntrySettings: scoreEntry,
      };
      if (basic.format === 'ladder') settings.challengeRules = challenge;
      else if (basic.format === 'round_robin') settings.roundRobinSettings = rr;
      else if (basic.format === 'swiss') settings.swissSettings = swiss;
      else if (basic.format === 'box_league') settings.boxSettings = box;
      if (isDoubles) settings.partnerSettings = partner;

      const pricing: LeaguePricing | null = pricingOn ? {
        enabled: true, entryFee: price.entryFee, entryFeeType: price.entryFeeType, memberDiscount: price.memberDiscount,
        earlyBirdEnabled: price.earlyBirdEnabled, earlyBirdFee: price.earlyBirdFee,
        earlyBirdDeadline: price.earlyBirdEnabled && sched.registrationDeadline ? new Date(sched.registrationDeadline).getTime() - 604800000 : null,
        lateFeeEnabled: price.lateFeeEnabled, lateFee: price.lateFee,
        lateRegistrationStart: price.lateFeeEnabled && sched.registrationDeadline ? new Date(sched.registrationDeadline).getTime() - 259200000 : null,
        prizePool: price.prizePool, feesPaidBy: price.feesPaidBy, refundPolicy: price.refundPolicy,
        refundDeadline: sched.seasonStart ? new Date(sched.seasonStart).getTime() : null, currency: 'nzd',
      } : null;

      const stripeId = basic.clubId && clubStripe ? club?.stripeConnectedAccountId : hasStripe ? userProfile.stripeConnectedAccountId : null;

      const leagueId = await createLeague({
        name: basic.name.trim(), description: basic.description.trim(), type: basic.type, format: basic.format,
        clubId: basic.clubId || null, clubName: club?.name || null, createdByUserId: currentUser.uid,
        organizerName: userProfile.displayName || userProfile.email,
        seasonStart: new Date(sched.seasonStart).getTime(), seasonEnd: new Date(sched.seasonEnd).getTime(),
        registrationOpens: sched.registrationOpens ? new Date(sched.registrationOpens).getTime() : null,
        registrationDeadline: sched.registrationDeadline ? new Date(sched.registrationDeadline).getTime() : null,
        pricing, organizerStripeAccountId: stripeId, status: 'draft', settings,
        location: basic.location || null, venue: basic.venue || null, visibility: basic.visibility,
        memberCount: 0, matchesPlayed: 0, hasDivisions: hasDivs, createdAt: Date.now(), updatedAt: Date.now(),
      });

      if (hasDivs) for (let i = 0; i < divs.length; i++) {
        const d = divs[i];
        await createLeagueDivision({ id: '', leagueId, name: d.name, type: d.type, gender: d.gender, minRating: d.minRating, maxRating: d.maxRating, minAge: d.minAge, maxAge: d.maxAge, maxParticipants: d.maxParticipants, registrationOpen: true, order: i, createdAt: Date.now(), updatedAt: Date.now() });
      }
      onCreated(leagueId);
    } catch (e: any) { setError(e.message || 'Failed'); } finally { setLoading(false); }
  };

  const Step1 = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Basic Info</h2>
      <div><label className="block text-sm text-gray-400 mb-1">Name *</label><input type="text" value={basic.name} onChange={e => setBasic({ ...basic, name: e.target.value })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg" placeholder="League name"/></div>
      <div><label className="block text-sm text-gray-400 mb-1">Description</label><textarea value={basic.description} onChange={e => setBasic({ ...basic, description: e.target.value })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg min-h-[60px]" placeholder="Description"/></div>
      <div><label className="block text-sm text-gray-400 mb-2">Type *</label><div className="grid grid-cols-2 gap-2">{TYPES.map(t => <label key={t.value} className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer ${basic.type === t.value ? 'bg-blue-900/30 border-blue-500' : 'bg-gray-900 border-gray-700'}`}><input type="radio" checked={basic.type === t.value} onChange={() => setBasic({ ...basic, type: t.value })} className="accent-blue-500"/><div><div className="text-white font-medium">{t.label}</div><div className="text-xs text-gray-500">{t.desc}</div></div></label>)}</div></div>
      <div><label className="block text-sm text-gray-400 mb-2">Format *</label><div className="grid grid-cols-2 gap-2">{FORMATS.map(f => <label key={f.value} className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer ${basic.format === f.value ? 'bg-blue-900/30 border-blue-500' : 'bg-gray-900 border-gray-700'}`}><input type="radio" checked={basic.format === f.value} onChange={() => setBasic({ ...basic, format: f.value })} className="accent-blue-500"/><div><div className="text-white font-medium">{f.label}</div><div className="text-xs text-gray-500">{f.desc}</div></div></label>)}</div></div>
      {clubs.length > 0 && <div><label className="block text-sm text-gray-400 mb-1">Club</label><select value={basic.clubId} onChange={e => setBasic({ ...basic, clubId: e.target.value })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg"><option value="">Independent</option>{clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
      <div className="grid grid-cols-2 gap-3"><div><label className="block text-sm text-gray-400 mb-1">Location</label><input type="text" value={basic.location} onChange={e => setBasic({ ...basic, location: e.target.value })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg" placeholder="City"/></div><div><label className="block text-sm text-gray-400 mb-1">Venue</label><input type="text" value={basic.venue} onChange={e => setBasic({ ...basic, venue: e.target.value })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg" placeholder="Venue"/></div></div>
      <div><label className="block text-sm text-gray-400 mb-1">Visibility</label><select value={basic.visibility} onChange={e => setBasic({ ...basic, visibility: e.target.value as any })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg"><option value="public">Public</option><option value="private">Private</option><option value="club_only">Club Only</option></select></div>
    </div>
  );

  const Step2 = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Schedule</h2>
      <div className="grid grid-cols-2 gap-3"><div><label className="block text-sm text-gray-400 mb-1">Start *</label><input type="date" value={sched.seasonStart} onChange={e => setSched({ ...sched, seasonStart: e.target.value })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg"/></div><div><label className="block text-sm text-gray-400 mb-1">End *</label><input type="date" value={sched.seasonEnd} onChange={e => setSched({ ...sched, seasonEnd: e.target.value })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg"/></div></div>
      <div className="grid grid-cols-2 gap-3"><div><label className="block text-sm text-gray-400 mb-1">Reg Opens</label><input type="date" value={sched.registrationOpens} onChange={e => setSched({ ...sched, registrationOpens: e.target.value })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg"/></div><div><label className="block text-sm text-gray-400 mb-1">Reg Deadline</label><input type="date" value={sched.registrationDeadline} onChange={e => setSched({ ...sched, registrationDeadline: e.target.value })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg"/></div></div>
    </div>
  );

  const Step3 = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Divisions</h2>
      <label className="flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-700 cursor-pointer"><div><div className="font-semibold text-white">Multiple Divisions</div><div className="text-sm text-gray-400">A/B grades</div></div><button onClick={() => setHasDivs(!hasDivs)} className={`w-12 h-6 rounded-full ${hasDivs ? 'bg-blue-600' : 'bg-gray-600'}`}><div className={`w-5 h-5 bg-white rounded-full transition-transform ${hasDivs ? 'translate-x-6' : 'translate-x-1'}`}/></button></label>
      {!hasDivs ? (
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-3">
          <h3 className="font-semibold text-white">Restrictions</h3>
          <div className="grid grid-cols-2 gap-3"><div><label className="block text-xs text-gray-500">Min Rating</label><input type="number" step="0.1" value={singleDiv.minRating || ''} onChange={e => setSingleDiv({ ...singleDiv, minRating: e.target.value ? parseFloat(e.target.value) : null })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600" placeholder="Any"/></div><div><label className="block text-xs text-gray-500">Max Rating</label><input type="number" step="0.1" value={singleDiv.maxRating || ''} onChange={e => setSingleDiv({ ...singleDiv, maxRating: e.target.value ? parseFloat(e.target.value) : null })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600" placeholder="Any"/></div><div><label className="block text-xs text-gray-500">Min Age</label><input type="number" value={singleDiv.minAge || ''} onChange={e => setSingleDiv({ ...singleDiv, minAge: e.target.value ? parseInt(e.target.value) : null })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600" placeholder="Any"/></div><div><label className="block text-xs text-gray-500">Max Players</label><input type="number" value={singleDiv.maxParticipants || ''} onChange={e => setSingleDiv({ ...singleDiv, maxParticipants: e.target.value ? parseInt(e.target.value) : null })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600" placeholder="∞"/></div></div>
        </div>
      ) : (
        <div className="space-y-2">
          {divs.map(d => <div key={d.id} className="bg-gray-800 p-3 rounded-lg border border-gray-700"><div className="flex justify-between mb-2"><input type="text" value={d.name} onChange={e => updDiv(d.id, { name: e.target.value })} className="bg-gray-900 text-white px-2 py-1 rounded border border-gray-600 font-semibold"/><button onClick={() => delDiv(d.id)} className="text-red-400 text-sm">Remove</button></div><div className="grid grid-cols-4 gap-2"><input type="number" step="0.1" value={d.minRating || ''} onChange={e => updDiv(d.id, { minRating: e.target.value ? parseFloat(e.target.value) : null })} placeholder="Min" className="bg-gray-900 text-white p-2 rounded border border-gray-600 text-sm"/><input type="number" step="0.1" value={d.maxRating || ''} onChange={e => updDiv(d.id, { maxRating: e.target.value ? parseFloat(e.target.value) : null })} placeholder="Max" className="bg-gray-900 text-white p-2 rounded border border-gray-600 text-sm"/><input type="number" value={d.maxParticipants || ''} onChange={e => updDiv(d.id, { maxParticipants: e.target.value ? parseInt(e.target.value) : null })} placeholder="Cap" className="bg-gray-900 text-white p-2 rounded border border-gray-600 text-sm"/><select value={d.gender} onChange={e => updDiv(d.id, { gender: e.target.value as GenderCategory })} className="bg-gray-900 text-white p-2 rounded border border-gray-600 text-sm"><option value="open">Open</option><option value="men">Men</option><option value="women">Women</option></select></div></div>)}
          <button onClick={addDiv} className="w-full p-3 border-2 border-dashed border-gray-600 rounded-lg text-gray-400 hover:border-blue-500">+ Add Division</button>
        </div>
      )}
    </div>
  );

  const Step4 = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Partner Settings</h2>
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-2">
        {[{ k: 'allowInvitePartner', l: 'Invite Partner' }, { k: 'allowOpenTeam', l: 'Create Open Team' }, { k: 'allowJoinOpen', l: 'Join Open Teams' }].map(o => <label key={o.k} className="flex items-center justify-between p-3 bg-gray-900 rounded-lg cursor-pointer"><span className="text-white">{o.l}</span><input type="checkbox" checked={(partner as any)[o.k]} onChange={e => setPartner({ ...partner, [o.k]: e.target.checked })} className="w-5 h-5 accent-blue-500"/></label>)}
      </div>
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-2">
        <h3 className="font-semibold text-white">Lock Rule</h3>
        {[{ v: 'registration_close', l: 'At reg close' }, { v: 'anytime', l: 'Anytime' }, { v: 'after_week', l: 'After week' }].map(o => <label key={o.v} className="flex items-center gap-2 p-2 bg-gray-900 rounded cursor-pointer"><input type="radio" checked={partner.partnerLockRule === o.v} onChange={() => setPartner({ ...partner, partnerLockRule: o.v as any })} className="accent-blue-500"/><span className="text-white">{o.l}</span>{o.v === 'after_week' && partner.partnerLockRule === 'after_week' && <input type="number" min="1" value={partner.partnerLockWeek || 2} onChange={e => setPartner({ ...partner, partnerLockWeek: parseInt(e.target.value) })} className="w-14 bg-gray-700 text-white p-1 rounded text-center"/>}</label>)}
      </div>
      <label className="flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-700 cursor-pointer"><span className="text-white font-semibold">Allow Subs</span><input type="checkbox" checked={partner.allowSubstitutes} onChange={e => setPartner({ ...partner, allowSubstitutes: e.target.checked })} className="w-5 h-5 accent-blue-500"/></label>
    </div>
  );

  const Step5 = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Scoring & Rules</h2>
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h3 className="font-semibold text-white mb-2">🏆 Points</h3>
        <div className="grid grid-cols-5 gap-2">{[{ k: 'pointsForWin', l: 'Win' }, { k: 'pointsForDraw', l: 'Draw' }, { k: 'pointsForLoss', l: 'Loss' }, { k: 'pointsForForfeit', l: 'Forfeit' }, { k: 'pointsForNoShow', l: 'No-Show' }].map(p => <div key={p.k}><label className="block text-xs text-gray-500">{p.l}</label><input type="number" value={(scoring as any)[p.k]} onChange={e => setScoring({ ...scoring, [p.k]: parseInt(e.target.value) || 0 })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600 text-center"/></div>)}</div>
      </div>
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h3 className="font-semibold text-white mb-2">🎾 Match Format</h3>
        <div className="grid grid-cols-3 gap-3"><div><label className="block text-xs text-gray-500">Best Of</label><select value={matchFmt.bestOf} onChange={e => setMatchFmt({ ...matchFmt, bestOf: parseInt(e.target.value) as 1|3|5 })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"><option value={1}>1</option><option value={3}>3</option><option value={5}>5</option></select></div><div><label className="block text-xs text-gray-500">Points/Game</label><select value={matchFmt.gamesTo} onChange={e => setMatchFmt({ ...matchFmt, gamesTo: parseInt(e.target.value) as 11|15|21 })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"><option value={11}>11</option><option value={15}>15</option><option value={21}>21</option></select></div><div><label className="block text-xs text-gray-500">Win By</label><select value={matchFmt.winBy} onChange={e => setMatchFmt({ ...matchFmt, winBy: parseInt(e.target.value) as 1|2 })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"><option value={1}>1</option><option value={2}>2</option></select></div></div>
      </div>
      {basic.format === 'ladder' && <div className="bg-gray-800 p-4 rounded-lg border border-gray-700"><h3 className="font-semibold text-white mb-2">🪜 Ladder</h3><div className="grid grid-cols-2 gap-3"><div><label className="block text-xs text-gray-500">Challenge Range</label><input type="number" value={challenge.challengeRange} onChange={e => setChallenge({ ...challenge, challengeRange: parseInt(e.target.value) })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600" min="1"/></div><div><label className="block text-xs text-gray-500">Response Hours</label><input type="number" value={challenge.responseDeadlineHours} onChange={e => setChallenge({ ...challenge, responseDeadlineHours: parseInt(e.target.value) })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"/></div></div></div>}
      {basic.format === 'round_robin' && <div className="bg-gray-800 p-4 rounded-lg border border-gray-700"><h3 className="font-semibold text-white mb-2">🔄 Round Robin</h3><div className="grid grid-cols-2 gap-3"><div><label className="block text-xs text-gray-500">Rounds</label><select value={rr.rounds} onChange={e => setRR({ ...rr, rounds: parseInt(e.target.value) })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"><option value={1}>Single</option><option value={2}>Double</option></select></div><div><label className="block text-xs text-gray-500">Matches/Week</label><input type="number" value={rr.matchesPerWeek} onChange={e => setRR({ ...rr, matchesPerWeek: parseInt(e.target.value) })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"/></div></div></div>}
      
      {/* NEW V05.33: Score Entry Settings */}
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h3 className="font-semibold text-white mb-3">📝 Score Entry</h3>
        <div className="space-y-3">
          <div><label className="block text-sm text-gray-400 mb-1">Who Enters Scores</label><select value={scoreEntry.entryPermission} onChange={e => setScoreEntry({ ...scoreEntry, entryPermission: e.target.value as ScoreEntryPermission })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600">{ENTRY_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select><p className="text-xs text-gray-500 mt-1">{ENTRY_OPTS.find(o => o.v === scoreEntry.entryPermission)?.d}</p></div>
          <div><label className="block text-sm text-gray-400 mb-1">Score Detail</label><select value={scoreEntry.detailLevel} onChange={e => setScoreEntry({ ...scoreEntry, detailLevel: e.target.value as ScoreDetailLevel })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600">{DETAIL_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select><p className="text-xs text-gray-500 mt-1">{DETAIL_OPTS.find(o => o.v === scoreEntry.detailLevel)?.d} • Example: <span className="text-gray-400">{DETAIL_OPTS.find(o => o.v === scoreEntry.detailLevel)?.ex}</span></p></div>
          <div><label className="block text-sm text-gray-400 mb-1">Confirmation</label><select value={scoreEntry.confirmationRequired} onChange={e => setScoreEntry({ ...scoreEntry, confirmationRequired: e.target.value as ScoreConfirmation })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600">{CONFIRM_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select><p className="text-xs text-gray-500 mt-1">{CONFIRM_OPTS.find(o => o.v === scoreEntry.confirmationRequired)?.d}</p></div>
        </div>
      </div>
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h3 className="font-semibold text-white mb-2">⚖️ Disputes</h3>
        <select value={scoreEntry.disputeResolution} onChange={e => setScoreEntry({ ...scoreEntry, disputeResolution: e.target.value as DisputeResolution })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600">{DISPUTE_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
        <p className="text-xs text-gray-500 mt-1">{DISPUTE_OPTS.find(o => o.v === scoreEntry.disputeResolution)?.d}</p>
      </div>
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h3 className="font-semibold text-white mb-2">🏓 DUPR Integration</h3>
        <select value={scoreEntry.duprSync} onChange={e => setScoreEntry({ ...scoreEntry, duprSync: e.target.value as DuprSyncMode })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600">{DUPR_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
        <p className="text-xs text-gray-500 mt-1">{DUPR_OPTS.find(o => o.v === scoreEntry.duprSync)?.d}</p>
        {scoreEntry.duprSync === 'auto_submit' && <div className="mt-2 p-2 bg-green-900/20 border border-green-600/30 rounded text-sm text-green-400">✓ Scores auto-sync to DUPR</div>}
        {scoreEntry.duprSync === 'batch_sync' && <div className="mt-2 p-2 bg-blue-900/20 border border-blue-600/30 rounded text-sm text-blue-400">ℹ️ Sync from dashboard</div>}
      </div>
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h3 className="font-semibold text-white mb-2">⏰ Match Deadline</h3>
        <div><label className="block text-xs text-gray-500">Days to Complete</label><input type="number" value={scoreRep.matchDeadlineDays} onChange={e => setScoreRep({ ...scoreRep, matchDeadlineDays: parseInt(e.target.value) || 7 })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600" min="1" max="30"/></div>
      </div>
    </div>
  );

  const Step6 = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Payments</h2>
      {!canPay ? <div className="bg-yellow-900/20 border border-yellow-600 rounded-lg p-4"><h3 className="font-semibold text-yellow-400">⚠️ Stripe Not Connected</h3><p className="text-sm text-gray-300 mt-1">Connect Stripe to accept payments</p></div> : <>
        <label className="flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-700 cursor-pointer"><div><div className="font-semibold text-white">Charge Entry Fee</div></div><button onClick={() => setPricingOn(!pricingOn)} className={`w-12 h-6 rounded-full ${pricingOn ? 'bg-blue-600' : 'bg-gray-600'}`}><div className={`w-5 h-5 bg-white rounded-full transition-transform ${pricingOn ? 'translate-x-6' : 'translate-x-1'}`}/></button></label>
        {pricingOn && <>
          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700"><div className="grid grid-cols-2 gap-3"><div><label className="block text-xs text-gray-500">Amount</label><div className="relative"><span className="absolute left-2 top-2 text-gray-400">$</span><input type="text" value={(price.entryFee / 100).toFixed(2)} onChange={e => setPrice({ ...price, entryFee: parseCur(e.target.value) })} className="w-full bg-gray-900 text-white p-2 pl-6 rounded border border-gray-600"/></div></div><div><label className="block text-xs text-gray-500">Per</label><select value={price.entryFeeType} onChange={e => setPrice({ ...price, entryFeeType: e.target.value as any })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"><option value="per_player">Player</option><option value="per_team">Team</option></select></div></div></div>
          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-2">
            <label className="flex items-center justify-between p-2 bg-gray-900 rounded cursor-pointer"><span className="text-white">Early Bird</span><input type="checkbox" checked={price.earlyBirdEnabled} onChange={e => setPrice({ ...price, earlyBirdEnabled: e.target.checked })} className="w-5 h-5 accent-blue-500"/></label>
            {price.earlyBirdEnabled && <div className="pl-4"><div className="relative w-28"><span className="absolute left-2 top-2 text-gray-400">$</span><input type="text" value={(price.earlyBirdFee / 100).toFixed(2)} onChange={e => setPrice({ ...price, earlyBirdFee: parseCur(e.target.value) })} className="w-full bg-gray-900 text-white p-2 pl-6 rounded border border-gray-600"/></div></div>}
            <label className="flex items-center justify-between p-2 bg-gray-900 rounded cursor-pointer"><span className="text-white">Late Fee</span><input type="checkbox" checked={price.lateFeeEnabled} onChange={e => setPrice({ ...price, lateFeeEnabled: e.target.checked })} className="w-5 h-5 accent-blue-500"/></label>
            {price.lateFeeEnabled && <div className="pl-4"><div className="relative w-28"><span className="absolute left-2 top-2 text-gray-400">$</span><input type="text" value={(price.lateFee / 100).toFixed(2)} onChange={e => setPrice({ ...price, lateFee: parseCur(e.target.value) })} className="w-full bg-gray-900 text-white p-2 pl-6 rounded border border-gray-600"/></div></div>}
          </div>
          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700"><div className="grid grid-cols-2 gap-3"><div><label className="block text-xs text-gray-500">Fees Paid By</label><select value={price.feesPaidBy} onChange={e => setPrice({ ...price, feesPaidBy: e.target.value as any })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"><option value="player">Player</option><option value="organizer">Organizer</option></select></div><div><label className="block text-xs text-gray-500">Refund</label><select value={price.refundPolicy} onChange={e => setPrice({ ...price, refundPolicy: e.target.value as any })} className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"><option value="full">Full</option><option value="partial">50%</option><option value="none">None</option></select></div></div></div>
        </>}
      </>}
    </div>
  );

  const Step7 = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Review</h2>
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700"><h3 className="font-semibold text-white mb-2">📋 Basic</h3><div className="grid grid-cols-2 gap-1 text-sm"><span className="text-gray-400">Name:</span><span className="text-white">{basic.name}</span><span className="text-gray-400">Type:</span><span className="text-white">{basic.type}</span><span className="text-gray-400">Format:</span><span className="text-white">{basic.format}</span></div></div>
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700"><h3 className="font-semibold text-white mb-2">📅 Schedule</h3><div className="text-sm"><span className="text-gray-400">Season:</span> <span className="text-white">{sched.seasonStart} → {sched.seasonEnd}</span></div></div>
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700"><h3 className="font-semibold text-white mb-2">🎯 Scoring</h3><div className="text-sm text-white">W:{scoring.pointsForWin} D:{scoring.pointsForDraw} L:{scoring.pointsForLoss}</div><div className="text-sm text-gray-400">Best of {matchFmt.bestOf}, to {matchFmt.gamesTo}</div></div>
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700"><h3 className="font-semibold text-white mb-2">📝 Score Entry</h3><div className="grid grid-cols-2 gap-1 text-sm"><span className="text-gray-400">Who:</span><span className="text-white">{ENTRY_OPTS.find(o => o.v === scoreEntry.entryPermission)?.l}</span><span className="text-gray-400">Detail:</span><span className="text-white">{DETAIL_OPTS.find(o => o.v === scoreEntry.detailLevel)?.l}</span><span className="text-gray-400">Confirm:</span><span className="text-white">{CONFIRM_OPTS.find(o => o.v === scoreEntry.confirmationRequired)?.l}</span><span className="text-gray-400">Disputes:</span><span className="text-white">{DISPUTE_OPTS.find(o => o.v === scoreEntry.disputeResolution)?.l}</span><span className="text-gray-400">DUPR:</span><span className="text-white">{DUPR_OPTS.find(o => o.v === scoreEntry.duprSync)?.l}</span></div></div>
      {pricingOn && <div className="bg-gray-800 p-4 rounded-lg border border-gray-700"><h3 className="font-semibold text-white mb-2">💰 Payment</h3><div className="text-sm text-white">{fmtCur(price.entryFee)} per {price.entryFeeType === 'per_team' ? 'team' : 'player'}</div></div>}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-6"><button onClick={onBack} className="text-gray-400 hover:text-white">← Back</button><h1 className="text-2xl font-bold text-white">Create League</h1></div>
      <div className="flex items-center justify-center mb-6 overflow-x-auto">{STEPS.map((t, i) => { const n = i + 1, active = step === n, done = step > n, skip = n === 4 && !isDoubles; return (<React.Fragment key={n}><div className="flex flex-col items-center min-w-[40px]"><div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${skip ? 'bg-gray-700 text-gray-500' : active ? 'bg-blue-600 text-white' : done ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400'}`}>{done ? '✓' : n}</div><span className={`text-xs mt-1 hidden md:block ${active ? 'text-blue-400' : 'text-gray-500'}`}>{t}</span></div>{n < 7 && <div className={`w-4 md:w-6 h-0.5 ${step > n ? 'bg-green-600' : 'bg-gray-700'}`}/>}</React.Fragment>); })}</div>
      {error && <div className="bg-red-900/20 border border-red-600 rounded-lg p-3 mb-4 text-red-400">{error}</div>}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 mb-4">{step === 1 && <Step1/>}{step === 2 && <Step2/>}{step === 3 && <Step3/>}{step === 4 && (isDoubles ? <Step4/> : <div className="text-center py-8 text-gray-400">Partner settings for doubles only</div>)}{step === 5 && <Step5/>}{step === 6 && <Step6/>}{step === 7 && <Step7/>}</div>
      <div className="flex justify-between"><button onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1} className="px-6 py-2 text-gray-400 hover:text-white disabled:opacity-30">← Prev</button>{step < 7 ? <button onClick={() => { const e = validate(step); if (e) setError(e); else { setError(null); setStep(step === 3 && !isDoubles ? 5 : step + 1); } }} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-semibold">Next →</button> : <button onClick={submit} disabled={loading} className="bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white px-8 py-2 rounded-lg font-semibold">{loading ? '⏳...' : '✓ Create'}</button>}</div>
    </div>
  );
};

export default CreateLeague;