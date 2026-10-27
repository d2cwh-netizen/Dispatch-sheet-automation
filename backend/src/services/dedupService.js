/**
 * Deduplication Service
 * Compares candidate rows against existing keys (Order ID + SKU) from the Google Sheet.
 * This service operates solely on plain row objects and an existing key Set.
 */

function createOrderSkuKey(orderId, sku) {
  const cleanOrderId = String(orderId || '').replace(/`/g, '').trim().toLowerCase();
  const cleanSku = String(sku || '').replace(/`/g, '').trim().toLowerCase();
  return `${cleanOrderId}___${cleanSku}`;
}

// Retain createCompositeKey for backwards compatibility
const createCompositeKey = createOrderSkuKey;

function deduplicateRows(candidateRows, existingKeysSet, marketplace) {
  const newRows = [];
  const duplicateRows = [];
  let alreadyExistingCount = 0;

  for (const row of candidateRows) {
    const key = createOrderSkuKey(row.orderId, row.sku);
    if (existingKeysSet && existingKeysSet.has(key)) {
      alreadyExistingCount++;
      duplicateRows.push({
        ...row,
        duplicateType: 'sheet_duplicate',
        reason: 'Order ID and SKU already exist in destination Google Sheet',
      });
    } else {
      newRows.push(row);
    }
  }

  return {
    newRows,
    duplicateRows,
    newRecordsCount: newRows.length,
    alreadyExistingCount,
  };
}

module.exports = {
  createOrderSkuKey,
  createCompositeKey,
  deduplicateRows,
};
