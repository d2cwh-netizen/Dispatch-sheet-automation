import React, { useState } from 'react';
import {
  Layers,
  CheckCircle2,
  CopyCheck,
  AlertTriangle,
  ArrowLeft,
  Check,
  Loader2,
  FileSpreadsheet,
  Zap,
  Store,
  Calendar,
  AlertCircle,
  FileText,
} from 'lucide-react';
import SummaryTable from './SummaryTable';
import DuplicateModal from './DuplicateModal';

export default function BatchSummaryReview({
  batchData,
  onConfirmBatch,
  onCancel,
  isConfirming,
  duplicateSelections = {},
  onToggleDuplicateRow,
  onSelectAllDuplicatesForSheet,
  onDeselectAllDuplicatesForSheet,
}) {
  const { sheets = [], aggregateSummary = {} } = batchData || {};
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [modalSheetIndex, setModalSheetIndex] = useState(null);

  const activeSheet = sheets[activeSheetIndex] || sheets[0];

  // Calculate total duplicates selected across all sheets
  let totalSelectedDuplicates = 0;
  sheets.forEach((s) => {
    if (!s.hasError && s.previewToken) {
      const selectedForThis = duplicateSelections[s.previewToken] || [];
      totalSelectedDuplicates += selectedForThis.length;
    }
  });

  const totalNewRecords = aggregateSummary.newRecords || 0;
  const totalToAppendAll = totalNewRecords + totalSelectedDuplicates;

  const validSheets = sheets.filter((s) => !s.hasError);

  const handleConfirmClick = () => {
    const sheetConfirmations = validSheets.map((s) => ({
      previewToken: s.previewToken,
      includeDuplicates: (duplicateSelections[s.previewToken] || []).length > 0,
      selectedDuplicateRowNumbers: duplicateSelections[s.previewToken] || [],
    }));

    onConfirmBatch({ sheetConfirmations });
  };

  const selectedForActive = (activeSheet && duplicateSelections[activeSheet.previewToken]) || [];

  return (
    <div className="space-y-6">
      {/* Aggregate Top Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
        {/* Total Sheets */}
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Sheets in Batch</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{sheets.length}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {validSheets.length} ready {sheets.length - validSheets.length > 0 ? `• ${sheets.length - validSheets.length} failed` : ''}
            </p>
          </div>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
            <Layers className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </div>

        {/* Total In Files */}
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Rows</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{(aggregateSummary.totalRowsInFile || 0).toLocaleString()}</p>
            <p className="text-xs text-slate-400 mt-0.5">Across all sheets</p>
          </div>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <FileSpreadsheet className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </div>

        {/* Ready to Append */}
        <div
          className={`p-4 sm:p-5 rounded-xl border shadow-sm flex items-center justify-between transition-colors ${
            totalSelectedDuplicates > 0
              ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400/20'
              : 'bg-emerald-50/70 border-emerald-200'
          }`}
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Ready to Append</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1">{totalToAppendAll.toLocaleString()}</p>
            <p className="text-xs text-emerald-600 mt-0.5">
              {totalSelectedDuplicates > 0 ? (
                <span className="font-semibold text-emerald-800">
                  {totalNewRecords} new + {totalSelectedDuplicates} dupes
                </span>
              ) : (
                'Clean new records'
              )}
            </p>
          </div>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </div>

        {/* Duplicates */}
        <div
          className={`p-4 sm:p-5 rounded-xl border shadow-sm flex items-center justify-between transition-colors ${
            (aggregateSummary.duplicateRecords || 0) > 0
              ? 'bg-amber-50/80 border-amber-300'
              : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">Total Duplicates</p>
            <p className="text-2xl font-bold text-amber-700 mt-1">
              {(aggregateSummary.duplicateRecords || 0).toLocaleString()}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {totalSelectedDuplicates > 0
                ? `${totalSelectedDuplicates} force-pushed`
                : 'Skipped by default'}
            </p>
          </div>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
            <CopyCheck className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </div>

        {/* Problem Rows */}
        <div
          className={`p-4 sm:p-5 rounded-xl border shadow-sm flex items-center justify-between col-span-2 sm:col-span-1 transition-colors ${
            (aggregateSummary.problemRecords || 0) > 0
              ? 'bg-red-50/80 border-red-300'
              : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-red-800">Problem Records</p>
            <p className="text-2xl font-bold text-red-700 mt-1">
              {(aggregateSummary.problemRecords || 0).toLocaleString()}
            </p>
            <p className="text-xs text-red-600 mt-0.5">Missing fields / invalid qty</p>
          </div>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-red-100 text-red-700 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </div>
      </div>

      {/* Sheet Tabs Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-2 shadow-xs">
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Select Sheet to Inspect ({sheets.length})
          </span>
          <span className="text-xs text-slate-400">
            Click any tab below to review its rows & duplicates
          </span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {sheets.map((sheet, index) => {
            const isActive = index === activeSheetIndex;
            const mpName = sheet.marketplace
              ? sheet.marketplace.charAt(0).toUpperCase() + sheet.marketplace.slice(1)
              : 'Unknown';
            const selectedCount = (duplicateSelections[sheet.previewToken] || []).length;
            const newCount = sheet.summary?.newRecords || 0;

            return (
              <button
                key={sheet.previewToken || `sheet-${index}`}
                type="button"
                onClick={() => setActiveSheetIndex(index)}
                className={`flex-shrink-0 text-left px-3.5 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-blue-50/80 border-blue-500 text-blue-900 ring-2 ring-blue-500/20 shadow-xs'
                    : sheet.hasError
                    ? 'bg-red-50/60 border-red-200 text-red-800 hover:bg-red-50'
                    : 'bg-slate-50/70 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900">{mpName}</span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-500 truncate max-w-[130px]" title={sheet.fileName}>
                    {sheet.fileName}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {sheet.hasError ? (
                    <span className="text-[10px] font-bold text-red-600 flex items-center gap-0.5">
                      <AlertCircle className="w-3 h-3" /> Error
                    </span>
                  ) : (
                    <>
                      <span className="text-[11px] text-emerald-700 font-semibold">
                        +{newCount} new
                      </span>
                      {selectedCount > 0 && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-bold">
                          +{selectedCount} dupes
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400">
                        Tab: {sheet.targetTabName || sheet.tabName}
                      </span>
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Sheet Detail View */}
      {activeSheet && (
        <div>
          {activeSheet.hasError ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-900 space-y-2">
              <div className="flex items-center gap-2 text-red-700 font-bold text-base">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span>Error Parsing "{activeSheet.fileName}"</span>
              </div>
              <p className="text-sm text-red-800">{activeSheet.error}</p>
              <p className="text-xs text-red-600">
                This file cannot be appended. You can still confirm the other valid sheets in this batch.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Sheet Context Bar */}
              <div className="bg-white px-5 py-3 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                    <Store className="w-4 h-4 text-slate-500" />
                    {activeSheet.marketplace ? activeSheet.marketplace.toUpperCase() : ''}
                  </span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-600 font-medium flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    {activeSheet.fileName}
                  </span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-600 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    {activeSheet.orderDate}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/80">
                    Destination Tab: {activeSheet.targetTabName}
                  </span>
                </div>
              </div>

              {/* Individual Sheet Summary Table */}
              <SummaryTable
                summary={activeSheet.summary}
                problemRows={activeSheet.problemRows}
                sampleNewRecords={activeSheet.sampleNewRecords}
                duplicateRows={activeSheet.duplicateRows || []}
                selectedDuplicateRowNumbers={selectedForActive}
                onToggleDuplicateRow={(rowNum) =>
                  onToggleDuplicateRow(activeSheet.previewToken, rowNum)
                }
                onSelectAllDuplicates={() =>
                  onSelectAllDuplicatesForSheet(activeSheet.previewToken)
                }
                onDeselectAllDuplicates={() =>
                  onDeselectAllDuplicatesForSheet(activeSheet.previewToken)
                }
                onOpenDuplicateModal={() => setModalSheetIndex(activeSheetIndex)}
              />
            </div>
          )}
        </div>
      )}

      {/* Duplicate Modal for the active sheet */}
      {modalSheetIndex !== null && sheets[modalSheetIndex] && (
        <DuplicateModal
          isOpen={true}
          onClose={() => setModalSheetIndex(null)}
          duplicateRows={sheets[modalSheetIndex].duplicateRows || []}
          selectedRowNumbers={duplicateSelections[sheets[modalSheetIndex].previewToken] || []}
          onToggleRow={(rowNum) =>
            onToggleDuplicateRow(sheets[modalSheetIndex].previewToken, rowNum)
          }
          onSelectAll={() =>
            onSelectAllDuplicatesForSheet(sheets[modalSheetIndex].previewToken)
          }
          onDeselectAll={() =>
            onDeselectAllDuplicatesForSheet(sheets[modalSheetIndex].previewToken)
          }
        />
      )}

      {/* Batch Confirm Bar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col sm:flex-row items-center justify-between gap-4 sticky bottom-4 z-20">
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

          <div className="text-xs text-slate-500 hidden md:flex items-center gap-2">
            <span>
              Batch of <span className="font-semibold text-slate-700">{validSheets.length} sheet(s)</span>
            </span>
            <span>•</span>
            <span className="text-slate-600">
              Tabs: {validSheets.map((s) => s.targetTabName).filter(Boolean).join(', ')}
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3 w-full sm:w-auto justify-end">
          {totalSelectedDuplicates > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300">
              <Zap className="w-3.5 h-3.5 text-amber-600" />
              Including {totalSelectedDuplicates} duplicate{totalSelectedDuplicates > 1 ? 's' : ''} across batch
            </span>
          )}

          {totalToAppendAll === 0 && (
            <span className="text-xs text-amber-700 font-medium flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              No records to append across batch
            </span>
          )}

          <button
            type="button"
            onClick={handleConfirmClick}
            disabled={totalToAppendAll === 0 || isConfirming}
            className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 text-white text-sm font-semibold rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              totalSelectedDuplicates > 0
                ? 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800 focus:ring-amber-500'
                : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 focus:ring-emerald-500'
            } disabled:bg-slate-300 disabled:cursor-not-allowed`}
          >
            {isConfirming ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Appending All Sheets to Google Sheets...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>
                  Confirm & Append All ({totalToAppendAll} across {validSheets.length} sheets)
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
