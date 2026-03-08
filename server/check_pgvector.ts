import pool from './src/db/pool';

async function check() {
  try {
    const res = await pool.query('SELECT version();');
    console.log('Postgres Version:', res.rows[0].version);
    
    try {
      await pool.query('CREATE EXTENSION IF NOT EXISTS vector;');
      console.log('pgvector extension enabled successfully!');
    } catch (e: any) {
      console.error('Failed to enable pgvector:', e.message);
    }
  } catch (err: any) {
    console.error('DB Connection error:', err.message);
  } finally {
    await pool.end();
  }
}

check();
