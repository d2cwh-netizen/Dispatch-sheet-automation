const googleSheetsConfig = require('../config/googleSheetsConfig');
const { createOrderSkuKey } = require('./dedupService');

class GoogleSheetsServiceError extends Error {
  constructor(message, statusCode = 502, details = null) {
    super(message);
    this.name = 'GoogleSheetsServiceError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

// Canonical 12-column header row matching Google Sheet structure for Amazon / default
const DISPATCH_HEADERS = [
  'Order Date',
  'SKU',
  'Ordered Qty',
  'Product Name',
  'Brand',
  'Order Id',
  'Courier',
  'Tracking ID',
  'Status',
  'Amt',
  'Payment mode',
  'Wrong Sku Sent',
];

// Canonical 11-column header row matching Google Sheet structure for Flipkart
const FLIPKART_HEADERS = [
  'Dispatch Date',
  'Order ID',
  'Sku',
  'Order Qty',
  'Product Name',
  'Brand',
  'Shipment Tracker',
  'Courier',
  'MRP',
  'Payment mode',
  'SENT sku',
];

// Canonical 13-column header row matching Google Sheet structure for Nykaa
const NYKAA_HEADERS = [
  'Dispatch Date',
  'SKU Code',
  'QTY',
  'Dispatch Item',
  'Brand',
  'Order Id',
  'Tracking ID',
  'Courier',
  'Status',
  'MRP',
  'Payment mode',
  'Sent sku',
  'Nykaa beauty',
];

// Canonical 12-column header row matching Google Sheet structure for Myntra
const MYNTRA_HEADERS = [
  'Dispatch Date',
  'SKU Code',
  'QTY',
  'Product Name',
  'Brand',
  'Order Id',
  'Tracking ID',
  'Courier',
  'Status',
  'MRP',
  'COD',
  'Sent sku',
];

// In-memory mock store used when MOCK_GOOGLE_SHEETS=true or in test environment
const mockSheetState = {
  tabs: {}, // tabName -> Array of row arrays
  rows: [], // global rows array for backwards compatibility
};

// Set of verified tab names to minimize spreadsheet metadata calls
const verifiedTabs = new Set();
// Map of tabName -> sheetId for fast formatting batchUpdates without re-fetching metadata
const tabSheetIdMap = new Map();

/**
 * Resolves the destination tab name for a marketplace or explicit tab string.
 */
function resolveTabName(marketplaceOrTab) {
  if (!marketplaceOrTab) {
    return googleSheetsConfig.getTabName();
  }
  return googleSheetsConfig.getTabName(marketplaceOrTab) || String(marketplaceOrTab).trim();
}

/**
 * Dynamically detects the column indices for Order ID and SKU by inspecting tab headers,
 * with reliable fallbacks per marketplace.
 */
function detectOrderSkuIndices(headerRow, marketplaceOrTab) {
  let orderIdCol = -1;
  let skuCol = -1;

  if (headerRow && Array.isArray(headerRow)) {
    for (let i = 0; i < headerRow.length; i++) {
      const h = String(headerRow[i] || '').trim().toLowerCase();
      if (['order id', 'orderid', 'channel order id', 'order_id'].includes(h)) {
        orderIdCol = i;
      } else if (['sku', 'product sku code', 'sku code', 'product sku'].includes(h)) {
        skuCol = i;
      }
    }
  }

  // If not detected from headers, fall back to known marketplace tab defaults
  if (orderIdCol === -1 || skuCol === -1) {
    const mp = String(marketplaceOrTab || '').toLowerCase();
    if (mp.includes('flipkart')) {
      orderIdCol = orderIdCol !== -1 ? orderIdCol : 1; // Col B (index 1) is Order ID
      skuCol = skuCol !== -1 ? skuCol : 2;             // Col C (index 2) is Sku
    } else {
      orderIdCol = orderIdCol !== -1 ? orderIdCol : 5; // Col F (index 5) is Order Id
      skuCol = skuCol !== -1 ? skuCol : 1;             // Col B (index 1) is SKU
    }
  }

  return { orderIdCol, skuCol };
}

/**
 * Helper to delay execution (used for rate-limit exponential backoff)
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Executes a Google Sheets API operation with retry logic for rate limits
 */
async function executeWithRetry(apiOperation, retryCount = 1) {
  try {
    return await apiOperation();
  } catch (err) {
    const isRateLimit =
      err.code === 429 ||
      err.status === 429 ||
      (err.message && err.message.includes('Quota exceeded')) ||
      (err.message && err.message.includes('RATE_LIMIT_EXCEEDED'));

    if (isRateLimit && retryCount > 0) {
      console.warn('[DispatchSheetService] Rate limit hit. Retrying in 2 seconds...');
      await delay(2000);
      return executeWithRetry(apiOperation, retryCount - 1);
    }

    throw err;
  }
}

/**
 * Ensures that the destination tab exists in the target spreadsheet.
 * If the tab doesn't exist, it creates it and initializes row 1 with canonical headers.
 * Also enforces Date formatting (yyyy-mm-dd) on Column A to prevent date serial numbers (e.g. 46289).
 */
/**
 * Applies DATE number format (yyyy-mm-dd) to Column A (Row 2 downwards) for a given sheet ID.
 */
async function applyDateFormatToColumnA(sheets, spreadsheetId, targetSheetId, tabName) {
  if (targetSheetId === undefined || targetSheetId === null) return;
  try {
    await executeWithRetry(() =>
      sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId: targetSheetId,
                  startColumnIndex: 0,
                  endColumnIndex: 1,
                  startRowIndex: 1, // Row 2 onwards
                },
                cell: {
                  userEnteredFormat: {
                    numberFormat: {
                      type: 'DATE',
                      pattern: 'yyyy-mm-dd',
                    },
                  },
                },
                fields: 'userEnteredFormat.numberFormat',
              },
            },
          ],
        },
      })
    );
  } catch (fmtErr) {
    console.warn(`[DispatchSheetService] Could not set date format on tab "${tabName}": ${fmtErr.message}`);
  }
}

/**
 * Ensures that the destination tab exists in the target spreadsheet.
 * If the tab doesn't exist, it creates it and initializes row 1 with canonical headers.
 * Also enforces Date formatting (yyyy-mm-dd) on Column A to prevent date serial numbers (e.g. 46289).
 */
async function ensureTabExists(sheets, spreadsheetId, tabName, marketplace) {
  if (verifiedTabs.has(tabName) && tabSheetIdMap.has(tabName)) {
    return;
  }

  try {
    const spreadsheet = await executeWithRetry(() =>
      sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets(properties(title,sheetId))',
      })
    );

    const existingSheets = spreadsheet.data.sheets || [];
    for (const s of existingSheets) {
      if (s.properties && s.properties.title && s.properties.sheetId !== undefined) {
        tabSheetIdMap.set(s.properties.title, s.properties.sheetId);
      }
    }

    let sheetObj = existingSheets.find(
      (s) => s.properties && s.properties.title === tabName
    );

    const mpLower = String(marketplace || '').toLowerCase();
    const tabLower = String(tabName).toLowerCase();
    let headersToUse = DISPATCH_HEADERS;
    if (mpLower === 'flipkart' || tabLower.includes('flipkart')) {
      headersToUse = FLIPKART_HEADERS;
    } else if (mpLower === 'nykaa' || tabLower.includes('nykaa')) {
      headersToUse = NYKAA_HEADERS;
    } else if (mpLower === 'myntra' || tabLower.includes('myntra')) {
      headersToUse = MYNTRA_HEADERS;
    }

    if (!sheetObj) {
      console.log(`[DispatchSheetService] Tab "${tabName}" not found in sheet. Auto-creating tab...`);
      const addRes = await executeWithRetry(() =>
        sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: tabName,
                  },
                },
              },
            ],
          },
        })
      );

      sheetObj = addRes.data.replies?.[0]?.addSheet;
      const newSheetId = sheetObj?.properties?.sheetId ?? sheetObj?.sheetId;
      if (newSheetId !== undefined && newSheetId !== null) {
        tabSheetIdMap.set(tabName, newSheetId);
      }

      // Initialize row 1 with canonical column headers
      const colLetter = String.fromCharCode(65 + headersToUse.length - 1);
      await executeWithRetry(() =>
        sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `'${tabName}'!A1:${colLetter}1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [headersToUse],
          },
        })
      );
      console.log(`[DispatchSheetService] Tab "${tabName}" created with headers successfully.`);
    }

    // Ensure Column A has Date number format (yyyy-mm-dd) so it renders as a date rather than 46289
    const targetSheetId = sheetObj?.properties?.sheetId ?? sheetObj?.sheetId ?? tabSheetIdMap.get(tabName);
    if (targetSheetId !== undefined && targetSheetId !== null) {
      tabSheetIdMap.set(tabName, targetSheetId);
      await applyDateFormatToColumnA(sheets, spreadsheetId, targetSheetId, tabName);
    }

    verifiedTabs.add(tabName);
  } catch (err) {
    console.warn(`[DispatchSheetService] Notice: Could not verify or auto-create tab "${tabName}": ${err.message}`);
  }
}

/**
 * Translates Google API errors to appropriate HTTP status codes and user-friendly messages
 */
function handleGoogleApiError(err, tabName = '') {
  const serviceAccountEmail = googleSheetsConfig.getServiceAccountEmail();

  // 403 Forbidden / Permission denied
  if (err.code === 403 || err.status === 403 || (err.message && err.message.includes('The caller does not have permission'))) {
    return new GoogleSheetsServiceError(
      `The app's service account doesn't have edit access to this Google Sheet. Share the sheet with ${serviceAccountEmail || 'the service account email'} as an Editor.`,
      403,
      err.message
    );
  }

  // 404 Not Found (bad spreadsheet ID or tab name)
  if (err.code === 404 || err.status === 404) {
    return new GoogleSheetsServiceError(
      `Google Sheet not found. Please verify the GOOGLE_SHEET_ID in your configuration.`,
      400,
      err.message
    );
  }

  // Tab parsing error (e.g. range with invalid tab name)
  if (err.message && err.message.includes('Unable to parse range')) {
    return new GoogleSheetsServiceError(
      `Could not access tab "${tabName || 'unknown'}" in Google Sheets. Please ensure this tab exists in your Google Sheet or check your .env tab name configuration.`,
      400,
      err.message
    );
  }

  // Rate limit / Quota exceeded
  if (err.code === 429 || err.status === 429 || (err.message && err.message.includes('Quota exceeded'))) {
    return new GoogleSheetsServiceError(
      'Google Sheets API rate limit reached. Please try again shortly.',
      502,
      err.message
    );
  }

  // Network error or upstream failure
  return new GoogleSheetsServiceError(
    'Could not reach the Google Sheets API. Please check your internet connection and verify Google Sheets service availability.',
    502,
    err.message
  );
}

/**
 * Reads existing Order ID and SKU columns from the Google Sheet tab for deduplication.
 * Dynamically resolves column positions based on tab layout (e.g., Flipkart vs Amazon).
 * @param {string} [marketplaceOrTab] - Marketplace key (e.g. 'amazon', 'flipkart') or direct tab name
 * @returns {Promise<{ existingKeysSet: Set<string>, totalExistingRows: number, tabName: string }>}
 */
async function getExistingOrderKeys(marketplaceOrTab) {
  const tabName = resolveTabName(marketplaceOrTab);

  if (googleSheetsConfig.isMock()) {
    const existingKeysSet = new Set();
    const rows = mockSheetState.tabs[tabName] || [];
    const { orderIdCol, skuCol } = detectOrderSkuIndices(null, marketplaceOrTab);

    for (const row of rows) {
      const orderId = row[orderIdCol] ? String(row[orderIdCol]).trim() : '';
      const sku = row[skuCol] ? String(row[skuCol]).trim() : '';
      if (orderId && sku) {
        existingKeysSet.add(createOrderSkuKey(orderId, sku));
      }
    }
    return {
      existingKeysSet,
      totalExistingRows: rows.length,
      tabName,
    };
  }

  if (!googleSheetsConfig.isConfigured()) {
    const err = googleSheetsConfig.getConfigError() || 'Google Sheets client is not configured.';
    throw new GoogleSheetsServiceError(err, 500);
  }

  const sheets = googleSheetsConfig.getSheetsClient();
  const spreadsheetId = googleSheetsConfig.getSpreadsheetId();

  if (!spreadsheetId) {
    throw new GoogleSheetsServiceError('GOOGLE_SHEET_ID is missing from environment configuration.', 500);
  }

  await ensureTabExists(sheets, spreadsheetId, tabName, marketplaceOrTab);

  try {
    // Read from row 1 to inspect tab headers and accurately identify Order ID and SKU columns
    const response = await executeWithRetry(() =>
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${tabName}'!A1:Z`,
      })
    );

    const allRows = response.data.values || [];
    const headerRow = allRows[0] || [];
    const dataRows = allRows.slice(1);

    const { orderIdCol, skuCol } = detectOrderSkuIndices(headerRow, marketplaceOrTab);
    const existingKeysSet = new Set();

    for (const row of dataRows) {
      const orderId = row[orderIdCol] ? String(row[orderIdCol]).trim() : '';
      const sku = row[skuCol] ? String(row[skuCol]).trim() : '';

      if (orderId && sku) {
        existingKeysSet.add(createOrderSkuKey(orderId, sku));
      }
    }

    return {
      existingKeysSet,
      totalExistingRows: dataRows.length,
      tabName,
    };
  } catch (err) {
    throw handleGoogleApiError(err, tabName);
  }
}

/**
 * Appends new rows to the Google Sheet tab atomically.
 * @param {Array<Array<any>>} rowsToAppend - Formatted rows matching target tab layout
 * @param {string} [marketplaceOrTab] - Marketplace key or explicit tab name
 * @returns {Promise<{ recordsAdded: number, dispatchSheetTotalRowsNow: number, tabName: string }>}
 */
async function appendRows(rowsToAppend, marketplaceOrTab) {
  const tabName = resolveTabName(marketplaceOrTab);

  if (!rowsToAppend || rowsToAppend.length === 0) {
    const current = await getExistingOrderKeys(marketplaceOrTab);
    return {
      recordsAdded: 0,
      dispatchSheetTotalRowsNow: current.totalExistingRows,
      tabName,
    };
  }

  if (googleSheetsConfig.isMock()) {
    if (!mockSheetState.tabs[tabName]) {
      mockSheetState.tabs[tabName] = [];
    }
    mockSheetState.tabs[tabName].push(...rowsToAppend);
    mockSheetState.rows.push(...rowsToAppend);

    return {
      recordsAdded: rowsToAppend.length,
      dispatchSheetTotalRowsNow: mockSheetState.tabs[tabName].length,
      tabName,
    };
  }

  if (!googleSheetsConfig.isConfigured()) {
    const err = googleSheetsConfig.getConfigError() || 'Google Sheets client is not configured.';
    throw new GoogleSheetsServiceError(err, 500);
  }

  const sheets = googleSheetsConfig.getSheetsClient();
  const spreadsheetId = googleSheetsConfig.getSpreadsheetId();

  await ensureTabExists(sheets, spreadsheetId, tabName, marketplaceOrTab);

  try {
    await executeWithRetry(() =>
      sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `'${tabName}'!A:Z`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: rowsToAppend,
        },
      })
    );

    // Enforce DATE format on Column A so newly appended rows consistently render as yyyy-mm-dd
    const targetSheetId = tabSheetIdMap.get(tabName);
    if (targetSheetId !== undefined && targetSheetId !== null) {
      await applyDateFormatToColumnA(sheets, spreadsheetId, targetSheetId, tabName);
    }

    // Get current total rows after append
    const currentStatus = await getExistingOrderKeys(marketplaceOrTab);

    return {
      recordsAdded: rowsToAppend.length,
      dispatchSheetTotalRowsNow: currentStatus.totalExistingRows,
      tabName,
    };
  } catch (err) {
    throw handleGoogleApiError(err, tabName);
  }
}

/**
 * Reset mock state (used in tests)
 */
function resetMockState() {
  mockSheetState.tabs = {};
  mockSheetState.rows = [];
  verifiedTabs.clear();
  tabSheetIdMap.clear();
}

module.exports = {
  getExistingOrderKeys,
  appendRows,
  resolveTabName,
  resetMockState,
  GoogleSheetsServiceError,
};
