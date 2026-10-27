import React from 'react';
import { CheckCircle, PlusCircle, ExternalLink, FileSpreadsheet, Zap, Layers, Check } from 'lucide-react';

export default function BatchDoneScreen({ result, onReset, spreadsheetId }) {
  const { totalRecordsAdded = 0, totalDuplicatesIncluded = 0, sheets = [] } = result || {};

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sm:p-8 text-center max-w-2xl mx-auto space-y-6">
      {/* Icon */}
      <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
        <CheckCircle className="w-10 h-10" />
      </div>

      {/* Title */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Batch Dispatch Update Complete!</h2>
        <p className="text-slate-500 text-sm mt-1">
          {sheets.length} spreadsheet{sheets.length > 1 ? 's' : ''} have been processed and appended to their dedicated tabs in your live Google Sheet.
        </p>
        {totalDuplicatesIncluded > 0 && (
          <p className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300">
            <Zap className="w-3.5 h-3.5 text-amber-600" />
            Included {totalDuplicatesIncluded} duplicate record{totalDuplicatesIncluded > 1 ? 's' : ''} across batch (force-pushed)
          </p>
        )}
      </div>

      {/* Aggregate Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 bg-slate-50 p-4 sm:p-5 rounded-xl border border-slate-100 text-left">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Records Added</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">+{totalRecordsAdded.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-0.5">Across all tabs</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sheets Processed</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{sheets.length}</p>
          <p className="text-xs text-slate-400 mt-0.5">100% updated</p>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Duplicates Force-Pushed</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">+{totalDuplicatesIncluded.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-0.5">By user request</p>
        </div>
      </div>

      {/* Breakdown per Sheet/Tab */}
      <div className="text-left space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 px-1">
          Per-Sheet Tab Breakdown
        </h3>
        <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white">
          {sheets.map((sheet, index) => {
            const mp = sheet.marketplace
              ? sheet.marketplace.charAt(0).toUpperCase() + sheet.marketplace.slice(1)
              : 'Marketplace';

            return (
              <div
                key={sheet.previewToken || `res-${index}`}
                className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center flex-shrink-0 font-bold">
                    <Check className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">{mp}</p>
                    <p className="text-slate-400 truncate max-w-[220px]" title={sheet.fileName}>
                      {sheet.fileName || `Sheet ${index + 1}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-right sm:text-right">
                  <div>
                    <span className="font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200/60">
                      Tab: {sheet.tabName}
                    </span>
                  </div>
                  <div>
                    <p className="font-bold text-emerald-600 text-sm">+{sheet.recordsAdded || 0} rows</p>
                    {sheet.dispatchSheetTotalRowsNow ? (
                      <p className="text-[11px] text-slate-400">
                        Total now: {sheet.dispatchSheetTotalRowsNow}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
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
          <span>Upload Another Batch</span>
        </button>
      </div>
    </div>
  );
}
