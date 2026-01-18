const express = require('express');
const router = express.Router();
const db = require('../models/db');

// Get questions for a session with optional entity filter
router.get('/', async (req, res) => {
  try {
    const { session_id, entity_id, category_id, search, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (session_id) {
      whereConditions.push(`q.session_id = $${paramIndex++}`);
      params.push(session_id);
    }

    if (entity_id) {
      whereConditions.push(`q.entity_id = $${paramIndex++}`);
      params.push(entity_id);
    }

    if (category_id) {
      whereConditions.push(`q.category_id = $${paramIndex++}`);
      params.push(category_id);
    }

    if (search) {
      whereConditions.push(`q.question_text ILIKE $${paramIndex++}`);
      params.push(`%${search}%`);
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    const questionsResult = await db.query(`
      SELECT
        q.*,
        e.code as entity_code,
        e.name as entity_name,
        c.name as category_name,
        a.id as answer_id,
        a.text_response,
        a.status as answer_status,
        a.respondent_name,
        a.updated_at as answer_updated_at,
        (SELECT COUNT(*) FROM audio_recordings ar WHERE ar.answer_id = a.id) as audio_count,
        (SELECT COUNT(*) FROM documents d WHERE d.answer_id = a.id) as document_count
      FROM questions q
      LEFT JOIN entities e ON q.entity_id = e.id
      LEFT JOIN categories c ON q.category_id = c.id
      LEFT JOIN answers a ON q.id = a.question_id
      ${whereClause}
      ORDER BY q.entity_id, q.question_number
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, [...params, limit, offset]);

    // Get total count
    const countResult = await db.query(`
      SELECT COUNT(*) as total
      FROM questions q
      ${whereClause}
    `, params);

    res.json({
      questions: questionsResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        totalPages: Math.ceil(countResult.rows[0].total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

// Get single question with full details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const questionResult = await db.query(`
      SELECT
        q.*,
        e.code as entity_code,
        e.name as entity_name,
        s.name as session_name,
        s.module as session_module
      FROM questions q
      LEFT JOIN entities e ON q.entity_id = e.id
      LEFT JOIN sessions s ON q.session_id = s.id
      WHERE q.id = $1
    `, [id]);

    if (questionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    // Get answer if exists
    const answerResult = await db.query(`
      SELECT * FROM answers WHERE question_id = $1
    `, [id]);

    // Get audio recordings if answer exists
    let audioRecordings = [];
    let documents = [];

    if (answerResult.rows.length > 0) {
      const audioResult = await db.query(`
        SELECT * FROM audio_recordings WHERE answer_id = $1 ORDER BY created_at DESC
      `, [answerResult.rows[0].id]);
      audioRecordings = audioResult.rows;

      const docsResult = await db.query(`
        SELECT * FROM documents WHERE answer_id = $1 ORDER BY created_at DESC
      `, [answerResult.rows[0].id]);
      documents = docsResult.rows;
    }

    // Get adjacent questions for navigation
    const question = questionResult.rows[0];
    const prevResult = await db.query(`
      SELECT id, question_number FROM questions
      WHERE session_id = $1 AND entity_id = $2 AND question_number < $3
      ORDER BY question_number DESC LIMIT 1
    `, [question.session_id, question.entity_id, question.question_number]);

    const nextResult = await db.query(`
      SELECT id, question_number FROM questions
      WHERE session_id = $1 AND entity_id = $2 AND question_number > $3
      ORDER BY question_number ASC LIMIT 1
    `, [question.session_id, question.entity_id, question.question_number]);

    res.json({
      ...question,
      answer: answerResult.rows[0] || null,
      audioRecordings,
      documents,
      navigation: {
        previous: prevResult.rows[0] || null,
        next: nextResult.rows[0] || null
      }
    });
  } catch (error) {
    console.error('Error fetching question:', error);
    res.status(500).json({ error: 'Failed to fetch question' });
  }
});

// Get questions by category for a session
router.get('/session/:sessionId/by-category', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { entity_id } = req.query;

    let whereClause = 'WHERE q.session_id = $1';
    let params = [sessionId];

    if (entity_id) {
      whereClause += ' AND q.entity_id = $2';
      params.push(entity_id);
    }

    const result = await db.query(`
      SELECT
        q.category_name,
        q.entity_id,
        e.code as entity_code,
        json_agg(
          json_build_object(
            'id', q.id,
            'question_number', q.question_number,
            'question_text', q.question_text,
            'is_critical', q.is_critical,
            'answer_status', a.status
          ) ORDER BY q.question_number
        ) as questions
      FROM questions q
      LEFT JOIN entities e ON q.entity_id = e.id
      LEFT JOIN answers a ON q.id = a.question_id
      ${whereClause}
      GROUP BY q.category_name, q.entity_id, e.code
      ORDER BY q.entity_id, MIN(q.question_number)
    `, params);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching questions by category:', error);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

module.exports = router;
