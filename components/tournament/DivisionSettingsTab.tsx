/**
 * DivisionSettingsTab - V07.02
 *
 * Redesigned Division Settings interface with "Sports Command Center" aesthetic.
 * Features glass-morphism cards, enhanced form inputs, and dramatic visual hierarchy.
 *
 * @file components/tournament/DivisionSettingsTab.tsx
 */
import React from 'react';
import { TiebreakerSettingsStyled } from './TiebreakerSettingsStyled';
import { Tournament, Division, Team, SeedingMethod, Match } from '../../types';

interface DivisionSettingsTabProps {
  tournament: Tournament;
  activeDivision: Division;
  divisionTeams: Team[];
  divisionMatches: Match[];
  divisionSettings: {
    minRating: string;
    maxRating: string;
    minAge: string;
    maxAge: string;
    seedingMethod: SeedingMethod;
    tournamentDayId: string;
  };
  setDivisionSettings: React.Dispatch<React.SetStateAction<{
    minRating: string;
    maxRating: string;
    minAge: string;
    maxAge: string;
    seedingMethod: SeedingMethod;
    tournamentDayId: string;
  }>>;
  isAppAdmin: boolean;
  onUpdateTournament: (tournament: Tournament) => Promise<void>;
  handleSaveDivisionSettings: () => void;
  handleUpdateDivisionSettings: (updates: Partial<Division>) => void;
  generatePoolAssignments: (params: { teams: Team[]; poolSize: number }) => any;
  savePoolAssignments: (tournamentId: string, divisionId: string, assignments: any) => Promise<void>;
}

// Styled input component with glass effect
const GlassInput: React.FC<{
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  hint?: React.ReactNode;
}> = ({ label, icon, children, hint }) => (
  <div className="group">
    <label className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
      {icon && <span className="text-lime-500/70">{icon}</span>}
      {label}
    </label>
    {children}
    {hint && <p className="text-[10px] text-gray-500 mt-1.5">{hint}</p>}
  </div>
);

// Section card with glass-morphism
const SettingsCard: React.FC<{
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  variant?: 'default' | 'warning' | 'accent';
  className?: string;
}> = ({ title, subtitle, icon, children, variant = 'default', className = '' }) => {
  const variants = {
    default: 'bg-gradient-to-br from-gray-900/80 to-gray-900/40 border-gray-700/50 hover:border-gray-600/50',
    warning: 'bg-gradient-to-br from-amber-950/30 to-amber-900/10 border-amber-600/30 hover:border-amber-500/40',
    accent: 'bg-gradient-to-br from-lime-950/20 to-gray-900/60 border-lime-600/20 hover:border-lime-500/30',
  };

  return (
    <div className={`
      relative overflow-hidden rounded-xl border backdrop-blur-sm
      transition-all duration-300 ease-out
      ${variants[variant]}
      ${className}
    `}>
      {/* Subtle top highlight */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-700/30">
        <div className="flex items-center gap-3">
          {icon && (
            <div className={`
              w-9 h-9 rounded-lg flex items-center justify-center
              ${variant === 'warning' ? 'bg-amber-500/20 text-amber-400' :
                variant === 'accent' ? 'bg-lime-500/20 text-lime-400' :
                'bg-gray-700/50 text-gray-400'}
            `}>
              {icon}
            </div>
          )}
          <div>
            <h3 className={`font-bold text-base ${
              variant === 'warning' ? 'text-amber-300' : 'text-white'
            }`}>
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        {children}
      </div>
    </div>
  );
};

// Styled select dropdown
const StyledSelect: React.FC<{
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ value, onChange, disabled, children }) => (
  <div className="relative">
    <select
      value={value}
      onChange={onChange}
      disabled={disabled}
      className={`
        w-full appearance-none
        bg-gray-800/70 text-white
        px-4 py-2.5 pr-10 rounded-lg
        border border-gray-600/50
        focus:border-lime-500/50 focus:ring-2 focus:ring-lime-500/20
        hover:border-gray-500/70
        transition-all duration-200 ease-out
        outline-none cursor-pointer
        disabled:opacity-50 disabled:cursor-not-allowed
        text-sm
      `}
    >
      {children}
    </select>
    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-500">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  </div>
);

// Styled number input
const StyledInput: React.FC<{
  type?: string;
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  placeholder?: string;
  step?: string;
  disabled?: boolean;
  defaultValue?: string;
}> = ({ type = 'text', value, onChange, onBlur, placeholder, step, disabled, defaultValue }) => (
  <input
    type={type}
    value={value}
    defaultValue={defaultValue}
    onChange={onChange}
    onBlur={onBlur}
    placeholder={placeholder}
    step={step}
    disabled={disabled}
    className={`
      w-full bg-gray-800/70 text-white
      px-4 py-2.5 rounded-lg
      border border-gray-600/50
      focus:border-lime-500/50 focus:ring-2 focus:ring-lime-500/20
      hover:border-gray-500/70
      transition-all duration-200 ease-out
      outline-none placeholder-gray-500
      disabled:opacity-50 disabled:cursor-not-allowed
      text-sm
    `}
  />
);

// Styled checkbox with toggle appearance
const StyledToggle: React.FC<{
  checked: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  variant?: 'default' | 'warning';
}> = ({ checked, onChange, label, description, disabled, variant = 'default' }) => (
  <label className={`
    flex items-start gap-4 p-4 rounded-lg cursor-pointer
    transition-all duration-200 ease-out
    ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-700/30'}
    ${checked && variant === 'default' ? 'bg-lime-500/5' : ''}
    ${checked && variant === 'warning' ? 'bg-amber-500/10' : ''}
  `}>
    <div className="relative mt-0.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="sr-only peer"
      />
      <div className={`
        w-11 h-6 rounded-full
        transition-all duration-200 ease-out
        ${checked
          ? variant === 'warning' ? 'bg-amber-500' : 'bg-lime-500'
          : 'bg-gray-700'}
      `}>
        <div className={`
          absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white
          shadow-md transition-transform duration-200 ease-out
          ${checked ? 'translate-x-5' : 'translate-x-0'}
        `} />
      </div>
    </div>
    <div className="flex-1">
      <span className={`font-medium ${
        variant === 'warning' ? 'text-amber-300' : 'text-gray-200'
      }`}>
        {label}
      </span>
      {description && (
        <p className="text-xs text-gray-500 mt-1">{description}</p>
      )}
    </div>
  </label>
);

// Icons
const SettingsIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const RatingIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
  </svg>
);

const UsersIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const CalendarIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const GridIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
  </svg>
);

const TrophyIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15l-2 5H6l2-5m4 0l2 5h4l-2-5m-4 0V9m0 0l3-3m-3 3l-3-3m3 3h.01M17 4h2a1 1 0 011 1v3a3 3 0 01-3 3m0-7V4M7 4H5a1 1 0 00-1 1v3a3 3 0 003 3m0-7V4" />
  </svg>
);

const GamepadIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h3a1 1 0 001-1V4z" />
    <circle cx="9" cy="11" r="1" fill="currentColor" />
    <circle cx="15" cy="11" r="1" fill="currentColor" />
  </svg>
);

const FlaskIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
  </svg>
);

export const DivisionSettingsTab: React.FC<DivisionSettingsTabProps> = ({
  tournament,
  activeDivision,
  divisionTeams,
  divisionMatches,
  divisionSettings,
  setDivisionSettings,
  isAppAdmin,
  onUpdateTournament,
  handleSaveDivisionSettings,
  handleUpdateDivisionSettings,
  generatePoolAssignments,
  savePoolAssignments,
}) => {
  const matchesStarted = (divisionMatches || []).some(
    m => m.status === 'in_progress' || m.status === 'completed'
  );

  const isPoolPlay =
    activeDivision.format?.competitionFormat === 'pool_play_medals' ||
    activeDivision.format?.stageMode === 'two_stage';

  return (
    <div className="space-y-5">
      {/* Division Settings Card */}
      <SettingsCard
        title={`Division Settings`}
        subtitle={activeDivision.name}
        icon={<SettingsIcon />}
      >
        <div className="space-y-6">
          {/* Rating & Age Limits */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Rating Limits */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <RatingIcon />
                <span className="text-sm font-medium text-gray-300">DUPR Rating Limits</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <GlassInput label="Minimum">
                  <StyledInput
                    type="number"
                    step="0.1"
                    value={divisionSettings.minRating}
                    onChange={e => setDivisionSettings(prev => ({ ...prev, minRating: e.target.value }))}
                    placeholder="e.g. 3.0"
                  />
                </GlassInput>
                <GlassInput label="Maximum">
                  <StyledInput
                    type="number"
                    step="0.1"
                    value={divisionSettings.maxRating}
                    onChange={e => setDivisionSettings(prev => ({ ...prev, maxRating: e.target.value }))}
                    placeholder="Open"
                  />
                </GlassInput>
              </div>
            </div>

            {/* Age Limits */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <UsersIcon />
                <span className="text-sm font-medium text-gray-300">Age Limits</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <GlassInput label="Minimum">
                  <StyledInput
                    type="number"
                    value={divisionSettings.minAge}
                    onChange={e => setDivisionSettings(prev => ({ ...prev, minAge: e.target.value }))}
                    placeholder="e.g. 50"
                  />
                </GlassInput>
                <GlassInput label="Maximum">
                  <StyledInput
                    type="number"
                    value={divisionSettings.maxAge}
                    onChange={e => setDivisionSettings(prev => ({ ...prev, maxAge: e.target.value }))}
                    placeholder="No max"
                  />
                </GlassInput>
              </div>
            </div>
          </div>

          {/* Seeding Method */}
          <GlassInput
            label="Seeding Method"
            icon={<RatingIcon />}
            hint="Used when generating pools/brackets for this division."
          >
            <StyledSelect
              value={divisionSettings.seedingMethod}
              onChange={e => setDivisionSettings(prev => ({
                ...prev,
                seedingMethod: e.target.value as SeedingMethod,
              }))}
            >
              <option value="rating">Rating Based (DUPR)</option>
              <option value="random">Random</option>
            </StyledSelect>
          </GlassInput>

          {/* Tournament Day */}
          {tournament.days && tournament.days.length > 1 && (
            <GlassInput
              label="Tournament Day"
              icon={<CalendarIcon />}
              hint="Which day this division is scheduled to play."
            >
              <StyledSelect
                value={divisionSettings.tournamentDayId}
                onChange={e => setDivisionSettings(prev => ({
                  ...prev,
                  tournamentDayId: e.target.value,
                }))}
              >
                <option value="">-- Select Day --</option>
                {tournament.days.map((day, idx) => (
                  <option key={day.id} value={day.id}>
                    {day.label || `Day ${idx + 1}`} ({day.date})
                  </option>
                ))}
              </StyledSelect>
            </GlassInput>
          )}

          {/* Teams Per Pool - Pool Play Only */}
          {isPoolPlay && (
            <GlassInput
              label="Teams Per Pool"
              icon={<GridIcon />}
              hint={
                <>
                  {(divisionTeams || []).length} teams ÷ {activeDivision.format?.teamsPerPool || 4} = {Math.ceil((divisionTeams || []).length / (activeDivision.format?.teamsPerPool || 4))} pools
                  {matchesStarted && (
                    <span className="text-amber-400 ml-2 font-medium">(Locked - matches have started)</span>
                  )}
                </>
              }
            >
              <StyledSelect
                value={activeDivision.format?.teamsPerPool || 4}
                onChange={async e => {
                  const newPoolSize = parseInt(e.target.value, 10);
                  try {
                    const { doc, updateDoc } = await import('@firebase/firestore');
                    const { db } = await import('../../services/firebase/config');
                    const divisionRef = doc(db, 'tournaments', tournament.id, 'divisions', activeDivision.id);
                    await updateDoc(divisionRef, {
                      'format.teamsPerPool': newPoolSize,
                      updatedAt: Date.now(),
                    });
                    const newAssignments = generatePoolAssignments({
                      teams: divisionTeams,
                      poolSize: newPoolSize,
                    });
                    await savePoolAssignments(tournament.id, activeDivision.id, newAssignments);
                  } catch (err) {
                    const errorMessage = err instanceof Error ? err.message : String(err);
                    console.error('Failed to update pool size:', errorMessage, err);
                    alert(`Failed to update pool size: ${errorMessage}`);
                  }
                }}
                disabled={matchesStarted}
              >
                <option value={3}>3 teams per pool</option>
                <option value={4}>4 teams per pool</option>
                <option value={5}>5 teams per pool</option>
                <option value={6}>6 teams per pool</option>
              </StyledSelect>
            </GlassInput>
          )}
        </div>
      </SettingsCard>

      {/* Tiebreaker Rules - Pool Play Only */}
      {isPoolPlay && (
        <SettingsCard
          title="Pool Tiebreaker Rules"
          subtitle="Drag to reorder priority"
          icon={<TrophyIcon />}
          variant="accent"
        >
          <TiebreakerSettingsStyled
            tiebreakers={
              (activeDivision.format as any)?.poolPlayMedalsSettings?.tiebreakers ||
              ['wins', 'head_to_head', 'point_diff', 'points_scored']
            }
            onChange={async (newOrder) => {
              try {
                const { doc, updateDoc } = await import('@firebase/firestore');
                const { db } = await import('../../services/firebase/config');
                const divisionRef = doc(db, 'tournaments', tournament.id, 'divisions', activeDivision.id);
                const currentSettings = (activeDivision.format as any)?.poolPlayMedalsSettings || {};
                await updateDoc(divisionRef, {
                  'format.poolPlayMedalsSettings': {
                    ...currentSettings,
                    tiebreakers: newOrder,
                  },
                  updatedAt: Date.now(),
                });
              } catch (err) {
                console.error('Failed to update tiebreaker order:', err);
                alert('Failed to update tiebreaker order');
              }
            }}
            disabled={matchesStarted}
          />
        </SettingsCard>
      )}

      {/* Plate Bracket Settings - Pool Play Only */}
      {isPoolPlay && (
        <SettingsCard
          title="Plate Bracket"
          subtitle="Consolation bracket for pool losers"
          icon={<TrophyIcon />}
        >
          <StyledToggle
            checked={activeDivision.format?.plateEnabled === true}
            onChange={async (e) => {
              const newValue = e.target.checked;
              try {
                const { doc, updateDoc } = await import('@firebase/firestore');
                const { db } = await import('../../services/firebase/config');
                const divisionRef = doc(db, 'tournaments', tournament.id, 'divisions', activeDivision.id);
                await updateDoc(divisionRef, {
                  'format.plateEnabled': newValue,
                  updatedAt: Date.now(),
                });
              } catch (err) {
                console.error('Failed to update plate settings:', err);
                alert('Failed to update plate settings');
              }
            }}
            label="Enable Plate Bracket"
            description="Bottom finishers from each pool compete in a separate bracket"
            disabled={matchesStarted}
          />

          {activeDivision.format?.plateEnabled && (
            <div className="mt-5 ml-4 pl-4 border-l-2 border-lime-500/30 space-y-4">
              <GlassInput label="Bracket Name">
                <StyledInput
                  type="text"
                  value={activeDivision.format?.plateName || 'Plate'}
                  onChange={async (e) => {
                    try {
                      const { doc, updateDoc } = await import('@firebase/firestore');
                      const { db } = await import('../../services/firebase/config');
                      const divisionRef = doc(db, 'tournaments', tournament.id, 'divisions', activeDivision.id);
                      await updateDoc(divisionRef, {
                        'format.plateName': e.target.value,
                        updatedAt: Date.now(),
                      });
                    } catch (err) {
                      console.error('Failed to update plate name:', err);
                    }
                  }}
                  placeholder="Plate"
                  disabled={matchesStarted}
                />
              </GlassInput>

              <GlassInput label="Teams to Plate (per pool)">
                <StyledSelect
                  value={String(activeDivision.format?.advanceToPlatePerPool ?? 1)}
                  onChange={async (e) => {
                    const newValue = parseInt(e.target.value, 10);
                    try {
                      const { doc, updateDoc } = await import('@firebase/firestore');
                      const { db } = await import('../../services/firebase/config');
                      const divisionRef = doc(db, 'tournaments', tournament.id, 'divisions', activeDivision.id);
                      await updateDoc(divisionRef, {
                        'format.advanceToPlatePerPool': newValue,
                        updatedAt: Date.now(),
                      });
                    } catch (err) {
                      console.error('Failed to update plate advancement:', err);
                    }
                  }}
                  disabled={matchesStarted}
                >
                  <option value="1">Next 1 after cutoff → Plate</option>
                  <option value="2">Next 2 after cutoff → Plate</option>
                </StyledSelect>
              </GlassInput>

              <GlassInput label="Plate Format">
                <StyledSelect
                  value={activeDivision.format?.plateFormat || 'single_elim'}
                  onChange={async (e) => {
                    try {
                      const { doc, updateDoc } = await import('@firebase/firestore');
                      const { db } = await import('../../services/firebase/config');
                      const divisionRef = doc(db, 'tournaments', tournament.id, 'divisions', activeDivision.id);
                      await updateDoc(divisionRef, {
                        'format.plateFormat': e.target.value,
                        updatedAt: Date.now(),
                      });
                    } catch (err) {
                      console.error('Failed to update plate format:', err);
                    }
                  }}
                  disabled={matchesStarted}
                >
                  <option value="single_elim">Single Elimination</option>
                  <option value="round_robin">Round Robin</option>
                </StyledSelect>
              </GlassInput>

              <StyledToggle
                checked={activeDivision.format?.plateThirdPlace === true}
                onChange={async (e) => {
                  const newValue = e.target.checked;
                  try {
                    const { doc, updateDoc } = await import('@firebase/firestore');
                    const { db } = await import('../../services/firebase/config');
                    const divisionRef = doc(db, 'tournaments', tournament.id, 'divisions', activeDivision.id);
                    await updateDoc(divisionRef, {
                      'format.plateThirdPlace': newValue,
                      updatedAt: Date.now(),
                    });
                  } catch (err) {
                    console.error('Failed to update plate 3rd place setting:', err);
                  }
                }}
                label="Include 3rd place match"
                description="Add a bronze medal match to the Plate bracket"
                disabled={matchesStarted}
              />
            </div>
          )}
        </SettingsCard>
      )}

      {/* Test Mode - Admin Only */}
      {isAppAdmin && (
        <SettingsCard
          title="Test Mode"
          subtitle="Developer testing features"
          icon={<FlaskIcon />}
          variant="warning"
        >
          <div className="relative">
            {/* Animated warning stripes background */}
            <div className="absolute inset-0 opacity-5 pointer-events-none overflow-hidden rounded-lg">
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, currentColor 10px, currentColor 20px)',
                  animation: 'slide 2s linear infinite',
                }}
              />
            </div>

            <StyledToggle
              checked={tournament.testMode === true}
              onChange={async (e) => {
                const newValue = e.target.checked;
                if (newValue) {
                  if (!confirm('Enable Test Mode?\n\nYou will be able to score any match and test features.\nChanges affect real data but can be cleared with the "Clear Test Data" button.')) {
                    return;
                  }
                }
                await onUpdateTournament({ ...tournament, testMode: newValue });
              }}
              label="Enable Test Mode"
              description="Score any match, simulate completions, test features. Changes are flagged for cleanup."
              variant="warning"
            />
          </div>
        </SettingsCard>
      )}

      {/* Save Button */}
      <div className="flex justify-end pt-2">
        <button
          onClick={handleSaveDivisionSettings}
          className="
            relative group overflow-hidden
            bg-gradient-to-r from-lime-600 to-lime-500
            hover:from-lime-500 hover:to-lime-400
            text-gray-900 font-bold
            px-8 py-3 rounded-xl
            shadow-lg shadow-lime-500/20
            hover:shadow-xl hover:shadow-lime-500/30
            transition-all duration-300 ease-out
            transform hover:scale-[1.02] active:scale-[0.98]
          "
        >
          {/* Shine effect */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          </div>
          <span className="relative flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Save Settings
          </span>
        </button>
      </div>

      {/* General & Match Rules Card */}
      <SettingsCard
        title="General & Match Rules"
        subtitle="Game format configuration"
        icon={<GamepadIcon />}
      >
        <div className="space-y-5">
          <GlassInput label="Division Name">
            <StyledInput
              type="text"
              defaultValue={activeDivision.name}
              onBlur={e => {
                if (e.target.value !== activeDivision.name) {
                  handleUpdateDivisionSettings({ name: e.target.value });
                }
              }}
            />
          </GlassInput>

          <div className="grid grid-cols-3 gap-4">
            <GlassInput label="Best Of (Games)">
              <StyledSelect
                value={activeDivision.format.bestOfGames || 1}
                onChange={e =>
                  handleUpdateDivisionSettings({
                    format: {
                      ...activeDivision.format,
                      bestOfGames: parseInt(e.target.value, 10) as any,
                    },
                  })
                }
              >
                <option value="1">1</option>
                <option value="3">3</option>
                <option value="5">5</option>
              </StyledSelect>
            </GlassInput>

            <GlassInput label="Points to Win">
              <StyledSelect
                value={activeDivision.format.pointsPerGame || 11}
                onChange={e =>
                  handleUpdateDivisionSettings({
                    format: {
                      ...activeDivision.format,
                      pointsPerGame: parseInt(e.target.value, 10) as any,
                    },
                  })
                }
              >
                <option value="11">11</option>
                <option value="15">15</option>
                <option value="21">21</option>
              </StyledSelect>
            </GlassInput>

            <GlassInput label="Win By">
              <StyledSelect
                value={activeDivision.format.winBy || 2}
                onChange={e =>
                  handleUpdateDivisionSettings({
                    format: {
                      ...activeDivision.format,
                      winBy: parseInt(e.target.value, 10) as any,
                    },
                  })
                }
              >
                <option value="1">1</option>
                <option value="2">2</option>
              </StyledSelect>
            </GlassInput>
          </div>
        </div>
      </SettingsCard>

      {/* Keyframe animation for warning stripes */}
      <style>{`
        @keyframes slide {
          from { transform: translateX(-20px); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
};
