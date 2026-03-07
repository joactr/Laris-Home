import fs from 'fs';
import path from 'path';
import pool from './pool';

async function migrate() {
    const client = await pool.connect();
    try {
        await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name VARCHAR(255) PRIMARY KEY,
        run_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

        const migrationsDir = path.join(__dirname, 'migrations');
        const files = fs.readdirSync(migrationsDir).sort();

        for (const file of files) {
            if (!file.endsWith('.sql')) continue;
            const { rows } = await client.query('SELECT name FROM _migrations WHERE name = $1', [file]);
            if (rows.length > 0) {
                console.log(`  skip: ${file}`);
                continue;
            }
            const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
            await client.query(sql);
            await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
            console.log(`  ran: ${file}`);
        }
        console.log('Migrations complete.');
    } finally {
        client.release();
        await pool.end();
    }
}

migrate().catch((err) => { console.error(err); process.exit(1); });
