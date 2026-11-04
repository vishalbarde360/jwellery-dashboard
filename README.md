# Aviraj Jewellery POS (MERN + Tailwind)

## Run

**MongoDB must be a replica set.** The spec says a sale is saved "all or nothing", which needs MongoDB transactions.
Easiest: a free MongoDB Atlas cluster (put its URI in `server/.env`). Locally:

```bash
mongod --replSet rs0 --dbpath ./data      # one terminal
mongosh --eval "rs.initiate()"            # once
```

```bash
npm run install:all
# MongoDB must be running (or edit server/.env MONGO_URI)
npm run seed          # demo shop + one login per role: <role>/<role>123
npm run dev:server    # http://localhost:5000
npm run dev:client    # http://localhost:5173
```

Second shop for the isolation test: `rival / rival1234`.

## Key ideas (from the spec)

- **Tenant**: one retailer. `server/src/config/mongooseSetup.js` scopes every query to the signed-in user's tenant.
- **Product** (a type) vs **Item** (one physical piece with a barcode).
- **Stock movements and audit entries are permanent** (add only).
- **Idempotency**: `POST /api/invoices` needs header `Idempotency-Key`. Repeating it returns the first bill.
- **Pricing** is only ever done on the server (`utils/pricing.js`, `utils/invoiceCalc.js`). Wastage changes price, never weight.

## Bill API

```
POST /api/invoices        Idempotency-Key: <unique code>
{ "barcodes": ["WN0001"], "discount": 0,
  "customer": {"name":"", "phone":""},
  "payments": [{"mode":"cash","amount":44558}] }
```

## The four flows (PDF page 06)

- **Sell**: `POST /api/invoices/preview` shows price, `POST /api/invoices` saves invoice + payments + stock status + movements in ONE transaction. Same `Idempotency-Key` returns the same bill. Two counters cannot sell the same piece.
- **Add stock**: `POST /api/purchases` (draft, adds no stock) then `POST /api/purchases/:id/confirm` (pieces enter stock together).
- **Return**: `POST /api/returns` (request) then `/:id/approve`. Piece becomes "returned, under check". `POST /api/items/:barcode/inspect` makes it Available again.
- **Statuses**: available, sold, returned_check, repair, reserved, in_transit, damaged, lost. Only `available` can be sold.

## Requirements page (07) notes

- **Business setup**: Owner only (`Shop name, GSTIN, logo, time zone, prefixes, limits`). Each bill keeps a frozen copy of the shop details.
- **Pricing**: exact decimals (decimal.js). Methods: `weight`, `gross_weight`, `fixed`. A manager can change a piece's price on a bill with a reason; it is logged with the original price.
- **Daily rates**: `Daily rates` screen (owner, manager). Old bills never change.
- **Customers**: name, phone, optional email, purchase history. **Invoices**: search, A4/thermal print, reprint (marked DUPLICATE COPY and logged).
- **Inventory**: movement history per piece, corrections need a second person, stock valuation, and a reconcile check (every piece's status must equal its last movement).
- **Reports**: sales, stock, tax (CSV for owner and accountant). Returns are not netted off the tax report until credit notes (P1).
- **Security**: helmet headers, HTTPS required in production, login rate limit, refuses a default JWT secret in production.
- **Backups**: `npm run backup` (backs up AND restore-tests), `npm run restore:test`, `npm run restore -- <file> <new-db-name>`. Set `BACKUP_ENABLED=true` for a daily 02:00 run.
- Production: set `NODE_ENV=production`, a strong `JWT_SECRET`, and put the app behind HTTPS.

## Pages 08 and 09

**Pricing (page 08).** The worked example (10 g x ₹7,000, making 10%, wastage 2%, stones ₹5,000, GST 3%) gives exactly ₹85,902 in `utils/pricing.js`, and the same numbers render in `PriceBreakup`. One fixed rounding rule: every part is rounded half-up to 2 decimals, then each bill line is rounded to the whole rupee (setting `roundTo`). Each bill saves the rate and the charges used (`lines[].ratePerGram`, `lines[].charges`, `gstPercent`), so later changes never alter it. GST % is a setting.

**Architecture (page 09), where we differ.** The PDF recommends React + TypeScript, Node (NestJS or Express) and PostgreSQL. This project follows the MERN request: React (JavaScript), Express, MongoDB.
| PDF says | Here |
|---|---|
| One modular backend, no microservices | Yes: one Express app, one folder per area (`routes/`, `utils/`, `models/`) |
| All business rules on the server | Yes: price, discount, return and stock rules are only on the server |
| Real transactions, no double-selling | MongoDB transactions (needs a replica set) + atomic status claim |
| Sale saved in one transaction with an idempotency key | Yes (`middleware/idempotent.js`) |
| Backups with tested restores | Yes (`npm run backup` restore-tests itself) |
| PostgreSQL, TypeScript | Not used. Say if you want either; the business rules are in plain functions, so a move is mostly mechanical |
| UPI/card providers, scanner, label printer, bill printer, cash drawer | Not built. Scanners work as a keyboard. Labels and bills print from the browser. No payment-provider or cash-drawer integration yet |

## Tests (sections 13 and 15)

    cd server
    npm run test:unit   # GST split maths, no database needed
    npm test            # unit + 49 acceptance checks (needs MongoDB replica set; uses throw-away *test* databases)
    npm run test:perf   # load + timings; PERF_ITEMS / PERF_INVOICES set the dataset

## GST (section 12)

- Business GSTIN is validated; its first 2 digits become the shop's state code.
- Same-state sale = CGST + SGST (halves that add up exactly to the GST). Another state (send `placeOfSupply`, a 2-digit state code, or fill "Place of supply" in Billing) = IGST. The total never changes, only the split.
- Tax report (JSON and CSV) has CGST / SGST / IGST columns and shows credit notes as negative rows.
- Changes to GST settings are written to the audit log (`settings.change`).
- A qualified Indian tax professional must verify all of this before launch. Do not claim full compliance until then.

## Risk controls (section 16)

| Risk                      | What the code does                                                                                                                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wrong price               | One pricing engine (`utils/pricing.js`) with unit tests. Rate changes are audited (`rate.set`, old and new rate); a move bigger than `maxRateChangePercent` (default 10%) must be confirmed.              |
| Same piece sold twice     | Atomic claim of each piece inside one transaction; tested 12 rounds with concurrent sales.                                                                                                                |
| Wrong stock               | Immutable stock movements, two-person adjustments, reconciliation report, and **stock counts**: `POST /api/inventory/counts` with scanned tags lists missing and unexpected pieces. It never edits stock. |
| Tax errors                | GST is a setting; CGST/SGST/IGST split; credit-note rows in the tax report; tax settings audited. A tax professional must verify.                                                                         |
| Data loss                 | Automated backups with a tested restore.                                                                                                                                                                  |
| Misuse of money features  | Permissions on the server, approvals, audit log.                                                                                                                                                          |
| Misleading profit reports | `GET /api/reports/margin` shows revenue (no GST), metal value, making etc., cost and margin as separate columns. Needs `cost.read`.                                                                       |
| Offline conflicts         | Offline billing is NOT in version 1 (decision below).                                                                                                                                                     |
| Hardware does not work    | Test real devices early; see section 11 of the spec.                                                                                                                                                      |

## Decisions for the pilot (section 17)

| Decision                   | Status in this code                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Offline billing in v1      | No. Nothing offline is built.                                                                                                                                      |
| Hosting                    | Cloud hosted (Node + MongoDB replica set, HTTPS enforced in production).                                                                                           |
| Scanner and printer models | Open. Choose and test samples.                                                                                                                                     |
| Payment providers          | Payments are only recorded as cash / UPI / card / bank. No provider is integrated yet.                                                                             |
| Credit, advances, old gold | Deferred. Not built.                                                                                                                                               |
| Tax and accounting rules   | Open. Confirm with a tax professional.                                                                                                                             |
| Stock valuation            | A setting: `purchase_cost` (default) or `weighted_average` (cost per gram over all pieces of that metal and purity). It changes the **cost** in the margin report. |
| Branches and cashiers      | One pilot shop. The model already supports more.                                                                                                                   |
