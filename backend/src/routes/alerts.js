import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

router.get('/', async (req, res) => {
  const status = req.query.status ?? 'open';
  const { rows } = await pool.query(
    `SELECT
       a.id, a.source, a.severity, a.title, a.status, a.received_at,
       c.name AS customer_name, c.id AS customer_id
     FROM alerts a
     LEFT JOIN customers c ON c.id = a.customer_id
     WHERE a.status = $1
     ORDER BY
       CASE a.severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
       a.received_at DESC`,
    [status]
  );
  res.json(rows);
});

router.post('/:id/ack', async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    `UPDATE alerts SET status = 'ack' WHERE id = $1 AND status = 'open' RETURNING *`,
    [id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Alert not found or already acked' });

  await pool.query(
    `INSERT INTO action_logs (user_email, action, alert_id, customer_id)
     VALUES ($1, 'ack_alert', $2, $3)`,
    [req.user.email, id, rows[0].customer_id]
  );

  res.json(rows[0]);
});

router.post('/:id/resolve', async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    `UPDATE alerts SET status = 'resolved' WHERE id = $1 RETURNING *`,
    [id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Alert not found' });

  await pool.query(
    `INSERT INTO action_logs (user_email, action, alert_id, customer_id)
     VALUES ($1, 'resolve_alert', $2, $3)`,
    [req.user.email, id, rows[0].customer_id]
  );

  res.json(rows[0]);
});

export default router;
