
import React, { useState, useEffect } from 'react';
import type { Competition, UserProfile, CompetitionDivision, Team, CompetitionEntry } from '../../types';
import {
    getUserTeamsForTournament,
    finalizeCompetitionRegistration,
    getCompetitionEntry
} from '../../services/firebase';
import { DoublesPartnerStep } from './DoublesPartnerStep';

interface WizardProps {
    competition: Competition;
    userProfile: UserProfile;
    onClose: () => void;
    onComplete: () => void;
}

// Reuse eligibility logic
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

const checkEligibility = (div: CompetitionDivision, user: UserProfile): { eligible: boolean; reason?: string } => {
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

export const CompetitionRegistrationWizard: React.FC<WizardProps> = ({
    competition,
    userProfile,
    onClose,
    onComplete,
}) => {
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(true);
    const [selectedDivisionIds, setSelectedDivisionIds] = useState<string[]>([]);
    const [partnerDetails, setPartnerDetails] = useState<any>({});
    const [existingTeamsByDivision, setExistingTeamsByDivision] = useState<Record<string, Team>>({});
    const [existingEntry, setExistingEntry] = useState<CompetitionEntry | null>(null);
    const [error, setError] = useState<string | null>(null);

    const divisions = competition.divisions || [];

    useEffect(() => {
        const load = async () => {
            // Check if user already has an entry
            const entry = await getCompetitionEntry(competition.id, userProfile.id);
            if (entry) {
                setExistingEntry(entry);
                if (entry.divisionId) setSelectedDivisionIds([entry.divisionId]);
            }

            // Load existing teams for this competition (for doubles status)
            const teams = await getUserTeamsForTournament(competition.id, userProfile.id, 'competition');
            const map: Record<string, Team> = {};
            teams.forEach(t => { map[t.divisionId] = t; });
            setExistingTeamsByDivision(map);
            setLoading(false);
        };
        load();
    }, [competition.id, userProfile.id]);

    const handleFinalize = async () => {
        setError(null);
        if (selectedDivisionIds.length === 0) {
            setError("Please select a division.");
            return;
        }

        const divId = selectedDivisionIds[0]; // Leagues usually single entry per user, simplified here
        const div = divisions.find(d => d.id === divId);
        
        // Validation for doubles
        if (div?.type === 'doubles') {
            const details = partnerDetails[divId];
            const existingTeam = existingTeamsByDivision[divId];
            if (!existingTeam || existingTeam.players!.length < 2) {
                if (!details) {
                    setError("Please complete partner selection.");
                    return;
                }
                if (details.mode === 'invite' && !details.partnerUserId && !details.teamId) {
                    setError("Please select a partner to invite.");
                    return;
                }
                if (details.mode === 'join_open' && !details.openTeamId) {
                    setError("Please select a team to join.");
                    return;
                }
            }
        }

        setLoading(true);
        try {
            await finalizeCompetitionRegistration(
                competition,
                userProfile,
                divId,
                partnerDetails
            );
            onComplete();
        } catch (e: any) {
            console.error(e);
            setError(e.message || "Registration failed.");
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="fixed inset-0 bg-black/80 flex items-center justify-center text-white">Loading...</div>;

    const hasDoublesSelection = selectedDivisionIds.some(id => divisions.find(d => d.id === id)?.type === 'doubles');

    return (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-800 w-full max-w-2xl p-6 rounded-lg border border-gray-700 relative flex flex-col max-h-[90vh]">
                <h2 className="text-2xl text-white font-bold mb-4">Join {competition.name}</h2>
                
                <div className="overflow-y-auto flex-grow pr-2">
                    {step === 1 && (
                        <div className="space-y-4">
                            <p className="text-gray-300">Select a Division:</p>
                            <div className="grid gap-3">
                                {divisions.map(div => {
                                    const { eligible, reason } = checkEligibility(div, userProfile);
                                    const isSelected = selectedDivisionIds.includes(div.id);
                                    
                                    return (
                                        <div
                                            key={div.id}
                                            onClick={() => {
                                                if (!eligible) return;
                                                // Single select for leagues usually
                                                setSelectedDivisionIds([div.id]);
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
                                                </div>
                                            </div>
                                            {!eligible && (
                                                <div className="text-xs font-bold text-red-400 border border-red-900 bg-red-900/20 px-2 py-1 rounded whitespace-nowrap">{reason}</div>
                                            )}
                                            {isSelected && eligible && (
                                                <div className="text-green-500 font-bold text-xl">✓</div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            
                            <div className="flex justify-between mt-6 pt-4 border-t border-gray-700">
                                <button onClick={onClose} className="bg-gray-700 text-white px-4 py-2 rounded">Cancel</button>
                                <button 
                                    onClick={() => {
                                        if (selectedDivisionIds.length === 0) return;
                                        if (hasDoublesSelection) setStep(2);
                                        else setStep(3); // Skip to waiver/finalize
                                    }}
                                    disabled={selectedDivisionIds.length === 0}
                                    className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white px-4 py-2 rounded"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <>
                            <DoublesPartnerStep
                                eventId={competition.id}
                                eventContext="competition"
                                divisions={divisions}
                                selectedDivisionIds={selectedDivisionIds}
                                userProfile={userProfile}
                                partnerDetails={partnerDetails}
                                setPartnerDetails={setPartnerDetails}
                                existingTeams={existingTeamsByDivision}
                            />
                            <div className="flex justify-between mt-6 pt-4 border-t border-gray-700">
                                <button onClick={() => setStep(1)} className="bg-gray-700 text-white px-4 py-2 rounded">Back</button>
                                <button onClick={() => setStep(3)} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded">Next</button>
                            </div>
                        </>
                    )}

                    {step === 3 && (
                        <div className="space-y-4">
                            <h3 className="text-white font-bold">Confirmation</h3>
                            <p className="text-gray-300">Ready to join this league?</p>
                            
                            {error && <div className="text-red-400 font-bold bg-red-900/20 p-2 rounded">{error}</div>}

                            <div className="flex justify-between mt-6 pt-4 border-t border-gray-700">
                                <button onClick={() => setStep(hasDoublesSelection ? 2 : 1)} className="bg-gray-700 text-white px-4 py-2 rounded">Back</button>
                                <button 
                                    onClick={handleFinalize} 
                                    disabled={loading}
                                    className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded font-bold shadow-lg"
                                >
                                    {loading ? 'Processing...' : 'Confirm Registration'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
