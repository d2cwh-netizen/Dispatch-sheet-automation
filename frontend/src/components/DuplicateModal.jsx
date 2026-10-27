import React, { useState, useMemo } from 'react';
import { X, AlertTriangle, CheckSquare, Square, Search, CopyCheck, FileText, ArrowRight } from 'lucide-react';

export default function DuplicateModal({
  isOpen,
  onClose,
  duplicateRows = [],
  selectedRowNumbers = [],
  onToggleRow,
  onSelectAll,
  onDeselectAll,
}) {
  const [searchTerm, setSearchTerm] = useState('');

  const selectedSet = useMemo(() => new Set(selectedRowNumbers.map(Number)), [selectedRowNumbers]);

  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return duplicateRows;
    const term = searchTerm.toLowerCase().trim();
    return duplicateRows.filter((r) => {
      const orderId = String(r.orderId || '').toLowerCase();
      const sku = String(r.sku || '').toLowerCase();
      const name = String(r.productName || '').toLowerCase();
      return orderId.includes(term) || sku.includes(term) || name.includes(term);
    });
  }, [duplicateRows, searchTerm]);

  if (!isOpen) return null;

  const allFilteredSelected =
    filteredRows.length > 0 && filteredRows.every((r) => selectedSet.has(Number(r.rowNumber)));

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-amber-50/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-amber-950 flex items-center gap-2">
                Duplicate Records Detected ({duplicateRows.length})
              </h2>
              <p className="text-xs text-amber-800 mt-0.5">
                Choose whether to force-push these rows or keep them excluded from the final sheet.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-white/80 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar: Search & Bulk selection */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by Order ID, SKU, product..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={allFilteredSelected ? onDeselectAll : onSelectAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
            >
              {allFilteredSelected ? (
                <>
                  <Square className="w-3.5 h-3.5 text-slate-500" />
                  <span>Deselect All</span>
                </>
              ) : (
                <>
                  <CheckSquare className="w-3.5 h-3.5 text-amber-600" />
                  <span>Select All ({duplicateRows.length})</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-y-auto max-h-[50vh] divide-y divide-slate-100">
          {filteredRows.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              No duplicate records match your search filter.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100/80 text-slate-600 font-semibold uppercase sticky top-0 z-10 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 w-12 text-center">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="px-4 py-2.5">Row</th>
                  <th className="px-4 py-2.5">Order ID</th>
                  <th className="px-4 py-2.5">SKU</th>
                  <th className="px-4 py-2.5">Product Name</th>
                  <th className="px-4 py-2.5">Qty</th>
                  <th className="px-4 py-2.5">Amount</th>
                  <th className="px-4 py-2.5">Duplicate Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row) => {
                  const isChecked = selectedSet.has(Number(row.rowNumber));
                  return (
                    <tr
                      key={row.rowNumber}
                      onClick={() => onToggleRow(row.rowNumber)}
                      className={`cursor-pointer transition-colors ${
                        isChecked ? 'bg-amber-50/70 hover:bg-amber-100/50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => onToggleRow(row.rowNumber)}
                          className="w-4 h-4 rounded-sm text-amber-600 focus:ring-amber-500 border-slate-300 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-slate-600">#{row.rowNumber}</td>
                      <td className="px-4 py-3 font-mono font-bold text-slate-900">{row.orderId || '—'}</td>
                      <td className="px-4 py-3 font-mono text-slate-700">{row.sku || '—'}</td>
                      <td className="px-4 py-3 text-slate-700 max-w-xs truncate" title={row.productName}>
                        {row.productName || '—'}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{row.orderedQty || 1}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {row.amount ? `₹${row.amount}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            row.duplicateType === 'file_duplicate'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : 'bg-amber-100/80 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {row.duplicateType === 'file_duplicate'
                            ? 'In-File Duplicate'
                            : 'Already in Sheet'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-600">
            <span className="font-semibold text-slate-800">{selectedRowNumbers.length}</span> of{' '}
            <span className="font-semibold text-slate-800">{duplicateRows.length}</span> duplicate rows selected to
            force-push.
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onDeselectAll}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Skip All Duplicates
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
            >
              <span>Done Selecting</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
