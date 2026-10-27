import React, { useState, useRef } from 'react';
import {
  Upload,
  FileSpreadsheet,
  Calendar,
  Store,
  ArrowRight,
  Loader2,
  AlertCircle,
  Layers,
  FileText,
  Trash2,
  Plus,
  CheckCircle2,
} from 'lucide-react';

const MARKETPLACES = [
  { id: 'amazon', name: 'Amazon', badge: 'Active' },
  { id: 'flipkart', name: 'Flipkart', badge: 'Active' },
  { id: 'nykaa', name: 'Nykaa', badge: 'Active' },
  { id: 'myntra', name: 'Myntra', badge: 'Active' },
];

function detectMarketplace(filename = '') {
  const lower = String(filename).toLowerCase();
  if (lower.includes('amazon')) return 'amazon';
  if (lower.includes('flipkart')) return 'flipkart';
  if (lower.includes('nykaa')) return 'nykaa';
  if (lower.includes('myntra')) return 'myntra';
  return 'amazon'; // safe fallback
}

export default function UploadForm({
  onPreviewSubmit,
  onBatchPreviewSubmit,
  isLoading,
  tabNames,
}) {
  const [uploadMode, setUploadMode] = useState('single'); // 'single' | 'batch'

  // Single mode state
  const [singleMarketplace, setSingleMarketplace] = useState('amazon');
  const [singleOrderDate, setSingleOrderDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [singleFile, setSingleFile] = useState(null);

  // Batch mode state
  const [batchDefaultDate, setBatchDefaultDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [batchFiles, setBatchFiles] = useState([]); // Array<{ id, file, marketplace, orderDate }>

  const [dragActive, setDragActive] = useState(false);
  const [clientError, setClientError] = useState('');
  const singleFileInputRef = useRef(null);
  const batchFileInputRef = useRef(null);

  const isValidSpreadsheet = (file) => {
    const lowerName = file.name.toLowerCase();
    return lowerName.endsWith('.xlsx') || lowerName.endsWith('.csv');
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;

    const droppedFiles = Array.from(e.dataTransfer.files);

    if (uploadMode === 'single') {
      // If user drops multiple files while on single mode, auto-switch to batch mode!
      if (droppedFiles.length > 1) {
        addFilesToBatch(droppedFiles);
        setUploadMode('batch');
        return;
      }
      validateAndSetSingleFile(droppedFiles[0]);
    } else {
      addFilesToBatch(droppedFiles);
    }
  };

  const validateAndSetSingleFile = (selectedFile) => {
    setClientError('');
    if (!isValidSpreadsheet(selectedFile)) {
      setClientError('Invalid file type. Please upload an Excel (.xlsx) or CSV (.csv) file.');
      setSingleFile(null);
      return;
    }
    setSingleFile(selectedFile);
  };

  const handleSingleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetSingleFile(e.target.files[0]);
    }
  };

  const addFilesToBatch = (fileList) => {
    setClientError('');
    const newItems = [];
    const invalidNames = [];

    fileList.forEach((file) => {
      if (isValidSpreadsheet(file)) {
        newItems.push({
          id: `${file.name}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          file,
          marketplace: detectMarketplace(file.name),
          orderDate: batchDefaultDate,
        });
      } else {
        invalidNames.push(file.name);
      }
    });

    if (invalidNames.length > 0) {
      setClientError(
        `Skipped ${invalidNames.length} invalid file(s): only .xlsx and .csv files are supported.`
      );
    }

    if (newItems.length > 0) {
      setBatchFiles((prev) => [...prev, ...newItems]);
    }
  };

  const handleBatchFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToBatch(Array.from(e.target.files));
    }
    // Reset file input so user can choose same files again if needed
    if (batchFileInputRef.current) {
      batchFileInputRef.current.value = '';
    }
  };

  const handleUpdateBatchItemMarketplace = (id, marketplace) => {
    setBatchFiles((prev) =>
      prev.map((item) => (item.id === id ? { ...item, marketplace } : item))
    );
  };

  const handleUpdateBatchItemDate = (id, orderDate) => {
    setBatchFiles((prev) =>
      prev.map((item) => (item.id === id ? { ...item, orderDate } : item))
    );
  };

  const handleRemoveBatchItem = (id) => {
    setBatchFiles((prev) => prev.filter((item) => item.id !== id));
  };

  const handleApplyBatchDateToAll = (newDate) => {
    setBatchDefaultDate(newDate);
    setBatchFiles((prev) => prev.map((item) => ({ ...item, orderDate: newDate })));
  };

  const handleClearBatch = () => {
    setBatchFiles([]);
    setClientError('');
  };

  const handleSingleSubmit = (e) => {
    e.preventDefault();
    setClientError('');

    if (!singleFile) {
      setClientError('Please choose or drop an .xlsx or .csv file to proceed.');
      return;
    }

    if (!singleOrderDate) {
      setClientError('Please select a valid Order Date.');
      return;
    }

    onPreviewSubmit({
      file: singleFile,
      marketplace: singleMarketplace,
      orderDate: singleOrderDate,
    });
  };

  const handleBatchSubmit = (e) => {
    e.preventDefault();
    setClientError('');

    if (batchFiles.length === 0) {
      setClientError('Please add at least one .xlsx or .csv file to the batch.');
      return;
    }

    const invalidDateItem = batchFiles.find((item) => !item.orderDate);
    if (invalidDateItem) {
      setClientError(`Please provide a valid Order Date for "${invalidDateItem.file.name}".`);
      return;
    }

    onBatchPreviewSubmit({
      filesWithMeta: batchFiles.map(({ file, marketplace, orderDate }) => ({
        file,
        marketplace,
        orderDate,
      })),
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all">
      {/* Header with Mode Switcher */}
      <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Upload Dispatch Orders</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Ingest and deduplicate marketplace spreadsheets before appending to live Google Sheets.
          </p>
        </div>

        {/* Upload Mode Switcher */}
        <div className="inline-flex p-1 bg-slate-100/90 border border-slate-200 rounded-lg self-start sm:self-auto shadow-inner">
          <button
            type="button"
            onClick={() => {
              setUploadMode('single');
              setClientError('');
            }}
            disabled={isLoading}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              uploadMode === 'single'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
            <span>Single Sheet</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setUploadMode('batch');
              setClientError('');
            }}
            disabled={isLoading}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              uploadMode === 'batch'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-emerald-600" />
            <span>Multiple Sheets (Batch)</span>
            {batchFiles.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px] flex items-center justify-center font-bold">
                {batchFiles.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {clientError && (
        <div className="mx-6 mt-5 flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm animate-fade-in">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-500" />
          <span>{clientError}</span>
        </div>
      )}

      {/* SINGLE SHEET FORM */}
      {uploadMode === 'single' && (
        <form onSubmit={handleSingleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Marketplace Selector */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Store className="w-4 h-4 text-slate-500" />
                  Source Marketplace
                </label>
                {tabNames && tabNames[singleMarketplace] && (
                  <span className="text-xs font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md border border-blue-200/60">
                    Target Tab: {tabNames[singleMarketplace]}
                  </span>
                )}
              </div>
              <select
                value={singleMarketplace}
                onChange={(e) => setSingleMarketplace(e.target.value)}
                disabled={isLoading}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-800 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors disabled:bg-slate-100"
              >
                {MARKETPLACES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {tabNames && tabNames[m.id] ? `(Tab: ${tabNames[m.id]})` : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1.5">
                Determines column mapping and routes orders to its dedicated sheet tab.
              </p>
            </div>

            {/* Order Date Picker */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                <Calendar className="w-4 h-4 text-slate-500" />
                Order Date
              </label>
              <input
                type="date"
                value={singleOrderDate}
                onChange={(e) => setSingleOrderDate(e.target.value)}
                disabled={isLoading}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-800 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors disabled:bg-slate-100"
              />
              <p className="text-xs text-slate-400 mt-1.5">
                Applies uniformly as the Order Date for all rows in this upload batch.
              </p>
            </div>
          </div>

          {/* File Drag & Drop Zone */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
              <FileSpreadsheet className="w-4 h-4 text-slate-500" />
              Marketplace File (.xlsx, .csv)
            </label>
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => singleFileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-150 ${
                dragActive
                  ? 'border-blue-500 bg-blue-50/50'
                  : singleFile
                  ? 'border-emerald-400 bg-emerald-50/30 hover:border-emerald-500'
                  : 'border-slate-300 hover:border-slate-400 bg-slate-50/50'
              }`}
            >
              <input
                ref={singleFileInputRef}
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain,application/csv"
                onChange={handleSingleFileChange}
                className="hidden"
              />

              {singleFile ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                    <FileSpreadsheet className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{singleFile.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {(singleFile.size / 1024).toFixed(1)} KB — Click or drag another file to replace
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">
                      <span className="text-blue-600 font-semibold hover:underline">Click to browse</span> or drag and drop your spreadsheet here
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Excel (.xlsx) or CSV (.csv) files up to 50MB • Drop multiple files to switch to batch mode
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Button */}
          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={isLoading || !singleFile}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Checking Live Google Sheet...</span>
                </>
              ) : (
                <>
                  <span>Preview & Check Duplicates</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* MULTIPLE SHEETS (BATCH) FORM */}
      {uploadMode === 'batch' && (
        <form onSubmit={handleBatchSubmit} className="p-6 space-y-6">
          {/* Default Date banner */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Calendar className="w-4 h-4 text-emerald-600" />
                Default Batch Order Date
              </label>
              <p className="text-xs text-slate-500 mt-0.5">
                Automatically pre-fills the dispatch date for all uploaded sheets (customizable per file below).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={batchDefaultDate}
                onChange={(e) => handleApplyBatchDateToAll(e.target.value)}
                disabled={isLoading}
                className="px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-xs"
              />
            </div>
          </div>

          {/* Multi-file Drag & Drop Area */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <Layers className="w-4 h-4 text-slate-500" />
                Drop Multiple Spreadsheets (.xlsx, .csv)
              </label>
              {batchFiles.length > 0 && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {batchFiles.length} sheet{batchFiles.length > 1 ? 's' : ''} queued
                </span>
              )}
            </div>

            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => batchFileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-150 ${
                dragActive
                  ? 'border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-300/40'
                  : 'border-slate-300 hover:border-emerald-400 bg-slate-50/40 hover:bg-emerald-50/20'
              }`}
            >
              <input
                ref={batchFileInputRef}
                type="file"
                multiple
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain,application/csv"
                onChange={handleBatchFileChange}
                className="hidden"
              />

              <div className="flex flex-col items-center gap-2.5">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-xs">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    <span className="text-emerald-600 font-semibold hover:underline">Click to browse multiple files</span> or drag & drop all sheets here
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Select multiple Amazon, Flipkart, Nykaa, or Myntra export files at once (.xlsx, .csv)
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Queued Files List */}
          {batchFiles.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-500" />
                  Files Queued for Batch Processing ({batchFiles.length})
                </h3>
                <button
                  type="button"
                  onClick={handleClearBatch}
                  disabled={isLoading}
                  className="text-xs font-medium text-slate-500 hover:text-red-600 transition-colors"
                >
                  Clear All
                </button>
              </div>

              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                {batchFiles.map((item, idx) => {
                  const targetTab = tabNames && tabNames[item.marketplace] ? tabNames[item.marketplace] : item.marketplace;
                  return (
                    <div
                      key={item.id}
                      className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center flex-shrink-0 font-bold text-xs border border-emerald-100">
                          {idx + 1}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate" title={item.file.name}>
                            {item.file.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                            <span>{(item.file.size / 1024).toFixed(1)} KB</span>
                            <span>•</span>
                            <span className="text-emerald-700 font-medium">Tab: {targetTab}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5">
                        {/* Marketplace selector */}
                        <div className="min-w-[130px]">
                          <select
                            value={item.marketplace}
                            onChange={(e) => handleUpdateBatchItemMarketplace(item.id, e.target.value)}
                            disabled={isLoading}
                            className="w-full text-xs font-semibold px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-emerald-500"
                          >
                            {MARKETPLACES.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Order Date */}
                        <div className="min-w-[135px]">
                          <input
                            type="date"
                            value={item.orderDate}
                            onChange={(e) => handleUpdateBatchItemDate(item.id, e.target.value)}
                            disabled={isLoading}
                            className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>

                        {/* Remove button */}
                        <button
                          type="button"
                          onClick={() => handleRemoveBatchItem(item.id)}
                          disabled={isLoading}
                          title="Remove file"
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add more button */}
              <div className="flex justify-start pt-1">
                <button
                  type="button"
                  onClick={() => batchFileInputRef.current?.click()}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100/70 border border-emerald-200/80 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add More Files</span>
                </button>
              </div>
            </div>
          )}

          {/* Action Button */}
          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={isLoading || batchFiles.length === 0}
              className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Checking Google Sheets for {batchFiles.length} Sheets...</span>
                </>
              ) : (
                <>
                  <span>
                    Preview & Check Duplicates ({batchFiles.length} Sheet{batchFiles.length !== 1 ? 's' : ''})
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
