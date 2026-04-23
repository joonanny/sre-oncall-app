import express from 'express';
import { initDb } from './db/pool.js';
import { authMiddleware } from './middleware/auth.js';
import webhookRouter from './routes/webhook.js';
import customersRouter from './routes/customers.js';
import alertsRouter from './routes/alerts.js';
import aiRouter from './routes/ai.js';
import actionsRouter from './routes/actions.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// 웹훅은 인증 없이 수신 (HMAC으로 자체 검증)
app.use('/webhook', webhookRouter);

// 나머지 API는 Authentik JWT 필수
app.use('/api', authMiddleware);
app.use('/api/customers', customersRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/actions', actionsRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

await initDb();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
