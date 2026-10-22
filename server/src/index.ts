import express from 'express';
import cors from 'cors';
import pool from './db/pool';
import authRouter from './routes/auth';
import shoppingRouter from './routes/shopping';
import calendarRouter from './routes/calendar';
import choresRouter from './routes/chores';
import mealsRouter from './routes/meals';
import projectsRouter from './routes/projects';
import dashboardRouter from './routes/dashboard';
import recipesRouter from './routes/recipes';
import pushRouter from './routes/push';
import voiceRouter from './routes/voice';
import { ApiError, sendError } from './lib/api-error';
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

// Same-origin by default (the client is served by nginx which proxies /api).
// Only emit CORS headers when an explicit allowlist is configured.
const corsOrigin = process.env.CORS_ORIGIN?.trim();
app.use(cors(corsOrigin ? { origin: corsOrigin.split(',').map((value) => value.trim()) } : { origin: false }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', async (_req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ ok: true });
    } catch (error) {
        console.error('Health check failed:', error);
        res.status(503).json({ ok: false });
    }
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/shopping', shoppingRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/chores', choresRouter);
app.use('/api/meals', mealsRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/recipes', recipesRouter);
app.use('/api/push', pushRouter);
app.use('/api/voice', voiceRouter);
// Error handler
function isBodyParserError(error: unknown, type: string): boolean {
    return typeof error === 'object' && error !== null && 'type' in error && error.type === type;
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) {
        console.error('Error after response was sent:', err);
        return;
    }
    if (err instanceof ApiError) {
        sendError(res, err.status, err.code, err.message, err.details);
        return;
    }
    if (isBodyParserError(err, 'entity.too.large')) {
        sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
        return;
    }
    if (err instanceof SyntaxError && 'body' in err) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Request body is not valid JSON.');
        return;
    }
    console.error(err);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error.');
});

const PORT = process.env.PORT || 4000;
if (require.main === module) {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

export default app;
