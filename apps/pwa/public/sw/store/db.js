// PGLite store — runs INSIDE the service worker. The page never touches this
// directly; it talks to the SW over /api/* (see ../interceptors and ../../api).
// WASM/data are loaded from the Cache API (a service worker can't intercept its
// own fetches, so this is what makes the DB work offline).
import { PGlite } from '../../assets/pglite/index.js';

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
  { category: 'Непонятно', supercategory: 'Непонятно' },
];

const DB_NAME = 'expenses';
const IDB_NAME = `/pglite/${DB_NAME}`;

async function assetFromCache(path) {
  const res = await caches.match(path);
  if (!res) throw new Error('PGLite asset not cached: ' + path);
  return res;
}

async function createDb() {
  // Load the WASM + data filesystem from the Cache API so the DB boots offline.
  const [wasmRes, initdbRes, dataRes] = await Promise.all([
    assetFromCache('assets/pglite/pglite.wasm'),
    assetFromCache('assets/pglite/initdb.wasm'),
    assetFromCache('assets/pglite/pglite.data'),
  ]);
  const [pgliteWasmModule, initdbWasmModule, fsBundle] = await Promise.all([
    WebAssembly.compile(await wasmRes.arrayBuffer()),
    WebAssembly.compile(await initdbRes.arrayBuffer()),
    dataRes.blob(),
  ]);

  const db = await PGlite.create(`idb://${DB_NAME}`, {
    pgliteWasmModule,
    initdbWasmModule,
    fsBundle,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS category (
      category      TEXT PRIMARY KEY,
      supercategory TEXT NOT NULL,
      usage_count   INTEGER NOT NULL DEFAULT 0,
      UNIQUE (category, supercategory)
    );

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
      FOREIGN KEY (category, supercategory)
        REFERENCES category (category, supercategory)
    );

    CREATE INDEX IF NOT EXISTS idx_budget_date_till ON budget (date_till);
  `);

  // Seed default categories only on first launch (empty table).
  const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM category`);
  if (rows[0].n === 0) {
    for (const { category, supercategory } of DEFAULT_CATEGORIES) {
      await db.query(`INSERT INTO category (category, supercategory) VALUES ($1, $2)`, [
        category,
        supercategory,
      ]);
    }
  }

  return db;
}

// Lazy, single shared connection. Boots on the first /api request.
let dbPromise = null;
function getDb() {
  return (dbPromise ||= createDb());
}

export async function listCategories() {
  const db = await getDb();
  const result = await db.query(
    `SELECT category, supercategory FROM category ORDER BY usage_count DESC, category`
  );
  return result.rows;
}

const PERIOD_RANGES = {
  week: `data >= date_trunc('week', CURRENT_DATE)::date
         AND data < (date_trunc('week', CURRENT_DATE) + INTERVAL '7 days')::date`,
  '2weeks': `data >= (date_trunc('week', CURRENT_DATE) - INTERVAL '7 days')::date
             AND data < (date_trunc('week', CURRENT_DATE) + INTERVAL '7 days')::date`,
  month: `data >= date_trunc('month', CURRENT_DATE)::date
          AND data < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date`,
};

export async function listExpenses({ category, supercategory, period } = {}) {
  const db = await getDb();
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
  if (PERIOD_RANGES[period]) where.push(PERIOD_RANGES[period]);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const result = await db.query(
    `SELECT id, to_char(data, 'YYYY-MM-DD') AS data, amount, currency, description AS desc, category, supercategory
     FROM expenses
     ${clause}
     ORDER BY data DESC, id DESC`,
    params
  );
  return result.rows;
}

export async function supercategoryTotals({ month = 'this' } = {}) {
  const db = await getDb();
  const range =
    month === 'prev'
      ? `data >= (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date
         AND data < date_trunc('month', CURRENT_DATE)::date`
      : PERIOD_RANGES.month;
  const result = await db.query(
    `SELECT supercategory, SUM(amount) AS total
     FROM expenses
     WHERE ${range}
     GROUP BY supercategory
     ORDER BY total DESC`
  );
  return result.rows;
}

export async function listBudgets({ archived = false } = {}) {
  const db = await getDb();
  const dateFilter = archived ? 'b.date_till < CURRENT_DATE' : 'b.date_till >= CURRENT_DATE';
  const result = await db.query(
    `SELECT b.id, b.name, b.category, b.supercategory, b.budget,
            to_char(b.date_from, 'YYYY-MM-DD') AS date_from,
            to_char(b.date_till, 'YYYY-MM-DD') AS date_till,
            COALESCE((
              SELECT SUM(e.amount) FROM expenses e
              WHERE e.data >= b.date_from AND e.data <= b.date_till
                AND e.supercategory = b.supercategory
                AND (b.category IS NULL OR e.category = b.category)
            ), 0) AS spent
     FROM budget b
     WHERE ${dateFilter}
     ORDER BY b.date_till, b.id`
  );
  return result.rows;
}

export async function getBudget(id) {
  const db = await getDb();
  const result = await db.query(
    `SELECT b.id, b.name, b.category, b.supercategory, b.budget,
            to_char(b.date_from, 'YYYY-MM-DD') AS date_from,
            to_char(b.date_till, 'YYYY-MM-DD') AS date_till,
            COALESCE((
              SELECT SUM(e.amount) FROM expenses e
              WHERE e.data >= b.date_from AND e.data <= b.date_till
                AND e.supercategory = b.supercategory
                AND (b.category IS NULL OR e.category = b.category)
            ), 0) AS spent
     FROM budget b
     WHERE b.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function budgetExpenses(id) {
  const db = await getDb();
  const result = await db.query(
    `SELECT e.id, to_char(e.data, 'YYYY-MM-DD') AS data, e.amount, e.currency,
            e.description AS desc, e.category, e.supercategory
     FROM expenses e
     JOIN budget b ON b.id = $1
     WHERE e.data >= b.date_from AND e.data <= b.date_till
       AND e.supercategory = b.supercategory
       AND (b.category IS NULL OR e.category = b.category)
     ORDER BY e.data DESC, e.id DESC`,
    [id]
  );
  return result.rows;
}

export async function insertBudget({ name, category, supercategory, budget, dateFrom, dateTill }) {
  const db = await getDb();
  const result = await db.query(
    `INSERT INTO budget (name, category, supercategory, budget, date_from, date_till)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [name, category || null, supercategory, budget, dateFrom, dateTill]
  );
  return result.rows[0];
}

export async function updateBudget(id, { name, category, supercategory, budget, dateFrom, dateTill }) {
  const db = await getDb();
  await db.query(
    `UPDATE budget
     SET name = $2, category = $3, supercategory = $4, budget = $5, date_from = $6, date_till = $7
     WHERE id = $1`,
    [id, name, category || null, supercategory, budget, dateFrom, dateTill]
  );
}

export async function deleteBudget(id) {
  const db = await getDb();
  await db.query(`DELETE FROM budget WHERE id = $1`, [id]);
}

export async function insertExpense({ data, amount, currency, desc, category, supercategory }) {
  const db = await getDb();
  const result = await db.query(
    `INSERT INTO expenses (data, amount, currency, description, category, supercategory)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, to_char(data, 'YYYY-MM-DD') AS data, amount, currency, description AS desc, category, supercategory`,
    [data, amount, currency, desc, category, supercategory]
  );
  try {
    await db.query(`UPDATE category SET usage_count = usage_count + 1 WHERE category = $1`, [category]);
  } catch (e) {
    console.warn('Could not update category usage_count:', e);
  }
  return result.rows[0];
}

export async function updateExpense(id, { data, amount, currency, desc, category, supercategory }) {
  const db = await getDb();
  const result = await db.query(
    `UPDATE expenses
     SET data = $2, amount = $3, currency = $4, description = $5, category = $6, supercategory = $7
     WHERE id = $1
     RETURNING id, to_char(data, 'YYYY-MM-DD') AS data, amount, currency, description AS desc, category, supercategory`,
    [id, data, amount, currency, desc, category, supercategory]
  );
  return result.rows[0];
}

export async function deleteExpense(id) {
  const db = await getDb();
  await db.query(`DELETE FROM expenses WHERE id = $1`, [id]);
}

export async function resetDatabase() {
  try {
    if (dbPromise) {
      const db = await dbPromise;
      await db.close();
    }
  } catch (e) {
    console.warn('Could not close DB before reset:', e);
  }
  dbPromise = null;
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(IDB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

const CATEGORY_ALIASES = { 'кафе и рестораны': 'кофе и рестораны' };
const FALLBACK_CATEGORY = { category: 'Непонятно', supercategory: 'Непонятно' };

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
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function parseAmount(raw) {
  let a = String(raw || '').replace(/\s/g, '');
  a = a.includes('.') ? a.replace(/,/g, '') : a.replace(',', '.');
  return parseFloat(a);
}

export async function exportCsv() {
  const db = await getDb();
  const result = await db.query(
    `SELECT to_char(data, 'YYYY-MM-DD') AS date, amount, currency, category, supercategory, description
     FROM expenses ORDER BY data DESC, id DESC`
  );
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [['Date', 'Amount', 'Currency', 'Category', 'Subcategory', 'Desc'].join(',')];
  for (const r of result.rows) {
    lines.push([r.date, r.amount, r.currency, r.category, r.supercategory, r.description].map(esc).join(','));
  }
  return lines.join('\n');
}

export async function importCsv(text) {
  const db = await getDb();
  await db.query(
    `INSERT INTO category (category, supercategory) VALUES ($1, $2) ON CONFLICT (category) DO NOTHING`,
    [FALLBACK_CATEGORY.category, FALLBACK_CATEGORY.supercategory]
  );
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
  if (find('date', 'when') !== -1 || find('amount', 'how much') !== -1 || find('category') !== -1) {
    start = 1;
    idx = {
      date: find('date', 'when'),
      amount: find('amount', 'how much'),
      category: find('category'),
      desc: find('desc', 'description'),
      currency: find('currency'),
    };
    if (idx.date === -1 || idx.amount === -1) {
      throw new Error('CSV header must include a date (Date/When) and an amount (Amount/How much) column.');
    }
  }

  let total = 0, imported = 0, unmatched = 0, skipped = 0;
  const usageBump = new Map();
  for (let r = start; r < rows.length; r++) {
    const cols = rows[r];
    if (cols.length === 1 && cols[0].trim() === '') continue;
    const dateRaw = (cols[idx.date] || '').trim();
    const amount = parseAmount(cols[idx.amount]);
    if (!dateRaw && Number.isNaN(amount)) continue;
    total++;
    if (!dateRaw || Number.isNaN(amount)) { skipped++; continue; }
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
  try {
    for (const [category, n] of usageBump) {
      await db.query(`UPDATE category SET usage_count = usage_count + $2 WHERE category = $1`, [category, n]);
    }
  } catch (e) {
    console.warn('Could not update usage counts after import:', e);
  }
  return { total, imported, unmatched, skipped };
}

// ---- Budgets CSV ----

export async function exportBudgetsCsv() {
  const db = await getDb();
  const result = await db.query(
    `SELECT name, category, supercategory, budget,
            to_char(date_from, 'YYYY-MM-DD') AS date_from,
            to_char(date_till, 'YYYY-MM-DD') AS date_till
     FROM budget ORDER BY date_till, id`
  );
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [['Name', 'Category', 'Supercategory', 'Budget', 'From', 'Till'].join(',')];
  for (const r of result.rows) {
    lines.push([r.name, r.category || '', r.supercategory, r.budget, r.date_from, r.date_till].map(esc).join(','));
  }
  return lines.join('\n');
}

// Import budgets from CSV. Columns: Name, Category, Supercategory, Budget, From,
// Till. A row whose supercategory (or category, when given) isn't in the local
// category table is skipped and reported. Returns
// { total, imported, skipped, skippedRows: [{ line, name, reason }] }.
export async function importBudgetsCsv(text) {
  const db = await getDb();
  const cats = (await db.query(`SELECT category, supercategory FROM category`)).rows;
  const supercats = new Set(cats.map((c) => c.supercategory));
  const pairs = new Set(cats.map((c) => c.category + ' ' + c.supercategory));

  const rows = parseCsv(text.replace(/^﻿/, ''));
  if (rows.length === 0) return { total: 0, imported: 0, skipped: 0, skippedRows: [] };

  let start = 0;
  let idx = { name: 0, category: 1, supercategory: 2, budget: 3, from: 4, till: 5 };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const find = (...names) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i !== -1) return i;
    }
    return -1;
  };
  if (find('name') !== -1 || find('supercategory') !== -1 || find('budget') !== -1) {
    start = 1;
    idx = {
      name: find('name'),
      category: find('category'),
      supercategory: find('supercategory', 'subcategory'),
      budget: find('budget', 'amount'),
      from: find('from', 'date_from'),
      till: find('till', 'date_till'),
    };
  }

  let total = 0, imported = 0, skipped = 0;
  const skippedRows = [];
  for (let r = start; r < rows.length; r++) {
    const cols = rows[r];
    if (cols.length === 1 && cols[0].trim() === '') continue;
    const get = (i) => (i >= 0 && cols[i] != null ? String(cols[i]).trim() : '');
    const name = get(idx.name);
    const category = get(idx.category);
    const supercategory = get(idx.supercategory);
    const budget = parseAmount(get(idx.budget));
    const from = get(idx.from);
    const till = get(idx.till);
    if (!name && !supercategory && Number.isNaN(budget)) continue;
    total++;

    let reason = null;
    if (!supercategory || !supercats.has(supercategory)) reason = `supercategory "${supercategory}" not in DB`;
    else if (category && !pairs.has(category + ' ' + supercategory)) reason = `category "${category}" not in "${supercategory}"`;
    else if (Number.isNaN(budget) || !from || !till) reason = 'missing budget/from/till';

    if (reason) {
      skipped++;
      skippedRows.push({ line: r + 1, name, reason });
      continue;
    }
    try {
      await db.query(
        `INSERT INTO budget (name, category, supercategory, budget, date_from, date_till)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [name, category || null, supercategory, budget, from, till]
      );
      imported++;
    } catch (e) {
      skipped++;
      skippedRows.push({ line: r + 1, name, reason: String((e && e.message) || e) });
    }
  }
  return { total, imported, skipped, skippedRows };
}
