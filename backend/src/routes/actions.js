import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

router.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit ?? '50', 10), 200);
  const { rows } = await pool.query(
    `SELECT
       al.id, al.user_email, al.action,
       al.customer_id, al.alert_id, al.created_at,
       c.name AS customer_name
     FROM action_logs al
     LEFT JOIN customers c ON c.id = al.customer_id
     ORDER BY al.created_at DESC
     LIMIT $1`,
    [limit]
  );
  res.json(rows);
});

export default router;
