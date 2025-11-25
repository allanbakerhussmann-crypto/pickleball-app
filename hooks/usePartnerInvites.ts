
import { useState, useEffect } from 'react';
import { subscribeToUserPartnerInvites } from '../services/firebase';
import type { PartnerInvite } from '../types';

export const usePartnerInvites = (userId: string | undefined) => {
  const [invites, setInvites] = useState<PartnerInvite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setInvites([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeToUserPartnerInvites(userId, (data) => {
      setInvites(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  return { invites, loading };
};
