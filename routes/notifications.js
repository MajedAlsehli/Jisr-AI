const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, message, meta, created_at, read FROM notifications ORDER BY created_at DESC LIMIT 50'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { message, meta } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });
    const result = await db.query(
      'INSERT INTO notifications (message, meta) VALUES ($1, $2) RETURNING id, message, meta, created_at, read',
      [message, meta || '']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
