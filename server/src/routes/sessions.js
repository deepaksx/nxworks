const express = require('express');
const router = express.Router();
const db = require('../models/db');

// Get all sessions with progress stats
router.get('/', async (req, res) => {
  try {
    const sessionsResult = await db.query(`
      SELECT
        s.*,
        COUNT(DISTINCT q.id) as total_questions,
        COUNT(DISTINCT CASE WHEN a.status = 'completed' THEN a.question_id END) as answered_questions
      FROM sessions s
      LEFT JOIN questions q ON s.id = q.session_id
      LEFT JOIN answers a ON q.id = a.question_id
      GROUP BY s.id
      ORDER BY s.session_number
    `);
    res.json(sessionsResult.rows);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Get single session with details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const sessionResult = await db.query(`
      SELECT s.*, w.name as workshop_name
      FROM sessions s
      LEFT JOIN workshops w ON s.workshop_id = w.id
      WHERE s.id = $1
    `, [id]);

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get entities for this session's workshop
    const session = sessionResult.rows[0];
    const entitiesResult = await db.query(`
      SELECT e.*
      FROM entities e
      WHERE e.workshop_id = $1
      ORDER BY e.id
    `, [session.workshop_id]);

    res.json({
      ...session,
      entities: entitiesResult.rows
    });
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// Update session status
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const result = await db.query(
      'UPDATE sessions SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating session:', error);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// Get session progress
router.get('/:id/progress', async (req, res) => {
  try {
    const { id } = req.params;

    // Get progress by entity
    const entityProgressResult = await db.query(`
      SELECT
        e.id as entity_id,
        e.code as entity_code,
        e.name as entity_name,
        COUNT(q.id) as total_questions,
        COUNT(CASE WHEN a.status = 'completed' THEN 1 END) as answered_questions,
        COUNT(CASE WHEN a.status = 'in_progress' THEN 1 END) as in_progress_questions
      FROM entities e
      JOIN questions q ON e.id = q.entity_id AND q.session_id = $1
      LEFT JOIN answers a ON q.id = a.question_id
      GROUP BY e.id, e.code, e.name
      ORDER BY e.id
    `, [id]);

    // Get count of questions without entity (general questions)
    const generalProgressResult = await db.query(`
      SELECT
        COUNT(q.id) as total_questions,
        COUNT(CASE WHEN a.status = 'completed' THEN 1 END) as answered_questions,
        COUNT(CASE WHEN a.status = 'in_progress' THEN 1 END) as in_progress_questions
      FROM questions q
      LEFT JOIN answers a ON q.id = a.question_id
      WHERE q.session_id = $1 AND q.entity_id IS NULL
    `, [id]);

    // Get total count for "All" tab
    const totalProgressResult = await db.query(`
      SELECT
        COUNT(q.id) as total_questions,
        COUNT(CASE WHEN a.status = 'completed' THEN 1 END) as answered_questions,
        COUNT(CASE WHEN a.status = 'in_progress' THEN 1 END) as in_progress_questions
      FROM questions q
      LEFT JOIN answers a ON q.id = a.question_id
      WHERE q.session_id = $1
    `, [id]);

    const result = [...entityProgressResult.rows];

    // Add general questions if any exist
    const generalCount = parseInt(generalProgressResult.rows[0].total_questions) || 0;
    if (generalCount > 0) {
      result.push({
        entity_id: null,
        entity_code: 'General',
        entity_name: 'General Questions',
        total_questions: generalCount,
        answered_questions: parseInt(generalProgressResult.rows[0].answered_questions) || 0,
        in_progress_questions: parseInt(generalProgressResult.rows[0].in_progress_questions) || 0
      });
    }

    // Add total summary
    const totalSummary = {
      total_questions: parseInt(totalProgressResult.rows[0].total_questions) || 0,
      answered_questions: parseInt(totalProgressResult.rows[0].answered_questions) || 0,
      in_progress_questions: parseInt(totalProgressResult.rows[0].in_progress_questions) || 0
    };

    res.json({
      entities: result,
      summary: totalSummary
    });
  } catch (error) {
    console.error('Error fetching progress:', error);
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

module.exports = router;
