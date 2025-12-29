import React, { useState, useRef } from 'react';
import { Club } from '../../types';
import { updateClub, uploadClubLogo } from '../../services/firebase/clubs';

/**
 * ClubSettingsForm - Edit club profile settings
 *
 * Features:
 * - Logo upload with preview
 * - Website URL
 * - Social media links (add/remove)
 * - Contact email and phone
 * - Address and location fields
 *
 * @version 06.19
 */

interface ClubSettingsFormProps {
  club: Club;
  onUpdate: () => void;
}

type SocialPlatform = 'facebook' | 'instagram' | 'twitter';

const SOCIAL_PLATFORMS: { value: SocialPlatform; label: string }[] = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'twitter', label: 'Twitter / X' },
];

export const ClubSettingsForm: React.FC<ClubSettingsFormProps> = ({
  club,
  onUpdate,
}) => {
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [logoUrl, setLogoUrl] = useState(club.logoUrl || '');
  const [website, setWebsite] = useState(club.website || '');
  const [contactEmail, setContactEmail] = useState(club.contactEmail || '');
  const [contactPhone, setContactPhone] = useState(club.contactPhone || '');
  const [address, setAddress] = useState((club as any).address || '');
  const [city, setCity] = useState((club as any).city || '');
  const [socialLinks, setSocialLinks] = useState<{ platform: string; url: string }[]>(
    club.socialLinks || []
  );

  // New social link form
  const [newPlatform, setNewPlatform] = useState<SocialPlatform>('facebook');
  const [newUrl, setNewUrl] = useState('');

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be less than 5MB');
      return;
    }

    setUploadingLogo(true);
    setError(null);

    try {
      const url = await uploadClubLogo(club.id, file);
      setLogoUrl(url);
      // Auto-save logo URL
      await updateClub(club.id, { logoUrl: url });
      onUpdate();
    } catch (err) {
      console.error('Failed to upload logo:', err);
      setError('Failed to upload logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const addSocialLink = () => {
    if (!newUrl.trim()) return;

    // Check if platform already exists
    if (socialLinks.some(link => link.platform === newPlatform)) {
      setError(`${newPlatform} link already added`);
      return;
    }

    setSocialLinks([...socialLinks, { platform: newPlatform, url: newUrl.trim() }]);
    setNewUrl('');
    setError(null);
  };

  const removeSocialLink = (platform: string) => {
    setSocialLinks(socialLinks.filter(link => link.platform !== platform));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      // Build updates object - only include non-empty values
      const updates: Partial<Club> = {};

      // String fields - empty string means remove/clear
      if (website.trim()) updates.website = website.trim();
      if (contactEmail.trim()) updates.contactEmail = contactEmail.trim();
      if (contactPhone.trim()) updates.contactPhone = contactPhone.trim();
      if (socialLinks.length > 0) updates.socialLinks = socialLinks;

      // Location fields
      if (address.trim()) (updates as any).address = address.trim();
      if (city.trim()) (updates as any).city = city.trim();

      await updateClub(club.id, updates);

      setSuccess(true);
      onUpdate();

      // Hide success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to update club:', err);
      setError('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
      <h3 className="text-lg font-semibold text-white mb-6">Club Profile</h3>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Logo Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Club Logo
          </label>
          <div className="flex items-center gap-4">
            {/* Logo Preview */}
            <div className="w-20 h-20 rounded-xl bg-gray-700 flex items-center justify-center overflow-hidden border-2 border-gray-600">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={club.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-2xl font-bold text-gray-400">
                  {club.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>

            {/* Upload Button */}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingLogo}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                {uploadingLogo ? 'Uploading...' : 'Change Logo'}
              </button>
              <p className="text-xs text-gray-500 mt-1">PNG, JPG up to 5MB</p>
            </div>
          </div>
        </div>

        {/* Website */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Website
          </label>
          <input
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://yourclub.com"
            className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime-500"
          />
        </div>

        {/* Contact Email */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Contact Email
          </label>
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="contact@yourclub.com"
            className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime-500"
          />
        </div>

        {/* Contact Phone */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Contact Phone
          </label>
          <input
            type="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="+64 21 123 4567"
            className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime-500"
          />
        </div>

        {/* Address */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Street Address
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main Street"
            className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime-500"
          />
        </div>

        {/* City */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            City
          </label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Auckland"
            className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime-500"
          />
        </div>

        {/* Social Media Links */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Social Media
          </label>

          {/* Existing Links */}
          {socialLinks.length > 0 && (
            <div className="space-y-2 mb-3">
              {socialLinks.map((link) => (
                <div
                  key={link.platform}
                  className="flex items-center gap-2 bg-gray-700 rounded-lg px-3 py-2"
                >
                  <span className="text-sm text-gray-300 capitalize flex-shrink-0">
                    {link.platform}:
                  </span>
                  <span className="text-sm text-gray-400 truncate flex-1">
                    {link.url}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeSocialLink(link.platform)}
                    className="text-red-400 hover:text-red-300 p-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add New Link */}
          <div className="flex gap-2">
            <select
              value={newPlatform}
              onChange={(e) => setNewPlatform(e.target.value as SocialPlatform)}
              className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-lime-500"
            >
              {SOCIAL_PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://..."
              className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime-500"
            />
            <button
              type="button"
              onClick={addSocialLink}
              disabled={!newUrl.trim()}
              className="px-3 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="p-3 bg-green-500/20 border border-green-500/50 rounded-lg text-green-400 text-sm">
            Changes saved successfully!
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 bg-lime-600 hover:bg-lime-500 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
};

export default ClubSettingsForm;
