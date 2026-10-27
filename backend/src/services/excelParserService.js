const ExcelJS = require('exceljs');
const { Readable } = require('stream');
const marketplaceMappings = require('../config/marketplaceMappings');

class ExcelParseError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'ExcelParseError';
    this.statusCode = statusCode;
  }
}

/**
 * Checks if a buffer starts with PK Zip magic numbers (standard for .xlsx)
 */
function isXlsxBuffer(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  );
}

/**
 * Strips unwanted backticks (`) and trims string values
 */
function cleanCellValue(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') {
    return val.replace(/`/g, '').trim();
  }
  return val;
}

/**
 * Normalizes text for comparison (trims, strips BOM and unwanted backticks, standardizes spaces)
 */
function normalizeHeader(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/^\ufeff/, '').replace(/`/g, '').trim();
}

/**
 * Extracts raw cell value safely from ExcelJS cell and cleans unwanted backticks
 */
function getCellValue(cell) {
  if (!cell || cell.value === null || cell.value === undefined) {
    return '';
  }

  const val = cell.value;

  // Handle rich text
  if (typeof val === 'object' && val.richText && Array.isArray(val.richText)) {
    return cleanCellValue(val.richText.map(t => t.text).join(''));
  }

  // Handle formula results
  if (typeof val === 'object' && 'result' in val) {
    return val.result !== undefined && val.result !== null ? cleanCellValue(String(val.result)) : '';
  }

  // Handle Date
  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
  }

  return cleanCellValue(String(val));
}

/**
 * Parses an uploaded .xlsx or .csv buffer according to the marketplace column mapping.
 * @param {Buffer} buffer - Excel or CSV file buffer
 * @param {string} marketplaceKey - amazon, flipkart, nykaa, myntra
 * @param {string} [originalname] - optional file name to assist format detection
 * @returns {Promise<{ rows: Array<object>, totalRowsInFile: number }>}
 */
async function parseMarketplaceExcel(buffer, marketplaceKey, originalname = '') {
  const mappingConfig = marketplaceMappings[marketplaceKey];
  if (!mappingConfig) {
    throw new ExcelParseError(`Unsupported marketplace: "${marketplaceKey}". Supported: ${Object.keys(marketplaceMappings).join(', ')}`);
  }

  const isExplicitCsv = originalname.toLowerCase().endsWith('.csv');
  const isXlsx = isXlsxBuffer(buffer);
  const isCsv = isExplicitCsv || !isXlsx;

  const workbook = new ExcelJS.Workbook();
  if (isCsv) {
    try {
      await workbook.csv.read(Readable.from([buffer]));
    } catch (err) {
      throw new ExcelParseError(`Uploaded file is not a valid .csv file: ${err.message}`);
    }
  } else {
    try {
      await workbook.xlsx.load(buffer);
    } catch (err) {
      throw new ExcelParseError(`Uploaded file is not a valid .xlsx spreadsheet: ${err.message}`);
    }
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount < 1) {
    throw new ExcelParseError('The uploaded file has no worksheets or is completely empty.');
  }

  // Read header row (Row 1)
  const headerRow = worksheet.getRow(1);
  const headerToColIndex = new Map();

  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const headerText = normalizeHeader(getCellValue(cell));
    if (headerText) {
      headerToColIndex.set(headerText.toLowerCase(), { colNumber, rawHeader: headerText });
    }
  });

  // Verify expected columns from columnMap exist (accounting for optionalColumns)
  const expectedSourceHeaders = Object.keys(mappingConfig.columnMap);
  const optionalHeaders = (mappingConfig.optionalColumns || []).map((h) => h.toLowerCase());
  const missingHeaders = [];
  const fieldToColNumber = {};

  for (const expectedHeader of expectedSourceHeaders) {
    const match = headerToColIndex.get(expectedHeader.toLowerCase());
    if (!match) {
      if (!optionalHeaders.includes(expectedHeader.toLowerCase())) {
        missingHeaders.push(expectedHeader);
      }
    } else {
      const canonicalField = mappingConfig.columnMap[expectedHeader];
      fieldToColNumber[canonicalField] = match.colNumber;
    }
  }

  if (missingHeaders.length > 0) {
    throw new ExcelParseError(
      `Uploaded file is missing expected source column(s): "${missingHeaders.join('", "')}" for ${mappingConfig.displayName}.`
    );
  }

  const parsedRows = [];
  const totalRowsCount = worksheet.rowCount;

  for (let rowNumber = 2; rowNumber <= totalRowsCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);

    // Check if row is completely empty
    let hasAnyValue = false;
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (getCellValue(cell) !== '') hasAnyValue = true;
    });

    if (!hasAnyValue) {
      continue; // Skip blank rows
    }

    const rowData = {
      rowNumber,
      sku: '',
      orderedQty: 0,
      productName: '',
      brand: '',
      orderId: '',
      courier: '',
      courierTrackingId: '',
      status: '',
      amount: 0,
      paymentMode: '',
    };

    for (const [canonicalField, colNumber] of Object.entries(fieldToColNumber)) {
      const cell = row.getCell(colNumber);
      const val = getCellValue(cell);

      if (canonicalField === 'orderedQty') {
        const parsedNum = Number(val);
        rowData[canonicalField] = Number.isFinite(parsedNum) ? parsedNum : val;
      } else if (canonicalField === 'amount') {
        const cleanAmount = String(val).replace(/[^0-9.-]+/g, '');
        const parsedNum = Number(cleanAmount);
        rowData[canonicalField] = Number.isFinite(parsedNum) ? parsedNum : val;
      } else {
        rowData[canonicalField] = val;
      }
    }

    parsedRows.push(rowData);
  }

  return {
    rows: parsedRows,
    totalRowsInFile: parsedRows.length,
  };
}

module.exports = {
  cleanCellValue,
  parseMarketplaceExcel,
  parseMarketplaceFile: parseMarketplaceExcel,
  ExcelParseError,
};
