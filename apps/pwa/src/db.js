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
];

async function createDb() {
  // Persisted in IndexedDB; survives reloads and works offline.
  const db = await PGlite.create('idb://expenses');

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
  // Insert the expense and bump the category's usage counter together so the
  // count can never drift from the number of recorded expenses.
  return db.transaction(async (tx) => {
    const result = await tx.query(
      `INSERT INTO expenses (data, amount, currency, description, category, supercategory)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, data, amount, currency, description AS desc, category, supercategory, created_at`,
      [data, amount, currency, desc, category, supercategory]
    );
    await tx.query(
      `UPDATE category SET usage_count = usage_count + 1 WHERE category = $1`,
      [category]
    );
    return result.rows[0];
  });
}
