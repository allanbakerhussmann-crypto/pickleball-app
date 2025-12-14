
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { FirebaseError } from 'firebase/app';
import { updateProfile } from 'firebase/auth';
import { fetchDuprRatings } from '../services/duprService';
import type { UserGender } from '../types';

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

const COUNTRIES = [
    { code: 'NZL', name: 'New Zealand' },
    { code: 'AUS', name: 'Australia' },
    { code: 'USA', name: 'United States' },
    { code: 'GBR', name: 'United Kingdom' },
    { code: 'CAN', name: 'Canada' },
    { code: 'FRA', name: 'France' },
    { code: 'DEU', name: 'Germany' },
    { code: 'JPN', name: 'Japan' },
    { code: 'CHN', name: 'China' },
    { code: 'IND', name: 'India' },
    { code: 'BRA', name: 'Brazil' },
    { code: 'ITA', name: 'Italy' },
    { code: 'ESP', name: 'Spain' },
    { code: 'NLD', name: 'Netherlands' },
    { code: 'SWE', name: 'Sweden' },
    { code: 'KOR', name: 'South Korea' },
    { code: 'ZAF', name: 'South Africa' },
    { code: 'MEX', name: 'Mexico' },
].sort((a, b) => a.name.localeCompare(b.name));

const COUNTRY_REGIONS: Record<string, string[]> = {
    NZL: ["Northland", "Auckland", "Waikato", "Bay of Plenty", "Gisborne", "Hawke's Bay", "Taranaki", "Manawatū-Whanganui", "Wellington", "Tasman", "Nelson", "Marlborough", "West Coast", "Canterbury", "Otago", "Southland"],
    AUS: ["New South Wales", "Victoria", "Queensland", "Western Australia", "South Australia", "Tasmania", "Australian Capital Territory", "Northern Territory"],
    USA: ["Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming", "District of Columbia"],
    GBR: ["England", "Scotland", "Wales", "Northern Ireland"],
    CAN: ["Alberta", "British Columbia", "Manitoba", "New Brunswick", "Newfoundland and Labrador", "Nova Scotia", "Ontario", "Prince Edward Island", "Quebec", "Saskatchewan", "Northwest Territories", "Nunavut", "Yukon"],
    FRA: ["Auvergne-Rhône-Alpes", "Bourgogne-Franche-Comté", "Brittany", "Centre-Val de Loire", "Corsica", "Grand Est", "Hauts-de-France", "Île-de-France", "Normandy", "Nouvelle-Aquitaine", "Occitanie", "Pays de la Loire", "Provence-Alpes-Côte d'Azur"],
    DEU: ["Baden-Württemberg", "Bavaria", "Berlin", "Brandenburg", "Bremen", "Hamburg", "Hesse", "Lower Saxony", "Mecklenburg-Vorpommern", "North Rhine-Westphalia", "Rhineland-Palatinate", "Saarland", "Saxony", "Saxony-Anhalt", "Schleswig-Holstein", "Thuringia"],
    JPN: ["Hokkaido", "Tohoku", "Kanto", "Chubu", "Kansai", "Chugoku", "Shikoku", "Kyushu", "Okinawa"],
    CHN: ["Anhui", "Beijing", "Chongqing", "Fujian", "Gansu", "Guangdong", "Guangxi", "Guizhou", "Hainan", "Hebei", "Heilongjiang", "Henan", "Hubei", "Hunan", "Inner Mongolia", "Jiangsu", "Jiangxi", "Jilin", "Liaoning", "Ningxia", "Qinghai", "Shaanxi", "Shandong", "Shanghai", "Shanxi", "Sichuan", "Tianjin", "Tibet", "Xinjiang", "Yunnan", "Zhejiang"],
    IND: ["Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"],
    BRA: ["Acre", "Alagoas", "Amapá", "Amazonas", "Bahia", "Ceará", "Distrito Federal", "Espírito Santo", "Goiás", "Maranhão", "Mato Grosso", "Mato Grosso do Sul", "Minas Gerais", "Pará", "Paraíba", "Paraná", "Pernambuco", "Piauí", "Rio de Janeiro", "Rio Grande do Norte", "Rio Grande do Sul", "Rondônia", "Roraima", "Santa Catarina", "São Paulo", "Sergipe", "Tocantins"],
    ITA: ["Abruzzo", "Basilicata", "Calabria", "Campania", "Emilia-Romagna", "Friuli Venezia Giulia", "Lazio", "Liguria", "Lombardy", "Marche", "Molise", "Piedmont", "Apulia", "Sardinia", "Sicily", "Tuscany", "Trentino-Alto Adige/Südtirol", "Umbria", "Valle d'Aosta", "Veneto"],
    ESP: ["Andalusia", "Aragon", "Asturias", "Balearic Islands", "Basque Country", "Canary Islands", "Cantabria", "Castile and León", "Castilla-La Mancha", "Catalonia", "Extremadura", "Galicia", "La Rioja", "Madrid", "Murcia", "Navarre", "Valencia"],
    NLD: ["Drenthe", "Flevoland", "Friesland", "Gelderland", "Groningen", "Limburg", "North Brabant", "North Holland", "Overijssel", "South Holland", "Utrecht", "Zeeland"],
    SWE: ["Blekinge", "Dalarna", "Gävleborg", "Gotland", "Halland", "Jämtland", "Jönköping", "Kalmar", "Kronoberg", "Norrbotten", "Örebro", "Östergötland", "Skåne", "Södermanland", "Stockholm", "Uppsala", "Värmland", "Västerbotten", "Västernorrland", "Västmanland", "Västra Götaland"],
    KOR: ["Seoul", "Busan", "Daegu", "Incheon", "Gwangju", "Daejeon", "Ulsan", "Sejong", "Gyeonggi", "Gangwon", "North Chungcheong", "South Chungcheong", "North Jeolla", "South Jeolla", "North Gyeongsang", "South Gyeongsang", "Jeju"],
    ZAF: ["Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo", "Mpumalanga", "North West", "Northern Cape", "Western Cape"],
    MEX: ["Aguascalientes", "Baja California", "Baja California Sur", "Campeche", "Chiapas", "Chihuahua", "Coahuila", "Colima", "Durango", "Guanajuato", "Guerrero", "Hidalgo", "Jalisco", "Mexico City", "Mexico State", "Michoacán", "Morelos", "Nayarit", "Nuevo León", "Oaxaca", "Puebla", "Querétaro", "Quintana Roo", "San Luis Potosí", "Sinaloa", "Sonora", "Tabasco", "Tamaulipas", "Tlaxcala", "Veracruz", "Yucatán", "Zacatecas"],
};

const HEIGHT_OPTIONS = [];
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
    
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [dob, setDob] = useState('');
    const [gender, setGender] = useState<UserGender | ''>('');
    const [country, setCountry] = useState('NZL');
    const [region, setRegion] = useState('');
    const [phone, setPhone] = useState('');
    const [duprId, setDuprId] = useState('');
    const [duprProfileUrl, setDuprProfileUrl] = useState('');
    const [duprSinglesRating, setDuprSinglesRating] = useState('');
    const [duprDoublesRating, setDuprDoublesRating] = useState('');
    const [playsHand, setPlaysHand] = useState<'right'|'left'|''>('');
    const [height, setHeight] = useState('');
    
    // New Image States
    const [photoData, setPhotoData] = useState('');
    const [photoMimeType, setPhotoMimeType] = useState('');

    const [isEditingEmail, setIsEditingEmail] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
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
            setGender(userProfile.gender || '');
            setCountry(userProfile.country || 'NZL');
            setRegion(userProfile.region || '');
            setPhone(userProfile.phone || '');
            setDuprId(userProfile.duprId || '');
            setDuprProfileUrl(userProfile.duprProfileUrl || '');
            setDuprSinglesRating(userProfile.duprSinglesRating?.toString() || '');
            setDuprDoublesRating(userProfile.duprDoublesRating?.toString() || '');
            setPlaysHand(userProfile.playsHand || '');
            setHeight(userProfile.height || '');
            
            setPhotoData(userProfile.photoData || '');
            setPhotoMimeType(userProfile.photoMimeType || '');
        } else if (currentUser) {
            // Fallback to Auth data
            const [first = '', last = ''] = (currentUser.displayName || '').split(' ');
            setFirstName(first);
            setLastName(last);
            setEmail(currentUser.email || '');
        }
    }, [currentUser, userProfile]);

    // Construct the display source: Data URI -> Storage URL -> Initials Placeholder
    const displayPhotoSrc = useMemo(() => {
        if (photoData) return photoData; // Data URI contains mime type usually
        if (userProfile?.photoURL) return userProfile.photoURL;
        if (currentUser?.photoURL) return currentUser.photoURL;
        return null;
    }, [photoData, userProfile, currentUser]);

    const calculatedAge = useMemo(() => {
        if (!dob) return null;
        try {
            const birthDate = new Date(dob);
            if (isNaN(birthDate.getTime())) return null; // Invalid date
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
            if (file.size > 1024 * 1024) { // Limit to 1MB for database storage
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
                setPhotoData(result); // "data:image/jpeg;base64,..."
                setPhotoMimeType(file.type);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSyncDupr = async () => {
        if (!duprProfileUrl && !duprId) return;
        
        setIsSyncing(true);
        setError(null);
        setSuccessMessage(null);

        try {
            // Prefer ID if explicitly set, otherwise try to extract from URL
            let idToUse = duprId;
            
            if (!idToUse && duprProfileUrl) {
                // Remove trailing slash
                const cleanUrl = duprProfileUrl.replace(/\/$/, "");
                const parts = cleanUrl.split('/');
                const lastPart = parts[parts.length - 1];
                
                // Simple check if it looks like an ID
                if (lastPart && lastPart.length > 4) {
                    idToUse = lastPart;
                    setDuprId(lastPart); // Auto-fill ID field
                }
            }

            if (!idToUse) idToUse = "test-id"; // Mock ID fallback

            const ratings = await fetchDuprRatings(idToUse);
            
            setDuprSinglesRating(ratings.singles.toString());
            setDuprDoublesRating(ratings.doubles.toString());
            
            setSuccessMessage("Ratings synced successfully! Click 'Save Changes' to apply.");
            setTimeout(() => setSuccessMessage(null), 5000);
        } catch (err) {
            console.error(err);
            setError("Failed to sync DUPR ratings. Please check your ID/URL.");
        } finally {
            setIsSyncing(false);
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
        const extendedData: Record<string, any> = {
            birthDate: dob,
            gender: gender || null,
            country,
            region,
            phone,
            duprId,
            duprProfileUrl,
            // Ensure we parse as floats to preserve decimals
            duprSinglesRating: duprSinglesRating ? parseFloat(duprSinglesRating) : null,
            duprDoublesRating: duprDoublesRating ? parseFloat(duprDoublesRating) : null,
            duprLastUpdatedManually: Date.now(),
            playsHand: playsHand as 'right' | 'left',
            height,
            // Save image data directly
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
                                    <div className="text-4xl font-bold text-gray-500 select-none">
                                        {firstName[0]}{lastName[0] || ''}
                                    </div>
                                )}
                                
                                {/* Hover Overlay for Upload */}
                                <div 
                                    className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <svg className="w-8 h-8 text-white mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                    <span className="text-xs font-bold text-white">Change Photo</span>
                                </div>
                            </div>
                            
                            {/* Camera Icon Button (Floating) */}
                            <button 
                                type="button" 
                                onClick={() => fileInputRef.current?.click()}
                                className="absolute bottom-0 right-0 bg-green-600 hover:bg-green-500 text-white p-2 rounded-full shadow-lg border-2 border-gray-800 z-20 transition-transform hover:scale-110"
                                title="Upload Photo"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            </button>
                         </div>
                         
                         {/* Hidden Input */}
                         <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={handleFileChange} 
                            accept="image/*" 
                            className="hidden" 
                         />
                         <p className="text-xs text-gray-500 mt-2">
                             JPG or PNG (Max 1MB).
                         </p>
                    </div>

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
                        {isEditingEmail && <p className="text-xs text-yellow-400 mt-2">Changing your email will require re-verification.</p>}
                    </div>

                    {/* DOB and Gender */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="dob" className="block text-sm font-medium text-gray-300 mb-2">Date of Birth</label>
                                <input
                                    type="date"
                                    id="dob"
                                    value={dob}
                                    onChange={e => setDob(e.target.value)}
                                    className="w-full bg-gray-700 text-white rounded-md px-4 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500"
                                    style={{ colorScheme: 'dark' }}
                                />
                            </div>
                            <div>
                                <label htmlFor="age" className="block text-sm font-medium text-gray-300 mb-2">Age</label>
                                <div className="w-full bg-gray-700/50 text-gray-300 rounded-md px-4 py-2 border border-gray-600/50 h-[42px] flex items-center justify-center font-medium">
                                    {calculatedAge !== null ? calculatedAge : '--'}
                                </div>
                            </div>
                        </div>
                        <div>
                            <label htmlFor="gender" className="block text-sm font-medium text-gray-300 mb-2">Gender</label>
                            <select 
                                id="gender" 
                                value={gender} 
                                onChange={e => setGender(e.target.value as UserGender)} 
                                className="w-full bg-gray-700 text-white rounded-md px-4 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500"
                            >
                                <option value="">Select...</option>
                                <option value="male">Male</option>
                                <option value="female">Female</option>
                            </select>
                        </div>
                    </div>

                    {/* Country & Region */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label htmlFor="country" className="block text-sm font-medium text-gray-300 mb-2">Country</label>
                            <select 
                                id="country" 
                                value={country} 
                                onChange={e => { setCountry(e.target.value); setRegion(''); }} 
                                className="w-full bg-gray-700 text-white rounded-md px-4 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500"
                            >
                                {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="region" className="block text-sm font-medium text-gray-300 mb-2">Region / State</label>
                            {availableRegions ? (
                                <select id="region" value={region} onChange={e => setRegion(e.target.value)} className="w-full bg-gray-700 text-white rounded-md px-4 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500">
                                    <option value="">Select Region...</option>
                                    {availableRegions.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            ) : (
                                <input type="text" id="region" value={region} onChange={e => setRegion(e.target.value)} className="w-full bg-gray-700 text-white rounded-md px-4 py-2 border border-gray-600" />
                            )}
                        </div>
                    </div>

                    {/* Hand & Height */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label htmlFor="playsHand" className="block text-sm font-medium text-gray-300 mb-2">Plays Hand</label>
                            <select id="playsHand" value={playsHand} onChange={e => setPlaysHand(e.target.value as any)} className="w-full bg-gray-700 text-white rounded-md px-4 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500">
                                <option value="">Select...</option>
                                <option value="right">Right</option>
                                <option value="left">Left</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="height" className="block text-sm font-medium text-gray-300 mb-2">Height</label>
                            <select id="height" value={height} onChange={e => setHeight(e.target.value)} className="w-full bg-gray-700 text-white rounded-md px-4 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500">
                                <option value="">Select Height...</option>
                                {HEIGHT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Phone & DUPR ID */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label htmlFor="phone" className="block text-sm font-medium text-gray-300 mb-2">Phone <span className="text-gray-500">(Optional)</span></label>
                            <input type="tel" id="phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. +1 555-0123" className="w-full bg-gray-700 text-white rounded-md px-4 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500" />
                        </div>
                        <div>
                            <label htmlFor="duprId" className="block text-sm font-medium text-gray-300 mb-2">DUPR ID <span className="text-gray-500">(Optional)</span></label>
                            <input type="text" id="duprId" value={duprId} onChange={e => setDuprId(e.target.value)} placeholder="e.g., 123456" className="w-full bg-gray-700 text-white rounded-md px-4 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500" />
                        </div>
                    </div>
                    
                    {/* DUPR Profile URL */}
                    <div>
                        <label htmlFor="duprProfileUrl" className="block text-sm font-medium text-gray-300 mb-2">DUPR Profile Link <span className="text-gray-500">(Optional)</span></label>
                        <div className="relative">
                            <input 
                                type="url" 
                                id="duprProfileUrl" 
                                value={duprProfileUrl} 
                                onChange={e => setDuprProfileUrl(e.target.value)} 
                                placeholder="https://mydupr.com/dashboard/player/..." 
                                className="w-full bg-gray-700 text-white rounded-md pl-4 pr-24 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500" 
                            />
                            <button
                                type="button"
                                onClick={handleSyncDupr}
                                disabled={(!duprProfileUrl && !duprId) || isSyncing}
                                className="absolute right-1.5 top-1.5 bottom-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white text-xs font-bold px-3 rounded transition-colors flex items-center gap-1 shadow-sm"
                            >
                                {isSyncing ? (
                                    <>
                                        <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                        Syncing
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                        Sync
                                    </>
                                )}
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                            Enter your DUPR ID or URL and click Sync to auto-update ratings.
                        </p>
                    </div>

                    {/* Ratings Display */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <div>
                             <label htmlFor="duprDoublesRating" className="block text-sm font-medium text-gray-300 mb-2">DUPR Doubles Rating</label>
                             <input type="number" step="0.001" id="duprDoublesRating" value={duprDoublesRating} onChange={e => setDuprDoublesRating(e.target.value)} placeholder="e.g., 4.250" className="w-full bg-gray-700 text-white rounded-md px-4 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500" />
                         </div>
                         <div>
                             <label htmlFor="duprSinglesRating" className="block text-sm font-medium text-gray-300 mb-2">DUPR Singles Rating</label>
                             <input type="number" step="0.001" id="duprSinglesRating" value={duprSinglesRating} onChange={e => setDuprSinglesRating(e.target.value)} placeholder="e.g., 4.250" className="w-full bg-gray-700 text-white rounded-md px-4 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500" />
                         </div>
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
            </div>
        </div>
    );
};
