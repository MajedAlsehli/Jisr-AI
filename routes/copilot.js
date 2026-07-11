const express = require('express');
const router = express.Router();
const db = require('../db');
const { classifyIntent, generateChatReply } = require('../services/openai');

async function handleIntent(intent, empId) {
  switch (intent) {
    case 'pending': {
      const r = await db.query(
        `SELECT e.first_name || ' ' || e.last_name AS name,
                CASE rq.type WHEN 'leave' THEN 'leave request' WHEN 'overtime' THEN 'overtime claim' ELSE 'expense claim' END AS type,
                GREATEST(1, EXTRACT(DAY FROM NOW() - rq.submitted_at)::int) AS days
         FROM requests rq JOIN employees e ON rq.employee_id = e.id
         WHERE rq.submitted_at < NOW() - INTERVAL '3 days'
           AND rq.status IN ('pending','overdue')
         ORDER BY rq.submitted_at ASC`
      );
      return { intent, data: { count: r.rows.length, items: r.rows } };
    }
    case 'lateAttendance': {
      const r = await db.query(
        `SELECT e.first_name || ' ' || e.last_name AS name, COUNT(*) AS late_count
         FROM attendance_records ar JOIN employees e ON ar.employee_id = e.id
         WHERE ar.status = 'late'
           AND DATE_TRUNC('month', ar.date) = DATE_TRUNC('month', CURRENT_DATE)
         GROUP BY e.id, e.first_name, e.last_name
         HAVING COUNT(*) >= 2
         ORDER BY late_count DESC`
      );
      return { intent, data: { employees: r.rows.map(row => row.name), counts: r.rows } };
    }
    case 'awaitingApproval': {
      const r = await db.query(
        `SELECT e.first_name || ' ' || e.last_name AS name,
                CASE rq.type WHEN 'leave' THEN 'leave request' WHEN 'overtime' THEN 'overtime claim' ELSE 'expense claim' END AS type
         FROM requests rq JOIN employees e ON rq.employee_id = e.id
         WHERE rq.status IN ('pending','needs_policy_check')
         ORDER BY rq.submitted_at ASC`
      );
      return { intent, data: { count: r.rows.length, items: r.rows } };
    }
    case 'approvedToday': {
      const r = await db.query(
        `SELECT e.first_name || ' ' || e.last_name AS name,
                CASE rq.type WHEN 'leave' THEN 'leave request' WHEN 'overtime' THEN 'overtime claim' ELSE 'expense claim' END AS type
         FROM requests rq JOIN employees e ON rq.employee_id = e.id
         WHERE rq.status = 'approved' AND DATE(rq.submitted_at) = CURRENT_DATE`
      );
      return { intent, data: { count: r.rows.length, items: r.rows } };
    }
    case 'attendance': {
      if (!empId) return null;
      const emp = await db.query('SELECT first_name, last_name FROM employees WHERE id = $1', [empId]);
      if (!emp.rows.length) return null;
      const name = `${emp.rows[0].first_name} ${emp.rows[0].last_name}`;
      const r = await db.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'present') AS present,
           COUNT(*) FILTER (WHERE status = 'late') AS late,
           COUNT(*) FILTER (WHERE status = 'absent') AS absent,
           COUNT(*) AS total
         FROM attendance_records
         WHERE employee_id = $1
           AND date BETWEEN '2025-07-01' AND '2025-09-30'`,
        [empId]
      );
      const row = r.rows[0];
      const present = parseInt(row.present);
      const late = parseInt(row.late);
      const total = parseInt(row.total);
      const pct = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
      return { intent, data: { name, present, late, total, pct } };
    }
    case 'balance': {
      if (!empId) return null;
      const r = await db.query('SELECT first_name, last_name, leave_balance FROM employees WHERE id = $1', [empId]);
      if (!r.rows.length) return null;
      const e = r.rows[0];
      return { intent, data: { name: `${e.first_name} ${e.last_name}`, balance: e.leave_balance } };
    }
    case 'policy': {
      if (!empId) return null;
      const emp = await db.query('SELECT first_name, last_name, manager_name FROM employees WHERE id = $1', [empId]);
      if (!emp.rows.length) return null;
      const name = `${emp.rows[0].first_name} ${emp.rows[0].last_name}`;
      const r = await db.query(
        `SELECT type, status FROM requests WHERE employee_id = $1 ORDER BY submitted_at DESC LIMIT 1`,
        [empId]
      );
      const req = r.rows[0] || { type: 'leave', status: 'pending' };
      return { intent, data: { name, type: req.type, status: req.status, manager: emp.rows[0].manager_name } };
    }
    case 'manager': {
      if (!empId) return null;
      const r = await db.query('SELECT first_name, last_name, manager_name FROM employees WHERE id = $1', [empId]);
      if (!r.rows.length) return null;
      const e = r.rows[0];
      return { intent, data: { name: `${e.first_name} ${e.last_name}`, manager: e.manager_name } };
    }
    case 'tenure': {
      if (!empId) return null;
      const r = await db.query('SELECT first_name, last_name, role, role_start_date FROM employees WHERE id = $1', [empId]);
      if (!r.rows.length) return null;
      const e = r.rows[0];
      const years = ((Date.now() - new Date(e.role_start_date).getTime()) / (365.25 * 24 * 3600 * 1000)).toFixed(1);
      return { intent, data: { name: `${e.first_name} ${e.last_name}`, role: e.role, years } };
    }
    case 'promotionReady': {
      const r = await db.query(
        `SELECT e.first_name || ' ' || e.last_name AS name, e.role, d.label AS department
         FROM employees e JOIN departments d ON e.department_id = d.id
         WHERE e.performance_rating_met = true AND e.goal_achievement_met = true
           AND e.leadership_cert = true AND e.manager_feedback_positive = true
           AND e.peer_feedback_positive = true
           AND (CURRENT_DATE - e.role_start_date) / 365.25 >= 2
         ORDER BY d.label, e.first_name`
      );
      return { intent, data: { count: r.rows.length, employees: r.rows } };
    }
    case 'topPerformers': {
      const r = await db.query(
        `SELECT e.first_name || ' ' || e.last_name AS name, e.role, d.label AS department
         FROM employees e JOIN departments d ON e.department_id = d.id
         WHERE e.performance_rating_met = true AND e.goal_achievement_met = true
         ORDER BY d.label, e.first_name`
      );
      return { intent, data: { count: r.rows.length, employees: r.rows } };
    }
    case 'headcount': {
      const r = await db.query(
        `SELECT d.label AS department, COUNT(e.id)::int AS count
         FROM departments d LEFT JOIN employees e ON e.department_id = d.id
         GROUP BY d.id, d.label ORDER BY d.label`
      );
      const total = r.rows.reduce((s, row) => s + row.count, 0);
      return { intent, data: { departments: r.rows, total } };
    }
    case 'certMissing': {
      const r = await db.query(
        `SELECT e.first_name || ' ' || e.last_name AS name, e.role, d.label AS department
         FROM employees e JOIN departments d ON e.department_id = d.id
         WHERE e.leadership_cert = false ORDER BY d.label, e.first_name`
      );
      return { intent, data: { count: r.rows.length, employees: r.rows } };
    }
    case 'newJoiners': {
      const r = await db.query(
        `SELECT e.first_name || ' ' || e.last_name AS name, e.role, d.label AS department,
                e.hire_date
         FROM employees e JOIN departments d ON e.department_id = d.id
         WHERE e.hire_date >= CURRENT_DATE - INTERVAL '1 year'
         ORDER BY e.hire_date DESC`
      );
      return { intent, data: { count: r.rows.length, employees: r.rows } };
    }
    default:
      return null;
  }
}

router.post('/chat', async (req, res) => {
  try {
    let { kind, empId, question } = req.body;

    if (empId !== undefined && empId !== null) {
      empId = parseInt(empId, 10);
      if (isNaN(empId)) return res.status(400).json({ error: 'Invalid empId' });
    }

    const needsEmployee = ['attendance','balance','policy','manager','tenure'].includes(kind);

    if (kind === 'freetext') {
      const classified = await classifyIntent(question || '');
      kind = classified.intent;

      if (kind === 'unknown') {
        return res.json({
          reply: "I can help with pending requests, attendance records, leave balances, policy checks, manager lookups, and tenure info. Try one of the suggestion chips, or mention what you'd like to check.",
          needsEmployee: false,
        });
      }

      if (['attendance','balance','policy','manager','tenure'].includes(kind) && !empId) {
        if (classified.employeeName) {
          const nameSearch = classified.employeeName.toLowerCase().split(' ');
          let query = 'SELECT id FROM employees WHERE TRUE';
          const params = [];
          nameSearch.forEach((part, i) => {
            params.push(`%${part}%`);
            query += ` AND (lower(first_name) LIKE $${i+1} OR lower(last_name) LIKE $${i+1})`;
          });
          const found = await db.query(query, params);
          if (found.rows.length === 1) {
            empId = found.rows[0].id;
          } else {
            return res.json({ reply: null, needsEmployee: true, suggestedIntent: kind });
          }
        } else {
          return res.json({ reply: null, needsEmployee: true, suggestedIntent: kind });
        }
      }
    }

    if (needsEmployee && !empId) {
      return res.json({ reply: null, needsEmployee: true, suggestedIntent: kind });
    }

    const result = await handleIntent(kind, empId);
    if (!result) {
      return res.json({ reply: "I couldn't find the information for that request.", needsEmployee: false });
    }

    const reply = await generateChatReply(result.intent, result.data);
    res.json({ reply, needsEmployee: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
