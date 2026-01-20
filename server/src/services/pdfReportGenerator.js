const PDFDocument = require('pdfkit');
const db = require('../models/db');

// NXSYS Brand Colors
const COLORS = {
  primary: '#E63946',      // NXSYS Red
  secondary: '#1f2937',    // Dark grey
  lightGrey: '#6b7280',
  background: '#f9fafb',
  white: '#ffffff',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#3b82f6'
};

// Page tracking
let currentPage = 1;

/**
 * Generate AS-IS Report PDF for a session
 */
async function generateSessionReportPDF(sessionId, reportId = null) {
  currentPage = 1;

  // Fetch all necessary data
  const sessionData = await fetchSessionData(sessionId);
  const reportData = reportId ? await fetchReportData(reportId) : null;

  // Get KDS and BPML from report data (AI-generated) if available,
  // otherwise extract from observations as fallback
  const kdsList = reportData?.kds_items?.length > 0
    ? reportData.kds_items
    : extractKDSList(sessionData);
  const bpmlList = reportData?.bpml_items?.length > 0
    ? reportData.bpml_items
    : extractBPMLList(sessionData);

  // Create PDF document
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 60, bottom: 60, left: 50, right: 50 },
    bufferPages: true,
    info: {
      Title: `AS-IS Report - ${sessionData.session.name}`,
      Author: 'NXSYS - UAE\'s Leading SAP Integrator',
      Subject: 'SAP S/4HANA Pre-Discovery Workshop Report',
      Creator: 'NXWorks by NXSYS'
    }
  });

  // Generate PDF content
  addCoverPage(doc, sessionData, reportData);

  doc.addPage();
  currentPage++;
  addTableOfContents(doc, sessionData, reportData, kdsList, bpmlList);

  doc.addPage();
  currentPage++;
  addExecutiveSummary(doc, sessionData, reportData);

  doc.addPage();
  currentPage++;
  addSessionOverview(doc, sessionData);

  // KDS List
  if (kdsList.length > 0) {
    doc.addPage();
    currentPage++;
    addKDSList(doc, kdsList, sessionData);
  }

  // BPML List
  if (bpmlList.length > 0) {
    doc.addPage();
    currentPage++;
    addBPMLList(doc, bpmlList, sessionData);
  }

  // Questions & Findings
  doc.addPage();
  currentPage++;
  addQuestionsAndFindings(doc, sessionData);

  // Report sections (if report exists)
  if (reportData) {
    if (reportData.key_findings?.length > 0) {
      doc.addPage();
      currentPage++;
      addKeyFindings(doc, reportData);
    }

    if (reportData.recommendations?.length > 0) {
      doc.addPage();
      currentPage++;
      addRecommendations(doc, reportData);
    }

    if (reportData.risks_and_gaps?.length > 0) {
      doc.addPage();
      currentPage++;
      addRisksAndGaps(doc, reportData);
    }

    if (reportData.next_steps?.length > 0) {
      doc.addPage();
      currentPage++;
      addNextSteps(doc, reportData);
    }
  }

  // Appendix (only if there are completed questions)
  const completedQuestions = sessionData.questions.filter(q => q.answer_status === 'completed');
  if (completedQuestions.length > 0) {
    doc.addPage();
    currentPage++;
    addAppendix(doc, sessionData);
  }

  return doc;
}

/**
 * Extract KDS (Key Design Specifications) from obtained_info
 */
function extractKDSList(sessionData) {
  const kdsList = [];

  sessionData.questions.forEach(q => {
    if (q.observation?.obtained_info?.length > 0) {
      q.observation.obtained_info.forEach(item => {
        kdsList.push({
          item: item.item,
          confidence: item.confidence || 'medium',
          questionNumber: q.question_number,
          category: q.category_name || 'General',
          entity: q.entity_code || 'N/A'
        });
      });
    }
  });

  return kdsList;
}

/**
 * Extract BPML (Business Process Master List) from findings
 * Looks for items mentioning processes, workflows, procedures
 */
function extractBPMLList(sessionData) {
  const bpmlList = [];
  const processKeywords = ['process', 'workflow', 'procedure', 'flow', 'cycle', 'approval', 'transaction'];

  sessionData.questions.forEach(q => {
    if (q.observation?.obtained_info?.length > 0) {
      q.observation.obtained_info.forEach(item => {
        const itemLower = item.item.toLowerCase();
        const isProcess = processKeywords.some(keyword => itemLower.includes(keyword));

        if (isProcess) {
          bpmlList.push({
            process: item.item,
            questionNumber: q.question_number,
            category: q.category_name || 'General',
            entity: q.entity_code || 'N/A',
            confidence: item.confidence || 'medium'
          });
        }
      });
    }

    // Also check additional_findings
    if (q.observation?.additional_findings?.length > 0) {
      q.observation.additional_findings.forEach(finding => {
        const findingLower = (finding.finding || finding).toLowerCase();
        const isProcess = processKeywords.some(keyword => findingLower.includes(keyword));

        if (isProcess) {
          bpmlList.push({
            process: finding.finding || finding,
            questionNumber: q.question_number,
            category: q.category_name || 'General',
            entity: q.entity_code || 'N/A',
            confidence: 'medium'
          });
        }
      });
    }
  });

  return bpmlList;
}

/**
 * Fetch all session data including questions, answers, observations
 */
async function fetchSessionData(sessionId) {
  // Get session info
  const sessionResult = await db.query(`
    SELECT s.*, w.name as workshop_name, w.client_name, w.industry_context
    FROM sessions s
    LEFT JOIN workshops w ON s.workshop_id = w.id
    WHERE s.id = $1
  `, [sessionId]);

  const session = sessionResult.rows[0];

  // Get all questions with answers and observations
  const questionsResult = await db.query(`
    SELECT
      q.*,
      e.name as entity_name,
      e.code as entity_code,
      a.text_response,
      a.respondent_name,
      a.respondent_role,
      a.notes,
      a.status as answer_status
    FROM questions q
    LEFT JOIN entities e ON q.entity_id = e.id
    LEFT JOIN answers a ON a.question_id = q.id
    WHERE q.session_id = $1
    ORDER BY q.question_number
  `, [sessionId]);

  // Get observations for each question
  const questions = await Promise.all(questionsResult.rows.map(async (q) => {
    const obsResult = await db.query(`
      SELECT o.* FROM observations o
      JOIN answers a ON o.answer_id = a.id
      WHERE a.question_id = $1
      ORDER BY o.observation_number DESC
      LIMIT 1
    `, [q.id]);

    const observation = obsResult.rows[0];
    return {
      ...q,
      observation: observation ? {
        obtained_info: typeof observation.obtained_info === 'string'
          ? JSON.parse(observation.obtained_info)
          : (observation.obtained_info || []),
        missing_info: typeof observation.missing_info === 'string'
          ? JSON.parse(observation.missing_info)
          : (observation.missing_info || []),
        additional_findings: typeof observation.additional_findings === 'string'
          ? JSON.parse(observation.additional_findings)
          : (observation.additional_findings || []),
        summary: observation.summary
      } : null
    };
  }));

  // Calculate statistics
  const totalQuestions = questions.length;
  const completedQuestions = questions.filter(q => q.answer_status === 'completed').length;
  const totalObtained = questions.reduce((sum, q) => sum + (q.observation?.obtained_info?.length || 0), 0);
  const totalMissing = questions.reduce((sum, q) => sum + (q.observation?.missing_info?.length || 0), 0);

  return {
    session,
    questions,
    stats: {
      totalQuestions,
      completedQuestions,
      completionRate: totalQuestions > 0 ? Math.round((completedQuestions / totalQuestions) * 100) : 0,
      totalObtained,
      totalMissing,
      informationRate: (totalObtained + totalMissing) > 0
        ? Math.round((totalObtained / (totalObtained + totalMissing)) * 100)
        : 0
    }
  };
}

/**
 * Fetch report data if exists
 */
async function fetchReportData(reportId) {
  const result = await db.query('SELECT * FROM session_reports WHERE id = $1', [reportId]);
  if (result.rows.length === 0) return null;

  const report = result.rows[0];
  return {
    ...report,
    key_findings: typeof report.key_findings === 'string'
      ? JSON.parse(report.key_findings)
      : (report.key_findings || []),
    recommendations: typeof report.recommendations === 'string'
      ? JSON.parse(report.recommendations)
      : (report.recommendations || []),
    risks_and_gaps: typeof report.risks_and_gaps === 'string'
      ? JSON.parse(report.risks_and_gaps)
      : (report.risks_and_gaps || []),
    next_steps: typeof report.next_steps === 'string'
      ? JSON.parse(report.next_steps)
      : (report.next_steps || []),
    kds_items: typeof report.kds_items === 'string'
      ? JSON.parse(report.kds_items)
      : (report.kds_items || []),
    bpml_items: typeof report.bpml_items === 'string'
      ? JSON.parse(report.bpml_items)
      : (report.bpml_items || [])
  };
}

/**
 * Add cover page
 */
function addCoverPage(doc, sessionData, reportData) {
  const { session, stats } = sessionData;

  // Red header bar
  doc.rect(0, 0, doc.page.width, 120).fill(COLORS.primary);

  // NXSYS branding text
  doc.fontSize(28).fillColor(COLORS.white)
     .text('NXSYS', 50, 45, { continued: true })
     .fontSize(12)
     .text('  UAE\'s Leading SAP Integrator', { baseline: 'alphabetic' });

  // Main title
  doc.fontSize(36).fillColor(COLORS.secondary)
     .text('AS-IS Assessment Report', 50, 200, { align: 'center' });

  // Subtitle
  doc.fontSize(18).fillColor(COLORS.lightGrey)
     .text('SAP S/4HANA Pre-Discovery Workshop', 50, 260, { align: 'center' });

  // Session name
  doc.fontSize(24).fillColor(COLORS.primary)
     .text(session.name, 50, 320, { align: 'center' });

  // Client info box
  doc.rect(100, 400, doc.page.width - 200, 150)
     .lineWidth(1)
     .stroke(COLORS.lightGrey);

  doc.fontSize(12).fillColor(COLORS.lightGrey)
     .text('CLIENT', 120, 420);
  doc.fontSize(16).fillColor(COLORS.secondary)
     .text(session.client_name || 'Not Specified', 120, 440);

  doc.fontSize(12).fillColor(COLORS.lightGrey)
     .text('WORKSHOP', 120, 480);
  doc.fontSize(14).fillColor(COLORS.secondary)
     .text(session.workshop_name || 'SAP S/4HANA Pre-Discovery', 120, 500);

  doc.fontSize(12).fillColor(COLORS.lightGrey)
     .text('DATE', 350, 420);
  doc.fontSize(14).fillColor(COLORS.secondary)
     .text(new Date().toLocaleDateString('en-US', {
       year: 'numeric', month: 'long', day: 'numeric'
     }), 350, 440);

  doc.fontSize(12).fillColor(COLORS.lightGrey)
     .text('STATUS', 350, 480);
  doc.fontSize(14).fillColor(stats.completionRate === 100 ? COLORS.success : COLORS.warning)
     .text(`${stats.completionRate}% Complete`, 350, 500);

  // Footer
  doc.fontSize(10).fillColor(COLORS.lightGrey)
     .text('Generated by NXWorks', 50, doc.page.height - 80, { align: 'center' })
     .text('CONFIDENTIAL - For Internal Use Only', 50, doc.page.height - 60, { align: 'center' });

  addPageNumber(doc, 1);
}

/**
 * Add table of contents
 */
function addTableOfContents(doc, sessionData, reportData, kdsList, bpmlList) {
  addPageHeader(doc, 'Table of Contents');

  let y = 140;
  let pageNum = 3;
  const items = [
    { title: 'Executive Summary', page: pageNum++ },
    { title: 'Session Overview', page: pageNum++ },
  ];

  if (kdsList.length > 0) {
    items.push({ title: `Key Design Specifications (${kdsList.length} items)`, page: pageNum++ });
  }

  if (bpmlList.length > 0) {
    items.push({ title: `Business Process Master List (${bpmlList.length} items)`, page: pageNum++ });
  }

  items.push({ title: 'Questions & Findings', page: pageNum++ });

  if (reportData) {
    if (reportData.key_findings?.length > 0) {
      items.push({ title: 'Key Findings', page: pageNum++ });
    }
    if (reportData.recommendations?.length > 0) {
      items.push({ title: 'Recommendations', page: pageNum++ });
    }
    if (reportData.risks_and_gaps?.length > 0) {
      items.push({ title: 'Risks & Gaps', page: pageNum++ });
    }
    if (reportData.next_steps?.length > 0) {
      items.push({ title: 'Next Steps', page: pageNum++ });
    }
  }

  const completedQuestions = sessionData.questions.filter(q => q.answer_status === 'completed');
  if (completedQuestions.length > 0) {
    items.push({ title: 'Appendix: Detailed Responses', page: pageNum });
  }

  items.forEach((item, idx) => {
    doc.fontSize(14).fillColor(COLORS.secondary)
       .text(`${idx + 1}. ${item.title}`, 80, y);
    doc.fontSize(12).fillColor(COLORS.lightGrey)
       .text(`${item.page}`, doc.page.width - 100, y, { align: 'right' });

    // Dotted line
    doc.moveTo(320, y + 10)
       .lineTo(doc.page.width - 110, y + 10)
       .dash(2, { space: 3 })
       .stroke(COLORS.lightGrey);
    doc.undash();

    y += 30;
  });

  addPageNumber(doc, 2);
}

/**
 * Add executive summary
 */
function addExecutiveSummary(doc, sessionData, reportData) {
  addPageHeader(doc, 'Executive Summary');

  const { session, stats } = sessionData;
  let y = 140;

  // Summary paragraph
  if (reportData?.executive_summary) {
    doc.fontSize(11).fillColor(COLORS.secondary)
       .text(reportData.executive_summary, 50, y, {
         width: doc.page.width - 100,
         align: 'justify',
         lineGap: 4
       });
    y = doc.y + 30;
  } else {
    doc.fontSize(11).fillColor(COLORS.secondary)
       .text(`This AS-IS Assessment Report documents the findings from the ${session.name} session conducted as part of the SAP S/4HANA Pre-Discovery Workshop for ${session.client_name || 'the client'}. The session covered ${stats.totalQuestions} discovery questions across various business areas.`, 50, y, {
         width: doc.page.width - 100,
         align: 'justify',
         lineGap: 4
       });
    y = doc.y + 30;
  }

  // Key metrics boxes
  addMetricBox(doc, 80, y, 'Questions Covered', `${stats.completedQuestions}/${stats.totalQuestions}`, COLORS.info);
  addMetricBox(doc, 230, y, 'Completion Rate', `${stats.completionRate}%`,
    stats.completionRate >= 80 ? COLORS.success : stats.completionRate >= 50 ? COLORS.warning : COLORS.danger);
  addMetricBox(doc, 380, y, 'Information Obtained', `${stats.informationRate}%`,
    stats.informationRate >= 80 ? COLORS.success : stats.informationRate >= 50 ? COLORS.warning : COLORS.danger);

  addPageNumber(doc, currentPage);
}

/**
 * Add session overview
 */
function addSessionOverview(doc, sessionData) {
  addPageHeader(doc, 'Session Overview');

  const { session, questions } = sessionData;
  let y = 140;

  // Session details
  doc.fontSize(12).fillColor(COLORS.lightGrey).text('Session Details', 50, y);
  y += 20;

  const details = [
    ['Session Name', session.name],
    ['Module', session.module || 'General'],
    ['Description', session.description || 'N/A'],
    ['Topics', session.topics || 'Not specified']
  ];

  details.forEach(([label, value]) => {
    doc.fontSize(10).fillColor(COLORS.lightGrey).text(label + ':', 60, y);
    doc.fontSize(10).fillColor(COLORS.secondary).text(value, 160, y, { width: 350 });
    y = doc.y + 10;
  });

  y += 20;

  // Questions by category
  doc.fontSize(12).fillColor(COLORS.lightGrey).text('Questions by Category', 50, y);
  y += 25;

  const categories = {};
  questions.forEach(q => {
    const cat = q.category_name || 'General';
    if (!categories[cat]) categories[cat] = { total: 0, completed: 0 };
    categories[cat].total++;
    if (q.answer_status === 'completed') categories[cat].completed++;
  });

  Object.entries(categories).forEach(([cat, data]) => {
    if (y > doc.page.height - 80) return; // Don't overflow

    const pct = Math.round((data.completed / data.total) * 100);
    doc.fontSize(10).fillColor(COLORS.secondary).text(truncateText(cat, 40), 60, y);
    doc.fontSize(10).fillColor(COLORS.lightGrey).text(`${data.completed}/${data.total} (${pct}%)`, 350, y);

    // Progress bar
    doc.rect(450, y, 80, 10).fill('#e5e7eb');
    doc.rect(450, y, 80 * (pct / 100), 10).fill(pct >= 80 ? COLORS.success : pct >= 50 ? COLORS.warning : COLORS.danger);

    y += 25;
  });

  addPageNumber(doc, currentPage);
}

/**
 * Add KDS List (Key Data Structures)
 */
function addKDSList(doc, kdsList, sessionData) {
  addPageHeader(doc, 'Key Data Structures (KDS)');

  let y = 140;

  // Summary
  doc.fontSize(11).fillColor(COLORS.secondary)
     .text(`This section contains ${kdsList.length} Key Data Structures identified during the workshop session. These define the configuration, master data, and organizational structures required for SAP S/4HANA implementation.`, 50, y, {
       width: doc.page.width - 100,
       align: 'justify'
     });
  y = doc.y + 20;

  // Group by category
  const byCategory = {};
  kdsList.forEach(item => {
    const cat = item.category || 'General';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  });

  let itemNum = 1;
  for (const [category, items] of Object.entries(byCategory)) {
    // Category header
    if (y > doc.page.height - 120) {
      addPageNumber(doc, currentPage);
      doc.addPage();
      currentPage++;
      addPageHeader(doc, 'Key Data Structures (continued)');
      y = 140;
    }

    doc.rect(50, y, doc.page.width - 100, 22).fill(COLORS.primary);
    doc.fontSize(10).fillColor(COLORS.white)
       .text(category, 55, y + 6);
    y += 26;

    // Items in category
    items.forEach(item => {
      if (y > doc.page.height - 100) {
        addPageNumber(doc, currentPage);
        doc.addPage();
        currentPage++;
        addPageHeader(doc, 'Key Data Structures (continued)');
        y = 140;
      }

      // Determine if this is AI-generated format or extracted format
      const isAIFormat = item.area || item.current_state || item.sap_relevance;

      if (isAIFormat) {
        // AI-generated format - more detailed
        const hasCurrentState = item.current_state && item.current_state.length > 0;
        const rowHeight = hasCurrentState ? 70 : 50;
        const rowColor = itemNum % 2 === 0 ? '#f9fafb' : COLORS.white;
        doc.rect(50, y, doc.page.width - 100, rowHeight).fill(rowColor);

        // Priority badge
        const priorityColor = item.priority === 'critical' ? COLORS.danger :
          item.priority === 'high' ? COLORS.warning : COLORS.info;
        doc.fontSize(7).fillColor(priorityColor)
           .text((item.priority || 'medium').toUpperCase(), doc.page.width - 95, y + 4);

        // Item number and area
        doc.fontSize(8).fillColor(COLORS.lightGrey).text(`${itemNum}.`, 55, y + 4);
        doc.fontSize(9).fillColor(COLORS.secondary)
           .text(item.area || item.item || 'Data Element', 70, y + 4, { width: 350 });

        // Current State Value (the actual discovered value)
        if (hasCurrentState) {
          doc.fontSize(8).fillColor(COLORS.success)
             .text('Current: ' + truncateText(item.current_state, 90), 70, y + 18, { width: 420 });
        }

        // Item description
        const descY = hasCurrentState ? y + 34 : y + 18;
        doc.fontSize(8).fillColor(COLORS.secondary)
           .text(truncateText(item.item || '', 100), 70, descY, { width: 420 });

        // SAP relevance
        if (item.sap_relevance) {
          const sapY = hasCurrentState ? y + 50 : y + 34;
          doc.fontSize(7).fillColor(COLORS.info)
             .text('SAP: ' + truncateText(item.sap_relevance, 80), 70, sapY, { width: 420 });
        }

        y += rowHeight + 4;
      } else {
        // Extracted format - simpler
        const rowColor = itemNum % 2 === 0 ? '#f9fafb' : COLORS.white;
        doc.rect(50, y, doc.page.width - 100, 20).fill(rowColor);

        doc.fontSize(8).fillColor(COLORS.lightGrey).text(itemNum.toString(), 55, y + 6);
        doc.fontSize(8).fillColor(COLORS.secondary).text(truncateText(item.item, 70), 75, y + 6, { width: 340 });

        if (item.questionNumber) {
          doc.fontSize(8).fillColor(COLORS.info).text(`Q${item.questionNumber}`, 420, y + 6);
        }

        const confColor = item.confidence === 'high' ? COLORS.success : item.confidence === 'medium' ? COLORS.warning : COLORS.lightGrey;
        doc.fontSize(8).fillColor(confColor).text(item.confidence || item.priority || '', 460, y + 6);

        y += 22;
      }

      itemNum++;
    });

    y += 8;
  }

  addPageNumber(doc, currentPage);
}

/**
 * Add BPML List (Business Process Master List)
 */
function addBPMLList(doc, bpmlList, sessionData) {
  addPageHeader(doc, 'Business Process Master List (BPML)');

  let y = 140;

  // Summary
  doc.fontSize(11).fillColor(COLORS.secondary)
     .text(`This section contains ${bpmlList.length} business processes identified during the workshop session. These represent current state (AS-IS) processes that will be mapped to SAP S/4HANA functionality.`, 50, y, {
       width: doc.page.width - 100,
       align: 'justify'
     });
  y = doc.y + 20;

  // Group by category
  const byCategory = {};
  bpmlList.forEach(item => {
    const cat = item.category || 'General';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  });

  let itemNum = 1;
  for (const [category, items] of Object.entries(byCategory)) {
    // Category header
    if (y > doc.page.height - 120) {
      addPageNumber(doc, currentPage);
      doc.addPage();
      currentPage++;
      addPageHeader(doc, 'Business Process Master List (continued)');
      y = 140;
    }

    doc.rect(50, y, doc.page.width - 100, 22).fill(COLORS.primary);
    doc.fontSize(10).fillColor(COLORS.white)
       .text(category, 55, y + 6);
    y += 26;

    // Items in category
    items.forEach(item => {
      if (y > doc.page.height - 120) {
        addPageNumber(doc, currentPage);
        doc.addPage();
        currentPage++;
        addPageHeader(doc, 'Business Process Master List (continued)');
        y = 140;
      }

      // Determine if this is AI-generated format or extracted format
      const isAIFormat = item.process_id || item.process_name || item.sap_module;

      if (isAIFormat) {
        // AI-generated format - more detailed
        const rowHeight = 65;
        const rowColor = itemNum % 2 === 0 ? '#f9fafb' : COLORS.white;
        doc.rect(50, y, doc.page.width - 100, rowHeight).fill(rowColor);

        // Process ID badge
        doc.fontSize(8).fillColor(COLORS.primary)
           .text(item.process_id || `BP-${String(itemNum).padStart(3, '0')}`, 55, y + 4);

        // SAP Module badge
        if (item.sap_module) {
          doc.fontSize(7).fillColor(COLORS.info)
             .text(item.sap_module, doc.page.width - 100, y + 4);
        }

        // Process name
        doc.fontSize(9).fillColor(COLORS.secondary)
           .text(item.process_name || item.process || 'Business Process', 100, y + 4, { width: 350 });

        // Description
        if (item.description) {
          doc.fontSize(8).fillColor(COLORS.lightGrey)
             .text(truncateText(item.description, 100), 55, y + 20, { width: 440 });
        }

        // Frequency and stakeholders
        let infoLine = '';
        if (item.frequency) infoLine += `Frequency: ${item.frequency}`;
        if (item.stakeholders?.length > 0) {
          infoLine += infoLine ? ' | ' : '';
          infoLine += `Stakeholders: ${item.stakeholders.slice(0, 3).join(', ')}`;
        }
        if (infoLine) {
          doc.fontSize(7).fillColor(COLORS.lightGrey)
             .text(infoLine, 55, y + 36, { width: 440 });
        }

        // Pain points
        if (item.pain_points?.length > 0) {
          doc.fontSize(7).fillColor(COLORS.warning)
             .text('Pain Points: ' + truncateText(item.pain_points.slice(0, 2).join('; '), 80), 55, y + 50, { width: 440 });
        }

        y += rowHeight + 4;
      } else {
        // Extracted format - simpler
        const rowColor = itemNum % 2 === 0 ? '#f9fafb' : COLORS.white;
        doc.rect(50, y, doc.page.width - 100, 20).fill(rowColor);

        doc.fontSize(8).fillColor(COLORS.lightGrey).text(itemNum.toString(), 55, y + 6);
        doc.fontSize(8).fillColor(COLORS.secondary).text(truncateText(item.process, 60), 75, y + 6, { width: 300 });

        if (item.entity) {
          doc.fontSize(8).fillColor(COLORS.info).text(item.entity, 380, y + 6);
        }
        if (item.questionNumber) {
          doc.fontSize(8).fillColor(COLORS.info).text(`Q${item.questionNumber}`, 430, y + 6);
        }
        doc.fontSize(8).fillColor(COLORS.success).text('Identified', 470, y + 6);

        y += 22;
      }

      itemNum++;
    });

    y += 8;
  }

  addPageNumber(doc, currentPage);
}

/**
 * Add questions and findings section
 */
function addQuestionsAndFindings(doc, sessionData) {
  addPageHeader(doc, 'Questions & Findings');

  const { questions } = sessionData;
  let y = 140;

  questions.forEach((q, idx) => {
    // Check if we need a new page
    if (y > doc.page.height - 120) {
      addPageNumber(doc, currentPage);
      doc.addPage();
      currentPage++;
      addPageHeader(doc, 'Questions & Findings (continued)');
      y = 140;
    }

    // Question box
    doc.rect(50, y, doc.page.width - 100, 22)
       .fill(q.is_critical ? '#fef2f2' : '#f9fafb');

    doc.fontSize(9).fillColor(COLORS.primary)
       .text(`Q${q.question_number}`, 55, y + 6);

    doc.fontSize(9).fillColor(COLORS.secondary)
       .text(truncateText(q.question_text, 75), 85, y + 6, { width: doc.page.width - 170 });

    if (q.is_critical) {
      doc.fontSize(7).fillColor(COLORS.danger)
         .text('CRITICAL', doc.page.width - 90, y + 7);
    }

    y += 26;

    // Status indicator
    const statusColor = q.answer_status === 'completed' ? COLORS.success
      : q.answer_status === 'in_progress' ? COLORS.warning : COLORS.lightGrey;
    doc.circle(60, y + 4, 3).fill(statusColor);
    doc.fontSize(8).fillColor(COLORS.lightGrey)
       .text(q.answer_status || 'pending', 68, y);

    // Obtained info count
    const obtained = q.observation?.obtained_info?.length || 0;
    const missing = q.observation?.missing_info?.length || 0;

    if (obtained > 0 || missing > 0) {
      doc.fontSize(8).fillColor(COLORS.success)
         .text(`${obtained} obtained`, 160, y);
      doc.fontSize(8).fillColor(COLORS.danger)
         .text(`${missing} missing`, 230, y);
    }

    y += 20;
  });

  addPageNumber(doc, currentPage);
}

/**
 * Add key findings section
 */
function addKeyFindings(doc, reportData) {
  addPageHeader(doc, 'Key Findings');

  let y = 140;
  const findings = reportData.key_findings || [];

  findings.forEach((finding, idx) => {
    if (y > doc.page.height - 100) {
      addPageNumber(doc, currentPage);
      doc.addPage();
      currentPage++;
      addPageHeader(doc, 'Key Findings (continued)');
      y = 140;
    }

    const impactColor = finding.impact === 'high' ? COLORS.danger
      : finding.impact === 'medium' ? COLORS.warning : COLORS.info;

    doc.rect(50, y, 4, 45).fill(impactColor);
    doc.rect(54, y, doc.page.width - 104, 45).fill('#f9fafb');

    doc.fontSize(10).fillColor(COLORS.secondary)
       .text(finding.category || `Finding ${idx + 1}`, 60, y + 6, { width: doc.page.width - 180 });

    doc.fontSize(7).fillColor(impactColor)
       .text((finding.impact || 'medium').toUpperCase(), doc.page.width - 90, y + 8);

    doc.fontSize(8).fillColor(COLORS.lightGrey)
       .text(truncateText(finding.finding || finding.description || '', 180), 60, y + 22, { width: doc.page.width - 130 });

    y += 55;
  });

  addPageNumber(doc, currentPage);
}

/**
 * Add recommendations section
 */
function addRecommendations(doc, reportData) {
  addPageHeader(doc, 'Recommendations');

  let y = 140;
  const recommendations = reportData.recommendations || [];

  recommendations.forEach((rec, idx) => {
    if (y > doc.page.height - 80) {
      addPageNumber(doc, currentPage);
      doc.addPage();
      currentPage++;
      addPageHeader(doc, 'Recommendations (continued)');
      y = 140;
    }

    const priorityColor = rec.priority === 'critical' || rec.priority === 'high' ? COLORS.danger
      : rec.priority === 'medium' ? COLORS.warning : COLORS.success;

    doc.circle(60, y + 7, 8).fill(priorityColor);
    doc.fontSize(9).fillColor(COLORS.white).text(`${idx + 1}`, 57, y + 4);

    doc.fontSize(10).fillColor(COLORS.secondary)
       .text(rec.recommendation || rec.title || `Recommendation ${idx + 1}`, 78, y + 2, { width: doc.page.width - 150 });

    y += 20;

    if (rec.rationale || rec.description) {
      doc.fontSize(8).fillColor(COLORS.lightGrey)
         .text(truncateText(rec.rationale || rec.description || '', 180), 78, y, { width: doc.page.width - 130 });
      y = doc.y + 10;
    }

    y += 8;
  });

  addPageNumber(doc, currentPage);
}

/**
 * Add risks and gaps section
 */
function addRisksAndGaps(doc, reportData) {
  addPageHeader(doc, 'Risks & Gaps');

  let y = 140;
  const risks = reportData.risks_and_gaps || [];

  risks.forEach((risk, idx) => {
    if (y > doc.page.height - 90) {
      addPageNumber(doc, currentPage);
      doc.addPage();
      currentPage++;
      addPageHeader(doc, 'Risks & Gaps (continued)');
      y = 140;
    }

    const severityColor = risk.severity === 'critical' || risk.severity === 'high' ? COLORS.danger
      : risk.severity === 'medium' ? COLORS.warning : COLORS.info;

    doc.rect(50, y, doc.page.width - 100, 55).lineWidth(1).stroke(severityColor);

    doc.fontSize(7).fillColor(severityColor)
       .text(`${(risk.severity || 'medium').toUpperCase()} SEVERITY`, 55, y + 5);

    doc.fontSize(10).fillColor(COLORS.secondary)
       .text(risk.risk || risk.title || `Risk ${idx + 1}`, 55, y + 18, { width: doc.page.width - 120 });

    if (risk.mitigation) {
      doc.fontSize(8).fillColor(COLORS.lightGrey)
         .text('Mitigation: ' + truncateText(risk.mitigation, 90), 55, y + 36, { width: doc.page.width - 120 });
    }

    y += 65;
  });

  addPageNumber(doc, currentPage);
}

/**
 * Add next steps section
 */
function addNextSteps(doc, reportData) {
  addPageHeader(doc, 'Next Steps');

  let y = 140;
  const steps = reportData.next_steps || [];

  // Timeline line
  const lineHeight = Math.min(steps.length * 50, doc.page.height - 200);
  doc.moveTo(65, y).lineTo(65, y + lineHeight).lineWidth(2).stroke('#e5e7eb');

  steps.forEach((step, idx) => {
    if (y > doc.page.height - 80) {
      addPageNumber(doc, currentPage);
      doc.addPage();
      currentPage++;
      addPageHeader(doc, 'Next Steps (continued)');
      y = 140;
    }

    doc.circle(65, y + 12, 7).fill(COLORS.primary);
    doc.fontSize(9).fillColor(COLORS.white).text(`${idx + 1}`, 62, y + 8);

    doc.fontSize(10).fillColor(COLORS.secondary)
       .text(step.action || step.title || `Step ${idx + 1}`, 85, y + 8, { width: doc.page.width - 160 });

    if (step.owner || step.timeline) {
      doc.fontSize(8).fillColor(COLORS.lightGrey)
         .text(`Owner: ${step.owner || 'TBD'} | Timeline: ${step.timeline || 'TBD'}`, 85, y + 26);
    }

    y += 50;
  });

  addPageNumber(doc, currentPage);
}

/**
 * Add appendix with detailed question data
 */
function addAppendix(doc, sessionData) {
  addPageHeader(doc, 'Appendix: Detailed Responses');

  const { questions } = sessionData;
  let y = 140;

  const completedQuestions = questions.filter(q => q.answer_status === 'completed');

  completedQuestions.forEach((q, idx) => {
    if (y > doc.page.height - 180) {
      addPageNumber(doc, currentPage);
      doc.addPage();
      currentPage++;
      addPageHeader(doc, 'Appendix (continued)');
      y = 140;
    }

    // Question header
    doc.rect(50, y, doc.page.width - 100, 18).fill(COLORS.primary);
    doc.fontSize(9).fillColor(COLORS.white)
       .text(`Q${q.question_number}: ${truncateText(q.question_text, 75)}`, 55, y + 5, { width: doc.page.width - 120 });
    y += 22;

    // Response
    if (q.text_response) {
      doc.fontSize(8).fillColor(COLORS.lightGrey).text('Response:', 55, y);
      y += 10;
      doc.fontSize(8).fillColor(COLORS.secondary)
         .text(truncateText(q.text_response, 400), 55, y, { width: doc.page.width - 110 });
      y = doc.y + 8;
    }

    // Obtained information
    if (q.observation?.obtained_info?.length > 0) {
      doc.fontSize(8).fillColor(COLORS.success).text('Information Obtained:', 55, y);
      y += 10;
      q.observation.obtained_info.slice(0, 4).forEach(item => {
        doc.fontSize(7).fillColor(COLORS.secondary)
           .text('• ' + truncateText(item.item, 90), 60, y, { width: doc.page.width - 120 });
        y = doc.y + 2;
      });
      y += 4;
    }

    // Missing information
    if (q.observation?.missing_info?.length > 0) {
      doc.fontSize(8).fillColor(COLORS.danger).text('Still Missing:', 55, y);
      y += 10;
      q.observation.missing_info.slice(0, 3).forEach(item => {
        doc.fontSize(7).fillColor(COLORS.secondary)
           .text('• ' + truncateText(item.item, 90), 60, y, { width: doc.page.width - 120 });
        y = doc.y + 2;
      });
    }

    y += 15;
  });

  addPageNumber(doc, currentPage);
}

// Helper functions
function addPageHeader(doc, title) {
  doc.rect(0, 0, doc.page.width, 80).fill(COLORS.white);
  doc.rect(0, 0, doc.page.width, 4).fill(COLORS.primary);

  doc.fontSize(8).fillColor(COLORS.lightGrey)
     .text('NXSYS', 50, 20);
  doc.fontSize(18).fillColor(COLORS.secondary)
     .text(title, 50, 40);

  doc.moveTo(50, 70).lineTo(doc.page.width - 50, 70).lineWidth(0.5).stroke(COLORS.lightGrey);
}

function addPageNumber(doc, num) {
  doc.fontSize(9).fillColor(COLORS.lightGrey)
     .text(`Page ${num}`, 50, doc.page.height - 40, { align: 'center' });
}

function addMetricBox(doc, x, y, label, value, color) {
  doc.rect(x, y, 130, 60).lineWidth(1).stroke(color);
  doc.fontSize(10).fillColor(COLORS.lightGrey).text(label, x + 10, y + 10);
  doc.fontSize(20).fillColor(color).text(value, x + 10, y + 30);
}

function truncateText(text, maxLength) {
  if (!text) return '';
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

module.exports = {
  generateSessionReportPDF
};
