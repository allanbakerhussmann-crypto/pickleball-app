/**
 * InfoTooltip Component
 *
 * A refined "?" icon that reveals contextual help on hover.
 * Designed for dark theme with smooth animations and subtle lime accents.
 *
 * FILE LOCATION: components/shared/InfoTooltip.tsx
 * VERSION: V07.58
 */

import React, { useState, useRef, useEffect } from 'react';

interface InfoTooltipProps {
  /** The help text to display */
  text: string;
  /** Optional position preference */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Optional custom class for the icon */
  className?: string;
  /** Icon size - defaults to 4 (w-4 h-4) */
  size?: 3 | 4 | 5;
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({
  text,
  position = 'top',
  className = '',
  size = 4,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState(position);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Handle animation timing
  useEffect(() => {
    if (isVisible) {
      setShouldRender(true);
    } else {
      const timer = setTimeout(() => setShouldRender(false), 150);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  // Adjust position if tooltip would go off screen
  useEffect(() => {
    if (isVisible && tooltipRef.current && buttonRef.current) {
      const tooltipRect = tooltipRef.current.getBoundingClientRect();

      if (position === 'top' && tooltipRect.top < 10) {
        setTooltipPosition('bottom');
      } else if (position === 'bottom' && tooltipRect.bottom > window.innerHeight - 10) {
        setTooltipPosition('top');
      } else if (position === 'left' && tooltipRect.left < 10) {
        setTooltipPosition('right');
      } else if (position === 'right' && tooltipRect.right > window.innerWidth - 10) {
        setTooltipPosition('left');
      } else {
        setTooltipPosition(position);
      }
    }
  }, [isVisible, position]);

  const sizeClass = {
    3: 'w-3.5 h-3.5',
    4: 'w-4 h-4',
    5: 'w-5 h-5',
  }[size];

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }[tooltipPosition];

  const arrowPositionClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 -mt-px',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 -mb-px',
    left: 'left-full top-1/2 -translate-y-1/2 -ml-px',
    right: 'right-full top-1/2 -translate-y-1/2 -mr-px',
  }[tooltipPosition];

  const arrowRotation = {
    top: 'rotate-0',
    bottom: 'rotate-180',
    left: 'rotate-90',
    right: '-rotate-90',
  }[tooltipPosition];

  return (
    <div className="relative inline-flex items-center">
      <button
        ref={buttonRef}
        type="button"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
        className={`
          group relative p-0.5 rounded-full
          text-gray-500 hover:text-lime-400
          focus:outline-none focus:ring-2 focus:ring-lime-500/30 focus:ring-offset-1 focus:ring-offset-gray-900
          transition-all duration-200 ease-out
          ${className}
        `}
        aria-label="More information"
      >
        <svg
          className={`${sizeClass} transition-transform duration-200 group-hover:scale-110`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="10" strokeWidth="1.5" className="opacity-60" />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M12 16v.01M12 13a2 2 0 10-2-2"
          />
        </svg>
      </button>

      {/* Tooltip with fade animation */}
      {shouldRender && (
        <div
          ref={tooltipRef}
          className={`
            absolute z-50 pointer-events-none
            ${positionClasses}
            transition-all duration-150 ease-out
            ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
          `}
          role="tooltip"
        >
          {/* Tooltip body */}
          <div className="
            relative
            bg-gray-800/95 backdrop-blur-sm
            text-gray-200 text-xs leading-relaxed
            rounded-lg py-2.5 px-3.5
            max-w-[220px]
            shadow-xl shadow-black/30
            border border-gray-700/80
            ring-1 ring-lime-500/10
          ">
            {text}
          </div>

          {/* Arrow - clean triangular pointer */}
          <div className={`absolute ${arrowPositionClasses}`}>
            <svg
              className={`w-3 h-2 ${arrowRotation}`}
              viewBox="0 0 12 8"
              fill="none"
            >
              <path
                d="M6 8L0 0H12L6 8Z"
                className="fill-gray-800/95"
              />
              <path
                d="M6 7L1 0H11L6 7Z"
                className="fill-gray-800/95"
              />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
};

export default InfoTooltip;
