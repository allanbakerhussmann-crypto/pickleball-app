/**
 * StepRoster Component
 *
 * Step 3: Configure roster, eligibility rules, and fees.
 *
 * FILE LOCATION: components/teamLeague/wizard/StepRoster.tsx
 * VERSION: V07.56
 */

import React from 'react';

export interface RosterData {
  minPlayersPerTeam: number;
  maxPlayersPerTeam: number;
  lineupLockMinutesBeforeMatch: number;
  allowMultiTeamPlayers: boolean;
  duprMode: 'none' | 'required';
  duprMaxRating?: number;
  duprRatingEnabled: boolean;
  // Fee configuration
  entryFeeType: 'none' | 'per_team' | 'per_player';
  entryFeeAmount: number;
  venueFeeEnabled: boolean;
  venueFeeAmount: number;
  requirePaymentBeforeApproval: boolean;
}

interface StepRosterProps {
  data: RosterData;
  onChange: (data: RosterData) => void;
  errors: Record<string, string>;
  /** Whether the organizer has Stripe connected (required for fees) */
  organizerHasStripe?: boolean;
}

export const StepRoster: React.FC<StepRosterProps> = ({
  data,
  onChange,
  errors,
  organizerHasStripe = false,
}) => {
  const handleChange = (field: keyof RosterData, value: unknown) => {
    onChange({ ...data, [field]: value });
  };

  // Check if any fees are enabled
  const hasAnyFees = data.entryFeeType !== 'none' || data.venueFeeEnabled;

  // Format amount for display (cents to dollars)
  const formatAmount = (cents: number) => {
    return (cents / 100).toFixed(2);
  };

  // Parse amount from display (dollars to cents)
  const parseAmount = (dollars: string) => {
    const num = parseFloat(dollars) || 0;
    return Math.round(num * 100);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Roster & Eligibility Rules</h2>
        <p className="text-gray-400 text-sm">Configure team roster sizes and player eligibility.</p>
      </div>

      {/* Team Roster Size */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Team Roster Size</h3>
        <p className="text-sm text-gray-400 mb-4">
          Total players on the team roster, including substitutes. Captains select players from this roster for each fixture.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Minimum Players
            </label>
            <input
              type="number"
              min="2"
              value={data.minPlayersPerTeam}
              onChange={(e) => handleChange('minPlayersPerTeam', parseInt(e.target.value) || 2)}
              className={`
                w-full bg-gray-700 text-white p-3 rounded-lg border
                ${errors.minPlayersPerTeam ? 'border-red-500' : 'border-gray-600'}
                focus:border-amber-500 outline-none
              `}
            />
            {errors.minPlayersPerTeam && (
              <p className="mt-1 text-sm text-red-400">{errors.minPlayersPerTeam}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Maximum Players
            </label>
            <input
              type="number"
              min="2"
              value={data.maxPlayersPerTeam}
              onChange={(e) => handleChange('maxPlayersPerTeam', parseInt(e.target.value) || 12)}
              className={`
                w-full bg-gray-700 text-white p-3 rounded-lg border
                ${errors.maxPlayersPerTeam ? 'border-red-500' : 'border-gray-600'}
                focus:border-amber-500 outline-none
              `}
            />
            {errors.maxPlayersPerTeam && (
              <p className="mt-1 text-sm text-red-400">{errors.maxPlayersPerTeam}</p>
            )}
          </div>
        </div>
      </div>

      {/* Lineup Rules */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Lineup Rules</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Lineup Lock Time (minutes before match)
            </label>
            <input
              type="number"
              min="0"
              value={data.lineupLockMinutesBeforeMatch}
              onChange={(e) => handleChange('lineupLockMinutesBeforeMatch', parseInt(e.target.value) || 0)}
              className="w-full bg-gray-700 text-white p-3 rounded-lg border border-gray-600 focus:border-amber-500 outline-none"
            />
            <p className="mt-1 text-xs text-gray-500">
              Captains must submit lineups before this time. Set to 0 to allow changes until match starts.
            </p>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={data.allowMultiTeamPlayers}
              onChange={(e) => handleChange('allowMultiTeamPlayers', e.target.checked)}
              className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-amber-600 focus:ring-amber-500 focus:ring-offset-gray-900"
            />
            <div>
              <span className="text-white font-medium">Allow players on multiple teams</span>
              <p className="text-xs text-gray-500">
                If enabled, a player can be rostered on more than one team
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* DUPR Requirements */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-4">DUPR Requirements</h3>

        <div className="space-y-4">
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="duprMode"
                checked={data.duprMode === 'none'}
                onChange={() => handleChange('duprMode', 'none')}
                className="w-5 h-5 border-gray-600 bg-gray-700 text-amber-600 focus:ring-amber-500"
              />
              <div>
                <span className="text-white font-medium">No DUPR requirement</span>
                <p className="text-xs text-gray-500">Players do not need a DUPR ID</p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="duprMode"
                checked={data.duprMode === 'required'}
                onChange={() => handleChange('duprMode', 'required')}
                className="w-5 h-5 border-gray-600 bg-gray-700 text-amber-600 focus:ring-amber-500"
              />
              <div>
                <span className="text-white font-medium">DUPR ID required</span>
                <p className="text-xs text-gray-500">All players must have a linked DUPR ID</p>
              </div>
            </label>
          </div>

          {/* Rating restrictions */}
          <div className="pt-4 border-t border-gray-700">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={data.duprRatingEnabled}
                onChange={(e) => handleChange('duprRatingEnabled', e.target.checked)}
                className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-amber-600 focus:ring-amber-500 focus:ring-offset-gray-900"
              />
              <div>
                <span className="text-white font-medium">Enable rating cap</span>
                <p className="text-xs text-gray-500">Restrict players by DUPR rating</p>
              </div>
            </label>

            {data.duprRatingEnabled && (
              <div className="mt-4 ml-8">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Maximum Doubles Rating
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  max="8"
                  value={data.duprMaxRating || 4.5}
                  onChange={(e) => handleChange('duprMaxRating', parseFloat(e.target.value) || 4.5)}
                  className="w-32 bg-gray-700 text-white p-3 rounded-lg border border-gray-600 focus:border-amber-500 outline-none"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Players with a DUPR rating above this cannot participate
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fees Section */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Fees</h3>

        {/* Stripe Warning */}
        {!organizerHasStripe && (
          <div className="mb-4 p-3 bg-amber-900/30 border border-amber-700 rounded-lg">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-amber-200 font-medium text-sm">Stripe Required for Fees</p>
                <p className="text-amber-300/70 text-xs mt-1">
                  To collect fees, you must connect your Stripe account in your profile settings.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Organizer Entry Fee */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Organizer Entry Fee
            </label>
            <p className="text-xs text-gray-500 mb-3">
              Fee collected by the league organizer from teams/players.
            </p>
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="entryFeeType"
                  checked={data.entryFeeType === 'none'}
                  onChange={() => handleChange('entryFeeType', 'none')}
                  className="w-5 h-5 border-gray-600 bg-gray-700 text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <span className="text-white font-medium">No entry fee</span>
                  <p className="text-xs text-gray-500">Free league, no payment required</p>
                </div>
              </label>

              <label className={`flex items-center gap-3 cursor-pointer ${!organizerHasStripe ? 'opacity-50' : ''}`}>
                <input
                  type="radio"
                  name="entryFeeType"
                  checked={data.entryFeeType === 'per_team'}
                  onChange={() => handleChange('entryFeeType', 'per_team')}
                  disabled={!organizerHasStripe}
                  className="w-5 h-5 border-gray-600 bg-gray-700 text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <span className="text-white font-medium">Team entry fee</span>
                  <p className="text-xs text-gray-500">One fee per team (captain pays)</p>
                </div>
              </label>

              <label className={`flex items-center gap-3 cursor-pointer ${!organizerHasStripe ? 'opacity-50' : ''}`}>
                <input
                  type="radio"
                  name="entryFeeType"
                  checked={data.entryFeeType === 'per_player'}
                  onChange={() => handleChange('entryFeeType', 'per_player')}
                  disabled={!organizerHasStripe}
                  className="w-5 h-5 border-gray-600 bg-gray-700 text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <span className="text-white font-medium">Per-player fee</span>
                  <p className="text-xs text-gray-500">Each player pays individually</p>
                </div>
              </label>
            </div>

            {data.entryFeeType !== 'none' && (
              <div className="mt-4 ml-8">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Amount
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formatAmount(data.entryFeeAmount)}
                    onChange={(e) => handleChange('entryFeeAmount', parseAmount(e.target.value))}
                    className="w-32 bg-gray-700 text-white p-3 rounded-lg border border-gray-600 focus:border-amber-500 outline-none"
                  />
                  <span className="text-gray-400 text-sm">
                    {data.entryFeeType === 'per_team' ? 'per team' : 'per player'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Venue Fee */}
          <div className="pt-4 border-t border-gray-700">
            <label className={`flex items-center gap-3 cursor-pointer ${!organizerHasStripe ? 'opacity-50' : ''}`}>
              <input
                type="checkbox"
                checked={data.venueFeeEnabled}
                onChange={(e) => handleChange('venueFeeEnabled', e.target.checked)}
                disabled={!organizerHasStripe}
                className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-amber-600 focus:ring-amber-500 focus:ring-offset-gray-900"
              />
              <div>
                <span className="text-white font-medium">Enable venue fee</span>
                <p className="text-xs text-gray-500">
                  Fee for court/facility usage (home team pays per fixture)
                </p>
              </div>
            </label>

            {data.venueFeeEnabled && (
              <div className="mt-4 ml-8">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Venue Fee Amount
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formatAmount(data.venueFeeAmount)}
                    onChange={(e) => handleChange('venueFeeAmount', parseAmount(e.target.value))}
                    className="w-32 bg-gray-700 text-white p-3 rounded-lg border border-gray-600 focus:border-amber-500 outline-none"
                  />
                  <span className="text-gray-400 text-sm">per fixture</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Home team pays venue fee for each fixture they host.
                </p>
              </div>
            )}
          </div>

          {/* Payment Requirement */}
          {hasAnyFees && organizerHasStripe && (
            <div className="pt-4 border-t border-gray-700">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={data.requirePaymentBeforeApproval}
                  onChange={(e) => handleChange('requirePaymentBeforeApproval', e.target.checked)}
                  className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-amber-600 focus:ring-amber-500 focus:ring-offset-gray-900"
                />
                <div>
                  <span className="text-white font-medium">Require payment before approval</span>
                  <p className="text-xs text-gray-500">
                    Teams must pay entry fee before organizer can approve their registration.
                  </p>
                </div>
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StepRoster;
