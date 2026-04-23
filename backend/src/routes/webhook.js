import { Router } from 'express';
import crypto from 'crypto';
import { pool } from '../db/pool.js';

const router = Router();

function verifyWhatapSignature(req) {
  const sig = req.headers['x-whatap-signature'] ?? '';
  const expected = crypto
    .createHmac('sha256', process.env.WHATAP_WEBHOOK_SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

function verifyDatadogSignature(req) {
  const sig = req.headers['x-datadog-signature'] ?? '';
  const expected = crypto
    .createHmac('sha256', process.env.DATADOG_WEBHOOK_SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

async function findCustomerBySlug(slug) {
  if (!slug) return null;
  const { rows } = await pool.query(
    'SELECT id FROM customers WHERE slug = $1',
    [slug]
  );
  return rows[0] ?? null;
}

router.post('/whatap', async (req, res) => {
  if (!verifyWhatapSignature(req)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { project_name, level, title, message } = req.body;
  const customer = await findCustomerBySlug(project_name);

  await pool.query(
    `INSERT INTO alerts (customer_id, source, severity, title, message)
     VALUES ($1, 'whatap', $2, $3, $4)`,
    [customer?.id ?? null, level ?? 'unknown', title ?? '', message ?? '']
  );

  res.json({ ok: true });
});

router.post('/datadog', async (req, res) => {
  if (!verifyDatadogSignature(req)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const tags = req.body.tags ?? [];
  const projectTag = tags.find((t) => t.startsWith('project:'));
  const slug = projectTag ? projectTag.split(':')[1] : null;
  const customer = await findCustomerBySlug(slug);

  const severity = req.body.alert_type ?? 'unknown';
  const title = req.body.title ?? req.body.event_title ?? '';
  const message = req.body.text ?? '';

  await pool.query(
    `INSERT INTO alerts (customer_id, source, severity, title, message)
     VALUES ($1, 'datadog', $2, $3, $4)`,
    [customer?.id ?? null, severity, title, message]
  );

  res.json({ ok: true });
});

export default router;
