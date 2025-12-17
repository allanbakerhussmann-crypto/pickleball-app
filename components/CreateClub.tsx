import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { createClub } from '../services/firebase';
import { COUNTRIES, COUNTRY_REGIONS } from '../constants/locations';

interface CreateClubProps {
    onClubCreated: () => void;
    onCancel: () => void;
}

export const CreateClub: React.FC<CreateClubProps> = ({ onClubCreated, onCancel }) => {
    // FIXED: Added isOrganizer to allow organizers to create clubs
    const { currentUser, isAppAdmin, isOrganizer } = useAuth();
    const [name, setName] = useState('');
    const [slug, setSlug] = useState('');
    const [description, setDescription] = useState('');
    const [logoUrl, setLogoUrl] = useState('');
    const [region, setRegion] = useState('');
    const [country, setCountry] = useState('NZL');
    
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Auto-generate slug from name
    useEffect(() => {
        if (name) {
            const generated = name.toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');
            setSlug(generated);
        }
    }, [name]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!currentUser) return;
        if (!name.trim()) {
            setError('Club name is required.');
            return;
        }
        
        if (!region && COUNTRY_REGIONS[country]) {
             setError('Please select a region.');
             return;
        }

        setIsSubmitting(true);

        try {
            await createClub({
                name,
                slug,
                description,
                logoUrl,
                region,
                country,
                createdByUserId: currentUser.uid,
                admins: [currentUser.uid],
                members: [currentUser.uid]
            });
            onClubCreated();
        } catch (err: any) {
            console.error("Error creating club:", err);
            setError("Failed to create club. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // FIXED: Allow both App Admins AND Organizers to create clubs
    if (!isAppAdmin && !isOrganizer) {
        return (
            <div className="p-8 text-center bg-gray-800 rounded-lg">
                <h2 className="text-xl font-bold text-red-400">Restricted Access</h2>
                <p className="text-gray-400 mt-2">Only Organizers and App Admins can create new clubs.</p>
                <button onClick={onCancel} className="mt-4 text-gray-400 hover:text-white underline">Back</button>
            </div>
        );
    }
    
    const availableRegions = COUNTRY_REGIONS[country];

    return (
        <div className="max-w-2xl mx-auto bg-gray-800 rounded-lg p-8 border border-gray-700 shadow-xl mt-8">
            <h2 className="text-2xl font-bold text-white mb-2">Create New Club</h2>
            <p className="text-gray-400 mb-6 text-sm">
                Establish a new club entity for hosting tournaments.
            </p>

            {error && (
                <div className="bg-red-900/50 border border-red-800 text-red-200 p-3 rounded mb-6 text-sm">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">Club Name <span className="text-red-400">*</span></label>
                    <input 
                        type="text" 
                        id="name"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="e.g., Bishopdale Pickleball Club"
                        className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                    />
                </div>

                <div>
                    <label htmlFor="slug" className="block text-sm font-medium text-gray-300 mb-1">Unique ID (Slug)</label>
                    <input 
                        type="text" 
                        id="slug"
                        value={slug}
                        onChange={e => setSlug(e.target.value)}
                        className="w-full bg-gray-900 text-gray-400 p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">Auto-generated. Used for URLs.</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label htmlFor="country" className="block text-sm font-medium text-gray-300 mb-1">Country</label>
                        <select 
                            id="country"
                            value={country}
                            onChange={e => { setCountry(e.target.value); setRegion(''); }}
                            className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                        >
                            {COUNTRIES.map(c => (
                                <option key={c.code} value={c.code}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="region" className="block text-sm font-medium text-gray-300 mb-1">Region</label>
                        {availableRegions ? (
                            <select 
                                id="region"
                                value={region}
                                onChange={e => setRegion(e.target.value)}
                                className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                            >
                                <option value="">Select Region...</option>
                                {availableRegions.map(r => (
                                    <option key={r} value={r}>{r}</option>
                                ))}
                            </select>
                        ) : (
                            <input 
                                type="text" 
                                id="region"
                                value={region}
                                onChange={e => setRegion(e.target.value)}
                                placeholder="State / Province"
                                className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                            />
                        )}
                    </div>
                </div>

                <div>
                    <label htmlFor="description" className="block text-sm font-medium text-gray-300 mb-1">Description</label>
                    <textarea 
                        id="description"
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="A brief description of your club..."
                        rows={3}
                        className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none resize-none"
                    />
                </div>

                <div>
                    <label htmlFor="logoUrl" className="block text-sm font-medium text-gray-300 mb-1">Logo URL (optional)</label>
                    <input 
                        type="url" 
                        id="logoUrl"
                        value={logoUrl}
                        onChange={e => setLogoUrl(e.target.value)}
                        placeholder="https://example.com/logo.png"
                        className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                    />
                </div>

                <div className="flex justify-end gap-4 pt-4">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-6 py-2 rounded font-semibold text-gray-400 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white px-6 py-2 rounded font-bold transition-colors"
                    >
                        {isSubmitting ? 'Creating...' : 'Create Club'}
                    </button>
                </div>
            </form>
        </div>
    );
};