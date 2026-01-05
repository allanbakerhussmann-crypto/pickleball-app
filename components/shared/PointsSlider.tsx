/**
 * PointsSlider Component - V07.14
 *
 * A refined, sports-scoreboard inspired slider with +/- controls.
 * Features smooth animations, color-coded values, and touch-friendly design.
 *
 * @file components/shared/PointsSlider.tsx
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';

// ============================================
// TYPES
// ============================================

export interface PointsSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Show color coding based on value (green for positive, red for negative) */
  colorCoded?: boolean;
  /** Optional icon/emoji to show with label */
  icon?: string;
  /** Compact mode for inline use */
  compact?: boolean;
  /** Helper text below the slider */
  hint?: string;
}

// ============================================
// COMPONENT
// ============================================

export const PointsSlider: React.FC<PointsSliderProps> = ({
  label,
  value,
  onChange,
  min = -5,
  max = 10,
  step = 1,
  colorCoded = true,
  icon,
  compact = false,
  hint,
}) => {
  const [isPressed, setIsPressed] = useState<'minus' | 'plus' | null>(null);
  const [showPulse, setShowPulse] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const sliderRef = useRef<HTMLInputElement>(null);

  // Calculate the fill percentage for the slider track
  const fillPercentage = ((value - min) / (max - min)) * 100;

  // Get color based on value
  const getValueColor = () => {
    if (!colorCoded) return 'text-white';
    if (value > 0) return 'text-lime-400';
    if (value < 0) return 'text-red-400';
    return 'text-gray-400';
  };

  const getTrackColor = () => {
    if (!colorCoded) return 'bg-blue-500';
    if (value > 0) return 'bg-gradient-to-r from-lime-600 to-lime-400';
    if (value < 0) return 'bg-gradient-to-r from-red-600 to-red-400';
    return 'bg-gray-500';
  };

  const getGlowColor = () => {
    if (!colorCoded) return 'shadow-blue-500/30';
    if (value > 0) return 'shadow-lime-500/40';
    if (value < 0) return 'shadow-red-500/40';
    return 'shadow-gray-500/20';
  };

  // Trigger pulse animation on value change
  useEffect(() => {
    setShowPulse(true);
    const timer = setTimeout(() => setShowPulse(false), 200);
    return () => clearTimeout(timer);
  }, [value]);

  // Handle increment/decrement
  const increment = useCallback(() => {
    if (value < max) {
      onChange(Math.min(value + step, max));
    }
  }, [value, max, step, onChange]);

  const decrement = useCallback(() => {
    if (value > min) {
      onChange(Math.max(value - step, min));
    }
  }, [value, min, step, onChange]);

  // Hold-to-repeat functionality
  const startHold = (action: 'minus' | 'plus') => {
    setIsPressed(action);
    if (action === 'minus') decrement();
    else increment();

    // Start repeating after 400ms
    intervalRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        if (action === 'minus') decrement();
        else increment();
      }, 100);
    }, 400);
  };

  const stopHold = () => {
    setIsPressed(null);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        clearTimeout(intervalRef.current);
      }
    };
  }, []);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(Number(e.target.value));
  };

  return (
    <div className={`${compact ? 'space-y-2' : 'space-y-3'}`}>
      {/* Label */}
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
          {icon && <span className="text-base">{icon}</span>}
          {label}
        </label>
        {hint && <span className="text-xs text-gray-500">{hint}</span>}
      </div>

      {/* Slider Container */}
      <div className="flex items-center gap-3">
        {/* Minus Button */}
        <button
          type="button"
          onMouseDown={() => startHold('minus')}
          onMouseUp={stopHold}
          onMouseLeave={stopHold}
          onTouchStart={() => startHold('minus')}
          onTouchEnd={stopHold}
          disabled={value <= min}
          className={`
            relative w-10 h-10 rounded-xl font-bold text-xl
            flex items-center justify-center
            transition-all duration-150 ease-out
            select-none touch-manipulation
            ${value <= min
              ? 'bg-gray-800/50 text-gray-600 cursor-not-allowed'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white active:scale-95'
            }
            ${isPressed === 'minus' ? 'scale-95 bg-gray-700' : ''}
            border border-gray-700/50
          `}
          aria-label={`Decrease ${label}`}
        >
          <span className="mt-[-2px]">−</span>
        </button>

        {/* Slider Track */}
        <div className="flex-1 relative">
          {/* Value Display - Centered Above */}
          <div className="flex justify-center mb-2">
            <div
              className={`
                relative px-4 py-1.5 rounded-lg
                bg-gray-900/80 border border-gray-700/50
                font-mono font-bold text-2xl tabular-nums
                ${getValueColor()}
                transition-all duration-200
                ${showPulse ? `scale-110 shadow-lg ${getGlowColor()}` : 'scale-100'}
              `}
            >
              {value > 0 && '+'}
              {value}
            </div>
          </div>

          {/* Custom Slider Track */}
          <div className="relative h-3 bg-gray-800 rounded-full overflow-hidden border border-gray-700/30">
            {/* Fill */}
            <div
              className={`
                absolute inset-y-0 left-0 rounded-full
                transition-all duration-150 ease-out
                ${getTrackColor()}
              `}
              style={{ width: `${fillPercentage}%` }}
            />

            {/* Zero marker (if range includes negative values) */}
            {min < 0 && max > 0 && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-gray-600/80"
                style={{ left: `${((0 - min) / (max - min)) * 100}%` }}
              />
            )}
          </div>

          {/* Native Range Input (invisible but functional) */}
          <input
            ref={sliderRef}
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={handleSliderChange}
            className="
              absolute inset-0 w-full h-full opacity-0 cursor-pointer
              touch-manipulation
            "
            style={{ top: '50%', transform: 'translateY(-50%)', height: '44px' }}
            aria-label={label}
          />

          {/* Custom Thumb */}
          <div
            className={`
              absolute top-1/2 -translate-y-1/2 -translate-x-1/2
              w-5 h-5 rounded-full
              bg-white border-2 border-gray-300
              shadow-lg shadow-black/30
              transition-all duration-150 ease-out
              pointer-events-none
              ${showPulse ? 'scale-125' : 'scale-100'}
            `}
            style={{
              left: `${fillPercentage}%`,
              marginTop: '14px' // Offset to align with track
            }}
          />

          {/* Min/Max Labels */}
          <div className="flex justify-between mt-1.5 text-xs text-gray-500 font-mono">
            <span>{min}</span>
            <span>{max}</span>
          </div>
        </div>

        {/* Plus Button */}
        <button
          type="button"
          onMouseDown={() => startHold('plus')}
          onMouseUp={stopHold}
          onMouseLeave={stopHold}
          onTouchStart={() => startHold('plus')}
          onTouchEnd={stopHold}
          disabled={value >= max}
          className={`
            relative w-10 h-10 rounded-xl font-bold text-xl
            flex items-center justify-center
            transition-all duration-150 ease-out
            select-none touch-manipulation
            ${value >= max
              ? 'bg-gray-800/50 text-gray-600 cursor-not-allowed'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white active:scale-95'
            }
            ${isPressed === 'plus' ? 'scale-95 bg-gray-700' : ''}
            border border-gray-700/50
          `}
          aria-label={`Increase ${label}`}
        >
          <span className="mt-[-2px]">+</span>
        </button>
      </div>
    </div>
  );
};

// ============================================
// STANDINGS POINTS CARD
// ============================================

export interface StandingsPointsConfig {
  win: number;
  draw: number;
  loss: number;
  forfeit: number;
  noShow: number;
}

interface StandingsPointsCardProps {
  values: StandingsPointsConfig;
  onChange: (values: StandingsPointsConfig) => void;
}

export const StandingsPointsCard: React.FC<StandingsPointsCardProps> = ({
  values,
  onChange,
}) => {
  const updateValue = (key: keyof StandingsPointsConfig, newValue: number) => {
    onChange({ ...values, [key]: newValue });
  };

  const presets = [
    { label: 'Standard (3-1-0)', values: { win: 3, draw: 1, loss: 0, forfeit: 0, noShow: -1 } },
    { label: 'Win Only (1-0-0)', values: { win: 1, draw: 0, loss: 0, forfeit: 0, noShow: 0 } },
    { label: 'Hockey Style (2-1-0)', values: { win: 2, draw: 1, loss: 0, forfeit: -1, noShow: -2 } },
  ];

  return (
    <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-700/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🏆</span>
          <h3 className="text-base font-semibold text-orange-400 tracking-wide uppercase">
            Standings Points
          </h3>
        </div>

        {/* Presets Dropdown */}
        <div className="relative">
          <select
            onChange={(e) => {
              const preset = presets.find(p => p.label === e.target.value);
              if (preset) onChange(preset.values);
            }}
            className="
              appearance-none bg-gray-900/60 border border-gray-600/50
              text-gray-400 text-xs px-3 py-1.5 pr-8 rounded-lg
              cursor-pointer hover:border-gray-500 transition-colors
              focus:outline-none focus:border-blue-500
            "
            defaultValue=""
          >
            <option value="" disabled>Presets</option>
            {presets.map(p => (
              <option key={p.label} value={p.label}>{p.label}</option>
            ))}
          </select>
          <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* Points Grid */}
      <div className="p-5 grid grid-cols-5 gap-4">
        <PointSliderCompact
          label="Win"
          icon="✓"
          value={values.win}
          onChange={(v) => updateValue('win', v)}
          accentColor="lime"
        />
        <PointSliderCompact
          label="Draw"
          icon="="
          value={values.draw}
          onChange={(v) => updateValue('draw', v)}
          accentColor="gray"
        />
        <PointSliderCompact
          label="Loss"
          icon="✗"
          value={values.loss}
          onChange={(v) => updateValue('loss', v)}
          accentColor="gray"
        />
        <PointSliderCompact
          label="Forfeit"
          icon="⊘"
          value={values.forfeit}
          onChange={(v) => updateValue('forfeit', v)}
          accentColor="orange"
        />
        <PointSliderCompact
          label="No-Show"
          icon="∅"
          value={values.noShow}
          onChange={(v) => updateValue('noShow', v)}
          accentColor="red"
        />
      </div>
    </div>
  );
};

// ============================================
// COMPACT POINT SLIDER (for grid layout)
// ============================================

interface PointSliderCompactProps {
  label: string;
  icon: string;
  value: number;
  onChange: (value: number) => void;
  accentColor: 'lime' | 'gray' | 'orange' | 'red';
  min?: number;
  max?: number;
}

const PointSliderCompact: React.FC<PointSliderCompactProps> = ({
  label,
  icon,
  value,
  onChange,
  accentColor,
  min = -5,
  max = 10,
}) => {
  const [showPulse, setShowPulse] = useState(false);

  useEffect(() => {
    setShowPulse(true);
    const timer = setTimeout(() => setShowPulse(false), 150);
    return () => clearTimeout(timer);
  }, [value]);

  const getValueColor = () => {
    if (value > 0) return 'text-lime-400';
    if (value < 0) return 'text-red-400';
    return 'text-gray-400';
  };

  const getAccentBorder = () => {
    switch (accentColor) {
      case 'lime': return 'border-lime-500/30 hover:border-lime-500/50';
      case 'orange': return 'border-orange-500/30 hover:border-orange-500/50';
      case 'red': return 'border-red-500/30 hover:border-red-500/50';
      default: return 'border-gray-600/30 hover:border-gray-500/50';
    }
  };

  const increment = () => value < max && onChange(value + 1);
  const decrement = () => value > min && onChange(value - 1);

  return (
    <div className={`
      bg-gray-900/60 rounded-xl p-3 border transition-colors
      ${getAccentBorder()}
    `}>
      {/* Label */}
      <div className="text-center mb-2">
        <span className="text-lg opacity-60">{icon}</span>
        <div className="text-xs text-gray-400 font-medium mt-0.5">{label}</div>
      </div>

      {/* Value Display */}
      <div
        className={`
          text-center font-mono font-bold text-3xl tabular-nums mb-3
          transition-all duration-150
          ${getValueColor()}
          ${showPulse ? 'scale-110' : 'scale-100'}
        `}
      >
        {value > 0 && '+'}
        {value}
      </div>

      {/* Stepper Buttons */}
      <div className="flex gap-1">
        <button
          type="button"
          onClick={decrement}
          disabled={value <= min}
          className={`
            flex-1 h-8 rounded-lg font-bold text-lg
            transition-all duration-100 active:scale-95
            ${value <= min
              ? 'bg-gray-800/30 text-gray-700 cursor-not-allowed'
              : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }
          `}
        >
          −
        </button>
        <button
          type="button"
          onClick={increment}
          disabled={value >= max}
          className={`
            flex-1 h-8 rounded-lg font-bold text-lg
            transition-all duration-100 active:scale-95
            ${value >= max
              ? 'bg-gray-800/30 text-gray-700 cursor-not-allowed'
              : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }
          `}
        >
          +
        </button>
      </div>
    </div>
  );
};

// ============================================
// ROUNDS SLIDER
// ============================================

interface RoundsSliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label?: string;
  hint?: string;
}

export const RoundsSlider: React.FC<RoundsSliderProps> = ({
  value,
  onChange,
  min = 1,
  max = 10,
  label = 'Number of Rounds',
  hint = 'How many times each player plays each opponent',
}) => {
  const [showPulse, setShowPulse] = useState(false);

  useEffect(() => {
    setShowPulse(true);
    const timer = setTimeout(() => setShowPulse(false), 150);
    return () => clearTimeout(timer);
  }, [value]);

  const increment = () => value < max && onChange(value + 1);
  const decrement = () => value > min && onChange(value - 1);

  // Generate tick marks
  const ticks = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  return (
    <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-700/50">
        <div className="flex items-center gap-2">
          <span className="text-xl">🔄</span>
          <h3 className="text-base font-semibold text-blue-400 tracking-wide uppercase">
            {label}
          </h3>
        </div>
        {hint && (
          <p className="text-xs text-gray-500 mt-1">{hint}</p>
        )}
      </div>

      {/* Slider Content */}
      <div className="p-5">
        <div className="flex items-center gap-4">
          {/* Minus Button */}
          <button
            type="button"
            onClick={decrement}
            disabled={value <= min}
            className={`
              w-12 h-12 rounded-xl font-bold text-2xl
              flex items-center justify-center
              transition-all duration-150 active:scale-95
              ${value <= min
                ? 'bg-gray-800/30 text-gray-700 cursor-not-allowed'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white border border-gray-700/50'
              }
            `}
          >
            −
          </button>

          {/* Slider Area */}
          <div className="flex-1">
            {/* Value Display */}
            <div className="flex justify-center mb-4">
              <div
                className={`
                  relative px-6 py-2 rounded-xl
                  bg-gradient-to-b from-blue-900/40 to-blue-950/60
                  border border-blue-500/30
                  transition-all duration-150
                  ${showPulse ? 'scale-110 shadow-lg shadow-blue-500/30' : 'scale-100'}
                `}
              >
                <span className="font-mono font-bold text-4xl text-blue-400 tabular-nums">
                  {value}
                </span>
                <span className="text-blue-500/60 text-lg ml-1">
                  {value === 1 ? 'round' : 'rounds'}
                </span>
              </div>
            </div>

            {/* Visual Slider with Tick Marks */}
            <div className="relative">
              {/* Track Background */}
              <div className="h-2 bg-gray-800 rounded-full border border-gray-700/30">
                {/* Fill */}
                <div
                  className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-150"
                  style={{ width: `${((value - min) / (max - min)) * 100}%` }}
                />
              </div>

              {/* Tick Marks */}
              <div className="relative mt-2">
                <div className="flex justify-between">
                  {ticks.map((tick) => (
                    <button
                      key={tick}
                      type="button"
                      onClick={() => onChange(tick)}
                      className={`
                        w-8 h-8 rounded-lg text-sm font-mono font-medium
                        transition-all duration-150
                        ${tick === value
                          ? 'bg-blue-600 text-white scale-110'
                          : tick < value
                            ? 'bg-blue-900/40 text-blue-400 hover:bg-blue-800/60'
                            : 'bg-gray-800/60 text-gray-500 hover:bg-gray-700/60 hover:text-gray-300'
                        }
                      `}
                    >
                      {tick}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hidden Range Input for Accessibility */}
              <input
                type="range"
                min={min}
                max={max}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="absolute inset-0 opacity-0 cursor-pointer"
                style={{ top: '-10px', height: '44px' }}
              />
            </div>
          </div>

          {/* Plus Button */}
          <button
            type="button"
            onClick={increment}
            disabled={value >= max}
            className={`
              w-12 h-12 rounded-xl font-bold text-2xl
              flex items-center justify-center
              transition-all duration-150 active:scale-95
              ${value >= max
                ? 'bg-gray-800/30 text-gray-700 cursor-not-allowed'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white border border-gray-700/50'
              }
            `}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
};

export default PointsSlider;
