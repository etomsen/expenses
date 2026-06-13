// Browser-side database powered by PGLite (Postgres compiled to WASM).
// Mirrors the schema and queries from apps/server/src/db.mjs, but runs
// entirely in the browser and persists to IndexedDB ("idb://") so the app
// works fully offline. The database is created on first launch.
import { PGlite } from './assets/pglite/index.js';

// Category -> Supercategory list, taken from the "Category" sheet of the
// shared expenses spreadsheet. Seeded once on first launch and then preserved
// across launches (the inserts below are idempotent).
const DEFAULT_CATEGORIES = [
  { category: 'Медицина', supercategory: 'Жизнь' },
  { category: 'Для дома', supercategory: 'Жизнь' },
  { category: 'Телефон', supercategory: 'Жизнь' },
  { category: 'Кино и концерты', supercategory: 'Жизнь' },
  { category: 'Танцы', supercategory: 'Жизнь' },
  { category: 'Программы подписки', supercategory: 'Жизнь' },
  { category: 'Алкоголь', supercategory: 'Жизнь' },
  { category: 'Подарки', supercategory: 'Жизнь' },
  { category: 'Курсы, Обучение', supercategory: 'Жизнь' },
  { category: 'Выход в свет', supercategory: 'Жизнь' },
  { category: 'Спорт', supercategory: 'Жизнь' },
  { category: 'Продукты', supercategory: 'Еда' },
  { category: 'Кофе и рестораны', supercategory: 'Еда' },
  { category: 'Ворк фуд', supercategory: 'Еда' },
  { category: 'Ожежда и обувь', supercategory: 'Покупки' },
  { category: 'В дом', supercategory: 'Покупки' },
  { category: 'Спортовары', supercategory: 'Покупки' },
  { category: 'Гаджеты', supercategory: 'Покупки' },
  { category: 'Машина', supercategory: 'Транспорт' },
  { category: 'Машина ремонт', supercategory: 'Транспорт' },
  { category: 'Такси', supercategory: 'Транспорт' },
  { category: 'Общественный транспорт', supercategory: 'Транспорт' },
  { category: 'Ипотека', supercategory: 'Дом' },
  { category: 'Коммунальные платежи', supercategory: 'Дом' },
  { category: 'Налоги, документы', supercategory: 'Дом' },
  { category: 'Страховки', supercategory: 'Дом' },
  { category: 'Мебель', supercategory: 'Дом' },
  { category: 'Стройка', supercategory: 'Дом' },
  { category: 'Аренда', supercategory: 'Дом' },
  { category: 'Штраф', supercategory: 'Потери' },
  { category: 'Потерял', supercategory: 'Потери' },
  { category: 'Дети', supercategory: 'Обязанности' },
  { category: 'Питомцы', supercategory: 'Обязанности' },
  { category: 'Близкие', supercategory: 'Обязанности' },
  { category: 'Путешешествие', supercategory: 'Путешествия' },
  // Fallback bucket for CSV rows whose category can't be matched.
  { category: 'Непонятно', supercategory: 'Непонятно' },
];

// PGLite stores an "idb://<name>" database in an IndexedDB named "/pglite/<name>".
const DB_NAME = 'expenses';
const IDB_NAME = `/pglite/${DB_NAME}`;

async function createDb() {
  // Persisted in IndexedDB; survives reloads and works offline.
  const db = await PGlite.create(`idb://${DB_NAME}`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS category (
      category      TEXT PRIMARY KEY,
      supercategory TEXT NOT NULL,
      usage_count   INTEGER NOT NULL DEFAULT 0,
      UNIQUE (category, supercategory)
    );

    -- Migrate databases created before usage_count existed.
    ALTER TABLE category ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0;

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

  // Seed default categories ONLY on first launch — i.e. when the table is
  // still empty. If the DB already holds categories, leave it untouched.
  const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM category`);
  if (rows[0].n === 0) {
    for (const { category, supercategory } of DEFAULT_CATEGORIES) {
      await db.query(
        `INSERT INTO category (category, supercategory) VALUES ($1, $2)`,
        [category, supercategory]
      );
    }
  }

  return db;
}

// Single shared connection; `ready` resolves once the DB is initialised.
const dbPromise = createDb();
export const ready = dbPromise;

export async function listCategories() {
  const db = await dbPromise;
  const result = await db.query(
    // Most-used categories first; alphabetical as a stable tie-breaker.
    `SELECT category, supercategory FROM category ORDER BY usage_count DESC, category`
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
  // Saving the expense is the critical operation — do it on its own so it
  // always commits (and persists to IndexedDB).
  const result = await db.query(
    `INSERT INTO expenses (data, amount, currency, description, category, supercategory)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, data, amount, currency, description AS desc, category, supercategory, created_at`,
    [data, amount, currency, desc, category, supercategory]
  );

  // Bump the category usage counter as a best-effort, non-critical step. A
  // failure here (e.g. an old DB missing the column) must never lose the
  // expense that was already saved above.
  try {
    await db.query(
      `UPDATE category SET usage_count = usage_count + 1 WHERE category = $1`,
      [category]
    );
  } catch (e) {
    console.warn('Could not update category usage_count:', e);
  }

  return result.rows[0];
}

// Completely remove the database — closes the connection and deletes the
// whole IndexedDB store (data AND tables). After this the app must reload;
// on next launch createDb() rebuilds the schema and re-seeds from scratch.
export async function resetDatabase() {
  try {
    const db = await dbPromise;
    await db.close();
  } catch (e) {
    // If the DB never opened, there is nothing to close.
    console.warn('Could not close DB before reset:', e);
  }
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(IDB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

// Category name (lower-cased) aliases for matching imported CSV rows.
const CATEGORY_ALIASES = {
  // "кафе и рестораны" was renamed to "Кофе и рестораны".
  'кафе и рестораны': 'кофе и рестораны',
};

const FALLBACK_CATEGORY = { category: 'Непонятно', supercategory: 'Непонятно' };

// Minimal RFC-4180-ish CSV parser: handles quoted fields, embedded commas
// (e.g. the "Налоги, документы" category), escaped quotes and CRLF.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseAmount(raw) {
  let a = String(raw || '').replace(/\s/g, '');
  // "1,050.50" -> drop thousands commas; "23,6" -> decimal comma.
  a = a.includes('.') ? a.replace(/,/g, '') : a.replace(',', '.');
  return parseFloat(a);
}

// Import expenses from a CSV string. Columns: Date, Amount, Category, Desc
// (matched by header name when present, otherwise by position). Categories
// are matched case-insensitively against the DB; unmatched rows fall back to
// "Непонятно". Returns { total, imported, unmatched, skipped }.
export async function importCsv(text) {
  const db = await dbPromise;

  // Ensure the fallback category exists (older DBs were seeded without it).
  await db.query(
    `INSERT INTO category (category, supercategory) VALUES ($1, $2) ON CONFLICT (category) DO NOTHING`,
    [FALLBACK_CATEGORY.category, FALLBACK_CATEGORY.supercategory]
  );

  // Build a lookup of existing categories keyed by lower-cased name.
  const existing = (await db.query(`SELECT category, supercategory FROM category`)).rows;
  const byLower = new Map();
  for (const c of existing) byLower.set(c.category.toLowerCase(), c);

  const resolveCategory = (raw) => {
    let key = String(raw || '').trim().toLowerCase();
    if (CATEGORY_ALIASES[key]) key = CATEGORY_ALIASES[key];
    return byLower.get(key) || FALLBACK_CATEGORY;
  };

  const rows = parseCsv(text.replace(/^﻿/, ''));
  if (rows.length === 0) return { total: 0, imported: 0, unmatched: 0, skipped: 0 };

  // Detect a header row to map columns; otherwise assume positional order.
  // Accepts both "Date/Amount" and the spreadsheet's "When/How much" names.
  let start = 0;
  let idx = { date: 0, amount: 1, category: 2, desc: 3, currency: -1 };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const find = (...names) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i !== -1) return i;
    }
    return -1;
  };
  const looksLikeHeader =
    find('date', 'when') !== -1 || find('amount', 'how much') !== -1 || find('category') !== -1;
  if (looksLikeHeader) {
    start = 1;
    idx = {
      date: find('date', 'when'),
      amount: find('amount', 'how much'),
      category: find('category'),
      desc: find('desc', 'description'),
      currency: find('currency'),
    };
    if (idx.date === -1 || idx.amount === -1) {
      throw new Error(
        'CSV header must include a date (Date/When) and an amount (Amount/How much) column.'
      );
    }
  }

  let total = 0;
  let imported = 0;
  let unmatched = 0;
  let skipped = 0;
  const usageBump = new Map();

  for (let r = start; r < rows.length; r++) {
    const cols = rows[r];
    // Skip fully blank lines.
    if (cols.length === 1 && cols[0].trim() === '') continue;

    const dateRaw = (cols[idx.date] || '').trim();
    const amount = parseAmount(cols[idx.amount]);
    if (!dateRaw && Number.isNaN(amount)) continue;
    total++;

    if (!dateRaw || Number.isNaN(amount)) {
      skipped++;
      continue;
    }

    const resolved = resolveCategory(idx.category >= 0 ? cols[idx.category] : '');
    if (resolved === FALLBACK_CATEGORY) unmatched++;
    const desc = idx.desc >= 0 ? (cols[idx.desc] || '').trim() : '';
    const currency = idx.currency >= 0 && cols[idx.currency] ? cols[idx.currency].trim() : 'EUR';

    try {
      await db.query(
        `INSERT INTO expenses (data, amount, currency, description, category, supercategory)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [dateRaw, amount, currency, desc, resolved.category, resolved.supercategory]
      );
      imported++;
      usageBump.set(resolved.category, (usageBump.get(resolved.category) || 0) + 1);
    } catch (e) {
      console.warn('Skipped CSV row', r + 1, e);
      skipped++;
    }
  }

  // Best-effort: reflect imported rows in the usage counters.
  try {
    for (const [category, n] of usageBump) {
      await db.query(`UPDATE category SET usage_count = usage_count + $2 WHERE category = $1`, [category, n]);
    }
  } catch (e) {
    console.warn('Could not update usage counts after import:', e);
  }

  return { total, imported, unmatched, skipped };
}
