
import React, { useState, useEffect } from 'react';
import type { Tournament, Registration, UserProfile, Division, Team } from '../../types';
import {
    getRegistration,
    saveRegistration,
    finalizeRegistration,
    subscribeToDivisions,
    getUserTeamsForTournament,
    withdrawPlayerFromDivision
} from '../../services/firebase';
import { DoublesPartnerStep } from './DoublesPartnerStep';

interface WizardProps {
    tournament: Tournament;
    userProfile: UserProfile;
    onClose: () => void;
    onComplete: () => void;

    initialDivisionId?: string;
    mode?: 'full' | 'waiver_only';
}

// helper to calculate age
const getAge = (birthDateString?: string) => {
    if (!birthDateString) return null;
    const today = new Date();
    const birthDate = new Date(birthDateString);
    if (isNaN(birthDate.getTime())) return null;

    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
};

const checkEligibility = (div: Division, user: UserProfile): { eligible: boolean; reason?: string } => {
    if (div.gender === 'men' && user.gender !== 'male') return { eligible: false, reason: 'Men only' };
    if (div.gender === 'women' && user.gender !== 'female') return { eligible: false, reason: 'Women only' };

    const age = getAge(user.birthDate);
    if (div.minAge || div.maxAge) {
        if (age === null) return { eligible: false, reason: 'Profile missing Birth Date' };
        if (div.minAge && age < div.minAge) return { eligible: false, reason: `Too young (Age ${age} < ${div.minAge})` };
        if (div.maxAge && age > div.maxAge) return { eligible: false, reason: `Too old (Age ${age} > ${div.maxAge})` };
    }

    const userRating = div.type === 'doubles' ? user.duprDoublesRating : user.duprSinglesRating;
    if (div.minRating || div.maxRating) {
        if (userRating === undefined || userRating === null) return { eligible: false, reason: 'Profile missing DUPR Rating' };
        if (div.minRating && userRating < div.minRating) return { eligible: false, reason: `Rating too low (${userRating.toFixed(2)} < ${div.minRating})` };
        if (div.maxRating && userRating > div.maxRating) return { eligible: false, reason: `Rating too high (${userRating.toFixed(2)} > ${div.maxRating})` };
    }
    return { eligible: true };
};

export const TournamentRegistrationWizard: React.FC<WizardProps> = ({
    tournament,
    userProfile,
    onClose,
    onComplete,
    initialDivisionId,
    mode = 'full'
}) => {
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(true);
    const [regData, setRegData] = useState<Registration | null>(null);
    const [divisions, setDivisions] = useState<Division[]>([]);
    const [partnerDetails, setPartnerDetails] = useState<Registration['partnerDetails']>({});
    const [existingTeamsByDivision, setExistingTeamsByDivision] = useState<Record<string, Team>>({});
    const [error, setError] = useState<string | null>(null);
    
    // Modal state for confirmation
    const [withdrawConfirmationId, setWithdrawConfirmationId] = useState<string | null>(null);

    const isWaiverOnly = mode === 'waiver_only' && !!initialDivisionId;

    useEffect(() => {
        const unsub = subscribeToDivisions(tournament.id, setDivisions);

        const loadExisting = async () => {
            const teams = await getUserTeamsForTournament(tournament.id, userProfile.id, 'tournament');
            const map: Record<string, Team> = {};
            teams.forEach(t => { map[t.divisionId] = t; });
            setExistingTeamsByDivision(map);
        };
        loadExisting();

        const initReg = async () => {
            if (!userProfile?.id) return;
            let reg = await getRegistration(tournament.id, userProfile.id);
            if (!reg) {
                reg = {
                    id: `${userProfile.id}_${tournament.id}`,
                    tournamentId: tournament.id,
                    playerId: userProfile.id,
                    status: 'in_progress',
                    waiverAccepted: false,
                    selectedEventIds: initialDivisionId ? [initialDivisionId] : [],
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                };
                await saveRegistration(reg);
            }
            setRegData(reg);
            if (reg.partnerDetails) setPartnerDetails(reg.partnerDetails);
            setLoading(false);
        };
        initReg();
        return () => unsub();
    }, [tournament.id, userProfile.id, initialDivisionId]);

    const handleSave = async (updates: Partial<Registration>) => {
        if (!regData) return;
        const updated = { ...regData, ...updates };
        setRegData(updated);
        await saveRegistration(updated);
    };

    const executeWithdraw = async () => {
        if (!withdrawConfirmationId) return;
        const divisionId = withdrawConfirmationId;
        setWithdrawConfirmationId(null); // Close modal
        
        setLoading(true);
        try {
            await withdrawPlayerFromDivision(tournament.id, divisionId, userProfile.id);
            
            // Optimistic update: Remove from local state immediately to reflect in UI
            setExistingTeamsByDivision(prev => {
                const next = { ...prev };
                delete next[divisionId];
                return next;
            });
            
            setRegData(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    selectedEventIds: prev.selectedEventIds.filter(id => id !== divisionId),
                    partnerDetails: { ...prev.partnerDetails, [divisionId]: undefined } // clear partner details
                };
            });

            // Re-fetch to be safe
            const teams = await getUserTeamsForTournament(tournament.id, userProfile.id, 'tournament');
            const map: Record<string, Team> = {};
            teams.forEach(t => { map[t.divisionId] = t; });
            setExistingTeamsByDivision(map);

            const updatedReg = await getRegistration(tournament.id, userProfile.id);
            if (updatedReg) {
                 setRegData(updatedReg);
                 setPartnerDetails(updatedReg.partnerDetails || {});
            }
        } catch (e) {
            console.error(e);
            setError("Failed to withdraw.");
        } finally {
            setLoading(false);
        }
    };

    // Validate partner choices: return array of division names missing options
    const validatePartnerChoices = (): string[] => {
        if (!regData) return [];
        if (isWaiverOnly) return [];

        const missing: string[] = [];
        for (const divId of regData.selectedEventIds) {
            const div = divisions.find(d => d.id === divId);
            if (!div || div.type !== 'doubles') continue;
            
            // If user is already in a full team for this division, they don't need to select a partner
            const existingTeam = existingTeamsByDivision[div.id];
            if (existingTeam && existingTeam.players && existingTeam.players.length >= 2) continue;

            const details = partnerDetails?.[divId];
            if (!details) {
                missing.push(div.name);
                continue;
            }
            switch (details.mode) {
                case 'invite':
                    // accept partnerUserId OR teamId (teamId when team already exists)
                    if (!details.partnerUserId && !details.teamId) missing.push(div.name);
                    break;
                case 'join_open':
                    if (!details.openTeamId) missing.push(div.name);
                    break;
                case 'open_team':
                default:
                    // ok
                    break;
            }
        }
        return missing;
    };

    const handleFinalize = async () => {
        setError(null);
        if (!regData) return;

        setLoading(true);
        try {
            const payload: Registration = {
                ...(regData as Registration),
                partnerDetails: isWaiverOnly ? (regData.partnerDetails || {}) : (partnerDetails || {}),
                waiverAccepted: true,
                status: 'completed'
            };
            await finalizeRegistration(payload, tournament, userProfile);
            setLoading(false);
            onComplete();
        } catch (e: any) {
            console.error(e);
            setError(e?.message || 'An error occurred during registration.');
            setLoading(false);
        }
    };

    if (loading && !regData) return <div className="fixed inset-0 bg-gray-900/90 flex items-center justify-center text-white z-50">Loading...</div>;
    if (!regData) return null;

    const isRegistrationComplete = regData.status === 'completed';
    
    // Simulate entry fee calculation
    const entryFee = regData.selectedEventIds.length * 45; 

    return (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
            {/* Modal Overlay for Withdrawal Confirmation */}
            {withdrawConfirmationId && (
                <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-[60] rounded-lg p-4 backdrop-blur-sm">
                    <div className="bg-gray-800 p-6 rounded-lg border border-gray-600 shadow-2xl max-w-sm w-full text-center animate-fade-in-up">
                        <h3 className="text-lg font-bold text-white mb-2">Confirm Withdrawal</h3>
                        <p className="text-gray-300 mb-6 text-sm">
                            Are you sure you want to withdraw from <span className="text-white font-semibold">{divisions.find(d => d.id === withdrawConfirmationId)?.name}</span>?
                        </p>
                        <div className="flex justify-center gap-4">
                            <button 
                                onClick={() => setWithdrawConfirmationId(null)}
                                className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={executeWithdraw}
                                className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-white text-sm font-bold shadow-lg transition-colors"
                            >
                                Yes, Withdraw
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-gray-800 w-full max-w-2xl p-6 rounded-lg border border-gray-700 relative flex flex-col max-h-[90vh] shadow-2xl">
                {/* Steps Header */}
                <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4">
                    <h2 className="text-2xl text-white font-bold">
                        {isWaiverOnly ? 'Complete Registration' : 'Tournament Registration'}
                    </h2>
                    <div className="flex gap-2">
                        {[1, 2, 3, 4].map(s => (
                            <div key={s} className={`h-2 w-8 rounded-full ${step >= s ? 'bg-green-500' : 'bg-gray-700'}`} />
                        ))}
                    </div>
                </div>

                <div className="overflow-y-auto flex-grow pr-2">
                    <>
                        {step === 1 && (
                            <div className="space-y-4">
                                <p className="text-gray-300 text-sm">Select the divisions you wish to compete in:</p>
                                
                                <div className="grid gap-3">
                                    {divisions.map(div => {
                                        const { eligible, reason } = checkEligibility(div, userProfile);
                                        const isSelected = regData.selectedEventIds.includes(div.id);
                                        const team = existingTeamsByDivision[div.id];
                                        const hasExistingTeam = !!team;
                                        if (isWaiverOnly && div.id !== initialDivisionId) return null;
                                        return (
                                            <div
                                                key={div.id}
                                                onClick={() => {
                                                    if (isWaiverOnly) return;
                                                    if (!eligible) return;
                                                    if (hasExistingTeam) return; 
                                                    const current = regData.selectedEventIds;
                                                    const next = current.includes(div.id) ? current.filter(x => x !== div.id) : [...current, div.id];
                                                    handleSave({ selectedEventIds: next });
                                                }}
                                                className={`p-4 rounded-xl border flex justify-between items-center transition-all ${!eligible ? 'bg-gray-900 border-gray-800 opacity-60 cursor-not-allowed' : isSelected ? 'bg-green-900/20 border-green-500 cursor-pointer' : 'bg-gray-700/50 border-gray-600 hover:bg-gray-700 cursor-pointer'}`}
                                            >
                                                <div>
                                                    <div className={`font-bold ${isSelected ? 'text-green-400' : 'text-white'}`}>{div.name}</div>
                                                    <div className="text-xs text-gray-400 mt-1 flex gap-2">
                                                        <span className="capitalize">{div.type}</span>
                                                        <span>•</span>
                                                        <span className="capitalize">{div.gender}</span>
                                                        {div.minRating && <span>• {div.minRating}+ Rating</span>}
                                                    </div>
                                                </div>

                                                {!eligible ? (
                                                    <div className="text-xs font-bold text-red-400 border border-red-900 bg-red-900/20 px-2 py-1 rounded whitespace-nowrap">{reason}</div>
                                                ) : hasExistingTeam ? (
                                                    <div className="text-xs font-bold text-gray-300 border border-gray-600 bg-gray-900 px-2 py-1 rounded whitespace-nowrap flex items-center gap-2">
                                                        Registered
                                                        <button
                                                            type="button"
                                                            onMouseDown={(e) => e.stopPropagation()}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setWithdrawConfirmationId(div.id);
                                                            }}
                                                            className="text-red-400 hover:text-red-300 hover:underline ml-1"
                                                        >
                                                            Withdraw
                                                        </button>
                                                    </div>
                                                ) : isSelected ? (
                                                    <div className="text-green-500 font-bold text-xl bg-green-900/30 rounded-full w-8 h-8 flex items-center justify-center border border-green-500">✓</div>
                                                ) : <div className="w-8 h-8 rounded-full border border-gray-500" />}
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-700">
                                    <button onClick={onClose} className="text-gray-400 hover:text-white px-4">Cancel</button>
                                    <button 
                                        onClick={() => { 
                                            if (isWaiverOnly || !regData.selectedEventIds.some(id => divisions.find(d => d.id === id && d.type === 'doubles'))) { 
                                                setStep(3); // Skip partners if no doubles
                                            } else { 
                                                setStep(2); 
                                            } 
                                        }} 
                                        className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-bold shadow-lg"
                                        disabled={regData.selectedEventIds.length === 0}
                                    >
                                        Next: Partners
                                    </button>
                                </div>
                            </div>
                        )}

                        {step === 2 && (
                            <>
                                <div className="mb-4">
                                    <h3 className="text-lg font-bold text-white">Partner Selection</h3>
                                    <p className="text-sm text-gray-400">Choose your partners for doubles events.</p>
                                </div>
                                <DoublesPartnerStep
                                    eventId={tournament.id}
                                    eventContext="tournament"
                                    divisions={divisions}
                                    selectedDivisionIds={regData.selectedEventIds}
                                    userProfile={userProfile}
                                    partnerDetails={partnerDetails}
                                    setPartnerDetails={setPartnerDetails}
                                    existingTeams={existingTeamsByDivision}
                                />

                                <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-700">
                                    <button onClick={() => setStep(1)} className="text-gray-400 hover:text-white px-4">Back</button>
                                    <button 
                                        onClick={() => {
                                            const missing = validatePartnerChoices();
                                            if (missing.length > 0) {
                                                setError(`Missing partners for: ${missing.join(', ')}`);
                                                return;
                                            }
                                            setError(null);
                                            setStep(3);
                                        }} 
                                        className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-bold shadow-lg"
                                    >
                                        Next: Payment
                                    </button>
                                </div>
                                {error && <div className="mt-4 text-red-400 text-center text-sm font-bold bg-red-900/20 p-2 rounded">{error}</div>}
                            </>
                        )}

                        {step === 3 && (
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-lg font-bold text-white">Entry Fee</h3>
                                    <p className="text-sm text-gray-400">Review your summary and complete payment.</p>
                                </div>

                                <div className="bg-gray-900 rounded-xl p-6 border border-gray-700">
                                    <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-800">
                                        <span className="text-gray-400">Registration Fee</span>
                                        <span className="text-white font-bold">${entryFee}.00</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xl font-bold">
                                        <span className="text-white">Total</span>
                                        <span className="text-green-400">${entryFee}.00</span>
                                    </div>
                                </div>

                                <div className="bg-gray-700/30 rounded-xl p-4 border border-gray-600 space-y-3">
                                    <label className="block text-sm font-medium text-gray-300">Card Information (Simulated)</label>
                                    <div className="flex gap-2">
                                        <div className="flex-grow bg-gray-900 border border-gray-600 rounded p-2 flex items-center gap-2">
                                            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                                            <input className="bg-transparent outline-none text-white w-full text-sm" placeholder="0000 0000 0000 0000" defaultValue="4242 4242 4242 4242" />
                                        </div>
                                        <input className="w-20 bg-gray-900 border border-gray-600 rounded p-2 text-white text-center text-sm" placeholder="MM/YY" defaultValue="12/25" />
                                        <input className="w-16 bg-gray-900 border border-gray-600 rounded p-2 text-white text-center text-sm" placeholder="CVC" defaultValue="123" />
                                    </div>
                                </div>

                                <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-700">
                                    <button onClick={() => setStep(2)} className="text-gray-400 hover:text-white px-4">Back</button>
                                    <button 
                                        onClick={() => setStep(4)} 
                                        className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-bold shadow-lg flex items-center gap-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                        Pay & Continue
                                    </button>
                                </div>
                            </div>
                        )}

                        {step === 4 && (
                            <div className="space-y-4">
                                <h3 className="text-lg font-bold text-white">Liability Waiver</h3>
                                <div className="bg-gray-900 p-4 rounded border border-gray-700 h-48 overflow-y-auto text-xs text-gray-400 leading-relaxed">
                                    <p className="mb-2"><strong>PARTICIPANT RELEASE OF LIABILITY, WAIVER OF CLAIMS, ASSUMPTION OF RISKS AND INDEMNITY AGREEMENT</strong></p>
                                    <p className="mb-2">In consideration of being allowed to participate in the pickleball tournament, I hereby acknowledge and agree to the following:</p>
                                    <p className="mb-2">1. I certify that I am physically fit and have no medical condition that would prevent my full participation in this tournament.</p>
                                    <p className="mb-2">2. I acknowledge that pickleball involves physical exertion and risk of injury, including but not limited to slips, falls, and contact with other players or equipment.</p>
                                    <p>3. I hereby release, waive, discharge, and covenant not to sue the tournament organizers, venue owners, and sponsors from any and all liability, claims, demands, actions, or causes of action whatsoever arising out of or related to any loss, damage, or injury, including death, that may be sustained by me.</p>
                                </div>

                                <div className="flex items-start gap-3 p-4 bg-gray-700/20 rounded border border-gray-600">
                                    <input type="checkbox" id="waiver" className="mt-1 w-5 h-5 text-green-600 rounded bg-gray-900 border-gray-600 focus:ring-green-500" />
                                    <label htmlFor="waiver" className="text-sm text-gray-300">
                                        I have read and understand the waiver and release of liability. I am aware that by signing this agreement I am waiving certain legal rights.
                                    </label>
                                </div>

                                {error && <div className="text-red-400 font-bold text-center">{error}</div>}

                                <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-700">
                                    <button onClick={() => setStep(3)} className="text-gray-400 hover:text-white px-4">Back</button>

                                    <button
                                        onClick={handleFinalize}
                                        disabled={loading}
                                        className="bg-green-600 hover:bg-green-500 text-white px-8 py-3 rounded-lg font-bold shadow-lg transform transition hover:scale-105"
                                    >
                                        {loading ? 'Finalizing...' : 'Complete Registration'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                </div>
            </div>
        </div>
    );
};
