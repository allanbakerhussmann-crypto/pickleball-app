import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  subscribeToUserPartnerInvites,
  respondToPartnerInvite,
  getAllTournaments,
  getUsersByIds,
  ensureRegistrationForUser,
} from '../services/firebase';
import type { PartnerInvite, Tournament, UserProfile } from '../types';

interface PartnerInvitesProps {
  // Called when the user has finished handling all invites
  // and we should move into the "choose events for this tournament" flow.
  // We pass the tournament id + ALL accepted division ids for that tournament.
  onAcceptInvites?: (tournamentId: string, divisionIds: string[]) => void;

  // Called when the user has declined everything or there is nothing
  // to continue with – typically go to dashboard.
  onCompleteWithoutSelection?: () => void;
}

/**
 * PartnerInvites now acts as the "Invite Summary Screen":
 *
 *  - Shows ALL partner invites for the current user in one place
 *  - Accept / Decline every invite
 *  - When "Done – Continue" is pressed:
 *      - If at least one invite was accepted for a tournament, we pass the
 *        tournament id + accepted division ids to the parent so we can
 *        show the TournamentEventSelection screen.
 *      - If nothing accepted, we call onCompleteWithoutSelection.
 */
export const PartnerInvites: React.FC<PartnerInvitesProps> = ({
  onAcceptInvites,
  onCompleteWithoutSelection,
}) => {
  const { currentUser } = useAuth();
  const [invites, setInvites] = useState<PartnerInvite[]>([]);
  const [tournamentsById, setTournamentsById] = useState<Record<string, Tournament>>({});
  const [invitersById, setInvitersById] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(true);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);

  // 1. Subscribe to invites for this user
  useEffect(() => {
    if (!currentUser) return;

    const unsubscribe = subscribeToUserPartnerInvites(currentUser.uid, (incoming) => {
      setInvites(incoming);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // 2. Fetch tournaments + inviter profiles whenever invites change
  useEffect(() => {
    if (invites.length === 0) return;

    const loadMetadata = async () => {
      const tournamentIds = Array.from(new Set(invites.map((i) => i.tournamentId))) as string[];
      const inviterIds = Array.from(new Set(invites.map((i) => i.inviterId))) as string[];

      try {
        const allTournaments = await getAllTournaments(200);
        const tMap: Record<string, Tournament> = {};
        allTournaments.forEach((t) => {
          if (tournamentIds.includes(t.id)) {
            tMap[t.id] = t;
          }
        });

        const users = await getUsersByIds(inviterIds);
        const uMap: Record<string, UserProfile> = {};
        users.forEach((u) => {
          uMap[u.id] = u;
        });

        setTournamentsById(tMap);
        setInvitersById(uMap);
      } catch (err) {
        console.error('Failed to load invite metadata', err);
      }
    };

    loadMetadata();
  }, [invites]);

  const hasPending = useMemo(
    () => invites.some((i) => i.status === 'pending'),
    [invites],
  );
  const acceptedInvites = useMemo(
    () => invites.filter((i) => i.status === 'accepted'),
    [invites],
  );

  const handleRespond = async (invite: PartnerInvite, response: 'accepted' | 'declined') => {
    try {
      setBusyInviteId(invite.id);
      const result = await respondToPartnerInvite(invite, response);

      if (response === 'accepted' && result && currentUser) {
        // Ensure registration record exists for this tournament/division;
        // additional accepted divisions can be merged into the same record.
        await ensureRegistrationForUser(result.tournamentId, currentUser.uid, result.divisionId);
      }
    } catch (error) {
      console.error('Failed to respond to invite', error);
      alert(
        error instanceof Error
          ? error.message
          : 'Failed to process your response. Please try again.',
      );
    } finally {
      setBusyInviteId(null);
    }
  };

  const handleDoneContinue = () => {
    if (hasPending || invites.length === 0) {
      return;
    }

    if (acceptedInvites.length > 0 && onAcceptInvites) {
      // For now we assume all accepted invites relate to the same tournament.
      // If you support multiple tournaments at once, you could group by tournamentId
      // and ask the user which one to proceed with.
      const firstTournamentId = acceptedInvites[0].tournamentId;
      const divisionIdsForTournament = acceptedInvites
        .filter((i) => i.tournamentId === firstTournamentId)
        .map((i) => i.divisionId);

      onAcceptInvites(firstTournamentId, divisionIdsForTournament);
      return;
    }

    if (onCompleteWithoutSelection) {
      onCompleteWithoutSelection();
    }
  };

  if (!currentUser) {
    return (
      <div className="max-w-3xl mx-auto p-4 text-center text-gray-400">
        Please sign in to view your partner invitations.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-4 text-center text-gray-400">
        Loading your invitations...
      </div>
    );
  }

  const hasInvites = invites.length > 0;

  return (
    <div className="max-w-3xl mx-auto px-4 pb-24 pt-4 animate-fade-in">
      <div className="mb-6">
        <p className="text-xs font-semibold tracking-[0.2em] text-green-400 uppercase mb-2">
          Partner invitations
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">
          You&apos;ve been invited to play
        </h1>
        <p className="mt-2 text-sm sm:text-base text-gray-400">
          Review each event below. Accept or decline every invite, then continue to choose any
          additional events (like singles) for this tournament.
        </p>
      </div>

      {!hasInvites ? (
        <div className="bg-gray-900/60 border border-dashed border-gray-700 rounded-2xl p-8 text-center">
          <div className="mb-3 flex justify-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-gray-800 border border-gray-700">
              <svg
                className="h-6 w-6 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 14l9-5-9-5-9 5 9 5z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 14v7m-4 0h8"
                />
              </svg>
            </div>
          </div>
          <h2 className="text-lg font-semibold text-white">No pending partner invites</h2>
          <p className="mt-2 text-sm text-gray-400">
            When someone invites you to be their doubles partner, the invite will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {invites
            .slice()
            .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
            .map((invite) => {
              const tournament = tournamentsById[invite.tournamentId];
              const inviter = invitersById[invite.inviterId];

              const isPending = invite.status === 'pending';
              const isAccepted = invite.status === 'accepted';
              const isDeclined = invite.status === 'declined';
              const isDisabled = !isPending || busyInviteId === invite.id;

              const statusLabel = isPending
                ? 'Pending response'
                : isAccepted
                ? 'Accepted'
                : isDeclined
                ? 'Declined'
                : invite.status === 'expired'
                ? 'Expired'
                : invite.status;

              const statusColor =
                isPending || !invite.status
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                  : isAccepted
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  : isDeclined || invite.status === 'expired'
                  ? 'bg-red-500/10 text-red-300 border-red-500/30'
                  : 'bg-gray-700/60 text-gray-300 border-gray-600';

              return (
                <div
                  key={invite.id}
                  className="rounded-2xl border border-gray-800 bg-gradient-to-br from-gray-900/80 to-gray-950/90 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
                      <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-green-400">
                        Invite
                      </span>
                      {tournament && (
                        <span className="inline-flex items-center gap-1 text-[0.7rem]">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-400/70" />
                          {tournament.name}
                        </span>
                      )}
                    </div>
                    <p className="text-sm sm:text-base text-white">
                      <span className="font-semibold">
                        {inviter?.displayName || 'A player'}
                      </span>{' '}
                      wants to team up with you.
                    </p>
                    <p className="text-xs sm:text-sm text-gray-400">
                      Division ID:{' '}
                      <span className="font-mono bg-gray-900/80 px-1.5 py-0.5 rounded-md">
                        {invite.divisionId}
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-col items-stretch sm:items-end gap-2">
                    <span
                      className={`inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-medium ${statusColor}`}
                    >
                      {statusLabel}
                    </span>

                    <div className="flex flex-row sm:flex-row gap-2">
                      <button
                        type="button"
                        disabled={isDisabled}
                        onClick={() => handleRespond(invite, 'declined')}
                        className={`px-3 py-1.5 rounded-full text-xs sm:text-sm border transition ${
                          isDisabled
                            ? 'cursor-not-allowed border-gray-700 text-gray-600 bg-gray-900/40'
                            : 'border-gray-700 text-gray-300 hover:bg-gray-800/80'
                        }`}
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        disabled={isDisabled}
                        onClick={() => handleRespond(invite, 'accepted')}
                        className={`px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold shadow-md transition ${
                          isDisabled
                            ? 'cursor-not-allowed bg-emerald-900/30 text-emerald-700 border border-emerald-700/40'
                            : 'bg-emerald-500/90 border border-emerald-400/80 text-gray-900 hover:bg-emerald-400'
                        }`}
                      >
                        {busyInviteId === invite.id && isPending ? 'Saving...' : 'Accept'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* Sticky footer guidance + primary action */}
      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-gray-950 via-gray-950/98 to-gray-950/90 border-t border-gray-800/80">
        <div className="max-w-3xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
          <p className="text-xs sm:text-sm text-gray-400 flex-1">
            {invites.length === 0
              ? 'No partner invites yet. You can also join events directly from the tournament page.'
              : hasPending
              ? 'Please accept or decline each invite before continuing.'
              : acceptedInvites.length > 0
              ? 'Great! Continue to choose any additional events (like singles) for this tournament.'
              : 'You declined all invitations. You can still register for events from the dashboard later.'}
          </p>
          <button
            type="button"
            disabled={!hasInvites || hasPending}
            onClick={handleDoneContinue}
            className={`w-full sm:w-auto inline-flex items-center justify-center rounded-full px-4 sm:px-6 py-2 text-xs sm:text-sm font-semibold tracking-wide transition ${
              !hasInvites || hasPending
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700'
                : 'bg-green-500 text-gray-900 hover:bg-green-400 border border-green-400 shadow-lg shadow-green-900/30'
            }`}
          >
            Done – Continue
          </button>
        </div>
      </div>
    </div>
  );
};
