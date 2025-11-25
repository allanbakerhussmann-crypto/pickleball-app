
import React from 'react';

export const PickleballIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <path d="M14.06 9.94a6.5 6.5 0 1 0 0 9.18 6.5 6.5 0 0 0 0-9.18ZM13 15.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z" />
    <path d="M15.48 8.52a6.5 6.5 0 0 0-9.18 0l-1.07-1.06a8 8 0 0 1 11.32 0l-1.07 1.06Z" />
    <circle cx="17.5" cy="17.5" r="1.5" />
    <circle cx="17.5" cy="12.5" r="1.5" />
    <circle cx="12.5" cy="17.5" r="1.5" />
  </svg>
);
