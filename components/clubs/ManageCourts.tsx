/**
 * ManageCourts Component
 * 
 * Admin interface for managing club courts, grades, pricing, and booking settings.
 * 
 * FILE LOCATION: components/clubs/ManageCourts.tsx
 */

import React, { useState, useEffect } from 'react';
import {
  subscribeToClubCourts,
  addClubCourt,
  updateClubCourt,
  deleteClubCourt,
  getClubBookingSettings,
  updateClubBookingSettings,
} from '../../services/firebase';
import type { 
  ClubCourt, 
  ClubBookingSettings, 
  CourtGrade, 
  CourtGradeConfig,
  CourtLocation,
  CourtSurface,
  CourtStatus,
} from '../../types';

// Default configurations
const DEFAULT_COURT_GRADES: Record<CourtGrade, CourtGradeConfig> = {
  standard: {
    id: 'standard',
    name: 'Standard',
    description: 'Basic outdoor courts',
    icon: '🥉',
    basePrice: 500,
    peakPrice: 800,
    weekendPrice: 600,
    memberPricing: 'discounted',
    memberDiscountPercent: 50,
    visitorPremiumPercent: 25,
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    description: 'Covered courts with quality surface',
    icon: '🥈',
    basePrice: 1000,
    peakPrice: 1400,
    weekendPrice: 1200,
    memberPricing: 'discounted',
    memberDiscountPercent: 50,
    visitorPremiumPercent: 25,
  },
  elite: {
    id: 'elite',
    name: 'Elite',
    description: 'Indoor climate-controlled courts',
    icon: '🥇',
    basePrice: 1500,
    peakPrice: 2000,
    weekendPrice: 1800,
    memberPricing: 'discounted',
    memberDiscountPercent: 30,
    visitorPremiumPercent: 50,
  },
};

const DEFAULT_SETTINGS: ClubBookingSettings = {
  enabled: false,
  currency: 'nzd',
  slotDurationMinutes: 60,
  openTime: '06:00',
  closeTime: '22:00',
  peakHours: {
    enabled: true,
    startTime: '17:00',
    endTime: '20:00',
    days: [1, 2, 3, 4, 5],
  },
  weekendPricingEnabled: true,
  courtGrades: DEFAULT_COURT_GRADES,
  useCustomGradeNames: false,
  visitors: {
    allowVisitors: true,
    visitorFeeEnabled: true,
    visitorFee: 1000,
    visitorFeeType: 'per_day',
    visitorCourtPricing: 'premium',
    visitorPremiumPercent: 25,
    requireMemberSignIn: false,
  },
  maxAdvanceBookingDays: 14,
  maxBookingsPerMemberPerDay: 2,
  cancellationMinutesBeforeSlot: 60,
  paymentMethods: {
    acceptPayAsYouGo: true,
    acceptWallet: true,
    walletTopUpAmounts: [2500, 5000, 10000],
    allowCustomTopUp: false,
    acceptAnnualPass: true,
    annualPassPrice: 20000,
    annualPassBenefit: 'unlimited',
    annualPassPriorityDays: 7,
    passFeeToCustomer: true,
  },
};

interface ManageCourtsProps {
  clubId: string;
  onBack: () => void;
}

// Helper to format cents to dollars
const formatPrice = (cents: number): string => {
  return (cents / 100).toFixed(2);
};

// Helper to parse dollars to cents
const parsePriceToCents = (value: string): number => {
  const num = parseFloat(value);
  return isNaN(num) ? 0 : Math.round(num * 100);
};

export const ManageCourts: React.FC<ManageCourtsProps> = ({ clubId, onBack }) => {
  // State
  const [courts, setCourts] = useState<ClubCourt[]>([]);
  const [settings, setSettings] = useState<ClubBookingSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'courts' | 'grades' | 'visitors' | 'payments' | 'settings'>('courts');
  const [showSuccess, setShowSuccess] = useState(false);
  
  // Court form state
  const [showCourtModal, setShowCourtModal] = useState(false);
  const [editingCourt, setEditingCourt] = useState<ClubCourt | null>(null);
  const [courtForm, setCourtForm] = useState({
    name: '',
    description: '',
    grade: 'standard' as CourtGrade,
    location: 'outdoor' as CourtLocation,
    surfaceType: 'concrete' as CourtSurface,
    useCustomPricing: false,
    customBasePrice: '',
    customPeakPrice: '',
    customWeekendPrice: '',
    hasLights: false,
    climateControlled: false,
    ballMachineAvailable: false,
    livestreamCapable: false,
    lightingFeeEnabled: false,
    lightingFeeAmount: '',
    lightingFeeAfter: '18:00',
    equipmentFeeEnabled: false,
    equipmentFeeAmount: '',
    equipmentFeeDescription: '',
  });
  const [courtError, setCourtError] = useState<string | null>(null);

  // Load settings
  useEffect(() => {
    getClubBookingSettings(clubId).then((s) => {
      if (s) {
        // Merge with defaults to ensure all fields exist
        setSettings({ ...DEFAULT_SETTINGS, ...s });
      }
    });
  }, [clubId]);

  // Subscribe to courts
  useEffect(() => {
    const unsubscribe = subscribeToClubCourts(clubId, (data) => {
      setCourts(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [clubId]);

  // Save settings
  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await updateClubBookingSettings(clubId, settings);
      setShowSuccess(true);
    } catch (e: any) {
      alert('Failed to save settings: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  // Open add court modal
  const handleAddCourt = () => {
    setEditingCourt(null);
    setCourtForm({
      name: '',
      description: '',
      grade: 'standard',
      location: 'outdoor',
      surfaceType: 'concrete',
      useCustomPricing: false,
      customBasePrice: '',
      customPeakPrice: '',
      customWeekendPrice: '',
      hasLights: false,
      climateControlled: false,
      ballMachineAvailable: false,
      livestreamCapable: false,
      lightingFeeEnabled: false,
      lightingFeeAmount: '',
      lightingFeeAfter: '18:00',
      equipmentFeeEnabled: false,
      equipmentFeeAmount: '',
      equipmentFeeDescription: '',
    });
    setCourtError(null);
    setShowCourtModal(true);
  };

  // Open edit court modal
  const handleEditCourt = (court: ClubCourt) => {
    setEditingCourt(court);
    setCourtForm({
      name: court.name,
      description: court.description || '',
      grade: court.grade || 'standard',
      location: court.location || 'outdoor',
      surfaceType: court.surfaceType || 'concrete',
      useCustomPricing: court.useCustomPricing || false,
      customBasePrice: court.customBasePrice ? formatPrice(court.customBasePrice) : '',
      customPeakPrice: court.customPeakPrice ? formatPrice(court.customPeakPrice) : '',
      customWeekendPrice: court.customWeekendPrice ? formatPrice(court.customWeekendPrice) : '',
      hasLights: court.features?.hasLights || false,
      climateControlled: court.features?.climateControlled || false,
      ballMachineAvailable: court.features?.ballMachineAvailable || false,
      livestreamCapable: court.features?.livestreamCapable || false,
      lightingFeeEnabled: court.additionalFees?.lighting?.enabled || false,
      lightingFeeAmount: court.additionalFees?.lighting?.amount ? formatPrice(court.additionalFees.lighting.amount) : '',
      lightingFeeAfter: court.additionalFees?.lighting?.appliesAfter || '18:00',
      equipmentFeeEnabled: court.additionalFees?.equipment?.enabled || false,
      equipmentFeeAmount: court.additionalFees?.equipment?.amount ? formatPrice(court.additionalFees.equipment.amount) : '',
      equipmentFeeDescription: court.additionalFees?.equipment?.description || '',
    });
    setCourtError(null);
    setShowCourtModal(true);
  };

  // Save court
  const handleSaveCourt = async () => {
    if (!courtForm.name.trim()) {
      setCourtError('Court name is required');
      return;
    }

    setSaving(true);
    setCourtError(null);

    try {
      const courtData: Partial<ClubCourt> = {
        name: courtForm.name.trim(),
        description: courtForm.description.trim() || undefined,
        grade: courtForm.grade,
        location: courtForm.location,
        surfaceType: courtForm.surfaceType,
        useCustomPricing: courtForm.useCustomPricing,
        customBasePrice: courtForm.useCustomPricing ? parsePriceToCents(courtForm.customBasePrice) : undefined,
        customPeakPrice: courtForm.useCustomPricing ? parsePriceToCents(courtForm.customPeakPrice) : undefined,
        customWeekendPrice: courtForm.useCustomPricing ? parsePriceToCents(courtForm.customWeekendPrice) : undefined,
        features: {
          hasLights: courtForm.hasLights,
          climateControlled: courtForm.climateControlled,
          ballMachineAvailable: courtForm.ballMachineAvailable,
          livestreamCapable: courtForm.livestreamCapable,
        },
        additionalFees: {
          lighting: courtForm.lightingFeeEnabled ? {
            enabled: true,
            amount: parsePriceToCents(courtForm.lightingFeeAmount),
            appliesAfter: courtForm.lightingFeeAfter,
          } : { enabled: false, amount: 0 },
          equipment: courtForm.equipmentFeeEnabled ? {
            enabled: true,
            amount: parsePriceToCents(courtForm.equipmentFeeAmount),
            description: courtForm.equipmentFeeDescription,
          } : { enabled: false, amount: 0 },
        },
        status: 'active' as CourtStatus,
      };

      if (editingCourt) {
        await updateClubCourt(clubId, editingCourt.id, courtData);
      } else {
        await addClubCourt(clubId, {
          ...courtData,
          isActive: true,
          order: courts.length + 1,
        } as any);
      }

      setShowCourtModal(false);
    } catch (e: any) {
      setCourtError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Delete court
  const handleDeleteCourt = async (court: ClubCourt) => {
    if (!confirm(`Delete ${court.name}? This cannot be undone.`)) return;

    try {
      await deleteClubCourt(clubId, court.id);
    } catch (e: any) {
      alert('Failed to delete: ' + e.message);
    }
  };

  // Update grade config
  const updateGrade = (grade: CourtGrade, updates: Partial<CourtGradeConfig>) => {
    setSettings(prev => ({
      ...prev,
      courtGrades: {
        ...prev.courtGrades,
        [grade]: { ...prev.courtGrades[grade], ...updates },
      },
    }));
  };

  // Success screen
  if (showSuccess) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 text-center">
          <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Settings Saved!</h2>
          <p className="text-gray-400 mb-6">Your court booking configuration has been updated.</p>
          
          <div className="bg-gray-700/50 rounded-lg p-4 mb-6 text-left max-w-md mx-auto">
            <h3 className="font-semibold text-white mb-2">Summary</h3>
            <div className="text-sm text-gray-300 space-y-1">
              <div>Courts: {courts.length}</div>
              <div>Booking: {settings.enabled ? 'Enabled' : 'Disabled'}</div>
              <div>Slot Duration: {settings.slotDurationMinutes} min</div>
              <div>Hours: {settings.openTime} - {settings.closeTime}</div>
            </div>
          </div>

          <div className="flex gap-3 justify-center">
            <button
              onClick={() => setShowSuccess(false)}
              className="px-5 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold"
            >
              Edit Settings
            </button>
            <button
              onClick={onBack}
              className="px-5 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-semibold"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Group courts by grade
  const courtsByGrade: Record<CourtGrade, ClubCourt[]> = {
    standard: courts.filter(c => c.grade === 'standard' || !c.grade),
    premium: courts.filter(c => c.grade === 'premium'),
    elite: courts.filter(c => c.grade === 'elite'),
  };

  return (
    <div className="max-w-6xl mx-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="text-gray-400 hover:text-white flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <h1 className="text-2xl font-bold text-white">Manage Courts & Pricing</h1>
        </div>
        <button
          onClick={handleSaveSettings}
          disabled={saving}
          className="bg-green-600 hover:bg-green-500 disabled:bg-green-800 text-white px-5 py-2 rounded-lg font-semibold flex items-center gap-2"
        >
          {saving ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          Save All Settings
        </button>
      </div>

      {/* Enable Toggle */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6 border border-gray-700 flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold">Court Booking System</h3>
          <p className="text-gray-400 text-sm">Allow members to book courts online</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
        </label>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-800/50 p-1 rounded-lg overflow-x-auto">
        {[
          { id: 'courts', label: 'Courts', count: courts.length },
          { id: 'grades', label: 'Grades & Pricing' },
          { id: 'visitors', label: 'Visitors' },
          { id: 'payments', label: 'Payments' },
          { id: 'settings', label: 'Settings' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 rounded-md text-sm font-semibold whitespace-nowrap transition-colors flex items-center gap-2 ${
              activeTab === tab.id
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="bg-gray-600 text-gray-300 text-xs px-1.5 py-0.5 rounded">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Courts Tab */}
      {activeTab === 'courts' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-white">Your Courts</h2>
            <button
              onClick={handleAddCourt}
              className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg font-semibold flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Court
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-400">Loading courts...</div>
          ) : courts.length === 0 ? (
            <div className="bg-gray-800 rounded-lg p-8 text-center border border-gray-700">
              <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <h3 className="text-xl font-bold text-white mb-2">No Courts Yet</h3>
              <p className="text-gray-400 mb-4">Add your first court to start accepting bookings.</p>
              <button
                onClick={handleAddCourt}
                className="bg-green-600 hover:bg-green-500 text-white px-5 py-2 rounded-lg font-semibold"
              >
                Add First Court
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Group by grade */}
              {(['standard', 'premium', 'elite'] as CourtGrade[]).map((grade) => {
                const gradeCourts = courtsByGrade[grade];
                if (gradeCourts.length === 0) return null;
                
                const gradeConfig = settings.courtGrades[grade];
                
                return (
                  <div key={grade} className="space-y-3">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <span>{gradeConfig.icon}</span>
                      <span>{gradeConfig.name}</span>
                      <span className="text-sm font-normal text-gray-400">
                        From ${formatPrice(gradeConfig.basePrice)}/slot
                      </span>
                    </h3>
                    
                    <div className="grid gap-3">
                      {gradeCourts.map((court) => (
                        <div
                          key={court.id}
                          className="bg-gray-800 rounded-lg p-4 border border-gray-700 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-4">
                            <div className="text-2xl">{gradeConfig.icon}</div>
                            <div>
                              <h4 className="font-semibold text-white">{court.name}</h4>
                              <div className="text-sm text-gray-400 flex items-center gap-2">
                                <span className="capitalize">{court.location || 'outdoor'}</span>
                                <span>•</span>
                                <span className="capitalize">{court.surfaceType || 'concrete'}</span>
                                {court.useCustomPricing && (
                                  <>
                                    <span>•</span>
                                    <span className="text-yellow-400">
                                      Custom: ${formatPrice(court.customBasePrice || 0)}
                                    </span>
                                  </>
                                )}
                                {court.additionalFees?.lighting?.enabled && (
                                  <>
                                    <span>•</span>
                                    <span className="text-blue-400">
                                      +${formatPrice(court.additionalFees.lighting.amount)} lights
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleEditCourt(court)}
                              className="text-gray-400 hover:text-white p-2"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteCourt(court)}
                              className="text-gray-400 hover:text-red-400 p-2"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Grades & Pricing Tab */}
      {activeTab === 'grades' && (
        <div className="space-y-6">
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">
              Configure pricing for each court grade. Individual courts can override these prices.
            </p>
          </div>

          {(['standard', 'premium', 'elite'] as CourtGrade[]).map((grade) => {
            const config = settings.courtGrades[grade];
            
            return (
              <div key={grade} className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                <div className="bg-gray-700/50 px-4 py-3 flex items-center gap-3">
                  <span className="text-2xl">{config.icon}</span>
                  <div className="flex-1">
                    <input
                      type="text"
                      value={config.name}
                      onChange={(e) => updateGrade(grade, { name: e.target.value })}
                      className="bg-transparent text-white font-bold text-lg focus:outline-none border-b border-transparent focus:border-green-500"
                    />
                    <input
                      type="text"
                      value={config.description}
                      onChange={(e) => updateGrade(grade, { description: e.target.value })}
                      className="block bg-transparent text-gray-400 text-sm focus:outline-none border-b border-transparent focus:border-green-500 w-full"
                      placeholder="Description..."
                    />
                  </div>
                </div>
                
                <div className="p-4 space-y-4">
                  {/* Prices */}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Base Price</label>
                      <div className="flex items-center">
                        <span className="text-gray-500 mr-1">$</span>
                        <input
                          type="number"
                          step="0.50"
                          value={formatPrice(config.basePrice)}
                          onChange={(e) => updateGrade(grade, { basePrice: parsePriceToCents(e.target.value) })}
                          className="bg-gray-900 text-white px-3 py-2 rounded border border-gray-600 focus:border-green-500 outline-none w-24"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Peak Price</label>
                      <div className="flex items-center">
                        <span className="text-gray-500 mr-1">$</span>
                        <input
                          type="number"
                          step="0.50"
                          value={formatPrice(config.peakPrice)}
                          onChange={(e) => updateGrade(grade, { peakPrice: parsePriceToCents(e.target.value) })}
                          className="bg-gray-900 text-white px-3 py-2 rounded border border-gray-600 focus:border-green-500 outline-none w-24"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Weekend Price</label>
                      <div className="flex items-center">
                        <span className="text-gray-500 mr-1">$</span>
                        <input
                          type="number"
                          step="0.50"
                          value={formatPrice(config.weekendPrice)}
                          onChange={(e) => updateGrade(grade, { weekendPrice: parsePriceToCents(e.target.value) })}
                          className="bg-gray-900 text-white px-3 py-2 rounded border border-gray-600 focus:border-green-500 outline-none w-24"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Member Pricing */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Member Pricing</label>
                    <div className="flex gap-4">
                      {(['free', 'discounted', 'full'] as const).map((option) => (
                        <label key={option} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name={`member-${grade}`}
                            checked={config.memberPricing === option}
                            onChange={() => updateGrade(grade, { memberPricing: option })}
                            className="text-green-600"
                          />
                          <span className="text-white capitalize">{option === 'full' ? 'Full Price' : option}</span>
                        </label>
                      ))}
                      {config.memberPricing === 'discounted' && (
                        <div className="flex items-center gap-1 ml-4">
                          <input
                            type="number"
                            value={config.memberDiscountPercent || 0}
                            onChange={(e) => updateGrade(grade, { memberDiscountPercent: parseInt(e.target.value) || 0 })}
                            className="bg-gray-900 text-white px-2 py-1 rounded border border-gray-600 w-16 text-center"
                          />
                          <span className="text-gray-400">% off</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Visitor Premium */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Visitor Premium</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={config.visitorPremiumPercent}
                        onChange={(e) => updateGrade(grade, { visitorPremiumPercent: parseInt(e.target.value) || 0 })}
                        className="bg-gray-900 text-white px-2 py-1 rounded border border-gray-600 w-16 text-center"
                      />
                      <span className="text-gray-400">% extra for visitors</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Peak Hours Config */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Peak Hours</h3>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.peakHours.enabled}
                  onChange={(e) => setSettings({
                    ...settings,
                    peakHours: { ...settings.peakHours, enabled: e.target.checked }
                  })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600"></div>
              </label>
            </div>
            
            {settings.peakHours.enabled && (
              <div className="space-y-4">
                <div className="flex gap-4 items-center">
                  <input
                    type="time"
                    value={settings.peakHours.startTime}
                    onChange={(e) => setSettings({
                      ...settings,
                      peakHours: { ...settings.peakHours, startTime: e.target.value }
                    })}
                    className="bg-gray-900 text-white px-3 py-2 rounded border border-gray-600"
                  />
                  <span className="text-gray-400">to</span>
                  <input
                    type="time"
                    value={settings.peakHours.endTime}
                    onChange={(e) => setSettings({
                      ...settings,
                      peakHours: { ...settings.peakHours, endTime: e.target.value }
                    })}
                    className="bg-gray-900 text-white px-3 py-2 rounded border border-gray-600"
                  />
                </div>
                
                <div className="flex gap-2 flex-wrap">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => {
                    const dayNum = idx + 1;
                    const isSelected = settings.peakHours.days.includes(dayNum);
                    return (
                      <button
                        key={day}
                        onClick={() => {
                          const newDays = isSelected
                            ? settings.peakHours.days.filter(d => d !== dayNum)
                            : [...settings.peakHours.days, dayNum];
                          setSettings({
                            ...settings,
                            peakHours: { ...settings.peakHours, days: newDays }
                          });
                        }}
                        className={`px-3 py-1 rounded text-sm font-medium ${
                          isSelected
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Visitors Tab */}
      {activeTab === 'visitors' && (
        <div className="space-y-6">
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-white font-semibold">Allow Visitors</h3>
                <p className="text-gray-400 text-sm">Non-members can book courts</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.visitors.allowVisitors}
                  onChange={(e) => setSettings({
                    ...settings,
                    visitors: { ...settings.visitors, allowVisitors: e.target.checked }
                  })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
              </label>
            </div>
          </div>

          {settings.visitors.allowVisitors && (
            <>
              {/* Visitor Fee */}
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-white font-semibold">Visitor Fee</h3>
                    <p className="text-gray-400 text-sm">One-time fee for facility access</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.visitors.visitorFeeEnabled}
                      onChange={(e) => setSettings({
                        ...settings,
                        visitors: { ...settings.visitors, visitorFeeEnabled: e.target.checked }
                      })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600"></div>
                  </label>
                </div>

                {settings.visitors.visitorFeeEnabled && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Amount</label>
                        <div className="flex items-center">
                          <span className="text-gray-500 mr-1">$</span>
                          <input
                            type="number"
                            step="0.50"
                            value={formatPrice(settings.visitors.visitorFee)}
                            onChange={(e) => setSettings({
                              ...settings,
                              visitors: { ...settings.visitors, visitorFee: parsePriceToCents(e.target.value) }
                            })}
                            className="bg-gray-900 text-white px-3 py-2 rounded border border-gray-600 w-24"
                          />
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Charged</label>
                        <select
                          value={settings.visitors.visitorFeeType}
                          onChange={(e) => setSettings({
                            ...settings,
                            visitors: { ...settings.visitors, visitorFeeType: e.target.value as any }
                          })}
                          className="bg-gray-900 text-white px-3 py-2 rounded border border-gray-600"
                        >
                          <option value="per_day">Once per day</option>
                          <option value="per_booking">Per booking</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Visitor Court Pricing */}
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                <h3 className="text-white font-semibold mb-4">Visitor Court Rates</h3>
                
                <div className="space-y-3">
                  {[
                    { value: 'same', label: 'Same as members', desc: 'Visitors pay standard rates' },
                    { value: 'premium', label: 'Premium rate', desc: 'Add percentage on top' },
                    { value: 'custom', label: 'Custom price', desc: 'Fixed price for visitors' },
                  ].map((option) => (
                    <label key={option.value} className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-700/50">
                      <input
                        type="radio"
                        name="visitorPricing"
                        checked={settings.visitors.visitorCourtPricing === option.value}
                        onChange={() => setSettings({
                          ...settings,
                          visitors: { ...settings.visitors, visitorCourtPricing: option.value as any }
                        })}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="text-white font-medium">{option.label}</div>
                        <div className="text-gray-400 text-sm">{option.desc}</div>
                      </div>
                      
                      {option.value === 'premium' && settings.visitors.visitorCourtPricing === 'premium' && (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={settings.visitors.visitorPremiumPercent || 25}
                            onChange={(e) => setSettings({
                              ...settings,
                              visitors: { ...settings.visitors, visitorPremiumPercent: parseInt(e.target.value) || 0 }
                            })}
                            className="bg-gray-900 text-white px-2 py-1 rounded border border-gray-600 w-16 text-center"
                          />
                          <span className="text-gray-400">%</span>
                        </div>
                      )}
                      
                      {option.value === 'custom' && settings.visitors.visitorCourtPricing === 'custom' && (
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500">$</span>
                          <input
                            type="number"
                            step="0.50"
                            value={formatPrice(settings.visitors.visitorCustomPrice || 0)}
                            onChange={(e) => setSettings({
                              ...settings,
                              visitors: { ...settings.visitors, visitorCustomPrice: parsePriceToCents(e.target.value) }
                            })}
                            className="bg-gray-900 text-white px-2 py-1 rounded border border-gray-600 w-20"
                          />
                        </div>
                      )}
                    </label>
                  ))}
                </div>
              </div>

              {/* Member Sign-in Requirement */}
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex items-center justify-between">
                <div>
                  <h3 className="text-white font-semibold">Require Member Sign-in</h3>
                  <p className="text-gray-400 text-sm">Visitors must be signed in by a member</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.visitors.requireMemberSignIn}
                    onChange={(e) => setSettings({
                      ...settings,
                      visitors: { ...settings.visitors, requireMemberSignIn: e.target.checked }
                    })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600"></div>
                </label>
              </div>
            </>
          )}
        </div>
      )}

      {/* Payments Tab */}
      {activeTab === 'payments' && (
        <div className="space-y-6">
          {/* Payment Methods */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
            <h3 className="text-white font-semibold mb-4">Payment Methods</h3>
            
            <div className="space-y-4">
              {/* Pay as you go */}
              <label className="flex items-center justify-between p-3 rounded-lg bg-gray-700/30 cursor-pointer">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">💳</span>
                  <div>
                    <div className="text-white font-medium">Pay-as-you-go</div>
                    <div className="text-gray-400 text-sm">Card payment at checkout</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.paymentMethods.acceptPayAsYouGo}
                  onChange={(e) => setSettings({
                    ...settings,
                    paymentMethods: { ...settings.paymentMethods, acceptPayAsYouGo: e.target.checked }
                  })}
                  className="w-5 h-5 rounded text-green-600"
                />
              </label>

              {/* Wallet */}
              <label className="flex items-center justify-between p-3 rounded-lg bg-gray-700/30 cursor-pointer">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">👛</span>
                  <div>
                    <div className="text-white font-medium">Prepaid Wallet</div>
                    <div className="text-gray-400 text-sm">Members load credit, pay instantly</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.paymentMethods.acceptWallet}
                  onChange={(e) => setSettings({
                    ...settings,
                    paymentMethods: { ...settings.paymentMethods, acceptWallet: e.target.checked }
                  })}
                  className="w-5 h-5 rounded text-green-600"
                />
              </label>

              {settings.paymentMethods.acceptWallet && (
                <div className="ml-12 p-3 bg-gray-900/50 rounded-lg">
                  <label className="block text-sm text-gray-400 mb-2">Top-up Amounts</label>
                  <div className="flex gap-2 flex-wrap">
                    {[25, 50, 100, 150, 200].map((amount) => {
                      const cents = amount * 100;
                      const isSelected = settings.paymentMethods.walletTopUpAmounts.includes(cents);
                      return (
                        <button
                          key={amount}
                          onClick={() => {
                            const newAmounts = isSelected
                              ? settings.paymentMethods.walletTopUpAmounts.filter(a => a !== cents)
                              : [...settings.paymentMethods.walletTopUpAmounts, cents].sort((a, b) => a - b);
                            setSettings({
                              ...settings,
                              paymentMethods: { ...settings.paymentMethods, walletTopUpAmounts: newAmounts }
                            });
                          }}
                          className={`px-3 py-1 rounded text-sm font-medium ${
                            isSelected
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                          }`}
                        >
                          ${amount}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Annual Pass */}
              <label className="flex items-center justify-between p-3 rounded-lg bg-gray-700/30 cursor-pointer">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">💎</span>
                  <div>
                    <div className="text-white font-medium">Annual Pass</div>
                    <div className="text-gray-400 text-sm">Yearly fee for unlimited/discounted access</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.paymentMethods.acceptAnnualPass}
                  onChange={(e) => setSettings({
                    ...settings,
                    paymentMethods: { ...settings.paymentMethods, acceptAnnualPass: e.target.checked }
                  })}
                  className="w-5 h-5 rounded text-green-600"
                />
              </label>

              {settings.paymentMethods.acceptAnnualPass && (
                <div className="ml-12 p-3 bg-gray-900/50 rounded-lg space-y-4">
                  <div className="flex items-center gap-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Annual Pass Price</label>
                      <div className="flex items-center">
                        <span className="text-gray-500 mr-1">$</span>
                        <input
                          type="number"
                          step="10"
                          value={formatPrice(settings.paymentMethods.annualPassPrice || 0)}
                          onChange={(e) => setSettings({
                            ...settings,
                            paymentMethods: { ...settings.paymentMethods, annualPassPrice: parsePriceToCents(e.target.value) }
                          })}
                          className="bg-gray-900 text-white px-3 py-2 rounded border border-gray-600 w-28"
                        />
                        <span className="text-gray-400 ml-2">/year</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Pass Benefit</label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={settings.paymentMethods.annualPassBenefit === 'unlimited'}
                          onChange={() => setSettings({
                            ...settings,
                            paymentMethods: { ...settings.paymentMethods, annualPassBenefit: 'unlimited' }
                          })}
                        />
                        <span className="text-white">Unlimited free bookings</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={settings.paymentMethods.annualPassBenefit === 'discounted'}
                          onChange={() => setSettings({
                            ...settings,
                            paymentMethods: { ...settings.paymentMethods, annualPassBenefit: 'discounted' }
                          })}
                        />
                        <span className="text-white">Discounted rate</span>
                      </label>
                      {settings.paymentMethods.annualPassBenefit === 'discounted' && (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={settings.paymentMethods.annualPassDiscountPercent || 50}
                            onChange={(e) => setSettings({
                              ...settings,
                              paymentMethods: { ...settings.paymentMethods, annualPassDiscountPercent: parseInt(e.target.value) || 0 }
                            })}
                            className="bg-gray-900 text-white px-2 py-1 rounded border border-gray-600 w-16 text-center"
                          />
                          <span className="text-gray-400">% off</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Processing Fee */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
            <h3 className="text-white font-semibold mb-4">Processing Fee</h3>
            <p className="text-gray-400 text-sm mb-4">Who pays the Stripe processing fee (2.9% + $0.30)?</p>
            
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  checked={settings.paymentMethods.passFeeToCustomer}
                  onChange={() => setSettings({
                    ...settings,
                    paymentMethods: { ...settings.paymentMethods, passFeeToCustomer: true }
                  })}
                />
                <div>
                  <div className="text-white font-medium">Customer pays</div>
                  <div className="text-gray-400 text-sm">Fee added to total at checkout</div>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  checked={!settings.paymentMethods.passFeeToCustomer}
                  onChange={() => setSettings({
                    ...settings,
                    paymentMethods: { ...settings.paymentMethods, passFeeToCustomer: false }
                  })}
                />
                <div>
                  <div className="text-white font-medium">Club absorbs</div>
                  <div className="text-gray-400 text-sm">Fee deducted from club's earnings</div>
                </div>
              </label>
            </div>
          </div>

          {/* Stripe Connection */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
            <h3 className="text-white font-semibold mb-4">Payment Account</h3>
            
            {settings.stripeAccountId ? (
              <div className="flex items-center gap-3 p-3 bg-green-900/30 rounded-lg border border-green-700">
                <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <div className="text-white font-medium">Stripe Connected</div>
                  <div className="text-gray-400 text-sm">You can receive payments</div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-gray-400 mb-4">Connect your bank account to receive payments</p>
                <button className="bg-purple-600 hover:bg-purple-500 text-white px-5 py-2 rounded-lg font-semibold">
                  Connect with Stripe
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          {/* Time Settings */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
            <h3 className="text-white font-semibold mb-4">Booking Hours</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Opens</label>
                <input
                  type="time"
                  value={settings.openTime}
                  onChange={(e) => setSettings({ ...settings, openTime: e.target.value })}
                  className="bg-gray-900 text-white px-3 py-2 rounded border border-gray-600 w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Closes</label>
                <input
                  type="time"
                  value={settings.closeTime}
                  onChange={(e) => setSettings({ ...settings, closeTime: e.target.value })}
                  className="bg-gray-900 text-white px-3 py-2 rounded border border-gray-600 w-full"
                />
              </div>
            </div>
          </div>

          {/* Slot Duration */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
            <h3 className="text-white font-semibold mb-4">Slot Duration</h3>
            
            <div className="flex gap-3">
              {[30, 60, 90].map((mins) => (
                <button
                  key={mins}
                  onClick={() => setSettings({ ...settings, slotDurationMinutes: mins as any })}
                  className={`px-4 py-2 rounded-lg font-medium ${
                    settings.slotDurationMinutes === mins
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {mins} min
                </button>
              ))}
            </div>
          </div>

          {/* Booking Rules */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
            <h3 className="text-white font-semibold mb-4">Booking Rules</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Advance Booking (days)</label>
                <input
                  type="number"
                  value={settings.maxAdvanceBookingDays}
                  onChange={(e) => setSettings({ ...settings, maxAdvanceBookingDays: parseInt(e.target.value) || 7 })}
                  className="bg-gray-900 text-white px-3 py-2 rounded border border-gray-600 w-24"
                />
                <span className="text-gray-400 ml-2 text-sm">days in advance</span>
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">Daily Limit</label>
                <input
                  type="number"
                  value={settings.maxBookingsPerMemberPerDay}
                  onChange={(e) => setSettings({ ...settings, maxBookingsPerMemberPerDay: parseInt(e.target.value) || 1 })}
                  className="bg-gray-900 text-white px-3 py-2 rounded border border-gray-600 w-24"
                />
                <span className="text-gray-400 ml-2 text-sm">bookings per member per day</span>
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">Cancellation Window</label>
                <input
                  type="number"
                  value={settings.cancellationMinutesBeforeSlot}
                  onChange={(e) => setSettings({ ...settings, cancellationMinutesBeforeSlot: parseInt(e.target.value) || 60 })}
                  className="bg-gray-900 text-white px-3 py-2 rounded border border-gray-600 w-24"
                />
                <span className="text-gray-400 ml-2 text-sm">minutes before slot</span>
              </div>
            </div>
          </div>

          {/* Currency */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
            <h3 className="text-white font-semibold mb-4">Currency</h3>
            
            <select
              value={settings.currency}
              onChange={(e) => setSettings({ ...settings, currency: e.target.value as any })}
              className="bg-gray-900 text-white px-3 py-2 rounded border border-gray-600"
            >
              <option value="nzd">NZD - New Zealand Dollar</option>
              <option value="aud">AUD - Australian Dollar</option>
              <option value="usd">USD - US Dollar</option>
            </select>
          </div>
        </div>
      )}

      {/* Court Modal */}
      {showCourtModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">
                {editingCourt ? 'Edit Court' : 'Add Court'}
              </h2>
              <button
                onClick={() => setShowCourtModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 space-y-4">
              {courtError && (
                <div className="bg-red-900/50 border border-red-700 text-red-200 p-3 rounded text-sm">
                  {courtError}
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Court Name *</label>
                <input
                  type="text"
                  value={courtForm.name}
                  onChange={(e) => setCourtForm({ ...courtForm, name: e.target.value })}
                  placeholder="e.g., Court 1 - Championship"
                  className="w-full bg-gray-900 text-white px-3 py-2 rounded border border-gray-600 focus:border-green-500 outline-none"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Description</label>
                <input
                  type="text"
                  value={courtForm.description}
                  onChange={(e) => setCourtForm({ ...courtForm, description: e.target.value })}
                  placeholder="e.g., Indoor court with pro surface"
                  className="w-full bg-gray-900 text-white px-3 py-2 rounded border border-gray-600 focus:border-green-500 outline-none"
                />
              </div>

              {/* Grade Selection */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Court Grade</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['standard', 'premium', 'elite'] as CourtGrade[]).map((grade) => {
                    const config = settings.courtGrades[grade];
                    return (
                      <button
                        key={grade}
                        onClick={() => setCourtForm({ ...courtForm, grade })}
                        className={`p-3 rounded-lg border text-center ${
                          courtForm.grade === grade
                            ? 'border-green-500 bg-green-900/30'
                            : 'border-gray-600 hover:border-gray-500'
                        }`}
                      >
                        <div className="text-2xl mb-1">{config.icon}</div>
                        <div className="text-white font-medium text-sm">{config.name}</div>
                        <div className="text-gray-400 text-xs">${formatPrice(config.basePrice)}/slot</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Pricing */}
              <div className="p-3 bg-gray-700/30 rounded-lg">
                <label className="flex items-center gap-2 cursor-pointer mb-3">
                  <input
                    type="checkbox"
                    checked={courtForm.useCustomPricing}
                    onChange={(e) => setCourtForm({ ...courtForm, useCustomPricing: e.target.checked })}
                    className="rounded text-green-600"
                  />
                  <span className="text-white font-medium">Override grade pricing</span>
                </label>

                {courtForm.useCustomPricing && (
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Base</label>
                      <div className="flex items-center">
                        <span className="text-gray-500 mr-1 text-sm">$</span>
                        <input
                          type="number"
                          step="0.50"
                          value={courtForm.customBasePrice}
                          onChange={(e) => setCourtForm({ ...courtForm, customBasePrice: e.target.value })}
                          className="bg-gray-900 text-white px-2 py-1 rounded border border-gray-600 w-full text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Peak</label>
                      <div className="flex items-center">
                        <span className="text-gray-500 mr-1 text-sm">$</span>
                        <input
                          type="number"
                          step="0.50"
                          value={courtForm.customPeakPrice}
                          onChange={(e) => setCourtForm({ ...courtForm, customPeakPrice: e.target.value })}
                          className="bg-gray-900 text-white px-2 py-1 rounded border border-gray-600 w-full text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Weekend</label>
                      <div className="flex items-center">
                        <span className="text-gray-500 mr-1 text-sm">$</span>
                        <input
                          type="number"
                          step="0.50"
                          value={courtForm.customWeekendPrice}
                          onChange={(e) => setCourtForm({ ...courtForm, customWeekendPrice: e.target.value })}
                          className="bg-gray-900 text-white px-2 py-1 rounded border border-gray-600 w-full text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Location & Surface */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Location</label>
                  <select
                    value={courtForm.location}
                    onChange={(e) => setCourtForm({ ...courtForm, location: e.target.value as any })}
                    className="w-full bg-gray-900 text-white px-3 py-2 rounded border border-gray-600"
                  >
                    <option value="outdoor">Outdoor</option>
                    <option value="covered">Covered</option>
                    <option value="indoor">Indoor</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Surface</label>
                  <select
                    value={courtForm.surfaceType}
                    onChange={(e) => setCourtForm({ ...courtForm, surfaceType: e.target.value as any })}
                    className="w-full bg-gray-900 text-white px-3 py-2 rounded border border-gray-600"
                  >
                    <option value="concrete">Concrete</option>
                    <option value="asphalt">Asphalt</option>
                    <option value="cushioned">Cushioned</option>
                    <option value="wood">Wood</option>
                    <option value="synthetic">Synthetic</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              {/* Features */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Features</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'hasLights', label: '💡 Lighting' },
                    { key: 'climateControlled', label: '❄️ Climate Controlled' },
                    { key: 'ballMachineAvailable', label: '🎾 Ball Machine' },
                    { key: 'livestreamCapable', label: '📹 Livestream' },
                  ].map((feature) => (
                    <label key={feature.key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(courtForm as any)[feature.key]}
                        onChange={(e) => setCourtForm({ ...courtForm, [feature.key]: e.target.checked })}
                        className="rounded text-green-600"
                      />
                      <span className="text-white text-sm">{feature.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Additional Fees */}
              <div className="p-3 bg-gray-700/30 rounded-lg space-y-3">
                <h4 className="text-white font-medium">Additional Fees</h4>

                {/* Lighting Fee */}
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={courtForm.lightingFeeEnabled}
                      onChange={(e) => setCourtForm({ ...courtForm, lightingFeeEnabled: e.target.checked })}
                      className="rounded text-green-600"
                    />
                    <span className="text-white text-sm">Lighting fee</span>
                  </label>
                  {courtForm.lightingFeeEnabled && (
                    <div className="mt-2 ml-6 flex items-center gap-2">
                      <span className="text-gray-400 text-sm">$</span>
                      <input
                        type="number"
                        step="0.50"
                        value={courtForm.lightingFeeAmount}
                        onChange={(e) => setCourtForm({ ...courtForm, lightingFeeAmount: e.target.value })}
                        className="bg-gray-900 text-white px-2 py-1 rounded border border-gray-600 w-16 text-sm"
                      />
                      <span className="text-gray-400 text-sm">after</span>
                      <input
                        type="time"
                        value={courtForm.lightingFeeAfter}
                        onChange={(e) => setCourtForm({ ...courtForm, lightingFeeAfter: e.target.value })}
                        className="bg-gray-900 text-white px-2 py-1 rounded border border-gray-600 text-sm"
                      />
                    </div>
                  )}
                </div>

                {/* Equipment Fee */}
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={courtForm.equipmentFeeEnabled}
                      onChange={(e) => setCourtForm({ ...courtForm, equipmentFeeEnabled: e.target.checked })}
                      className="rounded text-green-600"
                    />
                    <span className="text-white text-sm">Equipment hire</span>
                  </label>
                  {courtForm.equipmentFeeEnabled && (
                    <div className="mt-2 ml-6 flex items-center gap-2">
                      <span className="text-gray-400 text-sm">$</span>
                      <input
                        type="number"
                        step="0.50"
                        value={courtForm.equipmentFeeAmount}
                        onChange={(e) => setCourtForm({ ...courtForm, equipmentFeeAmount: e.target.value })}
                        className="bg-gray-900 text-white px-2 py-1 rounded border border-gray-600 w-16 text-sm"
                      />
                      <input
                        type="text"
                        value={courtForm.equipmentFeeDescription}
                        onChange={(e) => setCourtForm({ ...courtForm, equipmentFeeDescription: e.target.value })}
                        placeholder="Description"
                        className="bg-gray-900 text-white px-2 py-1 rounded border border-gray-600 flex-1 text-sm"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-700 flex gap-3 justify-end">
              <button
                onClick={() => setShowCourtModal(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCourt}
                disabled={saving}
                className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-green-800 text-white rounded-lg font-medium flex items-center gap-2"
              >
                {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {editingCourt ? 'Update Court' : 'Add Court'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageCourts;