import React, { useState, useEffect } from 'react';
import { Club, ClubCourt } from '../../types';
import { getClub } from '../../services/firebase/clubs';

/**
 * VenuePreview - Displays club venue/courts info
 *
 * Features:
 * - Shows court count and types
 * - Displays surface types and features
 * - Operating hours if booking enabled
 * - Link to book courts (optional)
 *
 * @version 06.19
 */

interface VenuePreviewProps {
  clubId: string;
  variant: 'compact' | 'full';
  showBookingLink?: boolean;
  className?: string;
}

// Surface type display names
const SURFACE_NAMES: Record<string, string> = {
  concrete: 'Concrete',
  asphalt: 'Asphalt',
  sport_court: 'Sport Court',
  wood: 'Wood',
  indoor: 'Indoor',
  outdoor: 'Outdoor',
};

// Court feature icons
const FeatureIcon: React.FC<{ feature: string }> = ({ feature }) => {
  const icons: Record<string, { icon: string; label: string }> = {
    lighting: { icon: '💡', label: 'Lighting' },
    covered: { icon: '🏠', label: 'Covered' },
    indoor: { icon: '🏢', label: 'Indoor' },
    outdoor: { icon: '☀️', label: 'Outdoor' },
    wheelchair: { icon: '♿', label: 'Accessible' },
  };
  const info = icons[feature.toLowerCase()] || { icon: '✓', label: feature };
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-400">
      <span>{info.icon}</span>
      <span>{info.label}</span>
    </span>
  );
};

export const VenuePreview: React.FC<VenuePreviewProps> = ({
  clubId,
  variant,
  showBookingLink = false,
  className = '',
}) => {
  const [club, setClub] = useState<Club | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clubId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    getClub(clubId)
      .then((data) => setClub(data))
      .catch((err) => console.error('Failed to fetch club:', err))
      .finally(() => setLoading(false));
  }, [clubId]);

  if (loading) {
    return (
      <div className={`bg-gray-800/50 rounded-xl p-4 animate-pulse ${className}`}>
        <div className="h-4 bg-gray-700 rounded w-1/3 mb-2"></div>
        <div className="h-3 bg-gray-700 rounded w-2/3"></div>
      </div>
    );
  }

  if (!club || !club.courts || club.courts.length === 0) {
    return null;
  }

  const courts = club.courts;
  const bookingSettings = club.bookingSettings;

  // Get unique surface types
  const surfaces = [...new Set(courts.map(c => c.surfaceType).filter(Boolean))];

  // Get unique features across all courts
  const allFeatures = new Set<string>();
  courts.forEach(court => {
    court.features?.forEach(f => allFeatures.add(f));
  });

  // Count courts with lighting
  const courtsWithLighting = courts.filter(c => c.hasLighting).length;

  if (variant === 'compact') {
    return (
      <div className={`bg-gray-800/50 rounded-xl p-4 border border-gray-700/50 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Court Icon */}
            <div className="w-10 h-10 rounded-lg bg-lime-500/20 flex items-center justify-center">
              <span className="text-lg">🏓</span>
            </div>

            {/* Court Info */}
            <div>
              <div className="text-sm font-medium text-white">
                {courts.length} Court{courts.length !== 1 ? 's' : ''}
              </div>
              <div className="text-xs text-gray-400">
                {surfaces.map(s => SURFACE_NAMES[s] || s).join(', ')}
                {courtsWithLighting > 0 && ` • ${courtsWithLighting} with lights`}
              </div>
            </div>
          </div>

          {/* Book Link */}
          {showBookingLink && bookingSettings?.enabled && (
            <a
              href={`/#/clubs/${clubId}`}
              className="px-3 py-1.5 bg-lime-600 hover:bg-lime-500 text-white text-xs font-medium rounded-lg transition-colors"
            >
              Book Court
            </a>
          )}
        </div>
      </div>
    );
  }

  // Full variant
  return (
    <div className={`bg-gray-800/50 rounded-xl p-4 border border-gray-700/50 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-medium text-gray-300 uppercase tracking-wide">
          Venue Courts
        </h4>
        {showBookingLink && bookingSettings?.enabled && (
          <a
            href={`/#/clubs/${clubId}`}
            className="text-xs text-lime-400 hover:text-lime-300 transition-colors"
          >
            Book a Court →
          </a>
        )}
      </div>

      {/* Courts Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {courts.map((court, idx) => (
          <div
            key={court.id || idx}
            className="bg-gray-700/50 rounded-lg p-3 border border-gray-600/50"
          >
            <div className="text-sm font-medium text-white mb-1">
              {court.name || `Court ${idx + 1}`}
            </div>
            <div className="text-xs text-gray-400 space-y-1">
              {court.surfaceType && (
                <div>{SURFACE_NAMES[court.surfaceType] || court.surfaceType}</div>
              )}
              {court.hasLighting && (
                <div className="text-yellow-400">💡 Lighting</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Features Summary */}
      {allFeatures.size > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-700/50">
          <div className="flex flex-wrap gap-3">
            {Array.from(allFeatures).map((feature) => (
              <FeatureIcon key={feature} feature={feature} />
            ))}
          </div>
        </div>
      )}

      {/* Operating Hours */}
      {bookingSettings?.enabled && bookingSettings.openTime && bookingSettings.closeTime && (
        <div className="mt-3 pt-3 border-t border-gray-700/50 text-xs text-gray-400">
          Open: {formatTime(bookingSettings.openTime)} - {formatTime(bookingSettings.closeTime)}
        </div>
      )}
    </div>
  );
};

// Helper to format 24h time to 12h
function formatTime(time24: string): string {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

export default VenuePreview;
