
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
    getAllUsers, 
    promoteToAppAdmin, 
    demoteFromAppAdmin, 
    promoteToOrganizer, 
    demoteFromOrganizer,
    promoteToPlayer,
    demoteFromPlayer
} from '../services/firebase';
import type { UserProfile } from '../types';

export const AdminUsersPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { currentUser, isAppAdmin } = useAuth();
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [notification, setNotification] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        loadUsers();
    }, []);

    const showNotification = (type: 'success' | 'error', text: string) => {
        setNotification({ type, text });
        setTimeout(() => setNotification(null), 3000);
    };

    const loadUsers = async () => {
        setLoading(true);
        try {
            const all = await getAllUsers(1000); 
            setUsers(all.sort((a,b) => (a.displayName || '').localeCompare(b.displayName || '')));
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    // Filter Logic
    const filteredUsers = users.filter(user => {
      const term = searchTerm.trim().toLowerCase();
      if (!term) return true;
      const name = (user.displayName ?? '').toLowerCase();
      const email = (user.email ?? '').toLowerCase();
      return name.includes(term) || email.includes(term);
    });

    const handlePromoteAdmin = async (uid: string) => {
        setProcessingId(uid);
        try {
            await promoteToAppAdmin(uid);
            await loadUsers(); // Refresh list
            showNotification('success', 'User promoted to Global Admin.');
        } catch (e: any) {
            console.error(e);
            showNotification('error', e.message || 'Failed to promote user.');
        } finally {
            setProcessingId(null);
        }
    };

    const handleDemoteAdmin = async (uid: string) => {
         setProcessingId(uid);
         try {
             await demoteFromAppAdmin(uid, currentUser?.uid || '');
             await loadUsers();
             showNotification('success', 'Admin rights removed.');
         } catch (e: any) {
             console.error(e);
             showNotification('error', e.message || 'Failed to remove admin rights.');
         } finally {
             setProcessingId(null);
         }
    };

    const handlePromoteOrganizer = async (uid: string) => {
        setProcessingId(uid);
        try {
            await promoteToOrganizer(uid);
            await loadUsers();
            showNotification('success', 'User promoted to Organizer.');
        } catch (e: any) {
            console.error(e);
            showNotification('error', e.message || 'Failed to promote user.');
        } finally {
            setProcessingId(null);
        }
    };

    const handleDemoteOrganizer = async (uid: string) => {
        setProcessingId(uid);
        try {
            await demoteFromOrganizer(uid);
            await loadUsers();
            showNotification('success', 'Organizer role removed.');
        } catch (e: any) {
            console.error(e);
            showNotification('error', e.message || 'Failed to remove role.');
        } finally {
            setProcessingId(null);
        }
    };

    const handlePromotePlayer = async (uid: string) => {
        setProcessingId(uid);
        try {
            await promoteToPlayer(uid);
            await loadUsers();
            showNotification('success', 'User promoted to Player.');
        } catch (e: any) {
            console.error(e);
            showNotification('error', e.message || 'Failed to promote user.');
        } finally {
            setProcessingId(null);
        }
    };

    const handleDemotePlayer = async (uid: string) => {
        setProcessingId(uid);
        try {
            await demoteFromPlayer(uid);
            await loadUsers();
            showNotification('success', 'Player role removed.');
        } catch (e: any) {
            console.error(e);
            showNotification('error', e.message || 'Failed to remove role.');
        } finally {
            setProcessingId(null);
        }
    };

    if (!isAppAdmin) return <div className="p-8 text-red-500 text-center font-bold text-xl">Access Denied</div>;

    return (
        <div className="max-w-6xl mx-auto p-4 animate-fade-in relative">
            {/* Notification Toast */}
            {notification && (
                <div className={`fixed top-20 right-4 z-50 px-6 py-3 rounded shadow-lg text-white font-bold transition-all transform ${notification.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
                    {notification.text}
                </div>
            )}

            <div className="flex items-center justify-between mb-6">
                <button 
                    onClick={onBack}
                    className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors focus:outline-none"
                >
                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                     Back to Dashboard
                </button>
                <h1 className="text-2xl font-bold text-white">Admin User Management</h1>
            </div>
            
            {/* Search Bar */}
            <div className="mb-6">
                <div className="relative">
                    <input 
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search by name or email..."
                        className="w-full bg-gray-800 text-white rounded-lg pl-10 pr-4 py-3 border border-gray-700 focus:outline-none focus:border-green-500 shadow-sm"
                    />
                    <svg className="w-5 h-5 text-gray-500 absolute left-3 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
            </div>

            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-300">
                        <thead className="bg-gray-900 text-xs uppercase font-bold text-gray-500">
                            <tr>
                                <th className="px-6 py-3">User</th>
                                <th className="px-6 py-3">Email</th>
                                <th className="px-6 py-3">Roles</th>
                                <th className="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {loading ? (
                                <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400 italic">Loading users...</td></tr>
                            ) : filteredUsers.length === 0 ? (
                                <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500 italic">No users found.</td></tr>
                            ) : filteredUsers.map(u => {
                                const roles = u.roles || [];
                                const isPlayer = roles.includes('player');
                                const isOrganizer = roles.includes('organizer');
                                const isAdmin = roles.includes('admin');
                                
                                const isRoot = u.isRootAdmin === true;
                                const isMe = u.id === currentUser?.uid;
                                const isProcessing = processingId === u.id;

                                return (
                                    <tr key={u.id} className="hover:bg-gray-700/50 transition-colors">
                                        <td className="px-6 py-4 font-medium text-white align-top">
                                            {u.displayName || 'Unknown'}
                                            {isMe && <span className="ml-2 text-xs text-green-500 font-bold">(You)</span>}
                                        </td>
                                        <td className="px-6 py-4 text-gray-400 align-top">{u.email}</td>
                                        <td className="px-6 py-4 align-top">
                                            <div className="flex flex-wrap gap-1.5">
                                                {isRoot && (
                                                     <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-900/40 text-purple-400 border border-purple-800/60">
                                                        Root
                                                    </span>
                                                )}
                                                {isAdmin && (
                                                     <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-900/20 text-red-400 border border-red-900/50">
                                                        Admin
                                                    </span>
                                                )}
                                                {isOrganizer && (
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-900/20 text-blue-400 border border-blue-900/50">
                                                        Organizer
                                                    </span>
                                                )}
                                                {isPlayer && (
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-700 text-gray-400 border border-gray-600">
                                                        Player
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right align-top">
                                            {isProcessing ? (
                                                <span className="text-gray-500 italic text-xs">Processing...</span>
                                            ) : (
                                                <div className="flex flex-col gap-2 items-end">
                                                    
                                                    {/* Role Management Controls */}
                                                    <div className="flex gap-2">
                                                        {/* Player Control */}
                                                        {isPlayer ? (
                                                            <button 
                                                                onClick={() => handleDemotePlayer(u.id)}
                                                                className="text-gray-500 hover:text-red-400 text-xs underline"
                                                                title="Remove Player Role"
                                                            >
                                                                Rem Player
                                                            </button>
                                                        ) : (
                                                            <button 
                                                                onClick={() => handlePromotePlayer(u.id)}
                                                                className="text-gray-400 hover:text-green-400 text-xs underline"
                                                                title="Add Player Role"
                                                            >
                                                                Add Player
                                                            </button>
                                                        )}

                                                        <span className="text-gray-700">|</span>

                                                        {/* Organizer Control */}
                                                        {isOrganizer ? (
                                                            <button 
                                                                onClick={() => handleDemoteOrganizer(u.id)}
                                                                className="text-yellow-600 hover:text-red-400 text-xs underline"
                                                                title="Remove Organizer Role"
                                                            >
                                                                Rem Org
                                                            </button>
                                                        ) : (
                                                            <button 
                                                                onClick={() => handlePromoteOrganizer(u.id)}
                                                                className="text-blue-400 hover:text-blue-300 text-xs underline"
                                                                title="Add Organizer Role"
                                                            >
                                                                Add Org
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Admin Controls (Separated for safety) */}
                                                    <div>
                                                        {isRoot ? (
                                                            <span className="text-gray-600 text-xs cursor-not-allowed italic">
                                                                Root Admin
                                                            </span>
                                                        ) : isAdmin ? (
                                                            <button 
                                                                onClick={() => handleDemoteAdmin(u.id)}
                                                                className="bg-red-900/20 hover:bg-red-900/40 text-red-400 px-2 py-1 rounded text-xs font-bold border border-red-900/30 transition-colors disabled:opacity-50"
                                                                disabled={isMe}
                                                            >
                                                                Remove Admin
                                                            </button>
                                                        ) : (
                                                            <button 
                                                                onClick={() => handlePromoteAdmin(u.id)}
                                                                className="bg-green-700/20 hover:bg-green-700/40 text-green-400 px-2 py-1 rounded text-xs font-bold border border-green-700/30 transition-colors"
                                                            >
                                                                Make Admin
                                                            </button>
                                                        )}
                                                    </div>

                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
