
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { createCompetition, listCompetitions, logAudit } from '../services/firebase';
import type { Competition, CompetitionType, Visibility, TieBreaker, CompetitionDivision, EventType, GenderCategory, TeamLeagueSettings, TeamLeagueBoardConfig } from '../types';

interface CreateCompetitionProps {
    onCancel: () => void;
    onCreate: () => void;
    initialType?: CompetitionType;
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

export const CreateCompetition: React.FC<CreateCompetitionProps> = ({ onCancel, onCreate, initialType = 'league' }) => {
    const { currentUser } = useAuth();
    
    // Basic Info
    const [name, setName] = useState('');
    const [type, setType] = useState<CompetitionType>(initialType);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    
    // Location
    const [country, setCountry] = useState('NZL');
    const [region, setRegion] = useState('');
    const [venue, setVenue] = useState('');
    
    // Settings
    const [winPoints, setWinPoints] = useState(3);
    const [drawPoints, setDrawPoints] = useState(1);
    const [lossPoints, setLossPoints] = useState(0);
    const [bonusPoints, setBonusPoints] = useState(0);
    const [tieBreaker, setTieBreaker] = useState<TieBreaker>('point_diff');
    const [teamRegistrationMode, setTeamRegistrationMode] = useState<'pre_registered'|'on_entry'>('on_entry');
    
    // Team Match Config (Only for team_league)
    const [teamBoards, setTeamBoards] = useState<TeamLeagueBoardConfig[]>([
        { boardNumber: 1, boardType: 'men_doubles', weight: 1 },
        { boardNumber: 2, boardType: 'women_doubles', weight: 1 },
        { boardNumber: 3, boardType: 'mixed_doubles', weight: 1 }
    ]);
    const [rosterMin, setRosterMin] = useState(6);
    const [rosterMax, setRosterMax] = useState(12);
    const [lineupLock, setLineupLock] = useState(30);
    const [pointsPerMatchWin, setPointsPerMatchWin] = useState(3);
    const [pointsPerBoardWin, setPointsPerBoardWin] = useState(1);

    // Entrants & Divisions
    const [maxEntrants, setMaxEntrants] = useState<number | ''>('');
    const [waitlist, setWaitlist] = useState(false);
    const [registrationOpen, setRegistrationOpen] = useState(true);
    const [divisions, setDivisions] = useState<CompetitionDivision[]>([]);
    
    // Temp division input
    const [newDivName, setNewDivName] = useState('');
    const [newDivType, setNewDivType] = useState<EventType>('doubles');
    const [newDivGender, setNewDivGender] = useState<GenderCategory>('mixed');
    const [newDivMinRating, setNewDivMinRating] = useState('');
    const [newDivMaxRating, setNewDivMaxRating] = useState('');

    // Metadata
    const [description, setDescription] = useState('');
    const [visibility, setVisibility] = useState<Visibility>('public');

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleAddDivision = () => {
        if (!newDivName.trim()) return;
        
        const min = newDivMinRating ? parseFloat(newDivMinRating) : undefined;
        const max = newDivMaxRating ? parseFloat(newDivMaxRating) : undefined;

        if (min && max && min > max) {
            setError("Min rating cannot be greater than max rating");
            return;
        }

        const newDiv: CompetitionDivision = {
            id: `div_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            name: newDivName.trim(),
            type: newDivType,
            gender: newDivGender,
            minRating: min,
            maxRating: max
        };

        setDivisions([...divisions, newDiv]);
        setNewDivName('');
        setNewDivMinRating('');
        setNewDivMaxRating('');
        setError(null); // Clear error if successful
    };

    const handleRemoveDivision = (id: string) => {
        setDivisions(divisions.filter(d => d.id !== id));
    };

    // Helper for team boards
    const addBoard = () => {
        setTeamBoards([...teamBoards, { boardNumber: teamBoards.length + 1, boardType: 'mixed_doubles', weight: 1 }]);
    };
    const removeBoard = (index: number) => {
        setTeamBoards(teamBoards.filter((_, i) => i !== index));
    };
    const updateBoard = (index: number, field: keyof typeof teamBoards[0], value: any) => {
        const updated = [...teamBoards];
        updated[index] = { ...updated[index], [field]: value };
        setTeamBoards(updated);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!currentUser) return;

        // Validation
        if (new Date(startDate) > new Date(endDate)) {
            setError("End date must be after or equal to start date.");
            return;
        }

        if (!name.trim()) {
            setError("Competition name is required.");
            return;
        }

        if (type === 'team_league' && teamBoards.length === 0) {
            setError("Please configure at least one match board (line) for team leagues.");
            return;
        }

        setIsSubmitting(true);
        try {
            // Uniqueness Check
            const existing = await listCompetitions({ organiserId: currentUser.uid });
            const isDuplicate = existing.some(c => c.name.toLowerCase() === name.trim().toLowerCase() && c.status !== 'cancelled');
            
            if (isDuplicate) {
                setError("You already have an active competition with this name.");
                setIsSubmitting(false);
                return;
            }

            const teamLeagueSettings: TeamLeagueSettings | undefined = type === 'team_league' ? {
                boards: teamBoards.map((b, i) => ({ ...b, boardNumber: i + 1 })),
                rosterMin,
                rosterMax,
                lineupLockMinutesBeforeMatch: lineupLock,
                pointsPerBoardWin,
                pointsPerMatchWin,
                tieBreakerOrder: ['matchWins', 'boardDiff', 'headToHead']
            } : undefined;

            const comp: Competition = {
                id: `comp_${Date.now()}`,
                type,
                name: name.trim(),
                organiserId: currentUser.uid,
                startDate,
                endDate,
                status: 'draft',
                country,
                region,
                settings: {
                    points: { 
                        win: winPoints, 
                        draw: drawPoints, 
                        loss: lossPoints, 
                        bonus: bonusPoints 
                    },
                    tieBreaker,
                    waitlist,
                    teamRegistrationMode: type === 'team_league' ? teamRegistrationMode : undefined,
                    teamLeague: teamLeagueSettings
                },
                description,
                venue,
                maxEntrants: maxEntrants === '' ? undefined : maxEntrants,
                visibility,
                registrationOpen,
                divisions: divisions.length > 0 ? divisions : undefined
            };
            
            await createCompetition(comp);
            
            await logAudit(currentUser.uid, "create_competition", comp.id, { name: comp.name });

            onCreate();
        } catch (error: any) {
            console.error(error);
            setError(error.message || "Failed to create competition.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const availableRegions = COUNTRY_REGIONS[country];

    return (
        <div className="max-w-3xl mx-auto bg-gray-800 rounded-lg p-8 border border-gray-700 mt-8 mb-10">
            <h2 className="text-2xl font-bold text-white mb-2">Create New Competition</h2>
            <p className="text-gray-400 mb-6 text-sm">Set up your league, points system, and divisions.</p>
            
            {error && (
                <div className="bg-red-900/50 border border-red-800 text-red-200 p-3 rounded mb-6 text-sm">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-8">
                
                {/* Section 1: Basic Info */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-green-400 uppercase tracking-wide border-b border-gray-700 pb-2">Basic Info</h3>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Competition Name <span className="text-red-400">*</span></label>
                        <input 
                            required
                            className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g. Winter Doubles League 2024"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Type</label>
                            <select 
                                className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none disabled:opacity-50"
                                value={type}
                                onChange={e => setType(e.target.value as CompetitionType)}
                                disabled={!!initialType}
                            >
                                <option value="league">Singles/Doubles League</option>
                                <option value="team_league">Team League</option>
                            </select>
                            {initialType && <p className="text-xs text-gray-500 mt-1">Locked to current view context.</p>}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Visibility</label>
                            <select 
                                className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                                value={visibility}
                                onChange={e => setVisibility(e.target.value as Visibility)}
                            >
                                <option value="public">Public</option>
                                <option value="private">Private</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Start Date <span className="text-red-400">*</span></label>
                            <input 
                                type="date" 
                                required
                                className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">End Date <span className="text-red-400">*</span></label>
                            <input 
                                type="date" 
                                required
                                className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {/* Section 2: Location & Venue */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-green-400 uppercase tracking-wide border-b border-gray-700 pb-2">Location</h3>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Venue Name</label>
                        <input 
                            className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                            value={venue}
                            onChange={e => setVenue(e.target.value)}
                            placeholder="e.g. City Sports Centre"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Country</label>
                            <select 
                                className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                                value={country}
                                onChange={e => { setCountry(e.target.value); setRegion(''); }}
                            >
                                {COUNTRIES.map(c => (
                                    <option key={c.code} value={c.code}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Region</label>
                            {availableRegions ? (
                                <select 
                                    className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                                    value={region}
                                    onChange={e => setRegion(e.target.value)}
                                >
                                    <option value="">Select Region...</option>
                                    {availableRegions.map(r => (
                                        <option key={r} value={r}>{r}</option>
                                    ))}
                                </select>
                            ) : (
                                <input 
                                    type="text" 
                                    className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                                    value={region}
                                    onChange={e => setRegion(e.target.value)}
                                    placeholder="State / Province"
                                />
                            )}
                        </div>
                    </div>
                </div>

                {/* Section 3: Format & Rules */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-green-400 uppercase tracking-wide border-b border-gray-700 pb-2">Format & Rules</h3>
                    
                    {/* Team League Specific Config */}
                    {type === 'team_league' && (
                        <div className="bg-gray-900 p-4 rounded border border-blue-900/50 mb-4 space-y-4">
                            <h4 className="text-sm font-bold text-blue-300">Team Competition Settings</h4>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Min Roster Size</label>
                                    <input 
                                        type="number" min="2"
                                        className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 focus:border-green-500 outline-none"
                                        value={rosterMin}
                                        onChange={e => setRosterMin(parseInt(e.target.value))}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Max Roster Size</label>
                                    <input 
                                        type="number" min="2"
                                        className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 focus:border-green-500 outline-none"
                                        value={rosterMax}
                                        onChange={e => setRosterMax(parseInt(e.target.value))}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Points per Match Win</label>
                                    <input 
                                        type="number"
                                        className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 focus:border-green-500 outline-none"
                                        value={pointsPerMatchWin}
                                        onChange={e => setPointsPerMatchWin(parseInt(e.target.value))}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Lineup Lock (mins before)</label>
                                    <input 
                                        type="number" min="0"
                                        className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 focus:border-green-500 outline-none"
                                        value={lineupLock}
                                        onChange={e => setLineupLock(parseInt(e.target.value))}
                                    />
                                </div>
                            </div>

                            <div className="border-t border-gray-700 pt-4 mt-2">
                                <label className="block text-sm font-bold text-gray-300 mb-3">Boards (Lines) Configuration</label>
                                <div className="space-y-2">
                                    {teamBoards.map((board, idx) => (
                                        <div key={idx} className="flex gap-3 items-center bg-gray-800 p-2 rounded">
                                            <span className="text-gray-500 text-sm font-mono w-6">#{idx + 1}</span>
                                            <select 
                                                className="bg-gray-700 text-white p-2 rounded border border-gray-600 text-sm flex-1"
                                                value={board.boardType}
                                                onChange={e => updateBoard(idx, 'boardType', e.target.value)}
                                            >
                                                <option value="men_doubles">Men's Doubles</option>
                                                <option value="women_doubles">Women's Doubles</option>
                                                <option value="mixed_doubles">Mixed Doubles</option>
                                                <option value="open_doubles">Open Doubles</option>
                                                <option value="singles">Singles</option>
                                            </select>
                                            <div className="flex items-center gap-1">
                                                <span className="text-xs text-gray-400">Pts:</span>
                                                <input 
                                                    type="number" min="0" step="0.5"
                                                    className="w-16 bg-gray-700 text-white p-2 rounded border border-gray-600 text-sm"
                                                    value={board.weight}
                                                    onChange={e => updateBoard(idx, 'weight', parseFloat(e.target.value))}
                                                />
                                            </div>
                                            <button 
                                                type="button" 
                                                onClick={() => removeBoard(idx)}
                                                className="text-red-400 hover:text-red-300 px-2"
                                            >
                                                &times;
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <button 
                                    type="button" 
                                    onClick={addBoard}
                                    className="mt-3 text-xs bg-blue-900 hover:bg-blue-800 text-blue-200 px-3 py-1.5 rounded"
                                >
                                    + Add Board
                                </button>
                            </div>
                        </div>
                    )}

                    {type !== 'team_league' && (
                        <div className="bg-gray-900 p-4 rounded border border-gray-700">
                            <label className="block text-sm font-medium text-gray-300 mb-3">Points System</label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Win</label>
                                    <input 
                                        type="number" 
                                        className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 focus:border-green-500 outline-none"
                                        value={winPoints}
                                        onChange={e => setWinPoints(Number(e.target.value))}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Draw</label>
                                    <input 
                                        type="number" 
                                        className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 focus:border-green-500 outline-none"
                                        value={drawPoints}
                                        onChange={e => setDrawPoints(Number(e.target.value))}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Loss</label>
                                    <input 
                                        type="number" 
                                        className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 focus:border-green-500 outline-none"
                                        value={lossPoints}
                                        onChange={e => setLossPoints(Number(e.target.value))}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Bonus</label>
                                    <input 
                                        type="number" 
                                        className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 focus:border-green-500 outline-none"
                                        value={bonusPoints}
                                        onChange={e => setBonusPoints(Number(e.target.value))}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Tie Breaker</label>
                        <select 
                            className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                            value={tieBreaker}
                            onChange={e => setTieBreaker(e.target.value as TieBreaker)}
                        >
                            <option value="point_diff">Point Difference</option>
                            <option value="match_wins">Total Match Wins</option>
                            <option value="head_to_head">Head to Head</option>
                        </select>
                    </div>

                    {type === 'team_league' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Team Registration Mode</label>
                            <select
                                className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                                value={teamRegistrationMode}
                                onChange={e => setTeamRegistrationMode(e.target.value as any)}
                            >
                                <option value="on_entry">Teams form on entry</option>
                                <option value="pre_registered">Must use pre-registered teams</option>
                            </select>
                        </div>
                    )}

                    {/* Divisions */}
                    <div className="bg-gray-900 p-4 rounded border border-gray-700">
                        <label className="block text-sm font-medium text-gray-300 mb-2">Divisions (Optional)</label>
                        <p className="text-xs text-gray-500 mb-3">Group entrants by skill level or category.</p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
                            <input 
                                className="md:col-span-2 bg-gray-800 text-white p-2 rounded border border-gray-600 focus:border-green-500 outline-none text-sm"
                                placeholder="Division Name (e.g. A Grade)"
                                value={newDivName}
                                onChange={e => setNewDivName(e.target.value)}
                            />
                            <div className="flex gap-2">
                                <select
                                    className="bg-gray-800 text-white p-2 rounded border border-gray-600 focus:border-green-500 outline-none text-sm w-1/2"
                                    value={newDivType}
                                    onChange={e => setNewDivType(e.target.value as EventType)}
                                >
                                    <option value="singles">Singles</option>
                                    <option value="doubles">Doubles</option>
                                </select>
                                <select
                                    className="bg-gray-800 text-white p-2 rounded border border-gray-600 focus:border-green-500 outline-none text-sm w-1/2"
                                    value={newDivGender}
                                    onChange={e => setNewDivGender(e.target.value as GenderCategory)}
                                >
                                    <option value="mixed">Mixed</option>
                                    <option value="men">Men</option>
                                    <option value="women">Women</option>
                                    <option value="open">Open</option>
                                </select>
                            </div>
                            <input 
                                type="number" step="0.1"
                                className="bg-gray-800 text-white p-2 rounded border border-gray-600 focus:border-green-500 outline-none text-sm"
                                placeholder="Min Rating (opt)"
                                value={newDivMinRating}
                                onChange={e => setNewDivMinRating(e.target.value)}
                            />
                            <input 
                                type="number" step="0.1"
                                className="bg-gray-800 text-white p-2 rounded border border-gray-600 focus:border-green-500 outline-none text-sm"
                                placeholder="Max Rating (opt)"
                                value={newDivMaxRating}
                                onChange={e => setNewDivMaxRating(e.target.value)}
                            />
                        </div>
                        <button 
                            type="button" 
                            onClick={handleAddDivision}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm font-bold mb-4"
                        >
                            Add Division
                        </button>

                        {divisions.length > 0 && (
                            <div className="space-y-2">
                                {divisions.map((div) => (
                                    <div key={div.id} className="bg-gray-800 border border-gray-600 text-gray-200 px-3 py-2 rounded text-sm flex justify-between items-center">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-white">{div.name}</span>
                                            <span className="text-xs text-gray-400 capitalize">{div.type} • {div.gender}</span>
                                            {(div.minRating || div.maxRating) && (
                                                <span className="text-xs text-gray-400">
                                                    Rating: {div.minRating || 0} - {div.maxRating || 'Any'}
                                                </span>
                                            )}
                                        </div>
                                        <button 
                                            type="button" 
                                            onClick={() => handleRemoveDivision(div.id)}
                                            className="text-red-400 hover:text-red-300 font-bold px-2"
                                        >
                                            &times;
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Section 4: Registration */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-green-400 uppercase tracking-wide border-b border-gray-700 pb-2">Registration</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Max Entrants</label>
                            <input 
                                type="number" 
                                className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                                value={maxEntrants}
                                onChange={e => setMaxEntrants(e.target.value === '' ? '' : Number(e.target.value))}
                                placeholder="Unlimited"
                            />
                        </div>
                        <div className="flex flex-col justify-center space-y-2">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input 
                                    type="checkbox"
                                    checked={registrationOpen}
                                    onChange={e => setRegistrationOpen(e.target.checked)}
                                    className="w-5 h-5 text-green-600 rounded bg-gray-900 border-gray-600 focus:ring-green-500"
                                />
                                <span className="text-gray-300 font-medium text-sm">Registration Open</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input 
                                    type="checkbox"
                                    checked={waitlist}
                                    onChange={e => setWaitlist(e.target.checked)}
                                    className="w-5 h-5 text-green-600 rounded bg-gray-900 border-gray-600 focus:ring-green-500"
                                />
                                <span className="text-gray-300 font-medium text-sm">Enable Waitlist</span>
                            </label>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Description / Rules</label>
                        <textarea 
                            className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none h-32"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Detailed overview of league format, schedule, and rules..."
                        />
                    </div>
                </div>

                <div className="flex justify-between pt-6 border-t border-gray-700">
                    <button type="button" onClick={onCancel} className="text-gray-400 hover:text-white px-4 py-2">Cancel</button>
                    <button 
                        type="submit" 
                        disabled={isSubmitting}
                        className="bg-green-600 hover:bg-green-500 text-white px-8 py-3 rounded font-bold shadow-lg disabled:opacity-50 transition-colors"
                    >
                        {isSubmitting ? 'Creating...' : 'Create Competition'}
                    </button>
                </div>
            </form>
        </div>
    );
};
