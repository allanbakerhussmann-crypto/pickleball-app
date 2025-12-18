/**
 * AdminOrganizerRequests Component
 * 
 * Admin page for managing organizer access requests.
 * Shows pending requests with approve/deny actions.
 * 
 * Features:
 * - View all pending requests
 * - Approve requests (auto-promotes to organizer)
 * - Deny requests with optional reason
 * - View request history
 * 
 * FILE LOCATION: components/admin/AdminOrganizerRequests.tsx
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  subscribeToAllOrganizerRequests,
  approveOrganizerRequest,
  denyOrganizerRequest,
  deleteOrganizerRequest,
  type OrganizerRequest,
} from '../../services/firebase/organizerRequests';

// ============================================
// TYPES
// ============================================

interface AdminOrganizerRequestsProps {
  onBack: () => void;
}

// ============================================
// COMPONENT
// ============================================

export const AdminOrganizerRequests: React.FC<AdminOrganizerRequestsProps> = ({ onBack }) => {
  const { currentUser, userProfile, isAppAdmin } = useAuth();
  const [requests, setRequests] = useState<OrganizerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'all'>('pending');
  
  // Modal state
  const [showDenyModal, setShowDenyModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<OrganizerRequest | null>(null);
  const [denialReason, setDenialReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // ============================================
  // LOAD DATA
  // ============================================

  useEffect(() => {
    const unsubscribe = subscribeToAllOrganizerRequests((data) => {
      setRequests(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // ============================================
  // COMPUTED VALUES
  // ============================================

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const displayedRequests = activeTab === 'pending' ? pendingRequests : requests;

  // ============================================
  // HANDLERS
  // ============================================

  const handleApprove = async (request: OrganizerRequest) => {
    if (!currentUser || !userProfile) return;
    
    setProcessing(true);
    setError(null);
    
    try {
      await approveOrganizerRequest(
        request.id,
        currentUser.uid,
        userProfile.displayName || 'Admin'
      );
      
      setSuccessMessage(`${request.userName} has been approved as an organizer!`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      console.error('Failed to approve request:', err);
      setError(err.message || 'Failed to approve request');
    } finally {
      setProcessing(false);
    }
  };

  const handleDenyClick = (request: OrganizerRequest) => {
    setSelectedRequest(request);
    setDenialReason('');
    setShowDenyModal(true);
  };

  const handleDenyConfirm = async () => {
    if (!currentUser || !userProfile || !selectedRequest) return;
    
    setProcessing(true);
    setError(null);
    
    try {
      await denyOrganizerRequest(
        selectedRequest.id,
        currentUser.uid,
        userProfile.displayName || 'Admin',
        denialReason.trim() || undefined
      );
      
      setShowDenyModal(false);
      setSelectedRequest(null);
      setSuccessMessage(`Request from ${selectedRequest.userName} has been denied.`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      console.error('Failed to deny request:', err);
      setError(err.message || 'Failed to deny request');
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async (request: OrganizerRequest) => {
    if (!confirm(`Delete this request from ${request.userName}? This cannot be undone.`)) {
      return;
    }
    
    try {
      await deleteOrganizerRequest(request.id);
    } catch (err: any) {
      console.error('Failed to delete request:', err);
      setError(err.message || 'Failed to delete request');
    }
  };

  // ============================================
  // FORMAT HELPERS
  // ============================================

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-NZ', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  // ============================================
  // RENDER - ACCESS DENIED
  // ============================================

  if (!isAppAdmin) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-6 text-center">
          <svg className="w-12 h-12 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h2 className="text-xl font-bold text-red-200 mb-2">Access Denied</h2>
          <p className="text-red-300/80">You don't have permission to view this page.</p>
          <button onClick={onBack} className="mt-4 text-red-400 hover:text-red-300">
            ← Go Back
          </button>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER - LOADING
  // ============================================

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-700 rounded w-1/3 mb-6"></div>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-gray-800 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER - MAIN
  // ============================================

  return (
    <div className="max-w-4xl mx-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="text-gray-400 hover:text-white flex items-center gap-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <h1 className="text-2xl font-bold text-white">Organizer Requests</h1>
        </div>
        
        {pendingRequests.length > 0 && (
          <span className="bg-yellow-600 text-white px-3 py-1 rounded-full text-sm font-bold">
            {pendingRequests.length} Pending
          </span>
        )}
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-900/50 border border-green-700 text-green-200 px-4 py-3 rounded-lg mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {successMessage}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg mb-4">
          {error}
          <button onClick={() => setError(null)} className="float-right text-red-300 hover:text-red-100">✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'pending' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          Pending ({pendingRequests.length})
        </button>
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'all' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          All Requests ({requests.length})
        </button>
      </div>

      {/* Empty State */}
      {displayedRequests.length === 0 && (
        <div className="bg-gray-800 rounded-lg p-8 text-center border border-gray-700">
          <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <h3 className="text-xl font-bold text-gray-400 mb-2">
            {activeTab === 'pending' ? 'No Pending Requests' : 'No Requests Yet'}
          </h3>
          <p className="text-gray-500">
            {activeTab === 'pending' 
              ? 'All organizer requests have been processed.'
              : 'No one has requested organizer access yet.'
            }
          </p>
        </div>
      )}

      {/* Request Cards */}
      <div className="space-y-4">
        {displayedRequests.map(request => (
          <div
            key={request.id}
            className={`bg-gray-800 rounded-lg border overflow-hidden ${
              request.status === 'pending'
                ? 'border-yellow-700/50'
                : request.status === 'approved'
                  ? 'border-green-700/50'
                  : 'border-red-700/50'
            }`}
          >
            {/* Status Banner */}
            {request.status !== 'pending' && (
              <div className={`px-4 py-2 text-sm font-medium ${
                request.status === 'approved' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'
              }`}>
                {request.status === 'approved' ? '✓ Approved' : '✕ Denied'}
                {request.reviewedByName && (
                  <span className="text-gray-400 ml-2">
                    by {request.reviewedByName} on {formatDate(request.reviewedAt!)}
                  </span>
                )}
              </div>
            )}

            <div className="p-4">
              {/* User Info */}
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {request.userPhotoURL ? (
                    <img src={request.userPhotoURL} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xl font-bold text-gray-400">
                      {request.userName?.charAt(0) || '?'}
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-bold text-white">{request.userName}</h3>
                    {request.status === 'pending' && (
                      <span className="bg-yellow-600/20 text-yellow-400 px-2 py-0.5 rounded text-xs font-medium">
                        Pending
                      </span>
                    )}
                  </div>
                  <p className="text-gray-400 text-sm">{request.userEmail}</p>
                  <p className="text-gray-500 text-xs mt-1">Submitted {formatDate(request.createdAt)}</p>
                </div>
              </div>

              {/* Reason */}
              <div className="mt-4 bg-gray-900/50 rounded-lg p-3">
                <p className="text-sm text-gray-500 mb-1">Reason for request:</p>
                <p className="text-gray-200">{request.reason}</p>
              </div>

              {/* Experience */}
              {request.experience && (
                <div className="mt-3 bg-gray-900/50 rounded-lg p-3">
                  <p className="text-sm text-gray-500 mb-1">Experience:</p>
                  <p className="text-gray-300 text-sm">{request.experience}</p>
                </div>
              )}

              {/* Denial Reason */}
              {request.status === 'denied' && request.denialReason && (
                <div className="mt-3 bg-red-900/20 rounded-lg p-3 border border-red-700/30">
                  <p className="text-sm text-red-400 mb-1">Denial reason:</p>
                  <p className="text-red-200 text-sm">{request.denialReason}</p>
                </div>
              )}

              {/* Actions */}
              {request.status === 'pending' && (
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => handleApprove(request)}
                    disabled={processing}
                    className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
                  >
                    {processing ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Approve
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleDenyClick(request)}
                    disabled={processing}
                    className="flex-1 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Deny
                  </button>
                </div>
              )}

              {/* Delete for processed */}
              {request.status !== 'pending' && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <button
                    onClick={() => handleDelete(request)}
                    className="text-sm text-gray-500 hover:text-red-400 transition-colors"
                  >
                    Delete this request
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Deny Modal */}
      {showDenyModal && selectedRequest && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl border border-gray-700 max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-white mb-2">Deny Request</h3>
            <p className="text-gray-400 mb-4">
              Deny organizer request from <span className="text-white font-medium">{selectedRequest.userName}</span>?
            </p>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Reason for denial <span className="text-gray-500">(optional, visible to user)</span>
              </label>
              <textarea
                value={denialReason}
                onChange={(e) => setDenialReason(e.target.value)}
                placeholder="e.g., Please complete your profile first..."
                rows={3}
                className="w-full bg-gray-900 text-white rounded-lg px-4 py-3 border border-gray-600 focus:border-red-500 focus:outline-none resize-none"
              />
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowDenyModal(false)}
                className="flex-1 py-2 px-4 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleDenyConfirm}
                disabled={processing}
                className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white rounded-lg font-semibold flex items-center justify-center gap-2"
              >
                {processing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Denying...
                  </>
                ) : (
                  'Deny Request'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminOrganizerRequests;