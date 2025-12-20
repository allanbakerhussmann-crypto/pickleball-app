/**
 * DuprLoginButton Component
 * 
 * "Login with DUPR" button for SSO authentication.
 * 
 * IMPORTANT: This is the ONLY way users can link their DUPR account.
 * Manual DUPR ID entry is NOT allowed per DUPR requirements.
 * 
 * FILE LOCATION: components/dupr/DuprLoginButton.tsx
 * VERSION: V05.17
 */

import React, { useState } from 'react';
import { generateDuprSSOUrl, generatePremiumLoginUrl } from '../../services/dupr';

// ============================================
// TYPES
// ============================================

interface DuprLoginButtonProps {
  /** What happens after successful DUPR login */
  returnUrl?: string;
  
  /** Button variant */
  variant?: 'primary' | 'secondary' | 'outline';
  
  /** Button size */
  size?: 'sm' | 'md' | 'lg';
  
  /** Custom button text */
  text?: string;
  
  /** Show DUPR logo */
  showLogo?: boolean;
  
  /** Required entitlement (shows premium modal if user doesn't have it) */
  requiredEntitlement?: 'PREMIUM_L1' | 'VERIFIED_L1';
  
  /** Disabled state */
  disabled?: boolean;
  
  /** Full width */
  fullWidth?: boolean;
  
  /** Custom class */
  className?: string;
}

// ============================================
// COMPONENT
// ============================================

export const DuprLoginButton: React.FC<DuprLoginButtonProps> = ({
  returnUrl,
  variant = 'primary',
  size = 'md',
  text,
  showLogo = true,
  requiredEntitlement,
  disabled = false,
  fullWidth = false,
  className = '',
}) => {
  const [loading, setLoading] = useState(false);

  // Default return URL to current page
  const finalReturnUrl = returnUrl || window.location.href;

  // Determine button text
  const buttonText = text || (
    requiredEntitlement === 'PREMIUM_L1' 
      ? 'Get DUPR+'
      : requiredEntitlement === 'VERIFIED_L1'
        ? 'Get DUPR Verified'
        : 'Login with DUPR'
  );

  // Handle click
  const handleClick = () => {
    setLoading(true);
    
    try {
      let url: string;
      
      if (requiredEntitlement) {
        // Premium/Verified login
        url = generatePremiumLoginUrl(finalReturnUrl, requiredEntitlement);
      } else {
        // Standard SSO login
        const { url: ssoUrl, state } = generateDuprSSOUrl(finalReturnUrl);
        url = ssoUrl;
        
        // Store state in sessionStorage for callback validation
        sessionStorage.setItem('dupr_sso_state', JSON.stringify(state));
      }
      
      // Redirect to DUPR
      window.location.href = url;
    } catch (error) {
      console.error('DUPR SSO error:', error);
      setLoading(false);
    }
  };

  // Style classes based on variant
  const variantClasses = {
    primary: 'bg-[#00B4D8] hover:bg-[#0096B4] text-white',
    secondary: 'bg-gray-700 hover:bg-gray-600 text-white',
    outline: 'bg-transparent border-2 border-[#00B4D8] text-[#00B4D8] hover:bg-[#00B4D8] hover:text-white',
  };

  // Size classes
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center gap-2 
        font-semibold rounded-lg transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
    >
      {loading ? (
        <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        <>
          {showLogo && <DuprLogo className="w-5 h-5" />}
          {buttonText}
        </>
      )}
    </button>
  );
};

// ============================================
// DUPR LOGO SVG
// ============================================

const DuprLogo: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg 
    className={className} 
    viewBox="0 0 24 24" 
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Simplified DUPR-style logo - pickleball paddle shape */}
    <circle cx="12" cy="10" r="8" fill="currentColor" opacity="0.9" />
    <rect x="10" y="16" width="4" height="6" rx="1" fill="currentColor" />
    <circle cx="12" cy="10" r="3" fill="white" opacity="0.3" />
  </svg>
);

// ============================================
// DUPR RATING BADGE
// ============================================

interface DuprRatingBadgeProps {
  rating?: number;
  type?: 'singles' | 'doubles';
  size?: 'sm' | 'md' | 'lg';
  showType?: boolean;
  isVerified?: boolean;
  isPremium?: boolean;
}

export const DuprRatingBadge: React.FC<DuprRatingBadgeProps> = ({
  rating,
  type = 'doubles',
  size = 'md',
  showType = false,
  isVerified = false,
  isPremium = false,
}) => {
  // Format rating
  const displayRating = rating ? rating.toFixed(2) : 'NR';
  
  // Get color based on rating
  const getRatingColor = () => {
    if (!rating) return 'bg-gray-600';
    if (rating >= 6.0) return 'bg-purple-600';
    if (rating >= 5.0) return 'bg-red-600';
    if (rating >= 4.0) return 'bg-orange-500';
    if (rating >= 3.0) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  // Size classes
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  return (
    <div className="inline-flex items-center gap-1">
      <span className={`${getRatingColor()} ${sizeClasses[size]} rounded font-bold text-white`}>
        {displayRating}
      </span>
      
      {showType && (
        <span className="text-xs text-gray-400 uppercase">
          {type === 'singles' ? 'S' : 'D'}
        </span>
      )}
      
      {isVerified && (
        <span className="text-blue-400" title="DUPR Verified">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        </span>
      )}
      
      {isPremium && (
        <span className="text-yellow-400" title="DUPR+">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </span>
      )}
    </div>
  );
};

// ============================================
// DUPR CONNECT PROMPT
// ============================================

interface DuprConnectPromptProps {
  /** Message to show */
  message?: string;
  /** Show when DUPR is required but not connected */
  returnUrl?: string;
  /** Required entitlement */
  requiredEntitlement?: 'PREMIUM_L1' | 'VERIFIED_L1';
}

export const DuprConnectPrompt: React.FC<DuprConnectPromptProps> = ({
  message = 'Connect your DUPR account to participate in rated events.',
  returnUrl,
  requiredEntitlement,
}) => {
  return (
    <div className="bg-[#00B4D8]/10 border border-[#00B4D8]/30 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-[#00B4D8]/20 flex items-center justify-center flex-shrink-0">
          <DuprLogo className="w-6 h-6 text-[#00B4D8]" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-white mb-1">
            {requiredEntitlement === 'PREMIUM_L1' 
              ? 'DUPR+ Required'
              : requiredEntitlement === 'VERIFIED_L1'
                ? 'DUPR Verified Required'
                : 'DUPR Account Required'}
          </h4>
          <p className="text-sm text-gray-400 mb-3">{message}</p>
          <DuprLoginButton 
            returnUrl={returnUrl}
            requiredEntitlement={requiredEntitlement}
            size="sm"
          />
        </div>
      </div>
      
      {/* How to create account */}
      <div className="mt-3 pt-3 border-t border-gray-700">
        <p className="text-xs text-gray-500">
          Don't have a DUPR account?{' '}
          <a 
            href="https://mydupr.com/signup" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-[#00B4D8] hover:underline"
          >
            Create one for free
          </a>
        </p>
      </div>
    </div>
  );
};

export default DuprLoginButton;