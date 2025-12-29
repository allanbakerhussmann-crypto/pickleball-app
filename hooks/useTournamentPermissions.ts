/**
 * useTournamentPermissions Hook
 *
 * Centralized permission checking for tournament management.
 * Supports owner, app admin, and tournament staff roles.
 *
 * Permission Levels:
 * 1. Owner/App Admin (isFullAdmin): Full control
 * 2. Staff (isStaff): Court operations, scoring only
 * 3. Player: Participates in matches
 *
 * @version 06.19
 * @file hooks/useTournamentPermissions.ts
 */

import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { Tournament } from '../types';

export interface TournamentPermissions {
  /** Can change tournament settings, status, divisions */
  canManageSettings: boolean;
  /** Can add/remove teams, manage registrations */
  canManageTeams: boolean;
  /** Can add/remove staff members */
  canManageStaff: boolean;
  /** Can assign matches to courts */
  canAssignCourts: boolean;
  /** Can start matches (change status to in_progress) */
  canStartMatches: boolean;
  /** Can enter/complete scores for any match */
  canEnterScores: boolean;
  /** Can view admin dashboard (admin view toggle) */
  canViewAdminDashboard: boolean;
  /** Is tournament owner or app admin (full control) */
  isFullAdmin: boolean;
  /** Is staff member (not owner/admin) */
  isStaff: boolean;
}

/**
 * Create a permissions object with all false values
 */
function createNoPermissions(): TournamentPermissions {
  return {
    canManageSettings: false,
    canManageTeams: false,
    canManageStaff: false,
    canAssignCourts: false,
    canStartMatches: false,
    canEnterScores: false,
    canViewAdminDashboard: false,
    isFullAdmin: false,
    isStaff: false,
  };
}

/**
 * Get tournament permissions for a specific user
 *
 * @param tournament - The tournament to check permissions for
 * @param userId - The user ID to check
 * @param isAppAdmin - Whether the user is an app admin
 * @returns TournamentPermissions object
 */
export function getTournamentPermissions(
  tournament: Tournament | null,
  userId: string | undefined,
  isAppAdmin: boolean
): TournamentPermissions {
  if (!tournament || !userId) {
    return createNoPermissions();
  }

  const isOwner = userId === tournament.organizerId;
  const isStaff = tournament.staffIds?.includes(userId) ?? false;
  const isFullAdmin = isOwner || isAppAdmin;

  return {
    // Full admin only
    canManageSettings: isFullAdmin,
    canManageTeams: isFullAdmin,
    canManageStaff: isFullAdmin,

    // Full admin OR staff
    canAssignCourts: isFullAdmin || isStaff,
    canStartMatches: isFullAdmin || isStaff,
    canEnterScores: isFullAdmin || isStaff,
    canViewAdminDashboard: isFullAdmin || isStaff,

    // Role flags
    isFullAdmin,
    isStaff: isStaff && !isFullAdmin, // Only true if staff but NOT full admin
  };
}

/**
 * Hook to get tournament permissions for the current user
 *
 * @param tournament - The tournament to check permissions for (or null)
 * @returns TournamentPermissions object
 *
 * @example
 * const permissions = useTournamentPermissions(tournament);
 * if (permissions.canEnterScores) {
 *   // Show score entry UI
 * }
 */
export function useTournamentPermissions(tournament: Tournament | null): TournamentPermissions {
  const { currentUser, isAppAdmin } = useAuth();

  return useMemo(() => {
    return getTournamentPermissions(tournament, currentUser?.uid, isAppAdmin);
  }, [tournament, currentUser?.uid, isAppAdmin]);
}
