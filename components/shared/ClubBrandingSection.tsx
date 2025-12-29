import React, { useState, useEffect } from 'react';
import { Club } from '../../types';
import { getClub } from '../../services/firebase/clubs';

/**
 * ClubBrandingSection - Displays club/organizer branding
 *
 * Features:
 * - Fetches club data by clubId (self-contained)
 * - Shows club logo, name, organizer, website, social links
 * - Two variants: header (full display) and scoreboard (compact)
 * - Links to club page and external websites
 *
 * @version 06.19
 */

interface ClubBrandingSectionProps {
  clubId?: string;
  clubName?: string;
  organizerName?: string;
  variant: 'header' | 'scoreboard';
  className?: string;
}

// Social media icons
const SocialIcon: React.FC<{ platform: string }> = ({ platform }) => {
  const icons: Record<string, JSX.Element> = {
    facebook: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    ),
    instagram: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
      </svg>
    ),
    twitter: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    ),
    website: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/>
      </svg>
    ),
  };
  return icons[platform.toLowerCase()] || icons.website;
};

export const ClubBrandingSection: React.FC<ClubBrandingSectionProps> = ({
  clubId,
  clubName,
  organizerName,
  variant,
  className = '',
}) => {
  const [club, setClub] = useState<Club | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch club data when clubId changes
  useEffect(() => {
    if (!clubId) {
      setClub(null);
      return;
    }

    setLoading(true);
    getClub(clubId)
      .then((data) => {
        setClub(data);
      })
      .catch((err) => {
        console.error('Failed to fetch club:', err);
        setClub(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [clubId]);

  // If no club info at all, don't render
  if (!clubId && !clubName && !organizerName) {
    return null;
  }

  const displayName = club?.name || clubName;
  const logoUrl = club?.logoUrl;
  const website = club?.website;
  const socialLinks = club?.socialLinks || [];
  const contactEmail = club?.contactEmail;

  // Scoreboard variant - compact display
  if (variant === 'scoreboard') {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        {/* Logo */}
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={displayName || 'Club'}
            className="h-8 w-8 rounded-lg object-cover bg-white"
          />
        ) : displayName ? (
          <div className="h-8 w-8 rounded-lg bg-gray-700 flex items-center justify-center text-sm font-bold text-white">
            {displayName.charAt(0).toUpperCase()}
          </div>
        ) : null}

        {/* Name */}
        {displayName && (
          <div className="text-sm">
            <span className="text-gray-400">Hosted by </span>
            <span className="text-white font-medium">{displayName}</span>
          </div>
        )}
      </div>
    );
  }

  // Header variant - full display
  return (
    <div className={`bg-gray-900/40 rounded-xl p-4 border border-white/5 ${className}`}>
      <div className="flex items-start gap-4">
        {/* Club Logo */}
        <a
          href={clubId ? `/#/clubs/${clubId}` : undefined}
          className={clubId ? 'hover:opacity-80 transition-opacity' : ''}
        >
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={displayName || 'Club'}
              className="w-16 h-16 rounded-xl object-cover bg-white shadow-lg"
            />
          ) : displayName ? (
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-2xl font-bold text-white shadow-lg">
              {displayName.charAt(0).toUpperCase()}
            </div>
          ) : null}
        </a>

        {/* Club Info */}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Hosted by</p>

          {/* Club Name */}
          {displayName && (
            <a
              href={clubId ? `/#/clubs/${clubId}` : undefined}
              className={`text-lg font-semibold text-white ${clubId ? 'hover:text-lime-400 transition-colors' : ''}`}
            >
              {displayName}
            </a>
          )}

          {/* Organizer Name */}
          {organizerName && (
            <p className="text-sm text-gray-400 mt-0.5">
              Organized by {organizerName}
            </p>
          )}

          {/* Links Row */}
          <div className="flex items-center gap-3 mt-2">
            {/* Website */}
            {website && (
              <a
                href={website.startsWith('http') ? website : `https://${website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-lime-400 hover:text-lime-300 transition-colors"
              >
                <SocialIcon platform="website" />
                <span>Website</span>
              </a>
            )}

            {/* Social Links */}
            {socialLinks.map((link, idx) => (
              <a
                key={idx}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white transition-colors"
                title={link.platform}
              >
                <SocialIcon platform={link.platform} />
              </a>
            ))}

            {/* Contact Email */}
            {contactEmail && (
              <a
                href={`mailto:${contactEmail}`}
                className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                </svg>
                <span>Contact</span>
              </a>
            )}
          </div>
        </div>
      </div>

      {loading && (
        <div className="absolute inset-0 bg-gray-900/50 rounded-xl flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-lime-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
    </div>
  );
};

export default ClubBrandingSection;
