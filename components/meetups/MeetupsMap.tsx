import React, { useEffect, useRef } from 'react';
import type { Meetup } from '../../types';

// Declare Leaflet as global (loaded via script tag)
declare const L: any;

interface MeetupsMapProps {
  meetups: Meetup[];
  onSelectMeetup: (id: string) => void;
}

export const MeetupsMap: React.FC<MeetupsMapProps> = ({ meetups, onSelectMeetup }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    // Check if Leaflet is loaded
    if (typeof L === 'undefined') {
      console.error('Leaflet not loaded');
      return;
    }

    // Filter meetups with valid coordinates
    const meetupsWithLocation = meetups.filter(m => m.location && m.location.lat && m.location.lng);

    // Default center: Christchurch, NZ
    let centerLat = -43.5321;
    let centerLng = 172.6362;
    let zoom = 10;

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

    // Create map
    const map = L.map(mapRef.current).setView([centerLat, centerLng], zoom);
    mapInstanceRef.current = map;

    // Add OpenStreetMap tiles with dark theme
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map);

    // Custom green marker icon
    const greenIcon = L.divIcon({
      className: 'custom-marker',
      html: '<div style="background:#22c55e; width:24px; height:24px; border-radius:50%; border:3px solid white; box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -12]
    });

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

      const popupContent = document.createElement('div');
      popupContent.innerHTML = 
        '<div style="min-width:180px;">' +
          '<h3 style="font-weight:bold; font-size:14px; margin-bottom:6px; color:' + (isCancelled ? '#ef4444' : '#fff') + '; ' + (isCancelled ? 'text-decoration:line-through;' : '') + '">' +
            meetup.title +
          '</h3>' +
          (isCancelled ? '<div style="color:#ef4444; font-size:11px; margin-bottom:6px;">CANCELLED</div>' : '') +
          (isPast && !isCancelled ? '<div style="color:#9ca3af; font-size:11px; margin-bottom:6px;">ENDED</div>' : '') +
          '<div style="font-size:12px; color:#9ca3af; margin-bottom:4px;">' +
            '<span style="color:#22c55e;">📅</span> ' + dateStr + ' at ' + timeStr +
          '</div>' +
          '<div style="font-size:12px; color:#9ca3af; margin-bottom:8px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:200px;">' +
            '<span style="color:#22c55e;">📍</span> ' + meetup.locationName +
          '</div>' +
          '<button id="view-meetup-' + meetup.id + '" style="background:#22c55e; color:#000; font-weight:bold; padding:6px 12px; border-radius:6px; font-size:12px; cursor:pointer; width:100%; border:none;">' +
            'View Details' +
          '</button>' +
        '</div>';

      const marker = L.marker([meetup.location.lat, meetup.location.lng], { 
        icon: greenIcon 
      }).addTo(map);

      const popup = L.popup({
        closeButton: true,
        className: 'dark-popup'
      }).setContent(popupContent);

      marker.bindPopup(popup);

      // Add click handler after popup opens
      marker.on('popupopen', () => {
        const btn = document.getElementById('view-meetup-' + meetup.id);
        if (btn) {
          btn.onclick = () => {
            onSelectMeetup(meetup.id);
          };
        }
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
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [meetups, onSelectMeetup]);

  const meetupsWithLocation = meetups.filter(m => m.location && m.location.lat && m.location.lng);

  return (
    <div className="relative">
      <div 
        ref={mapRef} 
        className="h-80 sm:h-96 rounded-xl border border-gray-700 overflow-hidden"
        style={{ background: '#1f2937' }}
      />
      {meetupsWithLocation.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800/80 rounded-xl">
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