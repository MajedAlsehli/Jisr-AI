const express = require('express');
const router = express.Router();
const db = require('../db');

function getRequestTemplate(att) {
  if (att >= 96) return { type: 'leave', status: 'pending', daysAgo: 2 };
  if (att === 95 || att === 90 || att === 88) return { type: 'overtime', status: 'needs_policy_check', daysAgo: 2 };
  if (att <= 81) return { type: 'expense', status: 'ready', daysAgo: 1 };
  return { type: 'leave', status: 'approved', daysAgo: 5 };
}

const QUEUE_OVERRIDES = {
  meshal_abdullah: { type: 'leave', status: 'overdue', daysAgo: 4 },
  rayan_mohammed:  { type: 'overtime', status: 'needs_policy_check', daysAgo: 2 },
  sadeem_ahmed:    { type: 'expense', status: 'ready', daysAgo: 1 },
  joud_khalid:     { type: 'leave', status: 'overdue', daysAgo: 2 },
};

router.post('/', async (req, res) => {
  try {
    await db.query('DELETE FROM notifications');
    await db.query('DELETE FROM recommendations');
    await db.query('DELETE FROM requests');

    const emps = await db.query(
      `SELECT e.id, e.emp_key,
              COUNT(*) FILTER (WHERE a.status IN ('present','late'))::int AS present_late,
              COUNT(*)::int AS total
       FROM employees e
       LEFT JOIN attendance_records a ON a.employee_id = e.id
       GROUP BY e.id, e.emp_key`
    );

    const now = new Date();
    for (const emp of emps.rows) {
      const attPct = emp.total > 0 ? Math.round(100 * emp.present_late / emp.total) : 0;
      const override = QUEUE_OVERRIDES[emp.emp_key];
      const tmpl = override || getRequestTemplate(attPct);
      const sub = new Date(now);
      sub.setDate(sub.getDate() - tmpl.daysAgo);
      await db.query(
        'INSERT INTO requests (employee_id, type, submitted_at, status) VALUES ($1,$2,$3,$4)',
        [emp.id, tmpl.type, sub.toISOString(), tmpl.status]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Reset failed' });
  }
});

module.exports = router;
