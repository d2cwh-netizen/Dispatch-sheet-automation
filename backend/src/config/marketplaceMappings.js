/**
 * Marketplace Column Mappings
 * Maps marketplace-specific file column headers to canonical Dispatch Sheet fields:
 * - sku
 * - orderedQty
 * - productName
 * - brand
 * - orderId
 * - courierTrackingId
 * - status
 * - amount
 * - paymentMode
 */

const marketplaceMappings = {
  amazon: {
    displayName: "Amazon",
    columnMap: {
      "Product SKU Code": "sku",
      "Qty": "orderedQty",
      "Product Name": "productName",
      "Brand Name": "brand",
      "Channel Order ID": "orderId",
      "Shipment Tracker": "courierTrackingId",
      "Order Status": "status",
      "Total": "amount",
      "Order Type": "paymentMode",
    },
  },
  flipkart: {
    displayName: "Flipkart",
    columnMap: {
      "Product SKU Code": "sku",
      "Qty": "orderedQty",
      "Product Name": "productName",
      "Brand Name": "brand",
      "Channel Order ID": "orderId",
      "Shipment Tracker": "courierTrackingId",
      "Shipping Company": "courier",
      "Order Status": "status",
      "Total": "amount",
      "Order Type": "paymentMode",
    },
    optionalColumns: ["Shipping Company", "Order Status"],
  },
  nykaa: {
    displayName: "Nykaa",
    columnMap: {
      "Product SKU Code": "sku",
      "Qty": "orderedQty",
      "Product Name": "productName",
      "Brand Name": "brand",
      "Channel Order ID": "orderId",
      "Shipment Tracker": "courierTrackingId",
      "Tracking ID": "courierTrackingId",
      "Shipping Company": "courier",
      "Courier": "courier",
      "Order Status": "status",
      "Total": "amount",
      "Order Type": "paymentMode",
    },
    optionalColumns: ["Shipping Company", "Courier", "Tracking ID", "Shipment Tracker"],
  },
  myntra: {
    displayName: "Myntra",
    columnMap: {
      "Product SKU Code": "sku",
      "Qty": "orderedQty",
      "Product Name": "productName",
      "Brand Name": "brand",
      "Channel Order ID": "orderId",
      "Shipment Tracker": "courierTrackingId",
      "Tracking ID": "courierTrackingId",
      "Shipping Company": "courier",
      "Courier": "courier",
      "Order Status": "status",
      "Total": "amount",
      "Order Type": "paymentMode",
    },
    optionalColumns: ["Shipping Company", "Courier", "Tracking ID", "Shipment Tracker"],
  },
};

module.exports = marketplaceMappings;
