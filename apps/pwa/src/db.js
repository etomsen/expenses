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
    CREATE INDEX IF NOT EXISTS idx_expenses_supercategory ON expenses (supercategory);
    CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses (category);

    CREATE TABLE IF NOT EXISTS budget (
      id            SERIAL PRIMARY KEY,
      name          TEXT           NOT NULL,
      category      TEXT,
      supercategory TEXT           NOT NULL,
      budget        NUMERIC(12, 2) NOT NULL,
      date_from     DATE           NOT NULL,
      date_till     DATE           NOT NULL,
      -- (category, supercategory) references the category table. When category
      -- is NULL the FK is not enforced (MATCH SIMPLE), so a budget can target a
      -- whole supercategory.
      FOREIGN KEY (category, supercategory)
        REFERENCES category (category, supercategory)
    );

    CREATE INDEX IF NOT EXISTS idx_budget_date_till ON budget (date_till);
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

export async function listExpenses({ category, supercategory } = {}) {
  const db = await dbPromise;
  // Optionally filter by category and/or supercategory (uses the indexes).
  const where = [];
  const params = [];
  if (category) {
    params.push(category);
    where.push(`category = $${params.length}`);
  }
  if (supercategory) {
    params.push(supercategory);
    where.push(`supercategory = $${params.length}`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const result = await db.query(
    `SELECT id, data, amount, currency, description AS desc, category, supercategory
     FROM expenses
     ${clause}
     ORDER BY data DESC, id DESC`,
    params
  );
  return result.rows;
}

export async function supercategoryTotals() {
  const db = await dbPromise;
  const result = await db.query(
    `SELECT supercategory, SUM(amount) AS total
     FROM expenses
     GROUP BY supercategory
     ORDER BY total DESC`
  );
  return result.rows;
}

// List budgets with their on-the-fly `spent` (SUM of matching expenses within
// the budget's date range, supercategory, and category if the budget sets one).
// `archived: false` (default) returns budgets that haven't ended yet;
// `archived: true` returns only ended ones. The date_till filter comes first so
// the planner can use idx_budget_date_till.
export async function listBudgets({ archived = false } = {}) {
  const db = await dbPromise;
  const dateFilter = archived ? 'b.date_till < CURRENT_DATE' : 'b.date_till >= CURRENT_DATE';
  const result = await db.query(
    `SELECT b.id, b.name, b.category, b.supercategory, b.budget,
            to_char(b.date_from, 'YYYY-MM-DD') AS date_from,
            to_char(b.date_till, 'YYYY-MM-DD') AS date_till,
            COALESCE((
              SELECT SUM(e.amount) FROM expenses e
              WHERE e.data >= b.date_from
                AND e.data <= b.date_till
                AND e.supercategory = b.supercategory
                AND (b.category IS NULL OR e.category = b.category)
            ), 0) AS spent
     FROM budget b
     WHERE ${dateFilter}
     ORDER BY b.date_till, b.id`
  );
  return result.rows;
}

export async function insertBudget({ name, category, supercategory, budget, dateFrom, dateTill }) {
  const db = await dbPromise;
  const result = await db.query(
    `INSERT INTO budget (name, category, supercategory, budget, date_from, date_till)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [name, category || null, supercategory, budget, dateFrom, dateTill]
  );
  return result.rows[0];
}

export async function updateBudget(id, { name, category, supercategory, budget, dateFrom, dateTill }) {
  const db = await dbPromise;
  await db.query(
    `UPDATE budget
     SET name = $2, category = $3, supercategory = $4, budget = $5, date_from = $6, date_till = $7
     WHERE id = $1`,
    [id, name, category || null, supercategory, budget, dateFrom, dateTill]
  );
}

export async function deleteBudget(id) {
  const db = await dbPromise;
  await db.query(`DELETE FROM budget WHERE id = $1`, [id]);
}

// A single budget with its on-the-fly `spent`. Returns null if not found.
export async function getBudget(id) {
  const db = await dbPromise;
  const result = await db.query(
    `SELECT b.id, b.name, b.category, b.supercategory, b.budget,
            to_char(b.date_from, 'YYYY-MM-DD') AS date_from,
            to_char(b.date_till, 'YYYY-MM-DD') AS date_till,
            COALESCE((
              SELECT SUM(e.amount) FROM expenses e
              WHERE e.data >= b.date_from
                AND e.data <= b.date_till
                AND e.supercategory = b.supercategory
                AND (b.category IS NULL OR e.category = b.category)
            ), 0) AS spent
     FROM budget b
     WHERE b.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

// The expenses that count toward a budget (its date range, supercategory, and
// category if set).
export async function budgetExpenses(id) {
  const db = await dbPromise;
  const result = await db.query(
    `SELECT e.id, e.data, e.amount, e.currency, e.description AS desc, e.category, e.supercategory
     FROM expenses e
     JOIN budget b ON b.id = $1
     WHERE e.data >= b.date_from
       AND e.data <= b.date_till
       AND e.supercategory = b.supercategory
       AND (b.category IS NULL OR e.category = b.category)
     ORDER BY e.data DESC, e.id DESC`,
    [id]
  );
  return result.rows;
}

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// Export all expenses as a CSV string. The columns round-trip with
// importCsv() (Date/Amount/Currency/Category/Desc are read back; Subcategory
// is informational and ignored on import).
export async function exportCsv() {
  const db = await dbPromise;
  const result = await db.query(
    `SELECT to_char(data, 'YYYY-MM-DD') AS date, amount, currency, category, supercategory, description
     FROM expenses
     ORDER BY data DESC, id DESC`
  );
  const lines = [['Date', 'Amount', 'Currency', 'Category', 'Subcategory', 'Desc'].join(',')];
  for (const r of result.rows) {
    lines.push(
      [r.date, r.amount, r.currency, r.category, r.supercategory, r.description].map(csvEscape).join(',')
    );
  }
  return lines.join('\n');
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

export async function updateExpense(id, { data, amount, currency, desc, category, supercategory }) {
  const db = await dbPromise;
  const result = await db.query(
    `UPDATE expenses
     SET data = $2, amount = $3, currency = $4, description = $5, category = $6, supercategory = $7
     WHERE id = $1
     RETURNING id, data, amount, currency, description AS desc, category, supercategory, created_at`,
    [id, data, amount, currency, desc, category, supercategory]
  );
  return result.rows[0];
}

export async function deleteExpense(id) {
  const db = await dbPromise;
  await db.query(`DELETE FROM expenses WHERE id = $1`, [id]);
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
