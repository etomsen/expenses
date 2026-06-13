// Browser-side database powered by PGLite (Postgres compiled to WASM).
// Mirrors the schema and queries from apps/server/src/db.mjs, but runs
// entirely in the browser and persists to IndexedDB ("idb://") so the app
// works fully offline. The database is created on first launch.
import { PGlite } from './assets/pglite/index.js';

const DEFAULT_CATEGORIES = [
  { category: 'Groceries', supercategory: 'Food' },
  { category: 'Restaurants', supercategory: 'Food' },
  { category: 'Fuel', supercategory: 'Transport' },
  { category: 'Public Transport', supercategory: 'Transport' },
  { category: 'Rent', supercategory: 'Housing' },
  { category: 'Utilities', supercategory: 'Housing' },
  { category: 'Entertainment', supercategory: 'Leisure' },
];

async function createDb() {
  // Persisted in IndexedDB; survives reloads and works offline.
  const db = await PGlite.create('idb://expenses');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS category (
      category      TEXT PRIMARY KEY,
      supercategory TEXT NOT NULL,
      UNIQUE (category, supercategory)
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id            SERIAL PRIMARY KEY,
      data          DATE           NOT NULL,
      amount        NUMERIC(12, 2) NOT NULL,
      currency      TEXT           NOT NULL,
      description   TEXT           NOT NULL DEFAULT '',
      category      TEXT           NOT NULL,
      supercategory TEXT           NOT NULL,
      created_at    TIMESTAMPTZ    NOT NULL DEFAULT now(),
      FOREIGN KEY (category, supercategory)
        REFERENCES category (category, supercategory)
    );

    CREATE INDEX IF NOT EXISTS idx_expenses_data ON expenses (data);
  `);

  // Seed default categories on first launch (idempotent).
  for (const { category, supercategory } of DEFAULT_CATEGORIES) {
    await db.query(
      `INSERT INTO category (category, supercategory)
       VALUES ($1, $2)
       ON CONFLICT (category) DO NOTHING`,
      [category, supercategory]
    );
  }

  return db;
}

// Single shared connection; `ready` resolves once the DB is initialised.
const dbPromise = createDb();
export const ready = dbPromise;

export async function listCategories() {
  const db = await dbPromise;
  const result = await db.query(
    `SELECT category, supercategory FROM category ORDER BY supercategory, category`
  );
  return result.rows;
}

export async function listExpenses() {
  const db = await dbPromise;
  const result = await db.query(
    `SELECT id, data, amount, currency, description AS desc, category, supercategory
     FROM expenses
     ORDER BY data DESC, id DESC`
  );
  return result.rows;
}

export async function insertExpense({ data, amount, currency, desc, category, supercategory }) {
  const db = await dbPromise;
  const result = await db.query(
    `INSERT INTO expenses (data, amount, currency, description, category, supercategory)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, data, amount, currency, description AS desc, category, supercategory, created_at`,
    [data, amount, currency, desc, category, supercategory]
  );
  return result.rows[0];
}
