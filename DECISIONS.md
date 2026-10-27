# Decision Log — Dispatch Sheet Automation Tool

**Purpose of this file:** every time a non-trivial decision is made while building this project — a library choice, a change from what the PRD specified, a workaround for an unexpected problem, a tradeoff — it gets logged here, in plain language, before moving on. This file is read by a non-specialist maintaining the project later, so write for that reader: explain *what* was decided and *why*, not just *what* was done.

**When to add an entry:** any time you (Antigravity) choose between two or more reasonable ways to do something, deviate from the PRD, or hit a problem the PRD didn't anticipate. You do not need an entry for routine, single-option work (e.g., "added a function to format a date" doesn't need an entry; "chose to store dates as strings instead of Date objects because X" does).

**Format for each entry:**

```
## [YYYY-MM-DD] Short title of the decision

**Context:** What situation or problem led to this decision?

**Decision:** What was decided/done?

**Alternatives considered:** What else could have been done, and why wasn't it chosen?

**Impact:** What does this mean for anyone maintaining or extending the project later?
```

---

<!-- Real entries start below this line -->

## [2026-09-23] In-memory preview token store with TTL instead of database persistence

**Context:** The preview flow requires holding parsed candidate rows in server memory between `/api/preview` and `/api/confirm` so the user can verify stats before appending to the live Google Sheet.

**Decision:** Used an in-memory JavaScript `Map` keyed by a UUID (`previewToken`) with a 30-minute expiration timestamp and periodic automatic sweep.

**Alternatives considered:** Setting up SQLite, Redis, or a local file cache. These introduce operational dependencies and state persistence for a single-laptop internal tool where uploads are reviewed and confirmed immediately by one user.

**Impact:** If the backend server process restarts between a user's preview and confirmation, the token will be lost and the user will receive a `410 Gone` error prompting them to re-upload. This is an acceptable tradeoff for keeping the tool lightweight and zero-dependency.

---

## [2026-09-23] Strict service isolation for Google Sheets API calls

**Context:** PRD Section 5.2 specified that Google Sheets reads and writes must be fully encapsulated in `dispatchSheetService.js`, and swapping storage should never affect validation, parsing, or deduplication services.

**Decision:** Encapsulated all `googleapis` calls and Google-specific error translations inside `dispatchSheetService.js`. `validationService.js` and `dedupService.js` work purely with plain JavaScript objects and Sets without knowledge of Google Sheets.

**Alternatives considered:** Putting Google Sheets reading logic directly inside the upload controller or dedup service.

**Impact:** If the storage backend ever changes (e.g., to PostgreSQL, MySQL, or an internal ERP REST API), only `dispatchSheetService.js` needs to be replaced. All parsing, validation, and deduplication logic remain untouched.

---

## [2026-09-23] Dual-mode Mock support for offline development and testing

**Context:** The tool requires Google Sheets API credentials, but developers, automated tests, or reviewers need to run unit tests and verify the UI without requiring an active Google Cloud project.

**Decision:** Built a mock fallback mode activated when `MOCK_GOOGLE_SHEETS=true` or `NODE_ENV=test`. In mock mode, the service uses an in-memory simulation of the 12-column Google Sheet.

**Alternatives considered:** Failing outright on startup if credentials don't exist. While the PRD specifies a startup warning/error if credentials can't authenticate, providing an explicit opt-in mock mode allows running `npm test` and sample verification anywhere without blocking.

**Impact:** Maintainers can run automated CI/CD and unit tests without needing access to production Google Cloud credentials.

---

## [2026-09-23] Case-insensitive normalized composite key for deduplication

**Context:** PRD specifies that duplicate checking uses `(Order ID + Marketplace)`. Different sources or manual entries might have slight whitespace or case differences (e.g., "Amazon" vs "amazon", or trailing whitespace in Order IDs).

**Decision:** Created helper `createCompositeKey(orderId, marketplace)` in `dedupService.js` which trims and lowercases both fields joined by `___`.

**Alternatives considered:** Exact case-sensitive string matching. Exact matching could cause duplicate rows to be appended if one source capitalized "COD" or "Amazon" differently.

**Impact:** Robust and reliable duplicate detection regardless of casing differences in marketplace exports or manual sheet edits.

---

## [2026-09-23] Real Google Sheet 12-column layout alignment

**Context:** The initial PRD draft assumed `Courier Tracking ID` was a single combined column at position 7, and assumed column 12 was `Marketplace`. When connecting to the team's actual Google Sheet, Row 1 headers were found to have separate `Courier` (Col 7) and `Tracking ID` (Col 8) columns, followed by `Status` (Col 9), `Amt` (Col 10), `Payment mode` (Col 11), and `Wrong Sku Sent` (Col 12). This 1-column difference caused a shift where `Total` landed in `Status`, `Payment mode` in `Amt`, and the marketplace name landed in `Wrong Sku Sent`.

**Decision:** Updated `uploadController.js` and `excelParserService.js` to map into the exact 12 columns of the Google Sheet: `[Order Date, SKU, Ordered Qty, Product Name, Brand, Order Id, Courier, Tracking ID, Status, Amt, Payment mode, Wrong Sku Sent]`. `Wrong Sku Sent` is intentionally inserted as empty `''`. Added fallback deduplication matching on `orderId` in addition to composite keys so deduplication works seamlessly without requiring an explicit marketplace column in the sheet.

**Alternatives considered:** Requiring the user to change their existing operational Google Sheet structure to match the assumed PRD layout. This was rejected because the tool must adapt to the team's existing production sheet, not the other way around.

**Impact:** Row appends write values into the exact matching sheet columns without shifting, and `Wrong Sku Sent` remains blank as intended.

---

## [2026-09-23] Transition from Order ID uniqueness to (Order ID + SKU) composite key

**Context:** Marketplace orders often contain multiple distinct line items / SKUs under the same Channel Order ID. When Order ID was enforced as a globally unique identifier, subsequent items from the same order were falsely flagged as in-file duplicates or rejected during live Google Sheet deduplication.

**Decision:** Updated the unique constraint and deduplication key to `(Order ID + SKU)`. Both in-file duplicate checks and live Google Sheet deduplication compare `orderId.toLowerCase() + '___' + sku.toLowerCase()`.

**Alternatives considered:**
1. Dropping deduplication entirely: rejected because re-uploading an export file would create unwanted duplicate row insertions in the live sheet.
2. Checking `(Order ID + SKU + Tracking ID)`: rejected because split shipments or unassigned tracking IDs at export time could cause duplicates.
3. Keeping single Order ID uniqueness: rejected because valid multi-item orders were being blocked.

**Impact:** Multi-item orders (same Order ID with different SKUs) now import all items cleanly, while true duplicate submissions of the exact same SKU for an order are still prevented.

---

## [2026-09-24] Multi-tab separation for different marketplaces configured via .env

**Context:** Originally, order records from all marketplaces (Amazon, Flipkart, Nykaa, Myntra) were appended to a single shared tab (`Dispatch Sheet`). The operations team requested separate sheet tabs for each marketplace, with tab names configurable directly via the `.env` file.

**Decision:**
1. Added environment variable support for marketplace-specific tab names in `.env`:
   - `GOOGLE_SHEET_TAB_NAME_AMAZON` (default: "Amazon")
   - `GOOGLE_SHEET_TAB_NAME_FLIPKART` (default: "Flipkart")
   - `GOOGLE_SHEET_TAB_NAME_NYKAA` (default: "Nykaa")
   - `GOOGLE_SHEET_TAB_NAME_MYNTRA` (default: "Myntra")
   - `GOOGLE_SHEET_TAB_NAME` (fallback: "Dispatch Sheet")
   Also supported flexible aliases like `TAB_NAME_<MP>` and `<MP>_TAB_NAME`.
2. Updated `googleSheetsConfig.getTabName(marketplace)` and `dispatchSheetService` to dynamically resolve the target tab per marketplace.
3. Isolated deduplication to the target marketplace's tab so an order in Amazon never falsely collides with a different order in Flipkart.
4. Added automatic tab initialization (`ensureTabExists`): if a designated tab doesn't exist yet in the spreadsheet, the tool automatically creates the tab and writes the canonical 12-column header row `A1:L1` on first write.
5. Surfaced destination tab visibility across the UI (marketplace selector badge, review confirm bar, and done screen).

**Alternatives considered:**
- Hardcoding tab names in code: rejected because sheet tab names may vary across teams or spreadsheets, and users need `.env` configuration.
- Single tab with marketplace filtering: rejected as the operations team specifically wanted dedicated tabs in Google Sheets.

**Impact:** Every marketplace now has its own isolated tab in the Google Spreadsheet, preventing clutter and cross-marketplace collisions, while maintaining full configurability via `.env`.

---

## [2026-09-24] Dedicated Flipkart tab column layout alignment and date format enforcement

**Context:** The Flipkart tab in the operations Google Spreadsheet uses a distinct 11-column structure: `[Dispatch Date, Order ID, Sku, Order Qty, Product Name, Brand, Shipment Tracker, Courier, MRP, Payment mode, SENT sku]`. Previously, row appends used a hardcoded 12-column Amazon layout, causing widespread column shifts (e.g., SKUs entering the Order ID column, Order ID entering Brand, Order Status entering MRP, and Amount entering Payment Mode). In addition, dates occasionally rendered as raw integer serial numbers (`46289`) due to unformatted number cells in Google Sheets, and courier names were missing because the source CSV column `Shipping Company` was unmapped.

**Decision:**
1. Created `formatRowForMarketplace` in `uploadController.js` to format appended rows into marketplace-specific column orders. For Flipkart, it outputs the exact 11 columns in sequence, leaves `SENT sku` blank for manual entry, and omits `Order Status`.
2. Updated `marketplaceMappings.js` for Flipkart to map `Shipping Company` -> `courier`, making it an optional source column in `excelParserService.js`.
3. Updated `dispatchSheetService.js` to dynamically detect `Order ID` and `SKU` column positions by inspecting the tab's Row 1 headers (`detectOrderSkuIndices`), ensuring deduplication works accurately across both 11-column Flipkart and 12-column Amazon tabs.
4. Added date number format enforcement (`repeatCell` with `DATE`, pattern `yyyy-mm-dd`) on Column A in `dispatchSheetService.js` so dates never display as raw serial numbers like `46289`.

**Alternatives considered:**
- Forcing all marketplace tabs to follow a single identical 12-column structure: rejected because the team's live Google Sheet already has established operational headers for Flipkart and other marketplaces.
- Hardcoding static indices for each marketplace: rejected in favor of header inspection with marketplace fallbacks so any future column reordering in the sheet does not break duplicate detection.

**Impact:** Flipkart CSV uploads now map directly and cleanly to the 11 columns of the Flipkart sheet tab, courier names are extracted from `Shipping Company`, and dates consistently render as `YYYY-MM-DD`.

---

## [2026-09-24] Nykaa and Myntra tab column alignment and Shipping Company courier mapping

**Context:** In the Nykaa and Myntra tabs in the operations Google Spreadsheet, `Tracking ID` is at Column 7 (Col G) and `Courier` is at Column 8 (Col H). Previously, Nykaa and Myntra were falling through to the default Amazon layout where Column 7 is `Courier` and Column 8 is `Tracking ID`. Furthermore, the courier was not mapped from the uploaded CSV column `Shipping Company`, causing `Tracking ID` to be pushed into the `Courier` column while `Tracking ID` remained empty.

**Decision:**
1. Updated `marketplaceMappings.js` for both Nykaa and Myntra to map `"Shipping Company": "courier"` (as well as `"Tracking ID": "courierTrackingId"` and `"Courier": "courier"`) and marked them as optional columns.
2. Implemented dedicated layout formatters in `formatRowForMarketplace` (`uploadController.js`) for Nykaa (13 columns) and Myntra (12 columns):
   - Nykaa: `[Dispatch Date, SKU Code, QTY, Dispatch Item, Brand, Order Id, Tracking ID, Courier, Status, MRP, Payment mode, Sent sku, Nykaa beauty]`
   - Myntra: `[Dispatch Date, SKU Code, QTY, Product Name, Brand, Order Id, Tracking ID, Courier, Status, MRP, COD, Sent sku]`
   - Column 7 reliably receives `Tracking ID` (`row.courierTrackingId`) and Column 8 receives `Courier` (`row.courier` extracted from `Shipping Company`).
   - `Sent sku` (and `Nykaa beauty`) remain empty `''` for manual warehouse entry.
3. Added `NYKAA_HEADERS` and `MYNTRA_HEADERS` to `ensureTabExists` in `dispatchSheetService.js` so newly created tabs automatically receive the matching operational headers.

**Alternatives considered:**
- Swapping the default fallback layout: rejected because the Amazon tab uses `Courier` (Col 7) before `Tracking ID` (Col 8). Marketplaces must be formatted according to their tab-specific column schemas.

**Impact:** Nykaa and Myntra uploads now correctly place the tracking ID into Column 7 (`Tracking ID`) and the courier partner from `Shipping Company` into Column 8 (`Courier`) without any column shifting or data overwrite.

---

## [2026-09-24] Guaranteed date formatting on Column A across all marketplace tabs

**Context:** Users noticed dates occasionally appearing as raw Excel/Google Sheets serial numbers (such as `46288` or `46289`) in the `Order Date` / `Dispatch Date` column (Column A) across various marketplace tabs. While the user selected a calendar date on the web form (e.g., `2026-09-24`), appending rows with Google Sheets `valueInputOption: 'USER_ENTERED'` caused Google Sheets to parse the date string into its internal serial integer format. If the destination cells or newly inserted rows lacked explicit date formatting, Google Sheets displayed the raw number rather than the formatted calendar date.

**Decision:**
1. Ran a one-time migration batch update across all existing tabs in the spreadsheet (`Dispatch Sheet`, `Amazon`, `Flipkart`, `Nykaa`, `Myntra`) setting `numberFormat: { type: 'DATE', pattern: 'yyyy-mm-dd' }` on Column A (Row 2 downwards), converting all existing serial values like `46289` directly into `YYYY-MM-DD`.
2. Enhanced `dispatchSheetService.js` to cache `sheetId` per tab name and introduced `applyDateFormatToColumnA`.
3. Configured `dispatchSheetService.appendRows` to automatically invoke `applyDateFormatToColumnA` immediately after every row append operation, guaranteeing that any newly inserted rows have explicit `DATE` formatting (`yyyy-mm-dd`) applied to Column A.

**Alternatives considered:**
- Sending dates as text literals with a leading single quote (`'2026-09-24`): while this prevents number conversion, native date formatting via Google Sheets `repeatCell` ensures values remain valid calendar dates for spreadsheet filtering, date queries, and sorting.

**Impact:** Every row appended across any marketplace tab now consistently displays the exact calendar date selected by the user on the web form in standard `YYYY-MM-DD` format, preventing raw serial numbers from appearing.

