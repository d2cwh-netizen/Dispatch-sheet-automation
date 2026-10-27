const { validateRows } = require('../src/services/validationService');
const { deduplicateRows, createOrderSkuKey } = require('../src/services/dedupService');
const previewStoreService = require('../src/services/previewStoreService');

describe('Duplicate Records Detection & Force-Push Choice', () => {
  describe('validationService in-file duplicate capture', () => {
    it('should keep first occurrence in candidateRows and capture second occurrence in inFileDuplicates', () => {
      const rows = [
        { rowNumber: 2, orderId: 'AMZ-DUP-1', sku: 'SKU-1', orderedQty: 1, productName: 'Item A', amount: 100 },
        { rowNumber: 3, orderId: 'AMZ-DUP-1', sku: 'SKU-1', orderedQty: 2, productName: 'Item A (Second)', amount: 200 },
      ];

      const result = validateRows(rows);
      expect(result.candidateRows.length).toBe(1);
      expect(result.candidateRows[0].rowNumber).toBe(2);

      // problemRows retains existing structure
      expect(result.problemRows.length).toBe(1);
      expect(result.problemRows[0].rowNumber).toBe(3);
      expect(result.problemRows[0].reason).toContain('Duplicate Order ID and SKU within uploaded file');

      // inFileDuplicates captures full duplicate object for force-push
      expect(result.inFileDuplicates.length).toBe(1);
      const dup = result.inFileDuplicates[0];
      expect(dup.rowNumber).toBe(3);
      expect(dup.orderId).toBe('AMZ-DUP-1');
      expect(dup.sku).toBe('SKU-1');
      expect(dup.duplicateType).toBe('file_duplicate');
    });

    it('should NOT add truly invalid rows (missing orderId or negative qty) to inFileDuplicates', () => {
      const rows = [
        { rowNumber: 2, orderId: '', sku: 'SKU-1', orderedQty: 1 },
        { rowNumber: 3, orderId: 'AMZ-10', sku: 'SKU-1', orderedQty: -5 },
      ];

      const result = validateRows(rows);
      expect(result.problemRows.length).toBe(2);
      expect(result.inFileDuplicates.length).toBe(0);
    });
  });

  describe('dedupService sheet duplicate capture', () => {
    it('should capture sheet duplicates in duplicateRows array', () => {
      const existingKeysSet = new Set([
        createOrderSkuKey('ORD-EXISTING', 'SKU-A'),
      ]);

      const candidates = [
        { rowNumber: 2, orderId: 'ORD-NEW', sku: 'SKU-B', orderedQty: 1 },
        { rowNumber: 3, orderId: 'ORD-EXISTING', sku: 'SKU-A', orderedQty: 3 },
      ];

      const result = deduplicateRows(candidates, existingKeysSet, 'amazon');

      expect(result.newRecordsCount).toBe(1);
      expect(result.newRows[0].orderId).toBe('ORD-NEW');
      expect(result.alreadyExistingCount).toBe(1);

      expect(result.duplicateRows.length).toBe(1);
      const dup = result.duplicateRows[0];
      expect(dup.rowNumber).toBe(3);
      expect(dup.orderId).toBe('ORD-EXISTING');
      expect(dup.duplicateType).toBe('sheet_duplicate');
    });
  });

  describe('previewStoreService preview caching with duplicates', () => {
    it('should store and retrieve both newRows and duplicateRows', () => {
      const token = previewStoreService.savePreview({
        newRows: [{ orderId: 'O1', sku: 'S1' }],
        duplicateRows: [{ rowNumber: 5, orderId: 'O2', sku: 'S2' }],
        marketplace: 'amazon',
        orderDate: '2026-10-01',
        tabName: 'Amazon',
      });

      const retrieved = previewStoreService.getPreview(token);
      expect(retrieved.newRows.length).toBe(1);
      expect(retrieved.duplicateRows.length).toBe(1);
      expect(retrieved.duplicateRows[0].orderId).toBe('O2');

      const consumed = previewStoreService.consumePreview(token);
      expect(consumed).not.toBeNull();
      expect(previewStoreService.getPreview(token)).toBeNull();
    });
  });
});
