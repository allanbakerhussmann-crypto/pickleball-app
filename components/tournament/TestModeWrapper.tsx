/**
 * TestModeWrapper - Visual wrapper for Admin Test Mode
 *
 * Wraps tournament content with a yellow border and persistent banner
 * when test mode is active, providing clear visual distinction.
 *
 * Features:
 * - Yellow border around entire content
 * - Persistent top banner with test mode indicator
 * - Exit button always visible
 * - Subtle yellow tint on content
 *
 * @version 06.03
 * @file components/tournament/TestModeWrapper.tsx
 */

import React from 'react';

interface TestModeWrapperProps {
  isTestMode: boolean;
  onExitTestMode: () => void;
  children: React.ReactNode;
}

export const TestModeWrapper: React.FC<TestModeWrapperProps> = ({
  isTestMode,
  onExitTestMode,
  children,
}) => {
  if (!isTestMode) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      {/* Yellow border around entire content */}
      <div className="border-4 border-yellow-500 rounded-lg overflow-hidden">
        {/* Persistent Test Mode Banner */}
        <div className="bg-yellow-600 text-black px-4 py-2 flex items-center justify-between sticky top-0 z-50">
          <div className="flex items-center gap-2">
            <span className="text-xl">🧪</span>
            <span className="font-bold">TEST MODE ACTIVE</span>
            <span className="text-sm opacity-75 hidden sm:inline">
              • Changes affect real data but are flagged for cleanup
            </span>
          </div>
          <button
            onClick={onExitTestMode}
            className="bg-black text-yellow-500 px-3 py-1 rounded text-sm font-medium hover:bg-gray-900 transition-colors"
          >
            Exit Test Mode
          </button>
        </div>

        {/* Content with subtle yellow tint */}
        <div className="bg-yellow-900/5 min-h-[200px]">
          {children}
        </div>
      </div>
    </div>
  );
};

export default TestModeWrapper;
