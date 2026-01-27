/**
 * CreateTeamLeagueWizard Component
 *
 * Multi-step wizard for creating a new Team League (Interclub).
 * 5 steps: Basic Info, Boards, Roster, Schedule, Review
 *
 * FILE LOCATION: components/teamLeague/wizard/CreateTeamLeagueWizard.tsx
 * VERSION: V07.56
 */

import React, { useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { createTeamLeague } from '../../../services/firebase/teamLeague';
import { validateScheduleConfig, type TeamLeagueSettings } from '../../../types/teamLeague';

import { WizardProgress, type Step } from './WizardProgress';
import { StepBasicInfo, type BasicInfoData } from './StepBasicInfo';
import { StepBoards, type BoardsData } from './StepBoards';
import { StepRoster, type RosterData } from './StepRoster';
import { StepSchedule, type ScheduleData } from './StepSchedule';
import { StepReview } from './StepReview';

// ============================================
// TYPES
// ============================================

interface CreateTeamLeagueWizardProps {
  onBack: () => void;
  onCreated: (leagueId: string) => void;
}

const STEPS: Step[] = [
  { id: 'basic', label: 'Basic Info' },
  { id: 'boards', label: 'Boards' },
  { id: 'roster', label: 'Roster' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'review', label: 'Review' },
];

// ============================================
// DEFAULT VALUES
// ============================================

const getDefaultBasicInfo = (): BasicInfoData => ({
  name: '',
  description: '',
  startDate: '',
  country: 'NZL',
  region: '',
  venue: '',
});

const getDefaultBoards = (): BoardsData => ({
  boards: [
    { id: '1', name: "Men's Doubles", format: 'doubles', order: 1 },
    { id: '2', name: "Women's Doubles", format: 'doubles', order: 2 },
    { id: '3', name: "Mixed Doubles", format: 'mixed', order: 3 },
  ],
  pointsPerBoardWin: 1,
  pointsPerMatchWin: 3,
});

const getDefaultRoster = (): RosterData => ({
  minPlayersPerTeam: 6,
  maxPlayersPerTeam: 12,
  lineupLockMinutesBeforeMatch: 30,
  allowMultiTeamPlayers: false,
  duprMode: 'none',
  duprMaxRating: 4.5,
  duprRatingEnabled: false,
  // Fee defaults
  entryFeeType: 'none',
  entryFeeAmount: 0,
  venueFeeEnabled: false,
  venueFeeAmount: 0,
  requirePaymentBeforeApproval: false,
});

const getDefaultSchedule = (): ScheduleData => ({
  maxTeams: 8,
  numberOfWeeks: 10,
  scheduleType: 'round_robin',
  defaultMatchDay: 3, // Wednesday
  defaultMatchTime: '19:00',
  tieBreakerOrder: ['matchWins', 'boardDiff', 'headToHead', 'pointDiff'],
});

// ============================================
// MAIN COMPONENT
// ============================================

export const CreateTeamLeagueWizard: React.FC<CreateTeamLeagueWizardProps> = ({
  onBack,
  onCreated,
}) => {
  const { currentUser, userProfile } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Form data for each step
  const [basicInfo, setBasicInfo] = useState<BasicInfoData>(getDefaultBasicInfo);
  const [boards, setBoards] = useState<BoardsData>(getDefaultBoards);
  const [roster, setRoster] = useState<RosterData>(getDefaultRoster);
  const [schedule, setSchedule] = useState<ScheduleData>(getDefaultSchedule);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ============================================
  // VALIDATION
  // ============================================

  const validateBasicInfo = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!basicInfo.name.trim()) {
      newErrors.name = 'League name is required';
    }
    if (!basicInfo.startDate) {
      newErrors.startDate = 'Start date is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateBoards = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (boards.boards.length === 0) {
      newErrors.boards = 'At least one board is required';
    }

    const boardsWithoutNames = boards.boards.filter(b => !b.name.trim());
    if (boardsWithoutNames.length > 0) {
      newErrors.boards = 'All boards must have names';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateRoster = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (roster.minPlayersPerTeam < 2) {
      newErrors.minPlayersPerTeam = 'Minimum roster size must be at least 2';
    }
    if (roster.maxPlayersPerTeam < roster.minPlayersPerTeam) {
      newErrors.maxPlayersPerTeam = 'Maximum must be greater than minimum';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateSchedule = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Use the validation helper from types/teamLeague
    const scheduleError = validateScheduleConfig({
      maxTeams: schedule.maxTeams,
      numberOfWeeks: schedule.numberOfWeeks,
      scheduleType: schedule.scheduleType,
    } as TeamLeagueSettings);

    if (scheduleError) {
      newErrors.schedule = scheduleError;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateCurrentStep = (): boolean => {
    switch (currentStep) {
      case 0:
        return validateBasicInfo();
      case 1:
        return validateBoards();
      case 2:
        return validateRoster();
      case 3:
        return validateSchedule();
      default:
        return true;
    }
  };

  // ============================================
  // NAVIGATION
  // ============================================

  const handleNext = () => {
    if (validateCurrentStep()) {
      setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1));
    }
  };

  const handleBack = () => {
    if (currentStep === 0) {
      onBack();
    } else {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleEditStep = (step: number) => {
    setCurrentStep(step);
  };

  // ============================================
  // SUBMIT
  // ============================================

  const handleSubmit = async () => {
    if (!currentUser) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Calculate end date based on start date and number of weeks
      let endDate = basicInfo.startDate;
      if (basicInfo.startDate && schedule.numberOfWeeks) {
        const start = new Date(basicInfo.startDate);
        start.setDate(start.getDate() + (schedule.numberOfWeeks * 7));
        endDate = start.toISOString().split('T')[0];
      }

      // Build the league data with flattened structure
      const leagueData = {
        name: basicInfo.name.trim(),
        description: basicInfo.description.trim(),
        seasonStart: basicInfo.startDate,
        seasonEnd: endDate,
        venue: basicInfo.venue.trim(),
        country: basicInfo.country,
        region: basicInfo.region,
        createdByUserId: currentUser.uid,
        organizerName: userProfile?.displayName || currentUser.displayName || 'Unknown',

        // Boards
        boards: boards.boards.map((b, idx) => ({
          id: b.id,
          name: b.name,
          format: b.format,
          order: idx + 1,
        })),

        // Schedule
        maxTeams: schedule.maxTeams,
        numberOfWeeks: schedule.numberOfWeeks,
        scheduleType: schedule.scheduleType,
        defaultMatchDay: schedule.defaultMatchDay,
        defaultMatchTime: schedule.defaultMatchTime,

        // Roster
        minPlayersPerTeam: roster.minPlayersPerTeam,
        maxPlayersPerTeam: roster.maxPlayersPerTeam,
        duprMode: roster.duprMode,

        // Fees
        entryFeeType: roster.entryFeeType,
        entryFeeAmount: roster.entryFeeAmount,
      };

      const leagueId = await createTeamLeague(leagueData);
      onCreated(leagueId);
    } catch (error) {
      console.error('Error creating team league:', error);
      setSubmitError(error instanceof Error ? error.message : 'Failed to create league');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================
  // RENDER
  // ============================================

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <StepBasicInfo
            data={basicInfo}
            onChange={setBasicInfo}
            errors={errors}
          />
        );
      case 1:
        return (
          <StepBoards
            data={boards}
            onChange={setBoards}
            errors={errors}
          />
        );
      case 2:
        return (
          <StepRoster
            data={roster}
            onChange={setRoster}
            errors={errors}
            organizerHasStripe={!!userProfile?.stripeConnectedAccountId && userProfile?.stripeChargesEnabled === true}
          />
        );
      case 3:
        return (
          <StepSchedule
            data={schedule}
            onChange={setSchedule}
            errors={errors}
          />
        );
      case 4:
        return (
          <StepReview
            basicInfo={basicInfo}
            boards={boards}
            roster={roster}
            schedule={schedule}
            onEditStep={handleEditStep}
            isSubmitting={isSubmitting}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-4"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Team Leagues
        </button>
        <h1 className="text-2xl font-bold text-white">Create Team League</h1>
        <p className="text-gray-400">Club vs Club interclub competition</p>
      </div>

      {/* Progress */}
      <WizardProgress steps={STEPS} currentStep={currentStep} />

      {/* Step Content */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
        {renderStepContent()}
      </div>

      {/* Error message */}
      {submitError && (
        <div className="mb-4 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-300">
          {submitError}
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex justify-between">
        <button
          type="button"
          onClick={handleBack}
          disabled={isSubmitting}
          className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {currentStep === 0 ? 'Cancel' : 'Back'}
        </button>

        {currentStep < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={handleNext}
            className="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            Next
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-6 py-3 bg-lime-600 hover:bg-lime-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Creating...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Create Team League
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default CreateTeamLeagueWizard;
