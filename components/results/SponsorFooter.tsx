/**
 * SponsorFooter - Sticky footer with sponsor logos
 *
 * Displays all active sponsors in a fixed footer at the bottom of the page.
 *
 * @version V06.19
 * @file components/results/SponsorFooter.tsx
 */

import React from 'react';
import { SponsorLogoStrip } from '../shared/SponsorLogoStrip';
import type { TournamentSponsor } from '../../types';

interface SponsorFooterProps {
  sponsors: TournamentSponsor[];
}

export const SponsorFooter: React.FC<SponsorFooterProps> = ({ sponsors }) => {
  // Filter active sponsors
  const activeSponsors = sponsors.filter(s => s.isActive);

  if (activeSponsors.length === 0) {
    return null;
  }

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-40 bg-gray-900/95 backdrop-blur border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-center gap-4">
          {/* Label */}
          <span className="text-xs text-gray-500 uppercase tracking-wide hidden sm:block">
            Proudly Sponsored By
          </span>

          {/* Sponsor Logos */}
          <SponsorLogoStrip
            sponsors={activeSponsors}
            variant="scoreboard"
            maxDisplay={6}
          />
        </div>
      </div>
    </footer>
  );
};

export default SponsorFooter;
