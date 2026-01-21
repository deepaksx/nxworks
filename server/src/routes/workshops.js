const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { generateQuestions } = require('../services/questionGenerator');
const { generateChecklistsForSession } = require('../services/checklistGenerator');
const { generateDirectChecklist, saveChecklistItems } = require('../services/directChecklistGenerator');

// ============================================
// Workshop CRUD
// ============================================

// Get all workshops
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT w.*,
        COUNT(DISTINCT s.id) as session_count,
        COUNT(DISTINCT q.id) as question_count
      FROM workshops w
      LEFT JOIN sessions s ON w.id = s.workshop_id
      LEFT JOIN questions q ON s.id = q.session_id
      GROUP BY w.id
      ORDER BY w.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching workshops:', error);
    res.status(500).json({ error: 'Failed to fetch workshops' });
  }
});

// Get single workshop with details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM workshops WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Workshop not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching workshop:', error);
    res.status(500).json({ error: 'Failed to fetch workshop' });
  }
});

// Create workshop
router.post('/', async (req, res) => {
  try {
    const { name, client_name, client_website, industry_context, custom_instructions, questions_per_session, mission_statement } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Workshop name is required' });
    }
    const result = await db.query(`
      INSERT INTO workshops (name, client_name, client_website, industry_context, custom_instructions, questions_per_session, mission_statement)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [name, client_name, client_website, industry_context, custom_instructions, questions_per_session || 30, mission_statement]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating workshop:', error);
    res.status(500).json({ error: 'Failed to create workshop' });
  }
});

// Update workshop
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, client_name, client_website, industry_context, custom_instructions, questions_per_session, status, mission_statement } = req.body;
    const result = await db.query(`
      UPDATE workshops SET
        name = COALESCE($1, name),
        client_name = $2,
        client_website = $3,
        industry_context = $4,
        custom_instructions = $5,
        questions_per_session = COALESCE($6, questions_per_session),
        status = COALESCE($7, status),
        mission_statement = $8,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $9
      RETURNING *
    `, [name, client_name, client_website, industry_context, custom_instructions, questions_per_session, status, mission_statement, id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Workshop not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating workshop:', error);
    res.status(500).json({ error: 'Failed to update workshop' });
  }
});

// Delete workshop
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM workshops WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Workshop not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting workshop:', error);
    res.status(500).json({ error: 'Failed to delete workshop' });
  }
});

// ============================================
// Entities (within workshop)
// ============================================

router.get('/:workshopId/entities', async (req, res) => {
  try {
    const { workshopId } = req.params;
    const result = await db.query('SELECT * FROM entities WHERE workshop_id = $1 ORDER BY id', [workshopId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching entities:', error);
    res.status(500).json({ error: 'Failed to fetch entities' });
  }
});

router.post('/:workshopId/entities', async (req, res) => {
  try {
    const { workshopId } = req.params;
    const { code, name, description, industry, sector, business_context } = req.body;
    if (!code || !name) {
      return res.status(400).json({ error: 'Code and name are required' });
    }
    const result = await db.query(`
      INSERT INTO entities (workshop_id, code, name, description, industry, sector, business_context)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [workshopId, code, name, description, industry, sector, business_context]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating entity:', error);
    res.status(500).json({ error: 'Failed to create entity' });
  }
});

router.put('/:workshopId/entities/:entityId', async (req, res) => {
  try {
    const { entityId } = req.params;
    const { code, name, description, industry, sector, business_context } = req.body;
    const result = await db.query(`
      UPDATE entities SET
        code = COALESCE($1, code),
        name = COALESCE($2, name),
        description = $3,
        industry = $4,
        sector = $5,
        business_context = $6
      WHERE id = $7
      RETURNING *
    `, [code, name, description, industry, sector, business_context, entityId]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating entity:', error);
    res.status(500).json({ error: 'Failed to update entity' });
  }
});

router.delete('/:workshopId/entities/:entityId', async (req, res) => {
  try {
    const { entityId } = req.params;
    await db.query('DELETE FROM entities WHERE id = $1', [entityId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting entity:', error);
    res.status(500).json({ error: 'Failed to delete entity' });
  }
});

// ============================================
// Sessions (within workshop)
// ============================================

router.get('/:workshopId/sessions', async (req, res) => {
  try {
    const { workshopId } = req.params;
    const result = await db.query(`
      SELECT s.*, COUNT(q.id) as question_count
      FROM sessions s
      LEFT JOIN questions q ON s.id = q.session_id
      WHERE s.workshop_id = $1
      GROUP BY s.id
      ORDER BY s.session_number
    `, [workshopId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

router.post('/:workshopId/sessions', async (req, res) => {
  try {
    const { workshopId } = req.params;
    const { name, description, module, agenda, question_count, topics } = req.body;
    if (!name || !module) {
      return res.status(400).json({ error: 'Name and module are required' });
    }
    // Get next session number
    const maxResult = await db.query(
      'SELECT COALESCE(MAX(session_number), 0) + 1 as next_num FROM sessions WHERE workshop_id = $1',
      [workshopId]
    );
    const sessionNumber = maxResult.rows[0].next_num;

    const result = await db.query(`
      INSERT INTO sessions (workshop_id, session_number, name, description, module, agenda, question_count, topics)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [workshopId, sessionNumber, name, description, module, agenda, question_count || 30, topics]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

router.put('/:workshopId/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { name, description, module, agenda, question_count, status, topics } = req.body;
    const result = await db.query(`
      UPDATE sessions SET
        name = COALESCE($1, name),
        description = $2,
        module = COALESCE($3, module),
        agenda = $4,
        question_count = COALESCE($5, question_count),
        status = COALESCE($6, status),
        topics = $7,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING *
    `, [name, description, module, agenda, question_count, status, topics, sessionId]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating session:', error);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

router.delete('/:workshopId/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// ============================================
// Generate Questions for a Session (with SSE progress)
// ============================================

router.get('/:workshopId/sessions/:sessionId/generate-stream', async (req, res) => {
  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { workshopId, sessionId } = req.params;
    const shouldGenerateChecklists = req.query.checklists === 'true'; // Disabled by default

    sendEvent({ phase: 'init', message: 'Starting question generation...' });

    // Get workshop
    const workshopResult = await db.query('SELECT * FROM workshops WHERE id = $1', [workshopId]);
    if (workshopResult.rows.length === 0) {
      sendEvent({ phase: 'error', message: 'Workshop not found' });
      res.end();
      return;
    }
    const workshop = workshopResult.rows[0];

    // Get session
    const sessionResult = await db.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
    if (sessionResult.rows.length === 0) {
      sendEvent({ phase: 'error', message: 'Session not found' });
      res.end();
      return;
    }
    const session = sessionResult.rows[0];

    // Get entities
    const entitiesResult = await db.query('SELECT * FROM entities WHERE workshop_id = $1', [workshopId]);
    const entities = entitiesResult.rows;

    sendEvent({ phase: 'generating', message: 'Generating questions with AI...', progress: 10 });

    // Generate questions
    const generatedQuestions = await generateQuestions({
      agenda: session.agenda || session.description,
      entities,
      audience: [],
      module: session.module,
      targetCount: session.question_count || workshop.questions_per_session || 30,
      industryContext: workshop.industry_context,
      customInstructions: workshop.custom_instructions,
      sessionName: session.name,
      topics: session.topics
    });

    sendEvent({ phase: 'saving', message: `Saving ${generatedQuestions.length} questions...`, progress: 30 });

    // Delete existing questions and related data
    await db.query('DELETE FROM questions WHERE session_id = $1', [sessionId]);

    // Insert new questions
    for (const q of generatedQuestions) {
      let entityId = null;
      if (q.entity_code) {
        const entityMatch = entities.find(e => e.code.toUpperCase() === q.entity_code.toUpperCase());
        if (entityMatch) entityId = entityMatch.id;
      }

      await db.query(`
        INSERT INTO questions (session_id, entity_id, question_number, question_text, category_name, is_critical, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [sessionId, entityId, q.question_number, q.question_text, q.category_name, q.is_critical, q.question_number]);
    }

    await db.query('UPDATE sessions SET questions_generated = TRUE WHERE id = $1', [sessionId]);

    let successCount = 0;
    let errorCount = 0;

    if (shouldGenerateChecklists) {
      sendEvent({ phase: 'checklists', message: 'Generating initial checklists...', progress: 40, questionCount: generatedQuestions.length });

      // Generate checklists with progress updates
      const config = workshop;
      const questionsResult = await db.query(`
        SELECT q.*, e.code as entity_code, e.name as entity_name, e.business_context,
               s.name as session_name, s.module as session_module, s.description as session_description
        FROM questions q
        LEFT JOIN entities e ON q.entity_id = e.id
        LEFT JOIN sessions s ON q.session_id = s.id
        WHERE q.session_id = $1
        ORDER BY q.question_number
      `, [sessionId]);

      const questions = questionsResult.rows;

      for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        const progressPercent = 40 + Math.round((i / questions.length) * 55);

        sendEvent({
          phase: 'checklist',
          message: `Generating checklist for Q${question.question_number}...`,
          progress: progressPercent,
          current: i + 1,
          total: questions.length
        });

        try {
          // Generate checklist for this question
          const { generateChecklistForQuestion } = require('../services/checklistGenerator');
          const checklist = await generateChecklistForQuestion(question, config);

          // Create placeholder answer if none exists
          let answerResult = await db.query('SELECT id FROM answers WHERE question_id = $1', [question.id]);
          let answerId;

          if (answerResult.rows.length === 0) {
            const newAnswer = await db.query(
              'INSERT INTO answers (question_id, status) VALUES ($1, $2) RETURNING id',
              [question.id, 'pending']
            );
            answerId = newAnswer.rows[0].id;
          } else {
            answerId = answerResult.rows[0].id;
          }

          // Save initial observation
          await db.query(`
            INSERT INTO observations (answer_id, observation_number, obtained_info, missing_info, summary, raw_observation)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [
            answerId,
            0,
            JSON.stringify([]),
            JSON.stringify(checklist.missing_info),
            checklist.summary,
            checklist.raw
          ]);

          successCount++;
        } catch (error) {
          console.error(`Error generating checklist for Q${question.question_number}:`, error.message);
          errorCount++;
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    const completeMessage = shouldGenerateChecklists
      ? `Done! Generated ${generatedQuestions.length} questions with ${successCount} checklists.`
      : `Done! Generated ${generatedQuestions.length} questions.`;

    sendEvent({
      phase: 'complete',
      message: completeMessage,
      progress: 100,
      questionCount: generatedQuestions.length,
      checklistSuccess: successCount,
      checklistErrors: errorCount
    });

    res.end();

  } catch (error) {
    console.error('Error in generate-stream:', error);
    sendEvent({ phase: 'error', message: error.message });
    res.end();
  }
});

// Keep the original POST endpoint for backwards compatibility
router.post('/:workshopId/sessions/:sessionId/generate', async (req, res) => {
  try {
    const { workshopId, sessionId } = req.params;

    const workshopResult = await db.query('SELECT * FROM workshops WHERE id = $1', [workshopId]);
    if (workshopResult.rows.length === 0) {
      return res.status(404).json({ error: 'Workshop not found' });
    }
    const workshop = workshopResult.rows[0];

    const sessionResult = await db.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const session = sessionResult.rows[0];

    const entitiesResult = await db.query('SELECT * FROM entities WHERE workshop_id = $1', [workshopId]);
    const entities = entitiesResult.rows;

    const generatedQuestions = await generateQuestions({
      agenda: session.agenda || session.description,
      entities,
      audience: [],
      module: session.module,
      targetCount: session.question_count || workshop.questions_per_session || 30,
      industryContext: workshop.industry_context,
      customInstructions: workshop.custom_instructions,
      sessionName: session.name
    });

    await db.query('DELETE FROM questions WHERE session_id = $1', [sessionId]);

    for (const q of generatedQuestions) {
      let entityId = null;
      if (q.entity_code) {
        const entityMatch = entities.find(e => e.code.toUpperCase() === q.entity_code.toUpperCase());
        if (entityMatch) entityId = entityMatch.id;
      }

      await db.query(`
        INSERT INTO questions (session_id, entity_id, question_number, question_text, category_name, is_critical, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [sessionId, entityId, q.question_number, q.question_text, q.category_name, q.is_critical, q.question_number]);
    }

    await db.query('UPDATE sessions SET questions_generated = TRUE WHERE id = $1', [sessionId]);

    res.json({
      success: true,
      count: generatedQuestions.length,
      message: `Generated ${generatedQuestions.length} questions.`
    });
  } catch (error) {
    console.error('Error generating questions:', error);
    res.status(500).json({ error: 'Failed to generate questions: ' + error.message });
  }
});

// ============================================
// Generate Direct Checklist for a Session (with SSE progress)
// ============================================

router.get('/:workshopId/sessions/:sessionId/generate-checklist-stream', async (req, res) => {
  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { workshopId, sessionId } = req.params;

    sendEvent({ phase: 'init', message: 'Starting checklist generation...' });

    // Get workshop
    const workshopResult = await db.query('SELECT * FROM workshops WHERE id = $1', [workshopId]);
    if (workshopResult.rows.length === 0) {
      sendEvent({ phase: 'error', message: 'Workshop not found' });
      res.end();
      return;
    }
    const workshop = workshopResult.rows[0];

    // Check if mission statement exists
    if (!workshop.mission_statement) {
      sendEvent({ phase: 'error', message: 'Mission statement is required for direct checklist mode. Please add a mission statement in Workshop Setup.' });
      res.end();
      return;
    }

    // Get session
    const sessionResult = await db.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
    if (sessionResult.rows.length === 0) {
      sendEvent({ phase: 'error', message: 'Session not found' });
      res.end();
      return;
    }
    const session = sessionResult.rows[0];

    // Get entities
    const entitiesResult = await db.query('SELECT * FROM entities WHERE workshop_id = $1', [workshopId]);
    const entities = entitiesResult.rows;

    sendEvent({ phase: 'generating', message: 'Generating exhaustive checklist with AI...', progress: 20 });

    // Generate checklist items
    const checklistItems = await generateDirectChecklist({
      missionStatement: workshop.mission_statement,
      module: session.module,
      industryContext: workshop.industry_context,
      customInstructions: workshop.custom_instructions,
      sessionName: session.name,
      topics: session.topics,
      entities
    });

    sendEvent({ phase: 'saving', message: `Saving ${checklistItems.length} checklist items...`, progress: 80 });

    // Save to database
    const itemCount = await saveChecklistItems(sessionId, checklistItems);

    sendEvent({
      phase: 'complete',
      message: `Done! Generated ${itemCount} checklist items.`,
      progress: 100,
      itemCount
    });

    res.end();

  } catch (error) {
    console.error('Error in generate-checklist-stream:', error);
    sendEvent({ phase: 'error', message: error.message });
    res.end();
  }
});

module.exports = router;
