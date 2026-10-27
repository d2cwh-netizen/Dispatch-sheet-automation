import React, { useState } from 'react';
import {
  Layers,
  CheckCircle2,
  CopyCheck,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Eye,
  CheckSquare,
  Square,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Zap,
} from 'lucide-react';

export default function SummaryTable({
  summary,
  problemRows = [],
  sampleNewRecords = [],
  duplicateRows = [],
  selectedDuplicateRowNumbers = [],
  onToggleDuplicateRow,
  onSelectAllDuplicates,
  onDeselectAllDuplicates,
  onOpenDuplicateModal,
}) {
  const [showProblems, setShowProblems] = useState(true);
  const [showDuplicates, setShowDuplicates] = useState(true);
  const [showSample, setShowSample] = useState(false);

  const { totalRowsInFile = 0, newRecords = 0, alreadyExisting = 0, problemRecords = 0 } = summary || {};
  const selectedDuplicatesCount = selectedDuplicateRowNumbers.length;
  const totalToAppend = newRecords + selectedDuplicatesCount;

  const selectedSet = new Set(selectedDuplicateRowNumbers.map(Number));
  const allDuplicatesSelected =
    duplicateRows.length > 0 && duplicateRows.every((r) => selectedSet.has(Number(r.rowNumber)));

  return (
    <div className="space-y-6">
      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Rows */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total In File</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{totalRowsInFile.toLocaleString()}</p>
            <p className="text-xs text-slate-400 mt-0.5">Rows parsed from upload</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        {/* Ready to Append (New + Force-Pushed Duplicates) */}
        <div
          className={`p-5 rounded-xl border shadow-sm flex items-center justify-between transition-colors ${
            selectedDuplicatesCount > 0
              ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400/20'
              : 'bg-emerald-50/70 border-emerald-200'
          }`}
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Ready to Append</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1">{totalToAppend.toLocaleString()}</p>
            <p className="text-xs text-emerald-600 mt-0.5">
              {selectedDuplicatesCount > 0 ? (
                <span className="font-semibold text-emerald-800">
                  {newRecords} new + {selectedDuplicatesCount} force-pushed
                </span>
              ) : (
                'Clean new records'
              )}
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        {/* Already Existing / Duplicates */}
        <div
          className={`p-5 rounded-xl border shadow-sm flex items-center justify-between transition-colors ${
            duplicateRows.length > 0
              ? 'bg-amber-50/80 border-amber-300'
              : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">Duplicate Records</p>
              {selectedDuplicatesCount > 0 && (
                <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900">
                  {selectedDuplicatesCount} included
                </span>
              )}
            </div>
            <p className="text-2xl font-bold text-amber-700 mt-1">{duplicateRows.length.toLocaleString()}</p>
            <p className="text-xs text-amber-600 mt-0.5">
              {selectedDuplicatesCount > 0
                ? `${duplicateRows.length - selectedDuplicatesCount} skipped, ${selectedDuplicatesCount} force-pushed`
                : 'Skipped by default'}
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
            <CopyCheck className="w-6 h-6" />
          </div>
        </div>

        {/* Problem Records */}
        <div
          className={`p-5 rounded-xl border shadow-sm flex items-center justify-between transition-colors ${
            problemRecords > 0 ? 'bg-rose-50/70 border-rose-200' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wider ${problemRecords > 0 ? 'text-rose-800' : 'text-slate-500'}`}>
              Problem Records
            </p>
            <p className={`text-2xl font-bold mt-1 ${problemRecords > 0 ? 'text-rose-700' : 'text-slate-700'}`}>
              {problemRecords.toLocaleString()}
            </p>
            <p className={`text-xs mt-0.5 ${problemRecords > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
              {problemRecords > 0 ? 'Invalid data (missing ID/Qty)' : 'Zero validation errors'}
            </p>
          </div>
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              problemRecords > 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-500'
            }`}
          >
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Duplicate Records Alert & Quick Action Banner */}
      {duplicateRows.length > 0 && (
        <div className="bg-amber-50/90 border border-amber-300 rounded-xl p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-amber-950">
                    Duplicate Records Detected ({duplicateRows.length} rows)
                  </h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-200 text-amber-900">
                    Choice Available
                  </span>
                </div>
                <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                  These rows match existing records in Google Sheets or repeat within this file. By default, they are skipped.
                  You have the option to <strong className="font-semibold text-amber-950">force-push</strong> them or keep them excluded.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={allDuplicatesSelected ? onDeselectAllDuplicates : onSelectAllDuplicates}
                className="px-3 py-2 text-xs font-semibold rounded-lg border border-amber-300 bg-white hover:bg-amber-100/50 text-amber-900 transition-colors"
              >
                {allDuplicatesSelected ? 'Skip All Duplicates' : 'Force-Push All Duplicates'}
              </button>
              <button
                type="button"
                onClick={onOpenDuplicateModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
              >
                <span>Review & Select ({selectedDuplicatesCount}/{duplicateRows.length})</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Rows Section (Inline Expandable) */}
      {duplicateRows.length > 0 && (
        <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
          <div className="w-full px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between bg-amber-50/60 border-b border-amber-200 gap-3">
            <button
              type="button"
              onClick={() => setShowDuplicates(!showDuplicates)}
              className="flex items-center gap-2 text-left"
            >
              <CopyCheck className="w-5 h-5 text-amber-700" />
              <div>
                <h3 className="font-semibold text-amber-950 text-sm">
                  Duplicate Records ({duplicateRows.length})
                </h3>
                <p className="text-xs text-amber-800">
                  {selectedDuplicatesCount > 0 ? (
                    <span className="font-medium text-emerald-800 flex items-center gap-1 mt-0.5">
                      <Zap className="w-3.5 h-3.5 text-amber-600 inline" />
                      {selectedDuplicatesCount} selected to force-push into final sheet
                    </span>
                  ) : (
                    'Currently excluded — Check any row to force-push'
                  )}
                </p>
              </div>
              {showDuplicates ? (
                <ChevronUp className="w-4 h-4 text-amber-700 ml-2" />
              ) : (
                <ChevronDown className="w-4 h-4 text-amber-700 ml-2" />
              )}
            </button>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={allDuplicatesSelected ? onDeselectAllDuplicates : onSelectAllDuplicates}
                className="text-xs font-medium text-amber-800 hover:text-amber-950 underline px-2 py-1"
              >
                {allDuplicatesSelected ? 'Deselect All' : 'Select All'}
              </button>
              <button
                type="button"
                onClick={onOpenDuplicateModal}
                className="text-xs font-semibold text-amber-700 hover:text-amber-900 border border-amber-300 rounded-md px-2.5 py-1 bg-white hover:bg-amber-50"
              >
                Open Full Modal
              </button>
            </div>
          </div>

          {showDuplicates && (
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold uppercase border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-2.5 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={allDuplicatesSelected}
                        onChange={allDuplicatesSelected ? onDeselectAllDuplicates : onSelectAllDuplicates}
                        className="w-3.5 h-3.5 rounded-sm text-amber-600 border-slate-300 cursor-pointer"
                        title="Select/Deselect all duplicates"
                      />
                    </th>
                    <th className="px-4 py-2.5">Row</th>
                    <th className="px-4 py-2.5">Order ID</th>
                    <th className="px-4 py-2.5">SKU</th>
                    <th className="px-4 py-2.5">Product Name</th>
                    <th className="px-4 py-2.5">Qty</th>
                    <th className="px-4 py-2.5">Amount</th>
                    <th className="px-4 py-2.5">Type</th>
                    <th className="px-4 py-2.5">Action Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {duplicateRows.map((row) => {
                    const isChecked = selectedSet.has(Number(row.rowNumber));
                    return (
                      <tr
                        key={row.rowNumber}
                        onClick={() => onToggleDuplicateRow && onToggleDuplicateRow(row.rowNumber)}
                        className={`cursor-pointer transition-colors ${
                          isChecked ? 'bg-amber-50/70 hover:bg-amber-100/50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-4 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => onToggleDuplicateRow && onToggleDuplicateRow(row.rowNumber)}
                            className="w-3.5 h-3.5 rounded-sm text-amber-600 border-slate-300 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-2.5 font-mono text-slate-600">#{row.rowNumber}</td>
                        <td className="px-4 py-2.5 font-mono font-bold text-slate-900">{row.orderId || '—'}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-700">{row.sku || '—'}</td>
                        <td className="px-4 py-2.5 text-slate-700 max-w-xs truncate" title={row.productName}>
                          {row.productName || '—'}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-900">{row.orderedQty || 1}</td>
                        <td className="px-4 py-2.5 font-medium text-slate-900">
                          {row.amount ? `₹${row.amount}` : '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                              row.duplicateType === 'file_duplicate'
                                ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                : 'bg-amber-100/80 text-amber-800 border border-amber-200'
                            }`}
                          >
                            {row.duplicateType === 'file_duplicate' ? 'In-File' : 'In Sheet'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          {isChecked ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 text-[11px]">
                              <Zap className="w-3 h-3 text-amber-600" />
                              Will Force-Push
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">Will Skip</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Problem Rows Section (if any exist) */}
      {problemRows && problemRows.length > 0 && (
        <div className="bg-white rounded-xl border border-rose-200 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setShowProblems(!showProblems)}
            className="w-full px-6 py-4 flex items-center justify-between bg-rose-50/80 hover:bg-rose-100/70 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
              <h3 className="font-semibold text-rose-900 text-sm">
                Problem Records ({problemRows.length}) — Invalid data excluded
              </h3>
            </div>
            {showProblems ? <ChevronUp className="w-5 h-5 text-rose-600" /> : <ChevronDown className="w-5 h-5 text-rose-600" />}
          </button>

          {showProblems && (
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 font-semibold text-xs uppercase border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="px-6 py-3">Excel Row #</th>
                    <th className="px-6 py-3">Order ID</th>
                    <th className="px-6 py-3">SKU</th>
                    <th className="px-6 py-3">Issue Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {problemRows.map((prob, idx) => (
                    <tr key={idx} className="hover:bg-rose-50/40">
                      <td className="px-6 py-3 font-mono font-medium text-slate-700">Row {prob.rowNumber}</td>
                      <td className="px-6 py-3 font-mono text-slate-800">{prob.orderId || '—'}</td>
                      <td className="px-6 py-3 font-mono text-slate-800">{prob.sku || '—'}</td>
                      <td className="px-6 py-3 text-rose-700 font-medium">{prob.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Preview Sample Rows (Expandable) */}
      {sampleNewRecords && sampleNewRecords.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setShowSample(!showSample)}
            className="w-full px-6 py-3.5 flex items-center justify-between bg-slate-50 hover:bg-slate-100/80 transition-colors text-left border-b border-slate-200"
          >
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-slate-500" />
              <h3 className="font-medium text-slate-700 text-sm">
                Sample New Records (First {sampleNewRecords.length} rows to be written)
              </h3>
            </div>
            {showSample ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
          </button>

          {showSample && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/80 text-slate-600 font-semibold uppercase">
                  <tr>
                    <th className="px-4 py-2.5">Order ID</th>
                    <th className="px-4 py-2.5">SKU</th>
                    <th className="px-4 py-2.5">Product Name</th>
                    <th className="px-4 py-2.5">Qty</th>
                    <th className="px-4 py-2.5">Tracking</th>
                    <th className="px-4 py-2.5">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sampleNewRecords.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-mono font-medium text-slate-800">{item.orderId}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-700">{item.sku}</td>
                      <td className="px-4 py-2.5 text-slate-700 max-w-xs truncate">{item.productName || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-700">{item.orderedQty}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-600">{item.courierTrackingId || '—'}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-800">
                        {item.amount ? `₹${item.amount}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
