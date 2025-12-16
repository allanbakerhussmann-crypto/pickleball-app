/**
 * CreateLeague Component
 * 
 * Form for creating a new league
 * 
 * FILE LOCATION: components/leagues/CreateLeague.tsx
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { createLeague } from '../../services/firebase/leagues';
import { getClubsForUser } from '../../services/firebase';
import type { League, LeagueType, LeagueFormat, LeagueSettings, DEFAULT_LEAGUE_SETTINGS } from '../../types/league';
import type { Club } from '../../types';

interface CreateLeagueProps {
  onBack: () => void;
  onCreated: (leagueId: string) => void;
}

export const CreateLeague: React.FC<CreateLeagueProps> = ({ onBack, onCreated }) => {
  const { currentUser, userProfile } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clubs, setClubs] = useState<Club[]>([]);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'singles' as LeagueType,
    format: 'ladder' as LeagueFormat,
    clubId: '',
    seasonStart: '',
    seasonEnd: '',
    registrationDeadline: '',
    location: '',
    visibility: 'public' as 'public' | 'private' | 'club_only',
  });

  const [settings, setSettings] = useState<LeagueSettings>({
    pointsForWin: 3,
    pointsForDraw: 1,
    pointsForLoss: 0,
    gamesPerMatch: 3,
    pointsPerGame: 11,
    winBy: 2,
    allowSelfReporting: true,
    requireConfirmation: true,
    challengeRangeUp: 3,
    maxMembers: null,
    minRating: null,
    maxRating: null,
  });

  // Load user's clubs
  useEffect(() => {
    if (currentUser) {
      getClubsForUser(currentUser.uid).then(setClubs);
    }
  }, [currentUser]);

  const selectedClub = clubs.find(c => c.id === formData.clubId);

  const handleSubmit = async () => {
    if (!currentUser) return;

    setError(null);
    setLoading(true);

    try {
      // Validation
      if (!formData.name.trim()) throw new Error('League name is required');
      if (!formData.seasonStart) throw new Error('Season start date is required');
      if (!formData.seasonEnd) throw new Error('Season end date is required');

      const leagueId = await createLeague({
        name: formData.name.trim(),
        description: formData.description.trim(),
        type: formData.type,
        format: formData.format,
        clubId: formData.clubId || null,
        clubName: selectedClub?.name || null,
        createdByUserId: currentUser.uid,
        seasonStart: new Date(formData.seasonStart).getTime(),
        seasonEnd: new Date(formData.seasonEnd).getTime(),
        registrationDeadline: formData.registrationDeadline 
          ? new Date(formData.registrationDeadline).getTime() 
          : null,
        status: 'registration',
        settings,
        location: formData.location || null,
        region: null,
        visibility: formData.visibility,
      });

      onCreated(leagueId);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-4"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Leagues
        </button>
        <h1 className="text-2xl font-bold text-white">Create League</h1>
        <p className="text-gray-400 text-sm">Set up a new competitive league</p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <React.Fragment key={s}>
            <button
              onClick={() => s < step && setStep(s)}
              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${
                s === step
                  ? 'bg-blue-600 text-white'
                  : s < step
                  ? 'bg-blue-900 text-blue-400 hover:bg-blue-800'
                  : 'bg-gray-700 text-gray-500'
              }`}
            >
              {s}
            </button>
            {s < 3 && (
              <div className={`flex-1 h-1 rounded ${s < step ? 'bg-blue-600' : 'bg-gray-700'}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Step 1: Basic Info */}
      {step === 1 && (
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 space-y-6">
          <h2 className="text-lg font-bold text-white">Basic Information</h2>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              League Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Canterbury Singles Ladder"
              className="w-full bg-gray-900 text-white p-3 rounded-lg border border-gray-600 focus:border-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Tell players what this league is about..."
              rows={3}
              className="w-full bg-gray-900 text-white p-3 rounded-lg border border-gray-600 focus:border-blue-500 outline-none resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">League Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as LeagueType })}
                className="w-full bg-gray-900 text-white p-3 rounded-lg border border-gray-600 focus:border-blue-500 outline-none"
              >
                <option value="singles">Singles</option>
                <option value="doubles">Doubles</option>
                <option value="team">Team</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Format</label>
              <select
                value={formData.format}
                onChange={(e) => setFormData({ ...formData, format: e.target.value as LeagueFormat })}
                className="w-full bg-gray-900 text-white p-3 rounded-lg border border-gray-600 focus:border-blue-500 outline-none"
              >
                <option value="ladder">Ladder (Challenge-based)</option>
                <option value="round_robin">Round Robin</option>
                <option value="swiss">Swiss System</option>
              </select>
            </div>
          </div>

          {clubs.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Host Club (Optional)
              </label>
              <select
                value={formData.clubId}
                onChange={(e) => setFormData({ ...formData, clubId: e.target.value })}
                className="w-full bg-gray-900 text-white p-3 rounded-lg border border-gray-600 focus:border-blue-500 outline-none"
              >
                <option value="">No club affiliation</option>
                {clubs.map((club) => (
                  <option key={club.id} value={club.id}>{club.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={() => setStep(2)}
              disabled={!formData.name.trim()}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
            >
              Next: Schedule
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Schedule */}
      {step === 2 && (
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 space-y-6">
          <h2 className="text-lg font-bold text-white">Season Schedule</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Season Start <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={formData.seasonStart}
                onChange={(e) => setFormData({ ...formData, seasonStart: e.target.value })}
                className="w-full bg-gray-900 text-white p-3 rounded-lg border border-gray-600 focus:border-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Season End <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={formData.seasonEnd}
                onChange={(e) => setFormData({ ...formData, seasonEnd: e.target.value })}
                className="w-full bg-gray-900 text-white p-3 rounded-lg border border-gray-600 focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Registration Deadline (Optional)
            </label>
            <input
              type="date"
              value={formData.registrationDeadline}
              onChange={(e) => setFormData({ ...formData, registrationDeadline: e.target.value })}
              className="w-full bg-gray-900 text-white p-3 rounded-lg border border-gray-600 focus:border-blue-500 outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              Leave blank to allow registration throughout the season
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Location</label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="e.g., Christchurch, NZ"
              className="w-full bg-gray-900 text-white p-3 rounded-lg border border-gray-600 focus:border-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Visibility</label>
            <select
              value={formData.visibility}
              onChange={(e) => setFormData({ ...formData, visibility: e.target.value as any })}
              className="w-full bg-gray-900 text-white p-3 rounded-lg border border-gray-600 focus:border-blue-500 outline-none"
            >
              <option value="public">Public - Anyone can see and join</option>
              <option value="private">Private - Invite only</option>
              {formData.clubId && (
                <option value="club_only">Club Only - Only club members can join</option>
              )}
            </select>
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setStep(1)}
              className="text-gray-400 hover:text-white px-4 py-2"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!formData.seasonStart || !formData.seasonEnd}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
            >
              Next: Settings
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Settings */}
      {step === 3 && (
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 space-y-6">
          <h2 className="text-lg font-bold text-white">League Settings</h2>

          {/* Points System */}
          <div>
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Points System</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Win</label>
                <input
                  type="number"
                  value={settings.pointsForWin}
                  onChange={(e) => setSettings({ ...settings, pointsForWin: parseInt(e.target.value) || 0 })}
                  className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600 text-center"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Draw</label>
                <input
                  type="number"
                  value={settings.pointsForDraw}
                  onChange={(e) => setSettings({ ...settings, pointsForDraw: parseInt(e.target.value) || 0 })}
                  className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600 text-center"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Loss</label>
                <input
                  type="number"
                  value={settings.pointsForLoss}
                  onChange={(e) => setSettings({ ...settings, pointsForLoss: parseInt(e.target.value) || 0 })}
                  className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600 text-center"
                />
              </div>
            </div>
          </div>

          {/* Match Rules */}
          <div>
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Match Rules</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Games per Match</label>
                <select
                  value={settings.gamesPerMatch}
                  onChange={(e) => setSettings({ ...settings, gamesPerMatch: parseInt(e.target.value) as 1 | 3 | 5 })}
                  className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"
                >
                  <option value={1}>Best of 1</option>
                  <option value={3}>Best of 3</option>
                  <option value={5}>Best of 5</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Points per Game</label>
                <select
                  value={settings.pointsPerGame}
                  onChange={(e) => setSettings({ ...settings, pointsPerGame: parseInt(e.target.value) as 11 | 15 | 21 })}
                  className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"
                >
                  <option value={11}>11 points</option>
                  <option value={15}>15 points</option>
                  <option value={21}>21 points</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Win By</label>
                <select
                  value={settings.winBy}
                  onChange={(e) => setSettings({ ...settings, winBy: parseInt(e.target.value) as 1 | 2 })}
                  className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"
                >
                  <option value={1}>Win by 1</option>
                  <option value={2}>Win by 2</option>
                </select>
              </div>
            </div>
          </div>

          {/* Ladder Settings */}
          {formData.format === 'ladder' && (
            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Ladder Rules</h3>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Challenge Range (positions above)
                </label>
                <input
                  type="number"
                  value={settings.challengeRangeUp || ''}
                  onChange={(e) => setSettings({ ...settings, challengeRangeUp: parseInt(e.target.value) || null })}
                  placeholder="e.g., 3"
                  className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"
                />
                <p className="text-xs text-gray-500 mt-1">
                  How many positions above can a player challenge?
                </p>
              </div>
            </div>
          )}

          {/* Score Reporting */}
          <div>
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Score Reporting</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.allowSelfReporting}
                  onChange={(e) => setSettings({ ...settings, allowSelfReporting: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-300">Allow players to submit their own scores</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.requireConfirmation}
                  onChange={(e) => setSettings({ ...settings, requireConfirmation: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-300">Require opponent confirmation</span>
              </label>
            </div>
          </div>

          {/* Restrictions */}
          <div>
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Restrictions (Optional)</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Max Members</label>
                <input
                  type="number"
                  value={settings.maxMembers || ''}
                  onChange={(e) => setSettings({ ...settings, maxMembers: parseInt(e.target.value) || null })}
                  placeholder="Unlimited"
                  className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Rating Range</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={settings.minRating || ''}
                    onChange={(e) => setSettings({ ...settings, minRating: parseFloat(e.target.value) || null })}
                    placeholder="Min"
                    className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"
                  />
                  <input
                    type="number"
                    value={settings.maxRating || ''}
                    onChange={(e) => setSettings({ ...settings, maxRating: parseFloat(e.target.value) || null })}
                    placeholder="Max"
                    className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t border-gray-700">
            <button
              onClick={() => setStep(2)}
              className="text-gray-400 hover:text-white px-4 py-2"
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white px-6 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2"
            >
              {loading && (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              )}
              Create League
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateLeague;