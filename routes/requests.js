const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         r.id,
         e.first_name || ' ' || e.last_name AS who,
         CASE r.type
           WHEN 'leave' THEN 'Leave Request'
           WHEN 'overtime' THEN 'Overtime Claim'
           WHEN 'expense' THEN 'Expense Claim'
         END AS what,
         GREATEST(1, EXTRACT(DAY FROM NOW() - r.submitted_at)::int) AS days,
         CASE r.status
           WHEN 'overdue' THEN 'overdue'
           WHEN 'needs_policy_check' THEN 'policy'
           WHEN 'ready' THEN 'ready'
           ELSE 'pending'
         END AS status
       FROM requests r
       JOIN employees e ON r.employee_id = e.id
       WHERE r.status IN ('overdue','needs_policy_check','ready')
       ORDER BY
         CASE r.status WHEN 'overdue' THEN 0 WHEN 'needs_policy_check' THEN 1 ELSE 2 END,
         r.submitted_at ASC
       LIMIT 20`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
