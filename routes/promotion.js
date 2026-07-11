const express = require('express');
const router = express.Router();
const db = require('../db');
const { generatePromoNote } = require('../services/openai');

const FACTORS = [
  { key: 'performance_rating_met', label: 'Performance rating vs. target', weight: 20 },
  { key: 'goal_achievement_met', label: 'Goal achievement (last 2 cycles)', weight: 20 },
  { key: 'leadership_cert', label: 'Leadership certification', weight: 20 },
  { key: 'tenure_met', label: 'Minimum tenure in role (per policy)', weight: 15 },
  { key: 'attendance_met', label: 'Attendance record', weight: 12 },
  { key: 'feedback_met', label: 'Manager & peer feedback', weight: 13 },
];

router.get('/:empId', async (req, res) => {
  try {
    const empId = parseInt(req.params.empId, 10);
    if (isNaN(empId)) return res.status(400).json({ error: 'Invalid empId' });

    const empRes = await db.query(
      `SELECT e.first_name, e.last_name, e.role, e.manager_name, e.role_start_date,
              e.leadership_cert, e.performance_rating_met, e.goal_achievement_met,
              e.manager_feedback_positive, e.peer_feedback_positive
       FROM employees e WHERE e.id = $1`,
      [empId]
    );
    if (!empRes.rows.length) return res.status(404).json({ error: 'Employee not found' });
    const emp = empRes.rows[0];
    const empName = `${emp.first_name} ${emp.last_name}`;

    const attRes = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('present','late')) AS present_late,
         COUNT(*) AS total
       FROM attendance_records
       WHERE employee_id = $1 AND date BETWEEN '2025-07-01' AND '2025-09-30'`,
      [empId]
    );
    const attRow = attRes.rows[0];
    const presentLate = parseInt(attRow.present_late || 0);
    const total = parseInt(attRow.total || 1);
    const attPct = total > 0 ? (presentLate / total) * 100 : 0;
    const attendanceMet = attPct >= 90;

    const roleStartDate = new Date(emp.role_start_date);
    const tenureYears = (Date.now() - roleStartDate.getTime()) / (365.25 * 24 * 3600 * 1000);
    const tenureMet = tenureYears >= 2;

    const feedbackMet = emp.manager_feedback_positive && emp.peer_feedback_positive;

    const factorValues = {
      performance_rating_met: emp.performance_rating_met,
      goal_achievement_met: emp.goal_achievement_met,
      leadership_cert: emp.leadership_cert,
      tenure_met: tenureMet,
      attendance_met: attendanceMet,
      feedback_met: feedbackMet,
    };

    const factors = FACTORS.map(f => ({
      label: f.label,
      met: factorValues[f.key],
      weight: f.weight,
    }));

    const score = factors.reduce((sum, f) => sum + (f.met ? f.weight : 0), 0);
    const ready = score >= 88;

    const note = await generatePromoNote(empName, emp.role, factors, score, ready);

    res.json({
      score,
      ready,
      factors,
      note,
      managerName: emp.manager_name,
      empName,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:empId/forward', async (req, res) => {
  try {
    const empId = parseInt(req.params.empId, 10);
    if (isNaN(empId)) return res.status(400).json({ error: 'Invalid empId' });

    const empRes = await db.query(
      'SELECT first_name, last_name, manager_name FROM employees WHERE id = $1',
      [empId]
    );
    if (!empRes.rows.length) return res.status(404).json({ error: 'Employee not found' });
    const emp = empRes.rows[0];
    const empName = `${emp.first_name} ${emp.last_name}`;

    await db.query(
      "INSERT INTO notifications (message, meta) VALUES ($1, $2)",
      [
        `Promotion readiness result for ${empName} forwarded to ${emp.manager_name}.`,
        `Employee: ${empName} · Manager: ${emp.manager_name}`,
      ]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
