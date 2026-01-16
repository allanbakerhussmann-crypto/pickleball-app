/**
 * AdminFinancePage - Platform Finance Dashboard
 *
 * Admin-only page for platform-wide financial oversight.
 * Shows aggregated data across all clubs, reconciliation tools,
 * and platform revenue tracking.
 *
 * @version 07.50
 * @file pages/AdminFinancePage.tsx
 */

import React from 'react';
import { PlatformFinanceTab } from '../components/admin/PlatformFinanceTab';

const AdminFinancePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <PlatformFinanceTab />
      </div>
    </div>
  );
};

export default AdminFinancePage;
