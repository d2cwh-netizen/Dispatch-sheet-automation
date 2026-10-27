/**
 * Dispatch API client using native fetch.
 * Communicates with the Express backend endpoints:
 * - POST /api/preview
 * - POST /api/confirm
 * - GET /api/health
 */

const BASE_URL = '/api';

export class ApiError extends Error {
  constructor(message, statusCode, details = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Uploads marketplace file and parameters to preview and dedup against Google Sheets.
 * @param {Object} params
 * @param {File} params.file
 * @param {string} params.marketplace
 * @param {string} params.orderDate
 */
export async function uploadAndPreview({ file, marketplace, orderDate }) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('marketplace', marketplace);
  formData.append('orderDate', orderDate);

  let res;
  try {
    res = await fetch(`${BASE_URL}/preview`, {
      method: 'POST',
      body: formData,
    });
  } catch (networkErr) {
    throw new ApiError(
      'Unable to connect to the backend server. Please verify the backend is running.',
      0,
      networkErr.message
    );
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(
      data.error || 'Failed to process file preview.',
      res.status,
      data.details
    );
  }

  return data;
}

/**
 * Confirms a preview batch and appends records to Google Sheet.
 * @param {string} previewToken
 * @param {Object} [options]
 * @param {boolean} [options.includeDuplicates]
 * @param {Array<number>} [options.selectedDuplicateRowNumbers]
 */
export async function confirmBatch(previewToken, options = {}) {
  const { includeDuplicates = false, selectedDuplicateRowNumbers = [] } = options;
  let res;
  try {
    res = await fetch(`${BASE_URL}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        previewToken,
        includeDuplicates,
        selectedDuplicateRowNumbers,
      }),
    });
  } catch (networkErr) {
    throw new ApiError(
      'Network error while confirming rows. Check your connection.',
      0,
      networkErr.message
    );
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(
      data.error || 'Failed to append records to Google Sheet.',
      res.status,
      data.details
    );
  }

  return data;
}

/**
 * Uploads multiple marketplace files in a batch with metadata manifest.
 * @param {Object} params
 * @param {Array<{ file: File, marketplace: string, orderDate: string }>} params.filesWithMeta
 */
export async function uploadAndPreviewBatch({ filesWithMeta }) {
  const formData = new FormData();
  const manifest = [];

  filesWithMeta.forEach((item, index) => {
    formData.append('files', item.file);
    manifest.push({
      fileIndex: index,
      fileName: item.file.name,
      marketplace: item.marketplace,
      orderDate: item.orderDate,
    });
  });

  formData.append('manifest', JSON.stringify(manifest));

  let res;
  try {
    res = await fetch(`${BASE_URL}/preview-batch`, {
      method: 'POST',
      body: formData,
    });
  } catch (networkErr) {
    throw new ApiError(
      'Unable to connect to the backend server. Please verify the backend is running.',
      0,
      networkErr.message
    );
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(
      data.error || 'Failed to process batch preview.',
      res.status,
      data.details
    );
  }

  return data;
}

/**
 * Confirms multiple previously previewed sheets in a single batch request.
 * @param {Object} params
 * @param {string} params.batchToken
 * @param {Array<{ previewToken: string, includeDuplicates: boolean, selectedDuplicateRowNumbers: Array<number> }>} params.sheetConfirmations
 */
export async function confirmBatchUpload({ batchToken, sheetConfirmations }) {
  let res;
  try {
    res = await fetch(`${BASE_URL}/confirm-batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        batchToken,
        sheetConfirmations,
      }),
    });
  } catch (networkErr) {
    throw new ApiError(
      'Network error while confirming batch rows. Check your connection.',
      0,
      networkErr.message
    );
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(
      data.error || 'Failed to append batch records to Google Sheet.',
      res.status,
      data.details
    );
  }

  return data;
}

/**
 * Checks system health and Google Sheets configuration status.
 */
export async function fetchHealth() {
  try {
    const res = await fetch(`${BASE_URL}/health`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
