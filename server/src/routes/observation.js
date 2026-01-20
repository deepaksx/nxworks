const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const db = require('../models/db');

// Document parsing libraries
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const XLSX = require('xlsx');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Analyze image using Claude Vision
async function analyzeImage(filePath, mimeType) {
  try {
    const fullPath = path.join(__dirname, '../..', filePath);

    if (!fs.existsSync(fullPath)) {
      return '[Image file not found]';
    }

    const buffer = fs.readFileSync(fullPath);
    const base64Image = buffer.toString('base64');

    const mediaType = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Image
              }
            },
            {
              type: 'text',
              text: 'Analyze this image from an SAP S/4HANA pre-discovery workshop. Describe what you see, including any diagrams, charts, process flows, organizational structures, data, or text visible. Extract all relevant business information.'
            }
          ]
        }
      ]
    });

    return response.content[0].text;
  } catch (error) {
    console.error('Error analyzing image:', error);
    return `[Error analyzing image: ${error.message}]`;
  }
}

// Extract text from various document types
async function extractDocumentContent(filePath, mimeType) {
  try {
    const fullPath = path.join(__dirname, '../..', filePath);

    if (!fs.existsSync(fullPath)) {
      return '[File not found]';
    }

    const buffer = fs.readFileSync(fullPath);

    if (mimeType === 'application/pdf') {
      const data = await pdfParse(buffer);
      return data.text.substring(0, 5000);
    }

    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/msword') {
      const result = await mammoth.extractRawText({ buffer });
      return result.value.substring(0, 5000);
    }

    if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mimeType === 'application/vnd.ms-excel') {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      let text = '';
      workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        text += `\n[Sheet: ${sheetName}]\n`;
        text += XLSX.utils.sheet_to_csv(sheet);
      });
      return text.substring(0, 5000);
    }

    if (mimeType === 'text/plain' || mimeType === 'text/csv') {
      return buffer.toString('utf-8').substring(0, 5000);
    }

    if (mimeType.startsWith('image/')) {
      return await analyzeImage(filePath, mimeType);
    }

    return '[Unsupported file type]';
  } catch (error) {
    console.error('Error extracting document content:', error);
    return `[Error reading file: ${error.message}]`;
  }
}

// Generate initial checklist for a question (before any answer)
router.post('/question/:questionId/initial', async (req, res) => {
  try {
    const { questionId } = req.params;
    const { force } = req.query; // Allow force regeneration

    // Check if initial observation already exists
    const existingObs = await db.query(`
      SELECT o.*, a.id as answer_id FROM observations o
      JOIN answers a ON o.answer_id = a.id
      WHERE a.question_id = $1 AND o.observation_number = 0
    `, [questionId]);

    if (existingObs.rows.length > 0) {
      if (force === 'true') {
        // Delete existing initial observation to regenerate
        await db.query('DELETE FROM observations WHERE id = $1', [existingObs.rows[0].id]);
        console.log('Deleted existing initial checklist for regeneration');
      } else {
        // Return existing initial observation
        const obs = existingObs.rows[0];
        return res.json({
          success: true,
          observation: obs,
          obtained_info: typeof obs.obtained_info === 'string' ? JSON.parse(obs.obtained_info) : (obs.obtained_info || []),
          missing_info: typeof obs.missing_info === 'string' ? JSON.parse(obs.missing_info) : (obs.missing_info || []),
          summary: obs.summary
        });
      }
    }

    // Get question details
    const questionResult = await db.query(`
      SELECT q.*, e.code as entity_code, e.name as entity_name, e.business_context,
             s.name as session_name, s.module as session_module, s.description as session_description,
             w.name as workshop_name, w.client_name, w.industry_context
      FROM questions q
      LEFT JOIN entities e ON q.entity_id = e.id
      LEFT JOIN sessions s ON q.session_id = s.id
      LEFT JOIN workshops w ON s.workshop_id = w.id
      WHERE q.id = $1
    `, [questionId]);

    if (questionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const question = questionResult.rows[0];

    // Get all obtained information from PREVIOUS questions in this session
    // This helps avoid duplicate checklist items
    const previousObtainedResult = await db.query(`
      SELECT DISTINCT o.obtained_info, q.question_number, q.question_text
      FROM observations o
      JOIN answers a ON o.answer_id = a.id
      JOIN questions q ON a.question_id = q.id
      WHERE q.session_id = $1
        AND q.question_number < $2
        AND o.obtained_info IS NOT NULL
        AND o.obtained_info != '[]'
      ORDER BY q.question_number
    `, [question.session_id, question.question_number]);

    // Collect all previously obtained items
    let previouslyObtainedItems = [];
    for (const row of previousObtainedResult.rows) {
      const obtained = typeof row.obtained_info === 'string'
        ? JSON.parse(row.obtained_info)
        : (row.obtained_info || []);
      previouslyObtainedItems = previouslyObtainedItems.concat(
        obtained.map(item => ({
          item: item.item,
          fromQuestion: row.question_number
        }))
      );
    }

    // Build context for AI
    let context = `## Workshop Context
**Workshop:** ${question.workshop_name || 'SAP S/4HANA Pre-Discovery'}
**Client:** ${question.client_name || 'Not specified'}
**Industry:** ${question.industry_context || 'Not specified'}

## Session Context
**Session:** ${question.session_name} (${question.session_module})
**Description:** ${question.session_description || 'N/A'}

## Entity Context
**Entity:** ${question.entity_name || 'General'} (${question.entity_code || 'N/A'})
**Business Context:** ${question.business_context || 'Not specified'}

## Question
**Question #${question.question_number}:** ${question.question_text}
${question.is_critical ? '**Note:** This is marked as a CRITICAL question requiring detailed information.' : ''}
`;

    // Add previously obtained information to context
    if (previouslyObtainedItems.length > 0) {
      context += `\n## Already Obtained Information (from previous questions in this session)
The following information has ALREADY been collected from earlier questions. DO NOT include these or similar items in the checklist:

`;
      previouslyObtainedItems.forEach((item, idx) => {
        context += `${idx + 1}. [Q${item.fromQuestion}] ${item.item}\n`;
      });
      context += `\n`;
    }

    console.log('Generating initial checklist for question', questionId, '- excluding', previouslyObtainedItems.length, 'previously obtained items');

    // Generate initial checklist using Claude
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: `You are an SAP S/4HANA implementation consultant preparing for a pre-discovery workshop.

Based on the question context provided, generate a checklist of specific information items that should be obtained from the client's response to this question.

Provide your analysis in JSON format:

{
  "missing_info": [
    { "item": "Specific information needed (be detailed and specific)", "importance": "critical/important/nice-to-have", "suggested_question": "Follow-up question to ask if not covered" }
  ],
  "summary": "Brief description of what this question aims to discover and why it matters for S/4HANA implementation"
}

IMPORTANT GUIDELINES:
1. Be SPECIFIC - don't use vague items like "company information" - instead specify exactly what: "Number of legal entities", "Countries of operation", etc.
2. Consider what an SAP implementation team would need to know
3. For critical questions, include more detailed checklist items
4. Generate between 10-30 checklist items - be comprehensive and thorough
5. Rate importance: "critical" = must have for implementation, "important" = should have, "nice-to-have" = helpful but optional
6. Suggested questions should help extract the specific information if not mentioned
7. **CRITICAL: Do NOT include items that overlap with "Already Obtained Information" listed above. Skip any items that have already been collected from previous questions.**
8. Only output valid JSON, nothing else

Question context:

${context}`
        }
      ]
    });

    let checklistData;
    try {
      let rawContent = response.content[0].text;
      rawContent = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      checklistData = JSON.parse(rawContent);
    } catch (parseError) {
      console.error('Failed to parse checklist JSON:', parseError);
      return res.status(500).json({ error: 'Failed to parse generated checklist' });
    }

    // Create a placeholder answer if none exists
    let answerResult = await db.query('SELECT id FROM answers WHERE question_id = $1', [questionId]);
    let answerId;

    if (answerResult.rows.length === 0) {
      const newAnswer = await db.query(
        'INSERT INTO answers (question_id, status) VALUES ($1, $2) RETURNING id',
        [questionId, 'pending']
      );
      answerId = newAnswer.rows[0].id;
    } else {
      answerId = answerResult.rows[0].id;
    }

    // Save initial observation (observation_number = 0 for initial)
    const insertResult = await db.query(`
      INSERT INTO observations (answer_id, observation_number, obtained_info, missing_info, summary, raw_observation)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      answerId,
      0, // observation_number 0 = initial checklist
      JSON.stringify([]), // no obtained info yet
      JSON.stringify(checklistData.missing_info || []),
      checklistData.summary || '',
      response.content[0].text
    ]);

    res.json({
      success: true,
      observation: insertResult.rows[0],
      obtained_info: [],
      missing_info: checklistData.missing_info || [],
      summary: checklistData.summary || ''
    });

  } catch (error) {
    console.error('Initial checklist generation error:', error);

    if (error.status === 401) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    res.status(500).json({
      error: 'Failed to generate initial checklist',
      details: error.message
    });
  }
});

// Create observation for a question
router.post('/question/:questionId', async (req, res) => {
  try {
    const { questionId } = req.params;

    // Get question details
    const questionResult = await db.query(`
      SELECT q.*, e.code as entity_code, e.name as entity_name,
             s.name as session_name, s.module as session_module
      FROM questions q
      LEFT JOIN entities e ON q.entity_id = e.id
      LEFT JOIN sessions s ON q.session_id = s.id
      WHERE q.id = $1
    `, [questionId]);

    if (questionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const question = questionResult.rows[0];

    // Get answer
    const answerResult = await db.query(
      'SELECT * FROM answers WHERE question_id = $1',
      [questionId]
    );

    if (answerResult.rows.length === 0) {
      return res.status(400).json({ error: 'No answer found for this question. Please save a response first.' });
    }

    const answer = answerResult.rows[0];

    // Get previous observations for this answer to determine observation number
    const prevObsResult = await db.query(
      'SELECT MAX(observation_number) as max_num FROM observations WHERE answer_id = $1',
      [answer.id]
    );
    const observationNumber = (prevObsResult.rows[0].max_num || 0) + 1;

    // Get audio transcriptions
    const audioResult = await db.query(
      'SELECT transcription, duration_seconds FROM audio_recordings WHERE answer_id = $1 AND transcription IS NOT NULL',
      [answer.id]
    );

    // Get documents with content
    const docsResult = await db.query(
      'SELECT original_name, description, file_path, mime_type FROM documents WHERE answer_id = $1',
      [answer.id]
    );

    // Extract document contents
    const documentContents = [];
    for (const doc of docsResult.rows) {
      const content = await extractDocumentContent(doc.file_path, doc.mime_type);
      documentContents.push({
        name: doc.original_name,
        description: doc.description,
        content
      });
    }

    // Build context for AI
    let context = `## Question Context

**Session:** ${question.session_name} (${question.session_module})
**Entity:** ${question.entity_name || 'General'} (${question.entity_code || 'N/A'})
**Question #${question.question_number}:** ${question.question_text}
${question.is_critical ? '**Note:** This is marked as a CRITICAL question.' : ''}

## Collected Data

**Respondent:** ${answer.respondent_name || 'Not specified'} (${answer.respondent_role || 'Role not specified'})

### Text Response:
${answer.text_response || 'No text response provided.'}

### Additional Notes:
${answer.notes || 'No additional notes.'}
`;

    if (audioResult.rows.length > 0) {
      context += `\n### Audio Transcriptions:\n`;
      audioResult.rows.forEach((audio, i) => {
        context += `\n**Recording ${i + 1}:**\n${audio.transcription}\n`;
      });
    }

    if (documentContents.length > 0) {
      context += `\n### Attached Documents:\n`;
      documentContents.forEach((doc) => {
        context += `\n**Document: ${doc.name}**\n`;
        if (doc.description) {
          context += `Description: ${doc.description}\n`;
        }
        context += `Content:\n${doc.content}\n`;
        context += `\n---\n`;
      });
    }

    // Get previous observations for this specific question
    const existingObsResult = await db.query(
      'SELECT observation_number, obtained_info, missing_info, summary FROM observations WHERE answer_id = $1 ORDER BY observation_number',
      [answer.id]
    );

    // Get the FIRST observation's missing items as the baseline checklist
    let baselineMissingItems = [];
    let allPreviouslyObtained = [];

    if (existingObsResult.rows.length > 0) {
      // First observation defines the checklist
      const firstObs = existingObsResult.rows[0];
      baselineMissingItems = typeof firstObs.missing_info === 'string'
        ? JSON.parse(firstObs.missing_info)
        : (firstObs.missing_info || []);

      // Collect all items that have been obtained across all observations
      existingObsResult.rows.forEach(obs => {
        const obtained = typeof obs.obtained_info === 'string'
          ? JSON.parse(obs.obtained_info)
          : (obs.obtained_info || []);
        allPreviouslyObtained = [...allPreviouslyObtained, ...obtained];
      });

      context += `\n### IMPORTANT - This is Observation #${observationNumber}\n`;
      context += `\nThe ORIGINAL checklist from Observation 1 had these missing items that need to be closed:\n`;
      baselineMissingItems.forEach((item, idx) => {
        context += `${idx + 1}. ${item.item} [${item.importance}]\n`;
      });

      context += `\nItems already obtained in previous observations:\n`;
      allPreviouslyObtained.forEach((item, idx) => {
        context += `- ${item.item}\n`;
      });

      context += `\nYour task: Check if any of the ORIGINAL missing items can now be marked as obtained based on the NEW data provided. Do NOT add new missing items.\n`;
    }

    console.log('Creating observation #' + observationNumber + ' with Claude, context length:', context.length);

    // Different prompts for first vs subsequent observations
    let prompt;

    if (observationNumber === 1) {
      // First observation - create the initial checklist
      prompt = `You are an SAP S/4HANA implementation consultant analyzing a workshop question response.

Analyze the question and collected data, then provide a structured observation in the following JSON format:

{
  "obtained_info": [
    { "item": "THE ACTUAL DATA/VALUE obtained (e.g., '5 warehouses located in Dubai, Abu Dhabi, Sharjah')", "source": "Where it came from (text/audio/document)", "confidence": "high/medium/low" }
  ],
  "missing_info": [
    { "item": "Specific information still needed", "importance": "critical/important/nice-to-have", "suggested_question": "Follow-up question to ask" }
  ],
  "additional_findings": [
    { "topic": "Category/topic name (e.g., 'Pain Points', 'Integration Requirements', 'Compliance')", "finding": "Detailed description of the finding with specific facts", "relevance": "How this relates to SAP implementation", "source": "audio/text/document" }
  ],
  "summary": "Brief summary of the current state of information gathering for this question"
}

CRITICAL INSTRUCTIONS FOR obtained_info:
- DO NOT write vague descriptions like "Company structure information obtained" or "Number of employees mentioned"
- INSTEAD write the ACTUAL DATA: "Company has 3 legal entities: Rawabi Steel, Rawabi Trading, Rawabi Logistics"
- Include specific numbers, names, locations, processes, systems, dates, and values
- Each item should contain the concrete information that was shared, not a description that information exists
- Example BAD: "Inventory management process discussed"
- Example GOOD: "Inventory is managed using Excel spreadsheets, with monthly stock counts, and 3 warehouse staff"

CRITICAL INSTRUCTIONS FOR additional_findings:
- Capture ANY valuable information shared that goes BEYOND the specific question being asked
- Include: pain points, challenges, workarounds, wishes, concerns, dependencies, integrations, compliance issues
- Include: stakeholder opinions, change management insights, training needs, timeline constraints
- Include: current system limitations, manual processes, data quality issues, reporting gaps
- This is where you capture the "gold nuggets" of information that users share during discussion
- Be specific with actual details, names, numbers, and facts

IMPORTANT:
- Be thorough in identifying what information the question was seeking
- Clearly identify what HAS been answered vs what is STILL MISSING
- For missing items, provide specific follow-up questions to ask
- Rate importance: "critical" = must have before implementation, "important" = should have, "nice-to-have" = optional
- Only output valid JSON, nothing else

Question and data to analyze:

${context}`;
    } else {
      // Subsequent observations - only close items from original checklist
      prompt = `You are an SAP S/4HANA implementation consultant reviewing UPDATED workshop data.

CRITICAL RULES:
1. You MUST work from the ORIGINAL missing items checklist (shown below)
2. You can ONLY move items from "missing" to "obtained" - NEVER add new missing items
3. Check if any originally missing items are now answered in the new data
4. Keep items in missing_info if they are STILL not answered

Original missing items to check:
${JSON.stringify(baselineMissingItems, null, 2)}

Items already obtained in previous observations:
${JSON.stringify(allPreviouslyObtained, null, 2)}

Provide your analysis in this JSON format:

{
  "obtained_info": [
    { "item": "THE ACTUAL DATA/VALUE obtained - include specific numbers, names, values (e.g., 'Uses 3 bank accounts: Emirates NBD for operations, ADCB for payroll, FAB for investments')", "source": "Where the answer came from", "confidence": "high/medium/low" }
  ],
  "missing_info": [
    { "item": "Copy exact item text that is STILL missing", "importance": "copy original importance", "suggested_question": "copy or refine original question" }
  ],
  "additional_findings": [
    { "topic": "Category/topic name (e.g., 'Pain Points', 'Integration Requirements', 'Compliance')", "finding": "Detailed description of the finding with specific facts", "relevance": "How this relates to SAP implementation", "source": "audio/text/document" }
  ],
  "summary": "Brief summary - X of Y original items now obtained"
}

CRITICAL FOR obtained_info:
- When an item is newly obtained, write the ACTUAL DATA, not just "item X is now answered"
- Include specific numbers, names, systems, processes, dates, and values
- Example BAD: "Banking information obtained"
- Example GOOD: "Company uses Emirates NBD as primary bank, processes 500 payments/month, uses direct debit for supplier payments"

CRITICAL FOR additional_findings:
- Capture ANY NEW valuable information from this recording that goes BEYOND the checklist items
- Include: pain points, challenges, workarounds, wishes, concerns, dependencies, integrations, compliance issues
- Include: stakeholder opinions, change management insights, training needs, timeline constraints
- Be specific with actual details, names, numbers, and facts

REMEMBER:
- obtained_info should include ALL previously obtained items PLUS any newly obtained (with actual data values)
- missing_info should ONLY contain items from the ORIGINAL checklist that are STILL not answered
- Do NOT invent new missing items
- Only output valid JSON, nothing else

New data to analyze:

${context}`;
    }

    // Generate observation using Claude
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    let rawObservation = response.content[0].text;

    // Parse the JSON response
    let observationData;
    try {
      // Clean up the response - remove markdown code blocks if present
      rawObservation = rawObservation.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      observationData = JSON.parse(rawObservation);
    } catch (parseError) {
      console.error('Failed to parse observation JSON:', parseError);
      observationData = {
        obtained_info: [],
        missing_info: [],
        summary: rawObservation,
        recommendations: [],
        risks: []
      };
    }

    // Save observation to new observations table
    const insertResult = await db.query(`
      INSERT INTO observations (answer_id, observation_number, obtained_info, missing_info, additional_findings, summary, raw_observation)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      answer.id,
      observationNumber,
      JSON.stringify(observationData.obtained_info || []),
      JSON.stringify(observationData.missing_info || []),
      JSON.stringify(observationData.additional_findings || []),
      observationData.summary || '',
      rawObservation
    ]);

    // Also update the answer's observation field for backward compatibility
    await db.query(
      'UPDATE answers SET observation = $1, updated_at = CURRENT_TIMESTAMP WHERE question_id = $2',
      [rawObservation, questionId]
    );

    // Auto-complete: If all critical and important items are obtained, mark question as completed
    const missingItems = observationData.missing_info || [];
    const criticalMissing = missingItems.filter(i => i.importance === 'critical');
    const importantMissing = missingItems.filter(i => i.importance === 'important');

    let autoCompleted = false;
    if (criticalMissing.length === 0 && importantMissing.length === 0) {
      await db.query(
        'UPDATE answers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE question_id = $2',
        ['completed', questionId]
      );
      autoCompleted = true;
      console.log(`Question ${questionId} auto-completed: all critical/important items obtained`);
    }

    res.json({
      success: true,
      observation: insertResult.rows[0],
      observation_number: observationNumber,
      obtained_info: observationData.obtained_info || [],
      missing_info: observationData.missing_info || [],
      additional_findings: observationData.additional_findings || [],
      summary: observationData.summary || '',
      auto_completed: autoCompleted
    });

  } catch (error) {
    console.error('Observation creation error:', error);

    if (error.status === 401) {
      return res.status(401).json({ error: 'Invalid API key. Please check ANTHROPIC_API_KEY in .env' });
    }

    res.status(500).json({
      error: 'Failed to create observation',
      details: error.message
    });
  }
});

// Get all observations for a question
router.get('/question/:questionId/all', async (req, res) => {
  try {
    const { questionId } = req.params;

    // Get answer first
    const answerResult = await db.query(
      'SELECT id FROM answers WHERE question_id = $1',
      [questionId]
    );

    if (answerResult.rows.length === 0) {
      return res.json({ observations: [] });
    }

    const answerId = answerResult.rows[0].id;

    // Get all observations
    const result = await db.query(`
      SELECT * FROM observations
      WHERE answer_id = $1
      ORDER BY observation_number ASC
    `, [answerId]);

    res.json({
      observations: result.rows.map(obs => ({
        ...obs,
        obtained_info: typeof obs.obtained_info === 'string' ? JSON.parse(obs.obtained_info) : (obs.obtained_info || []),
        missing_info: typeof obs.missing_info === 'string' ? JSON.parse(obs.missing_info) : (obs.missing_info || []),
        additional_findings: typeof obs.additional_findings === 'string' ? JSON.parse(obs.additional_findings) : (obs.additional_findings || [])
      }))
    });
  } catch (error) {
    console.error('Error fetching observations:', error);
    res.status(500).json({ error: 'Failed to fetch observations' });
  }
});

// Get all observations for a session (for reports)
router.get('/session/:sessionId/all', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Get all observations with question info for this session
    const result = await db.query(`
      SELECT
        o.*,
        q.id as question_id,
        q.question_number,
        q.question_text,
        q.category_name,
        q.is_critical,
        e.name as entity_name,
        e.code as entity_code
      FROM observations o
      JOIN answers a ON o.answer_id = a.id
      JOIN questions q ON a.question_id = q.id
      LEFT JOIN entities e ON q.entity_id = e.id
      WHERE q.session_id = $1
        AND o.observation_number > 0
      ORDER BY q.question_number, o.observation_number
    `, [sessionId]);

    // Process and group observations by question
    const observationsByQuestion = {};
    result.rows.forEach(obs => {
      const qId = obs.question_id;
      if (!observationsByQuestion[qId]) {
        observationsByQuestion[qId] = {
          question_id: qId,
          question_number: obs.question_number,
          question_text: obs.question_text,
          category_name: obs.category_name,
          is_critical: obs.is_critical,
          entity_name: obs.entity_name,
          entity_code: obs.entity_code,
          observations: []
        };
      }
      observationsByQuestion[qId].observations.push({
        id: obs.id,
        observation_number: obs.observation_number,
        obtained_info: typeof obs.obtained_info === 'string' ? JSON.parse(obs.obtained_info) : (obs.obtained_info || []),
        missing_info: typeof obs.missing_info === 'string' ? JSON.parse(obs.missing_info) : (obs.missing_info || []),
        additional_findings: typeof obs.additional_findings === 'string' ? JSON.parse(obs.additional_findings) : (obs.additional_findings || []),
        summary: obs.summary,
        created_at: obs.created_at
      });
    });

    // Consolidate all obtained findings across all questions
    const allFindings = [];
    Object.values(observationsByQuestion).forEach(q => {
      // Get the latest observation's obtained_info
      const latestObs = q.observations[q.observations.length - 1];
      if (latestObs && latestObs.obtained_info) {
        latestObs.obtained_info.forEach(item => {
          allFindings.push({
            question_number: q.question_number,
            question_text: q.question_text,
            category: q.category_name || 'General',
            entity: q.entity_code || '-',
            is_critical: q.is_critical,
            item: item.item,
            confidence: item.confidence || 'medium',
            source: item.source || '-'
          });
        });
      }
      // Also include additional_findings
      if (latestObs && latestObs.additional_findings) {
        latestObs.additional_findings.forEach(finding => {
          allFindings.push({
            question_number: q.question_number,
            question_text: q.question_text,
            category: finding.topic || q.category_name || 'General',
            entity: q.entity_code || '-',
            is_critical: q.is_critical,
            item: finding.finding,
            confidence: 'high',
            source: finding.source || '-',
            relevance: finding.relevance
          });
        });
      }
    });

    res.json({
      questions: Object.values(observationsByQuestion),
      all_findings: allFindings,
      total_questions: Object.keys(observationsByQuestion).length,
      total_findings: allFindings.length
    });
  } catch (error) {
    console.error('Error fetching session observations:', error);
    res.status(500).json({ error: 'Failed to fetch session observations' });
  }
});

// Get latest observation for a question (backward compatibility)
router.get('/question/:questionId', async (req, res) => {
  try {
    const { questionId } = req.params;

    const result = await db.query(
      'SELECT observation FROM answers WHERE question_id = $1',
      [questionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No answer found' });
    }

    res.json({ observation: result.rows[0].observation });
  } catch (error) {
    console.error('Error fetching observation:', error);
    res.status(500).json({ error: 'Failed to fetch observation' });
  }
});

module.exports = router;
