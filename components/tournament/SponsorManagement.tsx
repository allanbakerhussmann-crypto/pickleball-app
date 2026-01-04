import React, { useState, useRef } from 'react';
import { TournamentSponsor, SponsorTier, SponsorDisplaySettings } from '../../types';
import {
  addTournamentSponsor,
  updateTournamentSponsor,
  removeTournamentSponsor,
  uploadSponsorLogo,
  updateSponsorDisplaySettings,
} from '../../services/firebase/tournaments';
import { SponsorLogoStrip } from '../shared/SponsorLogoStrip';

/**
 * SponsorManagement - Admin panel for managing tournament sponsors
 *
 * Features:
 * - Add/edit/delete sponsors
 * - Logo upload to Firebase Storage
 * - Tier selection (Platinum, Gold, Silver, Bronze)
 * - Drag-drop reorder
 * - Toggle active/inactive
 * - Display settings configuration
 * - Live preview
 *
 * @version 06.19
 */

interface SponsorManagementProps {
  tournamentId: string;
  sponsors: TournamentSponsor[];
  displaySettings?: SponsorDisplaySettings;
  onUpdate: () => void;
}

const TIER_OPTIONS: { value: SponsorTier; label: string; color: string }[] = [
  { value: 'platinum', label: 'Platinum', color: 'bg-yellow-400 text-black' },
  { value: 'gold', label: 'Gold', color: 'bg-yellow-500 text-black' },
  { value: 'silver', label: 'Silver', color: 'bg-gray-400 text-black' },
  { value: 'bronze', label: 'Bronze', color: 'bg-amber-700 text-white' },
];

const DEFAULT_DISPLAY_SETTINGS: SponsorDisplaySettings = {
  showOnCards: true,
  showOnHeader: true,
  showOnRegistration: true,
  showOnScoreboard: true,
};

export const SponsorManagement: React.FC<SponsorManagementProps> = ({
  tournamentId,
  sponsors,
  displaySettings = DEFAULT_DISPLAY_SETTINGS,
  onUpdate,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingSponsorId, setEditingSponsorId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [tier, setTier] = useState<SponsorTier>('gold');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setName('');
    setWebsiteUrl('');
    setTier('gold');
    setLogoFile(null);
    setLogoPreview(null);
    setIsAdding(false);
    setEditingSponsorId(null);
    setError(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        return;
      }
      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        setError('Image must be less than 2MB');
        return;
      }
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
      setError(null);
    }
  };

  const handleAddSponsor = async () => {
    if (!name.trim()) {
      setError('Sponsor name is required');
      return;
    }
    if (!logoFile && !editingSponsorId) {
      setError('Sponsor logo is required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (editingSponsorId) {
        // Update existing sponsor
        const updates: Partial<TournamentSponsor> = {
          name: name.trim(),
          tier,
        };

        // Only include websiteUrl if it has a value (Firestore doesn't allow undefined)
        const trimmedWebsiteUrl = websiteUrl.trim();
        if (trimmedWebsiteUrl) {
          updates.websiteUrl = trimmedWebsiteUrl;
        }

        // Upload new logo if provided
        if (logoFile) {
          const logoUrl = await uploadSponsorLogo(tournamentId, editingSponsorId, logoFile);
          updates.logoUrl = logoUrl;
        }

        await updateTournamentSponsor(tournamentId, editingSponsorId, updates);
      } else {
        // Add new sponsor
        const tempId = `temp_${Date.now()}`;
        const logoUrl = await uploadSponsorLogo(tournamentId, tempId, logoFile!);

        // Build sponsor data, only including websiteUrl if it has a value
        const trimmedWebsiteUrl = websiteUrl.trim();
        const sponsorData: Partial<TournamentSponsor> & { name: string; logoUrl: string; tier: SponsorTier; isActive: boolean } = {
          name: name.trim(),
          logoUrl,
          tier,
          isActive: true,
        };
        if (trimmedWebsiteUrl) {
          sponsorData.websiteUrl = trimmedWebsiteUrl;
        }

        await addTournamentSponsor(tournamentId, sponsorData);
      }

      resetForm();
      onUpdate();
    } catch (err) {
      console.error('Error saving sponsor:', err);
      setError('Failed to save sponsor. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditSponsor = (sponsor: TournamentSponsor) => {
    setEditingSponsorId(sponsor.id);
    setName(sponsor.name);
    setWebsiteUrl(sponsor.websiteUrl || '');
    setTier(sponsor.tier);
    setLogoPreview(sponsor.logoUrl);
    setIsAdding(true);
  };

  const handleDeleteSponsor = async (sponsorId: string) => {
    if (!confirm('Are you sure you want to delete this sponsor?')) return;

    setIsLoading(true);
    try {
      await removeTournamentSponsor(tournamentId, sponsorId);
      onUpdate();
    } catch (err) {
      console.error('Error deleting sponsor:', err);
      setError('Failed to delete sponsor');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleActive = async (sponsor: TournamentSponsor) => {
    try {
      await updateTournamentSponsor(tournamentId, sponsor.id, {
        isActive: !sponsor.isActive,
      });
      onUpdate();
    } catch (err) {
      console.error('Error toggling sponsor:', err);
    }
  };

  const handleDisplaySettingChange = async (key: keyof SponsorDisplaySettings) => {
    try {
      await updateSponsorDisplaySettings(tournamentId, {
        [key]: !displaySettings[key],
      });
      onUpdate();
    } catch (err) {
      console.error('Error updating display settings:', err);
    }
  };

  // Sort sponsors by tier then displayOrder
  const sortedSponsors = [...sponsors].sort((a, b) => {
    const tierOrder = { platinum: 0, gold: 1, silver: 2, bronze: 3 };
    const tierDiff = tierOrder[a.tier] - tierOrder[b.tier];
    if (tierDiff !== 0) return tierDiff;
    return (a.displayOrder ?? 999) - (b.displayOrder ?? 999);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Tournament Sponsors</h3>
          <p className="text-sm text-gray-400 mt-1">
            Add sponsors to display their logos throughout the tournament
          </p>
        </div>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="px-4 py-2 bg-lime-500 text-black rounded-lg font-medium hover:bg-lime-400 transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Sponsor
          </button>
        )}
      </div>

      {/* Add/Edit Form */}
      {isAdding && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h4 className="text-md font-medium text-white mb-4">
            {editingSponsorId ? 'Edit Sponsor' : 'Add New Sponsor'}
          </h4>

          {error && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Logo Upload */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Logo {!editingSponsorId && <span className="text-red-400">*</span>}
              </label>
              <div className="flex items-center gap-4">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-600 flex items-center justify-center cursor-pointer hover:border-gray-500 transition-colors bg-gray-900 overflow-hidden"
                >
                  {logoPreview ? (
                    <img src={logoPreview} alt="Preview" className="w-full h-full object-contain p-2" />
                  ) : (
                    <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  )}
                </div>
                <div className="text-sm text-gray-400">
                  <p>Click to upload logo</p>
                  <p className="text-xs">PNG, JPG, SVG (max 2MB)</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Sponsor Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Acme Corp"
                className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-lime-500 focus:border-transparent"
              />
            </div>

            {/* Website URL */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Website URL
              </label>
              <input
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-lime-500 focus:border-transparent"
              />
            </div>

            {/* Tier Selection */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Sponsorship Tier
              </label>
              <div className="flex flex-wrap gap-2">
                {TIER_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setTier(option.value)}
                    className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                      tier === option.value
                        ? option.color + ' ring-2 ring-offset-2 ring-offset-gray-800 ring-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Higher tiers display larger logos and appear first
              </p>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={resetForm}
              className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddSponsor}
              disabled={isLoading}
              className="px-4 py-2 bg-lime-500 text-black rounded-lg font-medium hover:bg-lime-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Saving...' : editingSponsorId ? 'Update Sponsor' : 'Add Sponsor'}
            </button>
          </div>
        </div>
      )}

      {/* Sponsors List */}
      {sortedSponsors.length > 0 ? (
        <div className="space-y-3">
          {sortedSponsors.map((sponsor) => (
            <div
              key={sponsor.id}
              className={`bg-gray-800 rounded-lg p-4 border ${
                sponsor.isActive ? 'border-gray-700' : 'border-gray-800 opacity-50'
              }`}
            >
              <div className="flex items-center gap-4">
                {/* Logo */}
                <div className="w-16 h-16 rounded-lg bg-white overflow-hidden flex-shrink-0">
                  <img
                    src={sponsor.logoUrl}
                    alt={sponsor.name}
                    className="w-full h-full object-contain p-1"
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-white font-medium truncate">{sponsor.name}</h4>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      TIER_OPTIONS.find(t => t.value === sponsor.tier)?.color
                    }`}>
                      {sponsor.tier.charAt(0).toUpperCase() + sponsor.tier.slice(1)}
                    </span>
                    {!sponsor.isActive && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-600 text-gray-300">
                        Hidden
                      </span>
                    )}
                  </div>
                  {sponsor.websiteUrl && (
                    <a
                      href={sponsor.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-lime-400 hover:underline truncate block"
                    >
                      {sponsor.websiteUrl}
                    </a>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleToggleActive(sponsor)}
                    className={`p-2 rounded-lg transition-colors ${
                      sponsor.isActive
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        : 'bg-lime-500/20 text-lime-400 hover:bg-lime-500/30'
                    }`}
                    title={sponsor.isActive ? 'Hide sponsor' : 'Show sponsor'}
                  >
                    {sponsor.isActive ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={() => handleEditSponsor(sponsor)}
                    className="p-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
                    title="Edit sponsor"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDeleteSponsor(sponsor.id)}
                    className="p-2 rounded-lg bg-gray-700 text-red-400 hover:bg-red-900/50 transition-colors"
                    title="Delete sponsor"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : !isAdding ? (
        <div className="text-center py-12 bg-gray-800/50 rounded-lg border border-dashed border-gray-700">
          <svg className="w-12 h-12 mx-auto text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          <p className="text-gray-400">No sponsors added yet</p>
          <p className="text-sm text-gray-500 mt-1">Add sponsors to display their logos throughout the tournament</p>
        </div>
      ) : null}

      {/* Display Settings */}
      {sortedSponsors.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h4 className="text-sm font-medium text-gray-300 mb-3">Display Settings</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { key: 'showOnCards' as const, label: 'Tournament Cards' },
              { key: 'showOnHeader' as const, label: 'Detail Header' },
              { key: 'showOnRegistration' as const, label: 'Registration' },
              { key: 'showOnScoreboard' as const, label: 'Scoreboards' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={displaySettings[key]}
                  onChange={() => handleDisplaySettingChange(key)}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-lime-500 focus:ring-lime-500"
                />
                <span className="text-sm text-gray-400">{label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Preview */}
      {sortedSponsors.filter(s => s.isActive).length > 0 && (
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h4 className="text-sm font-medium text-gray-300 mb-3">Preview</h4>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-gray-500 mb-2">Card View</p>
              <SponsorLogoStrip sponsors={sortedSponsors} variant="card" maxDisplay={3} />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-2">Header View</p>
              <SponsorLogoStrip sponsors={sortedSponsors} variant="header" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SponsorManagement;
