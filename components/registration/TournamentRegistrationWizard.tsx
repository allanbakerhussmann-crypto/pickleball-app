import React, { useState, useEffect, useMemo } from 'react';
import type { Tournament, TournamentRegistration, UserProfile, Division, Team } from '../../types';
import {
    getRegistration,
    saveRegistration,
    finalizeRegistration,
    subscribeToDivisions,
    getUserTeamsForTournament,
    withdrawPlayerFromDivision,
    getActiveTeamCountForDivision,
    updateUserProfile,
} from '../../services/firebase';
import { db } from '../../services/firebase/config';
import { doc, getDoc } from '@firebase/firestore';
import { DoublesPartnerStep } from './DoublesPartnerStep';
import { calculateTournamentEntryPrice } from '../../services/firebase/pricing';
import { SponsorLogoStrip } from '../shared/SponsorLogoStrip';
import { createCheckoutSession, redirectToCheckout } from '../../services/stripe';
import { getDuprLoginIframeUrl, parseDuprLoginEvent } from '../../services/dupr';

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
    const [divisionTeamCounts, setDivisionTeamCounts] = useState<Record<string, number>>({});
    const [error, setError] = useState<string | null>(null);
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'stripe' | 'manual'>('stripe');

    // Modal state for confirmation
    const [withdrawConfirmationId, setWithdrawConfirmationId] = useState<string | null>(null);

    // DUPR Required modal state (V07.24)
    const [showDuprRequiredModal, setShowDuprRequiredModal] = useState(false);
    const [duprLinking, setDuprLinking] = useState(false);
    const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile>(userProfile);

    // Check if DUPR is required and user doesn't have it linked
    const isDuprRequired = tournament.duprSettings?.mode === 'required';
    const userHasDupr = !!currentUserProfile.duprId;
    const needsDuprLink = isDuprRequired && !userHasDupr;

    // Payment method determines processing fee
    const isFreeEvent = tournament.isFreeEvent || tournament.paymentMode === 'free' || tournament.entryFee === 0;

    // Calculate platform fee (1.5%) and Stripe fee (~2.9% + $0.30)
    const PLATFORM_FEE_PERCENT = 0.015;  // 1.5%
    const STRIPE_FEE_PERCENT = 0.029;    // 2.9%
    const STRIPE_FIXED_FEE = 30;         // $0.30 in cents

    const isWaiverOnly = mode === 'waiver_only' && !!initialDivisionId;

    // Calculate total fees for selected divisions
    const feeBreakdown = useMemo(() => {
        if (!regData || !divisions.length) return { totalFee: 0, items: [], hasFees: false };

        const items: Array<{ divisionId: string; divisionName: string; fee: number }> = [];
        let totalFee = 0;

        for (const divId of regData.selectedEventIds) {
            const div = divisions.find(d => d.id === divId);
            if (!div) continue;

            // Skip if already registered (existing team)
            if (existingTeamsByDivision[divId]) continue;

            const pricing = calculateTournamentEntryPrice({
                tournament: {
                    id: tournament.id,
                    name: tournament.name,
                    entryFee: tournament.entryFee,
                },
                division: div.entryFee ? {
                    id: div.id,
                    name: div.name,
                    entryFee: div.entryFee,
                } : undefined,
                isMember: false, // TODO: Check club membership
                registrationDate: new Date(),
            });

            if (!pricing.isFree) {
                items.push({
                    divisionId: div.id,
                    divisionName: div.name,
                    fee: pricing.finalPrice,
                });
                totalFee += pricing.finalPrice;
            }
        }

        return { totalFee, items, hasFees: totalFee > 0 };
    }, [regData?.selectedEventIds, divisions, tournament, existingTeamsByDivision]);

    // Check if payment is required
    const requiresPayment = feeBreakdown.hasFees && tournament.stripeConnectedAccountId;

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

    // Load team counts for capacity checking
    useEffect(() => {
        const loadTeamCounts = async () => {
            if (divisions.length === 0) return;
            const counts: Record<string, number> = {};
            await Promise.all(
                divisions.map(async (div) => {
                    counts[div.id] = await getActiveTeamCountForDivision(tournament.id, div.id);
                })
            );
            setDivisionTeamCounts(counts);
        };
        loadTeamCounts();
    }, [tournament.id, divisions]);

    // V07.24: Show DUPR required modal if needed
    useEffect(() => {
        if (needsDuprLink && !loading) {
            setShowDuprRequiredModal(true);
        }
    }, [needsDuprLink, loading]);

    // V07.24: Listen for DUPR login messages
    useEffect(() => {
        if (!showDuprRequiredModal) return;

        const handleDuprMessage = async (event: MessageEvent) => {
            const loginData = parseDuprLoginEvent(event);
            if (!loginData || !userProfile.id) return;

            console.log('DUPR login successful from tournament registration:', loginData);
            setDuprLinking(true);

            try {
                // Update user profile with DUPR data
                await updateUserProfile(userProfile.id, {
                    duprId: loginData.duprId,
                    duprDisplayName: loginData.displayName,
                    duprSinglesRating: loginData.singles,
                    duprDoublesRating: loginData.doubles,
                    duprSinglesReliability: loginData.singlesReliability,
                    duprDoublesReliability: loginData.doublesReliability,
                    duprLinkedAt: Date.now(),
                });

                // Update local state
                setCurrentUserProfile(prev => ({
                    ...prev,
                    duprId: loginData.duprId,
                    duprDisplayName: loginData.displayName,
                    duprSinglesRating: loginData.singles,
                    duprDoublesRating: loginData.doubles,
                }));

                // Close modal after successful link
                setShowDuprRequiredModal(false);
            } catch (error) {
                console.error('Failed to link DUPR account:', error);
            } finally {
                setDuprLinking(false);
            }
        };

        window.addEventListener('message', handleDuprMessage);
        return () => window.removeEventListener('message', handleDuprMessage);
    }, [showDuprRequiredModal, userProfile.id]);

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
            // Check if Stripe payment is required
            const needsStripePayment = selectedPaymentMethod === 'stripe' && feeBreakdown.hasFees && tournament.stripeConnectedAccountId;

            if (needsStripePayment) {
                // Save registration progress first (so we can resume after Stripe)
                await saveRegistration({
                    ...regData,
                    partnerDetails: isWaiverOnly ? (regData.partnerDetails || {}) : (partnerDetails || {}),
                    status: 'pending_payment',
                    paymentStatus: 'pending',
                    updatedAt: Date.now(),
                } as TournamentRegistration);

                // Calculate total with processing fees
                const totalWithFees = feeBreakdown.totalFee +
                    Math.round(feeBreakdown.totalFee * PLATFORM_FEE_PERCENT) +
                    Math.round(feeBreakdown.totalFee * STRIPE_FEE_PERCENT) +
                    STRIPE_FIXED_FEE;

                // Create Stripe checkout session
                const registrationId = regData.id || `${userProfile.id}_${tournament.id}`;
                const { url } = await createCheckoutSession({
                    items: [{
                        name: `${tournament.name} - Tournament Entry`,
                        description: feeBreakdown.items.map(i => i.divisionName).join(', '),
                        amount: totalWithFees,
                        quantity: 1,
                    }],
                    successUrl: `${window.location.origin}/#/tournaments/${tournament.id}?payment=success`,
                    cancelUrl: `${window.location.origin}/#/tournaments/${tournament.id}?payment=cancelled`,
                    metadata: {
                        type: 'tournament',
                        tournamentId: tournament.id,
                        odUserId: userProfile.id,
                        registrationId: registrationId,
                        divisionIds: JSON.stringify(regData.selectedEventIds),
                        partnerDetails: JSON.stringify(partnerDetails),
                    },
                    organizerStripeAccountId: tournament.stripeConnectedAccountId || undefined,
                });

                // Redirect to Stripe checkout
                await redirectToCheckout(url);
                return; // Don't continue - user will be redirected
            }

            // Manual payment or free event - finalize directly
            const payload = {
                ...(regData as TournamentRegistration),
                partnerDetails: isWaiverOnly ? (regData.partnerDetails || {}) : (partnerDetails || {}),
                paymentMethod: isFreeEvent ? null : selectedPaymentMethod,
            };
            await finalizeRegistration(payload);
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

            {/* DUPR Required Modal (V07.24) */}
            {showDuprRequiredModal && (
                <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-[70] rounded-lg p-4 backdrop-blur-sm">
                    <div className="bg-gray-800 p-6 rounded-lg border border-lime-500/50 shadow-2xl max-w-md w-full text-center">
                        <div className="w-16 h-16 mx-auto mb-4 bg-lime-500/20 rounded-full flex items-center justify-center">
                            <svg className="w-8 h-8 text-lime-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">DUPR Account Required</h3>
                        <p className="text-gray-300 mb-4 text-sm">
                            This tournament requires a linked DUPR account for match result submissions.
                            Please link your DUPR account to continue with registration.
                        </p>

                        {duprLinking ? (
                            <div className="py-8">
                                <div className="animate-spin w-8 h-8 border-2 border-lime-500 border-t-transparent rounded-full mx-auto mb-3"></div>
                                <p className="text-gray-400 text-sm">Linking your DUPR account...</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="bg-gray-900 rounded-lg p-2 border border-gray-700">
                                    <iframe
                                        src={getDuprLoginIframeUrl()}
                                        className="w-full h-[400px] rounded"
                                        title="Link DUPR Account"
                                    />
                                </div>
                                <p className="text-xs text-gray-500">
                                    Sign in with your DUPR credentials above to link your account.
                                </p>
                            </div>
                        )}

                        <button
                            onClick={onClose}
                            className="mt-4 px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium transition-colors"
                        >
                            Cancel Registration
                        </button>
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

                                        // Capacity checking
                                        const teamCount = divisionTeamCounts[div.id] ?? 0;
                                        const maxTeams = div.maxTeams;
                                        const isFull = maxTeams ? teamCount >= maxTeams : false;
                                        const isAtCapacity = isFull && !hasExistingTeam && !isSelected;

                                        if (isWaiverOnly && div.id !== initialDivisionId) return null;
                                        return (
                                            <div
                                                key={div.id}
                                                onClick={() => {
                                                    if (isWaiverOnly) return;
                                                    if (!eligible) return;
                                                    if (isAtCapacity) return; // Prevent selecting full divisions
                                                    if (hasExistingTeam) return; // Prevent deselecting if they have a team, must use withdraw button
                                                    const current = regData.selectedEventIds;
                                                    const next = current.includes(div.id) ? current.filter(x => x !== div.id) : [...current, div.id];
                                                    handleSave({ selectedEventIds: next });
                                                }}
                                                className={`p-4 rounded border flex justify-between items-center transition-all ${!eligible || isAtCapacity ? 'bg-gray-800 border-gray-700 opacity-60 cursor-not-allowed' : isSelected ? 'bg-green-900/40 border-green-500 cursor-pointer shadow-[0_0_10px_rgba(34,197,94,0.1)]' : 'bg-gray-700 border-gray-600 hover:bg-gray-600 cursor-pointer'}`}
                                            >
                                                <div>
                                                    <div className={`font-bold ${isSelected ? 'text-green-400' : 'text-white'}`}>{div.name}</div>
                                                    <div className="text-xs text-gray-400 mt-1 flex flex-wrap gap-2">
                                                        <span className="capitalize">{div.type}</span>
                                                        <span>•</span>
                                                        <span className="capitalize">{div.gender}</span>
                                                        {div.minRating && <span>• {div.minRating}+ Rating</span>}
                                                        {div.minAge && <span>• Age {div.minAge}+</span>}
                                                        {maxTeams && (
                                                            <span className={isFull ? 'text-red-400' : 'text-gray-400'}>
                                                                • {teamCount}/{maxTeams} teams
                                                            </span>
                                                        )}
                                                        {(div.entryFee || tournament.entryFee > 0) && (
                                                            <span className="text-green-400">
                                                                • ${((div.entryFee || tournament.entryFee) / 100).toFixed(0)}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {isAtCapacity ? (
                                                    <div className="text-xs font-bold text-orange-400 border border-orange-900 bg-orange-900/20 px-2 py-1 rounded whitespace-nowrap">Division Full</div>
                                                ) : !eligible ? (
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
                                    onPartnerDuprError={setError}
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

                                {/* Tournament Sponsors */}
                                {tournament.sponsors && tournament.sponsors.filter(s => s.isActive).length > 0 && (
                                    <div className="bg-gray-900 rounded-lg p-4 border border-gray-700 mt-4">
                                        <h4 className="text-sm font-medium text-gray-400 mb-3">Tournament Sponsors</h4>
                                        <SponsorLogoStrip
                                            sponsors={tournament.sponsors.filter(s => s.isActive)}
                                            variant="registration"
                                        />
                                    </div>
                                )}

                                {/* Fee Summary & Payment Method Choice */}
                                {feeBreakdown.hasFees && !isFreeEvent && (
                                    <div className="bg-gray-900 rounded-lg p-4 border border-gray-700 mt-4">
                                        <h4 className="text-white font-semibold mb-3">Entry Fees</h4>
                                        <div className="space-y-2">
                                            {feeBreakdown.items.map(item => (
                                                <div key={item.divisionId} className="flex justify-between text-sm">
                                                    <span className="text-gray-400">{item.divisionName}</span>
                                                    <span className="text-white">${(item.fee / 100).toFixed(2)}</span>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Payment Method Selection */}
                                        <div className="mt-4 pt-4 border-t border-gray-700">
                                            <h5 className="text-sm font-medium text-gray-300 mb-3">How would you like to pay?</h5>
                                            <div className="space-y-3">
                                                {/* Bank Transfer / EFT Option */}
                                                <label
                                                    className={`block p-3 rounded-lg border cursor-pointer transition-all ${
                                                        selectedPaymentMethod === 'manual'
                                                            ? 'border-blue-500 bg-blue-900/20'
                                                            : 'border-gray-600 bg-gray-800 hover:border-gray-500'
                                                    }`}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <input
                                                            type="radio"
                                                            name="paymentMethod"
                                                            checked={selectedPaymentMethod === 'manual'}
                                                            onChange={() => setSelectedPaymentMethod('manual')}
                                                            className="mt-1 w-4 h-4 text-blue-600"
                                                        />
                                                        <div className="flex-1">
                                                            <div className="flex items-center justify-between">
                                                                <span className="font-medium text-white">Bank Transfer / EFT</span>
                                                                <span className="text-blue-400 font-bold">
                                                                    ${(feeBreakdown.totalFee / 100).toFixed(2)}
                                                                </span>
                                                            </div>
                                                            <div className="text-xs text-gray-400 mt-1">
                                                                No processing fees - pay via direct deposit
                                                            </div>
                                                            <div className="text-xs text-amber-500 mt-1">⏳ Pending until organizer confirms payment</div>
                                                        </div>
                                                    </div>
                                                </label>

                                                {/* Show bank details when manual is selected and organizer provided them */}
                                                {selectedPaymentMethod === 'manual' && tournament.showBankDetails && tournament.bankDetails && (
                                                    <div className="ml-7 p-3 bg-gray-800 rounded-lg border border-gray-700">
                                                        <h6 className="text-xs font-medium text-gray-400 uppercase mb-2">Bank Details</h6>
                                                        <div className="space-y-1 text-sm">
                                                            {tournament.bankDetails.bankName && (
                                                                <div className="flex justify-between">
                                                                    <span className="text-gray-500">Bank</span>
                                                                    <span className="text-white">{tournament.bankDetails.bankName}</span>
                                                                </div>
                                                            )}
                                                            {tournament.bankDetails.accountName && (
                                                                <div className="flex justify-between">
                                                                    <span className="text-gray-500">Account Name</span>
                                                                    <span className="text-white">{tournament.bankDetails.accountName}</span>
                                                                </div>
                                                            )}
                                                            {tournament.bankDetails.accountNumber && (
                                                                <div className="flex justify-between">
                                                                    <span className="text-gray-500">Account Number</span>
                                                                    <span className="text-white font-mono">{tournament.bankDetails.accountNumber}</span>
                                                                </div>
                                                            )}
                                                            {tournament.bankDetails.reference && (
                                                                <div className="mt-2 pt-2 border-t border-gray-700">
                                                                    <span className="text-gray-500 text-xs">Reference:</span>
                                                                    <p className="text-amber-400 text-xs mt-1">{tournament.bankDetails.reference}</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-gray-500 mt-3">
                                                            Please use your name as reference so the organizer can match your payment.
                                                        </p>
                                                    </div>
                                                )}

                                                {/* Show message when manual selected but no bank details */}
                                                {selectedPaymentMethod === 'manual' && !tournament.showBankDetails && (
                                                    <div className="ml-7 p-3 bg-gray-800 rounded-lg border border-gray-700">
                                                        <p className="text-sm text-gray-400">
                                                            The organizer will contact you with payment instructions after registration.
                                                        </p>
                                                    </div>
                                                )}

                                                {/* Warning notice for manual payment */}
                                                {selectedPaymentMethod === 'manual' && (
                                                    <div className="ml-7 mt-3 p-3 bg-amber-900/30 rounded-lg border border-amber-700/50">
                                                        <div className="flex items-start gap-2">
                                                            <span className="text-amber-500 text-lg">⚠️</span>
                                                            <div className="flex-1">
                                                                <p className="text-sm text-amber-200 font-medium mb-1">
                                                                    Important: Your spot is not guaranteed
                                                                </p>
                                                                <p className="text-xs text-amber-200/80 mb-2">
                                                                    Bank transfer registrations require manual verification by the organizer, which may take 1-3 business days.
                                                                    During this time, if other players register and pay online, the tournament may reach capacity before your payment is confirmed.
                                                                </p>
                                                                <p className="text-xs text-amber-200/80 mb-3">
                                                                    If spots fill up while your payment is pending, you may not be registered and will need to request a refund.
                                                                </p>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setSelectedPaymentMethod('stripe')}
                                                                    className="text-xs px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded font-medium transition-colors"
                                                                >
                                                                    Pay Online Instead - Secure Your Spot Instantly
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Online Payment Option (Stripe) */}
                                                <label
                                                    className={`block p-3 rounded-lg border cursor-pointer transition-all ${
                                                        selectedPaymentMethod === 'stripe'
                                                            ? 'border-green-500 bg-green-900/20'
                                                            : 'border-gray-600 bg-gray-800 hover:border-gray-500'
                                                    }`}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <input
                                                            type="radio"
                                                            name="paymentMethod"
                                                            checked={selectedPaymentMethod === 'stripe'}
                                                            onChange={() => setSelectedPaymentMethod('stripe')}
                                                            className="mt-1 w-4 h-4 text-green-600"
                                                        />
                                                        <div className="flex-1">
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-medium text-white">Pay via Stripe</span>
                                                                    <span className="px-1.5 py-0.5 bg-green-900/50 text-green-400 text-[10px] rounded font-medium">INSTANT</span>
                                                                </div>
                                                                <span className="text-green-400 font-bold">
                                                                    ${((feeBreakdown.totalFee + Math.round(feeBreakdown.totalFee * PLATFORM_FEE_PERCENT) + Math.round(feeBreakdown.totalFee * STRIPE_FEE_PERCENT) + STRIPE_FIXED_FEE) / 100).toFixed(2)}
                                                                </span>
                                                            </div>
                                                            <div className="text-xs text-gray-400 mt-1">
                                                                ${(feeBreakdown.totalFee / 100).toFixed(2)} + ${((Math.round(feeBreakdown.totalFee * PLATFORM_FEE_PERCENT) + Math.round(feeBreakdown.totalFee * STRIPE_FEE_PERCENT) + STRIPE_FIXED_FEE) / 100).toFixed(2)} processing
                                                            </div>
                                                            <div className="text-xs text-green-500 mt-1">✓ Instant confirmation - start playing immediately</div>
                                                        </div>
                                                    </div>
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                )}

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