/**
 * ProtectedRoute Component
 * 
 * Wraps routes that require authentication or specific roles.
 * 
 * FILE LOCATION: router/ProtectedRoute.tsx
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ROUTES } from './routes';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Require user to be logged in */
  requireAuth?: boolean;
  /** Require user to be an organizer */
  requireOrganizer?: boolean;
  /** Require user to be an app admin */
  requireAdmin?: boolean;
  /** Require email to be verified */
  requireVerified?: boolean;
  /** Custom fallback component instead of redirect */
  fallback?: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireAuth = true,
  requireOrganizer = false,
  requireAdmin = false,
  requireVerified = false,
  fallback,
}) => {
  const { currentUser, isOrganizer, isAppAdmin, loading } = useAuth();
  const location = useLocation();

  // Show nothing while checking auth
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500" />
      </div>
    );
  }

  // Check authentication
  if (requireAuth && !currentUser) {
    if (fallback) return <>{fallback}</>;
    // Redirect to tournaments with return URL
    return <Navigate to={ROUTES.TOURNAMENTS} state={{ from: location }} replace />;
  }

  // Check email verification
  if (requireVerified && currentUser && !currentUser.emailVerified) {
    if (fallback) return <>{fallback}</>;
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold text-yellow-400 mb-2">Email Verification Required</h2>
        <p className="text-gray-400">Please verify your email address to access this page.</p>
      </div>
    );
  }

  // Check organizer role
  if (requireOrganizer && !isOrganizer) {
    if (fallback) return <>{fallback}</>;
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold text-red-400 mb-2">Access Denied</h2>
        <p className="text-gray-400">You need organizer permissions to access this page.</p>
      </div>
    );
  }

  // Check admin role
  if (requireAdmin && !isAppAdmin) {
    if (fallback) return <>{fallback}</>;
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold text-red-400 mb-2">Access Denied</h2>
        <p className="text-gray-400">You need administrator permissions to access this page.</p>
      </div>
    );
  }

  return <>{children}</>;
};

/**
 * PublicOnlyRoute - Redirects logged-in users away (e.g., from login page)
 */
export const PublicOnlyRoute: React.FC<{
  children: React.ReactNode;
  redirectTo?: string;
}> = ({ children, redirectTo = ROUTES.DASHBOARD }) => {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500" />
      </div>
    );
  }

  if (currentUser) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
};