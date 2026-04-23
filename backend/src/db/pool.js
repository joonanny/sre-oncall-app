import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function initDb() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    console.log('DB connected');
  } finally {
    client.release();
  }
}
