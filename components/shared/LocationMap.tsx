import React, { useState, useEffect } from 'react';
import { Club } from '../../types';
import { getClub } from '../../services/firebase/clubs';

/**
 * LocationMap - Displays club location with map
 *
 * Features:
 * - Shows address with copy button
 * - Embedded map (static image for now, can upgrade to Leaflet)
 * - "Get Directions" link to Google Maps
 *
 * @version 06.19
 */

interface LocationMapProps {
  clubId: string;
  className?: string;
}

export const LocationMap: React.FC<LocationMapProps> = ({
  clubId,
  className = '',
}) => {
  const [club, setClub] = useState<Club | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

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
        <div className="h-4 bg-gray-700 rounded w-1/4 mb-2"></div>
        <div className="h-32 bg-gray-700 rounded"></div>
      </div>
    );
  }

  // Check if we have location data
  const address = (club as any)?.address;
  const city = (club as any)?.city;
  const region = club?.region;
  const country = club?.country;
  const coordinates = (club as any)?.coordinates;

  // Build full address string
  const addressParts = [address, city, region, country].filter(Boolean);
  const fullAddress = addressParts.join(', ');

  if (!fullAddress && !coordinates) {
    return null;
  }

  // Google Maps URLs
  const mapsSearchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress || `${coordinates?.lat},${coordinates?.lng}`)}`;
  const mapsDirectionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddress || `${coordinates?.lat},${coordinates?.lng}`)}`;

  // Static map image URL (using OpenStreetMap tiles via placeholder)
  const mapImageUrl = coordinates
    ? `https://maps.googleapis.com/maps/api/staticmap?center=${coordinates.lat},${coordinates.lng}&zoom=15&size=400x200&markers=color:green%7C${coordinates.lat},${coordinates.lng}&key=YOUR_API_KEY`
    : null;

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(fullAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className={`bg-gray-800/50 rounded-xl overflow-hidden border border-gray-700/50 ${className}`}>
      {/* Map Placeholder */}
      <div className="relative h-32 bg-gray-700">
        {coordinates ? (
          <a
            href={mapsSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full h-full"
          >
            {/* Simple map placeholder with coordinates */}
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-800">
              <div className="text-center">
                <div className="text-3xl mb-1">📍</div>
                <div className="text-xs text-gray-400">
                  {coordinates.lat.toFixed(4)}, {coordinates.lng.toFixed(4)}
                </div>
                <div className="text-xs text-lime-400 mt-1">Click to view map</div>
              </div>
            </div>
          </a>
        ) : (
          <a
            href={mapsSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full h-full"
          >
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-800">
              <div className="text-center">
                <div className="text-3xl mb-1">🗺️</div>
                <div className="text-xs text-lime-400">Click to view on map</div>
              </div>
            </div>
          </a>
        )}
      </div>

      {/* Address & Actions */}
      <div className="p-4">
        {fullAddress && (
          <div className="flex items-start gap-3 mb-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white">{fullAddress}</p>
            </div>
            <button
              onClick={handleCopyAddress}
              className="flex-shrink-0 p-2 text-gray-400 hover:text-white transition-colors"
              title="Copy address"
            >
              {copied ? (
                <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <a
            href={mapsDirectionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-lime-600 hover:bg-lime-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            Get Directions
          </a>
          <a
            href={mapsSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            View Map
          </a>
        </div>
      </div>
    </div>
  );
};

export default LocationMap;
