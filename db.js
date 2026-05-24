const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// Retry connect sampai DB ready
async function connectWithRetry(retries = 10, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1');
      console.log('DB connected');
      return;
    } catch (err) {
      console.log(`DB not ready, retry ${i + 1}/${retries}...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Cannot connect to DB after retries');
}

// Buat tabel todos kalau belum ada
async function initDB() {
  await connectWithRetry();

  const query = `
    CREATE TABLE IF NOT EXISTS todos (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      completed BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await pool.query(query);
  console.log('Database initialized - table "todos" ready');
}

module.exports = { pool, initDB };
