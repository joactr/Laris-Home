import express from 'express';
import cors from 'cors';
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

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Health check
app.get('/api/health', (_req, res) => { res.json({ ok: true }); });

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
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof ApiError) {
        sendError(res, err.status, err.code, err.message, err.details);
        return;
    }
    console.error(err);
    sendError(res, 500, 'INTERNAL_ERROR', err?.message || 'Internal server error');
});

const PORT = process.env.PORT || 4000;
if (require.main === module) {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

export default app;
