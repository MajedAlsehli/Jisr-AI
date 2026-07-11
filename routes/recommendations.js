const express = require('express');
const router = express.Router();
const db = require('../db');
const { generateRecRationale } = require('../services/openai');

function scoreOverlap(text1, text2) {
  const words1 = new Set(text1.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3));
  const words2 = text2.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3);
  return words2.filter(w => words1.has(w)).length;
}

function pctFromScore(score, rank) {
  const ranges = [[75, 90], [65, 79], [55, 68]];
  const [min, max] = ranges[rank] || [50, 60];
  const bonus = Math.min(score * 3, max - min);
  return Math.round(min + bonus);
}

function relLabel(pct) {
  if (pct >= 80) return 'High';
  if (pct >= 65) return 'Medium';
  return 'Low';
}

router.get('/:empId', async (req, res) => {
  try {
    const empId = parseInt(req.params.empId, 10);
    if (isNaN(empId)) return res.status(400).json({ error: 'Invalid empId' });

    const existing = await db.query(
      `SELECT r.id, c.title AS course_title, c.description AS course_description,
              r.relevance_pct, r.ai_rationale, r.hr_status,
              r.forwarded_to_manager_at, r.manager_presented_at, r.request_ref
       FROM recommendations r JOIN courses c ON r.course_id = c.id
       WHERE r.employee_id = $1
       ORDER BY r.id`,
      [empId]
    );

    if (existing.rows.length > 0) {
      const allDone = existing.rows.every(r => r.hr_status === 'approved' || r.hr_status === 'rejected');
      if (!allDone) {
        return res.json(formatRecs(existing.rows));
      }
    }

    const empRes = await db.query(
      `SELECT e.first_name, e.last_name, e.role, d.key AS dept_key, e.manager_name
       FROM employees e JOIN departments d ON e.department_id = d.id
       WHERE e.id = $1`,
      [empId]
    );
    if (!empRes.rows.length) return res.status(404).json({ error: 'Employee not found' });
    const emp = empRes.rows[0];
    const empName = `${emp.first_name} ${emp.last_name}`;

    const reviewRes = await db.query(
      'SELECT notes FROM performance_reviews WHERE employee_id = $1 ORDER BY id DESC LIMIT 1',
      [empId]
    );
    const reviewNotes = reviewRes.rows[0]?.notes || '';

    const coursesRes = await db.query(
      'SELECT id, title, description FROM courses WHERE department_key = $1',
      [emp.dept_key]
    );

    const scored = coursesRes.rows.map(c => ({
      ...c,
      score: scoreOverlap(reviewNotes, c.title + ' ' + c.description),
    })).sort((a, b) => b.score - a.score).slice(0, 3);

    await db.query('DELETE FROM recommendations WHERE employee_id = $1', [empId]);

    const inserted = [];
    for (let i = 0; i < scored.length; i++) {
      const c = scored[i];
      const pct = pctFromScore(c.score, i);
      const rationale = await generateRecRationale(empName, emp.role, reviewNotes, c.title, c.description);
      const ins = await db.query(
        `INSERT INTO recommendations (employee_id, course_id, relevance_pct, ai_rationale, hr_status)
         VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
        [empId, c.id, pct, rationale]
      );
      inserted.push({
        id: ins.rows[0].id,
        course_title: c.title,
        course_description: c.description,
        relevance_pct: pct,
        ai_rationale: rationale,
        hr_status: 'pending',
        forwarded_to_manager_at: null,
        manager_presented_at: null,
        request_ref: null,
      });
    }

    res.json(formatRecs(inserted));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

function formatRecs(rows) {
  return rows.map(r => ({
    id: r.id,
    courseTitle: r.course_title,
    courseDescription: r.course_description,
    relevancePct: r.relevance_pct,
    rel: relLabel(r.relevance_pct),
    aiRationale: r.ai_rationale,
    hrStatus: r.hr_status,
    forwardedToManagerAt: r.forwarded_to_manager_at,
    managerPresentedAt: r.manager_presented_at,
    requestRef: r.request_ref,
  }));
}

router.put('/:id/approve', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    await db.query("UPDATE recommendations SET hr_status = 'approved' WHERE id = $1", [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/reject', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    await db.query("UPDATE recommendations SET hr_status = 'rejected' WHERE id = $1", [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/forward', async (req, res) => {
  try {
    const empId = parseInt(req.body.empId, 10);
    if (isNaN(empId)) return res.status(400).json({ error: 'Invalid empId' });
    const requestRef = 'DEV-' + Math.floor(1000 + Math.random() * 9000);
    await db.query(
      `UPDATE recommendations SET forwarded_to_manager_at = NOW(), request_ref = $1
       WHERE employee_id = $2 AND hr_status = 'approved'`,
      [requestRef, empId]
    );
    res.json({ requestRef });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/present', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    await db.query('UPDATE recommendations SET manager_presented_at = NOW() WHERE id = $1', [id]);

    const recRes = await db.query(
      `SELECT e.first_name || ' ' || e.last_name AS emp_name, e.manager_name, c.title
       FROM recommendations r
       JOIN employees e ON r.employee_id = e.id
       JOIN courses c ON r.course_id = c.id
       WHERE r.id = $1`,
      [id]
    );
    if (recRes.rows.length) {
      const { emp_name, manager_name } = recRes.rows[0];
      await db.query(
        "INSERT INTO notifications (message, meta) VALUES ($1, $2)",
        [
          `Development plan presented to ${emp_name} by ${manager_name}.`,
          `Employee: ${emp_name} · Manager: ${manager_name}`,
        ]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
