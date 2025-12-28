import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getMeetupById, updateMeetup } from '../../services/firebase';
import { LocationPicker } from './LocationPicker';
import { RollingTimePicker } from '../shared/RollingTimePicker';
import type { Meetup } from '../../types';

interface EditMeetupProps {
  meetupId: string;
  onBack: () => void;
  onSaved: () => void;
}

export const EditMeetup: React.FC<EditMeetupProps> = ({ meetupId, onBack, onSaved }) => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [meetup, setMeetup] = useState<Meetup | null>(null);
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [maxPlayers, setMaxPlayers] = useState('');
  const [locationName, setLocationName] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [visibility, setVisibility] = useState<'public' | 'linkOnly'>('public');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadMeetup = async () => {
      try {
        const m = await getMeetupById(meetupId);
        if (!m) {
          setError('Meetup not found');
          setLoading(false);
          return;
        }
        
        if (currentUser?.uid !== m.createdByUserId) {
          setError('You do not have permission to edit this meetup');
          setLoading(false);
          return;
        }
        
        setMeetup(m);
        setTitle(m.title);
        setDescription(m.description);
        
        const meetupDate = new Date(m.when);
        setDate(meetupDate.toISOString().split('T')[0]);
        setTime(meetupDate.toTimeString().slice(0, 5));
        
        setMaxPlayers(m.maxPlayers > 0 ? m.maxPlayers.toString() : '');
        setLocationName(m.locationName);
        setLat(m.location?.lat || null);
        setLng(m.location?.lng || null);
        setVisibility(m.visibility);
        
        setLoading(false);
      } catch (e) {
        console.error(e);
        setError('Failed to load meetup');
        setLoading(false);
      }
    };
    
    loadMeetup();
  }, [meetupId, currentUser]);

  const handleLocationChange = (address: string, newLat: number, newLng: number) => {
    setLocationName(address);
    setLat(newLat);
    setLng(newLng);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meetup || !currentUser) return;
    
    setError(null);
    setIsSubmitting(true);
    
    try {
      const when = new Date(date + 'T' + time).getTime();
      if (isNaN(when)) {
        setError('Invalid date/time');
        setIsSubmitting(false);
        return;
      }
      
      const updates: Partial<Meetup> = {
        title,
        description,
        when,
        visibility,
        maxPlayers: maxPlayers ? parseInt(maxPlayers, 10) : 0,
        locationName,
      };
      
      if (lat && lng) {
        updates.location = { lat, lng };
      }
      
      await updateMeetup(meetupId, updates);
      onSaved();
    } catch (err) {
      console.error(err);
      setError('Failed to save changes');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto mb-4"></div>
        Loading meetup...
      </div>
    );
  }

  if (error && !meetup) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <div className="bg-red-900/30 border border-red-800 rounded-lg p-6 text-center">
          <div className="text-red-400 text-xl mb-4">{error}</div>
          <button onClick={onBack} className="text-green-400 hover:underline">
            Back to Meetups
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <button onClick={onBack} className="text-gray-400 hover:text-white mb-4 flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>
      
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-2xl font-bold text-white mb-6">Edit Meetup</h2>
        
        {error && (
          <div className="bg-red-900/30 border border-red-800 text-red-300 p-3 rounded mb-4">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Title *</label>
            <input
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
              placeholder="e.g., Friday Social Play"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Date *</label>
              <input
                type="date"
                required
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Time *</label>
              <RollingTimePicker
                value={time}
                onChange={setTime}
                placeholder="--:-- --"
              />
            </div>
          </div>
          
          <LocationPicker
            address={locationName}
            lat={lat}
            lng={lng}
            onLocationChange={handleLocationChange}
          />
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Max Players</label>
              <input
                type="number"
                min="0"
                value={maxPlayers}
                onChange={e => setMaxPlayers(e.target.value)}
                className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                placeholder="0 = unlimited"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Visibility</label>
              <select
                value={visibility}
                onChange={e => setVisibility(e.target.value as 'public' | 'linkOnly')}
                className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
              >
                <option value="public">Public</option>
                <option value="linkOnly">Link Only</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none resize-none"
              placeholder="Tell people what to expect..."
            />
          </div>
          
          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onBack}
              className="flex-1 py-3 px-4 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3 px-4 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};