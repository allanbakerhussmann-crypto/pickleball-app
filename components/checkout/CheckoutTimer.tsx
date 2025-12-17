/**
 * CheckoutTimer Component
 * 
 * Displays countdown timer for checkout reservation.
 * Shows warning when time is running low.
 * 
 * FILE LOCATION: components/checkout/CheckoutTimer.tsx
 */

import React from 'react';

// ============================================
// TYPES
// ============================================

export interface CheckoutTimerProps {
  timeRemaining: number;  // Seconds
  formattedTime: string;  // "4:32"
  isExpired: boolean;
  onExpired?: () => void;
  className?: string;
}

// ============================================
// COMPONENT
// ============================================

export const CheckoutTimer: React.FC<CheckoutTimerProps> = ({
  timeRemaining,
  formattedTime,
  isExpired,
  className = '',
}) => {
  // Determine urgency level
  const isUrgent = timeRemaining <= 60 && timeRemaining > 0;  // Last minute
  const isWarning = timeRemaining <= 120 && timeRemaining > 60;  // 1-2 minutes
  
  if (isExpired) {
    return (
      <div className={`checkout-timer checkout-timer--expired ${className}`}>
        <div className="flex items-center gap-2 bg-red-900/50 border border-red-700 text-red-400 px-4 py-3 rounded-lg">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="font-semibold">Reservation Expired</p>
            <p className="text-sm text-red-300">Please start a new booking</p>
          </div>
        </div>
      </div>
    );
  }
  
  // No timer needed
  if (timeRemaining === 0) {
    return null;
  }
  
  return (
    <div className={`checkout-timer ${className}`}>
      <div className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
        isUrgent 
          ? 'bg-red-900/50 border border-red-700' 
          : isWarning 
            ? 'bg-yellow-900/50 border border-yellow-700' 
            : 'bg-blue-900/30 border border-blue-700'
      }`}>
        {/* Timer Icon */}
        <div className={`relative ${isUrgent ? 'animate-pulse' : ''}`}>
          <svg 
            className={`w-6 h-6 ${
              isUrgent ? 'text-red-400' : isWarning ? 'text-yellow-400' : 'text-blue-400'
            }`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        
        {/* Timer Display */}
        <div className="flex-1">
          <p className={`text-sm ${
            isUrgent ? 'text-red-300' : isWarning ? 'text-yellow-300' : 'text-blue-300'
          }`}>
            Complete your booking in
          </p>
          <p className={`text-2xl font-bold font-mono ${
            isUrgent ? 'text-red-400' : isWarning ? 'text-yellow-400' : 'text-blue-400'
          }`}>
            {formattedTime}
          </p>
        </div>
        
        {/* Urgency Message */}
        {isUrgent && (
          <div className="text-red-400 text-sm font-medium animate-pulse">
            Hurry!
          </div>
        )}
      </div>
      
      {/* Progress Bar */}
      <div className="mt-2 h-1 bg-gray-700 rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-1000 ${
            isUrgent 
              ? 'bg-red-500' 
              : isWarning 
                ? 'bg-yellow-500' 
                : 'bg-blue-500'
          }`}
          style={{ 
            width: `${Math.min(100, (timeRemaining / 300) * 100)}%`,
            transition: 'width 1s linear',
          }}
        />
      </div>
    </div>
  );
};

export default CheckoutTimer;