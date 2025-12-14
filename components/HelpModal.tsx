
import React from 'react';

interface HelpModalProps {
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
  return (
    <div 
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-gray-700"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-700 bg-gray-850 rounded-t-xl">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="text-green-500">?</span> How to use PickleballDirector
          </h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1 rounded-full hover:bg-gray-700"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-6 space-y-8 text-gray-300 custom-scrollbar">
          
          {/* Section 1: Getting Started */}
          <section>
            <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
              <span className="bg-blue-600/20 text-blue-400 text-xs px-2 py-1 rounded">1</span>
              Getting Started
            </h3>
            <ul className="list-disc pl-5 space-y-2 text-sm">
              <li><strong className="text-white">Sign Up/Login:</strong> Create an account to register for tournaments and track your stats.</li>
              <li><strong className="text-white">Profile:</strong> Update your profile with your DUPR ID to sync your ratings automatically. This helps organizers seed you correctly.</li>
            </ul>
          </section>

          {/* Section 2: For Players */}
          <section>
            <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
              <span className="bg-green-600/20 text-green-400 text-xs px-2 py-1 rounded">2</span>
              For Players
            </h3>
            <div className="space-y-4 text-sm">
              <div className="bg-gray-700/30 p-3 rounded border border-gray-700">
                <h4 className="font-bold text-white mb-1">Finding & Joining Tournaments</h4>
                <p>Browse the <strong>Tournaments</strong> tab. Click on an event to see details. Use the <strong>Register</strong> button to join.</p>
              </div>
              
              <div className="bg-gray-700/30 p-3 rounded border border-gray-700">
                <h4 className="font-bold text-white mb-1">Doubles Partners</h4>
                <p>When registering for doubles:</p>
                <ul className="list-disc pl-5 mt-1 space-y-1 text-xs text-gray-400">
                  <li><strong>Invite:</strong> Search for a specific user to invite.</li>
                  <li><strong>Open Team:</strong> Create a "Looking for partner" team.</li>
                  <li><strong>Join:</strong> Request to join an existing open team.</li>
                </ul>
              </div>

              <div className="bg-gray-700/30 p-3 rounded border border-gray-700">
                <h4 className="font-bold text-white mb-1">Game Day</h4>
                <p>Check the <strong>Schedule</strong> tab for your matches.</p>
                <ul className="list-disc pl-5 mt-1 space-y-1 text-xs text-gray-400">
                  <li><strong>Live Status:</strong> See which court you are assigned to.</li>
                  <li><strong>Scoring:</strong> If enabled, tap your match card to submit scores.</li>
                  <li><strong>Validation:</strong> Validate scores submitted by opponents.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 3: For Organizers */}
          <section>
            <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
              <span className="bg-purple-600/20 text-purple-400 text-xs px-2 py-1 rounded">3</span>
              For Organizers
            </h3>
            <ul className="list-disc pl-5 space-y-2 text-sm">
              <li><strong className="text-white">Create Club:</strong> You must be an admin of a Club to host events.</li>
              <li><strong className="text-white">Create Tournament:</strong> Set up divisions (Singles, Doubles), age/rating limits, and formats (Round Robin, Single Elim, etc.).</li>
              <li><strong className="text-white">Manage:</strong> Use the "Manager View" to generate schedules, assign courts, and resolve score disputes.</li>
            </ul>
          </section>

        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-700 bg-gray-850 rounded-b-xl flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
