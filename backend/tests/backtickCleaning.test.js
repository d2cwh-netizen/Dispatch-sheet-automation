const ExcelJS = require('exceljs');
const { parseMarketplaceExcel, cleanCellValue } = require('../src/services/excelParserService');
const { validateRows } = require('../src/services/validationService');
const { deduplicateRows, createOrderSkuKey } = require('../src/services/dedupService');
const { formatRowForMarketplace } = require('../src/controllers/uploadController');

describe('Backtick Cleaning & Sanitization on File Upload', () => {
  describe('cleanCellValue', () => {
    it('should strip backticks from various string patterns', () => {
      expect(cleanCellValue('`OD12345')).toBe('OD12345');
      expect(cleanCellValue('OD12345`')).toBe('OD12345');
      expect(cleanCellValue('`OD12345`')).toBe('OD12345');
      expect(cleanCellValue('```OD12345```')).toBe('OD12345');
      expect(cleanCellValue('`  OD12345  `')).toBe('OD12345');
      expect(cleanCellValue('`')).toBe('');
      expect(cleanCellValue('```')).toBe('');
      expect(cleanCellValue('`   `')).toBe('');
      expect(cleanCellValue(null)).toBe('');
      expect(cleanCellValue(undefined)).toBe('');
      expect(cleanCellValue(12345)).toBe(12345);
    });
  });

  describe('parseMarketplaceExcel with backticks in XLSX', () => {
    it('should clean unwanted backticks from headers and data columns in XLSX', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Orders');

      // Headers with backticks
      ws.columns = [
        { header: '`Product SKU Code`', key: 'sku' },
        { header: '`Qty`', key: 'qty' },
        { header: '`Product Name`', key: 'name' },
        { header: 'Brand Name', key: 'brand' },
        { header: '`Channel Order ID`', key: 'orderId' },
        { header: '`Shipment Tracker`', key: 'tracking' },
        { header: 'Order Status', key: 'status' },
        { header: '`Total`', key: 'total' },
        { header: 'Order Type', key: 'payment' },
      ];

      // Rows with unwanted backticks across columns
      ws.addRow({
        sku: '`SKU-AMZ-001`',
        qty: '`2',
        name: '`Noise Cancelling Earbuds`',
        brand: '`AudioBrand`',
        orderId: '`AMZ-ORD-12345`',
        tracking: '`TRK-DELHIVERY-9988`',
        status: '`Shipped`',
        total: '`2499.50',
        payment: '`Prepaid`',
      });

      const buffer = await wb.xlsx.writeBuffer();
      const result = await parseMarketplaceExcel(buffer, 'amazon');

      expect(result.totalRowsInFile).toBe(1);
      const row = result.rows[0];

      // Verify all backticks are completely stripped
      expect(row.sku).toBe('SKU-AMZ-001');
      expect(row.orderedQty).toBe(2);
      expect(typeof row.orderedQty).toBe('number');
      expect(row.productName).toBe('Noise Cancelling Earbuds');
      expect(row.brand).toBe('AudioBrand');
      expect(row.orderId).toBe('AMZ-ORD-12345');
      expect(row.courierTrackingId).toBe('TRK-DELHIVERY-9988');
      expect(row.status).toBe('Shipped');
      expect(row.amount).toBe(2499.5);
      expect(row.paymentMode).toBe('Prepaid');

      // Verify row passes validation without false failures
      const validation = validateRows(result.rows);
      expect(validation.problemRecordsCount).toBe(0);
      expect(validation.candidateRows.length).toBe(1);
    });
  });

  describe('parseMarketplaceExcel with backticks in CSV', () => {
    it('should clean unwanted backticks from headers and data columns in CSV', async () => {
      const csvContent = [
        '`Product SKU Code`,`Qty`,`Product Name`,`Brand Name`,`Channel Order ID`,`Shipment Tracker`,`Order Status`,`Total`,`Order Type`',
        '`CSV-SKU-999`,`3`,`Gaming Mouse`,`TechPro`,`ORD-CSV-777`,`TRK-EKART-555`,`Shipped`,`1899.00`,`COD`',
      ].join('\n');

      const buffer = Buffer.from(csvContent, 'utf8');
      const result = await parseMarketplaceExcel(buffer, 'amazon', 'test.csv');

      expect(result.totalRowsInFile).toBe(1);
      const row = result.rows[0];

      expect(row.sku).toBe('CSV-SKU-999');
      expect(row.orderedQty).toBe(3);
      expect(typeof row.orderedQty).toBe('number');
      expect(row.productName).toBe('Gaming Mouse');
      expect(row.brand).toBe('TechPro');
      expect(row.orderId).toBe('ORD-CSV-777');
      expect(row.courierTrackingId).toBe('TRK-EKART-555');
      expect(row.status).toBe('Shipped');
      expect(row.amount).toBe(1899);
      expect(row.paymentMode).toBe('COD');

      const validation = validateRows(result.rows);
      expect(validation.problemRecordsCount).toBe(0);
      expect(validation.candidateRows.length).toBe(1);
    });
  });

  describe('Deduplication with backticks', () => {
    it('should match keys regardless of whether backticks were present', () => {
      const keyWithoutBacktick = createOrderSkuKey('OD-101', 'SKU-001');
      const keyWithBackticks = createOrderSkuKey('`OD-101`', '`SKU-001`');

      expect(keyWithoutBacktick).toBe('od-101___sku-001');
      expect(keyWithBackticks).toBe('od-101___sku-001');
      expect(keyWithBackticks).toBe(keyWithoutBacktick);

      // Existing key set from sheet that had clean keys
      const existingKeysSet = new Set(['od-101___sku-001']);
      const candidateRow = { orderId: '`OD-101`', sku: '`SKU-001`' };

      const dedupResult = deduplicateRows([candidateRow], existingKeysSet, 'amazon');
      expect(dedupResult.alreadyExistingCount).toBe(1);
      expect(dedupResult.newRecordsCount).toBe(0);
    });
  });

  describe('formatRowForMarketplace', () => {
    it('should guarantee no backticks in output array for all marketplaces', () => {
      const row = {
        orderId: '`OD-FLIP-1`',
        sku: '`SKU-FLIP-1`',
        orderedQty: 1,
        productName: '`Item Name`',
        brand: '`Brand Name`',
        courierTrackingId: '`TRK123`',
        courier: '`Ekart`',
        amount: 500,
        paymentMode: '`Prepaid`',
      };

      const flipkartRow = formatRowForMarketplace(row, 'flipkart', '2026-10-01');
      for (const cell of flipkartRow) {
        if (typeof cell === 'string') {
          expect(cell.includes('`')).toBe(false);
        }
      }

      const amazonRow = formatRowForMarketplace(row, 'amazon', '2026-10-01');
      for (const cell of amazonRow) {
        if (typeof cell === 'string') {
          expect(cell.includes('`')).toBe(false);
        }
      }

      const nykaaRow = formatRowForMarketplace(row, 'nykaa', '2026-10-01');
      for (const cell of nykaaRow) {
        if (typeof cell === 'string') {
          expect(cell.includes('`')).toBe(false);
        }
      }

      const myntraRow = formatRowForMarketplace(row, 'myntra', '2026-10-01');
      for (const cell of myntraRow) {
        if (typeof cell === 'string') {
          expect(cell.includes('`')).toBe(false);
        }
      }
    });
  });
});
