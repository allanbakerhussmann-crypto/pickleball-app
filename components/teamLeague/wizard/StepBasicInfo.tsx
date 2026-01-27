/**
 * StepBasicInfo Component
 *
 * Step 1: Basic league information (name, dates, location).
 *
 * FILE LOCATION: components/teamLeague/wizard/StepBasicInfo.tsx
 * VERSION: V07.54
 */

import React from 'react';

// Country and region data
const COUNTRIES = [
  { code: 'NZL', name: 'New Zealand' },
  { code: 'AUS', name: 'Australia' },
  { code: 'USA', name: 'United States' },
  { code: 'GBR', name: 'United Kingdom' },
  { code: 'CAN', name: 'Canada' },
].sort((a, b) => a.name.localeCompare(b.name));

const COUNTRY_REGIONS: Record<string, string[]> = {
  NZL: ['Northland', 'Auckland', 'Waikato', 'Bay of Plenty', 'Wellington', 'Canterbury', 'Otago'],
  AUS: ['New South Wales', 'Victoria', 'Queensland', 'Western Australia', 'South Australia'],
  USA: ['California', 'Texas', 'Florida', 'New York', 'Arizona', 'Colorado'],
  GBR: ['England', 'Scotland', 'Wales', 'Northern Ireland'],
  CAN: ['Ontario', 'British Columbia', 'Alberta', 'Quebec'],
};

export interface BasicInfoData {
  name: string;
  description: string;
  startDate: string;
  country: string;
  region: string;
  venue: string;
}

interface StepBasicInfoProps {
  data: BasicInfoData;
  onChange: (data: BasicInfoData) => void;
  errors: Record<string, string>;
}

export const StepBasicInfo: React.FC<StepBasicInfoProps> = ({
  data,
  onChange,
  errors,
}) => {
  const handleChange = (field: keyof BasicInfoData, value: string) => {
    onChange({ ...data, [field]: value });
  };

  const regions = COUNTRY_REGIONS[data.country] || [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Basic Information</h2>
        <p className="text-gray-400 text-sm">Set up the basic details for your team league.</p>
      </div>

      {/* League Name */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          League Name <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={data.name}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder="e.g., Auckland Interclub League 2025"
          className={`
            w-full bg-gray-800 text-white p-3 rounded-lg border
            ${errors.name ? 'border-red-500' : 'border-gray-600'}
            focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none
          `}
        />
        {errors.name && <p className="mt-1 text-sm text-red-400">{errors.name}</p>}
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Description
        </label>
        <textarea
          value={data.description}
          onChange={(e) => handleChange('description', e.target.value)}
          placeholder="Brief description of the league..."
          rows={3}
          className="w-full bg-gray-800 text-white p-3 rounded-lg border border-gray-600 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none resize-none"
        />
      </div>

      {/* Start Date */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Start Date <span className="text-red-400">*</span>
        </label>
        <input
          type="date"
          value={data.startDate}
          onChange={(e) => handleChange('startDate', e.target.value)}
          className={`
            w-full md:w-1/2 bg-gray-800 text-white p-3 rounded-lg border
            ${errors.startDate ? 'border-red-500' : 'border-gray-600'}
            focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none
          `}
        />
        {errors.startDate && <p className="mt-1 text-sm text-red-400">{errors.startDate}</p>}
        <p className="mt-1 text-xs text-gray-500">End date will be calculated based on number of weeks in the schedule</p>
      </div>

      {/* Location */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Location
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Country</label>
            <select
              value={data.country}
              onChange={(e) => {
                handleChange('country', e.target.value);
                handleChange('region', ''); // Reset region when country changes
              }}
              className="w-full bg-gray-800 text-white p-3 rounded-lg border border-gray-600 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
            >
              {COUNTRIES.map(c => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Region</label>
            <select
              value={data.region}
              onChange={(e) => handleChange('region', e.target.value)}
              className="w-full bg-gray-800 text-white p-3 rounded-lg border border-gray-600 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
            >
              <option value="">Select region...</option>
              {regions.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Venue */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Default Venue
        </label>
        <input
          type="text"
          value={data.venue}
          onChange={(e) => handleChange('venue', e.target.value)}
          placeholder="e.g., Various Club Venues"
          className="w-full bg-gray-800 text-white p-3 rounded-lg border border-gray-600 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
        />
        <p className="mt-1 text-xs text-gray-500">Individual fixtures can have different venues</p>
      </div>
    </div>
  );
};

export default StepBasicInfo;
