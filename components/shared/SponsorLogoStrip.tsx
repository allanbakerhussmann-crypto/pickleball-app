import React from 'react';
import { TournamentSponsor, SponsorTier } from '../../types';
import { SponsorLogoCard } from './SponsorLogoCard';

/**
 * SponsorLogoStrip - Horizontal strip of sponsor logos
 *
 * Features:
 * - Sorts sponsors by tier (platinum first) then by displayOrder
 * - Different size variants for different display contexts
 * - Truncation with "+X more" when maxDisplay is set
 * - Clickable logos open sponsor websites
 *
 * @version 06.19
 */

interface SponsorLogoStripProps {
  sponsors: TournamentSponsor[];
  variant: 'card' | 'header' | 'registration' | 'scoreboard';
  maxDisplay?: number;
  showTierBadge?: boolean;
  className?: string;
}

// Tier priority for sorting (lower = higher priority)
const TIER_PRIORITY: Record<SponsorTier, number> = {
  platinum: 1,
  gold: 2,
  silver: 3,
  bronze: 4,
};

// Size mapping by variant and tier
const VARIANT_SIZE_MAP: Record<string, Record<SponsorTier, 'xs' | 'sm' | 'md' | 'lg'>> = {
  card: {
    platinum: 'sm',
    gold: 'sm',
    silver: 'xs',
    bronze: 'xs',
  },
  header: {
    platinum: 'lg',
    gold: 'md',
    silver: 'sm',
    bronze: 'sm',
  },
  registration: {
    platinum: 'md',
    gold: 'md',
    silver: 'sm',
    bronze: 'sm',
  },
  scoreboard: {
    platinum: 'md',
    gold: 'md',
    silver: 'sm',
    bronze: 'sm',
  },
};

// Gap between logos by variant
const VARIANT_GAP_MAP: Record<string, string> = {
  card: 'gap-1.5',
  header: 'gap-4',
  registration: 'gap-3',
  scoreboard: 'gap-3',
};

export const SponsorLogoStrip: React.FC<SponsorLogoStripProps> = ({
  sponsors,
  variant,
  maxDisplay,
  showTierBadge = false,
  className = '',
}) => {
  // Filter active sponsors and sort by tier then displayOrder
  const sortedSponsors = [...sponsors]
    .filter(s => s.isActive)
    .sort((a, b) => {
      // First sort by tier priority
      const tierDiff = TIER_PRIORITY[a.tier] - TIER_PRIORITY[b.tier];
      if (tierDiff !== 0) return tierDiff;
      // Then by displayOrder (lower first)
      return (a.displayOrder ?? 999) - (b.displayOrder ?? 999);
    });

  if (sortedSponsors.length === 0) {
    return null;
  }

  const displaySponsors = maxDisplay
    ? sortedSponsors.slice(0, maxDisplay)
    : sortedSponsors;
  const remainingCount = maxDisplay
    ? Math.max(0, sortedSponsors.length - maxDisplay)
    : 0;

  const gapClass = VARIANT_GAP_MAP[variant];
  const sizeMap = VARIANT_SIZE_MAP[variant];

  return (
    <div className={`flex items-center ${gapClass} ${className}`}>
      {displaySponsors.map((sponsor) => (
        <SponsorLogoCard
          key={sponsor.id}
          sponsor={sponsor}
          size={sizeMap[sponsor.tier]}
          showTooltip={variant !== 'card'}
        />
      ))}

      {remainingCount > 0 && (
        <div className="
          flex items-center justify-center
          w-7 h-7 rounded-full
          bg-gray-700 text-gray-300 text-xs font-medium
        ">
          +{remainingCount}
        </div>
      )}

      {showTierBadge && variant === 'header' && (
        <div className="ml-2 text-xs text-gray-500">
          {sortedSponsors.filter(s => s.tier === 'platinum').length > 0 && (
            <span className="text-yellow-400 mr-2">Platinum Sponsors</span>
          )}
        </div>
      )}
    </div>
  );
};

export default SponsorLogoStrip;
