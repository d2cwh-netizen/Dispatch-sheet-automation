# PRD — Dispatch Sheet Automation Tool (v1)

**Doc owner:** [Your Name]
**Status:** Draft — pending confirmation on 2 open items (see Section 3)
**Build target:** Antigravity (AI build agent)
**Stack (fixed, non-negotiable):** Node.js + Express (backend), React (frontend), Google Sheets API for storage — no separate database

---

## 1. Purpose

The Dispatch Sheet is updated manually every day from files received across four marketplaces — Amazon, Flipkart, Nykaa, and Myntra. Each file has a different column layout. Doing this by hand takes 1–2 hours a day and is error-prone (missed rows, duplicate entries, wrong pastes).

This tool replaces the manual copy-paste process with: **upload a file → app maps and checks it → user reviews a summary → user confirms → the actual Google Sheet is updated.**

v1 runs on one person's laptop, has no login, and talks to exactly one external service: the Google Sheets API, to read and write the real Dispatch Sheet the team already uses.

---

## 2. Goals and Non-Goals

### Goals (v1)
- Accept one marketplace file at a time (Amazon, Flipkart, Nykaa, or Myntra).
- Map that marketplace's columns to the fixed Dispatch Sheet column set (Section 4).
- Read the **live Google Sheet** to detect which rows already exist, and skip them.
- Let the user review a summary (new / duplicate / problem rows) **before** anything is written to the sheet.
- On confirmation, append only the new rows directly to the Google Sheet via the Sheets API.
- Keep the whole thing understandable by one non-specialist engineer maintaining it later — this matters more than cleverness.
- Frontend should look like a considered, clean internal tool — not a bare HTML form — while staying fast and simple to build and maintain.

### Explicit Non-Goals (v1)
- No local copy of the Dispatch Sheet kept as a fallback "database" — the Google Sheet itself is the single source of truth (see Section 5.1 for what this means for duplicate-checking).
- No user accounts, no login, no multi-user concurrency handling.
- No automatic fetching from marketplace portals (Phase 3 idea from the original proposal — still out of scope).
- No processing more than one marketplace file per request.
- No heavy frontend framework/component library (no MUI, no Ant Design) — see Section 6.1 for the styling approach that balances "looks good" with "stays simple."

---

## 3. Open Items Requiring Confirmation

Antigravity should build against the **assumed default** below for each, but the code should be structured so changing the assumption later is a small, localized change.

### 3.1 — Order Date input granularity
**Assumption:** The user enters **one date per upload**, applied to every row in that upload, via a single date picker on the upload screen.
*If every row instead needs its own date from a column not yet listed, the upload flow and mapping logic need to change — flag this before building.*

### 3.2 — "Wrong SKU Sent" field
**Assumption:** This is a **manual field, left blank by the app on every new row**, for the dispatch team to fill in later directly in the sheet after physical verification.
*If this should be calculated or sourced from another report, the mapping table and validation logic need to change — flag this before building.*

### 3.3 — NEW: Exact structure of the existing Google Sheet
**Assumption:** The target Google Sheet has a single tab (default assumed name: `"Dispatch Sheet"`) with the 12 columns from Section 4.1 as the header row, starting at cell `A1`, with data starting at row 2. **This must be confirmed against the real sheet before building** — if the real sheet has extra header rows, merged cells, multiple tabs, or a different column order, the read/write ranges in `dispatchSheetService.js` need to match exactly, or the app will read or write to the wrong cells.

---

## 4. Field Mapping

### 4.1 Dispatch Sheet columns (fixed output — same for every marketplace)

| # | Column | Type |
|---|---|---|
| 1 | Order Date | Date (user input, applies to whole upload — see 3.1) |
| 2 | SKU | Text |
| 3 | Ordered Qty | Number |
| 4 | Product Name | Text |
| 5 | Brand | Text |
| 6 | Order ID | Text — **unique key used for duplicate detection** |
| 7 | Courier Tracking ID | Text |
| 8 | Status | Text |
| 9 | Amount | Number |
| 10 | Payment Mode | Text |
| 11 | Wrong SKU Sent | Text — left blank on insert (see 3.2) |
| 12 | Marketplace | Text — added by the app, not from source file |

### 4.2 Source-to-Dispatch mapping (generic — applies once the marketplace's own column names are matched)

| Dispatch Sheet Column | Source Column (marketplace file) |
|---|---|
| SKU | Product SKU Code |
| Ordered Qty | Qty |
| Product Name | Product Name |
| Brand | Brand Name |
| Order ID | Channel Order ID |
| Courier Tracking ID | Shipment Tracker |
| Status | Order Status |
| Amount | Total |
| Payment Mode | Order Type |

> **Assumption still open:** the column *names* above are assumed consistent across all four marketplaces. In reality this is unlikely — get one real sample file per marketplace before building, and fill in `marketplaceMappings.js` (Section 6.3) per marketplace. This is designed so each marketplace's real headers only require a config change, not a code change.

### 4.3 Marketplace column
Added by the app from the dropdown the user selected on upload — not read from the file.

### 4.4 Duplicate detection key
A row is "already existing" if **(Order ID + Marketplace)** already exists in the Google Sheet.

---

## 5. Architecture Decisions (Antigravity must read this before building)

### 5.1 Google Sheets is the storage layer — no local file, no database
**Decision:** The app connects to the real Google Sheet via the **Google Sheets API v4**, using a **service account** (not OAuth user login, since this is a single-user backend tool with no interactive login flow). All reads (for duplicate-checking) and writes (appending new rows) go through this API, live, every time.

**What this requires, one-time setup (document in README, not code):**
1. Create a Google Cloud project (or reuse one).
2. Enable the **Google Sheets API** for that project.
3. Create a **service account**, download its JSON key file.
4. Share the actual Dispatch Sheet in Google Sheets with the service account's email address (found inside the JSON key file), giving it **Editor** access.
5. Store the JSON key file locally (outside version control) and reference its path via an environment variable.
6. Store the target spreadsheet's ID (from its URL) via an environment variable.

**Why a service account and not OAuth login:** OAuth would require a human to click "allow" through a browser flow and refresh tokens over time — unnecessary complexity for a backend-only, single-user tool that always acts as itself. A service account authenticates silently with no login screen.

**Impact of no local fallback file:** every preview and every confirm now depends on network access to Google's API and on the service account's permissions being correctly set up. See Section 8 for the specific new error cases this introduces (auth failures, quota limits, network errors) — these did not exist in the local-file version and must be handled explicitly, not left to crash the app.

### 5.2 Why the backend is still structured in layers
Even though storage changed, the layering decision from before still holds and matters more now, not less: swapping *how* `dispatchSheetService.js` talks to storage (local file → Google Sheets API) should be the **only** file that changed when this pivot happened. If Antigravity finds itself touching `dedupService.js` or `validationService.js` to make this work, that's a sign the boundary wasn't respected — those services should only ever work with plain row objects, never know or care where those rows came from or go to.

### 5.3 Frontend: decently good-looking, still simple
**Decision:** Use **Tailwind CSS** for styling (utility classes, no separate component library, no custom design system). This gets a clean, modern look — consistent spacing, decent typography, clear button/table styling — without adding a heavy dependency or a lot of custom CSS to maintain.

**Why not a component library (MUI, Ant Design, Chakra):** those bring a large bundle, an opinionated look that takes real effort to override, and more surface area to learn for a 3-4 screen internal tool. Tailwind gives visual quality without that overhead.

**What "functionally best, decently good-looking" means concretely for this build:**
- Clear visual hierarchy: the marketplace dropdown, date picker, and file input are grouped and obviously the primary action; the "Preview" button stands out.
- The summary screen makes the four counts (total / new / existing / problem) immediately scannable — e.g., as four simple stat cards, not a wall of text.
- Loading and error states are visually distinct (not just plain text appearing) — a simple spinner and a clearly colored error banner are enough; no animation beyond that is needed.
- No dark mode, no theming, no illustrations/icons beyond what's needed for clarity (e.g., a checkmark on the success screen is fine; decorative graphics are not needed).

---

## 6. Technical Design

### 6.1 Stack

| Layer | Choice | Notes |
|---|---|---|
| Backend runtime | Node.js (LTS) | |
| Backend framework | Express | |
| File upload handling | `multer` | in-memory storage, files are small and processed immediately |
| Excel read (uploaded marketplace files only) | `exceljs` | only used to parse the *incoming* marketplace file; the Dispatch Sheet itself is no longer a local Excel file |
| Google Sheets access | `googleapis` (official Google Node client) + a service account JSON key | handles both reading existing rows and appending new ones |
| Frontend | React (Vite) | |
| Frontend HTTP client | native `fetch` | |
| Styling | Tailwind CSS | see Section 5.3 for reasoning |
| Persistence | none — Google Sheets is the store | no local `data/` folder needed anymore |

### 6.2 Folder Structure

```
dispatch-sheet-app/
├── DECISIONS.md
├── README.md                      ← now includes the Google Cloud / service account setup steps (Section 5.1)
├── .env.example                   ← GOOGLE_SHEET_ID=..., GOOGLE_SERVICE_ACCOUNT_KEY_PATH=..., PORT=...
├── secrets/                       ← gitignored — service-account-key.json lives here, never committed
├── backend/
│   ├── package.json
│   ├── src/
│   │   ├── server.js               ← Express app entrypoint only
│   │   ├── config/
│   │   │   ├── marketplaceMappings.js    ← per-marketplace column mapping (Section 6.3)
│   │   │   └── googleSheetsConfig.js     ← reads env vars, builds the authenticated Sheets client once, exports it
│   │   ├── routes/
│   │   │   └── uploadRoutes.js
│   │   ├── controllers/
│   │   │   └── uploadController.js
│   │   ├── services/
│   │   │   ├── excelParserService.js
│   │   │   ├── validationService.js
│   │   │   ├── dedupService.js
│   │   │   └── dispatchSheetService.js   ← ALL Google Sheets reads/writes happen here, nowhere else
│   │   └── utils/
│   │       └── dateUtils.js
└── frontend/
    ├── package.json
    ├── tailwind.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── api/
        │   └── dispatchApi.js
        ├── components/
        │   ├── UploadForm.jsx
        │   ├── SummaryTable.jsx      ← stat-card layout per Section 5.3
        │   └── ConfirmBar.jsx
        └── styles/
            └── index.css             ← Tailwind directives only
```

**Rule for Antigravity:** business logic never appears in `routes/` or `controllers/`. Any `googleapis` calls belong only in `dispatchSheetService.js`. If a change to storage requires touching any other service file, that is itself a signal the boundary was violated somewhere — note it in `DECISIONS.md` and fix it.

### 6.3 Marketplace mapping config (unchanged in shape from before)

```js
// backend/src/config/marketplaceMappings.js
module.exports = {
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
  flipkart: { displayName: "Flipkart", columnMap: { /* real headers TBD */ } },
  nykaa:    { displayName: "Nykaa",    columnMap: { /* real headers TBD */ } },
  myntra:   { displayName: "Myntra",   columnMap: { /* real headers TBD */ } },
};
```

### 6.4 Google Sheets access pattern

`googleSheetsConfig.js` builds one authenticated client at startup, using the service account key and the `googleapis` library's JWT auth helper. `dispatchSheetService.js` uses that client for exactly two operations:

- **Read existing keys** (for dedup): `spreadsheets.values.get` on the range covering the Order ID and Marketplace columns (e.g., `Dispatch Sheet!F2:F` and `Dispatch Sheet!L2:L`, per the column layout in 4.1 — exact letters depend on confirming 3.3), loaded once per `/api/preview` call.
- **Append new rows** (on confirm): `spreadsheets.values.append` with the new rows, targeting the same tab, letting the Sheets API find the next empty row automatically rather than the app calculating a row number itself (safer — avoids race conditions if someone is editing the sheet at the same time).

### 6.5 API Contract

#### `POST /api/preview`
Does not write anything. Same request shape as before:

| Field | Type |
|---|---|
| `marketplace` | string: `amazon` \| `flipkart` \| `nykaa` \| `myntra` |
| `orderDate` | string `YYYY-MM-DD` |
| `file` | `.xlsx` file |

Response `200`:
```json
{
  "summary": {
    "totalRowsInFile": 1250,
    "newRecords": 1187,
    "alreadyExisting": 63,
    "problemRecords": 0
  },
  "problemRows": [
    { "rowNumber": 42, "reason": "Missing SKU" }
  ],
  "previewToken": "short-lived-id-referencing-parsed-rows-held-in-server-memory"
}
```

Response `400`: bad file / missing expected source column (same as before).
Response `502`: **new** — could not reach the Google Sheets API to check for duplicates (see Section 8).
Response `403`: **new** — service account doesn't have edit access to the sheet.

#### `POST /api/confirm`
Request: `{ "previewToken": "..." }`

Response `200`:
```json
{
  "recordsAdded": 1187,
  "dispatchSheetTotalRowsNow": 4381
}
```

Response `410`: token expired/already used.
Response `502`: **new** — the append call to Google Sheets failed partway (see Section 8 for how partial failure is handled).

### 6.6 Frontend Flow

Same 3-screen flow as before (`upload → summary → done`), no routing library. The visual treatment (Section 5.3) changes; the state machine does not.

---

## 7. Validation Rules

Unchanged from before — a row is a **problem row** if `Order ID` or `SKU` is blank, `Ordered Qty` isn't a positive number, or an entire required source column is missing (which fails the whole upload with a `400`). A row is **already existing** if `(Order ID, Marketplace)` is already found in the live Google Sheet. Everything else is a **new record**.

---

## 8. Error Handling

| Scenario | Behavior |
|---|---|
| Uploaded file isn't a valid `.xlsx` | `400`, clear message |
| Uploaded file is missing an expected source column | `400` naming the exact missing column |
| Duplicate Order ID within the same uploaded file | First occurrence kept as candidate; second marked as a problem row |
| **Service account can't authenticate** (bad/missing key file, wrong env var path) | `500` at startup ideally — the server should fail to start with a clear message, rather than fail silently on first request |
| **Service account lacks edit access to the sheet** | `403`, message: "The app's service account doesn't have edit access to this Google Sheet. Share the sheet with [service-account-email] as an Editor." |
| **Network/API error reaching Google Sheets** (timeout, Google outage) | `502`, message asking the user to check their connection and retry; nothing is written |
| **Google Sheets API rate limit hit** | Retry once after a short delay (a few seconds) using the standard exponential-backoff pattern; if it still fails, `502` with a "try again shortly" message |
| **Append partially succeeds** (rare, but the API could fail mid-write) | The Sheets API's `append` call is a single atomic request for the whole batch of new rows — it does not partially write. If it fails, nothing was written and the user sees the `502` and can safely retry via Confirm again using the same `previewToken` (if still valid) or by re-uploading |
| User confirms with an expired/missing `previewToken` | `410`, frontend prompts to re-upload |

---

## 9. Non-Functional Requirements

- **Performance:** must comfortably handle upload files up to ~10,000 rows. Reading the full existing Order ID/Marketplace column range from the Google Sheet on every preview is fine up to tens of thousands of existing rows; if the sheet grows much larger, revisit whether the dedup-key read should be cached between preview and confirm rather than re-read.
- **Network dependency (new):** unlike the local-file version, this tool **requires internet access** to function at all, since every preview and confirm calls the Google Sheets API. This should be stated plainly in the README so it's not a surprise.
- **Credentials handling:** the service account JSON key must never be committed to version control. `.gitignore` must exclude the `secrets/` folder from day one.
- **Single user, single machine:** no need to handle concurrent uploads from two users at once; the Sheets API's own atomicity on append (Section 8) makes this safe enough even if it happens.
- **Code must run with a single command** for both backend and frontend, documented in `README.md`, including the one-time Google Cloud setup steps from Section 5.1.

---

## 10. Explicitly Deferred (do not build now)

- Automatic fetching of files from marketplace portals
- Supporting more than one file/marketplace per upload
- User accounts / permissions
- Extending this pattern to MIS or other recurring sheet-maintenance tasks

---

## 11. Acceptance Criteria

- [ ] Can select a marketplace, pick a date, upload a sample `.xlsx`, and see an accurate preview summary without anything being written to the Google Sheet yet.
- [ ] Clicking "Confirm & Update" appends only the genuinely new rows directly into the real Google Sheet, visible immediately on refreshing it in the browser.
- [ ] Re-uploading the same file a second time reports 0 new records.
- [ ] A file missing a required column is rejected with a clear, specific error.
- [ ] Revoking the service account's access to the sheet (as a test) produces the `403` error message from Section 8, not a crash.
- [ ] Disconnecting the network during a preview produces the `502` error message from Section 8, not a crash or a silent hang.
- [ ] Backend folder structure matches Section 6.2 exactly, with all Google Sheets calls isolated to `dispatchSheetService.js`.
- [ ] Frontend looks visually clean and organized (per Section 5.3) without any component library dependency.
- [ ] `DECISIONS.md` contains an entry for every non-trivial choice made during the build.
