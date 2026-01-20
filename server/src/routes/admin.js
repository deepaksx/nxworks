const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { generateQuestions, regenerateQuestion } = require('../services/questionGenerator');
const { generateChecklistsForSession } = require('../services/checklistGenerator');

// ============================================
// Global Workshop Config Endpoints
// ============================================

// Get global workshop config
router.get('/config', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM global_workshop_config WHERE id = 1');
    if (result.rows.length === 0) {
      return res.json({
        id: 1,
        workshop_name: 'S/4HANA Pre-Discovery Workshop',
        client_name: '',
        start_date: null,
        end_date: null,
        industry_context: '',
        custom_instructions: '',
        questions_per_session: 30,
        generation_status: 'not_generated'
      });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching workshop config:', error);
    res.status(500).json({ error: 'Failed to fetch workshop config' });
  }
});

// Update global workshop config
router.post('/config', async (req, res) => {
  try {
    const {
      workshop_name,
      client_name,
      start_date,
      end_date,
      industry_context,
      custom_instructions,
      questions_per_session
    } = req.body;

    const result = await db.query(`
      UPDATE global_workshop_config SET
        workshop_name = COALESCE($1, workshop_name),
        client_name = $2,
        start_date = $3,
        end_date = $4,
        industry_context = $5,
        custom_instructions = $6,
        questions_per_session = COALESCE($7, 30),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
      RETURNING *
    `, [workshop_name, client_name, start_date, end_date,
        industry_context, custom_instructions, questions_per_session]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error saving workshop config:', error);
    res.status(500).json({ error: 'Failed to save workshop config' });
  }
});

// ============================================
// Entities Endpoints
// ============================================

// Get all entities
router.get('/entities', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM entities ORDER BY id');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching entities:', error);
    res.status(500).json({ error: 'Failed to fetch entities' });
  }
});

// Create entity
router.post('/entities', async (req, res) => {
  try {
    const { code, name, description, industry, sector, business_context } = req.body;

    if (!code || !name) {
      return res.status(400).json({ error: 'Code and name are required' });
    }

    const result = await db.query(`
      INSERT INTO entities (code, name, description, industry, sector, business_context)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [code, name, description, industry, sector, business_context]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating entity:', error);
    res.status(500).json({ error: 'Failed to create entity' });
  }
});

// Update entity
router.put('/entities/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { code, name, description, industry, sector, business_context } = req.body;

    const result = await db.query(`
      UPDATE entities SET
        code = COALESCE($1, code),
        name = COALESCE($2, name),
        description = COALESCE($3, description),
        industry = $4,
        sector = $5,
        business_context = $6
      WHERE id = $7
      RETURNING *
    `, [code, name, description, industry, sector, business_context, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating entity:', error);
    res.status(500).json({ error: 'Failed to update entity' });
  }
});

// Delete entity
router.delete('/entities/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM entities WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    res.json({ success: true, deleted_id: result.rows[0].id });
  } catch (error) {
    console.error('Error deleting entity:', error);
    res.status(500).json({ error: 'Failed to delete entity' });
  }
});

// ============================================
// Global Audience Profiles Endpoints
// ============================================

// Get all audience profiles
router.get('/audience', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM global_audience_profiles ORDER BY id');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching audience profiles:', error);
    res.status(500).json({ error: 'Failed to fetch audience profiles' });
  }
});

// Add audience profile
router.post('/audience', async (req, res) => {
  try {
    const { department, typical_roles, key_concerns } = req.body;

    if (!department) {
      return res.status(400).json({ error: 'Department is required' });
    }

    const result = await db.query(`
      INSERT INTO global_audience_profiles (department, typical_roles, key_concerns)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [department, typical_roles, key_concerns]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding audience profile:', error);
    res.status(500).json({ error: 'Failed to add audience profile' });
  }
});

// Delete audience profile
router.delete('/audience/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'DELETE FROM global_audience_profiles WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Audience profile not found' });
    }

    res.json({ success: true, deleted_id: result.rows[0].id });
  } catch (error) {
    console.error('Error deleting audience profile:', error);
    res.status(500).json({ error: 'Failed to delete audience profile' });
  }
});

// ============================================
// Sessions Management Endpoints
// ============================================

// Get all sessions for admin
router.get('/sessions', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT s.*,
        COUNT(DISTINCT q.id) as total_questions,
        COUNT(DISTINCT gq.id) as generated_questions_count
      FROM sessions s
      LEFT JOIN questions q ON s.id = q.session_id
      LEFT JOIN generated_questions gq ON s.id = gq.session_id
      GROUP BY s.id
      ORDER BY s.session_number
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Create session
router.post('/sessions', async (req, res) => {
  try {
    const {
      session_number,
      name,
      description,
      module,
      lead_consultant,
      scheduled_date,
      start_time,
      end_time,
      duration,
      agenda,
      question_count
    } = req.body;

    if (!name || !module) {
      return res.status(400).json({ error: 'Name and module are required' });
    }

    // Get next session number if not provided
    let sessNum = session_number;
    if (!sessNum) {
      const maxResult = await db.query('SELECT COALESCE(MAX(session_number), 0) + 1 as next_num FROM sessions');
      sessNum = maxResult.rows[0].next_num;
    }

    const result = await db.query(`
      INSERT INTO sessions (
        session_number, name, description, module, lead_consultant,
        scheduled_date, start_time, end_time, duration, agenda, question_count, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'not_started')
      RETURNING *
    `, [sessNum, name, description, module, lead_consultant,
        scheduled_date, start_time, end_time, duration, agenda, question_count || 30]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Update session
router.put('/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      session_number,
      name,
      description,
      module,
      lead_consultant,
      scheduled_date,
      start_time,
      end_time,
      duration,
      agenda,
      question_count,
      status
    } = req.body;

    const result = await db.query(`
      UPDATE sessions SET
        session_number = COALESCE($1, session_number),
        name = COALESCE($2, name),
        description = COALESCE($3, description),
        module = COALESCE($4, module),
        lead_consultant = $5,
        scheduled_date = $6,
        start_time = $7,
        end_time = $8,
        duration = $9,
        agenda = $10,
        question_count = COALESCE($11, question_count),
        status = COALESCE($12, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $13
      RETURNING *
    `, [session_number, name, description, module, lead_consultant,
        scheduled_date, start_time, end_time, duration, agenda, question_count, status, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating session:', error);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// Delete session
router.delete('/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM sessions WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ success: true, deleted_id: result.rows[0].id });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// ============================================
// AI Question Generation Endpoints
// ============================================

// Generate questions for ALL sessions
router.post('/generate-all', async (req, res) => {
  try {
    // Get global config
    const configResult = await db.query('SELECT * FROM global_workshop_config WHERE id = 1');
    const config = configResult.rows[0] || {};

    // Get all entities
    const entitiesResult = await db.query('SELECT * FROM entities ORDER BY id');
    const entities = entitiesResult.rows;

    // Get all audience profiles
    const audienceResult = await db.query('SELECT * FROM global_audience_profiles ORDER BY id');
    const audience = audienceResult.rows;

    // Get all sessions
    const sessionsResult = await db.query('SELECT * FROM sessions ORDER BY session_number');
    const sessions = sessionsResult.rows;

    if (sessions.length === 0) {
      return res.status(400).json({ error: 'No sessions to generate questions for. Create sessions first.' });
    }

    // Update global status to generating
    await db.query(`
      UPDATE global_workshop_config SET
        generation_status = 'generating',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `);

    let totalGenerated = 0;
    const results = [];

    try {
      for (const session of sessions) {
        // Clear previous generated questions for this session
        await db.query('DELETE FROM generated_questions WHERE session_id = $1', [session.id]);

        // Generate questions for this session (use session's question_count, fallback to config)
        const generatedQuestions = await generateQuestions({
          agenda: session.agenda || session.description,
          entities,
          audience,
          module: session.module,
          targetCount: session.question_count || config.questions_per_session || 30,
          industryContext: config.industry_context,
          customInstructions: config.custom_instructions,
          sessionName: session.name
        });

        // Insert generated questions
        for (const q of generatedQuestions) {
          let entityId = null;
          if (q.entity_code) {
            const entityMatch = entities.find(
              e => e.code.toUpperCase() === q.entity_code.toUpperCase()
            );
            if (entityMatch) entityId = entityMatch.id;
          }

          await db.query(`
            INSERT INTO generated_questions (
              session_id, entity_id, question_number, question_text,
              category_name, is_critical, ai_rationale, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
          `, [session.id, entityId, q.question_number, q.question_text,
              q.category_name, q.is_critical, q.ai_rationale]);
        }

        // Mark session as having generated questions
        await db.query(
          'UPDATE sessions SET questions_generated = TRUE WHERE id = $1',
          [session.id]
        );

        totalGenerated += generatedQuestions.length;
        results.push({
          session_id: session.id,
          session_name: session.name,
          questions_generated: generatedQuestions.length
        });
      }

      // Update global status to completed
      await db.query(`
        UPDATE global_workshop_config SET
          generation_status = 'completed',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `);

      res.json({
        success: true,
        total_questions: totalGenerated,
        sessions_processed: sessions.length,
        details: results,
        message: `Successfully generated ${totalGenerated} questions across ${sessions.length} sessions`
      });
    } catch (genError) {
      // Update global status to failed
      await db.query(`
        UPDATE global_workshop_config SET
          generation_status = 'failed',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `);
      throw genError;
    }
  } catch (error) {
    console.error('Error generating questions:', error);
    res.status(500).json({ error: 'Failed to generate questions: ' + error.message });
  }
});

// Generate questions for a single session (directly to production)
router.post('/generate/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Get session
    const sessionResult = await db.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const session = sessionResult.rows[0];

    // Get global config
    const configResult = await db.query('SELECT * FROM global_workshop_config WHERE id = 1');
    const config = configResult.rows[0] || {};

    // Get all entities
    const entitiesResult = await db.query('SELECT * FROM entities ORDER BY id');
    const entities = entitiesResult.rows;

    // Generate questions (use session's question_count, fallback to config)
    const generatedQuestions = await generateQuestions({
      agenda: session.agenda || session.description,
      entities,
      audience: [],
      module: session.module,
      targetCount: session.question_count || config.questions_per_session || 30,
      industryContext: config.industry_context,
      customInstructions: config.custom_instructions,
      sessionName: session.name
    });

    // Delete existing questions for this session
    await db.query('DELETE FROM questions WHERE session_id = $1', [sessionId]);

    // Insert questions directly into production questions table
    for (const q of generatedQuestions) {
      let entityId = null;
      if (q.entity_code) {
        const entityMatch = entities.find(
          e => e.code.toUpperCase() === q.entity_code.toUpperCase()
        );
        if (entityMatch) entityId = entityMatch.id;
      }

      await db.query(`
        INSERT INTO questions (
          session_id, entity_id, question_number, question_text,
          category_name, is_critical, sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [sessionId, entityId, q.question_number, q.question_text,
          q.category_name, q.is_critical, q.question_number]);
    }

    // Mark session as having generated questions
    await db.query('UPDATE sessions SET questions_generated = TRUE WHERE id = $1', [sessionId]);

    res.json({
      success: true,
      count: generatedQuestions.length,
      message: `Successfully generated ${generatedQuestions.length} questions for ${session.name}.`
    });
  } catch (error) {
    console.error('Error generating questions:', error);
    res.status(500).json({ error: 'Failed to generate questions: ' + error.message });
  }
});

// Get generated questions for a session
router.get('/generated/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { status } = req.query;

    let query = `
      SELECT gq.*, e.code as entity_code, e.name as entity_name
      FROM generated_questions gq
      LEFT JOIN entities e ON gq.entity_id = e.id
      WHERE gq.session_id = $1
    `;
    const params = [sessionId];

    if (status) {
      query += ' AND gq.status = $2';
      params.push(status);
    }

    query += ' ORDER BY gq.question_number';

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching generated questions:', error);
    res.status(500).json({ error: 'Failed to fetch generated questions' });
  }
});

// Get all generated questions (for review)
router.get('/generated', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT gq.*, e.code as entity_code, e.name as entity_name,
             s.name as session_name, s.module as session_module
      FROM generated_questions gq
      LEFT JOIN entities e ON gq.entity_id = e.id
      JOIN sessions s ON gq.session_id = s.id
      ORDER BY s.session_number, gq.question_number
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching all generated questions:', error);
    res.status(500).json({ error: 'Failed to fetch generated questions' });
  }
});

// Update generated question
router.put('/generated/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, question_text, category_name, is_critical, entity_id } = req.body;

    const result = await db.query(`
      UPDATE generated_questions SET
        status = COALESCE($1, status),
        question_text = COALESCE($2, question_text),
        category_name = COALESCE($3, category_name),
        is_critical = COALESCE($4, is_critical),
        entity_id = COALESCE($5, entity_id)
      WHERE id = $6
      RETURNING *
    `, [status, question_text, category_name, is_critical, entity_id, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Generated question not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating generated question:', error);
    res.status(500).json({ error: 'Failed to update generated question' });
  }
});

// Bulk update generated questions
router.post('/generated/bulk-update', async (req, res) => {
  try {
    const { ids, status } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Question IDs are required' });
    }

    const result = await db.query(`
      UPDATE generated_questions
      SET status = $1
      WHERE id = ANY($2::int[])
      RETURNING id
    `, [status, ids]);

    res.json({ success: true, updated_count: result.rows.length });
  } catch (error) {
    console.error('Error bulk updating questions:', error);
    res.status(500).json({ error: 'Failed to bulk update questions' });
  }
});

// Publish ALL approved questions to production
router.post('/publish-all', async (req, res) => {
  try {
    // Get all approved questions grouped by session
    const approvedResult = await db.query(`
      SELECT gq.*, s.id as session_id
      FROM generated_questions gq
      JOIN sessions s ON gq.session_id = s.id
      WHERE gq.status = 'approved'
      ORDER BY s.session_number, gq.question_number
    `);

    if (approvedResult.rows.length === 0) {
      return res.status(400).json({ error: 'No approved questions to publish' });
    }

    // Group by session
    const bySession = {};
    for (const q of approvedResult.rows) {
      if (!bySession[q.session_id]) bySession[q.session_id] = [];
      bySession[q.session_id].push(q);
    }

    let totalPublished = 0;
    let totalDeleted = 0;

    for (const sessionId of Object.keys(bySession)) {
      const questions = bySession[sessionId];

      // Delete ALL existing questions for this session first
      const deleteResult = await db.query(
        'DELETE FROM questions WHERE session_id = $1 RETURNING id',
        [sessionId]
      );
      totalDeleted += deleteResult.rows.length;

      // Insert new questions starting from 1
      let questionNum = 1;

      for (const q of questions) {
        await db.query(`
          INSERT INTO questions (
            session_id, entity_id, question_number, question_text,
            category_name, is_critical, sort_order
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [sessionId, q.entity_id, questionNum, q.question_text,
            q.category_name, q.is_critical, questionNum]);
        questionNum++;
        totalPublished++;
      }
    }

    // Mark all approved as published
    await db.query(`
      UPDATE generated_questions SET status = 'published' WHERE status = 'approved'
    `);

    res.json({
      success: true,
      published_count: totalPublished,
      deleted_count: totalDeleted,
      message: `Successfully replaced ${totalDeleted} old questions with ${totalPublished} new questions.`
    });
  } catch (error) {
    console.error('Error publishing questions:', error);
    res.status(500).json({ error: 'Failed to publish questions' });
  }
});

// Manually generate initial checklists for a session
router.post('/generate-checklists/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    console.log(`Manual checklist generation requested for session ${sessionId}`);

    const result = await generateChecklistsForSession(parseInt(sessionId));

    res.json({
      success: true,
      ...result,
      message: `Generated checklists: ${result.successCount} success, ${result.errorCount} errors out of ${result.total} questions`
    });
  } catch (error) {
    console.error('Error generating checklists:', error);
    res.status(500).json({ error: 'Failed to generate checklists: ' + error.message });
  }
});

// Regenerate a single question
router.post('/generated/:id/regenerate', async (req, res) => {
  try {
    const { id } = req.params;
    const { feedback } = req.body;

    const questionResult = await db.query(`
      SELECT gq.*, s.module, s.name as session_name, e.code as entity_code
      FROM generated_questions gq
      JOIN sessions s ON gq.session_id = s.id
      LEFT JOIN entities e ON gq.entity_id = e.id
      WHERE gq.id = $1
    `, [id]);

    if (questionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const original = questionResult.rows[0];

    const newQuestion = await regenerateQuestion({
      originalQuestion: original.question_text,
      feedback,
      module: original.module,
      entityContext: original.entity_code,
      audienceContext: null
    });

    const updateResult = await db.query(`
      UPDATE generated_questions SET
        question_text = $1,
        category_name = COALESCE($2, category_name),
        is_critical = COALESCE($3, is_critical),
        ai_rationale = COALESCE($4, ai_rationale),
        status = 'pending'
      WHERE id = $5
      RETURNING *
    `, [newQuestion.question_text, newQuestion.category_name,
        newQuestion.is_critical, newQuestion.rationale, id]);

    res.json(updateResult.rows[0]);
  } catch (error) {
    console.error('Error regenerating question:', error);
    res.status(500).json({ error: 'Failed to regenerate question: ' + error.message });
  }
});

module.exports = router;
