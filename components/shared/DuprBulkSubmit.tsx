/**
 * DuprBulkSubmit - Bulk submission controls for DUPR panel
 *
 * Provides buttons for:
 * - Submit All Ready Matches
 * - Retry Failed Submissions
 *
 * @version V07.10
 * @file components/shared/DuprBulkSubmit.tsx
 */


interface DuprBulkSubmitProps {
  readyCount: number;
  failedCount: number;
  onSubmitAll: () => Promise<void>;
  onRetryFailed: () => Promise<void>;
  isSubmitting: boolean;
  isRetrying: boolean;
}

export function DuprBulkSubmit({
  readyCount,
  failedCount,
  onSubmitAll,
  onRetryFailed,
  isSubmitting,
  isRetrying,
}: DuprBulkSubmitProps) {
  const handleSubmitAll = async () => {
    try {
      await onSubmitAll();
    } catch (error) {
      console.error('Failed to submit all:', error);
    }
  };

  const handleRetryFailed = async () => {
    try {
      await onRetryFailed();
    } catch (error) {
      console.error('Failed to retry:', error);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Submit All Ready */}
      <button
        onClick={handleSubmitAll}
        disabled={isSubmitting || readyCount === 0}
        className={`
          inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all
          ${readyCount > 0 && !isSubmitting
            ? 'bg-lime-500 text-gray-900 hover:bg-lime-400'
            : 'bg-gray-700 text-gray-400 cursor-not-allowed'
          }
        `}
      >
        {isSubmitting ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Submitting...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Submit All Ready ({readyCount})
          </>
        )}
      </button>

      {/* Retry Failed */}
      {failedCount > 0 && (
        <button
          onClick={handleRetryFailed}
          disabled={isRetrying}
          className={`
            inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all
            ${!isRetrying
              ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
              : 'bg-gray-700 text-gray-400 cursor-not-allowed'
            }
          `}
        >
          {isRetrying ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Retrying...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Retry Failed ({failedCount})
            </>
          )}
        </button>
      )}

      {/* Status info */}
      {readyCount === 0 && failedCount === 0 && (
        <span className="text-sm text-gray-500">
          No matches ready for submission
        </span>
      )}
    </div>
  );
}

export default DuprBulkSubmit;
