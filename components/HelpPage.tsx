
import React from 'react';

export const HelpPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8 animate-fade-in">
      <button onClick={onBack} className="text-gray-400 hover:text-white mb-6 flex items-center gap-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        Back
      </button>

      <div className="bg-gray-800 rounded-lg p-8 border border-gray-700">
        <h1 className="text-3xl font-bold text-white mb-6">Help & FAQ</h1>

        <div className="space-y-8">
          <section>
            <h2 className="text-xl font-bold text-green-400 mb-3">Creating a League</h2>
            <p className="text-gray-300 text-sm leading-relaxed mb-2">
              As an organizer, you can create new leagues by navigating to the <strong>Leagues</strong> tab and clicking "Create New". 
              Fill in the basic details like name, date range, and venue.
            </p>
            <p className="text-gray-300 text-sm leading-relaxed">
              <strong>Settings:</strong> Customize your point system (e.g., 3 points for a win, 1 for a draw). Choose your tie-breaker rules carefully—point difference is the most common default.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-green-400 mb-3">Scheduling & Matches</h2>
            <p className="text-gray-300 text-sm leading-relaxed mb-2">
              Once you have entrants, use the <strong>Generate Schedule</strong> button in the League Manager. This will create a round-robin fixture list for all players in each division.
            </p>
            <p className="text-gray-300 text-sm leading-relaxed">
              <strong>Scoring:</strong> Players can enter their own scores via the schedule view. Opponents will be notified to verify the score. If there's a disagreement, they can dispute it, alerting you to intervene.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-green-400 mb-3">Verification Process</h2>
            <ul className="list-disc list-inside text-gray-300 text-sm space-y-2">
              <li>When a player submits a score, the status becomes <strong>Pending Confirmation</strong>.</li>
              <li>The opponent receives a notification to confirm or dispute.</li>
              <li>Once confirmed, the league table updates automatically.</li>
              <li>If disputed, the status changes to <strong>Disputed</strong>, and the organizer must resolve it manually.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-green-400 mb-3">Divisions</h2>
            <p className="text-gray-300 text-sm leading-relaxed">
              You can create multiple divisions (e.g., A Grade, B Grade) within a single league. Entrants are assigned to a specific division, and schedules/standings are kept separate for each division.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};
