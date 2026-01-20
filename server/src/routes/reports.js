const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const XLSX = require('xlsx');
const db = require('../models/db');
const { generateSessionReportPDF } = require('../services/pdfReportGenerator');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Get session completion status
router.get('/session/:sessionId/status', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Get total questions and completed questions
    const result = await db.query(`
      SELECT
        COUNT(q.id) as total_questions,
        COUNT(CASE WHEN a.status = 'completed' THEN 1 END) as completed_questions,
        COUNT(CASE WHEN a.id IS NOT NULL THEN 1 END) as answered_questions
      FROM questions q
      LEFT JOIN answers a ON q.id = a.question_id
      WHERE q.session_id = $1
    `, [sessionId]);

    const { total_questions, completed_questions, answered_questions } = result.rows[0];
    const completionPercent = total_questions > 0
      ? Math.round((parseInt(completed_questions) / parseInt(total_questions)) * 100)
      : 0;

    // Check if a report already exists
    const reportResult = await db.query(
      'SELECT id, status, created_at FROM session_reports WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1',
      [sessionId]
    );

    res.json({
      total_questions: parseInt(total_questions),
      completed_questions: parseInt(completed_questions),
      answered_questions: parseInt(answered_questions),
      completion_percent: completionPercent,
      is_complete: parseInt(completed_questions) === parseInt(total_questions) && parseInt(total_questions) > 0,
      existing_report: reportResult.rows[0] || null
    });
  } catch (error) {
    console.error('Error getting session status:', error);
    res.status(500).json({ error: 'Failed to get session status' });
  }
});

// Get all reports for a session
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const result = await db.query(`
      SELECT * FROM session_reports
      WHERE session_id = $1
      ORDER BY created_at DESC
    `, [sessionId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error getting reports:', error);
    res.status(500).json({ error: 'Failed to get reports' });
  }
});

// Get a single report
router.get('/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;

    const result = await db.query('SELECT * FROM session_reports WHERE id = $1', [reportId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error getting report:', error);
    res.status(500).json({ error: 'Failed to get report' });
  }
});

// Generate a new report for a session
router.post('/session/:sessionId/generate', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Get session details
    const sessionResult = await db.query(`
      SELECT s.*, w.name as workshop_name, w.client_name
      FROM sessions s
      JOIN workshops w ON s.workshop_id = w.id
      WHERE s.id = $1
    `, [sessionId]);

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionResult.rows[0];

    // Get all questions with their answers and observations
    const questionsResult = await db.query(`
      SELECT
        q.id,
        q.question_number,
        q.question_text,
        q.category_name,
        q.is_critical,
        e.name as entity_name,
        e.code as entity_code,
        a.text_response,
        a.respondent_name,
        a.respondent_role,
        a.notes,
        a.status as answer_status
      FROM questions q
      LEFT JOIN entities e ON q.entity_id = e.id
      LEFT JOIN answers a ON q.id = a.question_id
      WHERE q.session_id = $1
      ORDER BY q.question_number
    `, [sessionId]);

    // Get observations for each answered question
    const observationsResult = await db.query(`
      SELECT
        o.*,
        a.question_id
      FROM observations o
      JOIN answers a ON o.answer_id = a.id
      JOIN questions q ON a.question_id = q.id
      WHERE q.session_id = $1
      ORDER BY o.observation_number DESC
    `, [sessionId]);

    // Group observations by question_id and get the latest
    const observationsByQuestion = {};
    observationsResult.rows.forEach(obs => {
      if (!observationsByQuestion[obs.question_id]) {
        observationsByQuestion[obs.question_id] = obs;
      }
    });

    // Build context for AI
    let context = `# Workshop Session Report Generation

## Workshop: ${session.workshop_name}
## Client: ${session.client_name || 'Not specified'}
## Session: ${session.name} (${session.module})
## Description: ${session.description || 'N/A'}

---

## Questions and Findings

`;

    // Group questions by category
    const questionsByCategory = {};
    questionsResult.rows.forEach(q => {
      const category = q.category_name || 'General';
      if (!questionsByCategory[category]) {
        questionsByCategory[category] = [];
      }
      questionsByCategory[category].push(q);
    });

    // Add questions and findings to context
    for (const [category, questions] of Object.entries(questionsByCategory)) {
      context += `### ${category}\n\n`;

      for (const q of questions) {
        context += `**Q${q.question_number}${q.is_critical ? ' [CRITICAL]' : ''}: ${q.question_text}**\n`;
        if (q.entity_code) {
          context += `Entity: ${q.entity_name} (${q.entity_code})\n`;
        }

        if (q.text_response) {
          context += `Response: ${q.text_response}\n`;
          if (q.respondent_name) {
            context += `Respondent: ${q.respondent_name} (${q.respondent_role || 'Role not specified'})\n`;
          }
        } else {
          context += `Response: Not answered\n`;
        }

        // Add observation if available
        const obs = observationsByQuestion[q.id];
        if (obs) {
          const obtained = typeof obs.obtained_info === 'string'
            ? JSON.parse(obs.obtained_info)
            : (obs.obtained_info || []);
          const missing = typeof obs.missing_info === 'string'
            ? JSON.parse(obs.missing_info)
            : (obs.missing_info || []);

          if (obtained.length > 0) {
            context += `\nInformation Obtained:\n`;
            obtained.forEach(item => {
              context += `- ${item.item} (${item.confidence} confidence)\n`;
            });
          }

          if (missing.length > 0) {
            context += `\nInformation Still Missing:\n`;
            missing.forEach(item => {
              context += `- ${item.item} [${item.importance}]\n`;
            });
          }
        }

        context += `\n---\n\n`;
      }
    }

    console.log('Generating report for session', sessionId, '- context length:', context.length);

    // Generate report using Claude
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [
        {
          role: 'user',
          content: `You are an SAP S/4HANA implementation consultant creating a comprehensive findings report from a pre-discovery workshop session.

Based on the workshop data provided, generate a structured report in JSON format:

{
  "title": "Session title/name for the report",
  "executive_summary": "2-3 paragraph high-level summary of the session findings, key insights, and overall readiness assessment",
  "kds_items": [
    {
      "category": "Category (e.g., Organizational Structure, Master Data, Configuration, Integration)",
      "area": "Functional area (e.g., Chart of Accounts, Cost Centers, Material Types)",
      "item": "Specific data structure or configuration element",
      "current_state": "Current state description from workshop findings",
      "sap_relevance": "How this maps to SAP S/4HANA",
      "priority": "critical/high/medium/low",
      "source_questions": [question numbers that provided this information]
    }
  ],
  "bpml_items": [
    {
      "process_id": "BP-001 format",
      "process_name": "Name of the business process",
      "category": "Process category (e.g., Procure-to-Pay, Order-to-Cash, Record-to-Report)",
      "description": "Brief description of the process",
      "frequency": "How often this process runs",
      "stakeholders": ["Departments/roles involved"],
      "pain_points": ["Current challenges identified"],
      "sap_module": "Relevant SAP module",
      "source_questions": [question numbers]
    }
  ],
  "key_findings": [
    {
      "category": "Category name",
      "finding": "Detailed finding description with specific data points",
      "impact": "high/medium/low",
      "entities_affected": ["entity codes affected"]
    }
  ],
  "recommendations": [
    {
      "recommendation": "Specific recommendation",
      "priority": "critical/high/medium/low",
      "rationale": "Why this is recommended",
      "related_findings": ["Brief reference to related findings"]
    }
  ],
  "risks_and_gaps": [
    {
      "risk": "Description of the risk or gap",
      "severity": "critical/high/medium/low",
      "mitigation": "Suggested mitigation approach",
      "questions_affected": [question numbers]
    }
  ],
  "next_steps": [
    {
      "action": "Specific action item",
      "owner": "Suggested owner (Client/Consultant/Both)",
      "timeline": "Suggested timeline"
    }
  ]
}

IMPORTANT GUIDELINES:
1. Be specific - include actual data, numbers, and names from the responses
2. Identify patterns across multiple questions and entities
3. Highlight critical questions that were not fully answered
4. Focus on implementation-relevant insights for SAP S/4HANA
5. Consider UAE/GCC specific requirements where applicable
6. Make recommendations actionable and prioritized
7. KDS (Key Data Structures) should capture all configuration and master data requirements discovered:
   - Organizational structures (company codes, plants, sales orgs, etc.)
   - Master data requirements (customers, vendors, materials, GL accounts, cost centers)
   - Configuration elements (document types, pricing procedures, movement types)
   - Integration points and interfaces
8. BPML (Business Process Master List) should document all business processes discovered:
   - Group by category (Procure-to-Pay, Order-to-Cash, Record-to-Report, etc.)
   - Include current pain points and stakeholders
   - Map to relevant SAP modules
9. Only output valid JSON, nothing else

Workshop data to analyze:

${context}`
        }
      ]
    });

    let reportData;
    try {
      let rawContent = response.content[0].text;
      rawContent = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      reportData = JSON.parse(rawContent);
    } catch (parseError) {
      console.error('Failed to parse report JSON:', parseError);
      return res.status(500).json({ error: 'Failed to parse generated report' });
    }

    // Save report to database
    const insertResult = await db.query(`
      INSERT INTO session_reports (
        session_id, title, executive_summary, key_findings,
        recommendations, risks_and_gaps, next_steps,
        kds_items, bpml_items,
        raw_content, generated_by, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      sessionId,
      reportData.title || `${session.name} - Findings Report`,
      reportData.executive_summary || '',
      JSON.stringify(reportData.key_findings || []),
      JSON.stringify(reportData.recommendations || []),
      JSON.stringify(reportData.risks_and_gaps || []),
      JSON.stringify(reportData.next_steps || []),
      JSON.stringify(reportData.kds_items || []),
      JSON.stringify(reportData.bpml_items || []),
      response.content[0].text,
      'AI (Claude)',
      'draft'
    ]);

    res.json({
      success: true,
      report: insertResult.rows[0]
    });

  } catch (error) {
    console.error('Report generation error:', error);

    if (error.status === 401) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    res.status(500).json({
      error: 'Failed to generate report',
      details: error.message
    });
  }
});

// Update report status
router.patch('/:reportId/status', async (req, res) => {
  try {
    const { reportId } = req.params;
    const { status } = req.body;

    const result = await db.query(`
      UPDATE session_reports
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [status, reportId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating report status:', error);
    res.status(500).json({ error: 'Failed to update report status' });
  }
});

// Delete a report
router.delete('/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;

    await db.query('DELETE FROM session_reports WHERE id = $1', [reportId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting report:', error);
    res.status(500).json({ error: 'Failed to delete report' });
  }
});

// Export report as PDF
router.get('/:reportId/export/pdf', async (req, res) => {
  try {
    const { reportId } = req.params;

    // Get report to find session ID
    const reportResult = await db.query(
      'SELECT r.*, s.name as session_name FROM session_reports r JOIN sessions s ON r.session_id = s.id WHERE r.id = $1',
      [reportId]
    );

    if (reportResult.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const report = reportResult.rows[0];

    // Generate PDF
    const pdfDoc = await generateSessionReportPDF(report.session_id, reportId);

    // Set response headers for PDF download
    const fileName = `AS-IS_Report_${report.session_name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    // Pipe PDF to response
    pdfDoc.pipe(res);
    pdfDoc.end();

  } catch (error) {
    console.error('Error exporting PDF:', error);
    res.status(500).json({ error: 'Failed to export PDF', details: error.message });
  }
});

// Export session as PDF (without saved report - generates from raw data)
router.get('/session/:sessionId/export/pdf', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Get session info
    const sessionResult = await db.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionResult.rows[0];

    // Check if there's an existing report for this session
    const reportResult = await db.query(
      'SELECT id FROM session_reports WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1',
      [sessionId]
    );

    const reportId = reportResult.rows[0]?.id || null;

    // Generate PDF
    const pdfDoc = await generateSessionReportPDF(sessionId, reportId);

    // Set response headers for PDF download
    const fileName = `AS-IS_Report_${session.name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    // Pipe PDF to response
    pdfDoc.pipe(res);
    pdfDoc.end();

  } catch (error) {
    console.error('Error exporting session PDF:', error);
    res.status(500).json({ error: 'Failed to export PDF', details: error.message });
  }
});

// Export report as Excel
router.get('/:reportId/export/excel', async (req, res) => {
  try {
    const { reportId } = req.params;

    // Get report with session info
    const reportResult = await db.query(`
      SELECT r.*, s.name as session_name, s.module, s.description as session_description,
             w.name as workshop_name, w.client_name
      FROM session_reports r
      JOIN sessions s ON r.session_id = s.id
      JOIN workshops w ON s.workshop_id = w.id
      WHERE r.id = $1
    `, [reportId]);

    if (reportResult.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const report = reportResult.rows[0];

    // Get all findings from observations
    const findingsResult = await db.query(`
      SELECT
        q.question_number,
        q.category_name,
        q.is_critical,
        e.code as entity_code,
        o.obtained_info
      FROM observations o
      JOIN answers a ON o.answer_id = a.id
      JOIN questions q ON a.question_id = q.id
      LEFT JOIN entities e ON q.entity_id = e.id
      WHERE q.session_id = $1
      ORDER BY q.question_number
    `, [report.session_id]);

    // Parse JSON fields
    const keyFindings = typeof report.key_findings === 'string' ? JSON.parse(report.key_findings) : (report.key_findings || []);
    const recommendations = typeof report.recommendations === 'string' ? JSON.parse(report.recommendations) : (report.recommendations || []);
    const risksAndGaps = typeof report.risks_and_gaps === 'string' ? JSON.parse(report.risks_and_gaps) : (report.risks_and_gaps || []);
    const nextSteps = typeof report.next_steps === 'string' ? JSON.parse(report.next_steps) : (report.next_steps || []);
    const kdsItems = typeof report.kds_items === 'string' ? JSON.parse(report.kds_items) : (report.kds_items || []);
    const bpmlItems = typeof report.bpml_items === 'string' ? JSON.parse(report.bpml_items) : (report.bpml_items || []);

    // Create workbook
    const wb = XLSX.utils.book_new();

    // 1. Executive Summary Sheet
    const summaryData = [
      ['SESSION REPORT'],
      [''],
      ['Workshop:', report.workshop_name],
      ['Client:', report.client_name || '-'],
      ['Session:', report.session_name],
      ['Module:', report.module || '-'],
      ['Generated:', new Date(report.created_at).toLocaleDateString()],
      ['Status:', report.status === 'final' ? 'Finalized' : 'Draft'],
      [''],
      ['EXECUTIVE SUMMARY'],
      [''],
      [report.executive_summary || 'No executive summary available.']
    ];
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    summaryWs['!cols'] = [{ wch: 15 }, { wch: 80 }];
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Executive Summary');

    // 2. All Findings Sheet
    const allFindings = [];
    findingsResult.rows.forEach(row => {
      const obtained = typeof row.obtained_info === 'string'
        ? JSON.parse(row.obtained_info)
        : (row.obtained_info || []);
      obtained.forEach(item => {
        allFindings.push({
          'Q#': row.question_number,
          'Category': row.category_name || '-',
          'Entity': row.entity_code || '-',
          'Critical': row.is_critical ? 'Yes' : 'No',
          'Finding': item.item,
          'Confidence': item.confidence || '-',
          'Source': item.source || '-'
        });
      });
    });
    if (allFindings.length > 0) {
      const findingsWs = XLSX.utils.json_to_sheet(allFindings);
      findingsWs['!cols'] = [
        { wch: 5 }, { wch: 20 }, { wch: 10 }, { wch: 8 }, { wch: 60 }, { wch: 12 }, { wch: 15 }
      ];
      XLSX.utils.book_append_sheet(wb, findingsWs, 'All Findings');
    }

    // 3. KDS Sheet
    if (kdsItems.length > 0) {
      const kdsData = kdsItems.map(kds => ({
        'Category': kds.category || '-',
        'Area': kds.area || '-',
        'Item': kds.item || '-',
        'Current State': kds.current_state || '-',
        'SAP Relevance': kds.sap_relevance || '-',
        'Priority': kds.priority || '-',
        'Source Questions': kds.source_questions?.length > 0 ? `Q${kds.source_questions.join(', Q')}` : '-'
      }));
      const kdsWs = XLSX.utils.json_to_sheet(kdsData);
      kdsWs['!cols'] = [
        { wch: 20 }, { wch: 20 }, { wch: 30 }, { wch: 40 }, { wch: 40 }, { wch: 10 }, { wch: 20 }
      ];
      XLSX.utils.book_append_sheet(wb, kdsWs, 'KDS');
    }

    // 4. BPML Sheet
    if (bpmlItems.length > 0) {
      const bpmlData = bpmlItems.map(bpml => ({
        'Process ID': bpml.process_id || '-',
        'Process Name': bpml.process_name || '-',
        'Category': bpml.category || '-',
        'Description': bpml.description || '-',
        'Frequency': bpml.frequency || '-',
        'Stakeholders': bpml.stakeholders?.join(', ') || '-',
        'Pain Points': bpml.pain_points?.join('; ') || '-',
        'SAP Module': bpml.sap_module || '-',
        'Source Questions': bpml.source_questions?.length > 0 ? `Q${bpml.source_questions.join(', Q')}` : '-'
      }));
      const bpmlWs = XLSX.utils.json_to_sheet(bpmlData);
      bpmlWs['!cols'] = [
        { wch: 12 }, { wch: 30 }, { wch: 20 }, { wch: 50 }, { wch: 15 }, { wch: 30 }, { wch: 40 }, { wch: 12 }, { wch: 20 }
      ];
      XLSX.utils.book_append_sheet(wb, bpmlWs, 'BPML');
    }

    // 5. Key Findings Sheet
    if (keyFindings.length > 0) {
      const findingsData = keyFindings.map((f, idx) => ({
        '#': idx + 1,
        'Category': f.category || '-',
        'Finding': f.finding || '-',
        'Impact': f.impact || '-',
        'Entities Affected': f.entities_affected?.join(', ') || '-'
      }));
      const keyFindingsWs = XLSX.utils.json_to_sheet(findingsData);
      keyFindingsWs['!cols'] = [
        { wch: 5 }, { wch: 20 }, { wch: 60 }, { wch: 10 }, { wch: 25 }
      ];
      XLSX.utils.book_append_sheet(wb, keyFindingsWs, 'Key Findings');
    }

    // 6. Recommendations Sheet
    if (recommendations.length > 0) {
      const recsData = recommendations.map((r, idx) => ({
        '#': idx + 1,
        'Priority': r.priority || '-',
        'Recommendation': r.recommendation || '-',
        'Rationale': r.rationale || '-',
        'Related Findings': r.related_findings?.join('; ') || '-'
      }));
      const recsWs = XLSX.utils.json_to_sheet(recsData);
      recsWs['!cols'] = [
        { wch: 5 }, { wch: 10 }, { wch: 50 }, { wch: 50 }, { wch: 30 }
      ];
      XLSX.utils.book_append_sheet(wb, recsWs, 'Recommendations');
    }

    // 7. Risks & Gaps Sheet
    if (risksAndGaps.length > 0) {
      const risksData = risksAndGaps.map((r, idx) => ({
        '#': idx + 1,
        'Severity': r.severity || '-',
        'Risk / Gap': r.risk || '-',
        'Mitigation': r.mitigation || '-',
        'Questions Affected': r.questions_affected?.length > 0 ? `Q${r.questions_affected.join(', Q')}` : '-'
      }));
      const risksWs = XLSX.utils.json_to_sheet(risksData);
      risksWs['!cols'] = [
        { wch: 5 }, { wch: 10 }, { wch: 50 }, { wch: 50 }, { wch: 25 }
      ];
      XLSX.utils.book_append_sheet(wb, risksWs, 'Risks & Gaps');
    }

    // 8. Next Steps Sheet
    if (nextSteps.length > 0) {
      const stepsData = nextSteps.map((s, idx) => ({
        '#': idx + 1,
        'Action': s.action || '-',
        'Owner': s.owner || '-',
        'Timeline': s.timeline || '-'
      }));
      const stepsWs = XLSX.utils.json_to_sheet(stepsData);
      stepsWs['!cols'] = [
        { wch: 5 }, { wch: 60 }, { wch: 20 }, { wch: 20 }
      ];
      XLSX.utils.book_append_sheet(wb, stepsWs, 'Next Steps');
    }

    // Generate buffer
    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Set response headers for Excel download
    const fileName = `Session_Report_${report.session_name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    res.send(excelBuffer);

  } catch (error) {
    console.error('Error exporting Excel:', error);
    res.status(500).json({ error: 'Failed to export Excel', details: error.message });
  }
});

// Export report as Markdown
router.get('/:reportId/export/markdown', async (req, res) => {
  try {
    const { reportId } = req.params;

    // Get report with session info
    const reportResult = await db.query(`
      SELECT r.*, s.name as session_name, s.module, s.description as session_description,
             w.name as workshop_name, w.client_name
      FROM session_reports r
      JOIN sessions s ON r.session_id = s.id
      JOIN workshops w ON s.workshop_id = w.id
      WHERE r.id = $1
    `, [reportId]);

    if (reportResult.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const report = reportResult.rows[0];

    // Get all findings from observations
    const findingsResult = await db.query(`
      SELECT
        q.question_number,
        q.category_name,
        q.is_critical,
        e.code as entity_code,
        o.obtained_info
      FROM observations o
      JOIN answers a ON o.answer_id = a.id
      JOIN questions q ON a.question_id = q.id
      LEFT JOIN entities e ON q.entity_id = e.id
      WHERE q.session_id = $1
      ORDER BY q.question_number
    `, [report.session_id]);

    // Parse JSON fields
    const keyFindings = typeof report.key_findings === 'string' ? JSON.parse(report.key_findings) : (report.key_findings || []);
    const recommendations = typeof report.recommendations === 'string' ? JSON.parse(report.recommendations) : (report.recommendations || []);
    const risksAndGaps = typeof report.risks_and_gaps === 'string' ? JSON.parse(report.risks_and_gaps) : (report.risks_and_gaps || []);
    const nextSteps = typeof report.next_steps === 'string' ? JSON.parse(report.next_steps) : (report.next_steps || []);
    const kdsItems = typeof report.kds_items === 'string' ? JSON.parse(report.kds_items) : (report.kds_items || []);
    const bpmlItems = typeof report.bpml_items === 'string' ? JSON.parse(report.bpml_items) : (report.bpml_items || []);

    // Build Markdown content
    let md = '';

    // Header
    md += `# ${report.title || 'Session Report'}\n\n`;
    md += `| | |\n|---|---|\n`;
    md += `| **Workshop** | ${report.workshop_name} |\n`;
    md += `| **Client** | ${report.client_name || '-'} |\n`;
    md += `| **Session** | ${report.session_name} |\n`;
    md += `| **Module** | ${report.module || '-'} |\n`;
    md += `| **Generated** | ${new Date(report.created_at).toLocaleDateString()} |\n`;
    md += `| **Status** | ${report.status === 'final' ? 'Finalized' : 'Draft'} |\n\n`;

    // Executive Summary
    md += `---\n\n## Executive Summary\n\n`;
    md += `${report.executive_summary || 'No executive summary available.'}\n\n`;

    // All Findings
    const allFindings = [];
    findingsResult.rows.forEach(row => {
      const obtained = typeof row.obtained_info === 'string'
        ? JSON.parse(row.obtained_info)
        : (row.obtained_info || []);
      obtained.forEach(item => {
        allFindings.push({
          questionNumber: row.question_number,
          category: row.category_name || '-',
          entity: row.entity_code || '-',
          isCritical: row.is_critical,
          item: item.item,
          confidence: item.confidence || '-',
          source: item.source || '-'
        });
      });
    });

    if (allFindings.length > 0) {
      md += `---\n\n## All Findings (${allFindings.length})\n\n`;
      md += `| Q# | Category | Entity | Critical | Finding | Confidence | Source |\n`;
      md += `|---|---|---|---|---|---|---|\n`;
      allFindings.forEach(f => {
        md += `| ${f.questionNumber} | ${f.category} | ${f.entity} | ${f.isCritical ? 'Yes' : 'No'} | ${f.item.replace(/\|/g, '\\|')} | ${f.confidence} | ${f.source} |\n`;
      });
      md += '\n';
    }

    // KDS
    if (kdsItems.length > 0) {
      md += `---\n\n## Key Data Structures (KDS) (${kdsItems.length})\n\n`;
      md += `| Category | Area | Item | Current State | SAP Relevance | Priority | Source |\n`;
      md += `|---|---|---|---|---|---|---|\n`;
      kdsItems.forEach(kds => {
        const source = kds.source_questions?.length > 0 ? `Q${kds.source_questions.join(', Q')}` : '-';
        md += `| ${kds.category || '-'} | ${kds.area || '-'} | ${kds.item || '-'} | ${(kds.current_state || '-').replace(/\|/g, '\\|')} | ${(kds.sap_relevance || '-').replace(/\|/g, '\\|')} | ${kds.priority || '-'} | ${source} |\n`;
      });
      md += '\n';
    }

    // BPML
    if (bpmlItems.length > 0) {
      md += `---\n\n## Business Process Master List (BPML) (${bpmlItems.length})\n\n`;
      bpmlItems.forEach((bpml, idx) => {
        md += `### ${idx + 1}. ${bpml.process_name || 'Unnamed Process'}\n\n`;
        md += `- **Process ID:** ${bpml.process_id || '-'}\n`;
        md += `- **Category:** ${bpml.category || '-'}\n`;
        md += `- **SAP Module:** ${bpml.sap_module || '-'}\n`;
        md += `- **Frequency:** ${bpml.frequency || '-'}\n`;
        md += `- **Stakeholders:** ${bpml.stakeholders?.join(', ') || '-'}\n`;
        md += `- **Description:** ${bpml.description || '-'}\n`;
        if (bpml.pain_points?.length > 0) {
          md += `- **Pain Points:**\n`;
          bpml.pain_points.forEach(p => md += `  - ${p}\n`);
        }
        if (bpml.source_questions?.length > 0) {
          md += `- **Source:** Q${bpml.source_questions.join(', Q')}\n`;
        }
        md += '\n';
      });
    }

    // Key Findings
    if (keyFindings.length > 0) {
      md += `---\n\n## Key Findings (${keyFindings.length})\n\n`;
      keyFindings.forEach((f, idx) => {
        const impactBadge = f.impact === 'high' ? '🔴' : f.impact === 'medium' ? '🟡' : '🟢';
        md += `### ${idx + 1}. ${f.category || 'General'} ${impactBadge}\n\n`;
        md += `**Impact:** ${f.impact || '-'}\n\n`;
        md += `${f.finding}\n\n`;
        if (f.entities_affected?.length > 0) {
          md += `**Entities Affected:** ${f.entities_affected.join(', ')}\n\n`;
        }
      });
    }

    // Recommendations
    if (recommendations.length > 0) {
      md += `---\n\n## Recommendations (${recommendations.length})\n\n`;
      recommendations.forEach((r, idx) => {
        const priorityBadge = r.priority === 'critical' ? '🔴' : r.priority === 'high' ? '🟠' : r.priority === 'medium' ? '🟡' : '🔵';
        md += `### ${idx + 1}. ${priorityBadge} [${(r.priority || '-').toUpperCase()}]\n\n`;
        md += `**${r.recommendation}**\n\n`;
        md += `${r.rationale || ''}\n\n`;
        if (r.related_findings?.length > 0) {
          md += `*Related: ${r.related_findings.join('; ')}*\n\n`;
        }
      });
    }

    // Risks & Gaps
    if (risksAndGaps.length > 0) {
      md += `---\n\n## Risks & Gaps (${risksAndGaps.length})\n\n`;
      risksAndGaps.forEach((r, idx) => {
        const severityBadge = r.severity === 'critical' ? '🔴' : r.severity === 'high' ? '🟠' : r.severity === 'medium' ? '🟡' : '🔵';
        md += `### ${idx + 1}. ${severityBadge} [${(r.severity || '-').toUpperCase()}]\n\n`;
        md += `**Risk:** ${r.risk}\n\n`;
        md += `**Mitigation:** ${r.mitigation || '-'}\n\n`;
        if (r.questions_affected?.length > 0) {
          md += `*Questions Affected: Q${r.questions_affected.join(', Q')}*\n\n`;
        }
      });
    }

    // Next Steps
    if (nextSteps.length > 0) {
      md += `---\n\n## Next Steps (${nextSteps.length})\n\n`;
      md += `| # | Action | Owner | Timeline |\n`;
      md += `|---|---|---|---|\n`;
      nextSteps.forEach((s, idx) => {
        md += `| ${idx + 1} | ${(s.action || '-').replace(/\|/g, '\\|')} | ${s.owner || '-'} | ${s.timeline || '-'} |\n`;
      });
      md += '\n';
    }

    // Footer
    md += `---\n\n*Generated by NXSYS Workshop Manager | ${new Date().toLocaleDateString()}*\n`;

    // Set response headers for Markdown download
    const fileName = `Session_Report_${report.session_name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.md`;
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    res.send(md);

  } catch (error) {
    console.error('Error exporting Markdown:', error);
    res.status(500).json({ error: 'Failed to export Markdown', details: error.message });
  }
});

module.exports = router;
