/**
 * Direct Checklist Generator Service
 *
 * Generates exhaustive checklists from mission statements and
 * analyzes transcriptions to mark items as obtained.
 */

const Anthropic = require('@anthropic-ai/sdk');
const db = require('../models/db');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Module-specific guidance for checklist generation
const MODULE_GUIDANCE = {
  'MM': `Material Management Focus:
- Purchasing organization structure
- Material master data requirements
- Vendor master data
- Purchase requisition process
- Purchase order types and workflows
- Goods receipt process
- Invoice verification
- Inventory management
- Warehouse structure`,

  'FICO': `Finance & Controlling Focus:
- Chart of accounts structure
- Company codes and fiscal years
- GL account determination
- Cost center hierarchy
- Profit center structure
- Internal orders
- AP/AR processes
- Asset accounting
- Financial reporting requirements`,

  'SD': `Sales & Distribution Focus:
- Sales organization structure
- Customer master data
- Pricing procedures
- Sales order types
- Delivery process
- Billing document types
- Credit management
- Output determination`,

  'PP': `Production Planning Focus:
- Plant structure
- Work centers
- Bill of materials
- Routing
- Production orders
- MRP settings
- Capacity planning
- Shop floor control`,

  'WM': `Warehouse Management Focus:
- Warehouse structure
- Storage types and bins
- Putaway strategies
- Picking strategies
- Transfer orders
- Inventory management
- RF/mobile integration`,

  'QM': `Quality Management Focus:
- Inspection types
- Quality plans
- Inspection lots
- Usage decisions
- Quality notifications
- Certificates`,

  'PM': `Plant Maintenance Focus:
- Functional locations
- Equipment master
- Maintenance plans
- Work orders
- Notifications
- Task lists`
};

/**
 * Generate exhaustive checklist from mission statement
 */
async function generateDirectChecklist(config) {
  const {
    missionStatement,
    module,
    industryContext,
    customInstructions,
    sessionName,
    topics,
    entities
  } = config;

  const entityContext = entities?.map(e => `- ${e.code}: ${e.name}`).join('\n') || 'Not specified';
  const moduleGuidance = MODULE_GUIDANCE[module] || '';

  const systemPrompt = `You are an SAP S/4HANA implementation consultant creating an exhaustive discovery checklist for a pre-discovery workshop.

Your goal is to identify ALL specific information items that need to be gathered from the client to:
1. Create Key Design Documents (KDS)
2. Create Business Process Master Lists (BPML)
3. Configure the SAP system correctly
4. Understand current processes and pain points

IMPORTANT GUIDELINES:
- Be SPECIFIC - not vague. Each item should be a concrete piece of information.
- BAD: "Company information"
- GOOD: "Number of legal entities/company codes"
- GOOD: "Chart of accounts name and structure"

- Include items for:
  * Organizational structure (companies, plants, sales orgs, etc.)
  * Master data requirements (materials, customers, vendors, etc.)
  * Current process details (AS-IS)
  * Future state requirements (TO-BE)
  * Integration points with other systems
  * Reporting and analytics needs
  * Compliance and regulatory requirements
  * Pain points and challenges
  * Volumes and frequencies
  * User roles and responsibilities

- Rate importance:
  * critical: Must have for implementation, blocks design decisions
  * important: Should have, impacts configuration significantly
  * nice-to-have: Helpful for optimization but not blocking`;

  const userPrompt = `Create an exhaustive discovery checklist based on this workshop mission:

**MISSION STATEMENT:**
${missionStatement}

**SAP Module:** ${module}
**Session Name:** ${sessionName || 'Discovery Session'}
**Industry Context:** ${industryContext || 'Not specified'}

**Business Entities:**
${entityContext}

${topics ? `**Key Topics to Cover:**\n${topics}` : ''}

${moduleGuidance ? `**Module-Specific Areas:**\n${moduleGuidance}` : ''}

${customInstructions ? `**Additional Instructions:**\n${customInstructions}` : ''}

Generate 50-100 specific checklist items organized by category.

**Output Format - JSON array:**
\`\`\`json
[
  {
    "item_text": "Specific information item to gather (be detailed and specific)",
    "importance": "critical|important|nice-to-have",
    "category": "Category name",
    "suggested_question": "A question to ask to obtain this information"
  }
]
\`\`\`

Categories should include (as applicable):
- Organizational Structure
- Master Data
- Current Process (AS-IS)
- Future Requirements (TO-BE)
- Transactions & Documents
- Integration
- Reporting & Analytics
- Compliance & Controls
- Volumes & Performance
- Pain Points & Challenges

Return ONLY valid JSON array, no other text.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    messages: [{ role: 'user', content: userPrompt }],
    system: systemPrompt
  });

  let rawContent = response.content[0].text;

  // Clean up JSON response
  rawContent = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  // Parse JSON
  const items = JSON.parse(rawContent);

  // Add item numbers
  return items.map((item, index) => ({
    item_number: index + 1,
    item_text: item.item_text,
    importance: item.importance || 'important',
    category: item.category || 'General',
    suggested_question: item.suggested_question || ''
  }));
}

/**
 * Analyze transcription against session checklist to find obtained items
 */
async function analyzeTranscriptionAgainstChecklist(sessionId, newTranscription) {
  // Get all missing items for this session
  const missingItemsResult = await db.query(`
    SELECT id, item_number, item_text, importance, category, suggested_question
    FROM session_checklist_items
    WHERE session_id = $1 AND status = 'missing'
    ORDER BY item_number
  `, [sessionId]);

  const missingItems = missingItemsResult.rows;

  if (missingItems.length === 0) {
    return { obtainedItems: [], remainingMissing: 0 };
  }

  // Get all previous transcriptions for context
  const previousTranscriptions = await db.query(`
    SELECT transcription, chunk_index
    FROM session_recordings
    WHERE session_id = $1 AND transcription IS NOT NULL
    ORDER BY chunk_index
  `, [sessionId]);

  const allTranscriptions = previousTranscriptions.rows
    .map(r => r.transcription)
    .join('\n\n---\n\n');

  // Get session context
  const sessionResult = await db.query(`
    SELECT s.*, w.mission_statement, w.industry_context, w.name as workshop_name
    FROM sessions s
    JOIN workshops w ON s.workshop_id = w.id
    WHERE s.id = $1
  `, [sessionId]);
  const session = sessionResult.rows[0];

  const prompt = `You are an expert SAP S/4HANA implementation consultant analyzing a workshop recording.

**Workshop:** ${session.workshop_name}
**Mission:** ${session.mission_statement || 'Not specified'}
**Module:** ${session.module}
**Industry Context:** ${session.industry_context || 'Not specified'}

**Checklist Items Still Missing (need to find answers for these):**
${missingItems.map(item => `[ID:${item.id}] ${item.item_text}`).join('\n')}

**Workshop Transcription (all recordings so far):**
${allTranscriptions}

**New Recording Transcription:**
${newTranscription}

You have TWO tasks:

## TASK 1: Identify Checklist Items Answered
Analyze the transcription and identify which checklist items now have answers.
- Only mark an item as "obtained" if SPECIFIC, CONCRETE information was provided
- Extract the ACTUAL DATA mentioned, not just acknowledgment that it was discussed
- If information is partial or unclear, still mark as obtained but note the limitation

## TASK 2: Capture Additional Findings (CRITICAL)
Identify ANY topics, processes, pain points, or information discussed that are NOT covered by the checklist items above. These could be:
- Business processes mentioned that weren't on the checklist
- Pain points or challenges the client mentioned
- Current workarounds or manual processes
- Integration requirements
- Compliance or regulatory concerns
- Performance issues
- User experience complaints
- Any other relevant information

For EACH additional finding, provide SAP best practice analysis:
- What is the SAP recommendation for handling this?
- What are the risks if not addressed properly?
- What SAP functionality or solution addresses this?

**Output Format - JSON:**
\`\`\`json
{
  "obtained_items": [
    {
      "item_id": 123,
      "obtained_text": "The actual specific information extracted from the transcription",
      "confidence": "high|medium|low",
      "source_quote": "Brief relevant quote from transcription"
    }
  ],
  "additional_findings": [
    {
      "topic": "Brief topic title (e.g., 'Manual Excel reconciliation process')",
      "finding_type": "process|pain_point|integration|compliance|performance|workaround|requirement|other",
      "details": "Detailed description of what was discussed",
      "source_quote": "Relevant quote from transcription",
      "sap_analysis": "Analysis from SAP implementation perspective - what does this mean for the project?",
      "sap_recommendation": "Specific SAP best practice recommendation",
      "sap_best_practice": "Relevant SAP standard functionality or solution (e.g., 'SAP Fiori app F0859 for bank reconciliation')",
      "sap_risk_level": "high|medium|low",
      "risk_explanation": "Why this is a risk if not addressed"
    }
  ]
}
\`\`\`

IMPORTANT:
- Be thorough in capturing additional findings - the client may mention valuable information casually
- If no additional findings, return an empty array
- Return ONLY valid JSON, no other text.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 6000,
    messages: [{ role: 'user', content: prompt }]
  });

  let rawContent = response.content[0].text;
  rawContent = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  let result;
  try {
    result = JSON.parse(rawContent);
  } catch (parseError) {
    console.error('JSON parse error:', parseError.message);
    console.error('Raw content (first 500 chars):', rawContent.substring(0, 500));

    // Try to fix common JSON issues
    try {
      // Remove any trailing content after the last }
      const lastBrace = rawContent.lastIndexOf('}');
      if (lastBrace > 0) {
        rawContent = rawContent.substring(0, lastBrace + 1);
      }
      // Try to fix unescaped quotes in strings
      rawContent = rawContent.replace(/(?<!\\)"\s*:\s*"([^"]*?)(?<!\\)"/g, (match, p1) => {
        return '": "' + p1.replace(/(?<!\\)"/g, '\\"') + '"';
      });
      result = JSON.parse(rawContent);
    } catch (retryError) {
      console.error('JSON retry parse also failed:', retryError.message);
      // Return empty result instead of crashing
      return {
        obtainedItems: [],
        additionalFindings: [],
        remainingMissing: missingItems.length
      };
    }
  }

  return {
    obtainedItems: result.obtained_items || [],
    additionalFindings: result.additional_findings || [],
    remainingMissing: missingItems.length - (result.obtained_items?.length || 0)
  };
}

/**
 * Save additional findings to database
 */
async function saveAdditionalFindings(sessionId, recordingId, findings) {
  const savedFindings = [];

  for (const finding of findings) {
    const result = await db.query(`
      INSERT INTO session_additional_findings
        (session_id, recording_id, finding_type, topic, details, sap_analysis,
         sap_recommendation, sap_risk_level, sap_best_practice, source_quote)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      sessionId,
      recordingId,
      finding.finding_type || 'general',
      finding.topic,
      finding.details,
      finding.sap_analysis,
      finding.sap_recommendation,
      finding.sap_risk_level || 'medium',
      finding.sap_best_practice,
      finding.source_quote
    ]);
    savedFindings.push(result.rows[0]);
  }

  return savedFindings;
}

/**
 * Get all additional findings for a session
 */
async function getSessionFindings(sessionId) {
  const result = await db.query(`
    SELECT f.*, r.chunk_index, r.created_at as recording_created_at
    FROM session_additional_findings f
    LEFT JOIN session_recordings r ON f.recording_id = r.id
    WHERE f.session_id = $1
    ORDER BY f.created_at DESC
  `, [sessionId]);
  return result.rows;
}

/**
 * Save generated checklist items to database
 */
async function saveChecklistItems(sessionId, items) {
  // Delete existing items for this session
  await db.query('DELETE FROM session_checklist_items WHERE session_id = $1', [sessionId]);

  // Insert new items
  for (const item of items) {
    await db.query(`
      INSERT INTO session_checklist_items
        (session_id, item_number, item_text, importance, category, suggested_question, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'missing')
    `, [
      sessionId,
      item.item_number,
      item.item_text,
      item.importance,
      item.category,
      item.suggested_question
    ]);
  }

  // Mark session as checklist mode
  await db.query(`
    UPDATE sessions
    SET checklist_mode = TRUE, checklist_generated = TRUE
    WHERE id = $1
  `, [sessionId]);

  return items.length;
}

/**
 * Update checklist items as obtained
 */
async function markItemsAsObtained(obtainedItems) {
  const updated = [];

  for (const item of obtainedItems) {
    await db.query(`
      UPDATE session_checklist_items
      SET
        status = 'obtained',
        obtained_text = $1,
        obtained_confidence = $2,
        obtained_source = 'audio',
        obtained_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [
      item.obtained_text,
      item.confidence,
      item.item_id
    ]);
    updated.push(item.item_id);
  }

  return updated;
}

module.exports = {
  generateDirectChecklist,
  analyzeTranscriptionAgainstChecklist,
  saveChecklistItems,
  markItemsAsObtained,
  saveAdditionalFindings,
  getSessionFindings
};
