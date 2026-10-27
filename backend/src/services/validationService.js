/**
 * Validation Service
 * Validates parsed rows based on Dispatch Sheet requirements:
 * - Order ID must not be blank
 * - SKU must not be blank
 * - Ordered Qty must be a positive number (> 0)
 * - In-file duplicate (Order ID + SKU): first occurrence kept as candidate; second+ marked as problem row
 */

function validateRows(rows) {
  const candidateRows = [];
  const problemRows = [];
  const inFileDuplicates = [];
  const seenOrderSkuKeys = new Set();

  for (const row of rows) {
    const reasons = [];

    const orderIdStr = row.orderId ? String(row.orderId).replace(/`/g, '').trim() : '';
    const skuStr = row.sku ? String(row.sku).replace(/`/g, '').trim() : '';

    if (!orderIdStr) {
      reasons.push('Missing Order ID');
    }

    if (!skuStr) {
      reasons.push('Missing SKU');
    }

    const qty = Number(typeof row.orderedQty === 'string' ? row.orderedQty.replace(/`/g, '').trim() : row.orderedQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      reasons.push('Ordered Qty must be a positive number');
    }

    // Check for in-file duplicate (Order ID + SKU)
    let isOnlyInFileDuplicate = false;
    if (orderIdStr && skuStr) {
      const orderSkuKey = `${orderIdStr.toLowerCase()}___${skuStr.toLowerCase()}`;
      if (seenOrderSkuKeys.has(orderSkuKey)) {
        if (reasons.length === 0) {
          isOnlyInFileDuplicate = true;
        }
        reasons.push(`Duplicate Order ID and SKU within uploaded file: "${orderIdStr}" (${skuStr})`);
      } else {
        seenOrderSkuKeys.add(orderSkuKey);
      }
    }

    if (reasons.length > 0) {
      problemRows.push({
        rowNumber: row.rowNumber,
        orderId: orderIdStr || 'N/A',
        sku: skuStr || 'N/A',
        reason: reasons.join('; '),
      });

      if (isOnlyInFileDuplicate) {
        inFileDuplicates.push({
          ...row,
          orderId: orderIdStr,
          sku: skuStr,
          orderedQty: qty,
          duplicateType: 'file_duplicate',
          reason: `Duplicate Order ID and SKU within uploaded file: "${orderIdStr}" (${skuStr})`,
        });
      }
    } else {
      candidateRows.push({
        ...row,
        orderId: orderIdStr,
        sku: skuStr,
        orderedQty: qty,
      });
    }
  }

  return {
    candidateRows,
    problemRows,
    problemRecordsCount: problemRows.length,
    inFileDuplicates,
  };
}

module.exports = {
  validateRows,
};
