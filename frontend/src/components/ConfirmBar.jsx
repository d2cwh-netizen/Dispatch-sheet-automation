import React from 'react';
import { ArrowLeft, Check, Loader2, AlertCircle, Zap } from 'lucide-react';

export default function ConfirmBar({
  newRecordsCount = 0,
  duplicatesToIncludeCount = 0,
  onConfirm,
  onCancel,
  isConfirming,
  marketplaceName,
  orderDate,
  targetTabName,
}) {
  const totalToAppend = newRecordsCount + duplicatesToIncludeCount;
  const hasRecordsToAppend = totalToAppend > 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isConfirming}
          className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back / Re-upload</span>
        </button>

        <div className="text-xs text-slate-500 hidden sm:flex items-center gap-2">
          <span>
            <span className="font-semibold text-slate-700">{marketplaceName}</span> upload for{' '}
            <span className="font-semibold text-slate-700">{orderDate}</span>
          </span>
          {targetTabName && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              Destination Tab: {targetTabName}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3 w-full sm:w-auto justify-end">
        {duplicatesToIncludeCount > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300">
            <Zap className="w-3.5 h-3.5 text-amber-600" />
            Including {duplicatesToIncludeCount} duplicate{duplicatesToIncludeCount > 1 ? 's' : ''}
          </span>
        )}

        {!hasRecordsToAppend && (
          <span className="text-xs text-amber-700 font-medium flex items-center gap-1">
            <AlertCircle className="w-4 h-4" />
            No records to append (all duplicates skipped)
          </span>
        )}

        <button
          type="button"
          onClick={onConfirm}
          disabled={!hasRecordsToAppend || isConfirming}
          className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 text-white text-sm font-semibold rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            duplicatesToIncludeCount > 0
              ? 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800 focus:ring-amber-500'
              : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 focus:ring-emerald-500'
          } disabled:bg-slate-300 disabled:cursor-not-allowed`}
        >
          {isConfirming ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Appending to Google Sheet...</span>
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              <span>
                {duplicatesToIncludeCount > 0 && newRecordsCount === 0
                  ? `Force-Push (${duplicatesToIncludeCount} Duplicates)`
                  : `Confirm & Append (${totalToAppend})`}
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
