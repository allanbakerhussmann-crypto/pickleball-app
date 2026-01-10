/**
 * Short Stubby Vertical Slider V07.33
 *
 * Vertical scroll but SHORT and WIDE - not thin and tall.
 * Shows 3 numbers at a time, chunky buttons.
 *
 * FILE LOCATION: components/shared/VerticalScorePicker.tsx
 * VERSION: V07.33
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';

// ============================================
// TYPES
// ============================================

interface VerticalScorePickerProps {
  value: number;
  onChange: (value: number) => void;
  onClose: () => void;
  maxScore?: number;
  anchorRect?: DOMRect | null;
}

// ============================================
// CONSTANTS
// ============================================

const ITEM_HEIGHT = 56;
const VISIBLE_ITEMS = 3;
const PICKER_WIDTH = 120;

// ============================================
// COMPONENT
// ============================================

export const VerticalScorePicker: React.FC<VerticalScorePickerProps> = ({
  value,
  onChange,
  onClose,
  maxScore = 15,
  anchorRect,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [currentValue, setCurrentValue] = useState(value);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scores = Array.from({ length: Math.min(maxScore + 1, 16) }, (_, i) => i);

  useEffect(() => {
    if (anchorRect) {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const pickerHeight = ITEM_HEIGHT * VISIBLE_ITEMS + 48; // scroll area + button

      // Position centered OVER the input
      let left = anchorRect.left + (anchorRect.width / 2) - (PICKER_WIDTH / 2);
      let top = anchorRect.top + (anchorRect.height / 2) - (pickerHeight / 2);

      // Keep in viewport
      if (left < 12) left = 12;
      if (left + PICKER_WIDTH > viewportWidth - 12) {
        left = viewportWidth - PICKER_WIDTH - 12;
      }
      if (top < 12) top = 12;
      if (top + pickerHeight > viewportHeight - 12) {
        top = viewportHeight - pickerHeight - 12;
      }

      setPosition({ top, left });
    }

    requestAnimationFrame(() => setIsVisible(true));

    // Scroll to current value
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = value * ITEM_HEIGHT;
      }
    }, 50);
  }, [anchorRect, value]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const scrollTop = scrollRef.current.scrollTop;
    const newValue = Math.round(scrollTop / ITEM_HEIGHT);
    setCurrentValue(Math.max(0, Math.min(maxScore, newValue)));
  }, [maxScore]);

  const handleScrollEnd = useCallback(() => {
    if (!scrollRef.current) return;
    const newValue = Math.round(scrollRef.current.scrollTop / ITEM_HEIGHT);
    scrollRef.current.scrollTo({
      top: newValue * ITEM_HEIGHT,
      behavior: 'smooth'
    });
  }, []);

  const handleSelect = (score: number) => {
    setCurrentValue(score);
    onChange(score);
    setIsVisible(false);
    setTimeout(onClose, 150);
  };

  const handleConfirm = () => {
    onChange(currentValue);
    setIsVisible(false);
    setTimeout(onClose, 150);
  };

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 150);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[100] transition-opacity duration-150 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ background: 'rgba(0,0,0,0.5)' }}
        onClick={handleClose}
      />

      {/* Picker */}
      <div
        className={`fixed z-[101] transition-all duration-200 ${
          isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
        style={{
          top: position.top,
          left: position.left,
          width: PICKER_WIDTH,
        }}
      >
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, #1f2937 0%, #111827 100%)',
            boxShadow: '0 15px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
        >
          {/* Selection highlight bar */}
          <div
            className="absolute left-2 right-2 rounded-xl pointer-events-none z-10"
            style={{
              top: ITEM_HEIGHT,
              height: ITEM_HEIGHT,
              background: 'linear-gradient(180deg, rgba(163,230,53,0.15) 0%, rgba(163,230,53,0.08) 100%)',
              border: '2px solid rgba(163,230,53,0.4)',
              boxShadow: '0 0 20px rgba(163,230,53,0.15)',
            }}
          />

          {/* Scroll area */}
          <div
            ref={scrollRef}
            className="relative overflow-y-auto"
            style={{
              height: ITEM_HEIGHT * VISIBLE_ITEMS,
              scrollSnapType: 'y mandatory',
            }}
            onScroll={handleScroll}
            onTouchEnd={handleScrollEnd}
            onMouseUp={handleScrollEnd}
          >
            {/* Top padding */}
            <div style={{ height: ITEM_HEIGHT }} />

            {scores.map((score) => {
              const isCenter = score === currentValue;
              return (
                <div
                  key={score}
                  onClick={() => handleSelect(score)}
                  className="flex items-center justify-center cursor-pointer transition-all duration-150"
                  style={{
                    height: ITEM_HEIGHT,
                    scrollSnapAlign: 'center',
                  }}
                >
                  <span
                    className="font-bold transition-all duration-150"
                    style={{
                      fontSize: isCenter ? '2rem' : '1.25rem',
                      color: isCenter ? '#a3e635' : '#6b7280',
                      textShadow: isCenter ? '0 0 20px rgba(163,230,53,0.5)' : 'none',
                    }}
                  >
                    {score}
                  </span>
                </div>
              );
            })}

            {/* Bottom padding */}
            <div style={{ height: ITEM_HEIGHT }} />
          </div>

          {/* Top/bottom fades */}
          <div
            className="absolute top-0 left-0 right-0 h-10 pointer-events-none"
            style={{ background: 'linear-gradient(180deg, #1f2937 0%, transparent 100%)' }}
          />
          <div
            className="absolute bottom-12 left-0 right-0 h-10 pointer-events-none"
            style={{ background: 'linear-gradient(0deg, #1f2937 0%, transparent 100%)' }}
          />

          {/* Confirm button */}
          <button
            onClick={handleConfirm}
            className="w-full py-3 font-bold text-gray-900 transition-all active:scale-95"
            style={{
              background: 'linear-gradient(180deg, #a3e635 0%, #84cc16 100%)',
            }}
          >
            {currentValue}
          </button>
        </div>
      </div>

      <style>{`
        div::-webkit-scrollbar { display: none; }
        div { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </>
  );
};

export default VerticalScorePicker;
