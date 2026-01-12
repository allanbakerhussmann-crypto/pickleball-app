/**
 * Tournament Planner - Add Division Modal
 *
 * Modal for adding or editing a tournament division.
 *
 * FILE LOCATION: components/tournament/planner/AddDivisionModal.tsx
 * VERSION: V06.00
 */

import React, { useState, useMemo } from 'react';
import type { PlannerDivision, TournamentPaymentMode, GenderCategory } from '../../../types';
import type { CompetitionFormat } from '../../../types/formats';
import { generateDivisionId, calculateMatchesForFormat } from '../../../services/plannerCalculations';

interface AddDivisionModalProps {
  /** Existing division to edit (optional) */
  division?: PlannerDivision;
  /** Called when division is added/saved */
  onAdd: (division: PlannerDivision) => void;
  /** Called to close modal */
  onClose: () => void;
  /** Payment mode - controls visibility of fee field */
  paymentMode?: TournamentPaymentMode;
  /** If true, show "Coming Soon" formats (app admin only) */
  isAppAdmin?: boolean;
}

const FORMATS: { value: CompetitionFormat; label: string; icon: string; description: string; comingSoon?: boolean }[] = [
  {
    value: 'pool_play_medals',
    label: 'Pool → Medals',
    icon: '🏅',
    description: 'Round robin pools then bracket',
  },
  {
    value: 'round_robin',
    label: 'Round Robin',
    icon: '🔄',
    description: 'Everyone plays everyone',
    comingSoon: true,
  },
  {
    value: 'singles_elimination',
    label: 'Single Elimination',
    icon: '🏆',
    description: 'Bracket, one loss = out',
    comingSoon: true,
  },
];

const PLAYER_OPTIONS = [8, 12, 16, 20, 24, 32];

export const AddDivisionModal: React.FC<AddDivisionModalProps> = ({
  division,
  onAdd,
  onClose,
  paymentMode,
  isAppAdmin = false,
}) => {
  const isEditing = !!division;

  // Filter out "Coming Soon" formats for non-admins
  const availableFormats = isAppAdmin
    ? FORMATS
    : FORMATS.filter(f => !f.comingSoon);

  // Form state
  const [name, setName] = useState(division?.name || '');
  const [playType, setPlayType] = useState<'singles' | 'doubles'>(
    division?.playType || 'doubles'
  );
  const [gender, setGender] = useState<GenderCategory>(
    division?.gender || 'open'
  );
  const [format, setFormat] = useState<CompetitionFormat>(
    division?.format || 'pool_play_medals'
  );
  const [expectedPlayers, setExpectedPlayers] = useState(
    division?.expectedPlayers || 16
  );
  const [poolSize, setPoolSize] = useState(division?.poolSize || 4);

  // DUPR rating requirements
  const [minRating, setMinRating] = useState<string>(
    division?.minRating?.toString() || ''
  );
  const [maxRating, setMaxRating] = useState<string>(
    division?.maxRating?.toString() || ''
  );

  // Age requirements
  const [minAge, setMinAge] = useState<string>(
    division?.minAge?.toString() || ''
  );
  const [maxAge, setMaxAge] = useState<string>(
    division?.maxAge?.toString() || ''
  );

  // Entry fee (in dollars for display, stored in cents)
  const [entryFee, setEntryFee] = useState<string>(
    division?.entryFee ? (division.entryFee / 100).toFixed(2) : ''
  );

  // Calculate match count
  const matchCount = useMemo(() => {
    return calculateMatchesForFormat(format, expectedPlayers, poolSize);
  }, [format, expectedPlayers, poolSize]);

  // Calculate estimated duration (rough estimate)
  const estimatedHours = useMemo(() => {
    const avgMatchMinutes = 20;
    const totalMinutes = matchCount * avgMatchMinutes;
    return (totalMinutes / 60 / 4).toFixed(1); // Assume 4 courts
  }, [matchCount]);

  // Pool count for pool_play_medals
  const poolCount = useMemo(() => {
    if (format === 'pool_play_medals') {
      return Math.ceil(expectedPlayers / poolSize);
    }
    return 0;
  }, [format, expectedPlayers, poolSize]);

  // Build rating label for display
  const ratingLabel = useMemo(() => {
    const min = minRating ? parseFloat(minRating) : null;
    const max = maxRating ? parseFloat(maxRating) : null;
    if (min && max) return `${min.toFixed(1)} - ${max.toFixed(1)}`;
    if (min) return `${min.toFixed(1)}+`;
    if (max) return `Up to ${max.toFixed(1)}`;
    return 'Open';
  }, [minRating, maxRating]);

  // Build age label for display
  const ageLabel = useMemo(() => {
    const min = minAge ? parseInt(minAge) : null;
    const max = maxAge ? parseInt(maxAge) : null;
    if (min && max) return `${min} - ${max}`;
    if (min) return `${min}+`;
    if (max) return `Under ${max + 1}`;
    return 'All Ages';
  }, [minAge, maxAge]);

  // Handle submit
  const handleSubmit = () => {
    if (!name.trim()) return;

    const newDivision: PlannerDivision = {
      id: division?.id || generateDivisionId(),
      name: name.trim(),
      playType,
      gender,
      format,
      expectedPlayers,
      minRating: minRating ? parseFloat(minRating) : undefined,
      maxRating: maxRating ? parseFloat(maxRating) : undefined,
      minAge: minAge ? parseInt(minAge) : undefined,
      maxAge: maxAge ? parseInt(maxAge) : undefined,
      poolSize: format === 'pool_play_medals' ? poolSize : undefined,
      poolCount: format === 'pool_play_medals' ? poolCount : undefined,
      matchCount,
      entryFee: entryFee ? Math.round(parseFloat(entryFee) * 100) : undefined,
    };

    onAdd(newDivision);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">
            {isEditing ? 'Edit Division' : 'Add Division'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6">
          {/* Division Name */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              DIVISION NAME
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Men's Singles"
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Play Type */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              PLAY TYPE
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setPlayType('singles')}
                className={`p-4 rounded-lg text-center transition-all ${
                  playType === 'singles'
                    ? 'bg-blue-600 ring-2 ring-blue-400'
                    : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                <span className="text-2xl mb-1 block">👤</span>
                <span className="text-white font-medium">Singles</span>
              </button>
              <button
                onClick={() => setPlayType('doubles')}
                className={`p-4 rounded-lg text-center transition-all ${
                  playType === 'doubles'
                    ? 'bg-blue-600 ring-2 ring-blue-400'
                    : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                <span className="text-2xl mb-1 block">👥</span>
                <span className="text-white font-medium">Doubles</span>
              </button>
            </div>
          </div>

          {/* Gender */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              GENDER
            </label>
            <div className="grid grid-cols-4 gap-2">
              <button
                onClick={() => setGender('men')}
                className={`p-3 rounded-lg text-center transition-all ${
                  gender === 'men'
                    ? 'bg-blue-600 ring-2 ring-blue-400'
                    : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                <span className="text-white text-sm font-medium">Men</span>
              </button>
              <button
                onClick={() => setGender('women')}
                className={`p-3 rounded-lg text-center transition-all ${
                  gender === 'women'
                    ? 'bg-blue-600 ring-2 ring-blue-400'
                    : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                <span className="text-white text-sm font-medium">Women</span>
              </button>
              <button
                onClick={() => setGender('mixed')}
                className={`p-3 rounded-lg text-center transition-all ${
                  gender === 'mixed'
                    ? 'bg-blue-600 ring-2 ring-blue-400'
                    : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                <span className="text-white text-sm font-medium">Mixed</span>
              </button>
              <button
                onClick={() => setGender('open')}
                className={`p-3 rounded-lg text-center transition-all ${
                  gender === 'open'
                    ? 'bg-blue-600 ring-2 ring-blue-400'
                    : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                <span className="text-white text-sm font-medium">Open</span>
              </button>
            </div>
          </div>

          {/* DUPR Rating Requirements */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              DUPR RATING REQUIREMENTS
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Min Rating</label>
                <input
                  type="number"
                  step="0.1"
                  min="1.0"
                  max="8.0"
                  value={minRating}
                  onChange={(e) => setMinRating(e.target.value)}
                  placeholder="e.g., 3.0"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Max Rating</label>
                <input
                  type="number"
                  step="0.1"
                  min="1.0"
                  max="8.0"
                  value={maxRating}
                  onChange={(e) => setMaxRating(e.target.value)}
                  placeholder="e.g., 4.5"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-gray-500">Skill Level:</span>
              <span className="px-2 py-0.5 bg-blue-900/50 text-blue-300 text-xs rounded">
                {ratingLabel}
              </span>
              {!minRating && !maxRating && (
                <span className="text-xs text-gray-500 italic">
                  Leave empty for open division
                </span>
              )}
            </div>
          </div>

          {/* Age Requirements */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              AGE REQUIREMENTS
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Min Age</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="100"
                  value={minAge}
                  onChange={(e) => setMinAge(e.target.value)}
                  placeholder="e.g., 50"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Max Age</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="100"
                  value={maxAge}
                  onChange={(e) => setMaxAge(e.target.value)}
                  placeholder="e.g., 17"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-gray-500">Age Group:</span>
              <span className="px-2 py-0.5 bg-green-900/50 text-green-300 text-xs rounded">
                {ageLabel}
              </span>
              {!minAge && !maxAge && (
                <span className="text-xs text-gray-500 italic">
                  Leave empty for all ages
                </span>
              )}
            </div>
          </div>

          {/* Entry Fee (only shown if tournament is paid) */}
          {paymentMode === 'paid' && (
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                DIVISION ENTRY FEE
              </label>
              <div className="relative w-48">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={entryFee}
                  onChange={(e) => setEntryFee(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 pl-8 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Fee for this division. Leave empty or $0 for free entry to this division.
              </p>
            </div>
          )}

          {/* Format */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              FORMAT
            </label>
            <div className="grid grid-cols-3 gap-3">
              {availableFormats.map((f) => (
                <button
                  key={f.value}
                  onClick={() => !f.comingSoon && setFormat(f.value)}
                  disabled={f.comingSoon}
                  className={`p-3 rounded-lg text-center transition-all relative ${
                    f.comingSoon
                      ? 'bg-gray-800 opacity-50 cursor-not-allowed'
                      : format === f.value
                        ? 'bg-blue-600 ring-2 ring-blue-400'
                        : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  <span className="text-xl mb-1 block">{f.icon}</span>
                  <span className="text-white text-sm font-medium block">
                    {f.label}
                  </span>
                  {f.comingSoon && (
                    <span className="absolute top-1 right-1 px-1.5 py-0.5 text-[10px] bg-gray-600 text-gray-300 rounded">
                      Soon
                    </span>
                  )}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center">
              {availableFormats.find((f) => f.value === format)?.description}
            </p>
          </div>

          {/* Expected Players */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              EXPECTED {playType === 'singles' ? 'PLAYERS' : 'TEAMS'}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="4"
                max="64"
                step="4"
                value={expectedPlayers}
                onChange={(e) => setExpectedPlayers(parseInt(e.target.value))}
                className="flex-1 accent-blue-500"
              />
              <div className="w-16 text-center">
                <span className="text-xl font-bold text-white">{expectedPlayers}</span>
              </div>
            </div>
            <div className="flex justify-between mt-2">
              {PLAYER_OPTIONS.map((num) => (
                <button
                  key={num}
                  onClick={() => setExpectedPlayers(num)}
                  className={`px-2 py-1 text-xs rounded ${
                    expectedPlayers === num
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Pool Size (only for pool_play_medals) */}
          {format === 'pool_play_medals' && (
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                POOL SIZE
              </label>
              <div className="flex gap-2">
                {[3, 4, 5, 6].map((size) => (
                  <button
                    key={size}
                    onClick={() => setPoolSize(size)}
                    className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                      poolSize === size
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2 text-center">
                Creates {poolCount} pools of {poolSize}
              </p>
            </div>
          )}

          {/* Estimate */}
          <div className="bg-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">📊 This adds:</span>
              <div className="text-right">
                <span className="text-white font-bold">{matchCount} matches</span>
                <span className="text-gray-400 mx-2">•</span>
                <span className="text-white font-bold">~{estimatedHours} hrs</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim()}
            className={`px-6 py-2 rounded-lg font-medium transition-colors ${
              name.trim()
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-600 text-gray-400 cursor-not-allowed'
            }`}
          >
            {isEditing ? 'Save Changes' : 'Add Division'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddDivisionModal;
