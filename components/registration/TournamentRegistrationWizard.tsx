


import React, { useState, useEffect } from 'react';
import type { Tournament, TournamentRegistration, UserProfile, Division, Team } from '../../types';
import {
    getRegistration,
    saveRegistration,
    finalizeRegistration,
    subscribeToDivisions,
    getUserTeamsForTournament,
} from '../../services/firebase';
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
        const userRating =
            div.type === 'doubles' ? user.duprDoublesRating : user.duprSinglesRating;

        if (div.minRating || div.maxRating) {
            // If rating requirements exist, user MUST have a rating (strict for Directors)
            if (userRating === undefined || userRating === null) {
                return { eligible: false, reason: 'Profile missing DUPR Rating' };
            }
            if (div.minRating && userRating < div.minRating) {
                return {
                    eligible: false,
                    reason: `Rating too low (${userRating.toFixed(2)} < ${div.minRating})`,
                };
            }
                    if (div.maxRating && userRating > div.maxRating) {
                        return {
                            eligible: false,
                            reason: `Rating too high (${userRating.toFixed(2)} > ${div.maxRating})`,
                        };
                    }
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
    // Do any of the selected events require a partner (doubles)?
    const hasDoublesSelection =
    !!regData &&
    regData.selectedEventIds.some(eventId => {
        const div = divisions.find(d => d.id === eventId);
        return div?.type === 'doubles';
    });


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

        // 1) Validate partner choices for ALL selected doubles events
        //    (skip only in the special waiver_only flow)
        if (!isWaiverOnly) {
            const missing: string[] = [];

            for (const divId of regData.selectedEventIds) {
                const div = divisions.find(d => d.id === divId);
                if (!div || div.type !== 'doubles') continue;

                const details = partnerDetails?.[divId];

                // No partner option chosen at all
                if (!details) {
                    missing.push(div.name);
                    continue;
                }

                switch (details.mode) {
                    case 'invite': {
                        // Must have a concrete user id (not empty / not "tbd")
                        if (!details.partnerUserId || details.partnerUserId === 'tbd') {
                            missing.push(div.name);
                        }
                        break;
                    }

                    case 'join_open': {
                        // Must have selected an open team to join
                        if (!details.openTeamId) {
                            missing.push(div.name);
                        }
                        break;
                    }

                    case 'open_team':
                    default:
                        // "I don't have a partner yet" is valid on its own.
                        // No extra fields required here.
                        break;
                }
            }

            if (missing.length > 0) {
                setError(
                    `You must select a valid partner option for: ${missing.join(', ')}`
                );
                return;
            }
        }

        // 2) Finalise registration in Firestore
        setLoading(true);
        try {
            // Always start from the latest regData in state
            // and then splice in the current partnerDetails.
            const payload: TournamentRegistration = {
                ...(regData as TournamentRegistration),
                partnerDetails: isWaiverOnly
                    ? (regData.partnerDetails || {}) // waiver_only: keep whatever is already on the doc
                    : (partnerDetails || {}),        // normal flow: use live wizard state
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

    // Dynamic label for the final button
    const primaryButtonLabel = loading
        ? 'Processing...'
        : isWaiverOnly
            ? 'Sign Waiver & Join'
            : isRegistrationComplete
                ? 'Update Registration'
                : 'Complete Registration';

    return (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-800 w-full max-w-2xl p-6 rounded-lg border border-gray-700 relative flex flex-col max-h-[90vh]">
                <h2 className="text-2xl text-white font-bold mb-4 flex-shrink-0">
                    {isWaiverOnly
                        ? 'Complete Registration'
                        : isRegistrationComplete
                            ? 'Manage Registration'
                            : `Registration: ${tournament.name}`}
                </h2>

                <div className="overflow-y-auto flex-grow pr-2">
                    <>
                        {/* STEP 1 – Division Selection (now always available, even after completed) */}
                        {step === 1 && (
                            <div className="space-y-4">
                                <p className="text-gray-300">
                                    {isWaiverOnly
                                        ? 'You have been invited to join the following event:'
                                        : 'Select Division(s):'}
                                </p>

                                {isRegistrationComplete && !isWaiverOnly && (
                                    <p className="text-xs text-gray-400">
                                        You are already registered. You can update your divisions and partner
                                        options below, then click{' '}
                                        <span className="font-semibold text-gray-200">Update Registration</span> to
                                        save your changes.
                                    </p>
                                )}

                                <div className="grid gap-3">
                                    {divisions.map(div => {
                                        const { eligible, reason } = checkEligibility(div, userProfile);
                                        const isSelected = regData.selectedEventIds.includes(div.id);

                                        // Any existing team in this division for this player
                                        const team = existingTeamsByDivision[div.id];
                                        const hasExistingTeam = !!team;

                                        // If waiver-only, only show the targeted division
                                        if (isWaiverOnly && div.id !== initialDivisionId) return null;

                                        return (
                                            <div
                                                key={div.id}
                                                onClick={() => {
                                                    if (isWaiverOnly) return; // locked in invite flow
                                                    if (!eligible) return;

                                                    const current = regData.selectedEventIds;
                                                    const next = current.includes(div.id)
                                                        ? current.filter(x => x !== div.id)
                                                        : [...current, div.id];

                                                    handleSave({ selectedEventIds: next });
                                                }}
                                                className={`p-4 rounded border flex justify-between items-center transition-all ${
                                                    !eligible
                                                        ? 'bg-gray-800 border-gray-700 opacity-60 cursor-not-allowed'
                                                        : isSelected
                                                            ? 'bg-green-900/40 border-green-500 cursor-pointer shadow-[0_0_10px_rgba(34,197,94,0.1)]'
                                                            : 'bg-gray-700 border-gray-600 hover:bg-gray-600 cursor-pointer'
                                                }`}
                                            >
                                                <div>
                                                    <div
                                                        className={`font-bold ${
                                                            isSelected ? 'text-green-400' : 'text-white'
                                                        }`}
                                                    >
                                                        {div.name}
                                                    </div>
                                                    <div className="text-xs text-gray-400 mt-1 flex gap-2">
                                                        <span className="capitalize">{div.type}</span>
                                                        <span>•</span>
                                                        <span className="capitalize">{div.gender}</span>
                                                        {div.minRating && <span>• {div.minRating}+ Rating</span>}
                                                        {div.minAge && <span>• Age {div.minAge}+</span>}
                                                    </div>
                                                </div>

                                                {!eligible ? (
                                                    <div className="text-xs font-bold text-red-400 border border-red-900 bg-red-900/20 px-2 py-1 rounded whitespace-nowrap">
                                                        {reason}
                                                    </div>
                                                ) : hasExistingTeam ? (
                                                    <div className="text-xs font-bold text-gray-300 border border-gray-600 bg-gray-900 px-2 py-1 rounded whitespace-nowrap">
                                                        Currently Registered
                                                    </div>
                                                ) : isSelected ? (
                                                    <div className="text-green-500 font-bold text-xl">✓</div>
                                                ) : null}
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
                                        if (isWaiverOnly || !hasDoublesSelection) {
                                        // Waiver-only OR only singles: skip partner step, go straight to review
                                        setStep(3);
                                        } else {
                                        // At least one doubles event selected: go to partner selection
                                        setStep(2);
                                        }
                                    }}
                                    disabled={regData.selectedEventIds.length === 0}
                                    className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-8 py-2 rounded font-bold transition-colors"
                                    >
                                    Next
                                    </button>

                                </div>
                            </div>
                        )}

                        {/* STEP 2 – Partner Selection (unchanged logic, just always reachable if not waiver_only) */}
                        {step === 2 && !isWaiverOnly && hasDoublesSelection && (
                            <div className="space-y-6">
                                <p className="text-gray-300 font-medium">
                                Partner Selection (For doubles events):
                                </p>

                                <DoublesPartnerStep
                                tournament={tournament}
                                divisions={divisions}
                                selectedDivisionIds={regData.selectedEventIds}
                                userProfile={userProfile}
                                partnerDetails={partnerDetails}
                                setPartnerDetails={setPartnerDetails}
                                />

                                <div className="flex gap-3 mt-6 pt-4 border-t border-gray-700 justify-end">
                                    <button
                                        onClick={() => setStep(1)}
                                        className="text-gray-400 hover:text-white px-4 py-2"
                                    >
                                        Back
                                    </button>
                                    <button
                                        onClick={() => setStep(3)}
                                        className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-2 rounded font-bold"
                                    >
                                        Review
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* STEP 3 – Waiver + Summary + Finalise */}
                        {step === 3 && (
                            <div className="space-y-4">
                                <h3 className="text-white font-bold text-lg">Liability Waiver</h3>
                                <div className="bg-gray-900 p-4 text-xs text-gray-400 h-32 overflow-y-auto rounded border border-gray-700 leading-relaxed">
                                    <p className="mb-2">
                                        <strong>ASSUMPTION OF RISK AND RELEASE OF LIABILITY</strong>
                                    </p>
                                    <p className="mb-2">
                                        By registering, I acknowledge inherent risks of physical injury.
                                    </p>
                                    <p>
                                        I hereby release the tournament organizers from any and all liability.
                                    </p>
                                </div>

                                <div className="bg-gray-700/30 p-4 rounded border border-gray-600">
                                    <label className="flex items-center gap-3 text-gray-200 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="w-5 h-5 rounded border-gray-500 text-green-600 focus:ring-green-500 bg-gray-800"
                                            checked={regData.waiverAccepted}
                                            onChange={e => handleSave({ waiverAccepted: e.target.checked })}
                                        />
                                        <span className="font-bold">I have read and accept the waiver.</span>
                                    </label>
                                </div>

                                {/* Confirmation Summary */}
                                <div className="bg-gray-900/50 p-4 rounded text-sm text-gray-300">
                                    <p className="font-bold text-white mb-2">Summary:</p>
                                    <ul className="list-disc pl-5 space-y-1">
                                        {regData.selectedEventIds.map(divId => {
                                            const div = divisions.find(d => d.id === divId);
                                            const details = partnerDetails?.[divId];

                                            return (
                                                <li key={divId}>
                                                    {div?.name}
                                                    {!isWaiverOnly && div?.type === 'doubles' && details && (
                                                        <span className="text-gray-400">
                                                            {details.mode === 'invite' && details.partnerName
                                                                ? ` with ${details.partnerName}`
                                                                : ''}
                                                            {details.mode === 'open_team' &&
                                                                ' (Looking for partner)'}
                                                            {details.mode === 'join_open' &&
                                                                ' (Joining open team)'}
                                                        </span>
                                                    )}
                                                    {isWaiverOnly && (
                                                        <span className="text-gray-400">
                                                            {' '}
                                                            (Accepted Invite)
                                                        </span>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>

                                {error && (
                                    <div className="bg-red-900/50 border border-red-800 p-3 rounded text-red-300 text-sm font-bold text-center">
                                        {error}
                                    </div>
                                )}

                                <button
                                    onClick={handleFinalize}
                                    disabled={!regData.waiverAccepted || loading}
                                    className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 rounded mt-4 transition-colors shadow-lg"
                                >
                                    {primaryButtonLabel}
                                </button>
                                <button
                                    onClick={() => {
                                        if (isWaiverOnly || !hasDoublesSelection) {
                                        setStep(1);
                                        } else {
                                        setStep(2);
                                        }
                                    }}
                                    disabled={loading}
                                    className="w-full text-gray-500 hover:text-gray-300 px-4 py-2"
                                >
                                    Back
                                </button>
                            </div>
                        )}

                        {/* Close (X) button – always available */}
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 text-gray-500 hover:text-white text-2xl"
                        >
                            &times;
                        </button>
                    </>
                </div>
            </div>
        </div>
    );
};
