




import React, { useState, useEffect } from 'react';
import type { Tournament, TournamentRegistration, UserProfile, Division, Team } from '../../types';
import { getRegistration, saveRegistration, finalizeRegistration, subscribeToDivisions, getUserTeamsForTournament } from '../../services/firebase';
import { DoublesPartnerStep } from './DoublesPartnerStep';

interface WizardProps {
    tournament: Tournament;
    userProfile: UserProfile;
    onClose: () => void;
    onComplete: () => void;
    
    // NEW Props
    initialDivisionId?: string;
    mode?: 'full' | 'waiver_only';
}

// Calculate age from birthDate string (YYYY-MM-DD)
const getAge = (birthDateString?: string) => {
    if (!birthDateString) return null;
    const today = new Date();
    const birthDate = new Date(birthDateString);
    if (isNaN(birthDate.getTime())) return null;
    
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
};

// Returns eligibility status and reason
const checkEligibility = (div: Division, user: UserProfile): { eligible: boolean; reason?: string } => {
    // 1. Gender Validation
    // 'mixed' and 'open' allow any gender.
    if (div.gender === 'men' && user.gender !== 'male') {
        return { eligible: false, reason: 'Men only' };
    }
    if (div.gender === 'women' && user.gender !== 'female') {
        return { eligible: false, reason: 'Women only' };
    }

    // 2. Age Validation
    const age = getAge(user.birthDate);
    if (div.minAge || div.maxAge) {
        if (age === null) return { eligible: false, reason: 'Profile missing Birth Date' };
        if (div.minAge && age < div.minAge) return { eligible: false, reason: `Too young (Age ${age} < ${div.minAge})` };
        if (div.maxAge && age > div.maxAge) return { eligible: false, reason: `Too old (Age ${age} > ${div.maxAge})` };
    }

    // 3. Rating Validation
    // Determine which rating to check based on event type
    const userRating = div.type === 'doubles' ? user.duprDoublesRating : user.duprSinglesRating;
    
    if (div.minRating || div.maxRating) {
        // If rating requirements exist, user MUST have a rating (unless we allow NR, but strict is safer for "Directors")
        if (userRating === undefined || userRating === null) {
            return { eligible: false, reason: 'Profile missing DUPR Rating' };
        }
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
    const [regData, setRegData] = useState<TournamentRegistration | null>(null);
    const [divisions, setDivisions] = useState<Division[]>([]);
    const [partnerDetails, setPartnerDetails] = useState<TournamentRegistration['partnerDetails']>({});
    const [existingTeamsByDivision, setExistingTeamsByDivision] = useState<Record<string, Team>>({});
    
    const [error, setError] = useState<string | null>(null);

    const isWaiverOnly = mode === 'waiver_only' && !!initialDivisionId;

    useEffect(() => {
        // Load divisions
        const unsub = subscribeToDivisions(tournament.id, setDivisions);
        
        // Load existing teams to check prior registration
        const loadExisting = async () => {
            const teams = await getUserTeamsForTournament(tournament.id, userProfile.id);
            const map: Record<string, Team> = {};
            teams.forEach(t => { map[t.divisionId] = t; });
            setExistingTeamsByDivision(map);
        };
        loadExisting();

        // Load or create registration
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
            } else {
                // If opening an existing registration, make sure selectedEventIds includes existing active teams
                // This ensures UI starts in a consistent state
                const teams = await getUserTeamsForTournament(tournament.id, userProfile.id);
                const activeIds = teams.map(t => t.divisionId);
                const mergedIds = Array.from(new Set([...reg.selectedEventIds, ...activeIds]));
                if (mergedIds.length !== reg.selectedEventIds.length) {
                     reg.selectedEventIds = mergedIds;
                     await saveRegistration(reg);
                }
            }
            setRegData(reg);
            // Hydrate partner details from DB if they exist
            if (reg.partnerDetails) {
                setPartnerDetails(reg.partnerDetails);
            }
            setLoading(false);
        };
        initReg();
        return () => unsub();
    }, [tournament.id, userProfile.id, initialDivisionId]);

    const handleSave = async (updates: Partial<TournamentRegistration>) => {
        if (!regData) return;
        const updated = { ...regData, ...updates };
        setRegData(updated);
        await saveRegistration(updated);
    };

    const handleFinalize = async () => {
        setError(null);
        if (!regData) return;
        
        // Validate Partners for Doubles Events (only if NOT waiver_only)
        if (!isWaiverOnly) {
            const missingPartners: string[] = [];
            regData.selectedEventIds.forEach(divId => {
                const div = divisions.find(d => d.id === divId);
                if (div?.type === 'doubles') {
                    // Check if user is already registered in this division (updating existing registration shouldn't require re-entry unless changing)
                    // But if selectedEventIds includes it, we check partner details.
                    // If they are already in a team, partnerDetails might be empty or stale, but 'finalizeRegistration' handles skips.
                    // However, UI validation should pass if they are already registered.
                    if (existingTeamsByDivision[divId]) return;

                    const details = partnerDetails?.[divId];
                    if (!details) {
                        missingPartners.push(div.name);
                        return;
                    }
                    if (details.mode === 'invite' && !details.partnerUserId) {
                         missingPartners.push(div.name);
                    }
                    if (details.mode === 'join_open' && !details.openTeamId) {
                         missingPartners.push(div.name);
                    }
                    // 'open_team' is valid by itself
                }
            });

            if (missingPartners.length > 0) {
                setError(`You must select a partner option for: ${missingPartners.join(', ')}`);
                return;
            }
        }
        
        setLoading(true);
        try {
            // IMPORTANT: merge latest partnerDetails into the payload
            const payload: TournamentRegistration = {
                ...(regData as TournamentRegistration),
                partnerDetails: isWaiverOnly ? (regData.partnerDetails || {}) : partnerDetails,
            };
            
            await finalizeRegistration(payload, tournament, userProfile);
            setLoading(false);
            onComplete();
        } catch (e: any) {
            console.error(e);
            setError(e.message || "An error occurred during registration.");
            setLoading(false);
        }
    };

    if (loading && !regData) return <div className="p-10 text-white text-center">Loading...</div>;
    if (!regData) return null;

    const isUpdateMode = Object.keys(existingTeamsByDivision).length > 0;
    const isCancellingAll = isUpdateMode && regData.selectedEventIds.length === 0;

    return (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-800 w-full max-w-2xl p-6 rounded-lg border border-gray-700 relative flex flex-col max-h-[90vh]">
                <h2 className="text-2xl text-white font-bold mb-4 flex-shrink-0">
                    {isWaiverOnly ? 'Complete Registration' : (isUpdateMode ? 'Manage Registration' : `Registration: ${tournament.name}`)}
                </h2>
                
                <div className="overflow-y-auto flex-grow pr-2">
                    {step === 1 && (
                        <div className="space-y-4">
                            <p className="text-gray-300">
                                {isWaiverOnly 
                                    ? "You have been invited to join the following event:" 
                                    : "Select Division(s):"}
                            </p>
                            <div className="grid gap-3">
                                {divisions.map(div => {
                                    const { eligible, reason } = checkEligibility(div, userProfile);
                                    const isSelected = regData.selectedEventIds.includes(div.id);
                                    const alreadyRegistered = !!existingTeamsByDivision[div.id];

                                    // If waiver only, only show the targeted division or lock others out
                                    if (isWaiverOnly && div.id !== initialDivisionId) return null;

                                    // Logic for visual state
                                    // 1. Registered and Selected -> Green Check (Status Quo)
                                    // 2. Registered and NOT Selected -> Red "Withdrawing" (Change)
                                    // 3. Not Registered and Selected -> Green Check (Joining)
                                    // 4. Not Registered and Not Selected -> Normal (Available)

                                    const isWithdrawing = alreadyRegistered && !isSelected;

                                    return (
                                        <div 
                                            key={div.id} 
                                            onClick={() => {
                                                if (isWaiverOnly) return; // Locked selection
                                                if (!eligible && !alreadyRegistered) return; // Can't join invalid, but can modify if already in (legacy)
                                                
                                                const current = regData.selectedEventIds;
                                                const next = current.includes(div.id) ? current.filter(x => x !== div.id) : [...current, div.id];
                                                handleSave({ selectedEventIds: next });
                                            }}
                                            className={`p-4 rounded border flex justify-between items-center transition-all ${
                                                isWithdrawing 
                                                    ? 'bg-red-900/20 border-red-500 cursor-pointer opacity-75' 
                                                    : !eligible && !alreadyRegistered
                                                        ? 'bg-gray-800 border-gray-700 opacity-60 cursor-not-allowed' 
                                                        : isSelected 
                                                            ? 'bg-green-900/40 border-green-500 cursor-pointer shadow-[0_0_10px_rgba(34,197,94,0.1)]' 
                                                            : 'bg-gray-700 border-gray-600 hover:bg-gray-600 cursor-pointer'
                                            }`}
                                        >
                                            <div>
                                                <div className={`font-bold ${isWithdrawing ? 'text-red-400 line-through' : isSelected ? 'text-green-400' : 'text-white'}`}>{div.name}</div>
                                                <div className="text-xs text-gray-400 mt-1 flex gap-2">
                                                    <span className="capitalize">{div.type}</span>
                                                    <span>•</span>
                                                    <span className="capitalize">{div.gender}</span>
                                                    {div.minRating && <span>• {div.minRating}+ Rating</span>}
                                                    {div.minAge && <span>• Age {div.minAge}+</span>}
                                                </div>
                                            </div>
                                            
                                            {isWithdrawing ? (
                                                <div className="text-xs font-bold text-red-400 uppercase border border-red-500/50 px-2 py-1 rounded whitespace-nowrap">
                                                    Will Withdraw
                                                </div>
                                            ) : alreadyRegistered ? (
                                                <div className="text-xs font-bold text-gray-400 border border-gray-700 bg-gray-900 px-2 py-1 rounded whitespace-nowrap">
                                                    ✓ Registered
                                                </div>
                                            ) : !eligible ? (
                                                <div className="text-xs font-bold text-red-400 border border-red-900 bg-red-900/20 px-2 py-1 rounded whitespace-nowrap">
                                                    {reason}
                                                </div>
                                            ) : isSelected && (
                                                <div className="text-green-500 font-bold text-xl">✓</div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            
                            <div className="flex justify-between items-center mt-6 border-t border-gray-700 pt-4">
                                <div className="text-xs text-gray-500">
                                    <p>* Eligibility is based on your Profile.</p>
                                </div>
                                <button 
                                    onClick={() => {
                                        if (isWaiverOnly) {
                                            setStep(3);
                                        } else if (regData.selectedEventIds.length === 0) {
                                            // Proceed to confirmation (Cancellation flow)
                                            setStep(3);
                                        } else {
                                            // Check if any NEW selections need partner details
                                            const hasNewDoubles = regData.selectedEventIds.some(id => {
                                                const div = divisions.find(d => d.id === id);
                                                return div?.type === 'doubles' && !existingTeamsByDivision[id];
                                            });
                                            
                                            if (hasNewDoubles) setStep(2);
                                            else setStep(3);
                                        }
                                    }} 
                                    className={`text-white px-8 py-2 rounded font-bold transition-colors ${
                                        isCancellingAll ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'
                                    }`}
                                >
                                    {isCancellingAll ? 'Next: Confirm Cancellation' : 'Next'}
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 2 && !isWaiverOnly && (
                        <div className="space-y-6">
                            <p className="text-gray-300 font-medium">Partner Selection (For new doubles events):</p>
                            
                            <DoublesPartnerStep
                                tournament={tournament}
                                divisions={divisions}
                                // Only show partner step for NEW selections (not already registered)
                                selectedDivisionIds={regData.selectedEventIds.filter(id => !existingTeamsByDivision[id])}
                                userProfile={userProfile}
                                partnerDetails={partnerDetails}
                                setPartnerDetails={setPartnerDetails}
                            />

                            <div className="flex gap-3 mt-6 pt-4 border-t border-gray-700 justify-end">
                                <button onClick={() => setStep(1)} className="text-gray-400 hover:text-white px-4 py-2">Back</button>
                                <button onClick={() => setStep(3)} className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-2 rounded font-bold">Review</button>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-4">
                            <h3 className="text-white font-bold text-lg">
                                {isCancellingAll ? 'Confirm Cancellation' : 'Review & Confirm'}
                            </h3>
                            
                            {isCancellingAll ? (
                                <div className="bg-red-900/30 border border-red-800 p-4 rounded text-red-200 text-sm mb-4">
                                    <p className="font-bold text-lg mb-2">Are you sure?</p>
                                    <p>You are about to withdraw from all events in <strong>{tournament.name}</strong>.</p>
                                    <p className="mt-2 text-xs opacity-75">Your spot will be released immediately.</p>
                                </div>
                            ) : (
                                <>
                                    <div className="bg-gray-900 p-4 text-xs text-gray-400 h-32 overflow-y-auto rounded border border-gray-700 leading-relaxed">
                                        <p className="mb-2"><strong>ASSUMPTION OF RISK AND RELEASE OF LIABILITY</strong></p>
                                        <p className="mb-2">By registering, I acknowledge inherent risks of physical injury.</p>
                                        <p>I hereby release the tournament organizers from any and all liability.</p>
                                    </div>
                                    
                                    <div className="bg-gray-700/30 p-4 rounded border border-gray-600">
                                        <label className="flex items-center gap-3 text-gray-200 cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                className="w-5 h-5 rounded border-gray-500 text-green-600 focus:ring-green-500 bg-gray-800"
                                                checked={regData.waiverAccepted} 
                                                onChange={e => handleSave({waiverAccepted: e.target.checked})} 
                                            />
                                            <span className="font-bold">I have read and accept the waiver.</span>
                                        </label>
                                    </div>
                                </>
                            )}
                            
                            {/* Confirmation Summary */}
                            <div className="bg-gray-900/50 p-4 rounded text-sm text-gray-300">
                                <p className="font-bold text-white mb-2">Summary:</p>
                                <ul className="list-disc pl-5 space-y-1">
                                    {/* Events Staying/Joining */}
                                    {regData.selectedEventIds.map(divId => {
                                        const div = divisions.find(d => d.id === divId);
                                        const details = partnerDetails?.[divId];
                                        const isExisting = !!existingTeamsByDivision[divId];
                                        
                                        return (
                                            <li key={divId}>
                                                <span className={isExisting ? 'text-gray-400' : 'text-green-400 font-bold'}>
                                                    {div?.name} {isExisting ? '(Existing)' : '(New)'}
                                                </span>
                                                {!isWaiverOnly && !isExisting && div?.type === 'doubles' && details && (
                                                    <span className="text-gray-400 block text-xs">
                                                        {details.mode === 'invite' && details.partnerName ? `Inviting: ${details.partnerName}` : ''}
                                                        {details.mode === 'open_team' && 'Looking for partner'}
                                                        {details.mode === 'join_open' && 'Joining open team'}
                                                    </span>
                                                )}
                                            </li>
                                        );
                                    })}
                                    
                                    {/* Events Withdrawing */}
                                    {Object.keys(existingTeamsByDivision).map(divId => {
                                        if (regData.selectedEventIds.includes(divId)) return null;
                                        const div = divisions.find(d => d.id === divId);
                                        return (
                                            <li key={divId + '_withdraw'} className="text-red-400 line-through">
                                                {div?.name || 'Unknown Event'} (Withdrawing)
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>

                            {error && <div className="bg-red-900/50 border border-red-800 p-3 rounded text-red-300 text-sm font-bold text-center">{error}</div>}

                            <button 
                                onClick={handleFinalize} 
                                disabled={(!isCancellingAll && !regData.waiverAccepted) || loading}
                                className={`w-full text-white font-bold py-3 rounded mt-4 transition-colors shadow-lg disabled:bg-gray-600 disabled:cursor-not-allowed ${
                                    isCancellingAll 
                                    ? 'bg-red-600 hover:bg-red-500' 
                                    : 'bg-green-600 hover:bg-green-500'
                                }`}
                            >
                                {loading ? 'Processing...' : (
                                    isCancellingAll ? 'Confirm Cancellation' : 
                                    (isWaiverOnly ? 'Sign Waiver & Join' : (isUpdateMode ? 'Update Registration' : 'Complete Registration'))
                                )}
                            </button>
                            <button onClick={() => isWaiverOnly ? setStep(1) : setStep(2)} disabled={loading} className="w-full text-gray-500 hover:text-gray-300 text-sm mt-2">Back</button>
                        </div>
                    )}
                    
                    <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white text-2xl">&times;</button>
                </div>
            </div>
        </div>
    );
};
