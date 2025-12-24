/**
 * Scoreboard Page
 *
 * Route: /scoreboard/:eventId
 * Multi-court live scoreboard for venues.
 *
 * FILE: pages/ScoreboardPage.tsx
 * VERSION: V06.03
 */

import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { MultiCourtScoreboard } from '../components/scoring';
import { getScoreboardConfig, saveScoreboardConfig } from '../services/firebase/liveScores';
import type { ScoreboardConfig, ScoreboardLayout } from '../types/scoring';

// Placeholder functions to get event details
// TODO: Replace with actual event service calls
const getEventDetails = async (eventId: string, eventType: string) => {
  // This would fetch from tournaments, leagues, or meetups collections
  return {
    name: 'Live Scoreboard',
    organizerId: '',
  };
};

const ScoreboardPage: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const [eventName, setEventName] = useState('Live Scoreboard');
  const [eventType, setEventType] = useState<'tournament' | 'league' | 'meetup'>('tournament');
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [config, setConfig] = useState<ScoreboardConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // Get event type from query params or default to tournament
  const typeParam = searchParams.get('type') as 'tournament' | 'league' | 'meetup' | null;

  useEffect(() => {
    if (!eventId) {
      setLoading(false);
      return;
    }

    const loadEvent = async () => {
      const type = typeParam || 'tournament';
      setEventType(type);

      try {
        // Load event details
        const event = await getEventDetails(eventId, type);
        setEventName(event.name);
        setIsOrganizer(user?.uid === event.organizerId);

        // Load scoreboard config if exists
        const savedConfig = await getScoreboardConfig(eventId);
        if (savedConfig) {
          setConfig(savedConfig);
        }
      } catch (err) {
        console.error('Error loading event:', err);
      } finally {
        setLoading(false);
      }
    };

    loadEvent();
  }, [eventId, typeParam, user]);

  // Handle config changes from organizer
  const handleConfigChange = async (updates: Partial<ScoreboardConfig>) => {
    if (!eventId || !isOrganizer) return;

    const newConfig: ScoreboardConfig = {
      eventId,
      eventName,
      courts: config?.courts || [],
      layout: config?.layout || 'grid',
      showUpNext: config?.showUpNext ?? true,
      theme: config?.theme || 'dark',
      updatedAt: Date.now(),
      ...updates,
    };

    try {
      await saveScoreboardConfig(newConfig);
      setConfig(newConfig);
    } catch (err) {
      console.error('Error saving config:', err);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full mx-auto mb-4" />
          <div className="text-gray-400">Loading scoreboard...</div>
        </div>
      </div>
    );
  }

  // No event ID
  if (!eventId) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🏓</div>
          <div className="text-xl font-bold text-white mb-2">No Event Specified</div>
          <div className="text-gray-400">Please provide an event ID to view the scoreboard.</div>
        </div>
      </div>
    );
  }

  // Scoreboard display
  return (
    <MultiCourtScoreboard
      eventId={eventId}
      eventType={eventType}
      eventName={eventName}
      layout={config?.layout || 'grid'}
      courts={config?.courts?.length ? config.courts : 'all'}
      theme={config?.theme || 'dark'}
      showHeader={true}
      isOrganizer={isOrganizer}
      onConfigChange={handleConfigChange}
      autoRotateSeconds={config?.autoRotateSeconds || 10}
      logoUrl={config?.logoUrl}
    />
  );
};

export default ScoreboardPage;
