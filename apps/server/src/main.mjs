import express from 'express';
import { initDb, insertExpense, seedCategories, listCategories } from './db.mjs';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Allow the web app (served on a different port) to call this API.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function validate(body) {
  const errors = [];
  const { data, amount, currency, desc, category, supercategory } = body ?? {};

  if (typeof data !== 'string' || Number.isNaN(Date.parse(data))) {
    errors.push('data must be an ISO date string');
  }
  if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
    errors.push('amount must be a number greater than 0');
  }
  if (typeof currency !== 'string' || currency.length === 0) {
    errors.push('currency must be a non-empty string');
  }
  if (typeof desc !== 'string') {
    errors.push('desc must be a string');
  }
  if (typeof category !== 'string' || category.length === 0) {
    errors.push('category must be a non-empty string');
  }
  if (typeof supercategory !== 'string' || supercategory.length === 0) {
    errors.push('supercategory must be a non-empty string');
  }

  return errors;
}

app.get('/categories', async (req, res) => {
  try {
    const categories = await listCategories();
    res.json(categories);
  } catch (err) {
    console.error('Failed to load categories:', err);
    res.status(500).json({ error: 'Failed to load categories' });
  }
});

app.post('/add', async (req, res) => {
  const errors = validate(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  const { data, amount, currency, desc, category, supercategory } = req.body;

  try {
    const expense = await insertExpense({ data, amount, currency, desc, category, supercategory });
    res.status(201).json(expense);
  } catch (err) {
    console.error('Failed to store expense:', err);
    res.status(500).json({ error: 'Failed to store expense' });
  }
});

initDb()
  .then(async () => {
    // Seed default categories only when running locally (not in production/Docker).
    if (process.env.NODE_ENV !== 'production') {
      await seedCategories();
      console.log('Seeded default categories');
    }
    app.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
