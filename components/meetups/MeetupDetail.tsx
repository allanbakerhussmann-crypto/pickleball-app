import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  getMeetupById, 
  getMeetupRSVPs, 
  setMeetupRSVP,
  removeMeetupRSVP,
  cancelMeetup,
  deleteMeetup 
} from '../../services/firebase';
import type { Meetup, MeetupRSVP } from '../../types';

interface MeetupDetailProps {
  meetupId: string;
  onBack: () => void;
  onEdit?: (meetupId: string) => void;
}

export const MeetupDetail: React.FC<MeetupDetailProps> = ({ meetupId, onBack, onEdit }) => {
  const { currentUser } = useAuth();
  const [meetup, setMeetup] = useState<Meetup | null>(null);
  const [rsvps, setRsvps] = useState<MeetupRSVP[]>([]);
  const [loading, setLoading] = useState(true);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [showShareToast, setShowShareToast] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);

  const loadData = async () => {
    try {
      console.log('Loading meetup data for:', meetupId);
      const [m, r] = await Promise.all([
        getMeetupById(meetupId),
        getMeetupRSVPs(meetupId)
      ]);
      console.log('Meetup loaded:', m);
      console.log('RSVPs loaded:', r);
      setMeetup(m);
      setRsvps(r || []);
    } catch (e) {
      console.error('Error loading meetup data:', e);
      setRsvps([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [meetupId]);

  const handleRSVP = async (status: 'going' | 'maybe') => {
    console.log('handleRSVP called with status:', status);
    console.log('currentUser:', currentUser);
    
    if (!currentUser) {
      console.log('No current user - cannot RSVP');
      alert('Please log in to RSVP');
      return;
    }
    
    setRsvpLoading(true);
    try {
      console.log('Calling setMeetupRSVP with:', meetupId, currentUser.uid, status);
      await setMeetupRSVP(meetupId, currentUser.uid, status);
      console.log('RSVP set successfully, reloading data...');
      await loadData();
      console.log('Data reloaded');
    } catch (e) {
      console.error('RSVP error:', e);
      alert('Failed to update RSVP: ' + (e as Error).message);
    } finally {
      setRsvpLoading(false);
    }
  };

  const handleWithdrawRSVP = async () => {
    console.log('handleWithdrawRSVP called');
    if (!currentUser) return;
    
    // Show custom modal instead of confirm()
    setShowWithdrawConfirm(true);
  };

  const confirmWithdrawRSVP = async () => {
    if (!currentUser) return;
    
    console.log('User confirmed, proceeding to remove RSVP');
    setShowWithdrawConfirm(false);
    setRsvpLoading(true);
    try {
      console.log('Calling removeMeetupRSVP with:', meetupId, currentUser.uid);
      await removeMeetupRSVP(meetupId, currentUser.uid);
      console.log('RSVP removed successfully');
      await loadData();
    } catch (e) {
      console.error('Withdraw RSVP error:', e);
      alert('Failed to remove RSVP: ' + (e as Error).message);
    } finally {
      setRsvpLoading(false);
    }
  };

  const handleCancelMeetup = async () => {
    if (!meetup) return;
    setCancelling(true);
    try {
      await cancelMeetup(meetupId, cancelReason);
      await loadData();
      setShowCancelModal(false);
    } catch (e) {
      console.error('Cancel meetup error:', e);
      alert('Failed to cancel meetup: ' + (e as Error).message);
    } finally {
      setCancelling(false);
    }
  };

  const handleDeleteMeetup = async () => {
    if (!meetup) return;
    try {
      await deleteMeetup(meetupId);
      onBack();
    } catch (e) {
      console.error('Delete meetup error:', e);
      alert('Failed to delete meetup: ' + (e as Error).message);
    }
  };

  const handleShare = async () => {
    const shareUrl = window.location.href;
    const meetupTitle = meetup?.title || 'Pickleball Meetup';
    const meetupDate = meetup ? new Date(meetup.when).toLocaleDateString() : '';
    const shareText = 'Join me at "' + meetupTitle + '" on ' + meetupDate + '!';
    
    const shareData = {
      title: meetupTitle,
      text: shareText,
      url: shareUrl
    };

    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch (e) {
        const error = e as Error;
        if (error.name !== 'AbortError') {
          console.error('Share failed:', e);
        }
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setShowShareToast(true);
      setTimeout(() => setShowShareToast(false), 2000);
    } catch (e) {
      const textArea = document.createElement('textarea');
      textArea.value = shareUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setShowShareToast(true);
      setTimeout(() => setShowShareToast(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto mb-4"></div>
        Loading meetup details...
      </div>
    );
  }

  if (!meetup) {
    return (
      <div className="p-8 text-center">
        <div className="text-red-400 text-xl mb-4">Meetup not found</div>
        <button onClick={onBack} className="text-green-400 hover:underline">
          Back to Meetups
        </button>
      </div>
    );
  }

  const date = new Date(meetup.when);
  const isPast = meetup.when < Date.now();
  const isCancelled = meetup.status === 'cancelled';
  const isCreator = currentUser?.uid === meetup.createdByUserId;
  
  const safeRsvps = rsvps || [];
  const myRsvp = safeRsvps.find(r => r.userId === currentUser?.uid);
  const goingList = safeRsvps.filter(r => r.status === 'going');
  const maybeList = safeRsvps.filter(r => r.status === 'maybe');
  const goingCount = goingList.length;
  const spotsLeft = meetup.maxPlayers > 0 ? meetup.maxPlayers - goingCount : null;
  const isFull = spotsLeft !== null && spotsLeft <= 0;

  const mapsUrl = meetup.location 
    ? 'https://www.google.com/maps/search/?api=1&query=' + meetup.location.lat + ',' + meetup.location.lng
    : '';

  return (
    <div className="max-w-3xl mx-auto p-4 animate-fade-in">
      {showShareToast && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-fade-in">
          Link copied to clipboard!
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="text-gray-400 hover:text-white flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Meetups
        </button>
        
        <button
          onClick={handleShare}
          className="flex items-center gap-2 text-gray-400 hover:text-white px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          Share
        </button>
      </div>

      <div className={'bg-gray-800 rounded-xl border overflow-hidden shadow-2xl ' + (isCancelled ? 'border-red-800' : 'border-gray-700')}>
        
        {isCancelled && (
          <div className="bg-red-900/50 border-b border-red-800 px-6 py-4">
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              <div>
                <div className="text-red-400 font-bold">This meetup has been cancelled</div>
                {meetup.cancelReason && (
                  <div className="text-red-300/70 text-sm mt-1">{meetup.cancelReason}</div>
                )}
              </div>
            </div>
          </div>
        )}

        {isPast && !isCancelled && (
          <div className="bg-gray-700/50 border-b border-gray-600 px-6 py-3">
            <div className="flex items-center gap-2 text-gray-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>This meetup has ended</span>
            </div>
          </div>
        )}

        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-4 mb-4">
            <h1 className={'text-3xl font-bold ' + (isCancelled ? 'text-gray-500 line-through' : 'text-white')}>
              {meetup.title}
            </h1>
            
            {isCreator && !isCancelled && !isPast && (
              <div className="flex items-center gap-2">
                {onEdit && (
                  <button
                    onClick={() => onEdit(meetupId)}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                    title="Edit Meetup"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={() => setShowCancelModal(true)}
                  className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded-lg transition-colors"
                  title="Cancel Meetup"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-4 text-gray-300 mb-6 text-sm">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>
                {date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} at {date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>{meetup.locationName}</span>
            </div>
          </div>

          {meetup.description && (
            <div className="prose prose-invert max-w-none text-gray-400 mb-8">
              <p className="whitespace-pre-wrap">{meetup.description}</p>
            </div>
          )}

          {meetup.location && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 mb-8 text-sm font-semibold"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Open in Google Maps
            </a>
          )}

          {!isCancelled && !isPast && (
            <div className="border-t border-gray-700 pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-white">RSVP</h3>
                <div className="text-sm">
                  <span className="text-white font-bold">{goingCount}</span>
                  <span className="text-gray-500"> / {meetup.maxPlayers > 0 ? meetup.maxPlayers : '∞'} Going</span>
                  {spotsLeft !== null && spotsLeft <= 5 && spotsLeft > 0 && (
                    <span className="ml-2 text-orange-400 font-bold text-xs">{spotsLeft} spots left!</span>
                  )}
                </div>
              </div>

              {currentUser ? (
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => handleRSVP('going')}
                      disabled={rsvpLoading || (isFull && myRsvp?.status !== 'going')}
                      className={'flex-1 py-3 rounded-lg font-bold transition-all ' +
                        (myRsvp?.status === 'going'
                          ? 'bg-green-600 text-white shadow-green-900/50 shadow-lg'
                          : isFull
                            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600')
                      }
                    >
                      {rsvpLoading ? 'Saving...' : myRsvp?.status === 'going' ? '✓ Going' : isFull ? 'Full' : 'Going'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRSVP('maybe')}
                      disabled={rsvpLoading}
                      className={'flex-1 py-3 rounded-lg font-bold transition-all ' +
                        (myRsvp?.status === 'maybe'
                          ? 'bg-yellow-600 text-white shadow-yellow-900/50 shadow-lg'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600')
                      }
                    >
                      {rsvpLoading ? 'Saving...' : myRsvp?.status === 'maybe' ? '✓ Maybe' : 'Maybe'}
                    </button>
                  </div>
                  
                  {myRsvp && (
                    <button
                      type="button"
                      onClick={handleWithdrawRSVP}
                      disabled={rsvpLoading}
                      className="w-full py-2 text-sm text-gray-500 hover:text-red-400 transition-colors"
                    >
                      Withdraw RSVP
                    </button>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-gray-900 rounded text-center text-gray-400">
                  Please log in to RSVP.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-gray-900 p-6 border-t border-gray-700">
          <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">
            Who's Going ({goingCount})
          </h4>
          
          {goingList.length === 0 ? (
            <p className="text-gray-500 italic text-sm">Be the first to say you're going!</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              {goingList.map(rsvp => (
                <div key={rsvp.userId} className="flex items-center gap-2 bg-gray-800 p-2 rounded border border-gray-700">
                  <div className="w-8 h-8 rounded-full bg-green-900 flex items-center justify-center text-green-300 text-xs font-bold flex-shrink-0">
                    {rsvp.userProfile?.displayName?.charAt(0) || '?'}
                  </div>
                  <span className="text-sm text-gray-200 truncate">{rsvp.userProfile?.displayName || 'User'}</span>
                </div>
              ))}
            </div>
          )}

          {maybeList.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4 mt-6">
                Maybe ({maybeList.length})
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {maybeList.map(rsvp => (
                  <div key={rsvp.userId} className="flex items-center gap-2 bg-gray-800/50 p-2 rounded border border-gray-700/50">
                    <div className="w-8 h-8 rounded-full bg-yellow-900/50 flex items-center justify-center text-yellow-300 text-xs font-bold flex-shrink-0">
                      {rsvp.userProfile?.displayName?.charAt(0) || '?'}
                    </div>
                    <span className="text-sm text-gray-400 truncate">{rsvp.userProfile?.displayName || 'User'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {isCreator && isCancelled && (
          <div className="p-4 border-t border-gray-700 bg-gray-900/50">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="text-sm text-red-400 hover:text-red-300"
            >
              Permanently delete this meetup
            </button>
          </div>
        )}
      </div>

      {showCancelModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl border border-gray-700 max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-white mb-4">Cancel Meetup</h3>
            <p className="text-gray-400 mb-4">
              Are you sure you want to cancel this meetup? All attendees will see it's cancelled.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Reason (optional)
              </label>
              <input
                type="text"
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="e.g., Weather conditions"
                className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-red-500 outline-none"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="flex-1 py-2 px-4 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600"
              >
                Keep Meetup
              </button>
              <button
                type="button"
                onClick={handleCancelMeetup}
                disabled={cancelling}
                className="flex-1 py-2 px-4 bg-red-600 text-white rounded-lg hover:bg-red-500 disabled:opacity-50"
              >
                {cancelling ? 'Cancelling...' : 'Cancel Meetup'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl border border-gray-700 max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-white mb-4">Delete Meetup</h3>
            <p className="text-gray-400 mb-4">
              This will permanently delete the meetup and all RSVPs. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2 px-4 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteMeetup}
                className="flex-1 py-2 px-4 bg-red-600 text-white rounded-lg hover:bg-red-500"
              >
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}
      {showWithdrawConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl border border-gray-700 max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-white mb-4">Withdraw RSVP</h3>
            <p className="text-gray-400 mb-6">
              Are you sure you want to remove your RSVP from this meetup?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowWithdrawConfirm(false)}
                className="flex-1 py-2 px-4 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600"
              >
                Keep RSVP
              </button>
              <button
                type="button"
                onClick={confirmWithdrawRSVP}
                className="flex-1 py-2 px-4 bg-red-600 text-white rounded-lg hover:bg-red-500"
              >
                Withdraw
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};