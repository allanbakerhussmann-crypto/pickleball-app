import React, { useState, useEffect } from 'react';
import type { Tournament, TournamentRegistration, UserProfile, Division, Team } from '../../types';
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
    const [regData, setRegData] = useState<TournamentRegistration | null>(null);
    const [divisions, setDivisions] = useState<Division[]>([]);
    const [partnerDetails, setPartnerDetails] = useState<TournamentRegistration['partnerDetails']>({});
    const [existingTeamsByDivision, setExistingTeamsByDivision] = useState<Record<string, Team>>({});
    const [error, setError] = useState<string | null>(null);
    
    // Modal state for confirmation
    const [withdrawConfirmationId, setWithdrawConfirmationId] = useState<string | null>(null);

    const isWaiverOnly = mode === 'waiver_only' && !!initialDivisionId;

    useEffect(() => {
        const unsub = subscribeToDivisions(tournament.id, setDivisions);

        const loadExisting = async () => {
            const teams = await getUserTeamsForTournament(tournament.id, userProfile.id);
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

    const handleSave = async (updates: Partial<TournamentRegistration>) => {
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
            const teams = await getUserTeamsForTournament(tournament.id, userProfile.id);
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
            if (existingTeam && existingTeam.players.length >= 2) continue;

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

        // validation on click (same logic as validatePartnerChoices)
        const missing = validatePartnerChoices();
        if (missing.length > 0) {
            setError(`You must select a valid partner option for: ${missing.join(', ')}`);
            return;
        }

        setLoading(true);
        try {
            const payload: TournamentRegistration = {
                ...(regData as TournamentRegistration),
                partnerDetails: isWaiverOnly ? (regData.partnerDetails || {}) : (partnerDetails || {}),
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

    if (loading && !regData) return <div className="p-10 text-white text-center">Loading...</div>;
    if (!regData) return null;

    const isRegistrationComplete = regData.status === 'completed';
    const primaryButtonLabel = loading ? 'Processing...' : isWaiverOnly ? 'Sign Waiver & Join' : isRegistrationComplete ? 'Update Registration' : 'Complete Registration';

    // disable if missing partner choices or loading
    const missingChoices = validatePartnerChoices();
    const primaryDisabled = loading || (!isWaiverOnly && missingChoices.length > 0);

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

            <div className="bg-gray-800 w-full max-w-2xl p-6 rounded-lg border border-gray-700 relative flex flex-col max-h-[90vh]">
                <h2 className="text-2xl text-white font-bold mb-4 flex-shrink-0">
                    {isWaiverOnly ? 'Complete Registration' : isRegistrationComplete ? 'Manage Registration' : `Registration: ${tournament.name}`}
                </h2>

                <div className="overflow-y-auto flex-grow pr-2">
                    <>
                        {step === 1 && (
                            <div className="space-y-4">
                                <p className="text-gray-300">{isWaiverOnly ? 'You have been invited to join the following event:' : 'Select Division(s):'}</p>
                                {isRegistrationComplete && !isWaiverOnly && (
                                    <p className="text-xs text-gray-400">You are already registered. You can update your divisions and partner options below, then click <span className="font-semibold text-gray-200">Update Registration</span> to save your changes.</p>
                                )}

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
                                                    if (hasExistingTeam) return; // Prevent deselecting if they have a team, must use withdraw button
                                                    const current = regData.selectedEventIds;
                                                    const next = current.includes(div.id) ? current.filter(x => x !== div.id) : [...current, div.id];
                                                    handleSave({ selectedEventIds: next });
                                                }}
                                                className={`p-4 rounded border flex justify-between items-center transition-all ${!eligible ? 'bg-gray-800 border-gray-700 opacity-60 cursor-not-allowed' : isSelected ? 'bg-green-900/40 border-green-500 cursor-pointer shadow-[0_0_10px_rgba(34,197,94,0.1)]' : 'bg-gray-700 border-gray-600 hover:bg-gray-600 cursor-pointer'}`}
                                            >
                                                <div>
                                                    <div className={`font-bold ${isSelected ? 'text-green-400' : 'text-white'}`}>{div.name}</div>
                                                    <div className="text-xs text-gray-400 mt-1 flex gap-2">
                                                        <span className="capitalize">{div.type}</span>
                                                        <span>•</span>
                                                        <span className="capitalize">{div.gender}</span>
                                                        {div.minRating && <span>• {div.minRating}+ Rating</span>}
                                                        {div.minAge && <span>• Age {div.minAge}+</span>}
                                                    </div>
                                                </div>

                                                {!eligible ? (
                                                    <div className="text-xs font-bold text-red-400 border border-red-900 bg-red-900/20 px-2 py-1 rounded whitespace-nowrap">{reason}</div>
                                                ) : hasExistingTeam ? (
                                                    <div className="text-xs font-bold text-gray-300 border border-gray-600 bg-gray-900 px-2 py-1 rounded whitespace-nowrap flex items-center gap-2">
                                                        Currently Registered
                                                        <button
                                                            type="button"
                                                            onMouseDown={(e) => e.stopPropagation()}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setWithdrawConfirmationId(div.id);
                                                            }}
                                                            className="text-red-400 hover:text-red-300 hover:underline ml-1 cursor-pointer z-10 relative isolate"
                                                        >
                                                            Withdraw
                                                        </button>
                                                    </div>
                                                ) : isSelected ? (
                                                    <div className="text-green-500 font-bold text-xl">✓</div>
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="flex justify-between items-center mt-6 border-t border-gray-700 pt-4">
                                    <button 
                                        onClick={onClose} 
                                        className="bg-gray-700 border border-gray-600 text-white px-4 py-2 rounded hover:bg-gray-600"
                                    >
                                        Back
                                    </button>
                                    <div className="text-xs text-gray-500 hidden sm:block"><p>* Eligibility is based on your Profile.</p></div>
                                    <button onClick={() => { if (isWaiverOnly || !regData.selectedEventIds.some(id => divisions.find(d => d.id === id && d.type === 'doubles'))) { setStep(3); } else { setStep(2); } }} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-500">
                                        Next
                                    </button>
                                </div>
                            </div>
                        )}

                        {step === 2 && (
                            <>
                                <DoublesPartnerStep
                                    tournament={tournament}
                                    divisions={divisions}
                                    selectedDivisionIds={regData.selectedEventIds}
                                    userProfile={userProfile}
                                    partnerDetails={partnerDetails}
                                    setPartnerDetails={setPartnerDetails}
                                    existingTeams={existingTeamsByDivision}
                                />

                                <div className="flex justify-between items-center mt-6 border-t border-gray-700 pt-4">
                                    <button onClick={() => setStep(1)} className="bg-gray-700 border border-gray-600 text-white px-4 py-2 rounded">Back</button>
                                    <button onClick={() => setStep(3)} className="bg-blue-600 text-white px-4 py-2 rounded">Review</button>
                                </div>
                            </>
                        )}

                        {step === 3 && (
                            <div className="space-y-4">
                                <h3 className="text-white font-bold">Liability Waiver</h3>
                                <p className="text-gray-300">By registering, I acknowledge the risks blah blah (waiver text omitted for brevity).</p>

                                {error && <div className="text-red-400 font-semibold">{error}</div>}

                                <div className="flex justify-between items-center mt-6 border-t border-gray-700 pt-4">
                                    <button onClick={() => setStep(Math.max(1, step - 1))} className="bg-gray-700 border border-gray-600 text-white px-4 py-2 rounded">Back</button>

                                    <button
                                        onClick={handleFinalize}
                                        disabled={primaryDisabled}
                                        className={`px-4 py-2 rounded font-bold ${primaryDisabled ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-green-600 text-white'}`}
                                    >
                                        {primaryButtonLabel}
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