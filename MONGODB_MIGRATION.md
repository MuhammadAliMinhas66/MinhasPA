# SQL Server → MongoDB migration

This app now runs entirely on MongoDB via Mongoose. Nothing about the
database is set up by hand — every collection is created automatically by
the models in `models/` the first time a document is written to it.

## What changed

- `db/connection.js` — connects with Mongoose instead of `mssql`
- `models/` — 18 Mongoose schemas, one per collection (new)
- Every file in `routes/` and the investment-related files in `services/`
  — rewritten from raw SQL to Mongoose queries
- `package.json` — `mssql`/`msnodesqlv8` moved to devDependencies (used
  only by the one-time migration script below); `mongoose` added as the
  real runtime dependency
- `.env` / `.env.example` — `DB_SERVER`/`DB_DATABASE` replaced with
  `MONGODB_URI`; your old server/database were preserved as
  `OLD_DB_SERVER`/`OLD_DB_DATABASE` for the migration script
- IDs are now MongoDB ObjectId strings (e.g. `"507f1f77bcf86cd799439011"`)
  instead of integers. Every API response still returns `id` (not `_id`),
  so the frontend didn't need structural changes — the only two-line fix
  needed was three places in `public/js/` that wrapped an id in `Number(...)`
  before sending it back to the API (already fixed).

## How to move your existing data over

1. Install dependencies:
   ```
   npm install
   ```
2. Make sure MongoDB is running and reachable, and set `MONGODB_URI` in `.env`.
3. Your old SQL Server details were carried over into `.env` as
   `OLD_DB_SERVER` / `OLD_DB_DATABASE` — double check they're still correct.
4. Install the old SQL driver just for the migration (kept out of normal
   dependencies since the app itself no longer needs it):
   ```
   npm install --no-save mssql msnodesqlv8
   ```
5. Run the migration:
   ```
   npm run migrate
   ```
   This reads every table from your SQL Server database and writes it into
   MongoDB through the app's own models — users, loans, rent, expenses,
   categories, settings, budgets, bills (+ credentials + payments),
   investments (+ price history + market cache), salary plans/items,
   savings entries, and committees (+ payments), with every foreign key
   remapped from the old integer ids to the new ObjectIds.

   It's safe to run more than once — it clears each Mongo collection
   before copying, so re-running never duplicates data. It never writes
   to your SQL Server database.
6. Start the app: `npm start`

## Note on `mssql`/`msnodesqlv8`

These packages are still listed (as devDependencies) purely so
`scripts/migrate-mssql-to-mongo.js` can read your old database one last
time. Once the migration has run successfully and you've confirmed
everything looks right in MongoDB, you can safely:
- delete `scripts/migrate-mssql-to-mongo.js`
- remove `mssql`/`msnodesqlv8` from `package.json`
- remove `OLD_DB_SERVER`/`OLD_DB_DATABASE` from `.env`
- retire the old SQL Server database entirely

The `db/*.sql` files are kept only as a historical record of the old
schema (referenced by the migration script's comments) — they're no
longer used by the running app.
