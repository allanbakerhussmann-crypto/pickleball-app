/**
 * BreachManagementPage - Admin Security Breach Management
 *
 * Allows admins to view, log, and manage security breaches
 * for Privacy Act 2020 compliance.
 *
 * FILE LOCATION: pages/admin/BreachManagementPage.tsx
 * VERSION: V06.04
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  getAllBreaches,
  logBreach,
  updateBreachStatus,
  formatBreachForReport,
  type BreachRecord,
  type BreachSeverity,
  type BreachCategory,
  type BreachStatus,
} from '../../services/firebase/breachLogging';
import {
  getRetentionPolicies,
  getDataRetentionLogs,
  runDataCleanup,
  formatRetentionPeriod,
  type RetentionPolicy,
  type DataRetentionLog,
} from '../../services/firebase/dataRetention';
import {
  getAllPrivacyRequests,
  updatePrivacyRequestStatus,
  getRequestTypeLabel,
  getStatusColor,
  calculateResponseDeadline,
  isRequestOverdue,
  type PrivacyRequest,
  type PrivacyRequestStatus,
} from '../../services/firebase/privacyRequests';

const SEVERITY_COLORS: Record<BreachSeverity, string> = {
  low: 'bg-blue-600',
  medium: 'bg-yellow-600',
  high: 'bg-orange-600',
  critical: 'bg-red-600',
};

const STATUS_COLORS: Record<BreachStatus, string> = {
  detected: 'bg-red-600',
  investigating: 'bg-yellow-600',
  contained: 'bg-blue-600',
  resolved: 'bg-green-600',
  reported: 'bg-purple-600',
};

const CATEGORY_OPTIONS: { value: BreachCategory; label: string }[] = [
  { value: 'unauthorized_access', label: 'Unauthorized Access' },
  { value: 'data_disclosure', label: 'Data Disclosure' },
  { value: 'data_loss', label: 'Data Loss' },
  { value: 'system_compromise', label: 'System Compromise' },
  { value: 'phishing', label: 'Phishing' },
  { value: 'malware', label: 'Malware' },
  { value: 'insider_threat', label: 'Insider Threat' },
  { value: 'other', label: 'Other' },
];

const BreachManagementPage: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'breaches' | 'requests' | 'retention' | 'log'>('breaches');
  const [breaches, setBreaches] = useState<BreachRecord[]>([]);
  const [privacyRequests, setPrivacyRequests] = useState<PrivacyRequest[]>([]);
  const [retentionLogs, setRetentionLogs] = useState<DataRetentionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New breach form state
  const [showNewBreachForm, setShowNewBreachForm] = useState(false);
  const [newBreach, setNewBreach] = useState({
    category: 'unauthorized_access' as BreachCategory,
    severity: 'medium' as BreachSeverity,
    title: '',
    description: '',
    dataTypesExposed: '',
    estimatedAffectedCount: 0,
  });
  const [submitting, setSubmitting] = useState(false);

  // Check admin access
  const isAdmin = userProfile?.isAppAdmin || userProfile?.roles?.includes('app_admin');

  useEffect(() => {
    if (isAdmin) {
      loadData();
    }
  }, [isAdmin]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [breachData, requestsData, retentionData] = await Promise.all([
        getAllBreaches(50),
        getAllPrivacyRequests(50),
        getDataRetentionLogs(10),
      ]);
      setBreaches(breachData);
      setPrivacyRequests(requestsData);
      setRetentionLogs(retentionData);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRequestStatus = async (requestId: string, newStatus: PrivacyRequestStatus) => {
    if (!currentUser) return;
    try {
      await updatePrivacyRequestStatus(requestId, newStatus, currentUser.uid);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to update request status');
    }
  };

  const handleLogBreach = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    setSubmitting(true);
    try {
      const dataTypes = newBreach.dataTypesExposed
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);

      await logBreach(
        {
          category: newBreach.category,
          severity: newBreach.severity,
          title: newBreach.title,
          description: newBreach.description,
          dataTypesExposed: dataTypes,
          estimatedAffectedCount: newBreach.estimatedAffectedCount,
        },
        currentUser.uid
      );

      setShowNewBreachForm(false);
      setNewBreach({
        category: 'unauthorized_access',
        severity: 'medium',
        title: '',
        description: '',
        dataTypesExposed: '',
        estimatedAffectedCount: 0,
      });
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to log breach');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (breachId: string, newStatus: BreachStatus) => {
    if (!currentUser) return;

    try {
      await updateBreachStatus(breachId, newStatus, currentUser.uid);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to update status');
    }
  };

  const handleExportReport = (breach: BreachRecord) => {
    const report = formatBreachForReport(breach);
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `breach-report-${breach.id}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleRunCleanup = async (dryRun: boolean) => {
    try {
      const result = await runDataCleanup(dryRun);
      alert(
        `${dryRun ? 'Dry Run' : 'Cleanup'} Complete:\n` +
        `- Old court bookings: ${result.counts.oldCourtBookings}\n` +
        `- Inactive users: ${result.counts.inactiveUsers}`
      );
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to run cleanup');
    }
  };

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="bg-red-900/20 border border-red-800 rounded-xl p-8 text-center">
          <h1 className="text-2xl font-bold text-red-400 mb-2">Access Denied</h1>
          <p className="text-gray-400">You must be an admin to access this page.</p>
          <Link to="/" className="text-green-400 hover:text-green-300 mt-4 inline-block">
            ← Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="bg-gray-800 rounded-xl border border-gray-700">
        {/* Header */}
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Privacy & Security Management</h1>
              <p className="text-gray-400 text-sm mt-1">
                Manage security breaches and data retention for Privacy Act 2020 compliance
              </p>
            </div>
            <button
              onClick={() => setShowNewBreachForm(true)}
              className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg font-medium"
            >
              Log New Breach
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 mt-6 flex-wrap">
            {(['breaches', 'requests', 'retention', 'log'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors relative ${
                  activeTab === tab
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {tab === 'breaches' && 'Security Breaches'}
                {tab === 'requests' && (
                  <>
                    Privacy Requests
                    {privacyRequests.filter(r => r.status === 'pending').length > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                        {privacyRequests.filter(r => r.status === 'pending').length}
                      </span>
                    )}
                  </>
                )}
                {tab === 'retention' && 'Data Retention'}
                {tab === 'log' && 'Cleanup Logs'}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mt-4 bg-red-900/20 border border-red-800 rounded-lg p-4">
            <p className="text-red-400">{error}</p>
            <button onClick={() => setError(null)} className="text-red-300 text-sm mt-1">
              Dismiss
            </button>
          </div>
        )}

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full mx-auto" />
              <p className="text-gray-400 mt-4">Loading...</p>
            </div>
          ) : (
            <>
              {/* Breaches Tab */}
              {activeTab === 'breaches' && (
                <div className="space-y-4">
                  {breaches.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      <p>No security breaches recorded.</p>
                      <p className="text-sm mt-2">This is good news!</p>
                    </div>
                  ) : (
                    breaches.map(breach => (
                      <div
                        key={breach.id}
                        className="bg-gray-900 rounded-lg border border-gray-700 p-4"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-grow">
                            <div className="flex items-center gap-3 mb-2">
                              <span
                                className={`px-2 py-1 rounded text-xs font-medium text-white ${
                                  SEVERITY_COLORS[breach.severity]
                                }`}
                              >
                                {breach.severity.toUpperCase()}
                              </span>
                              <span
                                className={`px-2 py-1 rounded text-xs font-medium text-white ${
                                  STATUS_COLORS[breach.status]
                                }`}
                              >
                                {breach.status.toUpperCase()}
                              </span>
                              {breach.requiresNotification && (
                                <span className="px-2 py-1 rounded text-xs font-medium bg-purple-600 text-white">
                                  NOTIFIABLE
                                </span>
                              )}
                            </div>
                            <h3 className="text-white font-medium">{breach.title}</h3>
                            <p className="text-gray-400 text-sm mt-1">{breach.description}</p>
                            <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                              <span>ID: {breach.id}</span>
                              <span>Detected: {new Date(breach.detectedAt).toLocaleDateString()}</span>
                              <span>Affected: ~{breach.estimatedAffectedCount} users</span>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 ml-4">
                            <select
                              value={breach.status}
                              onChange={(e) => handleUpdateStatus(breach.id, e.target.value as BreachStatus)}
                              className="bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600"
                            >
                              <option value="detected">Detected</option>
                              <option value="investigating">Investigating</option>
                              <option value="contained">Contained</option>
                              <option value="resolved">Resolved</option>
                              <option value="reported">Reported</option>
                            </select>
                            <button
                              onClick={() => handleExportReport(breach)}
                              className="text-green-400 hover:text-green-300 text-sm"
                            >
                              Export Report
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Privacy Requests Tab */}
              {activeTab === 'requests' && (
                <div className="space-y-4">
                  {privacyRequests.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      <p>No privacy requests submitted.</p>
                    </div>
                  ) : (
                    privacyRequests.map(request => {
                      const deadline = calculateResponseDeadline(request.createdAt);
                      const overdue = isRequestOverdue(request.createdAt) && request.status === 'pending';
                      return (
                        <div
                          key={request.id}
                          className={`bg-gray-900 rounded-lg border p-4 ${
                            overdue ? 'border-red-600' : 'border-gray-700'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-grow">
                              <div className="flex items-center gap-3 mb-2">
                                <span className={`px-2 py-1 rounded text-xs font-medium text-white ${getStatusColor(request.status)}`}>
                                  {request.status.toUpperCase().replace('_', ' ')}
                                </span>
                                <span className="px-2 py-1 rounded text-xs font-medium bg-gray-600 text-white">
                                  {getRequestTypeLabel(request.requestType)}
                                </span>
                                {overdue && (
                                  <span className="px-2 py-1 rounded text-xs font-medium bg-red-600 text-white">
                                    OVERDUE
                                  </span>
                                )}
                              </div>
                              <h3 className="text-white font-medium">{request.name}</h3>
                              <p className="text-gray-400 text-sm">{request.email}</p>
                              <p className="text-gray-300 text-sm mt-2">{request.details}</p>
                              <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                                <span>ID: {request.id}</span>
                                <span>Submitted: {new Date(request.createdAt).toLocaleDateString()}</span>
                                <span>Deadline: {deadline.toLocaleDateString()}</span>
                              </div>
                            </div>
                            <div className="flex flex-col gap-2 ml-4">
                              <select
                                value={request.status}
                                onChange={(e) => handleUpdateRequestStatus(request.id, e.target.value as PrivacyRequestStatus)}
                                className="bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600"
                              >
                                <option value="pending">Pending</option>
                                <option value="in_progress">In Progress</option>
                                <option value="approved">Approved</option>
                                <option value="rejected">Rejected</option>
                                <option value="completed">Completed</option>
                              </select>
                              <a
                                href={`mailto:${request.email}?subject=Re: Privacy Request ${request.id}`}
                                className="text-green-400 hover:text-green-300 text-sm text-center"
                              >
                                Reply via Email
                              </a>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Retention Tab */}
              {activeTab === 'retention' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-semibold text-white mb-4">Retention Policies</h2>
                    <div className="grid gap-4">
                      {getRetentionPolicies().map(policy => (
                        <div
                          key={policy.id}
                          className="bg-gray-900 rounded-lg border border-gray-700 p-4 flex items-center justify-between"
                        >
                          <div>
                            <h3 className="text-white font-medium">{policy.name}</h3>
                            <p className="text-gray-400 text-sm">{policy.description}</p>
                          </div>
                          <div className="text-right">
                            <span className="text-green-400 font-medium">
                              {formatRetentionPeriod(policy.retentionPeriodDays)}
                            </span>
                            <p className="text-gray-500 text-xs capitalize">{policy.action}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-6 border-t border-gray-700">
                    <h2 className="text-lg font-semibold text-white mb-4">Manual Cleanup</h2>
                    <div className="flex gap-4">
                      <button
                        onClick={() => handleRunCleanup(true)}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg"
                      >
                        Run Dry Run
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Are you sure you want to run the actual cleanup? This cannot be undone.')) {
                            handleRunCleanup(false);
                          }
                        }}
                        className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg"
                      >
                        Run Actual Cleanup
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Cleanup Logs Tab */}
              {activeTab === 'log' && (
                <div className="space-y-4">
                  {retentionLogs.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      <p>No cleanup logs yet.</p>
                      <p className="text-sm mt-2">Logs will appear after scheduled or manual cleanups.</p>
                    </div>
                  ) : (
                    retentionLogs.map(log => (
                      <div
                        key={log.id}
                        className="bg-gray-900 rounded-lg border border-gray-700 p-4"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-white font-medium">
                            {new Date(log.runAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div className="bg-gray-800 rounded p-3">
                            <p className="text-gray-400">Court Bookings Deleted</p>
                            <p className="text-white text-lg font-semibold">{log.results.courtBookings}</p>
                          </div>
                          <div className="bg-gray-800 rounded p-3">
                            <p className="text-gray-400">RSVPs Anonymized</p>
                            <p className="text-white text-lg font-semibold">{log.results.meetupRsvps}</p>
                          </div>
                          <div className="bg-gray-800 rounded p-3">
                            <p className="text-gray-400">Users Marked Inactive</p>
                            <p className="text-white text-lg font-semibold">{log.results.inactiveUsersMarked}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* New Breach Modal */}
      {showNewBreachForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl border border-gray-700 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-700">
              <h2 className="text-xl font-bold text-white">Log Security Breach</h2>
              <p className="text-gray-400 text-sm">Record a new security incident</p>
            </div>
            <form onSubmit={handleLogBreach} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Category</label>
                <select
                  value={newBreach.category}
                  onChange={(e) => setNewBreach(prev => ({ ...prev, category: e.target.value as BreachCategory }))}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600"
                >
                  {CATEGORY_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Severity</label>
                <select
                  value={newBreach.severity}
                  onChange={(e) => setNewBreach(prev => ({ ...prev, severity: e.target.value as BreachSeverity }))}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Title</label>
                <input
                  type="text"
                  value={newBreach.title}
                  onChange={(e) => setNewBreach(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Brief description of the breach"
                  required
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                <textarea
                  value={newBreach.description}
                  onChange={(e) => setNewBreach(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Detailed description of what happened"
                  required
                  rows={4}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Data Types Exposed (comma-separated)
                </label>
                <input
                  type="text"
                  value={newBreach.dataTypesExposed}
                  onChange={(e) => setNewBreach(prev => ({ ...prev, dataTypesExposed: e.target.value }))}
                  placeholder="e.g., email, phone, dupr_rating"
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Estimated Affected Users
                </label>
                <input
                  type="number"
                  value={newBreach.estimatedAffectedCount}
                  onChange={(e) => setNewBreach(prev => ({ ...prev, estimatedAffectedCount: parseInt(e.target.value) || 0 }))}
                  min={0}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowNewBreachForm(false)}
                  className="flex-1 border border-gray-600 text-gray-300 py-2 rounded-lg hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white py-2 rounded-lg font-medium"
                >
                  {submitting ? 'Logging...' : 'Log Breach'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BreachManagementPage;
