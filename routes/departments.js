const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res) => {
  try {
    const depts = await db.query('SELECT id, key, label, manager_name FROM departments ORDER BY id');
    const emps = await db.query(
      `SELECT e.id, e.emp_key, e.first_name, e.last_name, e.role, d.key as dept_key
       FROM employees e JOIN departments d ON e.department_id = d.id
       ORDER BY e.first_name, e.last_name`
    );

    const empsByDept = {};
    for (const e of emps.rows) {
      if (!empsByDept[e.dept_key]) empsByDept[e.dept_key] = [];
      empsByDept[e.dept_key].push({
        id: e.id,
        emp_key: e.emp_key,
        first_name: e.first_name,
        last_name: e.last_name,
        role: e.role,
      });
    }

    const result = depts.rows.map(d => ({
      ...d,
      employees: empsByDept[d.key] || [],
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.get('/:key/employees', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT e.id, e.emp_key, e.first_name, e.last_name, e.role, e.manager_name
       FROM employees e JOIN departments d ON e.department_id = d.id
       WHERE d.key = $1
       ORDER BY e.first_name, e.last_name`,
      [req.params.key]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
