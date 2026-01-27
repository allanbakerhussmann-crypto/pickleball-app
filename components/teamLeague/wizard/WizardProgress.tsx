/**
 * WizardProgress Component
 *
 * Shows the step progress bar for the team league creation wizard.
 *
 * FILE LOCATION: components/teamLeague/wizard/WizardProgress.tsx
 * VERSION: V07.54
 */

import React from 'react';

export interface Step {
  id: string;
  label: string;
}

interface WizardProgressProps {
  steps: Step[];
  currentStep: number;
  onStepClick?: (step: number) => void;
}

export const WizardProgress: React.FC<WizardProgressProps> = ({
  steps,
  currentStep,
  onStepClick,
}) => {
  return (
    <div className="mb-8">
      {/* Desktop view */}
      <div className="hidden md:flex items-center justify-center">
        {steps.map((step, index) => {
          const isCompleted = currentStep > index;
          const isCurrent = currentStep === index;
          const isClickable = onStepClick && (isCompleted || isCurrent);

          return (
            <React.Fragment key={step.id}>
              {/* Step circle and label */}
              <button
                onClick={() => isClickable && onStepClick?.(index)}
                disabled={!isClickable}
                className={`
                  flex flex-col items-center gap-2 transition-colors
                  ${isClickable ? 'cursor-pointer' : 'cursor-default'}
                `}
              >
                <div
                  className={`
                    w-10 h-10 rounded-full flex items-center justify-center
                    font-bold text-sm transition-all
                    ${isCompleted
                      ? 'bg-lime-600 text-white'
                      : isCurrent
                        ? 'bg-amber-600 text-white ring-4 ring-amber-600/30'
                        : 'bg-gray-700 text-gray-400'
                    }
                  `}
                >
                  {isCompleted ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={`
                    text-sm font-medium
                    ${isCurrent ? 'text-white' : isCompleted ? 'text-lime-400' : 'text-gray-500'}
                  `}
                >
                  {step.label}
                </span>
              </button>

              {/* Connector line */}
              {index < steps.length - 1 && (
                <div
                  className={`
                    w-16 h-1 mx-2 rounded
                    ${currentStep > index ? 'bg-lime-600' : 'bg-gray-700'}
                  `}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Mobile view */}
      <div className="md:hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-400">
            Step {currentStep + 1} of {steps.length}
          </span>
          <span className="text-sm font-medium text-white">
            {steps[currentStep]?.label}
          </span>
        </div>
        <div className="flex gap-1">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={`
                h-2 flex-1 rounded-full transition-colors
                ${currentStep >= index ? 'bg-amber-600' : 'bg-gray-700'}
              `}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default WizardProgress;
