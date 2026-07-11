require('dotenv').config();
const { Pool } = require('pg');

const isRemote = process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isRemote ? { rejectUnauthorized: false } : false,
});

module.exports = { query: (text, params) => pool.query(text, params) };
