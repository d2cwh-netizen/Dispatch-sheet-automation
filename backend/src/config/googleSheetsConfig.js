const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const dotenv = require('dotenv');

// Load environment variables: backend/.env first, then root .env with override so edits to root .env take precedence
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env'), override: true });

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

let sheetsClient = null;
let serviceAccountEmail = null;
let isConfigured = false;
let configError = null;

/**
 * Extracts a Google Spreadsheet ID if the user provided a full URL.
 * e.g., https://docs.google.com/spreadsheets/d/1QE_ePE3MxguuF8b27hGs4SgoxMdTcrnnmTTZV10q2QU/edit -> 1QE_ePE3MxguuF8b27hGs4SgoxMdTcrnnmTTZV10q2QU
 */
function extractSpreadsheetId(idOrUrl) {
  if (!idOrUrl) return '';
  const match = idOrUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : idOrUrl.trim();
}

const rawSpreadsheetId = process.env.GOOGLE_SHEET_ID || '';
const spreadsheetId = extractSpreadsheetId(rawSpreadsheetId);
const keyPathEnv = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || './secrets/service-account-key.json';
const isMock = process.env.MOCK_GOOGLE_SHEETS === 'true' || process.env.NODE_ENV === 'test';

/**
 * Resolves the Google Sheets tab name for a specific marketplace.
 * Checks environment variables in order:
 * 1. GOOGLE_SHEET_TAB_NAME_<MARKETPLACE> (e.g., GOOGLE_SHEET_TAB_NAME_AMAZON)
 * 2. TAB_NAME_<MARKETPLACE> (e.g., TAB_NAME_AMAZON)
 * 3. <MARKETPLACE>_TAB_NAME (e.g., AMAZON_TAB_NAME)
 * 4. Marketplace display name from marketplaceMappings (e.g., "Amazon", "Flipkart")
 * 5. Default GOOGLE_SHEET_TAB_NAME or 'Dispatch Sheet'
 */
function getTabName(marketplace) {
  if (marketplace) {
    const key = String(marketplace).toUpperCase().trim();
    const envTabName =
      process.env[`GOOGLE_SHEET_TAB_NAME_${key}`] ||
      process.env[`TAB_NAME_${key}`] ||
      process.env[`${key}_TAB_NAME`];

    if (envTabName && envTabName.trim()) {
      return envTabName.trim();
    }

    try {
      const marketplaceMappings = require('./marketplaceMappings');
      const lowerKey = String(marketplace).toLowerCase().trim();
      if (marketplaceMappings[lowerKey]?.displayName) {
        return marketplaceMappings[lowerKey].displayName;
      }
    } catch (_) {}

    return marketplace.charAt(0).toUpperCase() + marketplace.slice(1);
  }

  return process.env.GOOGLE_SHEET_TAB_NAME || 'Dispatch Sheet';
}

/**
 * Returns a map of all resolved tab names for known marketplaces.
 */
function getAllTabNames() {
  let marketplaces = ['amazon', 'flipkart', 'nykaa', 'myntra'];
  try {
    const marketplaceMappings = require('./marketplaceMappings');
    marketplaces = Object.keys(marketplaceMappings);
  } catch (_) {}

  const result = {
    default: process.env.GOOGLE_SHEET_TAB_NAME || 'Dispatch Sheet',
    marketplaces: {},
  };

  for (const m of marketplaces) {
    result.marketplaces[m] = getTabName(m);
  }

  return result;
}

function initGoogleSheets() {
  if (isMock) {
    console.log('[GoogleSheetsConfig] Running in MOCK / TEST mode. Google Sheets API will be simulated.');
    isConfigured = true;
    serviceAccountEmail = 'mock-service-account@example.iam.gserviceaccount.com';
    return;
  }

  let parsedKey = null;
  let resolvedKeyPath = null;
  let keySourceDesc = '';

  // 1. Check if raw JSON credentials provided via environment variable (ideal for Render / cloud deployments)
  const rawKeyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;
  const rawKeyBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64;

  if (rawKeyJson && rawKeyJson.trim()) {
    try {
      parsedKey = JSON.parse(rawKeyJson.trim());
      keySourceDesc = 'GOOGLE_SERVICE_ACCOUNT_KEY_JSON environment variable';
    } catch (e) {
      configError = `Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY_JSON as JSON: ${e.message}`;
      console.warn(`[GoogleSheetsConfig] WARNING: ${configError}`);
      return;
    }
  } else if (rawKeyBase64 && rawKeyBase64.trim()) {
    try {
      const decoded = Buffer.from(rawKeyBase64.trim(), 'base64').toString('utf8');
      parsedKey = JSON.parse(decoded);
      keySourceDesc = 'GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 environment variable';
    } catch (e) {
      configError = `Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 as JSON: ${e.message}`;
      console.warn(`[GoogleSheetsConfig] WARNING: ${configError}`);
      return;
    }
  } else {
    // 2. Resolve service account key path from disk, checking common locations and Render secret files
    const candidatePaths = [
      path.isAbsolute(keyPathEnv) ? keyPathEnv : path.resolve(process.cwd(), keyPathEnv),
      path.resolve(__dirname, '../../', keyPathEnv),
      path.resolve(__dirname, '../../secrets/service-account-key.json'),
      path.resolve(process.cwd(), 'secrets/service-account-key.json'),
      path.resolve(process.cwd(), '../backend/secrets/service-account-key.json'),
      '/etc/secrets/service-account-key.json',
      '/etc/secrets/google-service-account-key.json',
    ];

    resolvedKeyPath = candidatePaths.find((p) => fs.existsSync(p));

    if (!resolvedKeyPath) {
      configError = `Service account credentials not found. Provide GOOGLE_SERVICE_ACCOUNT_KEY_JSON in environment or place key file in secrets/. Checked paths: ${candidatePaths.slice(0, 5).join(', ')}`;
      console.warn(`[GoogleSheetsConfig] WARNING: ${configError}`);
      return;
    }

    try {
      const rawKey = fs.readFileSync(resolvedKeyPath, 'utf8');
      parsedKey = JSON.parse(rawKey);
      keySourceDesc = `key file at "${resolvedKeyPath}"`;
    } catch (err) {
      configError = `Failed to read or parse key file at "${resolvedKeyPath}": ${err.message}`;
      console.error(`[GoogleSheetsConfig] ERROR: ${configError}`);
      return;
    }
  }

  try {
    serviceAccountEmail = parsedKey.client_email;

    if (!serviceAccountEmail || !parsedKey.private_key) {
      configError = `Service account credentials from ${keySourceDesc} are missing required fields (client_email or private_key).`;
      console.warn(`[GoogleSheetsConfig] WARNING: ${configError}`);
      return;
    }

    // Fix escaped newlines if private_key was passed in an environment variable
    if (typeof parsedKey.private_key === 'string' && parsedKey.private_key.includes('\\n')) {
      parsedKey.private_key = parsedKey.private_key.replace(/\\n/g, '\n');
    }

    const authOptions = { scopes: SCOPES };
    if (resolvedKeyPath) {
      authOptions.keyFile = resolvedKeyPath;
    } else {
      authOptions.credentials = parsedKey;
    }

    const auth = new google.auth.GoogleAuth(authOptions);

    sheetsClient = google.sheets({ version: 'v4', auth });
    isConfigured = true;
    console.log(`[GoogleSheetsConfig] Authenticated successfully with service account: ${serviceAccountEmail} (${keySourceDesc})`);
    console.log(`[GoogleSheetsConfig] Target Sheet ID: ${spreadsheetId}`);
    console.log(`[GoogleSheetsConfig] Default Tab Name: ${getTabName()}`);
    const tabMap = getAllTabNames();
    for (const [m, t] of Object.entries(tabMap.marketplaces)) {
      console.log(`[GoogleSheetsConfig] Tab for [${m}]: "${t}"`);
    }
  } catch (err) {
    configError = `Failed to initialize Google Sheets client from ${keySourceDesc}: ${err.message}`;
    console.error(`[GoogleSheetsConfig] ERROR: ${configError}`);
  }
}

initGoogleSheets();

module.exports = {
  getSheetsClient: () => sheetsClient,
  getSpreadsheetId: () => spreadsheetId,
  getTabName: (marketplace) => getTabName(marketplace),
  getAllTabNames,
  getServiceAccountEmail: () => serviceAccountEmail,
  isConfigured: () => isConfigured,
  getConfigError: () => configError,
  isMock: () => isMock,
  initGoogleSheets,
};
