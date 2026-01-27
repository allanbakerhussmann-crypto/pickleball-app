/**
 * TeamLeagueOrganizerPanel Component
 *
 * Admin panel for league organizers with:
 * - Status management (Publish, Open/Close Registration, Start, Complete)
 * - Sub-tabs for Schedule, Teams, Fixtures, Settings
 *
 * FILE LOCATION: components/teamLeague/TeamLeagueOrganizerPanel.tsx
 * VERSION: V07.56
 */

import React, { useState } from 'react';
import {
  generateTeamLeagueSchedule,
  updateTeamLeagueStatus,
  approveTeam,
  rejectTeam,
  type TeamLeagueStatus,
} from '../../services/firebase/teamLeague';
import type { League } from '../../types';
import type {
  InterclubTeam,
  TeamLeagueFixture,
  TeamLeagueSettings,
} from '../../types/teamLeague';
import { InfoTooltip } from '../shared/InfoTooltip';

// ============================================
// TYPES
// ============================================

interface TeamLeagueOrganizerPanelProps {
  league: League;
  teams: InterclubTeam[];
  fixtures: TeamLeagueFixture[];
  settings: TeamLeagueSettings;
  onRefresh: () => void;
  onDelete?: () => void;
}

type OrganizerTab = 'schedule' | 'teams' | 'fixtures' | 'settings';

// ============================================
// COMPONENT
// ============================================

export const TeamLeagueOrganizerPanel: React.FC<TeamLeagueOrganizerPanelProps> = ({
  league,
  teams,
  fixtures,
  settings,
  onRefresh,
  onDelete,
}) => {
  const [activeTab, setActiveTab] = useState<OrganizerTab>('schedule');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusConfirm, setStatusConfirm] = useState<TeamLeagueStatus | null>(null);
  const [processingTeamId, setProcessingTeamId] = useState<string | null>(null);

  // Get approved teams only
  const approvedTeams = teams.filter(t =>
    t.status === 'approved_paid' || t.status === 'approved'
  );

  // ============================================
  // STATUS MANAGEMENT
  // ============================================

  const handleStatusChange = async (newStatus: TeamLeagueStatus) => {
    console.log('[TeamLeagueOrganizerPanel] handleStatusChange called', {
      currentStatus: league.status,
      newStatus,
      leagueId: league.id,
    });

    setUpdatingStatus(true);
    setError(null);
    setSuccess(null);

    try {
      console.log('[TeamLeagueOrganizerPanel] Calling updateTeamLeagueStatus...');
      await updateTeamLeagueStatus(league.id, newStatus);
      console.log('[TeamLeagueOrganizerPanel] Status updated successfully, calling onRefresh...');
      setSuccess(`League status updated to "${newStatus.replace(/_/g, ' ')}"`);
      setStatusConfirm(null);
      await onRefresh();
      console.log('[TeamLeagueOrganizerPanel] onRefresh completed');
    } catch (err) {
      console.error('[TeamLeagueOrganizerPanel] Error updating status:', err);
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const getStatusBadge = (status: TeamLeagueStatus) => {
    switch (status) {
      case 'draft':
        return { label: 'Draft', color: 'bg-gray-600 text-gray-200', icon: '📝' };
      case 'published':
        return { label: 'Published', color: 'bg-cyan-600 text-cyan-100', icon: '👁️' };
      case 'registration':
        return { label: 'Registration Open', color: 'bg-blue-600 text-blue-100', icon: '📋' };
      case 'registration_closed':
        return { label: 'Registration Closed', color: 'bg-amber-600 text-amber-100', icon: '🔒' };
      case 'active':
        return { label: 'Active', color: 'bg-lime-600 text-lime-100', icon: '🏆' };
      case 'completed':
        return { label: 'Completed', color: 'bg-purple-600 text-purple-100', icon: '✅' };
      case 'cancelled':
        return { label: 'Cancelled', color: 'bg-red-600 text-red-100', icon: '❌' };
      default:
        return { label: status, color: 'bg-gray-600 text-gray-200', icon: '❓' };
    }
  };

  const renderStatusActionBar = () => {
    const status = league.status as TeamLeagueStatus;
    const badge = getStatusBadge(status);

    return (
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Current Status */}
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-sm">Current Status:</span>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${badge.color}`}>
              {badge.icon} {badge.label}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            {/* Draft → Publish (make visible) */}
            {status === 'draft' && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setStatusConfirm('published')}
                  disabled={updatingStatus}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  Publish League
                </button>
                <InfoTooltip text="Make the league visible to players. They can view league details but cannot register yet." />
              </div>
            )}

            {/* Published → Back to Draft or Open Registration */}
            {status === 'published' && (
              <>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setStatusConfirm('draft')}
                    disabled={updatingStatus}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 15l-3-3m0 0l3-3m-3 3h8M3 12a9 9 0 1118 0 9 9 0 01-18 0z" />
                    </svg>
                    Back to Draft
                  </button>
                  <InfoTooltip text="Return to draft mode. The league will be hidden from players." />
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setStatusConfirm('registration')}
                    disabled={updatingStatus}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                    </svg>
                    Open Registration
                  </button>
                  <InfoTooltip text="Allow team captains to register their teams. The 'Register Your Team' button will appear for players." />
                </div>
              </>
            )}

            {/* Registration → Back to Draft, Close Registration, or Lock */}
            {status === 'registration' && (
              <>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setStatusConfirm('draft')}
                    disabled={updatingStatus}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 15l-3-3m0 0l3-3m-3 3h8M3 12a9 9 0 1118 0 9 9 0 01-18 0z" />
                    </svg>
                    Back to Draft
                  </button>
                  <InfoTooltip text="Return to draft mode. The league will be hidden and registration disabled." />
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setStatusConfirm('published')}
                    disabled={updatingStatus}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                    Close Registration
                  </button>
                  <InfoTooltip text="Stop accepting new team registrations but keep the league visible. Teams can still view details." />
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setStatusConfirm('registration_closed')}
                    disabled={updatingStatus}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Lock Registration
                  </button>
                  <InfoTooltip text="Lock registration and prepare to start. You can still approve pending teams, then generate the schedule." />
                </div>
              </>
            )}

            {/* Registration Closed → Reopen or Start */}
            {status === 'registration_closed' && (
              <>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setStatusConfirm('registration')}
                    disabled={updatingStatus}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                    </svg>
                    Reopen Registration
                  </button>
                  <InfoTooltip text="Allow new teams to register again. Use this if you need more teams." />
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setStatusConfirm('active')}
                    disabled={updatingStatus || approvedTeams.length < 2}
                    className="px-4 py-2 bg-lime-600 hover:bg-lime-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Start League
                  </button>
                  <InfoTooltip text="Begin the season! Captains can submit lineups and enter scores. Make sure you've generated the schedule first." />
                </div>
              </>
            )}

            {/* Active → Complete */}
            {status === 'active' && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setStatusConfirm('completed')}
                  disabled={updatingStatus}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Complete League
                </button>
                <InfoTooltip text="End the season and finalize standings. No more scores can be entered after this." />
              </div>
            )}

            {/* Completed badge - no actions */}
            {status === 'completed' && (
              <span className="text-gray-400 text-sm italic">League has ended</span>
            )}
          </div>
        </div>

        {/* Warnings */}
        {status === 'registration_closed' && approvedTeams.length < 2 && (
          <p className="text-amber-400 text-sm mt-3">
            Need at least 2 approved teams to start the league.
          </p>
        )}
      </div>
    );
  };

  // Confirmation modal for status changes
  const renderStatusConfirmModal = () => {
    if (!statusConfirm) return null;

    const messages: Record<TeamLeagueStatus, { title: string; message: string; color: string }> = {
      published: {
        title: 'Publish League',
        message: 'This will make the league visible to everyone. Teams will NOT be able to register yet until you open registration.',
        color: 'bg-cyan-600 hover:bg-cyan-500',
      },
      registration: {
        title: 'Open Registration',
        message: 'This will allow teams to register for the league. Are you sure?',
        color: 'bg-blue-600 hover:bg-blue-500',
      },
      registration_closed: {
        title: 'Lock Registration',
        message: 'This will prevent new teams from registering and lock the team list. You can reopen registration later if needed.',
        color: 'bg-amber-600 hover:bg-amber-500',
      },
      active: {
        title: 'Start League',
        message: `This will start the league with ${approvedTeams.length} approved teams. Make sure your schedule is generated.`,
        color: 'bg-lime-600 hover:bg-lime-500',
      },
      completed: {
        title: 'Complete League',
        message: 'This will mark the league as completed. Final standings will be locked.',
        color: 'bg-purple-600 hover:bg-purple-500',
      },
      draft: {
        title: 'Return to Draft',
        message: 'This will unpublish the league and return it to draft status. The league will no longer be visible to others.',
        color: 'bg-gray-600 hover:bg-gray-500',
      },
      cancelled: {
        title: 'Cancel League',
        message: 'This will cancel the league. This action cannot be undone.',
        color: 'bg-red-600 hover:bg-red-500',
      },
    };

    const config = messages[statusConfirm];

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
        <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-md p-6">
          <h3 className="text-lg font-bold text-white mb-2">{config.title}</h3>
          <p className="text-gray-400 mb-6">{config.message}</p>

          <div className="flex gap-3">
            <button
              onClick={() => setStatusConfirm(null)}
              disabled={updatingStatus}
              className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={() => handleStatusChange(statusConfirm)}
              disabled={updatingStatus}
              className={`flex-1 px-4 py-2 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${config.color}`}
            >
              {updatingStatus ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Updating...
                </>
              ) : (
                'Confirm'
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Schedule generation
  const handleGenerateSchedule = async () => {
    if (approvedTeams.length < 2) {
      setError('Need at least 2 approved teams to generate a schedule.');
      return;
    }

    setGenerating(true);
    setError(null);
    setSuccess(null);

    try {
      // Format start date as string if it's a timestamp
      const startDate = typeof league.seasonStart === 'number'
        ? new Date(league.seasonStart).toISOString().split('T')[0]
        : league.seasonStart || new Date().toISOString().split('T')[0];

      const generatedFixtures = await generateTeamLeagueSchedule(
        league.id,
        {
          startDate,
          dayOfWeek: 6, // Saturday = 6
          defaultTime: '10:00',
        },
        league.createdByUserId,
        'Organizer'
      );

      setSuccess(`Generated ${generatedFixtures.length} fixtures successfully!`);
      onRefresh();
    } catch (err) {
      console.error('Error generating schedule:', err);
      setError('Failed to generate schedule. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  // ============================================
  // TEAM APPROVAL/REJECTION
  // ============================================

  const handleApproveTeam = async (teamId: string, teamName: string) => {
    console.log('[TeamLeagueOrganizerPanel] handleApproveTeam called', {
      leagueId: league.id,
      teamId,
      teamName,
    });

    setProcessingTeamId(teamId);
    setError(null);
    setSuccess(null);

    try {
      console.log('[TeamLeagueOrganizerPanel] Calling approveTeam...');
      await approveTeam(league.id, teamId);
      console.log('[TeamLeagueOrganizerPanel] Team approved successfully');
      setSuccess(`Team "${teamName}" has been approved!`);
      // Note: onRefresh is not needed since we're subscribed to real-time updates
    } catch (err) {
      console.error('[TeamLeagueOrganizerPanel] Error approving team:', err);
      setError(err instanceof Error ? err.message : 'Failed to approve team');
    } finally {
      setProcessingTeamId(null);
    }
  };

  const handleRejectTeam = async (teamId: string, teamName: string) => {
    console.log('[TeamLeagueOrganizerPanel] handleRejectTeam called', {
      leagueId: league.id,
      teamId,
      teamName,
    });

    setProcessingTeamId(teamId);
    setError(null);
    setSuccess(null);

    try {
      console.log('[TeamLeagueOrganizerPanel] Calling rejectTeam...');
      await rejectTeam(league.id, teamId);
      console.log('[TeamLeagueOrganizerPanel] Team rejected successfully');
      setSuccess(`Team "${teamName}" has been rejected.`);
    } catch (err) {
      console.error('[TeamLeagueOrganizerPanel] Error rejecting team:', err);
      setError(err instanceof Error ? err.message : 'Failed to reject team');
    } finally {
      setProcessingTeamId(null);
    }
  };

  // ============================================
  // RENDER FUNCTIONS
  // ============================================

  const renderScheduleTab = () => (
    <div className="space-y-6">
      {/* Schedule Overview */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
        <h3 className="text-lg font-semibold text-white mb-4">Schedule Overview</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-gray-700/30 rounded-lg">
            <div className="text-2xl font-bold text-white">{fixtures.length}</div>
            <div className="text-xs text-gray-400">Total Fixtures</div>
          </div>
          <div className="text-center p-3 bg-gray-700/30 rounded-lg">
            <div className="text-2xl font-bold text-lime-400">
              {fixtures.filter(f => f.status === 'completed').length}
            </div>
            <div className="text-xs text-gray-400">Completed</div>
          </div>
          <div className="text-center p-3 bg-gray-700/30 rounded-lg">
            <div className="text-2xl font-bold text-amber-400">
              {fixtures.filter(f => f.status === 'in_progress').length}
            </div>
            <div className="text-xs text-gray-400">In Progress</div>
          </div>
          <div className="text-center p-3 bg-gray-700/30 rounded-lg">
            <div className="text-2xl font-bold text-gray-300">
              {fixtures.filter(f => f.status === 'scheduled' || f.status === 'lineups_submitted').length}
            </div>
            <div className="text-xs text-gray-400">Upcoming</div>
          </div>
        </div>
      </div>

      {/* Generate Schedule */}
      {fixtures.length === 0 && (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
          <h3 className="text-lg font-semibold text-white mb-4">Generate Schedule</h3>
          <p className="text-gray-400 mb-4">
            Generate a round-robin schedule for all approved teams. Each team will play
            each other team once (home and away if configured).
          </p>

          <div className="bg-gray-700/30 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Approved Teams</span>
              <span className="text-white font-medium">{approvedTeams.length}</span>
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-gray-300">Fixtures to Generate</span>
              <span className="text-white font-medium">
                {approvedTeams.length * (approvedTeams.length - 1) / 2}
              </span>
            </div>
          </div>

          <button
            onClick={handleGenerateSchedule}
            disabled={generating || approvedTeams.length < 2}
            className={`
              w-full px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2
              transition-colors
              ${generating || approvedTeams.length < 2
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-lime-600 hover:bg-lime-500 text-white'
              }
            `}
          >
            {generating ? (
              <>
                <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Generating...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Generate Schedule
              </>
            )}
          </button>

          {approvedTeams.length < 2 && (
            <p className="text-amber-400 text-sm mt-2 text-center">
              Need at least 2 approved teams to generate a schedule.
            </p>
          )}
        </div>
      )}

      {/* Messages */}
      {error && (
        <div className="bg-red-900/30 border border-red-600/50 text-red-300 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-lime-900/30 border border-lime-600/50 text-lime-300 px-4 py-3 rounded-lg">
          {success}
        </div>
      )}
    </div>
  );

  const renderTeamsTab = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Team Management</h3>
        <span className="text-sm text-gray-400">
          {teams.length} total, {approvedTeams.length} approved
        </span>
      </div>

      {/* Pending approvals */}
      {teams.filter(t => t.status === 'pending_approval').length > 0 && (
        <div className="bg-amber-900/20 border border-amber-600/30 rounded-xl p-4">
          <h4 className="text-amber-400 font-medium mb-3">Pending Approvals</h4>
          <div className="space-y-2">
            {teams.filter(t => t.status === 'pending_approval').map(team => (
              <div key={team.id} className="flex items-center justify-between bg-gray-800/50 rounded-lg p-3">
                <div>
                  <div className="text-white font-medium">{team.name}</div>
                  <div className="text-sm text-gray-400">Captain: {team.captainName}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApproveTeam(team.id, team.name)}
                    disabled={processingTeamId === team.id}
                    className="px-3 py-1.5 bg-lime-600 hover:bg-lime-500 text-white text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    {processingTeamId === team.id ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Processing...
                      </>
                    ) : (
                      'Approve'
                    )}
                  </button>
                  <button
                    onClick={() => handleRejectTeam(team.id, team.name)}
                    disabled={processingTeamId === team.id}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All teams */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 divide-y divide-gray-700/50">
        {teams.map(team => (
          <div key={team.id} className="p-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-medium">{team.name}</span>
                <span className={`px-2 py-0.5 text-xs rounded-full ${
                  team.status === 'approved_paid' ? 'bg-lime-600/20 text-lime-400' :
                  team.status === 'approved' ? 'bg-blue-600/20 text-blue-400' :
                  team.status === 'pending_approval' ? 'bg-amber-600/20 text-amber-400' :
                  team.status === 'withdrawn' ? 'bg-red-600/20 text-red-400' :
                  'bg-gray-600/20 text-gray-400'
                }`}>
                  {team.status.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="text-sm text-gray-400 mt-0.5">
                Captain: {team.captainName} | Roster: {team.roster.length} players
              </div>
            </div>
            <button className="p-2 text-gray-400 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  const renderFixturesTab = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">Fixture Management</h3>

      {/* Fixtures needing attention */}
      {fixtures.filter(f => f.scoreState === 'disputed').length > 0 && (
        <div className="bg-red-900/20 border border-red-600/30 rounded-xl p-4">
          <h4 className="text-red-400 font-medium mb-3">Disputed Scores</h4>
          <div className="space-y-2">
            {fixtures.filter(f => f.scoreState === 'disputed').map(fixture => (
              <div key={fixture.id} className="bg-gray-800/50 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-white">{fixture.homeTeamName}</span>
                    <span className="text-gray-500 mx-2">vs</span>
                    <span className="text-white">{fixture.awayTeamName}</span>
                  </div>
                  <button className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded-lg">
                    Resolve
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fixtures awaiting finalization */}
      {fixtures.filter(f => f.scoreState === 'signed' && f.status !== 'completed').length > 0 && (
        <div className="bg-blue-900/20 border border-blue-600/30 rounded-xl p-4">
          <h4 className="text-blue-400 font-medium mb-3">Ready to Finalize</h4>
          <div className="space-y-2">
            {fixtures.filter(f => f.scoreState === 'signed' && f.status !== 'completed').map(fixture => (
              <div key={fixture.id} className="bg-gray-800/50 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-white">{fixture.homeTeamName}</span>
                    <span className="text-gray-500 mx-2">vs</span>
                    <span className="text-white">{fixture.awayTeamName}</span>
                  </div>
                  <button className="px-3 py-1.5 bg-lime-600 hover:bg-lime-500 text-white text-sm rounded-lg">
                    Finalize
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {fixtures.length === 0 && (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-6 text-center">
          <p className="text-gray-400">No fixtures yet. Generate a schedule to create fixtures.</p>
        </div>
      )}
    </div>
  );

  // Format date helper
  const formatDate = (dateVal?: string | number | null): string => {
    if (!dateVal) return 'TBD';
    const date = typeof dateVal === 'number' ? new Date(dateVal) : new Date(dateVal);
    return date.toLocaleDateString('en-NZ', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const renderSettingsTab = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-white">League Settings</h3>

      {/* Season & Schedule Overview */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
        <h4 className="text-white font-medium mb-3 flex items-center gap-2">
          <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Season & Schedule
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <span className="text-gray-400 text-sm">Start Date</span>
            <div className="text-white font-medium">{formatDate(league.seasonStart)}</div>
          </div>
          <div>
            <span className="text-gray-400 text-sm">End Date</span>
            <div className="text-white font-medium">{formatDate(league.seasonEnd)}</div>
          </div>
          <div>
            <span className="text-gray-400 text-sm">Max Teams</span>
            <div className="text-white font-medium">{settings.maxTeams || 'Unlimited'}</div>
          </div>
          <div>
            <span className="text-gray-400 text-sm">Number of Weeks</span>
            <div className="text-white font-medium">{settings.numberOfWeeks || 'N/A'}</div>
          </div>
        </div>
        {settings.scheduleType && (
          <div className="mt-3 pt-3 border-t border-gray-700/50">
            <span className="text-gray-400 text-sm">Schedule Type: </span>
            <span className="text-white font-medium capitalize">{settings.scheduleType.replace(/_/g, ' ')}</span>
          </div>
        )}
        {settings.defaultMatchDay !== undefined && settings.defaultMatchTime && (
          <div className="mt-2">
            <span className="text-gray-400 text-sm">Default Match Day: </span>
            <span className="text-white font-medium">
              {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][settings.defaultMatchDay]}s at {settings.defaultMatchTime}
            </span>
          </div>
        )}
      </div>

      {/* Board Configuration */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
        <h4 className="text-white font-medium mb-3">Board Configuration</h4>
        <div className="space-y-2">
          {settings.boards.map((board, idx) => (
            <div key={board.id} className="flex items-center justify-between bg-gray-700/30 rounded-lg p-3">
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 bg-gray-600 rounded-full flex items-center justify-center text-sm text-gray-300">
                  {idx + 1}
                </span>
                <span className="text-white">{board.name}</span>
                <span className="text-xs text-gray-400">({board.format})</span>
              </div>
              <span className="text-sm text-gray-400">{board.pointValue || 1} pt</span>
            </div>
          ))}
        </div>
      </div>

      {/* Scoring Settings */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
        <h4 className="text-white font-medium mb-3">Scoring</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-gray-400 text-sm">Points per Board Win</span>
            <div className="text-white font-medium">{settings.pointsPerBoardWin}</div>
          </div>
          <div>
            <span className="text-gray-400 text-sm">Points per Match Win</span>
            <div className="text-white font-medium">{settings.pointsPerMatchWin}</div>
          </div>
        </div>
      </div>

      {/* Roster Settings */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
        <h4 className="text-white font-medium mb-3">Roster</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-gray-400 text-sm">Min Players</span>
            <div className="text-white font-medium">{settings.minPlayersPerTeam}</div>
          </div>
          <div>
            <span className="text-gray-400 text-sm">Max Players</span>
            <div className="text-white font-medium">{settings.maxPlayersPerTeam}</div>
          </div>
          <div>
            <span className="text-gray-400 text-sm">Lineup Lock</span>
            <div className="text-white font-medium">{settings.lineupLockMinutesBeforeMatch} min before match</div>
          </div>
          <div>
            <span className="text-gray-400 text-sm">DUPR Mode</span>
            <div className="text-white font-medium capitalize">{settings.duprMode || 'None'}</div>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      {onDelete && (
        <div className="bg-red-900/20 rounded-xl border border-red-800/50 p-5">
          <h4 className="text-red-400 font-medium mb-3 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Danger Zone
          </h4>
          <p className="text-gray-400 text-sm mb-4">
            Deleting this league will remove all teams, fixtures, and standings. This action cannot be undone.
          </p>
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors"
            >
              Delete League
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await onDelete();
                  } finally {
                    setDeleting(false);
                  }
                }}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Yes, Delete Forever'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ============================================
  // MAIN RENDER
  // ============================================

  return (
    <div className="space-y-4">
      {/* Status Action Bar */}
      {renderStatusActionBar()}

      {/* Status Confirmation Modal */}
      {renderStatusConfirmModal()}

      {/* Organizer tabs */}
      <div className="flex gap-2 border-b border-gray-700/50 pb-2 overflow-x-auto">
        {(['schedule', 'teams', 'fixtures', 'settings'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`
              px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors
              ${activeTab === tab
                ? 'bg-lime-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }
            `}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'schedule' && renderScheduleTab()}
      {activeTab === 'teams' && renderTeamsTab()}
      {activeTab === 'fixtures' && renderFixturesTab()}
      {activeTab === 'settings' && renderSettingsTab()}
    </div>
  );
};

export default TeamLeagueOrganizerPanel;
