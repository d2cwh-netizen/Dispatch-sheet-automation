import React from 'react';
import { CheckCircle, PlusCircle, ExternalLink, FileSpreadsheet, Zap } from 'lucide-react';

export default function DoneScreen({ result, onReset, spreadsheetId }) {
  const { recordsAdded = 0, duplicatesIncluded = 0, dispatchSheetTotalRowsNow = 0, tabName } = result || {};

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center max-w-xl mx-auto space-y-6">
      <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
        <CheckCircle className="w-10 h-10" />
      </div>

      <div>
        <h2 className="text-2xl font-bold text-slate-800">Dispatch Sheet Updated!</h2>
        <p className="text-slate-500 text-sm mt-1">
          {tabName ? (
            <>
              The records have been appended directly to the <span className="font-semibold text-slate-800">"{tabName}"</span> tab in your live Google Sheet.
            </>
          ) : (
            'The records have been appended directly to your live Google Sheet.'
          )}
        </p>
        {duplicatesIncluded > 0 && (
          <p className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300">
            <Zap className="w-3.5 h-3.5 text-amber-600" />
            Included {duplicatesIncluded} duplicate record{duplicatesIncluded > 1 ? 's' : ''} (force-pushed)
          </p>
        )}
      </div>

      {/* Result Metrics */}
      <div className="grid grid-cols-2 gap-4 bg-slate-50 p-5 rounded-xl border border-slate-100 text-left">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Records Appended</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">+{recordsAdded.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {duplicatesIncluded > 0
              ? `${recordsAdded - duplicatesIncluded} new + ${duplicatesIncluded} duplicates`
              : 'Clean rows written'}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sheet Total Rows Now</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{dispatchSheetTotalRowsNow.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-0.5">Including header row</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
        {spreadsheetId && (
          <a
            href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-sm rounded-lg transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Open Google Sheet</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </a>
        )}

        <button
          type="button"
          onClick={onReset}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Upload Another File</span>
        </button>
      </div>
    </div>
  );
}
