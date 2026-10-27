process.env.NODE_ENV = 'test';
process.env.MOCK_GOOGLE_SHEETS = 'true';

const ExcelJS = require('exceljs');
const { parseMarketplaceExcel, ExcelParseError } = require('../src/services/excelParserService');
const { validateRows } = require('../src/services/validationService');
const { deduplicateRows, createCompositeKey, createOrderSkuKey } = require('../src/services/dedupService');
const previewStoreService = require('../src/services/previewStoreService');
const dispatchSheetService = require('../src/services/dispatchSheetService');

describe('Dispatch Sheet Automation - Backend Services', () => {
  beforeEach(() => {
    dispatchSheetService.resetMockState();
  });

  describe('excelParserService', () => {
    it('should successfully parse a valid marketplace excel buffer', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Orders');
      ws.columns = [
        { header: 'Product SKU Code', key: 'sku' },
        { header: 'Qty', key: 'qty' },
        { header: 'Product Name', key: 'name' },
        { header: 'Brand Name', key: 'brand' },
        { header: 'Channel Order ID', key: 'orderId' },
        { header: 'Shipment Tracker', key: 'tracking' },
        { header: 'Order Status', key: 'status' },
        { header: 'Total', key: 'total' },
        { header: 'Order Type', key: 'payment' },
      ];
      ws.addRow({
        sku: 'TEST-SKU-1',
        qty: 2,
        name: 'Test Product',
        brand: 'BrandX',
        orderId: 'ORD-101',
        tracking: 'TRK-101',
        status: 'Shipped',
        total: 1500,
        payment: 'Prepaid',
      });

      const buffer = await wb.xlsx.writeBuffer();
      const result = await parseMarketplaceExcel(buffer, 'amazon');

      expect(result.totalRowsInFile).toBe(1);
      expect(result.rows[0].sku).toBe('TEST-SKU-1');
      expect(result.rows[0].orderedQty).toBe(2);
      expect(result.rows[0].orderId).toBe('ORD-101');
    });

    it('should successfully parse a valid marketplace CSV buffer', async () => {
      const csvContent = [
        'Product SKU Code,Qty,Product Name,Brand Name,Channel Order ID,Shipment Tracker,Order Status,Total,Order Type',
        'CSV-SKU-1,3,"Wireless Mouse, Ergonomic",TechCo,ORD-CSV-101,TRK-CSV-1,Shipped,1299.50,Prepaid',
      ].join('\n');

      const buffer = Buffer.from(csvContent, 'utf8');
      const result = await parseMarketplaceExcel(buffer, 'amazon', 'orders.csv');

      expect(result.totalRowsInFile).toBe(1);
      expect(result.rows[0].sku).toBe('CSV-SKU-1');
      expect(result.rows[0].orderedQty).toBe(3);
      expect(result.rows[0].productName).toBe('Wireless Mouse, Ergonomic');
      expect(result.rows[0].orderId).toBe('ORD-CSV-101');
      expect(result.rows[0].amount).toBe(1299.5);
      expect(result.rows[0].paymentMode).toBe('Prepaid');
    });

    it('should successfully parse CSV with UTF-8 BOM', async () => {
      const csvContent = '\ufeffProduct SKU Code,Qty,Product Name,Brand Name,Channel Order ID,Shipment Tracker,Order Status,Total,Order Type\nBOM-SKU-1,1,Keyboard,BrandZ,ORD-BOM-1,TRK-BOM-1,Shipped,499,COD';
      const buffer = Buffer.from(csvContent, 'utf8');
      const result = await parseMarketplaceExcel(buffer, 'amazon', 'orders_bom.csv');

      expect(result.totalRowsInFile).toBe(1);
      expect(result.rows[0].sku).toBe('BOM-SKU-1');
      expect(result.rows[0].orderId).toBe('ORD-BOM-1');
    });

    it('should throw ExcelParseError naming the exact missing column in CSV', async () => {
      const csvContent = 'Qty,Product Name,Brand Name,Channel Order ID,Shipment Tracker,Order Status,Total,Order Type\n1,Prod,Brand,O1,T1,Shipped,10,COD';
      const buffer = Buffer.from(csvContent, 'utf8');

      await expect(parseMarketplaceExcel(buffer, 'amazon', 'test.csv')).rejects.toThrow(
        /missing expected source column\(s\): "Product SKU Code"/i
      );
    });

    it('should throw ExcelParseError naming the exact missing column in Excel', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Orders');
      ws.columns = [
        // Missing 'Product SKU Code'
        { header: 'Qty', key: 'qty' },
        { header: 'Product Name', key: 'name' },
        { header: 'Brand Name', key: 'brand' },
        { header: 'Channel Order ID', key: 'orderId' },
        { header: 'Shipment Tracker', key: 'tracking' },
        { header: 'Order Status', key: 'status' },
        { header: 'Total', key: 'total' },
        { header: 'Order Type', key: 'payment' },
      ];
      ws.addRow({ qty: 1, name: 'Prod', brand: 'Brand', orderId: 'O1', tracking: 'T1', status: 'S', total: 10, payment: 'COD' });

      const buffer = await wb.xlsx.writeBuffer();

      await expect(parseMarketplaceExcel(buffer, 'amazon')).rejects.toThrow(
        /missing expected source column\(s\): "Product SKU Code"/i
      );
    });
  });

  describe('validationService', () => {
    it('should identify valid candidates and flag missing SKU, missing Order ID, and non-positive qty', () => {
      const rows = [
        { rowNumber: 2, sku: 'SKU1', orderedQty: 2, orderId: 'ORD-A' },
        { rowNumber: 3, sku: '', orderedQty: 1, orderId: 'ORD-B' }, // Missing SKU
        { rowNumber: 4, sku: 'SKU2', orderedQty: 1, orderId: '' },  // Missing Order ID
        { rowNumber: 5, sku: 'SKU3', orderedQty: 0, orderId: 'ORD-C' }, // Zero qty
        { rowNumber: 6, sku: 'SKU4', orderedQty: -1, orderId: 'ORD-D' }, // Negative qty
      ];

      const result = validateRows(rows);

      expect(result.candidateRows.length).toBe(1);
      expect(result.candidateRows[0].orderId).toBe('ORD-A');
      expect(result.problemRows.length).toBe(4);
      expect(result.problemRows[0].reason).toContain('Missing SKU');
      expect(result.problemRows[1].reason).toContain('Missing Order ID');
      expect(result.problemRows[2].reason).toContain('Ordered Qty must be a positive number');
      expect(result.problemRows[3].reason).toContain('Ordered Qty must be a positive number');
    });

    it('should keep multi-item orders with the same Order ID but different SKUs as valid candidates', () => {
      const rows = [
        { rowNumber: 2, sku: 'SKU1', orderedQty: 1, orderId: 'ORD-MULTI' },
        { rowNumber: 3, sku: 'SKU2', orderedQty: 2, orderId: 'ORD-MULTI' }, // Same Order ID, different SKU -> BOTH KEPT!
      ];

      const result = validateRows(rows);

      expect(result.candidateRows.length).toBe(2);
      expect(result.problemRows.length).toBe(0);
    });

    it('should mark in-file duplicates with same Order ID AND same SKU as problem rows', () => {
      const rows = [
        { rowNumber: 2, sku: 'SKU1', orderedQty: 1, orderId: 'ORD-DUP' },
        { rowNumber: 3, sku: 'SKU1', orderedQty: 2, orderId: 'ORD-DUP' }, // Same Order ID AND same SKU -> DUPLICATE!
      ];

      const result = validateRows(rows);

      expect(result.candidateRows.length).toBe(1);
      expect(result.candidateRows[0].rowNumber).toBe(2);
      expect(result.problemRows.length).toBe(1);
      expect(result.problemRows[0].rowNumber).toBe(3);
      expect(result.problemRows[0].reason).toContain('Duplicate Order ID and SKU within uploaded file');
    });
  });

  describe('dedupService', () => {
    it('should deduplicate candidates against existing sheet (Order ID + SKU) keys', () => {
      const existingKeysSet = new Set([
        createOrderSkuKey('ORD-EXISTING', 'SKU-EXISTING'),
      ]);

      const candidates = [
        { orderId: 'ORD-NEW', sku: 'SKU-A' },
        { orderId: 'ORD-EXISTING', sku: 'SKU-DIFFERENT' }, // Same Order ID, different SKU -> KEPT!
        { orderId: 'ORD-EXISTING', sku: 'SKU-EXISTING' },  // Same Order ID, same SKU -> DUPLICATE!
      ];

      const result = deduplicateRows(candidates, existingKeysSet, 'amazon');

      expect(result.newRecordsCount).toBe(2);
      expect(result.alreadyExistingCount).toBe(1);
      expect(result.newRows[0].orderId).toBe('ORD-NEW');
      expect(result.newRows[1].sku).toBe('SKU-DIFFERENT');
    });
  });

  describe('previewStoreService', () => {
    it('should store preview data, issue token, and consume it once', () => {
      const token = previewStoreService.savePreview({
        newRows: [{ orderId: '1' }],
        marketplace: 'amazon',
        orderDate: '2026-09-23',
      });

      expect(typeof token).toBe('string');
      const retrieved = previewStoreService.getPreview(token);
      expect(retrieved).not.toBeNull();
      expect(retrieved.marketplace).toBe('amazon');

      const consumed = previewStoreService.consumePreview(token);
      expect(consumed).not.toBeNull();

      // Second consumption must fail (single-use)
      const consumedAgain = previewStoreService.consumePreview(token);
      expect(consumedAgain).toBeNull();
    });
  });

  describe('dispatchSheetService (Mock mode)', () => {
    it('should read and append rows correctly in mock mode', async () => {
      const initial = await dispatchSheetService.getExistingOrderKeys();
      expect(initial.totalExistingRows).toBe(0);

      const rowsToAppend = [
        ['2026-09-23', 'SKU-1', 1, 'Prod 1', 'Brand 1', 'ORD-101', 'TRK-1', 'Shipped', 100, 'Prepaid', '', 'Amazon'],
      ];

      const appendResult = await dispatchSheetService.appendRows(rowsToAppend);
      expect(appendResult.recordsAdded).toBe(1);
      expect(appendResult.dispatchSheetTotalRowsNow).toBe(1);

      const afterAppend = await dispatchSheetService.getExistingOrderKeys();
      expect(afterAppend.totalExistingRows).toBe(1);
      expect(afterAppend.existingKeysSet.has(createOrderSkuKey('ORD-101', 'SKU-1'))).toBe(true);
    });

    it('should isolate rows and deduplication keys by marketplace tab', async () => {
      // 1. Append rows to Amazon tab
      const amazonRows = [
        ['2026-09-24', 'SKU-AMZ', 1, 'Amz Product', 'BrandA', 'ORD-AMZ-1', 'TRK-1', 'Shipped', 500, 'Prepaid', '', ''],
      ];
      await dispatchSheetService.appendRows(amazonRows, 'amazon');

      // 2. Append rows to Flipkart tab (11 columns: Date, Order ID, Sku, Qty, Name, Brand, Tracking, Courier, MRP, Payment, SENT sku)
      const flipkartRows = [
        ['2026-09-24', 'ORD-FK-1', 'SKU-FK', 2, 'FK Product', 'BrandB', 'TRK-2', 'Ekart', 800, 'COD', ''],
      ];
      await dispatchSheetService.appendRows(flipkartRows, 'flipkart');

      // 3. Verify Amazon tab contains only Amazon key
      const amazonState = await dispatchSheetService.getExistingOrderKeys('amazon');
      expect(amazonState.totalExistingRows).toBe(1);
      expect(amazonState.existingKeysSet.has(createOrderSkuKey('ORD-AMZ-1', 'SKU-AMZ'))).toBe(true);
      expect(amazonState.existingKeysSet.has(createOrderSkuKey('ORD-FK-1', 'SKU-FK'))).toBe(false);

      // 4. Verify Flipkart tab contains only Flipkart key
      const flipkartState = await dispatchSheetService.getExistingOrderKeys('flipkart');
      expect(flipkartState.totalExistingRows).toBe(1);
      expect(flipkartState.existingKeysSet.has(createOrderSkuKey('ORD-FK-1', 'SKU-FK'))).toBe(true);
      expect(flipkartState.existingKeysSet.has(createOrderSkuKey('ORD-AMZ-1', 'SKU-AMZ'))).toBe(false);
    });
  });

  describe('googleSheetsConfig tab resolution from .env', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should resolve tab names from GOOGLE_SHEET_TAB_NAME_<MP> env vars', () => {
      const googleSheetsConfig = require('../src/config/googleSheetsConfig');
      process.env.GOOGLE_SHEET_TAB_NAME_AMAZON = 'Custom Amazon Tab';
      expect(googleSheetsConfig.getTabName('amazon')).toBe('Custom Amazon Tab');
    });

    it('should resolve tab names from TAB_NAME_<MP> env vars', () => {
      const googleSheetsConfig = require('../src/config/googleSheetsConfig');
      delete process.env.GOOGLE_SHEET_TAB_NAME_FLIPKART;
      process.env.TAB_NAME_FLIPKART = 'Flipkart Tab Custom';
      expect(googleSheetsConfig.getTabName('flipkart')).toBe('Flipkart Tab Custom');
    });

    it('should resolve tab names from <MP>_TAB_NAME env vars', () => {
      const googleSheetsConfig = require('../src/config/googleSheetsConfig');
      delete process.env.GOOGLE_SHEET_TAB_NAME_NYKAA;
      delete process.env.TAB_NAME_NYKAA;
      process.env.NYKAA_TAB_NAME = 'Nykaa Orders';
      expect(googleSheetsConfig.getTabName('nykaa')).toBe('Nykaa Orders');
    });

    it('should fall back to marketplace displayName or default tab when env is unset', () => {
      const googleSheetsConfig = require('../src/config/googleSheetsConfig');
      delete process.env.GOOGLE_SHEET_TAB_NAME_MYNTRA;
      delete process.env.TAB_NAME_MYNTRA;
      delete process.env.MYNTRA_TAB_NAME;
      expect(googleSheetsConfig.getTabName('myntra')).toBe('Myntra');
    });

    it('should return all configured tab names with getAllTabNames()', () => {
      const googleSheetsConfig = require('../src/config/googleSheetsConfig');
      process.env.GOOGLE_SHEET_TAB_NAME_AMAZON = 'AmzTab';
      const allTabs = googleSheetsConfig.getAllTabNames();
      expect(allTabs.marketplaces.amazon).toBe('AmzTab');
      expect(allTabs.marketplaces.flipkart).toBeDefined();
    });
  });

  describe('formatRowForMarketplace', () => {
    const { formatRowForMarketplace } = require('../src/controllers/uploadController');

    it('should format Flipkart rows into 11 columns in exact target order', () => {
      const row = {
        orderId: 'OD438685538458159100',
        sku: 'BG0118SR200G26',
        orderedQty: 1,
        productName: 'AccessHer Rajasthani Bangles',
        brand: 'Accessher',
        courierTrackingId: 'FMPP4293456493',
        courier: 'Ekart Logistics',
        amount: 1172,
        paymentMode: 'COD',
        status: 'Ready to ship',
      };

      const formatted = formatRowForMarketplace(row, 'flipkart', '2026-09-24');

      expect(formatted.length).toBe(11);
      expect(formatted[0]).toBe('2026-09-24');               // Col 1: Dispatch Date
      expect(formatted[1]).toBe('OD438685538458159100');     // Col 2: Order ID
      expect(formatted[2]).toBe('BG0118SR200G26');           // Col 3: Sku
      expect(formatted[3]).toBe(1);                          // Col 4: Order Qty
      expect(formatted[4]).toBe('AccessHer Rajasthani Bangles'); // Col 5: Product Name
      expect(formatted[5]).toBe('Accessher');                // Col 6: Brand
      expect(formatted[6]).toBe('FMPP4293456493');           // Col 7: Shipment Tracker
      expect(formatted[7]).toBe('Ekart Logistics');          // Col 8: Courier (from Shipping Company)
      expect(formatted[8]).toBe(1172);                       // Col 9: MRP
      expect(formatted[9]).toBe('COD');                      // Col 10: Payment mode
      expect(formatted[10]).toBe('');                        // Col 11: SENT sku (must be empty)
      expect(formatted).not.toContain('Ready to ship');      // Order status is omitted
    });

    it('should format Amazon rows into 12 columns in standard Amazon order', () => {
      const row = {
        orderId: 'AMZ-101',
        sku: 'AMZ-SKU',
        orderedQty: 2,
        productName: 'Wireless Charger',
        brand: 'TechBrand',
        courier: 'BlueDart',
        courierTrackingId: 'TRK-999',
        status: 'Shipped',
        amount: 599,
        paymentMode: 'Prepaid',
      };

      const formatted = formatRowForMarketplace(row, 'amazon', '2026-09-24');

      expect(formatted.length).toBe(12);
      expect(formatted[0]).toBe('2026-09-24'); // Col 1: Order Date
      expect(formatted[1]).toBe('AMZ-SKU');    // Col 2: SKU
      expect(formatted[2]).toBe(2);            // Col 3: Ordered Qty
      expect(formatted[5]).toBe('AMZ-101');    // Col 6: Order Id
      expect(formatted[11]).toBe('');          // Col 12: Wrong Sku Sent
    });

    it('should format Nykaa rows placing Tracking ID in Col 7 and Courier in Col 8', () => {
      const row = {
        orderId: 'NYK-101',
        sku: 'NYK-SKU-1',
        orderedQty: 1,
        productName: 'Lipstick Red',
        brand: 'Accessher',
        courier: 'Delhivery',
        courierTrackingId: 'TRK-NYK-999',
        status: 'Ready to ship',
        amount: 504,
        paymentMode: 'PrePaid',
      };

      const formatted = formatRowForMarketplace(row, 'nykaa', '2026-09-24');

      expect(formatted.length).toBe(13);
      expect(formatted[0]).toBe('2026-09-24');       // Col 1: Dispatch Date
      expect(formatted[1]).toBe('NYK-SKU-1');         // Col 2: SKU Code
      expect(formatted[2]).toBe(1);                  // Col 3: QTY
      expect(formatted[3]).toBe('Lipstick Red');     // Col 4: Dispatch Item
      expect(formatted[4]).toBe('Accessher');        // Col 5: Brand
      expect(formatted[5]).toBe('NYK-101');          // Col 6: Order Id
      expect(formatted[6]).toBe('TRK-NYK-999');      // Col 7: Tracking ID (NOT empty!)
      expect(formatted[7]).toBe('Delhivery');        // Col 8: Courier (from Shipping Company!)
      expect(formatted[8]).toBe('Ready to ship');    // Col 9: Status
      expect(formatted[9]).toBe(504);                // Col 10: MRP
      expect(formatted[10]).toBe('PrePaid');         // Col 11: Payment mode
      expect(formatted[11]).toBe('');                // Col 12: Sent sku
    });

    it('should format Myntra rows placing Tracking ID in Col 7 and Courier in Col 8', () => {
      const row = {
        orderId: 'MYN-101',
        sku: 'MYN-SKU-1',
        orderedQty: 3,
        productName: 'Cotton T-Shirt',
        brand: 'BrandM',
        courier: 'Shadowfax',
        courierTrackingId: 'TRK-MYN-888',
        status: 'Shipped',
        amount: 1499,
        paymentMode: 'COD',
      };

      const formatted = formatRowForMarketplace(row, 'myntra', '2026-09-24');

      expect(formatted.length).toBe(12);
      expect(formatted[0]).toBe('2026-09-24');       // Col 1: Dispatch Date
      expect(formatted[1]).toBe('MYN-SKU-1');         // Col 2: SKU Code
      expect(formatted[2]).toBe(3);                  // Col 3: QTY
      expect(formatted[3]).toBe('Cotton T-Shirt');   // Col 4: Product Name
      expect(formatted[4]).toBe('BrandM');           // Col 5: Brand
      expect(formatted[5]).toBe('MYN-101');          // Col 6: Order Id
      expect(formatted[6]).toBe('TRK-MYN-888');      // Col 7: Tracking ID (NOT empty!)
      expect(formatted[7]).toBe('Shadowfax');        // Col 8: Courier (from Shipping Company!)
      expect(formatted[8]).toBe('Shipped');          // Col 9: Status
      expect(formatted[9]).toBe(1499);               // Col 10: MRP
      expect(formatted[10]).toBe('COD');             // Col 11: COD
      expect(formatted[11]).toBe('');                // Col 12: Sent sku
    });
  });

  describe('CSV Parsing with Shipping Company across Marketplaces', () => {
    it('should parse Shipping Company column for Flipkart', async () => {
      const csvData = [
        'Product SKU Code,Qty,Product Name,Brand Name,Channel Order ID,Shipment Tracker,Shipping Company,Order Status,Total,Order Type',
        'BG0118SR200G26,1,"Bangles",Accessher,OD438685538458159100,FMPP4293456493,"Ekart Logistics",Shipped,1172,COD',
      ].join('\n');

      const parsed = await parseMarketplaceExcel(Buffer.from(csvData, 'utf8'), 'flipkart', 'flipkart.csv');
      expect(parsed.rows.length).toBe(1);
      expect(parsed.rows[0].courier).toBe('Ekart Logistics');
      expect(parsed.rows[0].courierTrackingId).toBe('FMPP4293456493');
    });

    it('should parse Shipping Company column for Nykaa', async () => {
      const csvData = [
        'Product SKU Code,Qty,Product Name,Brand Name,Channel Order ID,Shipment Tracker,Shipping Company,Order Status,Total,Order Type',
        'TT0221LP375M3,1,"Hair Clips",Accessher,NYK-101,TRK-NYK-1,"Blue Dart",Shipped,504,Prepaid',
      ].join('\n');

      const parsed = await parseMarketplaceExcel(Buffer.from(csvData, 'utf8'), 'nykaa', 'nykaa.csv');
      expect(parsed.rows.length).toBe(1);
      expect(parsed.rows[0].courier).toBe('Blue Dart');
      expect(parsed.rows[0].courierTrackingId).toBe('TRK-NYK-1');
    });

    it('should parse Shipping Company column for Myntra', async () => {
      const csvData = [
        'Product SKU Code,Qty,Product Name,Brand Name,Channel Order ID,Shipment Tracker,Shipping Company,Order Status,Total,Order Type',
        'MYN-SKU-1,1,"T-Shirt",BrandM,MYN-101,TRK-MYN-1,"Delhivery",Shipped,899,COD',
      ].join('\n');

      const parsed = await parseMarketplaceExcel(Buffer.from(csvData, 'utf8'), 'myntra', 'myntra.csv');
      expect(parsed.rows.length).toBe(1);
      expect(parsed.rows[0].courier).toBe('Delhivery');
      expect(parsed.rows[0].courierTrackingId).toBe('TRK-MYN-1');
    });
  });
});
