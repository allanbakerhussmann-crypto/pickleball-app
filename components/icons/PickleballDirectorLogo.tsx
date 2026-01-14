
import React from 'react';

export const PickleballDirectorLogo: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 270 135"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    fill="none"
    preserveAspectRatio="xMidYMid meet"
  >
    <title>PickleballDirector Logo</title>
    
    {/* Handle (Bottom layer) */}
    <rect x="40" y="80" width="20" height="40" rx="4" fill="#16a34a" />

    {/* Paddle Body */}
    <rect x="10" y="10" width="80" height="80" rx="24" fill="#16a34a" />
    
    {/* Smile */}
    <path d="M 35 55 Q 50 70 65 55" stroke="#064e3b" strokeWidth="5" strokeLinecap="round" />

    {/* Yellow Ball - Overlapping Paddle */}
    <circle cx="85" cy="80" r="22" fill="#facc15" stroke="#111827" strokeWidth="4" />
    
    {/* Ball Holes */}
    <circle cx="77" cy="74" r="2.5" fill="#111827" />
    <circle cx="93" cy="74" r="2.5" fill="#111827" />
    <circle cx="77" cy="86" r="2.5" fill="#111827" />
    <circle cx="93" cy="86" r="2.5" fill="#111827" />

    {/* Text "PD" - Orange, Heavy Font */}
    <text
        x="112"
        y="98"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="900"
        fontSize="90"
        fill="#f97316"
        style={{ textShadow: '2px 2px 0px rgba(0,0,0,0.2)' }}
    >
        PD
    </text>
  </svg>
);
