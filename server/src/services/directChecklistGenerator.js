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

  // Get already obtained items (to check for contradictions)
  const obtainedItemsResult = await db.query(`
    SELECT id, item_number, item_text, obtained_text, obtained_confidence
    FROM session_checklist_items
    WHERE session_id = $1 AND status = 'obtained'
    ORDER BY item_number
  `, [sessionId]);

  const obtainedItems = obtainedItemsResult.rows;

  if (missingItems.length === 0 && obtainedItems.length === 0) {
    return { obtainedItems: [], itemsToReset: [], remainingMissing: 0 };
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
${missingItems.length > 0 ? missingItems.map(item => `[ID:${item.id}] ${item.item_text}`).join('\n') : '(None)'}

**Items Already Marked as Obtained (check for CONTRADICTIONS in new recording):**
${obtainedItems.length > 0 ? obtainedItems.map(item => `[ID:${item.id}] ${item.item_text}\n   Previously recorded: "${item.obtained_text}"`).join('\n') : '(None)'}

**Workshop Transcription (all recordings so far):**
${allTranscriptions}

**New Recording Transcription:**
${newTranscription}

You have TWO tasks:

## TASK 1: Identify Checklist Items Answered (BE VERY STRICT)
Analyze the transcription and identify which checklist items now have CONCRETE answers.

**STRICT RULES - READ CAREFULLY:**
- ONLY mark an item as "obtained" if SPECIFIC, CONCRETE DATA was provided
- DO NOT mark as obtained if the topic was just mentioned, discussed, or asked about
- DO NOT mark as obtained if someone said "we have that" or "yes" without providing actual details
- DO NOT mark as obtained if it was a question being asked (that means we're seeking the info, not that we have it)

**Examples of what IS obtained:**
- "We have 5 distribution centers: Dubai, Abu Dhabi, Sharjah, Ajman, and RAK" = OBTAINED (specific data)
- "Our payment terms are Net 30 for retailers and Net 60 for wholesalers" = OBTAINED (concrete values)
- "The approval hierarchy is: under 10K auto-approve, 10K-50K manager, over 50K director" = OBTAINED (specific rules)

**Examples of what is NOT obtained:**
- "We discussed volume discount structures" = NOT obtained (just discussed, no data)
- "They mentioned they have pricing tiers" = NOT obtained (no specific tiers given)
- "What are your payment terms?" = NOT obtained (this is a question, not an answer)
- "Yes, we handle that" = NOT obtained (no specifics)
- "We'll need to get that information" = NOT obtained (pending, not provided)

## TASK 2: Check for CONTRADICTIONS in Previously Obtained Items
Review the "Items Already Marked as Obtained" above. If the NEW recording contains information that CONTRADICTS or CORRECTS what was previously recorded, flag those items to be reset to "missing".

**Examples of contradictions:**
- Previously: "5 warehouses" → New recording: "Actually we closed 2, so now 3 warehouses" = CONTRADICTION
- Previously: "Payment terms Net 30" → New recording: "No wait, it's Net 45 for that segment" = CONTRADICTION
- Previously: "Manual approval process" → New recording: "That's the old process, we changed it" = CONTRADICTION
- Someone says "I was wrong about that earlier" or "Let me correct that" = CONTRADICTION

## TASK 3: Capture Additional Findings
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
  "items_to_reset": [
    {
      "item_id": 456,
      "reason": "New recording contradicts previous info: [explain the contradiction]",
      "contradiction_quote": "The quote from new recording that contradicts"
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
- BE CONSERVATIVE with "obtained" - when in doubt, do NOT mark as obtained
- Items that were just MENTIONED or ASKED ABOUT should NOT be marked obtained
- Only use "high" confidence when you have exact quotes with specific data
- Check carefully for contradictions - if someone corrects earlier info, reset that item!
- Be thorough in capturing additional findings - the client may mention valuable information casually
- If no items have concrete answers, return an empty obtained_items array - that's fine!
- If no contradictions found, return an empty items_to_reset array
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
        itemsToReset: [],
        additionalFindings: [],
        remainingMissing: missingItems.length
      };
    }
  }

  return {
    obtainedItems: result.obtained_items || [],
    itemsToReset: result.items_to_reset || [],
    additionalFindings: result.additional_findings || [],
    remainingMissing: missingItems.length - (result.obtained_items?.length || 0) + (result.items_to_reset?.length || 0)
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
async function markItemsAsObtained(obtainedItems, source = 'audio') {
  const updated = [];

  for (const item of obtainedItems) {
    await db.query(`
      UPDATE session_checklist_items
      SET
        status = 'obtained',
        obtained_text = $1,
        obtained_confidence = $2,
        obtained_source = $3,
        obtained_at = CURRENT_TIMESTAMP
      WHERE id = $4
    `, [
      item.obtained_text,
      item.confidence,
      source,
      item.item_id
    ]);
    updated.push(item.item_id);
  }

  return updated;
}

/**
 * Analyze document content against session checklist to find obtained items
 */
async function analyzeDocumentAgainstChecklist(sessionId, documentText, documentName) {
  // Get all missing items for this session
  const missingItemsResult = await db.query(`
    SELECT id, item_number, item_text, importance, category, suggested_question
    FROM session_checklist_items
    WHERE session_id = $1 AND status = 'missing'
    ORDER BY item_number
  `, [sessionId]);

  const missingItems = missingItemsResult.rows;

  if (missingItems.length === 0) {
    return { obtainedItems: [], additionalFindings: [], remainingMissing: 0 };
  }

  // Get session context
  const sessionResult = await db.query(`
    SELECT s.*, w.mission_statement, w.industry_context, w.name as workshop_name
    FROM sessions s
    JOIN workshops w ON s.workshop_id = w.id
    WHERE s.id = $1
  `, [sessionId]);
  const session = sessionResult.rows[0];

  // Truncate document text if too long (keep first 50K chars)
  const maxTextLength = 50000;
  const truncatedText = documentText.length > maxTextLength
    ? documentText.substring(0, maxTextLength) + '\n\n[Document truncated due to length...]'
    : documentText;

  const prompt = `You are an expert SAP S/4HANA implementation consultant analyzing a document uploaded during a workshop.

**Workshop:** ${session.workshop_name}
**Mission:** ${session.mission_statement || 'Not specified'}
**Module:** ${session.module}
**Industry Context:** ${session.industry_context || 'Not specified'}
**Document Name:** ${documentName || 'Uploaded Document'}

**Checklist Items Still Missing (need to find information for these):**
${missingItems.map(item => `[ID:${item.id}] ${item.item_text}`).join('\n')}

**Document Content:**
${truncatedText}

You have TWO tasks:

## TASK 1: Identify Checklist Items Answered (BE VERY STRICT)
Analyze the document and identify which checklist items have CONCRETE answers.

**STRICT RULES:**
- ONLY mark an item as "obtained" if SPECIFIC, CONCRETE DATA is found in the document
- DO NOT mark as obtained if the topic is just mentioned without specific details
- DO NOT mark as obtained if it's a placeholder or "TBD"

**Examples of what IS obtained:**
- A table showing "Payment Terms: Net 30 for Type A, Net 45 for Type B" = OBTAINED
- "Company has 12 warehouses located in..." with list = OBTAINED
- Specific pricing structure with actual values = OBTAINED

**Examples of what is NOT obtained:**
- "Pricing policy to be defined" = NOT obtained
- Section header mentioning a topic but no content = NOT obtained
- Generic statements without specific data = NOT obtained

## TASK 2: Capture Additional Findings (CRITICAL)
Identify ANY topics, processes, data, or information in the document that are NOT covered by the checklist items above. These could be:
- Business processes documented that weren't on the checklist
- Organization structures described
- Master data details
- Integration requirements
- Compliance or regulatory information
- Performance metrics or KPIs
- Any other relevant SAP implementation information

For EACH additional finding, provide SAP best practice analysis:
- What does this mean for the SAP implementation?
- What are the risks if not addressed properly?
- What SAP functionality or solution addresses this?

**Output Format - JSON:**
\`\`\`json
{
  "obtained_items": [
    {
      "item_id": 123,
      "obtained_text": "The actual specific information extracted from the document",
      "confidence": "high|medium|low",
      "source_quote": "Brief relevant quote from document"
    }
  ],
  "additional_findings": [
    {
      "topic": "Brief topic title",
      "finding_type": "process|pain_point|integration|compliance|performance|workaround|requirement|data|organization|other",
      "details": "Detailed description of what was found in the document",
      "source_quote": "Relevant quote from document",
      "sap_analysis": "Analysis from SAP implementation perspective",
      "sap_recommendation": "Specific SAP best practice recommendation",
      "sap_best_practice": "Relevant SAP standard functionality or solution",
      "sap_risk_level": "high|medium|low",
      "risk_explanation": "Why this is important for the implementation"
    }
  ]
}
\`\`\`

IMPORTANT:
- BE CONSERVATIVE with "obtained" - only mark if you find ACTUAL DATA, not just topic mentions
- If no items have concrete answers, return an empty obtained_items array - that's fine!
- Documents may contain valuable organizational data, process flows, or requirements
- Be thorough in extracting all relevant information for additional findings
- Return ONLY valid JSON, no other text.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }]
  });

  let rawContent = response.content[0].text;
  rawContent = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  let result;
  try {
    result = JSON.parse(rawContent);
  } catch (parseError) {
    console.error('Document analysis JSON parse error:', parseError.message);
    console.error('Raw content (first 500 chars):', rawContent.substring(0, 500));

    // Try to fix common JSON issues
    try {
      const lastBrace = rawContent.lastIndexOf('}');
      if (lastBrace > 0) {
        rawContent = rawContent.substring(0, lastBrace + 1);
      }
      result = JSON.parse(rawContent);
    } catch (retryError) {
      console.error('Document analysis JSON retry parse also failed:', retryError.message);
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
 * Re-analyze ALL transcripts against the checklist (comprehensive re-evaluation)
 *
 * This function:
 * 1. Reviews ALL checklist items (missing AND obtained) with stricter criteria
 * 2. Only marks items as obtained if CONCRETE DATA is found (not just mentions)
 * 3. Detects stray/off-topic discussions and captures them as findings with full context
 * 4. Updates all items based on the complete transcript context
 */
async function reanalyzeAllTranscripts(sessionId, allTranscriptsText) {
  // Get ALL checklist items (both missing and obtained)
  const allItemsResult = await db.query(`
    SELECT id, item_number, item_text, importance, category, suggested_question, status, obtained_text
    FROM session_checklist_items
    WHERE session_id = $1
    ORDER BY item_number
  `, [sessionId]);

  const allItems = allItemsResult.rows;

  if (allItems.length === 0) {
    return { error: 'No checklist items found', changes: 0 };
  }

  // Get session context
  const sessionResult = await db.query(`
    SELECT s.*, w.mission_statement, w.industry_context, w.name as workshop_name
    FROM sessions s
    JOIN workshops w ON s.workshop_id = w.id
    WHERE s.id = $1
  `, [sessionId]);
  const session = sessionResult.rows[0];

  // Truncate if too long
  const maxLength = 80000;
  const truncatedTranscripts = allTranscriptsText.length > maxLength
    ? allTranscriptsText.substring(0, maxLength) + '\n\n[Transcripts truncated...]'
    : allTranscriptsText;

  const prompt = `You are a SENIOR SAP S/4HANA implementation consultant performing a COMPREHENSIVE RE-ANALYSIS of all workshop recordings.

**CRITICAL INSTRUCTION: BE CONSERVATIVE**
Only mark items as "obtained" if you find CONCRETE, SPECIFIC DATA - not just acknowledgments, promises, or vague mentions.

**Workshop:** ${session.workshop_name}
**Mission:** ${session.mission_statement || 'Not specified'}
**Module:** ${session.module}
**Industry Context:** ${session.industry_context || 'Not specified'}

**ALL CHECKLIST ITEMS TO EVALUATE:**
${allItems.map(item => `[ID:${item.id}] [Current: ${item.status}] ${item.item_text}`).join('\n')}

**COMPLETE TRANSCRIPT OF ALL RECORDINGS:**
${truncatedTranscripts}

## YOUR TASKS:

### TASK 1: RE-EVALUATE ALL CHECKLIST ITEMS
For EACH item, determine if it should be "obtained" or "missing" based on the COMPLETE transcript.

**STRICT CRITERIA FOR "OBTAINED":**
- Must have SPECIFIC DATA (numbers, names, structures, values, decisions)
- "We will provide that later" = NOT obtained
- "Yes, we have that" without details = NOT obtained
- "I think it's about X" = NOT obtained (too vague)
- "Our process is: step 1, step 2, step 3" = OBTAINED (concrete)
- "We have 5 plants: Dubai, Abu Dhabi..." = OBTAINED (specific data)
- "The approval limit is 50,000 AED" = OBTAINED (concrete value)

### TASK 2: DETECT STRAY TOPICS & OFF-TOPIC DISCUSSIONS (CRITICAL)
Identify ANY discussion that went "off-script" or covered topics NOT on the checklist:
- Side conversations about problems
- Complaints or frustrations expressed
- Workarounds mentioned casually
- Historical context shared
- Future plans mentioned
- Concerns raised about change management
- Political/organizational dynamics hinted at
- Integration concerns with other systems
- Performance issues mentioned
- Any OTHER valuable information

For EACH stray topic, provide THOROUGH analysis:
- Full context of what was discussed
- Why this matters for the SAP implementation
- SAP best practice recommendation
- Risk level and explanation

### TASK 3: VERIFY PREVIOUSLY OBTAINED ITEMS
Review items marked as "obtained" - if the evidence is weak or just an acknowledgment, recommend changing back to "missing".

**Output Format - JSON:**
\`\`\`json
{
  "items_to_obtain": [
    {
      "item_id": 123,
      "obtained_text": "SPECIFIC concrete data extracted (be detailed!)",
      "confidence": "high|medium",
      "evidence_quote": "Direct quote proving concrete data"
    }
  ],
  "items_to_reset_to_missing": [
    {
      "item_id": 456,
      "reason": "Only had acknowledgment, no concrete data provided"
    }
  ],
  "stray_topics": [
    {
      "topic": "Descriptive topic title",
      "finding_type": "process|pain_point|integration|compliance|performance|workaround|requirement|organizational|political|future_plan|historical|concern|other",
      "context": "Full context of when and how this came up in the discussion",
      "details": "Complete details of what was discussed",
      "speakers_involved": "If identifiable, who brought this up",
      "source_quotes": ["Quote 1", "Quote 2"],
      "why_important": "Why this matters for the SAP project",
      "sap_analysis": "Detailed SAP perspective on this finding",
      "sap_recommendation": "Specific actionable recommendation",
      "sap_best_practice": "Relevant SAP standard or Fiori app",
      "risk_level": "high|medium|low",
      "risk_explanation": "What could go wrong if ignored",
      "related_checklist_items": [item_ids if related to existing items]
    }
  ],
  "summary": {
    "total_obtained": number,
    "total_missing": number,
    "items_changed": number,
    "stray_topics_found": number,
    "key_concerns": ["List of main concerns identified"]
  }
}
\`\`\`

IMPORTANT:
- Be THOROUGH - don't miss any stray discussions
- Be CONSERVATIVE - only mark obtained with concrete evidence
- Be DETAILED - extract full context, not just summaries
- Return ONLY valid JSON.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }]
  });

  let rawContent = response.content[0].text;
  rawContent = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  let result;
  try {
    result = JSON.parse(rawContent);
  } catch (parseError) {
    console.error('Re-analysis JSON parse error:', parseError.message);
    try {
      const lastBrace = rawContent.lastIndexOf('}');
      if (lastBrace > 0) {
        rawContent = rawContent.substring(0, lastBrace + 1);
      }
      result = JSON.parse(rawContent);
    } catch (retryError) {
      console.error('Re-analysis retry parse failed:', retryError.message);
      return { error: 'Failed to parse analysis result', changes: 0 };
    }
  }

  // Apply changes
  let changesCount = 0;

  // 1. Mark new items as obtained
  if (result.items_to_obtain && result.items_to_obtain.length > 0) {
    for (const item of result.items_to_obtain) {
      await db.query(`
        UPDATE session_checklist_items
        SET
          status = 'obtained',
          obtained_text = $1,
          obtained_confidence = $2,
          obtained_source = 'reanalysis',
          obtained_at = CURRENT_TIMESTAMP
        WHERE id = $3 AND session_id = $4
      `, [
        item.obtained_text,
        item.confidence,
        item.item_id,
        sessionId
      ]);
      changesCount++;
    }
  }

  // 2. Reset items back to missing if evidence was weak
  if (result.items_to_reset_to_missing && result.items_to_reset_to_missing.length > 0) {
    for (const item of result.items_to_reset_to_missing) {
      await db.query(`
        UPDATE session_checklist_items
        SET
          status = 'missing',
          obtained_text = NULL,
          obtained_confidence = NULL,
          obtained_source = NULL,
          obtained_at = NULL
        WHERE id = $1 AND session_id = $2
      `, [item.item_id, sessionId]);
      changesCount++;
    }
  }

  // 3. Save stray topics as additional findings
  let savedFindings = [];
  if (result.stray_topics && result.stray_topics.length > 0) {
    for (const finding of result.stray_topics) {
      const insertResult = await db.query(`
        INSERT INTO session_additional_findings
          (session_id, recording_id, finding_type, topic, details, sap_analysis,
           sap_recommendation, sap_risk_level, sap_best_practice, source_quote)
        VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [
        sessionId,
        finding.finding_type || 'other',
        finding.topic,
        `${finding.context || ''}\n\n${finding.details || ''}\n\nWhy Important: ${finding.why_important || ''}`,
        finding.sap_analysis,
        finding.sap_recommendation,
        finding.risk_level || 'medium',
        finding.sap_best_practice,
        Array.isArray(finding.source_quotes) ? finding.source_quotes.join(' | ') : finding.source_quotes
      ]);
      savedFindings.push(insertResult.rows[0]);
    }
  }

  // Get updated counts
  const statsResult = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'obtained') as obtained_count,
      COUNT(*) FILTER (WHERE status = 'missing') as missing_count
    FROM session_checklist_items
    WHERE session_id = $1
  `, [sessionId]);

  const stats = statsResult.rows[0];

  return {
    success: true,
    changesApplied: changesCount,
    itemsObtained: result.items_to_obtain?.length || 0,
    itemsResetToMissing: result.items_to_reset_to_missing?.length || 0,
    strayTopicsFound: savedFindings.length,
    newFindings: savedFindings,
    summary: result.summary,
    currentStats: {
      obtained: parseInt(stats.obtained_count),
      missing: parseInt(stats.missing_count)
    }
  };
}

module.exports = {
  generateDirectChecklist,
  analyzeTranscriptionAgainstChecklist,
  analyzeDocumentAgainstChecklist,
  reanalyzeAllTranscripts,
  saveChecklistItems,
  markItemsAsObtained,
  saveAdditionalFindings,
  getSessionFindings
};
