process.env.NODE_ENV = 'test';
process.env.MOCK_GOOGLE_SHEETS = 'true';

const request = require('supertest');
const app = require('../src/server');
const dispatchSheetService = require('../src/services/dispatchSheetService');
const googleSheetsConfig = require('../src/config/googleSheetsConfig');

jest.setTimeout(15000);

describe('Batch Upload & Confirm Integration Tests', () => {
  beforeEach(() => {
    dispatchSheetService.resetMockState();
  });

  const sampleAmazonCsv = [
    'Product SKU Code,Qty,Product Name,Brand Name,Channel Order ID,Shipment Tracker,Order Status,Total,Order Type',
    'AMZ-SKU-1,1,"Amazon Earbuds",BrandA,AMZ-ORD-101,AMZ-TRK-1,Shipped,1299,Prepaid',
    'AMZ-SKU-2,2,"Amazon Cable",BrandB,AMZ-ORD-102,AMZ-TRK-2,Shipped,499,COD',
  ].join('\n');

  const sampleFlipkartCsv = [
    'Product SKU Code,Qty,Product Name,Brand Name,Channel Order ID,Shipment Tracker,Shipping Company,Order Status,Total,Order Type',
    'FK-SKU-1,1,"Flipkart Stand",BrandC,FK-ORD-201,FK-TRK-1,BlueDart,Delivered,799,Prepaid',
    'FK-SKU-2,3,"Flipkart Case",BrandD,FK-ORD-202,FK-TRK-2,Ekart,Delivered,899,Prepaid',
  ].join('\n');

  describe('POST /api/preview-batch', () => {
    it('should reject batch request when no files are provided', async () => {
      const res = await request(app)
        .post('/api/preview-batch')
        .field('marketplace', 'amazon')
        .field('orderDate', '2026-10-14');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Please upload at least one .xlsx or .csv file');
    });

    it('should preview multiple files across different marketplaces with aggregate stats', async () => {
      const manifest = JSON.stringify([
        { fileName: 'amazon_orders.csv', marketplace: 'amazon', orderDate: '2026-10-14' },
        { fileName: 'flipkart_orders.csv', marketplace: 'flipkart', orderDate: '2026-10-14' },
      ]);

      const res = await request(app)
        .post('/api/preview-batch')
        .attach('files', Buffer.from(sampleAmazonCsv, 'utf8'), 'amazon_orders.csv')
        .attach('files', Buffer.from(sampleFlipkartCsv, 'utf8'), 'flipkart_orders.csv')
        .field('manifest', manifest);

      expect(res.status).toBe(200);
      expect(res.body.batchToken).toBeDefined();
      expect(res.body.sheets).toHaveLength(2);

      // Verify aggregate summary
      expect(res.body.aggregateSummary.totalFiles).toBe(2);
      expect(res.body.aggregateSummary.validFiles).toBe(2);
      expect(res.body.aggregateSummary.totalRowsInFile).toBe(4);
      expect(res.body.aggregateSummary.newRecords).toBe(4);
      expect(res.body.aggregateSummary.alreadyExisting).toBe(0);

      // Verify Amazon sheet preview
      const amazonSheet = res.body.sheets.find((s) => s.marketplace === 'amazon');
      expect(amazonSheet).toBeDefined();
      expect(amazonSheet.summary.newRecords).toBe(2);
      expect(amazonSheet.targetTabName).toBe(googleSheetsConfig.getTabName('amazon'));
      expect(amazonSheet.previewToken).toBeDefined();

      // Verify Flipkart sheet preview
      const flipkartSheet = res.body.sheets.find((s) => s.marketplace === 'flipkart');
      expect(flipkartSheet).toBeDefined();
      expect(flipkartSheet.summary.newRecords).toBe(2);
      expect(flipkartSheet.targetTabName).toBe(googleSheetsConfig.getTabName('flipkart'));
      expect(flipkartSheet.previewToken).toBeDefined();
    });

    it('should catch cross-file duplicates when two files in the batch have the same order+sku', async () => {
      const file1 = [
        'Product SKU Code,Qty,Product Name,Brand Name,Channel Order ID,Shipment Tracker,Order Status,Total,Order Type',
        'SKU-COMMON,1,"Shared Item",BrandA,ORD-COMMON-1,TRK-1,Shipped,500,Prepaid',
      ].join('\n');

      const file2 = [
        'Product SKU Code,Qty,Product Name,Brand Name,Channel Order ID,Shipment Tracker,Order Status,Total,Order Type',
        'SKU-COMMON,1,"Shared Item",BrandA,ORD-COMMON-1,TRK-2,Shipped,500,Prepaid',
        'SKU-UNIQUE,2,"Unique Item",BrandB,ORD-UNIQ-2,TRK-3,Shipped,600,Prepaid',
      ].join('\n');

      const manifest = JSON.stringify([
        { fileName: 'amz_batch_1.csv', marketplace: 'amazon', orderDate: '2026-10-14' },
        { fileName: 'amz_batch_2.csv', marketplace: 'amazon', orderDate: '2026-10-14' },
      ]);

      const res = await request(app)
        .post('/api/preview-batch')
        .attach('files', Buffer.from(file1, 'utf8'), 'amz_batch_1.csv')
        .attach('files', Buffer.from(file2, 'utf8'), 'amz_batch_2.csv')
        .field('manifest', manifest);

      expect(res.status).toBe(200);
      const sheet1 = res.body.sheets[0];
      const sheet2 = res.body.sheets[1];

      expect(sheet1.summary.newRecords).toBe(1);
      // In sheet 2, SKU-COMMON should be detected as already existing because of sheet 1
      expect(sheet2.summary.newRecords).toBe(1);
      expect(sheet2.summary.alreadyExisting).toBe(1);
      expect(sheet2.duplicateRows).toHaveLength(1);
      expect(sheet2.duplicateRows[0].sku).toBe('SKU-COMMON');
    });

    it('should handle partial file errors and still return preview for valid files', async () => {
      const invalidCsv = 'RandomHeader1,RandomHeader2\nVal1,Val2';

      const manifest = JSON.stringify([
        { fileName: 'valid_amazon.csv', marketplace: 'amazon', orderDate: '2026-10-14' },
        { fileName: 'invalid_columns.csv', marketplace: 'amazon', orderDate: '2026-10-14' },
      ]);

      const res = await request(app)
        .post('/api/preview-batch')
        .attach('files', Buffer.from(sampleAmazonCsv, 'utf8'), 'valid_amazon.csv')
        .attach('files', Buffer.from(invalidCsv, 'utf8'), 'invalid_columns.csv')
        .field('manifest', manifest);

      expect(res.status).toBe(200);
      expect(res.body.sheets).toHaveLength(2);
      expect(res.body.aggregateSummary.validFiles).toBe(1);

      const validSheet = res.body.sheets.find((s) => s.fileName === 'valid_amazon.csv');
      const invalidSheet = res.body.sheets.find((s) => s.fileName === 'invalid_columns.csv');

      expect(validSheet.hasError).toBe(false);
      expect(validSheet.summary.newRecords).toBe(2);

      expect(invalidSheet.hasError).toBe(true);
      expect(invalidSheet.error).toContain('missing expected source column');
    });
  });

  describe('POST /api/confirm-batch', () => {
    it('should confirm all valid sheets in a batch and append to distinct tabs', async () => {
      // 1. Preview batch
      const manifest = JSON.stringify([
        { fileName: 'amazon.csv', marketplace: 'amazon', orderDate: '2026-10-14' },
        { fileName: 'flipkart.csv', marketplace: 'flipkart', orderDate: '2026-10-14' },
      ]);

      const previewRes = await request(app)
        .post('/api/preview-batch')
        .attach('files', Buffer.from(sampleAmazonCsv, 'utf8'), 'amazon.csv')
        .attach('files', Buffer.from(sampleFlipkartCsv, 'utf8'), 'flipkart.csv')
        .field('manifest', manifest);

      expect(previewRes.status).toBe(200);
      const batchToken = previewRes.body.batchToken;
      const [sheet1, sheet2] = previewRes.body.sheets;

      // 2. Confirm batch
      const confirmRes = await request(app)
        .post('/api/confirm-batch')
        .send({
          batchToken,
          sheetConfirmations: [
            { previewToken: sheet1.previewToken, includeDuplicates: false },
            { previewToken: sheet2.previewToken, includeDuplicates: false },
          ],
        });

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.success).toBe(true);
      expect(confirmRes.body.totalRecordsAdded).toBe(4);
      expect(confirmRes.body.sheets).toHaveLength(2);

      const amzResult = confirmRes.body.sheets.find((s) => s.marketplace === 'amazon');
      const fkResult = confirmRes.body.sheets.find((s) => s.marketplace === 'flipkart');

      expect(amzResult.recordsAdded).toBe(2);
      expect(amzResult.tabName).toBe(googleSheetsConfig.getTabName('amazon'));

      expect(fkResult.recordsAdded).toBe(2);
      expect(fkResult.tabName).toBe(googleSheetsConfig.getTabName('flipkart'));

      // 3. Verify deduplication now catches them if re-uploaded
      const rePreview = await request(app)
        .post('/api/preview-batch')
        .attach('files', Buffer.from(sampleAmazonCsv, 'utf8'), 'amazon.csv')
        .field('manifest', JSON.stringify([{ fileName: 'amazon.csv', marketplace: 'amazon', orderDate: '2026-10-14' }]));

      expect(rePreview.status).toBe(200);
      expect(rePreview.body.sheets[0].summary.newRecords).toBe(0);
      expect(rePreview.body.sheets[0].summary.alreadyExisting).toBe(2);
    });
  });
});
