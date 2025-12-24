/**
 * Scoring Dashboard Page
 *
 * Route: /dashboard/score
 * Standalone scoring tab accessible from the dashboard.
 *
 * FILE: pages/ScoringDashboardPage.tsx
 * VERSION: V06.03
 */

import React from 'react';
import { StandaloneScoring } from '../components/scoring';

const ScoringDashboardPage: React.FC = () => {
  return (
    <div className="max-w-2xl mx-auto">
      <StandaloneScoring />
    </div>
  );
};

export default ScoringDashboardPage;
