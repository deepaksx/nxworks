const Anthropic = require('@anthropic-ai/sdk');
const db = require('../models/db');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * Generate initial checklist for a single question
 * @param {Object} question - Question data with context
 * @param {Object} context - Workshop context
 * @param {Array} previousChecklistItems - Items already in checklists for previous questions (to avoid duplicates)
 */
async function generateChecklistForQuestion(question, context, previousChecklistItems = []) {
  let questionContext = `## Workshop Context
**Workshop:** ${context.workshop_name || 'SAP S/4HANA Pre-Discovery'}
**Client:** ${context.client_name || 'Not specified'}
**Industry:** ${context.industry_context || 'Not specified'}

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

  // Add previously generated checklist items to avoid duplicates
  if (previousChecklistItems.length > 0) {
    questionContext += `\n## Already Covered in Previous Questions
The following items are already being tracked in earlier questions' checklists. DO NOT include these or similar items:

`;
    previousChecklistItems.forEach((item, idx) => {
      questionContext += `${idx + 1}. [Q${item.fromQuestion}] ${item.item}\n`;
    });
    questionContext += `\n`;
  }

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
2. Consider what an SAP implementation team would need to know for KDS and BPML documents
3. For critical questions, include more detailed checklist items
4. Generate between 10-30 checklist items - be comprehensive and thorough
5. Rate importance: "critical" = must have for implementation, "important" = should have, "nice-to-have" = helpful but optional
6. Suggested questions should help extract the specific information if not mentioned
7. **CRITICAL: Do NOT include items that overlap with "Already Covered in Previous Questions" listed above. Skip any items already being tracked.**
8. Only output valid JSON, nothing else

Question context:

${questionContext}`
      }
    ]
  });

  let checklistData;
  let rawContent = response.content[0].text;
  rawContent = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  checklistData = JSON.parse(rawContent);

  return {
    missing_info: checklistData.missing_info || [],
    summary: checklistData.summary || '',
    raw: rawContent
  };
}

/**
 * Generate initial checklists for all questions in a session
 * This is called after questions are generated/published
 */
async function generateChecklistsForSession(sessionId) {
  console.log(`Generating initial checklists for session ${sessionId}...`);

  // Get workshop context
  const configResult = await db.query('SELECT * FROM global_workshop_config WHERE id = 1');
  const config = configResult.rows[0] || {};

  // Get all questions for this session with full context
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
  console.log(`Found ${questions.length} questions to generate checklists for`);

  let successCount = 0;
  let errorCount = 0;

  // Track all checklist items from previous questions to avoid duplicates
  let allPreviousChecklistItems = [];

  for (const question of questions) {
    try {
      // Check if checklist already exists
      const existingObs = await db.query(`
        SELECT o.* FROM observations o
        JOIN answers a ON o.answer_id = a.id
        WHERE a.question_id = $1 AND o.observation_number = 0
      `, [question.id]);

      if (existingObs.rows.length > 0) {
        console.log(`  Question ${question.question_number}: Checklist already exists, skipping`);
        // Still add existing items to the tracking list
        const existingMissing = typeof existingObs.rows[0].missing_info === 'string'
          ? JSON.parse(existingObs.rows[0].missing_info)
          : (existingObs.rows[0].missing_info || []);
        allPreviousChecklistItems = allPreviousChecklistItems.concat(
          existingMissing.map(item => ({
            item: item.item,
            fromQuestion: question.question_number
          }))
        );
        successCount++;
        continue;
      }

      // Generate checklist with context of previous items
      console.log(`  Question ${question.question_number}: Generating checklist (excluding ${allPreviousChecklistItems.length} items from previous questions)...`);
      const checklist = await generateChecklistForQuestion(question, config, allPreviousChecklistItems);

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

      // Save initial observation (observation_number = 0 for initial)
      await db.query(`
        INSERT INTO observations (answer_id, observation_number, obtained_info, missing_info, summary, raw_observation)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        answerId,
        0, // observation_number 0 = initial checklist
        JSON.stringify([]), // no obtained info yet
        JSON.stringify(checklist.missing_info),
        checklist.summary,
        checklist.raw
      ]);

      // Track these items for subsequent questions
      allPreviousChecklistItems = allPreviousChecklistItems.concat(
        checklist.missing_info.map(item => ({
          item: item.item,
          fromQuestion: question.question_number
        }))
      );

      successCount++;
      console.log(`  Question ${question.question_number}: Done (${checklist.missing_info.length} items)`);

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`  Question ${question.question_number}: Error - ${error.message}`);
      errorCount++;
    }
  }

  console.log(`Checklist generation complete: ${successCount} success, ${errorCount} errors`);
  return { successCount, errorCount, total: questions.length };
}

module.exports = {
  generateChecklistForQuestion,
  generateChecklistsForSession
};
