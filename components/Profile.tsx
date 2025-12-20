/**
 * Profile Component
 * 
 * User profile management with:
 * - Personal info (name, email, DOB, etc.)
 * - DUPR SSO integration (Login with DUPR) - NO MANUAL ENTRY
 * - Profile photo upload
 * - Stripe Connect for organizers
 * 
 * FILE LOCATION: components/Profile.tsx
 * VERSION: V05.17 - Updated DUPR to use SSO only
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { FirebaseError } from '@firebase/app';
import { COUNTRIES, COUNTRY_REGIONS } from '../constants/locations';
import { UserStripeConnect } from './profile/UserStripeConnect';
import { DuprConnect } from './profile/DuprConnect';

// Gender type defined locally since not exported from types
type UserGender = 'male' | 'female' | 'other';

const getFriendlyErrorMessage = (error: FirebaseError): string => {
    switch (error.code) {
        case 'auth/invalid-email':
            return 'The new email address is not valid.';
        case 'auth/email-already-in-use':
            return 'This email address is already in use by another account.';
        case 'auth/requires-recent-login':
            return 'This action is sensitive and requires recent authentication. Please log out and log back in to update your email.';
        default:
            return 'An unexpected error occurred. Please try again.';
    }
};

const HEIGHT_OPTIONS: string[] = [];
for (let f = 4; f <= 7; f++) {
    for (let i = 0; i < 12; i++) {
        if (f === 7 && i > 2) break; // Stop at 7'2"
        const cm = Math.round((f * 30.48) + (i * 2.54));
        HEIGHT_OPTIONS.push(`${f}'${i}" (${cm} cm)`);
    }
}

interface ProfileProps {
    onBack: () => void;
}

export const Profile: React.FC<ProfileProps> = ({ onBack }) => {
    const { currentUser, userProfile, updateUserProfile, updateUserEmail, updateUserExtendedProfile } = useAuth();
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // Cast userProfile to any to access extended fields stored via updateUserExtendedProfile
    const extendedProfile = userProfile as any;
    
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [dob, setDob] = useState('');
    const [gender, setGender] = useState<UserGender | ''>('');
    const [country, setCountry] = useState('NZL');
    const [region, setRegion] = useState('');
    const [phone, setPhone] = useState('');
    const [playsHand, setPlaysHand] = useState<'right'|'left'|''>('');
    const [height, setHeight] = useState('');
    
    // Image States
    const [photoData, setPhotoData] = useState('');
    const [photoMimeType, setPhotoMimeType] = useState('');

    const [isEditingEmail, setIsEditingEmail] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    useEffect(() => {
        if (userProfile) {
            // Prefer loaded profile data
            const [first = '', last = ''] = (userProfile.displayName || '').split(' ');
            setFirstName(first);
            setLastName(last);
            setEmail(userProfile.email || currentUser?.email || '');
            setDob(userProfile.birthDate || '');
            setGender((userProfile.gender as UserGender) || '');
            setCountry(extendedProfile?.country || 'NZL');
            setRegion(userProfile.region || '');
            setPhone(userProfile.phone || '');
            setPlaysHand(extendedProfile?.playsHand || '');
            setHeight(extendedProfile?.height || '');
            
            setPhotoData(extendedProfile?.photoData || '');
            setPhotoMimeType(extendedProfile?.photoMimeType || '');
        } else if (currentUser) {
            // Fallback to Auth data
            const [first = '', last = ''] = (currentUser.displayName || '').split(' ');
            setFirstName(first);
            setLastName(last);
            setEmail(currentUser.email || '');
        }
    }, [currentUser, userProfile, extendedProfile]);

    // Construct the display source: Data URI -> Storage URL -> Initials Placeholder
    const displayPhotoSrc = useMemo(() => {
        if (photoData) return photoData;
        if (userProfile?.photoURL) return userProfile.photoURL;
        if (currentUser?.photoURL) return currentUser.photoURL;
        return null;
    }, [photoData, userProfile, currentUser]);

    const calculatedAge = useMemo(() => {
        if (!dob) return null;
        try {
            const birthDate = new Date(dob);
            if (isNaN(birthDate.getTime())) return null;
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const m = today.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }
            return age >= 0 ? age : null;
        } catch {
            return null;
        }
    }, [dob]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            const file = event.target.files[0];
            
            // Basic validation
            if (file.size > 1024 * 1024) {
                setError("Image size must be less than 1MB for database storage.");
                return;
            }
            if (!file.type.startsWith('image/')) {
                setError("Please upload an image file.");
                return;
            }

            setError(null);
            
            // Convert to Base64
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                setPhotoData(result);
                setPhotoMimeType(file.type);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);
        setIsLoading(true);

        if (!currentUser) {
            setError("You must be logged in to update your profile.");
            setIsLoading(false);
            return;
        }

        const promises = [];
        const newDisplayName = `${firstName.trim()} ${lastName.trim()}`.trim();

        // Update Name (Auth + DB)
        if (newDisplayName !== currentUser.displayName) {
            promises.push(updateUserProfile(newDisplayName));
        }

        // Update Email (Auth + DB)
        if (email.trim() !== currentUser.email) {
            promises.push(updateUserEmail(email.trim()));
        } else if (userProfile && !userProfile.email && email.trim()) {
            promises.push(updateUserExtendedProfile({ email: email.trim() }));
        }

        // Update Extended Details (DB Only)
        // NOTE: DUPR fields are now managed by DuprConnect component via SSO
        const extendedData: Record<string, any> = {
            birthDate: dob,
            gender: gender || null,
            country,
            region,
            phone,
            playsHand: playsHand as 'right' | 'left',
            height,
            photoData: photoData || null,
            photoMimeType: photoMimeType || null,
            updatedAt: Date.now()
        };
        promises.push(updateUserExtendedProfile(extendedData));

        try {
            await Promise.all(promises);
            setSuccessMessage("Profile updated successfully!");
            if (email.trim() !== currentUser.email) {
                setSuccessMessage("Profile updated! A verification email has been sent to your new address.");
            }
            setIsEditingEmail(false);
        } catch (err: any) {
            if (err instanceof FirebaseError) {
                setError(getFriendlyErrorMessage(err));
            } else {
                setError('An unexpected error occurred during update.');
                console.error(err);
            }
        } finally {
            setIsLoading(false);
        }
    };
    
    if (!currentUser) {
        return <div className="text-center p-10">Loading profile...</div>;
    }

    const availableRegions = COUNTRY_REGIONS[country];

    return (
        <div className="max-w-4xl mx-auto">
            <button
                onClick={onBack}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-green-400 transition-colors mb-4 focus:outline-none focus:ring-2 focus:ring-green-500 rounded-md p-1"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Back to Dashboard
            </button>
            
            <div className="bg-gray-800 rounded-lg p-8 shadow-lg border border-gray-700">
                <h2 className="text-3xl font-bold mb-6 text-green-400">My Profile</h2>

                <form onSubmit={handleSubmit} className="space-y-6">
                    
                    {/* Profile Picture Upload Section */}
                    <div className="flex flex-col items-center justify-center mb-8">
                        <div className="relative group">
                            <div className="w-32 h-32 rounded-full bg-gray-700 border-4 border-gray-600 overflow-hidden flex items-center justify-center shadow-2xl relative">
                                {displayPhotoSrc ? (
                                    <img src={displayPhotoSrc} alt="Profile" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-4xl font-bold text-gray-500">
                                        {firstName?.charAt(0) || currentUser?.displayName?.charAt(0) || '?'}
                                    </span>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="absolute bottom-0 right-0 bg-green-600 hover:bg-green-500 text-white p-2.5 rounded-full shadow-lg transition-transform transform group-hover:scale-110"
                                title="Change Photo"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            </button>
                        </div>
                        
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={handleFileChange} 
                            accept="image/*" 
                            className="hidden" 
                        />
                        <p className="text-xs text-gray-500 mt-2">JPG or PNG (Max 1MB).</p>
                    </div>

                    {/* Name Fields */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label htmlFor="firstName" className="block text-sm font-medium text-gray-300 mb-2">First Name</label>
                            <input type="text" id="firstName" value={firstName} onChange={e => setFirstName(e.target.value)} className="w-full bg-gray-700 text-white rounded-md px-4 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500" />
                        </div>
                        <div>
                            <label htmlFor="lastName" className="block text-sm font-medium text-gray-300 mb-2">Last Name</label>
                            <input type="text" id="lastName" value={lastName} onChange={e => setLastName(e.target.value)} className="w-full bg-gray-700 text-white rounded-md px-4 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500" />
                        </div>
                    </div>

                    {/* Email Field */}
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">Email Address</label>
                        <div className="flex items-center gap-2">
                            <input type="email" id="email" value={email} onChange={e => setEmail(e.target.value)} readOnly={!isEditingEmail} className="flex-grow bg-gray-700 text-white rounded-md px-4 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500 read-only:bg-gray-700/50 read-only:text-gray-400" />
                            <button type="button" onClick={() => setIsEditingEmail(!isEditingEmail)} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md transition-colors text-sm">
                                {isEditingEmail ? 'Cancel' : 'Edit'}
                            </button>
                        </div>
                    </div>

                    {/* DOB and Gender */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label htmlFor="dob" className="block text-sm font-medium text-gray-300 mb-2">
                                Date of Birth {calculatedAge !== null && <span className="text-gray-500">({calculatedAge} years old)</span>}
                            </label>
                            <input type="date" id="dob" value={dob} onChange={e => setDob(e.target.value)} className="w-full bg-gray-700 text-white rounded-md px-4 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500" />
                        </div>
                        <div>
                            <label htmlFor="gender" className="block text-sm font-medium text-gray-300 mb-2">Gender</label>
                            <select id="gender" value={gender} onChange={e => setGender(e.target.value as UserGender | '')} className="w-full bg-gray-700 text-white rounded-md px-4 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500">
                                <option value="">Prefer not to say</option>
                                <option value="male">Male</option>
                                <option value="female">Female</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                    </div>

                    {/* Country and Region */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label htmlFor="country" className="block text-sm font-medium text-gray-300 mb-2">Country</label>
                            <select id="country" value={country} onChange={e => { setCountry(e.target.value); setRegion(''); }} className="w-full bg-gray-700 text-white rounded-md px-4 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500">
                                {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="region" className="block text-sm font-medium text-gray-300 mb-2">Region/State</label>
                            <select id="region" value={region} onChange={e => setRegion(e.target.value)} disabled={!availableRegions || availableRegions.length === 0} className="w-full bg-gray-700 text-white rounded-md px-4 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50">
                                <option value="">Select region...</option>
                                {availableRegions?.map((r: string) => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Phone and Hand */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label htmlFor="phone" className="block text-sm font-medium text-gray-300 mb-2">Phone Number <span className="text-gray-500">(Optional)</span></label>
                            <input type="tel" id="phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 555-0123" className="w-full bg-gray-700 text-white rounded-md px-4 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500" />
                        </div>
                        <div>
                            <label htmlFor="playsHand" className="block text-sm font-medium text-gray-300 mb-2">Playing Hand</label>
                            <select id="playsHand" value={playsHand} onChange={e => setPlaysHand(e.target.value as 'right' | 'left' | '')} className="w-full bg-gray-700 text-white rounded-md px-4 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500">
                                <option value="">Select...</option>
                                <option value="right">Right-Handed</option>
                                <option value="left">Left-Handed</option>
                            </select>
                        </div>
                    </div>

                    {/* Height */}
                    <div>
                        <label htmlFor="height" className="block text-sm font-medium text-gray-300 mb-2">Height <span className="text-gray-500">(Optional)</span></label>
                        <select id="height" value={height} onChange={e => setHeight(e.target.value)} className="w-full bg-gray-700 text-white rounded-md px-4 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500">
                            <option value="">Select...</option>
                            {HEIGHT_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                    </div>
                    
                    {error && <p className="text-red-400 text-sm text-center bg-red-900/50 p-3 rounded-md">{error}</p>}
                    {successMessage && <p className="text-green-300 text-sm text-center bg-green-900/50 p-3 rounded-md">{successMessage}</p>}

                    <div className="pt-4">
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-md transition-colors duration-200 disabled:bg-gray-500 disabled:cursor-not-allowed"
                        >
                            {isLoading ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
                
                {/* ============================================ */}
                {/* DUPR CONNECT SECTION - SSO ONLY */}
                {/* ============================================ */}
                <div className="mt-8 pt-8 border-t border-gray-700">
                    <DuprConnect />
                </div>
                
                {/* ============================================ */}
                {/* STRIPE CONNECT SECTION */}
                {/* ============================================ */}
                <div className="mt-8 pt-8 border-t border-gray-700">
                    <UserStripeConnect />
                </div>
            </div>
        </div>
    );
};