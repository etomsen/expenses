import pg from 'pg';

const { Pool } = pg;

// In Docker the host is the compose service name `db`; locally it's localhost.
const connectionString =
  process.env.DATABASE_URL ||
  'postgres://expenses:expenses@localhost:5433/expenses';

export const pool = new Pool({ connectionString });

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS category (
      category      TEXT PRIMARY KEY,
      supercategory TEXT NOT NULL,
      UNIQUE (category, supercategory)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS expenses (
      id          SERIAL PRIMARY KEY,
      data        DATE          NOT NULL,
      amount      NUMERIC(12, 2) NOT NULL,
      currency      TEXT          NOT NULL,
      description   TEXT          NOT NULL DEFAULT '',
      category      TEXT          NOT NULL,
      supercategory TEXT          NOT NULL,
      created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
      FOREIGN KEY (category, supercategory)
        REFERENCES category (category, supercategory)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_expenses_data ON expenses (data)
  `);
}

const DEFAULT_CATEGORIES = [
  { category: 'Groceries', supercategory: 'Food' },
  { category: 'Restaurants', supercategory: 'Food' },
  { category: 'Fuel', supercategory: 'Transport' },
  { category: 'Public Transport', supercategory: 'Transport' },
  { category: 'Rent', supercategory: 'Housing' },
  { category: 'Utilities', supercategory: 'Housing' },
  { category: 'Entertainment', supercategory: 'Leisure' },
];

export async function seedCategories() {
  for (const { category, supercategory } of DEFAULT_CATEGORIES) {
    await pool.query(
      `INSERT INTO category (category, supercategory)
       VALUES ($1, $2)
       ON CONFLICT (category) DO NOTHING`,
      [category, supercategory]
    );
  }
}

export async function listCategories() {
  const result = await pool.query(
    `SELECT category, supercategory FROM category ORDER BY supercategory, category`
  );
  return result.rows;
}

export async function insertExpense({ data, amount, currency, desc, category, supercategory }) {
  const result = await pool.query(
    `INSERT INTO expenses (data, amount, currency, description, category, supercategory)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, data, amount, currency, description AS desc, category, supercategory, created_at`,
    [data, amount, currency, desc, category, supercategory]
  );
  return result.rows[0];
}
