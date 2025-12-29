import React from 'react';
import { TournamentSponsor, SponsorTier } from '../../types';

/**
 * SponsorLogoCard - Individual sponsor logo with tier-appropriate styling
 *
 * Features:
 * - Clickable logo opens website in new tab
 * - Size varies by tier or explicit size prop
 * - Tooltip shows sponsor name on hover
 *
 * @version 06.19
 */

interface SponsorLogoCardProps {
  sponsor: TournamentSponsor;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showTooltip?: boolean;
  className?: string;
}

// Size mappings in pixels
const SIZE_MAP = {
  xs: 20,
  sm: 28,
  md: 48,
  lg: 80,
};

// Default size by tier
const TIER_SIZE_MAP: Record<SponsorTier, 'xs' | 'sm' | 'md' | 'lg'> = {
  platinum: 'lg',
  gold: 'md',
  silver: 'sm',
  bronze: 'xs',
};

// Border color by tier
const TIER_BORDER_MAP: Record<SponsorTier, string> = {
  platinum: 'border-yellow-400 ring-1 ring-yellow-400/30',
  gold: 'border-yellow-500',
  silver: 'border-gray-400',
  bronze: 'border-amber-700',
};

export const SponsorLogoCard: React.FC<SponsorLogoCardProps> = ({
  sponsor,
  size,
  showTooltip = true,
  className = '',
}) => {
  const effectiveSize = size || TIER_SIZE_MAP[sponsor.tier];
  const pixelSize = SIZE_MAP[effectiveSize];
  const borderClass = TIER_BORDER_MAP[sponsor.tier];

  const handleClick = () => {
    if (sponsor.websiteUrl) {
      window.open(sponsor.websiteUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div
      className={`relative group ${className}`}
      style={{ width: pixelSize, height: pixelSize }}
    >
      <button
        onClick={handleClick}
        disabled={!sponsor.websiteUrl}
        className={`
          w-full h-full rounded-lg overflow-hidden border-2 ${borderClass}
          bg-white flex items-center justify-center
          transition-all duration-200
          ${sponsor.websiteUrl ? 'cursor-pointer hover:scale-110 hover:shadow-lg' : 'cursor-default'}
        `}
        title={showTooltip ? sponsor.name : undefined}
      >
        <img
          src={sponsor.logoUrl}
          alt={sponsor.name}
          className="w-full h-full object-contain p-1"
          onError={(e) => {
            // Fallback to initials if image fails
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            target.parentElement!.innerHTML = `
              <span class="text-gray-800 font-bold text-xs">
                ${sponsor.name.charAt(0).toUpperCase()}
              </span>
            `;
          }}
        />
      </button>

      {/* Tooltip */}
      {showTooltip && (
        <div className="
          absolute -bottom-8 left-1/2 -translate-x-1/2
          px-2 py-1 rounded bg-gray-900 text-white text-xs whitespace-nowrap
          opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none
          z-10
        ">
          {sponsor.name}
          {sponsor.tier === 'platinum' && (
            <span className="ml-1 text-yellow-400">★</span>
          )}
        </div>
      )}
    </div>
  );
};

export default SponsorLogoCard;
