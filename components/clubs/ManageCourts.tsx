/**
 * ManageCourts Component
 * 
 * Admin interface for managing club courts and booking settings
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
import type { ClubCourt, ClubBookingSettings } from '../../types';

interface ManageCourtsProps {
  clubId: string;
  onBack: () => void;
}

export const ManageCourts: React.FC<ManageCourtsProps> = ({ clubId, onBack }) => {
  const [courts, setCourts] = useState<ClubCourt[]>([]);
  const [settings, setSettings] = useState<ClubBookingSettings>({
    enabled: false,
    slotDurationMinutes: 60,
    openTime: '06:00',
    closeTime: '22:00',
    maxAdvanceBookingDays: 14,
    maxBookingsPerMemberPerDay: 2,
    cancellationMinutesBeforeSlot: 60,
    allowNonMembers: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'courts' | 'settings'>('courts');
  const [showSuccess, setShowSuccess] = useState(false);
  
  // Court form
  const [editingCourt, setEditingCourt] = useState<ClubCourt | null>(null);
  const [courtForm, setCourtForm] = useState({ name: '', description: '' });
  const [courtError, setCourtError] = useState<string | null>(null);

  // Load settings
  useEffect(() => {
    getClubBookingSettings(clubId).then((s) => {
      if (s) setSettings(s);
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

  // Handle add/edit court
  const handleSaveCourt = async () => {
    if (!courtForm.name.trim()) {
      setCourtError('Court name is required');
      return;
    }
    
    setCourtError(null);
    setSaving(true);
    
    try {
      if (editingCourt) {
        await updateClubCourt(clubId, editingCourt.id, {
          name: courtForm.name.trim(),
          description: courtForm.description.trim() || null,
        });
      } else {
        await addClubCourt(clubId, {
          name: courtForm.name.trim(),
          description: courtForm.description.trim() || null,
          isActive: true,
          order: courts.length + 1,
        });
      }
      
      setCourtForm({ name: '', description: '' });
      setEditingCourt(null);
    } catch (e: any) {
      setCourtError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Handle delete court (simplified - no booking check to avoid index issues)
  const handleDeleteCourt = async (court: ClubCourt) => {
    if (!confirm(`Delete ${court.name}? This cannot be undone.`)) return;
    
    try {
      await deleteClubCourt(clubId, court.id);
    } catch (e: any) {
      alert(e.message);
    }
  };

  // Handle toggle court active
  const handleToggleCourt = async (court: ClubCourt) => {
    await updateClubCourt(clubId, court.id, { isActive: !court.isActive });
  };

  // Handle save settings
  const handleSaveSettings = async () => {
    setSaving(true);
    
    try {
      await updateClubBookingSettings(clubId, settings);
      setShowSuccess(true);
    } catch (e: any) {
      alert('Error saving settings: ' + e.message);
      setSaving(false);
    }
  };

  // Start editing a court
  const startEdit = (court: ClubCourt) => {
    setEditingCourt(court);
    setCourtForm({ name: court.name, description: court.description || '' });
    setCourtError(null);
  };

  // Cancel editing
  const cancelEdit = () => {
    setEditingCourt(null);
    setCourtForm({ name: '', description: '' });
    setCourtError(null);
  };

  // Success Screen
  if (showSuccess) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 text-center">
          {/* Success Icon */}
          <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          
          <h2 className="text-2xl font-bold text-white mb-2">Settings Saved!</h2>
          <p className="text-gray-400 mb-6">
            {settings.enabled 
              ? 'Court booking is now enabled. Members can start booking courts.'
              : 'Your settings have been saved. Enable booking when ready.'}
          </p>
          
          {/* Court Summary */}
          {courts.length > 0 && (
            <div className="bg-gray-900/50 rounded-lg p-4 mb-6 text-left">
              <div className="text-sm text-gray-400 mb-2">Courts configured:</div>
              <div className="flex flex-wrap gap-2">
                {courts.filter(c => c.isActive).map(court => (
                  <span key={court.id} className="bg-blue-900/50 text-blue-400 px-3 py-1 rounded text-sm">
                    {court.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Settings Summary */}
          <div className="bg-gray-900/50 rounded-lg p-4 mb-6 text-left text-sm">
            <div className="grid grid-cols-2 gap-2 text-gray-400">
              <span>Hours:</span>
              <span className="text-white">{settings.openTime} - {settings.closeTime}</span>
              <span>Slot Duration:</span>
              <span className="text-white">{settings.slotDurationMinutes} min</span>
              <span>Advance Booking:</span>
              <span className="text-white">{settings.maxAdvanceBookingDays} days</span>
              <span>Daily Limit:</span>
              <span className="text-white">{settings.maxBookingsPerMemberPerDay} bookings</span>
              <span>Who Can Book:</span>
              <span className="text-white">{settings.allowNonMembers ? 'Anyone' : 'Members Only'}</span>
            </div>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={() => setShowSuccess(false)}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-semibold"
            >
              Edit Settings
            </button>
            <button
              onClick={onBack}
              className="flex-1 bg-green-600 hover:bg-green-500 text-white py-3 rounded-lg font-semibold"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button onClick={onBack} className="flex items-center gap-2 text-gray-400 hover:text-white mb-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Club
        </button>
        <h1 className="text-2xl font-bold text-white">Manage Courts</h1>
        <p className="text-gray-400 text-sm">Configure courts and booking settings</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-gray-700">
        <button
          onClick={() => setActiveTab('courts')}
          className={`pb-3 px-1 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'courts'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          Courts ({courts.length})
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`pb-3 px-1 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'settings'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          Booking Settings
        </button>
      </div>

      {/* Courts Tab */}
      {activeTab === 'courts' && (
        <div className="space-y-6">
          {/* Add/Edit Court Form */}
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h2 className="text-lg font-bold text-white mb-4">
              {editingCourt ? 'Edit Court' : 'Add New Court'}
            </h2>
            
            {courtError && (
              <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-2 rounded-lg mb-4 text-sm">
                {courtError}
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  Court Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={courtForm.name}
                  onChange={(e) => setCourtForm({ ...courtForm, name: e.target.value })}
                  placeholder="e.g., Court 1"
                  className="w-full bg-gray-900 text-white p-3 rounded-lg border border-gray-600 focus:border-blue-500 outline-none"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  value={courtForm.description}
                  onChange={(e) => setCourtForm({ ...courtForm, description: e.target.value })}
                  placeholder="e.g., Indoor, with lights"
                  className="w-full bg-gray-900 text-white p-3 rounded-lg border border-gray-600 focus:border-blue-500 outline-none"
                />
              </div>
              
              <div className="flex gap-3">
                {editingCourt && (
                  <button
                    onClick={cancelEdit}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={handleSaveCourt}
                  disabled={saving || !courtForm.name.trim()}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded-lg font-semibold"
                >
                  {saving ? 'Saving...' : editingCourt ? 'Update Court' : 'Add Court'}
                </button>
              </div>
            </div>
          </div>

          {/* Courts List */}
          <div className="bg-gray-800 rounded-xl border border-gray-700">
            <div className="p-4 border-b border-gray-700">
              <h2 className="text-lg font-bold text-white">Your Courts</h2>
            </div>
            
            {courts.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                No courts added yet. Add your first court above.
              </div>
            ) : (
              <div className="divide-y divide-gray-700">
                {courts.map((court) => (
                  <div key={court.id} className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${court.isActive ? 'bg-green-500' : 'bg-gray-500'}`} />
                      <div>
                        <div className="font-semibold text-white">{court.name}</div>
                        {court.description && (
                          <div className="text-sm text-gray-500">{court.description}</div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleCourt(court)}
                        className={`px-3 py-1 rounded text-xs font-semibold ${
                          court.isActive
                            ? 'bg-green-900/50 text-green-400 hover:bg-green-900'
                            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                        }`}
                      >
                        {court.isActive ? 'Active' : 'Inactive'}
                      </button>
                      <button
                        onClick={() => startEdit(court)}
                        className="p-2 text-gray-400 hover:text-white"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteCourt(court)}
                        className="p-2 text-gray-400 hover:text-red-400"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Next Step Prompt */}
          {courts.length > 0 && (
            <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                <div>
                  <span className="text-blue-200">Courts added! </span>
                  <button 
                    onClick={() => setActiveTab('settings')}
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    Configure booking settings →
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 space-y-6">
          {/* Enable Booking */}
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-white">Enable Court Booking</div>
              <div className="text-sm text-gray-500">Allow members to book courts</div>
            </div>
            <button
              onClick={() => setSettings({ ...settings, enabled: !settings.enabled })}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                settings.enabled ? 'bg-green-600' : 'bg-gray-600'
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  settings.enabled ? 'left-7' : 'left-1'
                }`}
              />
            </button>
          </div>

          <hr className="border-gray-700" />

          {/* Who Can Book */}
          <div>
            <h3 className="font-semibold text-white mb-3">Who Can Book</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="bookingAccess"
                  checked={!settings.allowNonMembers}
                  onChange={() => setSettings({ ...settings, allowNonMembers: false })}
                  className="w-4 h-4 text-green-600"
                />
                <div>
                  <div className="text-white font-medium">Members Only</div>
                  <div className="text-sm text-gray-500">Only club members can book courts</div>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="bookingAccess"
                  checked={settings.allowNonMembers}
                  onChange={() => setSettings({ ...settings, allowNonMembers: true })}
                  className="w-4 h-4 text-green-600"
                />
                <div>
                  <div className="text-white font-medium">Public</div>
                  <div className="text-sm text-gray-500">Anyone with an account can book (good for public facilities)</div>
                </div>
              </label>
            </div>
          </div>

          <hr className="border-gray-700" />

          {/* Operating Hours */}
          <div>
            <h3 className="font-semibold text-white mb-3">Operating Hours</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Open Time</label>
                <input
                  type="time"
                  value={settings.openTime}
                  onChange={(e) => setSettings({ ...settings, openTime: e.target.value })}
                  className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Close Time</label>
                <input
                  type="time"
                  value={settings.closeTime}
                  onChange={(e) => setSettings({ ...settings, closeTime: e.target.value })}
                  className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"
                />
              </div>
            </div>
          </div>

          {/* Slot Duration */}
          <div>
            <label className="block font-semibold text-white mb-2">Slot Duration</label>
            <select
              value={settings.slotDurationMinutes}
              onChange={(e) => setSettings({ ...settings, slotDurationMinutes: parseInt(e.target.value) as 30 | 60 | 90 | 120 })}
              className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600"
            >
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
              <option value={90}>1.5 hours</option>
              <option value={120}>2 hours</option>
            </select>
          </div>

          {/* Booking Rules */}
          <div>
            <h3 className="font-semibold text-white mb-3">Booking Rules</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Advance Booking (days)
                </label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={settings.maxAdvanceBookingDays}
                  onChange={(e) => setSettings({ ...settings, maxAdvanceBookingDays: parseInt(e.target.value) || 14 })}
                  className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"
                />
                <p className="text-xs text-gray-500 mt-1">How far ahead members can book</p>
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Max Bookings Per Day (per member)
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={settings.maxBookingsPerMemberPerDay}
                  onChange={(e) => setSettings({ ...settings, maxBookingsPerMemberPerDay: parseInt(e.target.value) || 2 })}
                  className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Cancellation Window (minutes before)
                </label>
                <input
                  type="number"
                  min={0}
                  max={1440}
                  value={settings.cancellationMinutesBeforeSlot}
                  onChange={(e) => setSettings({ ...settings, cancellationMinutesBeforeSlot: parseInt(e.target.value) || 60 })}
                  className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"
                />
                <p className="text-xs text-gray-500 mt-1">Members must cancel at least this many minutes before</p>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="pt-4 border-t border-gray-700">
            <button
              onClick={handleSaveSettings}
              disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white py-3 rounded-lg font-semibold"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageCourts;