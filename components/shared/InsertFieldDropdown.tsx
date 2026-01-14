/**
 * InsertFieldDropdown - Token Insertion Dropdown
 *
 * Provides a user-friendly dropdown for inserting template tokens
 * into message textareas. Displays tokens as readable labels.
 *
 * @file components/shared/InsertFieldDropdown.tsx
 * @version 07.50
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  TokenContext,
  TokenOptions,
  TokenGroup,
  getTokenGroups,
  getTokenColorClasses,
} from '../../services/comms/tokens';

// ============================================
// TYPES
// ============================================

interface InsertFieldDropdownProps {
  /** Context determines which tokens are available */
  context: TokenContext;
  /** Options like hasMatchContext */
  options?: TokenOptions;
  /** Called when user selects a token - receives display format e.g. "[Player Name]" */
  onInsert: (displayText: string) => void;
  /** Optional custom trigger button text */
  buttonText?: string;
  /** Optional disabled state */
  disabled?: boolean;
}

// ============================================
// ICONS
// ============================================

const TokenIcon: React.FC<{ icon?: string; className?: string }> = ({ icon, className = 'w-4 h-4' }) => {
  switch (icon) {
    case 'user':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      );
    case 'event':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case 'location':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case 'calendar':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'court':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      );
    case 'team':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      );
    case 'link':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      );
    default:
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
        </svg>
      );
  }
};

// ============================================
// MAIN COMPONENT
// ============================================

export const InsertFieldDropdown: React.FC<InsertFieldDropdownProps> = ({
  context,
  options,
  onInsert,
  buttonText = 'Insert field',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get token groups for current context
  const tokenGroups = getTokenGroups(context, options);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Handle token selection
  const handleSelect = (token: { label: string; token: string }) => {
    // Insert the display format [Label]
    onInsert(`[${token.label}]`);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors
          ${disabled
            ? 'bg-gray-800/30 text-gray-600 border-gray-700/30 cursor-not-allowed'
            : 'bg-gray-800/50 text-gray-300 border-gray-700/50 hover:bg-gray-700/50 hover:text-white hover:border-gray-600/50'
          }
        `}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        {buttonText}
        <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-gray-800 rounded-xl border border-gray-700/50 shadow-xl z-50 overflow-hidden">
          {tokenGroups.map((group: TokenGroup) => {
            const colors = getTokenColorClasses(group.color);

            return (
              <div key={group.group}>
                {/* Group Header */}
                <div className={`px-3 py-1.5 text-xs font-medium uppercase tracking-wider ${colors.text} ${colors.bg} border-b border-gray-700/30`}>
                  {group.group}
                </div>

                {/* Group Items */}
                <div className="py-1">
                  {group.items.map((item) => (
                    <button
                      key={item.token}
                      type="button"
                      onClick={() => handleSelect(item)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-700/50 transition-colors group"
                      title={item.description}
                    >
                      <span className={`${colors.text}`}>
                        <TokenIcon icon={item.icon} className="w-4 h-4" />
                      </span>
                      <span className="flex-1">
                        <span className="text-sm text-gray-200 group-hover:text-white">
                          {item.label}
                        </span>
                        {item.description && (
                          <span className="block text-xs text-gray-500 group-hover:text-gray-400">
                            {item.description}
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default InsertFieldDropdown;
