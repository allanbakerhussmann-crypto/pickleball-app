import React, { useEffect, useRef, useState } from 'react';
import { AddressSearch } from './AddressSearch';

// Declare Leaflet as global (loaded via script tag)
declare const L: any;

interface LocationPickerProps {
  address: string;
  lat: number | null;
  lng: number | null;
  onLocationChange: (address: string, lat: number, lng: number) => void;
}

export const LocationPicker: React.FC<LocationPickerProps> = ({
  address,
  lat,
  lng,
  onLocationChange
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [showMap, setShowMap] = useState(false);

  // Default to Christchurch, NZ if no location
  const defaultLat = -43.5321;
  const defaultLng = 172.6362;

  // Initialize map
  useEffect(() => {
    if (!showMap || !mapRef.current || mapInstanceRef.current) return;

    // Check if Leaflet is loaded
    if (typeof L === 'undefined') {
      console.error('Leaflet not loaded');
      return;
    }

    const initialLat = lat || defaultLat;
    const initialLng = lng || defaultLng;

    // Create map
    const map = L.map(mapRef.current).setView([initialLat, initialLng], lat ? 15 : 12);
    mapInstanceRef.current = map;

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Fix for map only showing partial tiles when container was hidden
    // Wait for the container to be fully rendered, then invalidate size
    setTimeout(() => {
      map.invalidateSize();
    }, 100);

    // Add marker if we have coordinates
    if (lat && lng) {
      markerRef.current = L.marker([lat, lng], {
        draggable: true
      }).addTo(map);

      // Handle marker drag
      markerRef.current.on('dragend', async (e: any) => {
        const position = e.target.getLatLng();
        await reverseGeocode(position.lat, position.lng);
      });
    }

    // Handle map click to place/move marker
    map.on('click', async (e: any) => {
      const { lat: clickLat, lng: clickLng } = e.latlng;
      
      if (markerRef.current) {
        markerRef.current.setLatLng([clickLat, clickLng]);
      } else {
        markerRef.current = L.marker([clickLat, clickLng], {
          draggable: true
        }).addTo(map);

        markerRef.current.on('dragend', async (e: any) => {
          const position = e.target.getLatLng();
          await reverseGeocode(position.lat, position.lng);
        });
      }

      await reverseGeocode(clickLat, clickLng);
    });

    // Handle window resize
    const handleResize = () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
    };
  }, [showMap]);

  // Update marker when coordinates change from address search
  useEffect(() => {
    if (!mapInstanceRef.current || !lat || !lng) return;

    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      markerRef.current = L.marker([lat, lng], {
        draggable: true
      }).addTo(mapInstanceRef.current);

      markerRef.current.on('dragend', async (e: any) => {
        const position = e.target.getLatLng();
        await reverseGeocode(position.lat, position.lng);
      });
    }

    mapInstanceRef.current.setView([lat, lng], 15);
  }, [lat, lng]);

  // Reverse geocode: get address from coordinates
  const reverseGeocode = async (latitude: number, longitude: number) => {
    try {
      const url = 'https://nominatim.openstreetmap.org/reverse?' +
        'format=json' +
        '&lat=' + latitude +
        '&lon=' + longitude;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'PickleballDirector/1.0'
        }
      });
      
      const data = await response.json();
      const displayName = data.display_name || 'Selected location';
      onLocationChange(displayName, latitude, longitude);
    } catch (error) {
      console.error('Reverse geocode failed:', error);
      onLocationChange('Selected location', latitude, longitude);
    }
  };

  const handleAddressSelect = (newAddress: string, newLat: number, newLng: number) => {
    onLocationChange(newAddress, newLat, newLng);
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-1">
          Location *
        </label>
        <AddressSearch
          value={address}
          onChange={handleAddressSelect}
          placeholder="Search for venue or address..."
        />
      </div>

      <button
        type="button"
        onClick={() => setShowMap(!showMap)}
        className="text-sm text-green-400 hover:text-green-300 flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
        {showMap ? 'Hide map' : 'Or pick on map'}
      </button>

      {showMap && (
        <div className="relative">
          <div 
            ref={mapRef} 
            className="h-64 rounded-lg border border-gray-700 overflow-hidden"
            style={{ background: '#1f2937' }}
          />
          <p className="text-xs text-gray-500 mt-2">
            Click on the map to set location, or drag the marker to adjust
          </p>
        </div>
      )}

      {lat && lng && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>Location set: {lat.toFixed(4)}, {lng.toFixed(4)}</span>
        </div>
      )}
    </div>
  );
};