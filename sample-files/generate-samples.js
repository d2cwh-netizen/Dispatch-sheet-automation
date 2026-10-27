const fs = require('fs');
const path = require('path');
let ExcelJS;
try {
  ExcelJS = require('exceljs');
} catch {
  ExcelJS = require('../backend/node_modules/exceljs');
}

const outputDir = __dirname;
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function createAmazonValid() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Orders');

  ws.columns = [
    { header: 'Product SKU Code', key: 'sku', width: 15 },
    { header: 'Qty', key: 'qty', width: 10 },
    { header: 'Product Name', key: 'name', width: 30 },
    { header: 'Brand Name', key: 'brand', width: 15 },
    { header: 'Channel Order ID', key: 'orderId', width: 25 },
    { header: 'Shipment Tracker', key: 'tracking', width: 20 },
    { header: 'Order Status', key: 'status', width: 15 },
    { header: 'Total', key: 'total', width: 12 },
    { header: 'Order Type', key: 'payment', width: 12 },
  ];

  ws.addRow({
    sku: 'SKU-AMZ-101',
    qty: 2,
    name: 'Wireless Bluetooth Earbuds Pro',
    brand: 'AudioTech',
    orderId: 'AMZ-ORD-9001',
    tracking: 'TRK-BLUEDART-001',
    status: 'Shipped',
    total: 2499.00,
    payment: 'Prepaid',
  });

  ws.addRow({
    sku: 'SKU-AMZ-102',
    qty: 1,
    name: 'USB-C Fast Charging Cable 2M',
    brand: 'VoltGear',
    orderId: 'AMZ-ORD-9002',
    tracking: 'TRK-DELHIVERY-002',
    status: 'Shipped',
    total: 399.00,
    payment: 'COD',
  });

  ws.addRow({
    sku: 'SKU-AMZ-103',
    qty: 3,
    name: 'Ergonomic Mouse Pad with Wrist Rest',
    brand: 'ErgoComfort',
    orderId: 'AMZ-ORD-9003',
    tracking: 'TRK-EKART-003',
    status: 'Ready to Dispatch',
    total: 897.00,
    payment: 'Prepaid',
  });

  ws.addRow({
    sku: 'SKU-AMZ-104',
    qty: 1,
    name: 'Stainless Steel Insulated Water Bottle',
    brand: 'HydroLife',
    orderId: 'AMZ-ORD-9004',
    tracking: 'TRK-XPRESS-004',
    status: 'Shipped',
    total: 749.00,
    payment: 'Prepaid',
  });

  const filePath = path.join(outputDir, 'sample_amazon_valid.xlsx');
  await wb.xlsx.writeFile(filePath);
  console.log(`Created: ${filePath}`);
}

async function createAmazonWithDuplicates() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Orders');

  ws.columns = [
    { header: 'Product SKU Code', key: 'sku', width: 15 },
    { header: 'Qty', key: 'qty', width: 10 },
    { header: 'Product Name', key: 'name', width: 30 },
    { header: 'Brand Name', key: 'brand', width: 15 },
    { header: 'Channel Order ID', key: 'orderId', width: 25 },
    { header: 'Shipment Tracker', key: 'tracking', width: 20 },
    { header: 'Order Status', key: 'status', width: 15 },
    { header: 'Total', key: 'total', width: 12 },
    { header: 'Order Type', key: 'payment', width: 12 },
  ];

  // First occurrence (valid candidate)
  ws.addRow({
    sku: 'SKU-AMZ-201',
    qty: 1,
    name: 'Smart Fitness Band v4',
    brand: 'FitPulse',
    orderId: 'AMZ-ORD-DUP-001',
    tracking: 'TRK-BLUEDART-101',
    status: 'Shipped',
    total: 1899.00,
    payment: 'Prepaid',
  });

  // Second occurrence with SAME order ID in file (should be flagged as problem row)
  ws.addRow({
    sku: 'SKU-AMZ-201',
    qty: 1,
    name: 'Smart Fitness Band v4 (Duplicate entry)',
    brand: 'FitPulse',
    orderId: 'AMZ-ORD-DUP-001',
    tracking: 'TRK-BLUEDART-101',
    status: 'Shipped',
    total: 1899.00,
    payment: 'Prepaid',
  });

  ws.addRow({
    sku: 'SKU-AMZ-202',
    qty: 2,
    name: 'Noise Cancelling Headphones',
    brand: 'AudioTech',
    orderId: 'AMZ-ORD-DUP-002',
    tracking: 'TRK-BLUEDART-102',
    status: 'Shipped',
    total: 4599.00,
    payment: 'Prepaid',
  });

  const filePath = path.join(outputDir, 'sample_amazon_with_duplicates.xlsx');
  await wb.xlsx.writeFile(filePath);
  console.log(`Created: ${filePath}`);
}

async function createAmazonWithProblemRows() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Orders');

  ws.columns = [
    { header: 'Product SKU Code', key: 'sku', width: 15 },
    { header: 'Qty', key: 'qty', width: 10 },
    { header: 'Product Name', key: 'name', width: 30 },
    { header: 'Brand Name', key: 'brand', width: 15 },
    { header: 'Channel Order ID', key: 'orderId', width: 25 },
    { header: 'Shipment Tracker', key: 'tracking', width: 20 },
    { header: 'Order Status', key: 'status', width: 15 },
    { header: 'Total', key: 'total', width: 12 },
    { header: 'Order Type', key: 'payment', width: 12 },
  ];

  // Valid row
  ws.addRow({
    sku: 'SKU-AMZ-301',
    qty: 1,
    name: 'Mechanical Gaming Keyboard',
    brand: 'VoltGear',
    orderId: 'AMZ-ORD-PROB-001',
    tracking: 'TRK-DELHIVERY-201',
    status: 'Shipped',
    total: 3200.00,
    payment: 'Prepaid',
  });

  // Problem row: Missing SKU
  ws.addRow({
    sku: '',
    qty: 1,
    name: 'Item With Missing SKU',
    brand: 'VoltGear',
    orderId: 'AMZ-ORD-PROB-002',
    tracking: 'TRK-DELHIVERY-202',
    status: 'Shipped',
    total: 500.00,
    payment: 'COD',
  });

  // Problem row: Missing Order ID
  ws.addRow({
    sku: 'SKU-AMZ-303',
    qty: 2,
    name: 'Item With Missing Order ID',
    brand: 'AudioTech',
    orderId: '',
    tracking: 'TRK-DELHIVERY-203',
    status: 'Shipped',
    total: 1200.00,
    payment: 'Prepaid',
  });

  // Problem row: Ordered Qty is 0
  ws.addRow({
    sku: 'SKU-AMZ-304',
    qty: 0,
    name: 'Item With Zero Quantity',
    brand: 'ErgoComfort',
    orderId: 'AMZ-ORD-PROB-004',
    tracking: 'TRK-DELHIVERY-204',
    status: 'Shipped',
    total: 0.00,
    payment: 'Prepaid',
  });

  const filePath = path.join(outputDir, 'sample_amazon_with_problems.xlsx');
  await wb.xlsx.writeFile(filePath);
  console.log(`Created: ${filePath}`);
}

async function createAmazonMissingColumn() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Orders');

  // Missing 'Product SKU Code'
  ws.columns = [
    { header: 'Qty', key: 'qty', width: 10 },
    { header: 'Product Name', key: 'name', width: 30 },
    { header: 'Brand Name', key: 'brand', width: 15 },
    { header: 'Channel Order ID', key: 'orderId', width: 25 },
    { header: 'Shipment Tracker', key: 'tracking', width: 20 },
    { header: 'Order Status', key: 'status', width: 15 },
    { header: 'Total', key: 'total', width: 12 },
    { header: 'Order Type', key: 'payment', width: 12 },
  ];

  ws.addRow({
    qty: 1,
    name: 'Sample Item',
    brand: 'BrandX',
    orderId: 'ORD-999',
    tracking: 'TRK-001',
    status: 'Shipped',
    total: 500.00,
    payment: 'Prepaid',
  });

  const filePath = path.join(outputDir, 'sample_amazon_missing_column.xlsx');
  await wb.xlsx.writeFile(filePath);
  console.log(`Created: ${filePath}`);
}

async function createAmazonValidCsv() {
  const csvContent = [
    'Product SKU Code,Qty,Product Name,Brand Name,Channel Order ID,Shipment Tracker,Order Status,Total,Order Type',
    'SKU-AMZ-201,1,"Mechanical Keyboard RGB",KeyCraft,AMZ-ORD-9021,TRK-EKART-021,Shipped,3499.00,Prepaid',
    'SKU-AMZ-202,2,"Ultra-Wide Gaming Pad",GlideMaster,AMZ-ORD-9022,TRK-DELHIVERY-022,Shipped,899.00,COD',
    'SKU-AMZ-203,1,"Noise Cancelling Headphones",AcoustiX,AMZ-ORD-9023,TRK-BLUEDART-023,Shipped,5999.00,Prepaid',
  ].join('\n');

  const filePath = path.join(outputDir, 'sample_amazon_valid.csv');
  fs.writeFileSync(filePath, csvContent, 'utf8');
  console.log(`Created: ${filePath}`);
}

async function generateAll() {
  console.log('Generating sample marketplace Excel & CSV files...');
  await createAmazonValid();
  await createAmazonWithDuplicates();
  await createAmazonWithProblemRows();
  await createAmazonMissingColumn();
  await createAmazonValidCsv();
  console.log('All sample files generated successfully in sample-files/');
}

if (require.main === module) {
  generateAll().catch(console.error);
}

module.exports = { generateAll };
