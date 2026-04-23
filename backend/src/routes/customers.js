import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

router.get('/', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT
       c.id, c.name, c.slug, c.tier, c.aws_account_id,
       COUNT(a.id) FILTER (WHERE a.status = 'open' AND a.severity = 'critical') AS critical_count,
       COUNT(a.id) FILTER (WHERE a.status = 'open' AND a.severity = 'warning')  AS warning_count
     FROM customers c
     LEFT JOIN alerts a ON a.customer_id = c.id
     GROUP BY c.id
     ORDER BY c.name`
  );
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;

  const { rows: customers } = await pool.query(
    'SELECT * FROM customers WHERE id = $1',
    [id]
  );
  if (!customers.length) return res.status(404).json({ error: 'Not found' });

  const { rows: contacts } = await pool.query(
    `SELECT id, name, role, phone, email, is_primary
     FROM contacts WHERE customer_id = $1 ORDER BY is_primary DESC`,
    [id]
  );

  const { rows: history } = await pool.query(
    `SELECT id, source, severity, title, status, received_at
     FROM alerts
     WHERE customer_id = $1 AND received_at >= NOW() - INTERVAL '30 days'
     ORDER BY received_at DESC`,
    [id]
  );

  // 담당자 조회 감사로그
  await pool.query(
    `INSERT INTO action_logs (user_email, action, customer_id)
     VALUES ($1, 'view_customer', $2)`,
    [req.user.email, id]
  );

  res.json({ ...customers[0], contacts, history });
});

export default router;
