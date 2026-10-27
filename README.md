# Dispatch Sheet Automation Tool

An automated internal tool for dispatch operations that ingests daily order export spreadsheets from **Amazon**, **Flipkart**, **Nykaa**, and **Myntra**, validates records, deduplicates against existing records in a live **Google Sheet**, and appends only genuine new orders via the Google Sheets API v4.

---

## Architecture & Features

- **Direct Google Sheets Integration**: The Google Sheet is the single source of truth (no local fallback database).
- **Service Account Authentication**: Silently authenticates via Google Cloud Service Account without requiring user browser login.
- **3-Step Safe Workflow**:
  1. **Upload & Configure**: Select marketplace, pick dispatch date, upload `.xlsx` or `.csv`.
  2. **Review Summary**: Scannable stat cards (Total Rows, New Records, Already Existing, Problem Records) + detailed issue list.
  3. **Atomic Confirm**: Appends new rows in a single batch directly into the Google Sheet.
- **Strict In-File and Sheet Deduplication**: Prevents duplicate entries using composite `(Order ID + SKU)` matching on both in-file records and the live Google Sheet.

---

## 1. Quick Start

### Prerequisites
- **Node.js**: v18.0.0 or higher (tested on Node v22 LTS)
- **npm**: v9 or higher

### Installation
Run the setup command from the project root to install dependencies for root, backend, and frontend:

```bash
npm run setup
```

### Running Locally
To start both backend (port 5000) and frontend (port 5173) concurrently:

```bash
npm run dev
```

Then open your browser at:
`http://localhost:5173`

---

## 2. One-Time Google Cloud Setup

Follow these steps to connect the tool to your live Google Sheet:

### Step 1: Create a Google Cloud Project & Enable Sheets API
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g., `Dispatch-Sheet-Automation`) or select an existing one.
3. In the sidebar, navigate to **APIs & Services** > **Library**.
4. Search for **Google Sheets API** and click **Enable**.

### Step 2: Create a Service Account
1. In the sidebar, go to **APIs & Services** > **Credentials**.
2. Click **Create Credentials** at the top and select **Service Account**.
3. Enter a name (e.g., `dispatch-sheet-bot`) and click **Create and Continue**.
4. (Optional) Skip the role assignments and click **Done**.

### Step 3: Generate and Download the JSON Key
1. In the **Credentials** page, find the newly created service account under **Service Accounts** and click on it.
2. Go to the **Keys** tab.
3. Click **Add Key** > **Create new key**.
4. Choose **JSON** and click **Create**.
5. Save the downloaded JSON file to the project's `secrets/` directory:
   ```
   secrets/service-account-key.json
   ```
   *(Note: The `secrets/` directory is gitignored and will never be committed to git).*

### Step 4: Share Your Google Sheet with the Service Account
1. Open your downloaded JSON key file and copy the `client_email` address (e.g. `dispatch-sheet-bot@your-project.iam.gserviceaccount.com`).
2. Open your live Dispatch Sheet in Google Sheets.
3. Click the green **Share** button in the top right.
4. Paste the service account email and grant it **Editor** access.
5. Uncheck "Notify people" and click **Share**.

### Step 5: Configure Environment Variables
Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` and fill in your values:

```env
PORT=5000
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./secrets/service-account-key.json
GOOGLE_SHEET_ID=1abcXYZ...your_actual_google_sheet_id_here

# Default fallback tab name
GOOGLE_SHEET_TAB_NAME=Dispatch Sheet

# Marketplace-specific tab names in Google Sheets
GOOGLE_SHEET_TAB_NAME_AMAZON=Amazon
GOOGLE_SHEET_TAB_NAME_FLIPKART=Flipkart
GOOGLE_SHEET_TAB_NAME_NYKAA=Nykaa
GOOGLE_SHEET_TAB_NAME_MYNTRA=Myntra
```

> **Marketplace Tab Configuration:**
> - Each marketplace export is routed directly to its designated tab in your spreadsheet.
> - Configure tab names using `GOOGLE_SHEET_TAB_NAME_<MARKETPLACE>=<TabName>` in `.env`.
> - If a destination tab does not exist in the Google Sheet yet, the service account will automatically create the tab with standard 12-column dispatch headers upon first write.

> **Where to find the Google Sheet ID?**
> In your browser address bar when viewing the sheet:
> `https://docs.google.com/spreadsheets/d/`**`<GOOGLE_SHEET_ID>`**`/edit`

---

## 3. Testing Without Google Cloud (Mock Mode)

If you want to test the UI, file parsing, in-file duplicate detection, and problem row validation before setting up Google Cloud credentials:

1. In your `.env` file, set:
   ```env
   MOCK_GOOGLE_SHEETS=true
   ```
2. Generate sample test files:
   ```bash
   npm run generate-samples
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Upload any of the sample files generated in `sample-files/` to test valid files, duplicate handling, and problem row detection!

---

## 4. Google Sheet Structure

By default, the tool expects the target sheet tab name to be **"Dispatch Sheet"** (configurable via `GOOGLE_SHEET_TAB_NAME`).

The tool maps to the following 12 columns (Row 1 Header, starting at A1):

| # | Column Name | Source | Description |
|---|---|---|---|
| 1 | Order Date | Date input | Uniform date selected on upload screen (YYYY-MM-DD) |
| 2 | SKU | Uploaded file | Product SKU Code |
| 3 | Ordered Qty | Uploaded file | Quantity (> 0) |
| 4 | Product Name | Uploaded file | Product name |
| 5 | Brand | Uploaded file | Brand name |
| 6 | Order ID | Uploaded file | Channel Order ID (composite unique key with SKU for dedup) |
| 7 | Courier Tracking ID | Uploaded file | Shipment Tracker code |
| 8 | Status | Uploaded file | Order status |
| 9 | Amount | Uploaded file | Total amount |
| 10 | Payment Mode | Uploaded file | Order payment type (Prepaid/COD) |
| 11 | Wrong SKU Sent | Blank | Left empty on insert for warehouse floor verification |
| 12 | Marketplace | App | Selected marketplace (e.g. Amazon, Flipkart, Nykaa, Myntra) |

---

## 5. Adding or Editing Marketplace Mappings

Marketplace column mappings are configured in:
`backend/src/config/marketplaceMappings.js`

If a marketplace changes its export header names, simply update the `columnMap` object for that marketplace without touching any business logic.

---

## 6. Error Codes Reference

| Code | Scenario | Resolution |
|---|---|---|
| **400** | Invalid `.xlsx`/`.csv` or missing expected column | Ensure the uploaded file contains all mapped source columns. |
| **403** | Service account lacks edit access | Share the Google Sheet with the service account email as **Editor**. |
| **410** | Preview session expired | Re-upload the file to generate a fresh preview token. |
| **500** | Configuration error | Verify `.env` path and service account JSON key file. |
| **502** | Google API error / network offline | Check internet connection and retry. |

---

## 7. Running Tests

Run the backend unit test suite:

```bash
npm test
```
