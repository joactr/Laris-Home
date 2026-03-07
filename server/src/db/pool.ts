import { Pool } from 'pg';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://larishome:larishome@localhost:5432/larishome',
});

export default pool;
