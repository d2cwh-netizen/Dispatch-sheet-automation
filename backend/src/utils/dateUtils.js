/**
 * Date utilities for validating and formatting dispatch order dates.
 */

function isValidDateString(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  // Match YYYY-MM-DD format
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;

  const date = new Date(dateStr);
  const timestamp = date.getTime();
  if (typeof timestamp !== 'number' || Number.isNaN(timestamp)) return false;

  return date.toISOString().startsWith(dateStr);
}

function formatDateForSheet(dateStr) {
  if (!isValidDateString(dateStr)) {
    throw new Error(`Invalid date format "${dateStr}". Expected YYYY-MM-DD.`);
  }
  return dateStr;
}

module.exports = {
  isValidDateString,
  formatDateForSheet,
};
