const { Pool } = require('pg');
require('dotenv').config();

// Validasi environment variables
const requiredEnv = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missing = requiredEnv.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error(`\nERROR: Environment variables belum di-set: ${missing.join(', ')}`);
  process.exit(1);
}

const DB_NAME = process.env.DB_NAME;

// Pool untuk connect ke database target
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: DB_NAME,
});

// Pool sementara ke database default 'postgres' (untuk buat database)
function getAdminPool() {
  return new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'postgres',
  });
}

// Retry connect ke postgres server sampai ready
async function waitForPostgres(retries = 10, delay = 3000) {
  const adminPool = getAdminPool();
  for (let i = 0; i < retries; i++) {
    try {
      await adminPool.query('SELECT 1');
      await adminPool.end();
      console.log('PostgreSQL is ready');
      return;
    } catch (err) {
      console.log(`PostgreSQL not ready, retry ${i + 1}/${retries}...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  await adminPool.end();
  throw new Error('Cannot connect to PostgreSQL after retries');
}

// Buat database kalau belum ada
async function ensureDatabase() {
  const adminPool = getAdminPool();
  const result = await adminPool.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [DB_NAME]
  );
  if (result.rows.length === 0) {
    await adminPool.query(`CREATE DATABASE "${DB_NAME}"`);
    console.log(`Database "${DB_NAME}" created`);
  } else {
    console.log(`Database "${DB_NAME}" already exists`);
  }
  await adminPool.end();
}

// Init: tunggu postgres → buat db → buat tabel
async function initDB() {
  await waitForPostgres();
  await ensureDatabase();

  const query = `
    CREATE TABLE IF NOT EXISTS todos (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      completed BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await pool.query(query);
  console.log('Table "todos" ready');
}

module.exports = { pool, initDB };
