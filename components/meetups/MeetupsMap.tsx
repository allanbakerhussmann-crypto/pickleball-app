import React, { useEffect, useRef, useState } from 'react';
import type { Meetup } from '../../types';

// Declare Leaflet as global (loaded via script tag)
declare const L: any;

interface MeetupsMapProps {
  meetups: Meetup[];
  onSelectMeetup: (id: string) => void;
}

export const MeetupsMap: React.FC<MeetupsMapProps> = ({ meetups, onSelectMeetup }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);

  // Filter meetups with valid coordinates
  const meetupsWithLocation = meetups.filter(m => m.location && m.location.lat && m.location.lng);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Check if Leaflet is loaded
    if (typeof L === 'undefined') {
      console.error('Leaflet not loaded');
      return;
    }

    // Don't reinitialize if map already exists
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    // Default center: Christchurch, NZ
    let centerLat = -43.5321;
    let centerLng = 172.6362;
    let zoom = 11;

    // If we have meetups, center on them
    if (meetupsWithLocation.length > 0) {
      const lats = meetupsWithLocation.map(m => m.location!.lat);
      const lngs = meetupsWithLocation.map(m => m.location!.lng);
      centerLat = lats.reduce((a, b) => a + b, 0) / lats.length;
      centerLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;
      
      if (meetupsWithLocation.length === 1) {
        zoom = 14;
      }
    }

    // Create map with explicit size invalidation
    const map = L.map(mapContainerRef.current, {
      center: [centerLat, centerLng],
      zoom: zoom,
      zoomControl: true,
      attributionControl: true
    });
    
    mapInstanceRef.current = map;

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(map);

    // Force map to recalculate its size after a short delay
    setTimeout(() => {
      map.invalidateSize();
      setMapReady(true);
    }, 100);

    // Also invalidate on window resize
    const handleResize = () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    };
    window.addEventListener('resize', handleResize);

    // Add markers for each meetup
    meetupsWithLocation.forEach(meetup => {
      if (!meetup.location) return;

      const date = new Date(meetup.when);
      const dateStr = date.toLocaleDateString(undefined, { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      });
      const timeStr = date.toLocaleTimeString(undefined, { 
        hour: '2-digit', 
        minute: '2-digit' 
      });

      const isCancelled = meetup.status === 'cancelled';
      const isPast = meetup.when < Date.now();

      // Create custom icon
      const iconHtml = document.createElement('div');
      iconHtml.style.cssText = 'background: #22c55e; width: 32px; height: 32px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;';
      iconHtml.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>';

      const customIcon = L.divIcon({
        className: 'custom-meetup-marker',
        html: '<div style="background: #22c55e; width: 32px; height: 32px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.4); cursor: pointer;"></div>',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16]
      });

      // Create popup content
      const popupContent = '<div style="min-width: 200px; padding: 8px;">' +
        '<h3 style="font-weight: bold; font-size: 16px; margin: 0 0 8px 0; color: ' + (isCancelled ? '#ef4444' : '#fff') + ';' + (isCancelled ? ' text-decoration: line-through;' : '') + '">' +
          meetup.title +
        '</h3>' +
        (isCancelled ? '<div style="color: #ef4444; font-size: 12px; margin-bottom: 8px; font-weight: bold;">CANCELLED</div>' : '') +
        (isPast && !isCancelled ? '<div style="color: #9ca3af; font-size: 12px; margin-bottom: 8px;">ENDED</div>' : '') +
        '<div style="font-size: 13px; color: #d1d5db; margin-bottom: 4px;">' +
          '<span style="color: #22c55e;">📅</span> ' + dateStr + ' at ' + timeStr +
        '</div>' +
        '<div style="font-size: 13px; color: #d1d5db; margin-bottom: 12px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' +
          '<span style="color: #22c55e;">📍</span> ' + meetup.locationName +
        '</div>' +
        '<button id="view-meetup-' + meetup.id + '" style="background: #22c55e; color: #000; font-weight: bold; padding: 8px 16px; border-radius: 8px; font-size: 13px; cursor: pointer; width: 100%; border: none;">' +
          'View Details' +
        '</button>' +
      '</div>';

      const marker = L.marker([meetup.location.lat, meetup.location.lng], { 
        icon: customIcon 
      }).addTo(map);

      marker.bindPopup(popupContent, {
        className: 'dark-popup',
        closeButton: true,
        maxWidth: 280
      });

      // Add click handler after popup opens
      marker.on('popupopen', () => {
        setTimeout(() => {
          const btn = document.getElementById('view-meetup-' + meetup.id);
          if (btn) {
            btn.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelectMeetup(meetup.id);
            };
          }
        }, 10);
      });
    });

    // Fit bounds if multiple meetups
    if (meetupsWithLocation.length > 1) {
      const bounds = L.latLngBounds(
        meetupsWithLocation.map(m => [m.location!.lat, m.location!.lng])
      );
      map.fitBounds(bounds, { padding: [50, 50] });
    }

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [meetups]);

  // Additional size invalidation when component updates
  useEffect(() => {
    if (mapInstanceRef.current && mapReady) {
      setTimeout(() => {
        mapInstanceRef.current.invalidateSize();
      }, 200);
    }
  }, [mapReady]);

  return (
    <div className="relative rounded-xl overflow-hidden border border-gray-700">
      <div 
        ref={mapContainerRef} 
        style={{ 
          height: '400px', 
          width: '100%',
          background: '#374151'
        }}
      />
      {meetupsWithLocation.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800/90">
          <div className="text-center text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p>No meetups with locations yet</p>
          </div>
        </div>
      )}
      <div className="absolute bottom-3 left-3 bg-gray-900/90 px-3 py-1.5 rounded-full text-xs text-gray-400">
        {meetupsWithLocation.length} meetup{meetupsWithLocation.length !== 1 ? 's' : ''} on map
      </div>
    </div>
  );
};