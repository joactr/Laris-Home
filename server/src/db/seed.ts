import bcrypt from 'bcryptjs';
import pool from './pool';

async function seed() {
    const client = await pool.connect();
    try {
        await client.query('TRUNCATE TABLE users CASCADE');
        await client.query('TRUNCATE TABLE households CASCADE');

        // Users
        const passwordHash = await bcrypt.hash('password123', 10);
        const jmRes = await client.query(
            `INSERT INTO users (name, username, password_hash, is_admin, color) VALUES ($1,$2,$3,$4,$5)
             RETURNING id`,
            ['JM', 'JM', passwordHash, true, '#ec4899']
        );
        const bubaRes = await client.query(
            `INSERT INTO users (name, username, password_hash, is_admin, color) VALUES ($1,$2,$3,$4,$5)
             RETURNING id`,
            ['Buba', 'Buba', passwordHash, false, '#6366f1']
        );
        const aliceId = jmRes.rows[0].id;
        const bobId = bubaRes.rows[0].id;

        // Household
        const hhRes = await client.query(
            `INSERT INTO households (name) VALUES ($1) RETURNING id`,
            ['Our Home']
        );
        const hhId = hhRes.rows[0].id;

        // Memberships
        await client.query(
            `INSERT INTO memberships (user_id, household_id, role) VALUES ($1,$2,'admin') ON CONFLICT DO NOTHING`,
            [aliceId, hhId]
        );
        await client.query(
            `INSERT INTO memberships (user_id, household_id, role) VALUES ($1,$2,'member') ON CONFLICT DO NOTHING`,
            [bobId, hhId]
        );

        // Shopping list
        const listRes = await client.query(
            `INSERT INTO shopping_lists (household_id, name, is_default) VALUES ($1,'Groceries',true) RETURNING id`,
            [hhId]
        );
        const listId = listRes.rows[0].id;
        await client.query(
            `INSERT INTO shopping_lists (household_id, name) VALUES ($1,'Pharmacy')`,
            [hhId]
        );
        const items = [
            ['Milk', 2, 'L', 'Dairy', aliceId],
            ['Eggs', 12, 'pcs', 'Dairy', bobId],
            ['Bread', 1, 'loaf', 'Bakery', aliceId],
            ['Apples', 1, 'kg', 'Fruit', bobId],
            ['Pasta', 500, 'g', 'Dry goods', aliceId],
        ];
        for (const [name, qty, unit, cat, uid] of items) {
            await client.query(
                `INSERT INTO list_items (list_id, name, quantity, unit, category, added_by_user_id) VALUES ($1,$2,$3,$4,$5,$6)`,
                [listId, name, qty, unit, cat, uid]
            );
        }

        // Calendar events
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        await client.query(
            `INSERT INTO events (household_id, title, description, start_datetime, end_datetime, created_by_user_id, assigned_user_id, category)
       VALUES ($1,'Doctor Appointment','Annual check-up',$2,$3,$4,$5,'personal')`,
            [hhId, `${todayStr}T10:00:00Z`, `${todayStr}T11:00:00Z`, aliceId, aliceId]
        );
        await client.query(
            `INSERT INTO events (household_id, title, description, start_datetime, end_datetime, created_by_user_id, category)
       VALUES ($1,'Movie Night','Watch the new film together',$2,$3,$4,'shared')`,
            [hhId, `${todayStr}T20:00:00Z`, `${todayStr}T22:00:00Z`, bobId]
        );

        // Chore templates + instances
        const templates = [
            ['Vacuum living room', 'lounge', aliceId, 'weekly', [1], 3],
            ['Take out trash', 'outside', bobId, 'weekly', [1, 4], 2],
            ['Clean bathroom', 'bathroom', aliceId, 'weekly', [6], 4],
            ['Do laundry', 'laundry room', bobId, 'weekly', [3], 3],
        ];
        for (const [title, location, assignee, recType, days, points] of templates) {
            const tRes = await client.query(
                `INSERT INTO chore_templates (household_id, title, location, default_assignee_user_id, recurrence_type, recurrence_days, points)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
                [hhId, title, location, assignee, recType, days, points]
            );
            const tId = tRes.rows[0].id;
            // Generate instances for next 14 days
            for (let i = 0; i < 14; i++) {
                const d = new Date();
                d.setDate(d.getDate() + i);
                const dow = d.getDay();
                if ((days as number[]).includes(dow)) {
                    const dateStr = d.toISOString().split('T')[0];
                    await client.query(
                        `INSERT INTO chore_instances (template_id, scheduled_date, assigned_user_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
                        [tId, dateStr, assignee]
                    );
                }
            }
        }

        // Meals
        for (let i = 0; i < 7; i++) {
            const d = new Date();
            d.setDate(d.getDate() + i);
            const dateStr = d.toISOString().split('T')[0];
            const meals = [
                ['Oatmeal with berries', 'Chicken salad', 'Pasta carbonara', 'Fruit'],
                ['Toast with eggs', 'Soup and bread', 'Steak with veggies', 'Yogurt'],
                ['Smoothie bowl', 'Leftover pasta', 'Homemade pizza', 'Nuts'],
                ['Pancakes', 'Caesar salad', 'Grilled salmon', 'Cheese'],
                ['Granola', 'BLT sandwich', 'Thai curry', 'Apple'],
                ['Avocado toast', 'Greek salad', 'BBQ ribs', 'Ice cream'],
                ['French toast', 'Tuna wrap', 'Roast chicken', 'Cookies'],
            ];
            const m = meals[i % 7];
            await client.query(
                `INSERT INTO meal_plan_days (household_id, date, breakfast, lunch, dinner, snack) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (household_id, date) DO UPDATE SET breakfast=$3, lunch=$4, dinner=$5, snack=$6`,
                [hhId, dateStr, m[0], m[1], m[2], m[3]]
            );
        }

        // Projects and tasks
        const proj1 = await client.query(
            `INSERT INTO projects (household_id, name, description) VALUES ($1,'Home Improvement','Fix and upgrade our place') RETURNING id`,
            [hhId]
        );
        const proj2 = await client.query(
            `INSERT INTO projects (household_id, name, description) VALUES ($1,'Travel Planning','Next vacation ideas') RETURNING id`,
            [hhId]
        );
        const p1 = proj1.rows[0].id;
        const p2 = proj2.rows[0].id;

        const tasks1 = [
            ['Paint bedroom', 'todo', 'medium', aliceId],
            ['Fix leaking tap', 'inProgress', 'high', bobId],
            ['Buy new sofa', 'todo', 'low', null],
            ['Install shelves', 'done', 'medium', bobId],
        ];
        for (const [title, status, priority, assignee] of tasks1) {
            await client.query(
                `INSERT INTO tasks (project_id, title, status, priority, created_by_user_id, assigned_user_id) VALUES ($1,$2,$3,$4,$5,$6)`,
                [p1, title, status, priority, aliceId, assignee]
            );
        }
        const tasks2 = [
            ['Research destinations', 'done', 'high', aliceId],
            ['Book flights', 'inProgress', 'high', bobId],
            ['Plan itinerary', 'todo', 'medium', null],
        ];
        for (const [title, status, priority, assignee] of tasks2) {
            await client.query(
                `INSERT INTO tasks (project_id, title, status, priority, created_by_user_id, assigned_user_id) VALUES ($1,$2,$3,$4,$5,$6)`,
                [p2, title, status, priority, bobId, assignee]
            );
        }

        console.log('Seed complete!');
        console.log('  JM:   JM / password123 (Admin)');
        console.log('  Buba: Buba / password123');
    } finally {
        client.release();
        await pool.end();
    }
}

seed().catch((err) => { console.error(err); process.exit(1); });
