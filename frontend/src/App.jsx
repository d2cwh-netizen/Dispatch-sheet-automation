import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, ShieldAlert, WifiOff, RefreshCw, KeyRound, AlertCircle } from 'lucide-react';
import UploadForm from './components/UploadForm';
import SummaryTable from './components/SummaryTable';
import ConfirmBar from './components/ConfirmBar';
import DoneScreen from './components/DoneScreen';
import DuplicateModal from './components/DuplicateModal';
import BatchSummaryReview from './components/BatchSummaryReview';
import BatchDoneScreen from './components/BatchDoneScreen';
import {
  uploadAndPreview,
  confirmBatch,
  uploadAndPreviewBatch,
  confirmBatchUpload,
  fetchHealth,
} from './api/dispatchApi';

export default function App() {
  const [step, setStep] = useState('upload'); // 'upload' | 'summary' | 'done'
  const [mode, setMode] = useState('single'); // 'single' | 'batch'

  // Single upload state
  const [uploadParams, setUploadParams] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [confirmData, setConfirmData] = useState(null);
  const [selectedDuplicateRowNumbers, setSelectedDuplicateRowNumbers] = useState([]);
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);

  // Batch upload state
  const [batchPreviewData, setBatchPreviewData] = useState(null);
  const [batchConfirmData, setBatchConfirmData] = useState(null);
  const [batchDuplicateSelections, setBatchDuplicateSelections] = useState({}); // { [previewToken]: number[] }

  const [isLoading, setIsLoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [errorInfo, setErrorInfo] = useState(null);
  const [healthStatus, setHealthStatus] = useState(null);

  useEffect(() => {
    fetchHealth()
      .then((data) => setHealthStatus(data))
      .catch(() => {});
  }, []);

  // --- SINGLE UPLOAD HANDLERS ---
  const handlePreviewSubmit = async ({ file, marketplace, orderDate }) => {
    setIsLoading(true);
    setErrorInfo(null);
    setMode('single');
    setUploadParams({ file, marketplace, orderDate });
    setSelectedDuplicateRowNumbers([]);

    try {
      const data = await uploadAndPreview({ file, marketplace, orderDate });
      setPreviewData(data);
      setStep('summary');
    } catch (err) {
      setErrorInfo({
        message: err.message,
        statusCode: err.statusCode,
        details: err.details,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleDuplicateRow = (rowNumber) => {
    const num = Number(rowNumber);
    setSelectedDuplicateRowNumbers((prev) =>
      prev.includes(num) ? prev.filter((n) => n !== num) : [...prev, num]
    );
  };

  const handleSelectAllDuplicates = () => {
    if (!previewData || !previewData.duplicateRows) return;
    const allNums = previewData.duplicateRows.map((r) => Number(r.rowNumber));
    setSelectedDuplicateRowNumbers(allNums);
  };

  const handleDeselectAllDuplicates = () => {
    setSelectedDuplicateRowNumbers([]);
  };

  const handleConfirmSingleBatch = async () => {
    if (!previewData || !previewData.previewToken) return;

    setIsConfirming(true);
    setErrorInfo(null);

    const includeDuplicates = selectedDuplicateRowNumbers.length > 0;

    try {
      const result = await confirmBatch(previewData.previewToken, {
        includeDuplicates,
        selectedDuplicateRowNumbers,
      });
      setConfirmData(result);
      setStep('done');
    } catch (err) {
      setErrorInfo({
        message: err.message,
        statusCode: err.statusCode,
        details: err.details,
      });
    } finally {
      setIsConfirming(false);
    }
  };

  // --- BATCH UPLOAD HANDLERS ---
  const handleBatchPreviewSubmit = async ({ filesWithMeta }) => {
    setIsLoading(true);
    setErrorInfo(null);
    setMode('batch');
    setBatchDuplicateSelections({});

    try {
      const data = await uploadAndPreviewBatch({ filesWithMeta });
      setBatchPreviewData(data);
      setStep('summary');
    } catch (err) {
      setErrorInfo({
        message: err.message,
        statusCode: err.statusCode,
        details: err.details,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleDuplicateRowForSheet = (previewToken, rowNumber) => {
    const num = Number(rowNumber);
    setBatchDuplicateSelections((prev) => {
      const current = prev[previewToken] || [];
      const updated = current.includes(num)
        ? current.filter((n) => n !== num)
        : [...current, num];
      return { ...prev, [previewToken]: updated };
    });
  };

  const handleSelectAllDuplicatesForSheet = (previewToken) => {
    if (!batchPreviewData || !batchPreviewData.sheets) return;
    const sheet = batchPreviewData.sheets.find((s) => s.previewToken === previewToken);
    if (!sheet || !sheet.duplicateRows) return;
    const allNums = sheet.duplicateRows.map((r) => Number(r.rowNumber));
    setBatchDuplicateSelections((prev) => ({
      ...prev,
      [previewToken]: allNums,
    }));
  };

  const handleDeselectAllDuplicatesForSheet = (previewToken) => {
    setBatchDuplicateSelections((prev) => ({
      ...prev,
      [previewToken]: [],
    }));
  };

  const handleConfirmBatchUpload = async ({ sheetConfirmations }) => {
    if (!batchPreviewData || !batchPreviewData.batchToken) return;

    setIsConfirming(true);
    setErrorInfo(null);

    try {
      const result = await confirmBatchUpload({
        batchToken: batchPreviewData.batchToken,
        sheetConfirmations,
      });
      setBatchConfirmData(result);
      setStep('done');
    } catch (err) {
      setErrorInfo({
        message: err.message,
        statusCode: err.statusCode,
        details: err.details,
      });
    } finally {
      setIsConfirming(false);
    }
  };

  // --- RESET & ERROR BANNER ---
  const handleReset = () => {
    setStep('upload');
    setUploadParams(null);
    setPreviewData(null);
    setConfirmData(null);
    setSelectedDuplicateRowNumbers([]);
    setIsDuplicateModalOpen(false);

    setBatchPreviewData(null);
    setBatchConfirmData(null);
    setBatchDuplicateSelections({});
    setErrorInfo(null);
  };

  const renderErrorBanner = () => {
    if (!errorInfo) return null;

    const { message, statusCode } = errorInfo;

    let icon = <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-500 mt-0.5" />;
    let title = 'Error';

    if (statusCode === 403) {
      icon = <KeyRound className="w-5 h-5 flex-shrink-0 text-amber-600 mt-0.5" />;
      title = 'Google Sheets Permission Denied (403)';
    } else if (statusCode === 502) {
      icon = <WifiOff className="w-5 h-5 flex-shrink-0 text-rose-600 mt-0.5" />;
      title = 'Connection to Google Sheets Failed (502)';
    } else if (statusCode === 410) {
      icon = <RefreshCw className="w-5 h-5 flex-shrink-0 text-slate-600 mt-0.5" />;
      title = 'Preview Session Expired (410)';
    }

    return (
      <div className="mb-6 p-4 rounded-xl border border-red-200 bg-red-50/90 text-slate-800 shadow-sm flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {icon}
          <div>
            <h4 className="text-sm font-semibold text-red-900">{title}</h4>
            <p className="text-sm text-red-800 mt-0.5 leading-relaxed">{message}</p>
            {statusCode === 410 && (
              <button
                onClick={handleReset}
                className="mt-2 text-xs font-semibold text-blue-700 hover:text-blue-800 underline"
              >
                Start a new upload
              </button>
            )}
          </div>
        </div>
        <button
          onClick={() => setErrorInfo(null)}
          className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1"
        >
          Dismiss
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 leading-tight">Dispatch Sheet Automation</h1>
              <p className="text-xs text-slate-500">Marketplace order ingestion to Google Sheets</p>
            </div>
          </div>

          {/* System status pill */}
          <div className="flex items-center gap-2">
            {healthStatus?.googleSheets?.isConfigured ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Sheets Connected
              </span>
            ) : healthStatus?.googleSheets?.isMock ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                Mock Test Mode
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                <ShieldAlert className="w-3.5 h-3.5 text-slate-500" />
                No Key Configured
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Step Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between max-w-xs mx-auto">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                  step === 'upload'
                    ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                    : 'bg-emerald-600 text-white'
                }`}
              >
                1
              </div>
              <span className="text-xs font-medium text-slate-600 mt-1">Upload</span>
            </div>

            <div className={`h-0.5 flex-1 mx-2 ${step !== 'upload' ? 'bg-emerald-500' : 'bg-slate-200'}`} />

            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                  step === 'summary'
                    ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                    : step === 'done'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 text-slate-500'
                }`}
              >
                2
              </div>
              <span className="text-xs font-medium text-slate-600 mt-1">Review</span>
            </div>

            <div className={`h-0.5 flex-1 mx-2 ${step === 'done' ? 'bg-emerald-500' : 'bg-slate-200'}`} />

            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                  step === 'done'
                    ? 'bg-emerald-600 text-white ring-4 ring-emerald-100'
                    : 'bg-slate-200 text-slate-500'
                }`}
              >
                3
              </div>
              <span className="text-xs font-medium text-slate-600 mt-1">Appended</span>
            </div>
          </div>
        </div>

        {/* Global Error Banner */}
        {renderErrorBanner()}

        {/* STEP 1: UPLOAD */}
        {step === 'upload' && (
          <UploadForm
            onPreviewSubmit={handlePreviewSubmit}
            onBatchPreviewSubmit={handleBatchPreviewSubmit}
            isLoading={isLoading}
            tabNames={healthStatus?.googleSheets?.tabNames?.marketplaces}
          />
        )}

        {/* STEP 2: REVIEW (Single or Batch) */}
        {step === 'summary' && mode === 'single' && previewData && (
          <div className="space-y-6">
            <SummaryTable
              summary={previewData.summary}
              problemRows={previewData.problemRows}
              sampleNewRecords={previewData.sampleNewRecords}
              duplicateRows={previewData.duplicateRows || []}
              selectedDuplicateRowNumbers={selectedDuplicateRowNumbers}
              onToggleDuplicateRow={handleToggleDuplicateRow}
              onSelectAllDuplicates={handleSelectAllDuplicates}
              onDeselectAllDuplicates={handleDeselectAllDuplicates}
              onOpenDuplicateModal={() => setIsDuplicateModalOpen(true)}
            />

            <ConfirmBar
              newRecordsCount={previewData.summary?.newRecords || 0}
              duplicatesToIncludeCount={selectedDuplicateRowNumbers.length}
              onConfirm={handleConfirmSingleBatch}
              onCancel={handleReset}
              isConfirming={isConfirming}
              marketplaceName={
                uploadParams?.marketplace
                  ? uploadParams.marketplace.charAt(0).toUpperCase() + uploadParams.marketplace.slice(1)
                  : ''
              }
              orderDate={uploadParams?.orderDate || ''}
              targetTabName={previewData?.targetTabName}
            />

            <DuplicateModal
              isOpen={isDuplicateModalOpen}
              onClose={() => setIsDuplicateModalOpen(false)}
              duplicateRows={previewData.duplicateRows || []}
              selectedRowNumbers={selectedDuplicateRowNumbers}
              onToggleRow={handleToggleDuplicateRow}
              onSelectAll={handleSelectAllDuplicates}
              onDeselectAll={handleDeselectAllDuplicates}
            />
          </div>
        )}

        {step === 'summary' && mode === 'batch' && batchPreviewData && (
          <BatchSummaryReview
            batchData={batchPreviewData}
            onConfirmBatch={handleConfirmBatchUpload}
            onCancel={handleReset}
            isConfirming={isConfirming}
            duplicateSelections={batchDuplicateSelections}
            onToggleDuplicateRow={handleToggleDuplicateRowForSheet}
            onSelectAllDuplicatesForSheet={handleSelectAllDuplicatesForSheet}
            onDeselectAllDuplicatesForSheet={handleDeselectAllDuplicatesForSheet}
          />
        )}

        {/* STEP 3: DONE (Single or Batch) */}
        {step === 'done' && mode === 'single' && confirmData && (
          <DoneScreen
            result={confirmData}
            onReset={handleReset}
            spreadsheetId={healthStatus?.googleSheets?.spreadsheetId}
          />
        )}

        {step === 'done' && mode === 'batch' && batchConfirmData && (
          <BatchDoneScreen
            result={batchConfirmData}
            onReset={handleReset}
            spreadsheetId={healthStatus?.googleSheets?.spreadsheetId}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 mt-auto">
        <div className="max-w-5xl mx-auto px-4 text-center text-xs text-slate-400">
          Dispatch Sheet Automation v1.0 • Reads & writes directly to Google Sheets via Sheets API v4
        </div>
      </footer>
    </div>
  );
}
