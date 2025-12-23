/**
 * CreateTournament Component
 *
 * UPDATED V06.00:
 * - Integrated FormatCards for unified format selection
 * - Maps CompetitionFormat to DivisionFormat structure
 * - Visual format cards with dark theme styling
 * - Pool Play → Medals integration with generator settings
 *
 * FILE LOCATION: components/CreateTournament.tsx
 * VERSION: V06.00
 */
import React, { useState, useEffect } from 'react';
import type {
    Tournament,
    Division,
    EventType,
    GenderCategory,
    DivisionFormat,
    MainFormat,
    Stage2Format,
    PlateFormat,
    Club,
    SeedingMethod,
    TieBreaker
} from '../types';
import { saveTournament, getUserClubs, getAllClubs } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';
import type { CompetitionFormat, PoolPlayMedalsSettings } from '../types/formats';
import { getFormatOption, DEFAULT_POOL_PLAY_MEDALS_SETTINGS } from '../types/formats';
import { FormatCards } from './shared/FormatSelector';

interface CreateTournamentProps {
  onCreateTournament: (tournament: Tournament) => Promise<void> | void;
  onCancel: () => void;
  onCreateClub: () => void;
  userId: string;
}

const generateId = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36);

const DEFAULT_FORMAT: DivisionFormat = {
    stageMode: 'single_stage',
    mainFormat: 'round_robin',
    stage1Format: 'round_robin_pools',
    stage2Format: 'single_elim',
    numberOfPools: 2,
    teamsPerPool: 4,
    advanceToMainPerPool: 2,
    advanceToPlatePerPool: 0,
    plateEnabled: false,
    plateFormat: 'single_elim',
    plateName: 'Plate Finals',
    bestOfGames: 1,
    pointsPerGame: 11,
    winBy: 2,
    hasBronzeMatch: false,
    seedingMethod: 'rating',
    tieBreakerPrimary: 'match_wins',
    tieBreakerSecondary: 'point_diff',
    tieBreakerTertiary: 'head_to_head'
};

/**
 * Map CompetitionFormat to DivisionFormat settings
 */
const mapCompetitionToTournamentFormat = (format: CompetitionFormat): Partial<DivisionFormat> => {
    switch (format) {
        case 'pool_play_medals':
            return {
                stageMode: 'two_stage',
                stage1Format: 'round_robin_pools',
                stage2Format: 'single_elim',
                numberOfPools: 2,
                teamsPerPool: 4,
                advanceToMainPerPool: 2,
                hasBronzeMatch: true,
            };
        case 'round_robin':
            return {
                stageMode: 'single_stage',
                mainFormat: 'round_robin',
            };
        case 'singles_elimination':
        case 'doubles_elimination':
            return {
                stageMode: 'single_stage',
                mainFormat: 'single_elim',
            };
        case 'swiss':
            return {
                stageMode: 'single_stage',
                mainFormat: 'round_robin', // Swiss maps to round robin for now
            };
        case 'ladder':
            return {
                stageMode: 'single_stage',
                mainFormat: 'ladder',
            };
        case 'rotating_doubles_box':
        case 'fixed_doubles_box':
            return {
                stageMode: 'single_stage',
                mainFormat: 'round_robin', // Box leagues use round robin within boxes
            };
        case 'king_of_court':
        case 'team_league_interclub':
        default:
            return {
                stageMode: 'single_stage',
                mainFormat: 'round_robin',
            };
    }
};

export const CreateTournament: React.FC<CreateTournamentProps> = ({ onCreateTournament, onCancel, onCreateClub, userId }) => {
  const { isAppAdmin } = useAuth();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Club Fetching
  const [availableClubs, setAvailableClubs] = useState<Club[]>([]);
  const [loadingClubs, setLoadingClubs] = useState(true);

  // Tournament Draft
  const [formData, setFormData] = useState<Partial<Tournament>>({
    name: '',
    description: '',
    visibility: 'public',
    sport: 'Pickleball',
    status: 'draft',
    registrationMode: 'organiser_provided',
    createdByUserId: userId,
    clubId: '' // Required
  });

  // Divisions List
  const [divisions, setDivisions] = useState<Division[]>([]);
  
  // Editing State
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // New Division State
  const [newDivBasic, setNewDivBasic] = useState<{
      gender: GenderCategory;
      type: EventType;
      minRating: string;
      maxRating: string;
      minAge: string;
      maxAge: string;
  }>({
      gender: 'mixed',
      type: 'doubles',
      minRating: '',
      maxRating: '',
      minAge: '',
      maxAge: ''
  });

  const [newDivFormat, setNewDivFormat] = useState<DivisionFormat>(DEFAULT_FORMAT);

  // Selected format from FormatCards (V06.00)
  const [selectedFormat, setSelectedFormat] = useState<CompetitionFormat>('round_robin');

  // Pool Play → Medals specific settings
  const [poolPlaySettings, setPoolPlaySettings] = useState<PoolPlayMedalsSettings>(
    DEFAULT_POOL_PLAY_MEDALS_SETTINGS
  );

  // Handle format card selection - update DivisionFormat settings
  const handleFormatSelect = (format: CompetitionFormat) => {
    setSelectedFormat(format);
    const mappedSettings = mapCompetitionToTournamentFormat(format);
    setNewDivFormat(prev => ({ ...prev, ...mappedSettings }));

    // Reset pool play settings when switching to pool_play_medals
    if (format === 'pool_play_medals') {
      setPoolPlaySettings(DEFAULT_POOL_PLAY_MEDALS_SETTINGS);
    }
  };

  // Load Clubs
  useEffect(() => {
      const loadClubs = async () => {
          setLoadingClubs(true);
          try {
              let clubs: Club[] = [];
              if (isAppAdmin) {
                  clubs = await getAllClubs();
              } else {
                  clubs = await getUserClubs(userId);
              }
              setAvailableClubs(clubs);
              
              if (clubs.length === 1) {
                  setFormData(prev => ({ ...prev, clubId: clubs[0].id }));
              }
          } catch (e) {
              console.error("Failed to load clubs", e);
          } finally {
              setLoadingClubs(false);
          }
      };
      loadClubs();
  }, [userId, isAppAdmin]);

  useEffect(() => {
    if (formData.name && step === 1) {
      const slug = formData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      setFormData(prev => ({ ...prev, slug }));
    }
  }, [formData.name, step]);

  const handleEditDivision = (div: Division) => {
    setNewDivBasic({
        gender: div.gender,
        type: div.type,
        minRating: div.minRating ? div.minRating.toString() : '',
        maxRating: div.maxRating ? div.maxRating.toString() : '',
        minAge: div.minAge ? div.minAge.toString() : '',
        maxAge: div.maxAge ? div.maxAge.toString() : ''
    });
    setNewDivFormat({ ...div.format });
    setEditingId(div.id);
    setErrorMessage(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setNewDivBasic(prev => ({ ...prev, minRating: '', maxRating: '', minAge: '', maxAge: '' }));
    setNewDivFormat(DEFAULT_FORMAT);
    setErrorMessage(null);
  };

  const handleSaveDivision = () => {
      setErrorMessage(null);

      // Validation for pool play medals
      if (selectedFormat === 'pool_play_medals') {
          if (poolPlaySettings.poolSize < 3) return setErrorMessage("Pool size must be at least 3.");
      }

      // Validation for legacy two-stage
      if (newDivFormat.stageMode === 'two_stage' && selectedFormat !== 'pool_play_medals') {
          const pools = newDivFormat.numberOfPools || 0;
          const tpp = newDivFormat.teamsPerPool || 0;
          const advMain = newDivFormat.advanceToMainPerPool || 0;
          const advPlate = newDivFormat.advanceToPlatePerPool || 0;

          if (pools < 2) return setErrorMessage("Must have at least 2 pools.");
          if (pools % 2 !== 0) return setErrorMessage("Number of pools must be an EVEN number (2, 4, 6...).");
          if (tpp < 4) return setErrorMessage("Minimum 4 teams per pool required.");

          if (advMain < 1) return setErrorMessage("At least one team must advance to Main.");
          if ((advMain + advPlate) > tpp) return setErrorMessage("Total advancing teams cannot exceed teams per pool.");
      }

      // Generate Name based on format
      const genderLabel = newDivBasic.gender.charAt(0).toUpperCase() + newDivBasic.gender.slice(1);
      const typeLabel = newDivBasic.type === 'doubles' ? 'Doubles' : 'Singles';

      let formatLabel: string;
      if (selectedFormat === 'pool_play_medals') {
          const advRule = poolPlaySettings.advancementRule === 'top_1' ? 'Top 1'
            : poolPlaySettings.advancementRule === 'top_2' ? 'Top 2'
            : 'Top + Best';
          formatLabel = `Pool Play → Medals (${poolPlaySettings.poolSize}/pool, ${advRule})`;
      } else if (newDivFormat.stageMode === 'single_stage') {
          formatLabel = getFormatOption(selectedFormat)?.label || newDivFormat.mainFormat?.replace('_', ' ') || 'Format';
      } else {
          formatLabel = `${newDivFormat.numberOfPools} Pools → ${newDivFormat.stage2Format?.replace('_', ' ')}`;
      }

      const ratingLabel = newDivBasic.minRating
        ? `(${newDivBasic.minRating}${newDivBasic.maxRating ? `-${newDivBasic.maxRating}` : '+'})`
        : '';

      const ageLabel = newDivBasic.minAge
        ? `(${newDivBasic.minAge}${newDivBasic.maxAge ? `-${newDivBasic.maxAge}` : '+'} yrs)`
        : '';

      const name = `${genderLabel} ${typeLabel} ${ratingLabel} ${ageLabel} - ${formatLabel}`.trim().replace(/\s+/g, ' ');

      // Build format object with pool play settings if applicable
      const divisionFormat: DivisionFormat = {
          ...newDivFormat,
          // Store pool play settings in format for generator access
          ...(selectedFormat === 'pool_play_medals' && {
              poolPlayMedalsSettings: poolPlaySettings,
              competitionFormat: selectedFormat,
          }),
      };

      const div: Division = {
          id: editingId || generateId(),
          tournamentId: '', // set on save
          name: name,
          type: newDivBasic.type,
          gender: newDivBasic.gender,
          minRating: newDivBasic.minRating ? parseFloat(newDivBasic.minRating) : null,
          maxRating: newDivBasic.maxRating ? parseFloat(newDivBasic.maxRating) : null,
          minAge: newDivBasic.minAge ? parseInt(newDivBasic.minAge) : null,
          maxAge: newDivBasic.maxAge ? parseInt(newDivBasic.maxAge) : null,
          registrationOpen: true,
          format: divisionFormat,
          createdByUserId: userId,
          createdAt: Date.now(),
          updatedAt: Date.now()
      };
      
      if (editingId) {
          setDivisions(prev => prev.map(d => d.id === editingId ? div : d));
          setEditingId(null);
      } else {
          setDivisions(prev => [...prev, div]);
      }
      
      setNewDivBasic(prev => ({ ...prev, minRating: '', maxRating: '', minAge: '', maxAge: '' }));
      setNewDivFormat(DEFAULT_FORMAT);
  };

  const handleNext = () => {
      if (!formData.name) return setErrorMessage("Name is required");
      if (!formData.clubId) return setErrorMessage("Please select a club to host this tournament.");
      setStep(2);
      setErrorMessage(null);
  };

  const handleSubmit = async () => {
      if (divisions.length === 0) return setErrorMessage("Add at least one division");
      
      setIsSubmitting(true);
      try {
          const tId = generateId();
          const tournament: Tournament = {
              ...formData as Tournament,
              id: tId,
              startDatetime: formData.startDatetime || new Date().toISOString(),
              venue: formData.venue || 'TBD'
          };
          
          await saveTournament(tournament, divisions);
          await onCreateTournament(tournament);
      } catch (e: any) {
          setErrorMessage(e.message);
      } finally {
          setIsSubmitting(false);
      }
  };

  if (loadingClubs) return <div className="p-8 text-center">Loading Clubs...</div>;

  if (availableClubs.length === 0) {
      return (
          <div className="max-w-4xl mx-auto bg-gray-800 rounded-lg p-8 border border-gray-700 text-center mt-10">
              <div className="mb-6">
                 <svg className="w-16 h-16 mx-auto text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
              </div>
              <h2 className="text-2xl text-white font-bold mb-4">
                  {isAppAdmin ? "No Clubs Found" : "You need to be a Club Admin"}
              </h2>
              <p className="text-gray-400 mb-8 max-w-lg mx-auto">
                  To host tournaments, you must manage a Club.
                  {isAppAdmin ? " Create one to get started." : " Ask an admin to add you or create your own club."}
              </p>
              <div className="flex justify-center gap-4">
                  <button onClick={onCancel} className="text-gray-400 hover:text-white px-4 py-2">Back</button>
                  {isAppAdmin && (
                      <button 
                          onClick={onCreateClub}
                          className="bg-green-600 hover:bg-green-500 text-white font-bold px-6 py-2 rounded shadow-lg transition-colors"
                      >
                          Create Club
                      </button>
                  )}
              </div>
          </div>
      );
  }

  return (
      <div className="max-w-4xl mx-auto bg-gray-800 rounded-lg p-8 border border-gray-700 mb-10">
          <h2 className="text-2xl text-white font-bold mb-6">Create Tournament</h2>
          {errorMessage && <div className="bg-red-900/50 text-red-200 p-3 mb-4 rounded text-sm font-bold border border-red-800">{errorMessage}</div>}
          
          {step === 1 && (
              <div className="space-y-4">
                  <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">Tournament Name</label>
                      <input 
                        className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none" 
                        placeholder="e.g. Summer Smash 2024"
                        value={formData.name} 
                        onChange={e => setFormData({...formData, name: e.target.value})}
                      />
                  </div>

                  <div>
                      <div className="flex justify-between items-end mb-1">
                          <label className="block text-sm font-medium text-gray-400">Hosting Club</label>
                          {isAppAdmin && (
                              <button onClick={onCreateClub} className="text-xs text-green-400 hover:underline">
                                  + New Club
                              </button>
                          )}
                      </div>
                      
                      <select 
                        className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                        value={formData.clubId}
                        onChange={e => setFormData({...formData, clubId: e.target.value})}
                      >
                          <option value="">-- Select Club --</option>
                          {availableClubs.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                      </select>
                  </div>

                  <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">Description</label>
                      <textarea 
                        className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none h-24" 
                        placeholder="Tell players about your event..."
                        value={formData.description} 
                        onChange={e => setFormData({...formData, description: e.target.value})}
                      />
                  </div>

                   <div className="flex justify-between items-center pt-4">
                      <button onClick={onCancel} className="text-gray-400 hover:text-white">Cancel</button>
                      <button onClick={handleNext} className="bg-green-600 text-white px-6 py-2 rounded font-bold hover:bg-green-500">Next: Divisions</button>
                   </div>
              </div>
          )}

          {step === 2 && (
              <div className="space-y-8">
                  {/* ADD DIVISION PANEL */}
                  <div className={`bg-gray-700/50 p-6 rounded border ${editingId ? 'border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.1)]' : 'border-gray-600'} space-y-6 transition-all duration-300`}>
                      <div className="flex justify-between items-center border-b border-gray-600 pb-2">
                          <h3 className="text-white font-bold text-lg">
                              {editingId ? 'Edit Division' : 'Add Division'}
                          </h3>
                          {editingId && (
                              <span className="text-xs text-green-400 font-bold uppercase tracking-wider animate-pulse">
                                  Editing Mode
                              </span>
                          )}
                      </div>
                      
                      {/* 1. Basic Info */}
                      <div>
                          <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">1. Basic Info</h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Gender</label>
                                    <select 
                                        className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 focus:border-green-500 outline-none"
                                        value={newDivBasic.gender}
                                        onChange={e => setNewDivBasic({...newDivBasic, gender: e.target.value as GenderCategory})}
                                    >
                                        <option value="men">Men</option>
                                        <option value="women">Women</option>
                                        <option value="mixed">Mixed</option>
                                        <option value="open">Open</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Type</label>
                                    <select 
                                        className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 focus:border-green-500 outline-none"
                                        value={newDivBasic.type}
                                        onChange={e => setNewDivBasic({...newDivBasic, type: e.target.value as EventType})}
                                    >
                                        <option value="doubles">Doubles</option>
                                        <option value="singles">Singles</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Min Rating</label>
                                    <input 
                                        type="number" step="0.1" placeholder="e.g. 3.0"
                                        className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 focus:border-green-500 outline-none"
                                        value={newDivBasic.minRating}
                                        onChange={e => setNewDivBasic({...newDivBasic, minRating: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Max Rating (Opt)</label>
                                    <input 
                                        type="number" step="0.1" placeholder="e.g. 4.0"
                                        className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 focus:border-green-500 outline-none"
                                        value={newDivBasic.maxRating}
                                        onChange={e => setNewDivBasic({...newDivBasic, maxRating: e.target.value})}
                                    />
                                </div>
                          </div>
                          
                          {/* Age Limits */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Min Age (Years)</label>
                                    <input 
                                        type="number" placeholder="e.g. 50"
                                        className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 focus:border-green-500 outline-none"
                                        value={newDivBasic.minAge}
                                        onChange={e => setNewDivBasic({...newDivBasic, minAge: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Max Age (Years)</label>
                                    <input 
                                        type="number" placeholder="e.g. 18"
                                        className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 focus:border-green-500 outline-none"
                                        value={newDivBasic.maxAge}
                                        onChange={e => setNewDivBasic({...newDivBasic, maxAge: e.target.value})}
                                    />
                                </div>
                          </div>
                      </div>

                      {/* 2. Format */}
                      <div>
                          <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">2. Competition Format</h4>

                          {/* Format Cards Selection (V06.00) */}
                          <div className="mb-4">
                              <FormatCards
                                  value={selectedFormat}
                                  onChange={handleFormatSelect}
                                  playType={newDivBasic.type === 'singles' ? 'singles' : 'doubles'}
                                  theme="dark"
                              />
                          </div>

                          {/* Advanced Settings Panel */}
                          <div className="bg-gray-800 p-4 rounded border border-gray-600">
                              <div className="mb-4">
                                   <label className="block text-xs text-gray-400 mb-1">Seeding Method</label>
                                   <select
                                      className="w-full bg-gray-900 text-white p-2 rounded border border-gray-700"
                                      value={newDivFormat.seedingMethod || 'rating'}
                                      onChange={e => setNewDivFormat({...newDivFormat, seedingMethod: e.target.value as SeedingMethod})}
                                   >
                                       <option value="rating">Rating Based (DUPR)</option>
                                       <option value="random">Random</option>
                                   </select>
                              </div>

                              {/* Pool Play → Medals Settings */}
                              {selectedFormat === 'pool_play_medals' && (
                                  <div className="space-y-4">
                                      <div className="p-3 bg-blue-900/20 border border-blue-700/30 rounded">
                                          <p className="text-xs text-blue-300">
                                            <strong>Pool Play → Medals:</strong> Teams play round robin in pools, then top finishers advance to a medal bracket.
                                          </p>
                                      </div>

                                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                          <div>
                                              <label className="block text-xs text-gray-400 mb-1">Pool Size</label>
                                              <select
                                                  className="w-full bg-gray-900 text-white p-2 rounded border border-gray-700"
                                                  value={poolPlaySettings.poolSize}
                                                  onChange={e => setPoolPlaySettings({...poolPlaySettings, poolSize: parseInt(e.target.value) as 3|4|5|6})}
                                              >
                                                  <option value="3">3 teams per pool</option>
                                                  <option value="4">4 teams per pool</option>
                                                  <option value="5">5 teams per pool</option>
                                                  <option value="6">6 teams per pool</option>
                                              </select>
                                          </div>
                                          <div>
                                              <label className="block text-xs text-gray-400 mb-1">Advancement Rule</label>
                                              <select
                                                  className="w-full bg-gray-900 text-white p-2 rounded border border-gray-700"
                                                  value={poolPlaySettings.advancementRule}
                                                  onChange={e => setPoolPlaySettings({...poolPlaySettings, advancementRule: e.target.value as 'top_1'|'top_2'|'top_n_plus_best'})}
                                              >
                                                  <option value="top_1">Top 1 from each pool</option>
                                                  <option value="top_2">Top 2 from each pool</option>
                                                  <option value="top_n_plus_best">Top 1 + Best remaining</option>
                                              </select>
                                          </div>
                                          <div>
                                              <label className="block text-xs text-gray-400 mb-1">Bronze Medal Match</label>
                                              <select
                                                  className="w-full bg-gray-900 text-white p-2 rounded border border-gray-700"
                                                  value={poolPlaySettings.bronzeMatch}
                                                  onChange={e => setPoolPlaySettings({...poolPlaySettings, bronzeMatch: e.target.value as 'yes'|'shared'|'no'})}
                                              >
                                                  <option value="yes">Yes - Play for bronze</option>
                                                  <option value="shared">Shared bronze (no match)</option>
                                                  <option value="no">No bronze medal</option>
                                              </select>
                                          </div>
                                      </div>

                                      <div className="p-3 bg-gray-900/50 rounded border border-gray-700/50">
                                          <label className="block text-xs text-gray-400 mb-2">Pool Standings Tiebreakers (in order)</label>
                                          <div className="flex flex-wrap gap-2">
                                              {poolPlaySettings.tiebreakers.map((tb, idx) => (
                                                  <span key={tb} className="px-2 py-1 bg-gray-800 text-gray-300 rounded text-xs">
                                                      {idx + 1}. {tb.replace('_', ' ')}
                                                  </span>
                                              ))}
                                          </div>
                                          <p className="text-[10px] text-gray-500 mt-1">
                                              Wins → Head-to-Head → Point Diff → Points Scored
                                          </p>
                                      </div>

                                      {/* Consolation bracket option */}
                                      <div className="flex items-center gap-4 p-3 bg-gray-900/30 rounded border border-gray-700/30">
                                          <label className="flex items-center gap-2">
                                              <input
                                                  type="checkbox"
                                                  checked={newDivFormat.plateEnabled}
                                                  onChange={e => setNewDivFormat({...newDivFormat, plateEnabled: e.target.checked})}
                                                  className="rounded bg-gray-900 border-gray-700 text-green-600"
                                              />
                                              <span className="text-sm text-white">Enable Consolation Bracket</span>
                                          </label>
                                          <span className="text-xs text-gray-500">(Medal bracket uses single elimination)</span>
                                      </div>
                                  </div>
                              )}

                              <div className="mt-6 pt-4 border-t border-gray-700">
                                  <h5 className="text-xs font-bold text-gray-500 uppercase mb-2">Match Rules</h5>
                                  <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
                                      <div>
                                          <label className="block text-xs text-gray-400 mb-1">Best of (Games)</label>
                                          <select
                                              className="w-full bg-gray-900 text-white p-2 rounded border border-gray-700"
                                              value={newDivFormat.bestOfGames}
                                              onChange={e => setNewDivFormat({...newDivFormat, bestOfGames: parseInt(e.target.value) as 1|3|5})}
                                          >
                                              <option value="1">1 Game</option>
                                              <option value="3">3 Games</option>
                                              <option value="5">5 Games</option>
                                          </select>
                                      </div>
                                      <div>
                                          <label className="block text-xs text-gray-400 mb-1">Points per Game</label>
                                          <select
                                              className="w-full bg-gray-900 text-white p-2 rounded border border-gray-700"
                                              value={newDivFormat.pointsPerGame}
                                              onChange={e => setNewDivFormat({...newDivFormat, pointsPerGame: parseInt(e.target.value) as 11|15|21})}
                                          >
                                              <option value="11">11 Points</option>
                                              <option value="15">15 Points</option>
                                              <option value="21">21 Points</option>
                                          </select>
                                      </div>
                                      <div>
                                          <label className="block text-xs text-gray-400 mb-1">Win by</label>
                                          <select
                                              className="w-full bg-gray-900 text-white p-2 rounded border border-gray-700"
                                              value={newDivFormat.winBy}
                                              onChange={e => setNewDivFormat({...newDivFormat, winBy: parseInt(e.target.value) as 1|2})}
                                          >
                                              <option value="1">1 Point</option>
                                              <option value="2">2 Points</option>
                                          </select>
                                      </div>
                                      <div className="flex items-end pb-2">
                                          <label className="flex items-center gap-2">
                                              <input 
                                                  type="checkbox" 
                                                  checked={newDivFormat.hasBronzeMatch}
                                                  onChange={e => setNewDivFormat({...newDivFormat, hasBronzeMatch: e.target.checked})}
                                                  className="rounded bg-gray-900 border-gray-700 text-green-600"
                                              />
                                              <span className="text-xs text-gray-300">Bronze Match?</span>
                                          </label>
                                      </div>
                                  </div>
                              </div>
                          </div>
                      </div>

                      <div className="flex justify-end pt-2 gap-2">
                          {editingId && (
                              <button 
                                  onClick={handleCancelEdit} 
                                  className="text-gray-400 hover:text-white px-4 py-2 text-sm font-bold"
                              >
                                  Cancel Edit
                              </button>
                          )}
                          <button 
                              onClick={handleSaveDivision} 
                              className={`${editingId ? 'bg-green-600 hover:bg-green-500' : 'bg-blue-600 hover:bg-blue-500'} text-white rounded font-bold px-6 py-2 transition-colors`}
                          >
                              {editingId ? 'Update Division' : 'Add Division'}
                          </button>
                      </div>
                  </div>

                  {/* LIST */}
                  <div className="space-y-2">
                      <h4 className="text-white font-bold">Divisions List</h4>
                      {divisions.length === 0 ? (
                          <p className="text-gray-500 italic text-sm">No divisions added yet.</p>
                      ) : (
                          divisions.map(d => (
                              <div key={d.id} className={`bg-gray-900 p-4 rounded flex justify-between items-center text-white border ${editingId === d.id ? 'border-green-500/50 bg-green-900/10' : 'border-gray-800'}`}>
                                  <div>
                                      <div className="font-bold flex items-center gap-2">
                                          {d.name}
                                          {editingId === d.id && <span className="text-[10px] bg-green-600 text-white px-1.5 rounded uppercase">Editing</span>}
                                      </div>
                                      <div className="text-xs text-gray-400 mt-1 space-x-3">
                                          <span>
                                            {d.format.stageMode === 'single_stage' 
                                                ? `Single Stage: ${d.format.mainFormat?.replace('_', ' ')}` 
                                                : `Two Stage: ${d.format.numberOfPools} Pools → ${d.format.stage2Format?.replace('_', ' ')}`
                                            }
                                          </span>
                                          <span>|</span>
                                          <span>Best of {d.format.bestOfGames} to {d.format.pointsPerGame}</span>
                                          {d.format.hasBronzeMatch && <span>| +Bronze</span>}
                                          {d.format.plateEnabled && <span>| +Plate</span>}
                                      </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                      <button 
                                          onClick={() => handleEditDivision(d)} 
                                          className="text-blue-400 hover:text-blue-300 text-sm font-medium"
                                      >
                                          Edit
                                      </button>
                                      <button 
                                          onClick={() => setDivisions(divisions.filter(x => x.id !== d.id))} 
                                          className="text-red-400 hover:text-red-300 text-sm font-medium"
                                      >
                                          Remove
                                      </button>
                                  </div>
                              </div>
                          ))
                      )}
                  </div>

                  <div className="flex justify-between pt-4 border-t border-gray-700">
                      <button onClick={() => setStep(1)} className="text-gray-400 hover:text-white">Back</button>
                      <button onClick={handleSubmit} disabled={isSubmitting} className="bg-green-600 hover:bg-green-500 text-white px-8 py-3 rounded font-bold shadow-lg">
                          {isSubmitting ? 'Creating...' : 'Create Tournament'}
                      </button>
                  </div>
              </div>
          )}
      </div>
  );
};
