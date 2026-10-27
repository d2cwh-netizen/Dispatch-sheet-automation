const { parseMarketplaceExcel, ExcelParseError } = require('../services/excelParserService');
const { validateRows } = require('../services/validationService');
const { deduplicateRows, createOrderSkuKey } = require('../services/dedupService');
const dispatchSheetService = require('../services/dispatchSheetService');
const previewStoreService = require('../services/previewStoreService');
const { isValidDateString, formatDateForSheet } = require('../utils/dateUtils');
const marketplaceMappings = require('../config/marketplaceMappings');
const googleSheetsConfig = require('../config/googleSheetsConfig');

/**
 * POST /api/preview
 * Parses the uploaded marketplace file, performs validation and deduplication against the live Google Sheet,
 * and caches new records in memory with a short-lived token.
 */
async function handlePreview(req, res) {
  try {
    const { marketplace, orderDate } = req.body;
    const file = req.file;

    // 1. Validate file presence
    if (!file) {
      return res.status(400).json({ error: 'Please upload an Excel (.xlsx) or CSV (.csv) file.' });
    }

    const lowerName = (file.originalname || '').toLowerCase();
    const hasExtension = lowerName.includes('.');
    const isXlsx =
      lowerName.endsWith('.xlsx') ||
      (!hasExtension && file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    const isCsv =
      lowerName.endsWith('.csv') ||
      (!hasExtension && (file.mimetype === 'text/csv' || file.mimetype === 'application/csv'));

    if (!isXlsx && !isCsv) {
      return res.status(400).json({ error: 'Uploaded file must be a valid .xlsx or .csv spreadsheet.' });
    }

    // 2. Validate marketplace
    const normalizedMarketplace = (marketplace || '').toLowerCase().trim();
    if (!normalizedMarketplace || !marketplaceMappings[normalizedMarketplace]) {
      const validKeys = Object.keys(marketplaceMappings).join(', ');
      return res.status(400).json({
        error: `Invalid or missing marketplace. Must be one of: ${validKeys}.`,
      });
    }

    // 3. Validate orderDate
    if (!isValidDateString(orderDate)) {
      return res.status(400).json({
        error: 'Invalid Order Date. Please provide a valid date in YYYY-MM-DD format.',
      });
    }

    // 4. Parse Excel or CSV file
    let parsed;
    try {
      parsed = await parseMarketplaceExcel(file.buffer, normalizedMarketplace, file.originalname);
    } catch (err) {
      if (err instanceof ExcelParseError) {
        return res.status(err.statusCode || 400).json({ error: err.message });
      }
      throw err;
    }

    // 5. Validate rows and flag problem records
    const validationResult = validateRows(parsed.rows);

    // 6. Read live Google Sheet to obtain existing Order ID + SKU keys for this marketplace's tab
    const { existingKeysSet, tabName } = await dispatchSheetService.getExistingOrderKeys(normalizedMarketplace);

    // 7. Deduplicate candidates against live Google Sheet tab
    const dedupResult = deduplicateRows(
      validationResult.candidateRows,
      existingKeysSet,
      normalizedMarketplace
    );

    // Combine all duplicates (already in sheet + valid in-file duplicates)
    const duplicateRows = [
      ...(dedupResult.duplicateRows || []),
      ...(validationResult.inFileDuplicates || []),
    ];

    // 8. Cache new records and duplicate records in memory with short-lived preview token
    const previewToken = previewStoreService.savePreview({
      newRows: dedupResult.newRows,
      duplicateRows,
      marketplace: normalizedMarketplace,
      orderDate: formatDateForSheet(orderDate),
      tabName,
    });

    // 9. Build response
    return res.status(200).json({
      summary: {
        totalRowsInFile: parsed.totalRowsInFile,
        newRecords: dedupResult.newRecordsCount,
        alreadyExisting: dedupResult.alreadyExistingCount,
        problemRecords: validationResult.problemRecordsCount,
        duplicateRecords: duplicateRows.length,
      },
      duplicateRows,
      problemRows: validationResult.problemRows,
      previewToken,
      sampleNewRecords: dedupResult.newRows.slice(0, 5),
      targetTabName: tabName,
    });
  } catch (err) {
    if (err.name === 'GoogleSheetsServiceError') {
      return res.status(err.statusCode || 502).json({
        error: err.message,
        details: err.details,
      });
    }
    console.error('[UploadController] Unexpected error in handlePreview:', err);
    return res.status(500).json({ error: 'An unexpected internal error occurred during file preview.' });
  }
}

/**
 * POST /api/confirm
 * Confirms a previously previewed batch using its previewToken and appends records to Google Sheet.
 * Supports force-pushing duplicate rows if requested by user.
 */
async function handleConfirm(req, res) {
  try {
    const { previewToken, includeDuplicates, selectedDuplicateRowNumbers } = req.body;

    if (!previewToken) {
      return res.status(400).json({ error: 'previewToken is required to confirm.' });
    }

    const previewData = previewStoreService.consumePreview(previewToken);
    if (!previewData) {
      return res.status(410).json({
        error: 'Preview session has expired or already been confirmed. Please re-upload your file to generate a new preview.',
      });
    }

    const { newRows = [], duplicateRows = [], marketplace, orderDate, tabName } = previewData;

    let rowsToAppend = [...newRows];

    // Check if user requested to force-push duplicate rows
    if (includeDuplicates && Array.isArray(duplicateRows) && duplicateRows.length > 0) {
      if (Array.isArray(selectedDuplicateRowNumbers) && selectedDuplicateRowNumbers.length > 0) {
        const selectedSet = new Set(selectedDuplicateRowNumbers.map(Number));
        const filtered = duplicateRows.filter((r) => selectedSet.has(Number(r.rowNumber)));
        rowsToAppend = rowsToAppend.concat(filtered);
      } else {
        rowsToAppend = rowsToAppend.concat(duplicateRows);
      }
    }

    if (rowsToAppend.length === 0) {
      return res.status(400).json({
        error: 'No records to append to Google Sheet.',
      });
    }

    // Format rows matching the destination tab column layout for this marketplace
    const formattedRows = rowsToAppend.map((row) =>
      formatRowForMarketplace(row, marketplace, orderDate)
    );

    const result = await dispatchSheetService.appendRows(formattedRows, marketplace || tabName);

    return res.status(200).json({
      recordsAdded: result.recordsAdded,
      duplicatesIncluded: rowsToAppend.length - newRows.length,
      dispatchSheetTotalRowsNow: result.dispatchSheetTotalRowsNow,
      tabName: result.tabName,
    });
  } catch (err) {
    if (err.name === 'GoogleSheetsServiceError') {
      return res.status(err.statusCode || 502).json({
        error: err.message,
        details: err.details,
      });
    }
    console.error('[UploadController] Unexpected error in handleConfirm:', err);
    return res.status(500).json({ error: 'An unexpected internal error occurred while appending rows.' });
  }
}

/**
 * Validates if an uploaded file has a valid .xlsx or .csv extension/mimetype.
 */
function checkFileExtension(file) {
  if (!file) return false;
  const lowerName = (file.originalname || '').toLowerCase();
  const hasExtension = lowerName.includes('.');
  const isXlsx =
    lowerName.endsWith('.xlsx') ||
    (!hasExtension && file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  const isCsv =
    lowerName.endsWith('.csv') ||
    (!hasExtension && (file.mimetype === 'text/csv' || file.mimetype === 'application/csv'));

  return isXlsx || isCsv;
}

/**
 * Heuristically detects the marketplace from the uploaded filename if available.
 */
function detectMarketplaceFromFilename(filename = '') {
  const lower = String(filename).toLowerCase();
  if (lower.includes('amazon')) return 'amazon';
  if (lower.includes('flipkart')) return 'flipkart';
  if (lower.includes('nykaa')) return 'nykaa';
  if (lower.includes('myntra')) return 'myntra';
  return null;
}

/**
 * POST /api/preview-batch
 * Ingests multiple marketplace files simultaneously.
 * Deduplicates each against its respective Google Sheet tab and catches cross-file duplicates within the batch.
 */
async function handlePreviewBatch(req, res) {
  try {
    const files = req.files;
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'Please upload at least one .xlsx or .csv file.' });
    }

    let manifest = [];
    if (req.body.manifest) {
      try {
        manifest = typeof req.body.manifest === 'string'
          ? JSON.parse(req.body.manifest)
          : req.body.manifest;
      } catch (parseErr) {
        return res.status(400).json({ error: 'Invalid manifest format provided in batch upload.' });
      }
    }

    const defaultMarketplace = (req.body.marketplace || '').toLowerCase().trim();
    const defaultOrderDate = req.body.orderDate;

    // Cache of existing keys per marketplace tab so we don't duplicate calls
    // and can catch duplicate orders between files uploaded in the same batch
    const marketplaceKeysCache = new Map();
    const sheetResults = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const meta =
        manifest.find((m) => m && (m.fileName === file.originalname || m.fileIndex === i)) ||
        manifest[i] ||
        {};

      const detectedMarketplace = detectMarketplaceFromFilename(file.originalname);
      const marketplace = (meta.marketplace || defaultMarketplace || detectedMarketplace || '').toLowerCase().trim();
      const orderDate = meta.orderDate || defaultOrderDate;

      // 1. Validate file extension
      if (!checkFileExtension(file)) {
        sheetResults.push({
          fileIndex: i,
          fileName: file.originalname,
          marketplace: marketplace || 'unknown',
          orderDate: orderDate || '',
          hasError: true,
          error: 'Uploaded file must be a valid .xlsx or .csv spreadsheet.',
        });
        continue;
      }

      // 2. Validate marketplace
      if (!marketplace || !marketplaceMappings[marketplace]) {
        const validKeys = Object.keys(marketplaceMappings).join(', ');
        sheetResults.push({
          fileIndex: i,
          fileName: file.originalname,
          marketplace: marketplace || 'unknown',
          orderDate: orderDate || '',
          hasError: true,
          error: `Invalid or missing marketplace. Must be one of: ${validKeys}.`,
        });
        continue;
      }

      // 3. Validate orderDate
      if (!isValidDateString(orderDate)) {
        sheetResults.push({
          fileIndex: i,
          fileName: file.originalname,
          marketplace,
          orderDate: orderDate || '',
          hasError: true,
          error: 'Invalid Order Date. Please provide a valid date in YYYY-MM-DD format.',
        });
        continue;
      }

      // 4. Parse Excel or CSV file
      let parsed;
      try {
        parsed = await parseMarketplaceExcel(file.buffer, marketplace, file.originalname);
      } catch (err) {
        sheetResults.push({
          fileIndex: i,
          fileName: file.originalname,
          marketplace,
          orderDate,
          hasError: true,
          error: err.message,
        });
        continue;
      }

      // 5. Validate rows
      const validationResult = validateRows(parsed.rows);

      // 6. Fetch live existing keys for this marketplace tab (reused within the batch)
      let mpCache = marketplaceKeysCache.get(marketplace);
      if (!mpCache) {
        const { existingKeysSet, tabName } = await dispatchSheetService.getExistingOrderKeys(marketplace);
        mpCache = { existingKeysSet: new Set(existingKeysSet), tabName };
        marketplaceKeysCache.set(marketplace, mpCache);
      }

      // 7. Deduplicate candidates against Google Sheet + any preceding rows in this batch
      const dedupResult = deduplicateRows(
        validationResult.candidateRows,
        mpCache.existingKeysSet,
        marketplace
      );

      // Register new rows in mpCache so subsequent files for the same marketplace catch cross-file duplicates
      for (const newRow of dedupResult.newRows) {
        if (newRow.orderId && newRow.sku) {
          mpCache.existingKeysSet.add(createOrderSkuKey(newRow.orderId, newRow.sku));
        }
      }

      const duplicateRows = [
        ...(dedupResult.duplicateRows || []),
        ...(validationResult.inFileDuplicates || []),
      ];

      // 8. Cache preview in previewStoreService
      const formattedOrderDate = formatDateForSheet(orderDate);
      const previewToken = previewStoreService.savePreview({
        newRows: dedupResult.newRows,
        duplicateRows,
        marketplace,
        orderDate: formattedOrderDate,
        tabName: mpCache.tabName,
        fileName: file.originalname,
      });

      sheetResults.push({
        fileIndex: i,
        fileName: file.originalname,
        marketplace,
        orderDate: formattedOrderDate,
        tabName: mpCache.tabName,
        summary: {
          totalRowsInFile: parsed.totalRowsInFile,
          newRecords: dedupResult.newRecordsCount,
          alreadyExisting: dedupResult.alreadyExistingCount,
          problemRecords: validationResult.problemRecordsCount,
          duplicateRecords: duplicateRows.length,
        },
        duplicateRows,
        problemRows: validationResult.problemRows,
        previewToken,
        sampleNewRecords: dedupResult.newRows.slice(0, 5),
        targetTabName: mpCache.tabName,
        hasError: false,
      });
    }

    const validSheets = sheetResults.filter((s) => !s.hasError);
    if (validSheets.length === 0 && sheetResults.length > 0) {
      return res.status(400).json({
        error: sheetResults[0].error || 'All uploaded files failed validation.',
        sheets: sheetResults,
      });
    }

    const aggregateSummary = {
      totalFiles: sheetResults.length,
      validFiles: validSheets.length,
      totalRowsInFile: validSheets.reduce((sum, s) => sum + (s.summary?.totalRowsInFile || 0), 0),
      newRecords: validSheets.reduce((sum, s) => sum + (s.summary?.newRecords || 0), 0),
      alreadyExisting: validSheets.reduce((sum, s) => sum + (s.summary?.alreadyExisting || 0), 0),
      problemRecords: validSheets.reduce((sum, s) => sum + (s.summary?.problemRecords || 0), 0),
      duplicateRecords: validSheets.reduce((sum, s) => sum + (s.summary?.duplicateRecords || 0), 0),
    };

    const batchToken = previewStoreService.saveBatchPreview({
      sheets: sheetResults,
      sheetTokens: validSheets.map((s) => s.previewToken),
      aggregateSummary,
    });

    return res.status(200).json({
      batchToken,
      aggregateSummary,
      sheets: sheetResults,
    });
  } catch (err) {
    if (err.name === 'GoogleSheetsServiceError') {
      return res.status(err.statusCode || 502).json({
        error: err.message,
        details: err.details,
      });
    }
    console.error('[UploadController] Unexpected error in handlePreviewBatch:', err);
    return res.status(500).json({ error: 'An unexpected internal error occurred during batch preview.' });
  }
}

/**
 * POST /api/confirm-batch
 * Confirms multiple previously previewed sheets and appends their rows to their respective Google Sheet tabs.
 */
async function handleConfirmBatch(req, res) {
  try {
    const { batchToken, sheetConfirmations } = req.body;

    if (!Array.isArray(sheetConfirmations) || sheetConfirmations.length === 0) {
      return res.status(400).json({ error: 'sheetConfirmations array is required to confirm batch.' });
    }

    const results = [];
    let totalRecordsAdded = 0;
    let totalDuplicatesIncluded = 0;

    for (const conf of sheetConfirmations) {
      const { previewToken, includeDuplicates, selectedDuplicateRowNumbers } = conf;

      if (!previewToken) {
        results.push({
          previewToken: null,
          success: false,
          error: 'Missing previewToken for sheet confirmation.',
        });
        continue;
      }

      const previewData = previewStoreService.consumePreview(previewToken);
      if (!previewData) {
        results.push({
          previewToken,
          success: false,
          error: 'Preview session has expired or already been confirmed.',
        });
        continue;
      }

      const { newRows = [], duplicateRows = [], marketplace, orderDate, tabName, fileName } = previewData;

      let rowsToAppend = [...newRows];

      if (includeDuplicates && Array.isArray(duplicateRows) && duplicateRows.length > 0) {
        if (Array.isArray(selectedDuplicateRowNumbers) && selectedDuplicateRowNumbers.length > 0) {
          const selectedSet = new Set(selectedDuplicateRowNumbers.map(Number));
          const filtered = duplicateRows.filter((r) => selectedSet.has(Number(r.rowNumber)));
          rowsToAppend = rowsToAppend.concat(filtered);
        } else {
          rowsToAppend = rowsToAppend.concat(duplicateRows);
        }
      }

      if (rowsToAppend.length === 0) {
        results.push({
          previewToken,
          fileName,
          marketplace,
          tabName,
          recordsAdded: 0,
          duplicatesIncluded: 0,
          skipped: true,
          message: 'No records to append for this sheet.',
          success: true,
        });
        continue;
      }

      const formattedRows = rowsToAppend.map((row) =>
        formatRowForMarketplace(row, marketplace, orderDate)
      );

      const appendRes = await dispatchSheetService.appendRows(formattedRows, marketplace || tabName);
      const duplicatesAdded = rowsToAppend.length - newRows.length;

      totalRecordsAdded += appendRes.recordsAdded;
      totalDuplicatesIncluded += duplicatesAdded;

      results.push({
        previewToken,
        fileName,
        marketplace,
        tabName: appendRes.tabName,
        recordsAdded: appendRes.recordsAdded,
        duplicatesIncluded: duplicatesAdded,
        dispatchSheetTotalRowsNow: appendRes.dispatchSheetTotalRowsNow,
        success: true,
      });
    }

    if (batchToken) {
      previewStoreService.consumeBatchPreview(batchToken);
    }

    return res.status(200).json({
      success: true,
      totalRecordsAdded,
      totalDuplicatesIncluded,
      sheets: results,
    });
  } catch (err) {
    if (err.name === 'GoogleSheetsServiceError') {
      return res.status(err.statusCode || 502).json({
        error: err.message,
        details: err.details,
      });
    }
    console.error('[UploadController] Unexpected error in handleConfirmBatch:', err);
    return res.status(500).json({ error: 'An unexpected internal error occurred while appending batch rows.' });
  }
}

/**
 * GET /api/health
 * Returns service status, Google Sheets configuration status, and diagnostic details.
 */
function handleHealth(req, res) {
  return res.status(200).json({
    status: 'ok',
    googleSheets: {
      isConfigured: googleSheetsConfig.isConfigured(),
      isMock: googleSheetsConfig.isMock(),
      spreadsheetId: googleSheetsConfig.getSpreadsheetId() || null,
      tabName: googleSheetsConfig.getTabName(),
      tabNames: googleSheetsConfig.getAllTabNames(),
      serviceAccountEmail: googleSheetsConfig.getServiceAccountEmail(),
      configError: googleSheetsConfig.getConfigError(),
    },
  });
}

/**
 * Formats a single parsed row object into an array of cell values matching
 * the specific destination Google Sheet tab layout for the given marketplace.
 */
function formatRowForMarketplace(row, marketplace, orderDate) {
  const normMp = String(marketplace || '').toLowerCase().trim();
  let rowArray;

  if (normMp === 'flipkart') {
    // Flipkart Google Sheet Tab Layout (11 Columns):
    // 1. Dispatch Date (Col A)
    // 2. Order ID (Col B)
    // 3. Sku (Col C)
    // 4. Order Qty (Col D)
    // 5. Product Name (Col E)
    // 6. Brand (Col F)
    // 7. Shipment Tracker (Col G)
    // 8. Courier (Col H)
    // 9. MRP (Col I)
    // 10. Payment mode (Col J)
    // 11. SENT sku (Col K - left blank)
    rowArray = [
      orderDate,                                           // 1. Dispatch Date
      row.orderId || '',                                   // 2. Order ID
      row.sku || '',                                       // 3. Sku
      row.orderedQty !== undefined ? row.orderedQty : '',  // 4. Order Qty
      row.productName || '',                               // 5. Product Name
      row.brand || '',                                     // 6. Brand
      row.courierTrackingId || '',                         // 7. Shipment Tracker
      row.courier || '',                                   // 8. Courier (from 'Shipping Company')
      row.amount !== undefined ? row.amount : '',          // 9. MRP
      row.paymentMode || '',                               // 10. Payment mode
      '',                                                  // 11. SENT sku (left blank for manual entry)
    ];
  } else if (normMp === 'nykaa') {
    // Nykaa Google Sheet Tab Layout:
    // 1. Dispatch Date (Col A)
    // 2. SKU Code (Col B)
    // 3. QTY (Col C)
    // 4. Dispatch Item (Col D)
    // 5. Brand (Col E)
    // 6. Order Id (Col F)
    // 7. Tracking ID (Col G)
    // 8. Courier (Col H - from 'Shipping Company')
    // 9. Status (Col I)
    // 10. MRP (Col J)
    // 11. Payment mode (Col K)
    // 12. Sent sku (Col L - left blank)
    // 13. Nykaa beauty (Col M - left blank)
    rowArray = [
      orderDate,                                           // 1. Dispatch Date
      row.sku || '',                                       // 2. SKU Code
      row.orderedQty !== undefined ? row.orderedQty : '',  // 3. QTY
      row.productName || '',                               // 4. Dispatch Item
      row.brand || '',                                     // 5. Brand
      row.orderId || '',                                   // 6. Order Id
      row.courierTrackingId || '',                         // 7. Tracking ID
      row.courier || '',                                   // 8. Courier (from 'Shipping Company')
      row.status || '',                                    // 9. Status
      row.amount !== undefined ? row.amount : '',          // 10. MRP
      row.paymentMode || '',                               // 11. Payment mode
      '',                                                  // 12. Sent sku
      '',                                                  // 13. Nykaa beauty
    ];
  } else if (normMp === 'myntra') {
    // Myntra Google Sheet Tab Layout (12 Columns):
    // 1. Dispatch Date (Col A)
    // 2. SKU Code (Col B)
    // 3. QTY (Col C)
    // 4. Product Name (Col D)
    // 5. Brand (Col E)
    // 6. Order Id (Col F)
    // 7. Tracking ID (Col G)
    // 8. Courier (Col H - from 'Shipping Company')
    // 9. Status (Col I)
    // 10. MRP (Col J)
    // 11. COD / Payment mode (Col K)
    // 12. Sent sku (Col L - left blank)
    rowArray = [
      orderDate,                                           // 1. Dispatch Date
      row.sku || '',                                       // 2. SKU Code
      row.orderedQty !== undefined ? row.orderedQty : '',  // 3. QTY
      row.productName || '',                               // 4. Product Name
      row.brand || '',                                     // 5. Brand
      row.orderId || '',                                   // 6. Order Id
      row.courierTrackingId || '',                         // 7. Tracking ID
      row.courier || '',                                   // 8. Courier (from 'Shipping Company')
      row.status || '',                                    // 9. Status
      row.amount !== undefined ? row.amount : '',          // 10. MRP
      row.paymentMode || '',                               // 11. COD / Payment mode
      '',                                                  // 12. Sent sku
    ];
  } else {
    // Default / Amazon Google Sheet Tab Layout (12 Columns):
    // [Order Date, SKU, Ordered Qty, Product Name, Brand, Order Id, Courier, Tracking ID, Status, Amt, Payment mode, Wrong Sku Sent]
    rowArray = [
      orderDate,                                           // 1. Order Date (Col A)
      row.sku || '',                                       // 2. SKU (Col B)
      row.orderedQty !== undefined ? row.orderedQty : '',  // 3. Ordered Qty (Col C)
      row.productName || '',                               // 4. Product Name (Col D)
      row.brand || '',                                     // 5. Brand (Col E)
      row.orderId || '',                                   // 6. Order Id (Col F)
      row.courier || '',                                   // 7. Courier (Col G)
      row.courierTrackingId || '',                         // 8. Tracking ID (Col H)
      row.status || '',                                    // 9. Status (Col I)
      row.amount !== undefined ? row.amount : '',          // 10. Amt (Col J)
      row.paymentMode || '',                               // 11. Payment mode (Col K)
      '',                                                  // 12. Wrong Sku Sent (Col L)
    ];
  }

  // Ensure all string cells are trimmed and completely free of unwanted backticks
  return rowArray.map((cell) => (typeof cell === 'string' ? cell.replace(/`/g, '').trim() : cell));
}

module.exports = {
  handlePreview,
  handleConfirm,
  handlePreviewBatch,
  handleConfirmBatch,
  handleHealth,
  formatRowForMarketplace,
  detectMarketplaceFromFilename,
};
