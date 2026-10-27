process.env.NODE_ENV = 'test';
process.env.MOCK_GOOGLE_SHEETS = 'true';

const request = require('supertest');
const path = require('path');
const app = require('../src/server');
const dispatchSheetService = require('../src/services/dispatchSheetService');

const sampleFilesDir = path.resolve(__dirname, '../../sample-files');

jest.setTimeout(15000);

describe('Dispatch Sheet Automation - End-to-End API Integration', () => {
  beforeEach(() => {
    dispatchSheetService.resetMockState();
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.googleSheets.isMock).toBe(true);
    });
  });

  describe('POST /api/preview', () => {
    it('should reject requests without a file', async () => {
      const res = await request(app)
        .post('/api/preview')
        .field('marketplace', 'amazon')
        .field('orderDate', '2026-09-23');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Please upload an Excel (.xlsx) or CSV (.csv) file');
    });

    it('should reject unsupported file types', async () => {
      const res = await request(app)
        .post('/api/preview')
        .attach('file', Buffer.from('hello world', 'utf8'), 'notes.txt')
        .field('marketplace', 'amazon')
        .field('orderDate', '2026-09-23');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('must be a valid .xlsx or .csv spreadsheet');
    });

    it('should reject invalid date format', async () => {
      const validFilePath = path.join(sampleFilesDir, 'sample_amazon_valid.xlsx');
      const res = await request(app)
        .post('/api/preview')
        .attach('file', validFilePath)
        .field('marketplace', 'amazon')
        .field('orderDate', 'invalid-date');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid Order Date');
    });

    it('should return 400 when file is missing an expected source column', async () => {
      const missingColFilePath = path.join(sampleFilesDir, 'sample_amazon_missing_column.xlsx');
      const res = await request(app)
        .post('/api/preview')
        .attach('file', missingColFilePath)
        .field('marketplace', 'amazon')
        .field('orderDate', '2026-09-23');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('missing expected source column(s): "Product SKU Code"');
    });

    it('should parse valid Amazon file and return summary with previewToken', async () => {
      const validFilePath = path.join(sampleFilesDir, 'sample_amazon_valid.xlsx');
      const res = await request(app)
        .post('/api/preview')
        .attach('file', validFilePath)
        .field('marketplace', 'amazon')
        .field('orderDate', '2026-09-23');

      expect(res.status).toBe(200);
      expect(res.body.summary.totalRowsInFile).toBe(4);
      expect(res.body.summary.newRecords).toBe(4);
      expect(res.body.summary.alreadyExisting).toBe(0);
      expect(res.body.summary.problemRecords).toBe(0);
      expect(res.body.previewToken).toBeDefined();
    });

    it('should parse valid Amazon CSV file and return summary with previewToken', async () => {
      const csvData = [
        'Product SKU Code,Qty,Product Name,Brand Name,Channel Order ID,Shipment Tracker,Order Status,Total,Order Type',
        'SKU-CSV-1,2,"Wireless Charger",BrandA,ORD-CSV-1,TRK-1,Shipped,599,Prepaid',
        'SKU-CSV-2,1,"Phone Case",BrandB,ORD-CSV-2,TRK-2,Shipped,299,COD',
      ].join('\n');

      const res = await request(app)
        .post('/api/preview')
        .attach('file', Buffer.from(csvData, 'utf8'), 'amazon_orders.csv')
        .field('marketplace', 'amazon')
        .field('orderDate', '2026-09-23');

      expect(res.status).toBe(200);
      expect(res.body.summary.totalRowsInFile).toBe(2);
      expect(res.body.summary.newRecords).toBe(2);
      expect(res.body.summary.alreadyExisting).toBe(0);
      expect(res.body.summary.problemRecords).toBe(0);
      expect(res.body.previewToken).toBeDefined();
    });

    it('should flag in-file duplicates as problem records when both Order ID and SKU match', async () => {
      const dupFilePath = path.join(sampleFilesDir, 'sample_amazon_with_duplicates.xlsx');
      const res = await request(app)
        .post('/api/preview')
        .attach('file', dupFilePath)
        .field('marketplace', 'amazon')
        .field('orderDate', '2026-09-23');

      expect(res.status).toBe(200);
      expect(res.body.summary.totalRowsInFile).toBe(3);
      expect(res.body.summary.newRecords).toBe(2); // First duplicate kept + 1 other
      expect(res.body.summary.problemRecords).toBe(1); // Second duplicate flagged
      expect(res.body.problemRows[0].reason).toContain('Duplicate Order ID and SKU within uploaded file');
    });

    it('should accept multi-item orders with the same Order ID but different SKUs', async () => {
      const csvData = [
        'Product SKU Code,Qty,Product Name,Brand Name,Channel Order ID,Shipment Tracker,Order Status,Total,Order Type',
        'SKU-ITEM-1,1,"Item 1",BrandA,ORD-SHARED-1,TRK-1,Shipped,500,Prepaid',
        'SKU-ITEM-2,2,"Item 2",BrandA,ORD-SHARED-1,TRK-1,Shipped,800,Prepaid',
      ].join('\n');

      const res = await request(app)
        .post('/api/preview')
        .attach('file', Buffer.from(csvData, 'utf8'), 'multi_item_order.csv')
        .field('marketplace', 'amazon')
        .field('orderDate', '2026-09-23');

      expect(res.status).toBe(200);
      expect(res.body.summary.totalRowsInFile).toBe(2);
      expect(res.body.summary.newRecords).toBe(2);
      expect(res.body.summary.problemRecords).toBe(0);
    });

    it('should flag invalid data rows as problem records', async () => {
      const probFilePath = path.join(sampleFilesDir, 'sample_amazon_with_problems.xlsx');
      const res = await request(app)
        .post('/api/preview')
        .attach('file', probFilePath)
        .field('marketplace', 'amazon')
        .field('orderDate', '2026-09-23');

      expect(res.status).toBe(200);
      expect(res.body.summary.totalRowsInFile).toBe(4);
      expect(res.body.summary.newRecords).toBe(1);
      expect(res.body.summary.problemRecords).toBe(3);
      expect(res.body.problemRows.length).toBe(3);
    });
  });

  describe('Full Preview -> Confirm -> Re-upload Deduplication Flow', () => {
    it('should append records on confirm and detect them as already existing on subsequent upload', async () => {
      const validFilePath = path.join(sampleFilesDir, 'sample_amazon_valid.xlsx');

      // 1. Initial Preview
      const previewRes = await request(app)
        .post('/api/preview')
        .attach('file', validFilePath)
        .field('marketplace', 'amazon')
        .field('orderDate', '2026-09-23');

      expect(previewRes.status).toBe(200);
      const token = previewRes.body.previewToken;
      expect(token).toBeDefined();

      // 2. Confirm
      const confirmRes = await request(app)
        .post('/api/confirm')
        .send({ previewToken: token });

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.recordsAdded).toBe(4);
      expect(confirmRes.body.dispatchSheetTotalRowsNow).toBe(4);

      // 3. Confirm again with same token -> 410 Gone (single use token)
      const reuseRes = await request(app)
        .post('/api/confirm')
        .send({ previewToken: token });

      expect(reuseRes.status).toBe(410);

      // 4. Re-upload same file -> should detect all 4 rows as alreadyExisting!
      const reuploadRes = await request(app)
        .post('/api/preview')
        .attach('file', validFilePath)
        .field('marketplace', 'amazon')
        .field('orderDate', '2026-09-23');

      expect(reuploadRes.status).toBe(200);
      expect(reuploadRes.body.summary.totalRowsInFile).toBe(4);
      expect(reuploadRes.body.summary.newRecords).toBe(0); // 0 new records
      expect(reuploadRes.body.summary.alreadyExisting).toBe(4); // All 4 already exist!
    });

    it('should route different marketplaces to their respective tabs without cross-tab duplicate collisions', async () => {
      const csvAmazon = [
        'Product SKU Code,Qty,Product Name,Brand Name,Channel Order ID,Shipment Tracker,Order Status,Total,Order Type',
        'SHARED-SKU-1,1,"Item A",BrandA,SHARED-ORD-1,TRK-A,Shipped,500,Prepaid',
      ].join('\n');

      const csvFlipkart = [
        'Product SKU Code,Qty,Product Name,Brand Name,Channel Order ID,Shipment Tracker,Order Status,Total,Order Type',
        'SHARED-SKU-1,1,"Item A",BrandA,SHARED-ORD-1,TRK-F,Shipped,500,Prepaid',
      ].join('\n');

      // 1. Upload Amazon file with SHARED-ORD-1 + SHARED-SKU-1
      const amzPreview = await request(app)
        .post('/api/preview')
        .attach('file', Buffer.from(csvAmazon, 'utf8'), 'amz.csv')
        .field('marketplace', 'amazon')
        .field('orderDate', '2026-09-24');

      expect(amzPreview.status).toBe(200);
      expect(amzPreview.body.summary.newRecords).toBe(1);
      expect(amzPreview.body.targetTabName).toBeDefined();

      const amzConfirm = await request(app)
        .post('/api/confirm')
        .send({ previewToken: amzPreview.body.previewToken });

      expect(amzConfirm.status).toBe(200);
      expect(amzConfirm.body.recordsAdded).toBe(1);

      // 2. Upload Flipkart file with identical Order ID and SKU
      // Because it goes to Flipkart's separate tab, it must NOT be marked as alreadyExisting!
      const fkPreview = await request(app)
        .post('/api/preview')
        .attach('file', Buffer.from(csvFlipkart, 'utf8'), 'fk.csv')
        .field('marketplace', 'flipkart')
        .field('orderDate', '2026-09-24');

      expect(fkPreview.status).toBe(200);
      expect(fkPreview.body.summary.newRecords).toBe(1);
      expect(fkPreview.body.summary.alreadyExisting).toBe(0);

      const fkConfirm = await request(app)
        .post('/api/confirm')
        .send({ previewToken: fkPreview.body.previewToken });

      expect(fkConfirm.status).toBe(200);
      expect(fkConfirm.body.recordsAdded).toBe(1);

      // 3. Re-upload Amazon -> detects existing in Amazon tab
      const amzReupload = await request(app)
        .post('/api/preview')
        .attach('file', Buffer.from(csvAmazon, 'utf8'), 'amz.csv')
        .field('marketplace', 'amazon')
        .field('orderDate', '2026-09-24');

      expect(amzReupload.body.summary.newRecords).toBe(0);
      expect(amzReupload.body.summary.alreadyExisting).toBe(1);

      // 4. Re-upload Flipkart -> detects existing in Flipkart tab
      const fkReupload = await request(app)
        .post('/api/preview')
        .attach('file', Buffer.from(csvFlipkart, 'utf8'), 'fk.csv')
        .field('marketplace', 'flipkart')
        .field('orderDate', '2026-09-24');

      expect(fkReupload.body.summary.newRecords).toBe(0);
      expect(fkReupload.body.summary.alreadyExisting).toBe(1);
    });
  });
});
