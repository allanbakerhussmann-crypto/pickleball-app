
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { createClub } from '../services/firebase';

interface CreateClubProps {
    onClubCreated: () => void;
    onCancel: () => void;
}

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

export const CreateClub: React.FC<CreateClubProps> = ({ onClubCreated, onCancel }) => {
    const { currentUser, isAppAdmin } = useAuth();
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
                .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
                .replace(/^-+|-+$/g, ''); // Trim hyphens
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
        
        // Validation for dropdowns
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

    if (!isAppAdmin) {
        return (
            <div className="p-8 text-center bg-gray-800 rounded-lg">
                <h2 className="text-xl font-bold text-red-400">Restricted Access</h2>
                <p className="text-gray-400 mt-2">Only App Admins can create new clubs.</p>
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
                        placeholder="Tell players about your club..."
                        className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none h-24"
                    />
                </div>

                <div>
                    <label htmlFor="logoUrl" className="block text-sm font-medium text-gray-300 mb-1">Logo URL (Optional)</label>
                    <input 
                        type="url" 
                        id="logoUrl"
                        value={logoUrl}
                        onChange={e => setLogoUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                    />
                </div>

                <div className="flex justify-end gap-4 pt-4 border-t border-gray-700">
                    <button 
                        type="button" 
                        onClick={onCancel}
                        className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        type="submit" 
                        disabled={isSubmitting}
                        className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-6 rounded shadow-lg transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? 'Creating...' : 'Create Club'}
                    </button>
                </div>
            </form>
        </div>
    );
};
