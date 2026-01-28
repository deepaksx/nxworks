/**
 * Session Checklist Routes
 *
 * API endpoints for direct checklist mode:
 * - Get checklist items (grouped by status)
 * - Get checklist stats
 * - Upload session audio
 * - Transcribe and analyze audio
 * - Manual item updates
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const XLSX = require('xlsx');
const db = require('../models/db');
const { isS3Configured, uploadBufferToS3 } = require('../services/s3');
const {
  analyzeTranscriptionAgainstChecklist,
  markItemsAsObtained,
  saveAdditionalFindings,
  getSessionFindings,
  analyzeDocumentAgainstChecklist,
  reanalyzeAllTranscripts
} = require('../services/directChecklistGenerator');
const {
  appendTranscript,
  regenerateTranscript,
  getTranscriptContent,
  getAllTranscriptsText
} = require('../services/transcriptManager');

// OpenAI for transcription
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Document parsing libraries
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

// Configure multer for audio uploads
const getUploadDir = () => {
  if (process.env.NODE_ENV === 'production') {
    return '/tmp/uploads';
  }
  return path.join(__dirname, '../../uploads');
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(getUploadDir(), 'session-audio');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname) || '.webm'}`;
    cb(null, uniqueName);
  }
});

const memoryStorage = multer.memoryStorage();

const upload = multer({
  storage: isS3Configured() ? memoryStorage : storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB max
});

// ============================================
// Get checklist items for a session
// ============================================
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Get all checklist items grouped by status
    const result = await db.query(`
      SELECT *
      FROM session_checklist_items
      WHERE session_id = $1
      ORDER BY item_number
    `, [sessionId]);

    const items = result.rows;
    const missing = items.filter(i => i.status === 'missing');
    const obtained = items.filter(i => i.status === 'obtained');

    res.json({
      missing,
      obtained,
      total: items.length
    });
  } catch (error) {
    console.error('Error getting checklist:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Get checklist stats for a session
// ============================================
router.get('/session/:sessionId/stats', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const result = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'missing') as missing,
        COUNT(*) FILTER (WHERE status = 'obtained') as obtained,
        COUNT(*) FILTER (WHERE importance = 'critical' AND status = 'missing') as critical_missing,
        COUNT(*) FILTER (WHERE importance = 'critical' AND status = 'obtained') as critical_obtained,
        COUNT(*) FILTER (WHERE importance = 'important' AND status = 'missing') as important_missing,
        COUNT(*) FILTER (WHERE importance = 'important' AND status = 'obtained') as important_obtained
      FROM session_checklist_items
      WHERE session_id = $1
    `, [sessionId]);

    const stats = result.rows[0];

    res.json({
      total: parseInt(stats.total) || 0,
      missing: parseInt(stats.missing) || 0,
      obtained: parseInt(stats.obtained) || 0,
      criticalMissing: parseInt(stats.critical_missing) || 0,
      criticalObtained: parseInt(stats.critical_obtained) || 0,
      importantMissing: parseInt(stats.important_missing) || 0,
      importantObtained: parseInt(stats.important_obtained) || 0,
      completionPercent: stats.total > 0
        ? Math.round((parseInt(stats.obtained) / parseInt(stats.total)) * 100)
        : 0
    });
  } catch (error) {
    console.error('Error getting checklist stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Upload audio recording for session
// ============================================
router.post('/session/:sessionId/audio', upload.single('audio'), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { duration_seconds, chunk_index } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    let filePath;
    let fileName;

    if (isS3Configured()) {
      // Upload to S3
      const uniqueName = `${uuidv4()}.webm`;
      const s3Key = `uploads/session-audio/${uniqueName}`;
      await uploadBufferToS3(req.file.buffer, s3Key, req.file.mimetype || 'audio/webm');
      filePath = s3Key;
      fileName = uniqueName;
    } else {
      // Local storage
      filePath = `uploads/session-audio/${req.file.filename}`;
      fileName = req.file.filename;
    }

    // Save to database
    const result = await db.query(`
      INSERT INTO session_recordings
        (session_id, file_path, file_name, mime_type, file_size, duration_seconds, chunk_index)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      sessionId,
      filePath,
      fileName,
      req.file.mimetype || 'audio/webm',
      req.file.size,
      parseInt(duration_seconds) || 0,
      parseInt(chunk_index) || 0
    ]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error uploading audio:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Transcribe and analyze session audio
// ============================================
router.post('/session/:sessionId/audio/:audioId/analyze', async (req, res) => {
  try {
    const { sessionId, audioId } = req.params;

    // Get audio recording
    const audioResult = await db.query(
      'SELECT * FROM session_recordings WHERE id = $1 AND session_id = $2',
      [audioId, sessionId]
    );

    if (audioResult.rows.length === 0) {
      return res.status(404).json({ error: 'Audio recording not found' });
    }

    const audio = audioResult.rows[0];

    // Check if already transcribed
    if (audio.transcription) {
      // Already transcribed, just run analysis
      const analysisResult = await analyzeTranscriptionAgainstChecklist(sessionId, audio.transcription);

      // Mark items as obtained
      if (analysisResult.obtainedItems.length > 0) {
        await markItemsAsObtained(analysisResult.obtainedItems);
      }

      // Save additional findings
      let savedFindings = [];
      if (analysisResult.additionalFindings && analysisResult.additionalFindings.length > 0) {
        savedFindings = await saveAdditionalFindings(sessionId, audioId, analysisResult.additionalFindings);
      }

      return res.json({
        transcription: audio.transcription,
        obtainedCount: analysisResult.obtainedItems.length,
        remainingMissing: analysisResult.remainingMissing,
        additionalFindings: savedFindings.length
      });
    }

    // Transcribe the audio
    let filePath = audio.file_path;
    let tempFile = null;

    // Handle S3 files
    if (filePath.startsWith('uploads/') && isS3Configured()) {
      const { GetObjectCommand } = require('@aws-sdk/client-s3');
      const { getS3Client, getBucketName } = require('../services/s3');

      const s3Client = getS3Client();
      const response = await s3Client.send(new GetObjectCommand({
        Bucket: getBucketName(),
        Key: filePath
      }));

      // Save to temp file
      tempFile = path.join('/tmp', `transcribe_${audioId}.webm`);
      const writeStream = fs.createWriteStream(tempFile);
      await new Promise((resolve, reject) => {
        response.Body.pipe(writeStream);
        response.Body.on('end', resolve);
        response.Body.on('error', reject);
      });
      filePath = tempFile;
    } else if (!path.isAbsolute(filePath)) {
      filePath = path.join(__dirname, '../..', filePath);
    }

    // Verify file exists and has content
    if (!fs.existsSync(filePath)) {
      throw new Error(`Audio file not found at path: ${filePath}`);
    }

    const fileStats = fs.statSync(filePath);
    if (fileStats.size === 0) {
      throw new Error('Audio file is empty');
    }

    console.log(`Transcribing file: ${filePath}, size: ${fileStats.size} bytes`);

    // Transcribe with OpenAI Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: 'whisper-1',
      language: 'en',
      response_format: 'text'
    });

    // Clean up temp file
    if (tempFile && fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }

    // Save transcription to database
    await db.query(
      'UPDATE session_recordings SET transcription = $1 WHERE id = $2',
      [transcription, audioId]
    );

    // Append to consolidated transcript MD file
    try {
      await appendTranscript(sessionId, audio.chunk_index || 0, transcription);
    } catch (transcriptError) {
      console.error('Error appending to transcript file:', transcriptError);
      // Don't fail the whole operation if transcript append fails
    }

    // Analyze against checklist
    const analysisResult = await analyzeTranscriptionAgainstChecklist(sessionId, transcription);

    // Mark items as obtained
    if (analysisResult.obtainedItems.length > 0) {
      await markItemsAsObtained(analysisResult.obtainedItems);
    }

    // Reset items back to missing if contradictions found
    let resetCount = 0;
    if (analysisResult.itemsToReset && analysisResult.itemsToReset.length > 0) {
      for (const item of analysisResult.itemsToReset) {
        await db.query(`
          UPDATE session_checklist_items
          SET status = 'missing',
              obtained_text = NULL,
              obtained_confidence = NULL,
              obtained_source = NULL,
              obtained_at = NULL
          WHERE id = $1 AND session_id = $2
        `, [item.item_id, sessionId]);
        resetCount++;
      }
      console.log(`Reset ${resetCount} items back to missing due to contradictions`);
    }

    // Save additional findings
    let savedFindings = [];
    if (analysisResult.additionalFindings && analysisResult.additionalFindings.length > 0) {
      savedFindings = await saveAdditionalFindings(sessionId, audioId, analysisResult.additionalFindings);
    }

    res.json({
      transcription,
      obtainedCount: analysisResult.obtainedItems.length,
      resetCount: resetCount,
      itemsReset: analysisResult.itemsToReset || [],
      remainingMissing: analysisResult.remainingMissing,
      obtainedItems: analysisResult.obtainedItems,
      additionalFindings: savedFindings.length,
      findings: savedFindings
    });
  } catch (error) {
    console.error('Error transcribing/analyzing audio:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Manual update of checklist item
// ============================================
router.patch('/session/:sessionId/item/:itemId', async (req, res) => {
  try {
    const { sessionId, itemId } = req.params;
    const { status, obtained_text, obtained_confidence } = req.body;

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (status) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }

    if (obtained_text !== undefined) {
      updates.push(`obtained_text = $${paramIndex++}`);
      values.push(obtained_text);
    }

    if (obtained_confidence) {
      updates.push(`obtained_confidence = $${paramIndex++}`);
      values.push(obtained_confidence);
    }

    if (status === 'obtained') {
      updates.push(`obtained_at = CURRENT_TIMESTAMP`);
      updates.push(`obtained_source = 'manual'`);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    values.push(itemId, sessionId);

    const result = await db.query(`
      UPDATE session_checklist_items
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex++} AND session_id = $${paramIndex}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating checklist item:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Get all recordings for a session
// ============================================
router.get('/session/:sessionId/recordings', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const result = await db.query(`
      SELECT *
      FROM session_recordings
      WHERE session_id = $1
      ORDER BY chunk_index
    `, [sessionId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error getting recordings:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Get checklist items by category
// ============================================
router.get('/session/:sessionId/by-category', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const result = await db.query(`
      SELECT *
      FROM session_checklist_items
      WHERE session_id = $1
      ORDER BY category, item_number
    `, [sessionId]);

    // Group by category
    const byCategory = {};
    for (const item of result.rows) {
      const cat = item.category || 'General';
      if (!byCategory[cat]) {
        byCategory[cat] = { missing: [], obtained: [] };
      }
      if (item.status === 'obtained') {
        byCategory[cat].obtained.push(item);
      } else {
        byCategory[cat].missing.push(item);
      }
    }

    res.json(byCategory);
  } catch (error) {
    console.error('Error getting checklist by category:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Get additional findings for a session
// ============================================
router.get('/session/:sessionId/findings', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const findings = await getSessionFindings(sessionId);

    // Group findings by type
    const grouped = {
      all: findings,
      byType: {},
      byRiskLevel: { high: [], medium: [], low: [] },
      stats: {
        total: findings.length,
        highRisk: 0,
        mediumRisk: 0,
        lowRisk: 0
      }
    };

    for (const finding of findings) {
      // Group by type
      const type = finding.finding_type || 'general';
      if (!grouped.byType[type]) {
        grouped.byType[type] = [];
      }
      grouped.byType[type].push(finding);

      // Group by risk level
      const risk = finding.sap_risk_level || 'medium';
      if (grouped.byRiskLevel[risk]) {
        grouped.byRiskLevel[risk].push(finding);
        grouped.stats[`${risk}Risk`]++;
      }
    }

    res.json(grouped);
  } catch (error) {
    console.error('Error getting findings:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Delete a finding
// ============================================
router.delete('/session/:sessionId/findings/:findingId', async (req, res) => {
  try {
    const { sessionId, findingId } = req.params;

    await db.query(
      'DELETE FROM session_additional_findings WHERE id = $1 AND session_id = $2',
      [findingId, sessionId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting finding:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Export checklist to Excel
// ============================================
router.get('/session/:sessionId/export-excel', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Get session info
    const sessionResult = await db.query(`
      SELECT s.name as session_name, s.module, w.name as workshop_name, w.client_name
      FROM sessions s
      JOIN workshops w ON s.workshop_id = w.id
      WHERE s.id = $1
    `, [sessionId]);

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const sessionInfo = sessionResult.rows[0];

    // Get missing items
    const missingResult = await db.query(`
      SELECT item_number, item_text, importance, category, suggested_question
      FROM session_checklist_items
      WHERE session_id = $1 AND status = 'missing'
      ORDER BY
        CASE importance
          WHEN 'critical' THEN 1
          WHEN 'important' THEN 2
          ELSE 3
        END,
        item_number
    `, [sessionId]);

    // Get obtained items
    const obtainedResult = await db.query(`
      SELECT item_number, item_text, importance, category, obtained_text,
             obtained_source, obtained_confidence, obtained_at
      FROM session_checklist_items
      WHERE session_id = $1 AND status = 'obtained'
      ORDER BY
        CASE importance
          WHEN 'critical' THEN 1
          WHEN 'important' THEN 2
          ELSE 3
        END,
        item_number
    `, [sessionId]);

    // Get additional findings
    const findingsResult = await db.query(`
      SELECT topic, finding_type, details, sap_analysis, sap_recommendation,
             sap_best_practice, sap_risk_level, source_quote, created_at
      FROM session_additional_findings
      WHERE session_id = $1
      ORDER BY
        CASE sap_risk_level
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          ELSE 3
        END,
        created_at DESC
    `, [sessionId]);

    // Create workbook
    const workbook = XLSX.utils.book_new();

    // Sheet 1: Missing Items
    const missingData = [
      ['Missing Checklist Items'],
      ['Workshop:', sessionInfo.workshop_name, 'Client:', sessionInfo.client_name],
      ['Session:', sessionInfo.session_name, 'Module:', sessionInfo.module],
      [],
      ['#', 'Item', 'Importance', 'Category', 'Suggested Question']
    ];
    missingResult.rows.forEach(item => {
      missingData.push([
        item.item_number,
        item.item_text,
        item.importance,
        item.category || '',
        item.suggested_question || ''
      ]);
    });
    const missingSheet = XLSX.utils.aoa_to_sheet(missingData);
    // Set column widths
    missingSheet['!cols'] = [
      { wch: 5 },   // #
      { wch: 60 },  // Item
      { wch: 12 },  // Importance
      { wch: 25 },  // Category
      { wch: 50 }   // Suggested Question
    ];
    XLSX.utils.book_append_sheet(workbook, missingSheet, 'Missing Items');

    // Sheet 2: Obtained Items
    const obtainedData = [
      ['Obtained Checklist Items'],
      ['Workshop:', sessionInfo.workshop_name, 'Client:', sessionInfo.client_name],
      ['Session:', sessionInfo.session_name, 'Module:', sessionInfo.module],
      [],
      ['#', 'Item', 'Importance', 'Category', 'Obtained Information', 'Source', 'Confidence', 'Obtained At']
    ];
    obtainedResult.rows.forEach(item => {
      obtainedData.push([
        item.item_number,
        item.item_text,
        item.importance,
        item.category || '',
        item.obtained_text || '',
        item.obtained_source || '',
        item.obtained_confidence || '',
        item.obtained_at ? new Date(item.obtained_at).toLocaleString() : ''
      ]);
    });
    const obtainedSheet = XLSX.utils.aoa_to_sheet(obtainedData);
    obtainedSheet['!cols'] = [
      { wch: 5 },   // #
      { wch: 50 },  // Item
      { wch: 12 },  // Importance
      { wch: 25 },  // Category
      { wch: 60 },  // Obtained Information
      { wch: 10 },  // Source
      { wch: 12 },  // Confidence
      { wch: 20 }   // Obtained At
    ];
    XLSX.utils.book_append_sheet(workbook, obtainedSheet, 'Obtained Items');

    // Sheet 3: Additional Findings
    const findingsData = [
      ['Additional Findings - SAP Best Practice Analysis'],
      ['Workshop:', sessionInfo.workshop_name, 'Client:', sessionInfo.client_name],
      ['Session:', sessionInfo.session_name, 'Module:', sessionInfo.module],
      [],
      ['Topic', 'Type', 'Risk Level', 'Details', 'SAP Analysis', 'SAP Recommendation', 'SAP Best Practice', 'Source Quote']
    ];
    findingsResult.rows.forEach(finding => {
      findingsData.push([
        finding.topic,
        finding.finding_type || '',
        finding.sap_risk_level || '',
        finding.details || '',
        finding.sap_analysis || '',
        finding.sap_recommendation || '',
        finding.sap_best_practice || '',
        finding.source_quote || ''
      ]);
    });
    const findingsSheet = XLSX.utils.aoa_to_sheet(findingsData);
    findingsSheet['!cols'] = [
      { wch: 35 },  // Topic
      { wch: 15 },  // Type
      { wch: 12 },  // Risk Level
      { wch: 50 },  // Details
      { wch: 50 },  // SAP Analysis
      { wch: 50 },  // SAP Recommendation
      { wch: 40 },  // SAP Best Practice
      { wch: 40 }   // Source Quote
    ];
    XLSX.utils.book_append_sheet(workbook, findingsSheet, 'Additional Findings');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Set headers and send file
    const filename = `${sessionInfo.session_name.replace(/[^a-zA-Z0-9]/g, '_')}_Checklist_Report.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);

  } catch (error) {
    console.error('Error exporting to Excel:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Document upload configuration
// ============================================
const documentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(getUploadDir(), 'session-documents');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  }
});

const documentUpload = multer({
  storage: isS3Configured() ? memoryStorage : documentStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max for documents
  fileFilter: (req, file, cb) => {
    // Allow PDF, Word docs, and text files
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/csv'
    ];
    const allowedExtensions = ['.pdf', '.doc', '.docx', '.txt', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, Word documents (.doc, .docx), and text files are allowed'), false);
    }
  }
});

// ============================================
// Upload document for analysis
// ============================================
router.post('/session/:sessionId/document', documentUpload.single('document'), async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'No document file provided' });
    }

    let filePath;
    let fileName;

    if (isS3Configured()) {
      const ext = path.extname(req.file.originalname) || '';
      const uniqueName = `${uuidv4()}${ext}`;
      const s3Key = `uploads/session-documents/${uniqueName}`;
      await uploadBufferToS3(req.file.buffer, s3Key, req.file.mimetype);
      filePath = s3Key;
      fileName = uniqueName;
    } else {
      filePath = `uploads/session-documents/${req.file.filename}`;
      fileName = req.file.filename;
    }

    // Save document record
    const result = await db.query(`
      INSERT INTO session_documents
        (session_id, file_path, file_name, original_name, mime_type, file_size, analysis_status)
      VALUES ($1, $2, $3, $4, $5, $6, 'pending')
      RETURNING *
    `, [
      sessionId,
      filePath,
      fileName,
      req.file.originalname,
      req.file.mimetype,
      req.file.size
    ]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Analyze uploaded document against checklist
// ============================================
router.post('/session/:sessionId/document/:documentId/analyze', async (req, res) => {
  try {
    const { sessionId, documentId } = req.params;

    // Get document record
    const docResult = await db.query(
      'SELECT * FROM session_documents WHERE id = $1 AND session_id = $2',
      [documentId, sessionId]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docResult.rows[0];

    // Check if already analyzed with extracted text
    if (doc.analysis_status === 'completed' && doc.extracted_text) {
      return res.json({
        message: 'Document already analyzed',
        obtainedCount: doc.obtained_count,
        findingsCount: doc.findings_count
      });
    }

    // Update status to processing
    await db.query(
      'UPDATE session_documents SET analysis_status = $1 WHERE id = $2',
      ['processing', documentId]
    );

    // Get file path for extraction
    let filePath = doc.file_path;
    let tempFile = null;
    let fileBuffer = null;

    if (isS3Configured() && filePath.startsWith('uploads/')) {
      const { GetObjectCommand } = require('@aws-sdk/client-s3');
      const { getS3Client, getBucketName } = require('../services/s3');

      const s3Client = getS3Client();
      const response = await s3Client.send(new GetObjectCommand({
        Bucket: getBucketName(),
        Key: filePath
      }));

      // Read stream to buffer
      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      fileBuffer = Buffer.concat(chunks);

      // Also save to temp file for mammoth (Word docs)
      tempFile = path.join('/tmp', `doc_${documentId}${path.extname(doc.original_name)}`);
      fs.writeFileSync(tempFile, fileBuffer);
      filePath = tempFile;
    } else if (!path.isAbsolute(filePath)) {
      filePath = path.join(__dirname, '../..', filePath);
      fileBuffer = fs.readFileSync(filePath);
    } else {
      fileBuffer = fs.readFileSync(filePath);
    }

    // Extract text based on file type
    let extractedText = '';
    const mimeType = doc.mime_type || '';
    const ext = path.extname(doc.original_name || doc.file_name).toLowerCase();

    try {
      if (mimeType === 'application/pdf' || ext === '.pdf') {
        // PDF extraction
        const pdfData = await pdfParse(fileBuffer);
        extractedText = pdfData.text;
      } else if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/msword' ||
        ext === '.docx' || ext === '.doc'
      ) {
        // Word document extraction
        const result = await mammoth.extractRawText({ path: filePath });
        extractedText = result.value;
      } else if (mimeType.startsWith('text/') || ext === '.txt' || ext === '.csv') {
        // Plain text
        extractedText = fileBuffer.toString('utf-8');
      } else {
        throw new Error(`Unsupported file type: ${mimeType || ext}`);
      }
    } catch (extractError) {
      console.error('Text extraction error:', extractError);
      await db.query(
        'UPDATE session_documents SET analysis_status = $1 WHERE id = $2',
        ['failed', documentId]
      );
      throw new Error(`Failed to extract text from document: ${extractError.message}`);
    }

    // Clean up temp file
    if (tempFile && fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }

    if (!extractedText || extractedText.trim().length === 0) {
      await db.query(
        'UPDATE session_documents SET analysis_status = $1 WHERE id = $2',
        ['failed', documentId]
      );
      return res.status(400).json({ error: 'No text could be extracted from the document' });
    }

    // Save extracted text
    await db.query(
      'UPDATE session_documents SET extracted_text = $1 WHERE id = $2',
      [extractedText, documentId]
    );

    // Analyze against checklist (reuse same function as transcription)
    const analysisResult = await analyzeDocumentAgainstChecklist(sessionId, extractedText, doc.original_name);

    // Mark items as obtained
    if (analysisResult.obtainedItems && analysisResult.obtainedItems.length > 0) {
      await markItemsAsObtained(analysisResult.obtainedItems);
    }

    // Save additional findings
    let savedFindings = [];
    if (analysisResult.additionalFindings && analysisResult.additionalFindings.length > 0) {
      savedFindings = await saveAdditionalFindings(sessionId, null, analysisResult.additionalFindings);
    }

    // Update document record with results
    await db.query(`
      UPDATE session_documents SET
        analysis_status = 'completed',
        obtained_count = $1,
        findings_count = $2,
        analyzed_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [
      analysisResult.obtainedItems?.length || 0,
      savedFindings.length,
      documentId
    ]);

    res.json({
      extractedTextLength: extractedText.length,
      obtainedCount: analysisResult.obtainedItems?.length || 0,
      remainingMissing: analysisResult.remainingMissing,
      obtainedItems: analysisResult.obtainedItems || [],
      findingsCount: savedFindings.length,
      findings: savedFindings
    });
  } catch (error) {
    console.error('Error analyzing document:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Get all documents for a session
// ============================================
router.get('/session/:sessionId/documents', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const result = await db.query(`
      SELECT id, session_id, file_name, original_name, mime_type, file_size,
             analysis_status, obtained_count, findings_count, created_at, analyzed_at
      FROM session_documents
      WHERE session_id = $1
      ORDER BY created_at DESC
    `, [sessionId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error getting documents:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Delete a document
// ============================================
router.delete('/session/:sessionId/document/:documentId', async (req, res) => {
  try {
    const { sessionId, documentId } = req.params;

    // Get document info for file deletion
    const docResult = await db.query(
      'SELECT file_path FROM session_documents WHERE id = $1 AND session_id = $2',
      [documentId, sessionId]
    );

    if (docResult.rows.length > 0) {
      const filePath = docResult.rows[0].file_path;

      // Delete from S3 or local filesystem
      if (isS3Configured() && filePath.startsWith('uploads/')) {
        try {
          const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
          const { getS3Client, getBucketName } = require('../services/s3');
          await getS3Client().send(new DeleteObjectCommand({
            Bucket: getBucketName(),
            Key: filePath
          }));
        } catch (s3Error) {
          console.error('Error deleting from S3:', s3Error);
        }
      } else {
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(__dirname, '../..', filePath);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      }
    }

    // Delete database record
    await db.query(
      'DELETE FROM session_documents WHERE id = $1 AND session_id = $2',
      [documentId, sessionId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Get transcript content
// ============================================
router.get('/session/:sessionId/transcript', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const content = await getTranscriptContent(sessionId);

    if (!content) {
      return res.status(404).json({ error: 'No transcript found' });
    }

    res.json({ content });
  } catch (error) {
    console.error('Error getting transcript:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Download transcript as MD file
// ============================================
router.get('/session/:sessionId/transcript/download', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const content = await getTranscriptContent(sessionId);

    if (!content) {
      return res.status(404).json({ error: 'No transcript found' });
    }

    // Get session name for filename
    const sessionResult = await db.query(
      'SELECT name FROM sessions WHERE id = $1',
      [sessionId]
    );
    const sessionName = sessionResult.rows[0]?.name || 'session';
    const fileName = `${sessionName.replace(/[^a-z0-9]/gi, '-')}-transcript.md`;

    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(content);
  } catch (error) {
    console.error('Error downloading transcript:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Regenerate transcript from saved recordings
// ============================================
router.post('/session/:sessionId/transcript/regenerate', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const result = await regenerateTranscript(sessionId);

    res.json(result);
  } catch (error) {
    console.error('Error regenerating transcript:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Re-analyze all transcripts against checklist
// ============================================
router.post('/session/:sessionId/reanalyze', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Get all transcripts combined
    const allTranscripts = await getAllTranscriptsText(sessionId);

    if (!allTranscripts || allTranscripts.trim().length === 0) {
      return res.status(400).json({ error: 'No transcripts found to analyze' });
    }

    // Re-analyze using enhanced function
    const result = await reanalyzeAllTranscripts(sessionId, allTranscripts);

    res.json(result);
  } catch (error) {
    console.error('Error re-analyzing transcripts:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Generate combined transcript for entire workshop
// (Backward compatible: supports both legacy audio_recordings and new session_recordings)
// ============================================
router.post('/workshop/:workshopId/generate-transcript', async (req, res) => {
  try {
    const { workshopId } = req.params;

    // Get workshop info
    const workshopResult = await db.query(
      'SELECT id, name, client_name, mission_statement FROM workshops WHERE id = $1',
      [workshopId]
    );

    if (workshopResult.rows.length === 0) {
      return res.status(404).json({ error: 'Workshop not found' });
    }

    const workshop = workshopResult.rows[0];

    // Get all sessions for this workshop
    const sessionsResult = await db.query(
      'SELECT id, name, module FROM sessions WHERE workshop_id = $1 ORDER BY id',
      [workshopId]
    );

    if (sessionsResult.rows.length === 0) {
      return res.status(400).json({ error: 'No sessions found for this workshop' });
    }

    const sessions = sessionsResult.rows;
    const results = {
      workshop: workshop.name,
      sessionsProcessed: 0,
      totalRecordings: 0,
      transcribedRecordings: 0,
      newlyTranscribed: 0,
      legacyRecordings: 0,
      errors: [],
      sessions: []
    };

    // Helper function to resolve file path and download if needed
    async function resolveAudioFilePath(filePath, fileName, recordingId, isLegacy = false) {
      let resolvedPath = filePath;
      let tempFile = null;

      // Handle S3 URLs (legacy format - starts with http)
      if (filePath.startsWith('http')) {
        const https = require('https');
        const http = require('http');

        tempFile = path.join(process.env.NODE_ENV === 'production' ? '/tmp' : path.join(__dirname, '../../uploads/temp'), `transcribe_${recordingId}_${Date.now()}.webm`);

        // Ensure temp directory exists
        const tempDir = path.dirname(tempFile);
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        // Download from S3 URL
        await new Promise((resolve, reject) => {
          const protocol = filePath.startsWith('https') ? https : http;
          const file = fs.createWriteStream(tempFile);
          protocol.get(filePath, (response) => {
            response.pipe(file);
            file.on('finish', () => {
              file.close();
              resolve();
            });
          }).on('error', (err) => {
            fs.unlink(tempFile, () => {});
            reject(err);
          });
        });

        return { path: tempFile, tempFile };
      }

      // Handle S3 key paths (new format - starts with uploads/)
      if (filePath.startsWith('uploads/') && isS3Configured()) {
        const { GetObjectCommand } = require('@aws-sdk/client-s3');
        const { getS3Client, getBucketName } = require('../services/s3');

        const s3Client = getS3Client();
        const response = await s3Client.send(new GetObjectCommand({
          Bucket: getBucketName(),
          Key: filePath
        }));

        tempFile = path.join(process.env.NODE_ENV === 'production' ? '/tmp' : path.join(__dirname, '../../uploads/temp'), `transcribe_${recordingId}_${Date.now()}.webm`);

        // Ensure temp directory exists
        const tempDir = path.dirname(tempFile);
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        const writeStream = fs.createWriteStream(tempFile);
        await new Promise((resolve, reject) => {
          response.Body.pipe(writeStream);
          response.Body.on('end', resolve);
          response.Body.on('error', reject);
        });

        return { path: tempFile, tempFile };
      }

      // Handle local files
      if (!path.isAbsolute(resolvedPath)) {
        // Try different possible locations for backward compatibility
        const possiblePaths = [
          path.join(__dirname, '../..', resolvedPath),  // Standard relative path
          path.join(__dirname, '../../uploads/audio', fileName),  // Legacy audio folder
          path.join(__dirname, '../../uploads/session-audio', fileName),  // New session-audio folder
          process.env.NODE_ENV === 'production' ? path.join('/tmp', resolvedPath) : null,
          process.env.NODE_ENV === 'production' ? path.join('/tmp/uploads/audio', fileName) : null
        ].filter(Boolean);

        for (const tryPath of possiblePaths) {
          if (fs.existsSync(tryPath)) {
            resolvedPath = tryPath;
            break;
          }
        }
      }

      return { path: resolvedPath, tempFile: null };
    }

    // Helper function to transcribe an audio file
    async function transcribeAudio(recording, isLegacy = false) {
      const { path: filePath, tempFile } = await resolveAudioFilePath(
        recording.file_path,
        recording.file_name,
        recording.id,
        isLegacy
      );

      // Verify file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`Audio file not found: ${recording.file_path} (tried: ${filePath})`);
      }

      const fileStats = fs.statSync(filePath);
      if (fileStats.size === 0) {
        throw new Error('Audio file is empty');
      }

      console.log(`Transcribing ${isLegacy ? 'legacy' : 'new'} recording ${recording.id}, file: ${filePath}`);

      // Transcribe with OpenAI Whisper
      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: 'whisper-1',
        language: 'en',
        response_format: 'text'
      });

      // Clean up temp file
      if (tempFile && fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }

      return transcription;
    }

    // Process each session
    for (const session of sessions) {
      const sessionResult = {
        id: session.id,
        name: session.name,
        module: session.module,
        recordingsCount: 0,
        legacyRecordingsCount: 0,
        transcribedCount: 0,
        newlyTranscribedCount: 0,
        errors: []
      };

      // ========================================
      // 1. Get NEW session recordings (session_recordings table)
      // ========================================
      const newRecordingsResult = await db.query(
        'SELECT * FROM session_recordings WHERE session_id = $1 ORDER BY chunk_index, created_at',
        [session.id]
      );

      sessionResult.recordingsCount += newRecordingsResult.rows.length;
      results.totalRecordings += newRecordingsResult.rows.length;

      // Process new recordings
      for (const recording of newRecordingsResult.rows) {
        if (recording.transcription) {
          sessionResult.transcribedCount++;
          results.transcribedRecordings++;
          continue;
        }

        try {
          const transcription = await transcribeAudio(recording, false);

          // Save transcription to database
          await db.query(
            'UPDATE session_recordings SET transcription = $1 WHERE id = $2',
            [transcription, recording.id]
          );

          // Append to session transcript file
          try {
            await appendTranscript(session.id, recording.chunk_index || 0, transcription);
          } catch (transcriptError) {
            console.error('Error appending to transcript file:', transcriptError);
          }

          sessionResult.transcribedCount++;
          sessionResult.newlyTranscribedCount++;
          results.transcribedRecordings++;
          results.newlyTranscribed++;

        } catch (transcribeError) {
          console.error(`Error transcribing new recording ${recording.id}:`, transcribeError);
          sessionResult.errors.push({
            recordingId: recording.id,
            type: 'new',
            error: transcribeError.message
          });
          results.errors.push({
            sessionId: session.id,
            sessionName: session.name,
            recordingId: recording.id,
            type: 'new',
            error: transcribeError.message
          });
        }
      }

      // ========================================
      // 2. Get LEGACY audio recordings (audio_recordings table via answers/questions)
      // ========================================
      const legacyRecordingsResult = await db.query(`
        SELECT ar.*, q.question_text, a.text_response
        FROM audio_recordings ar
        JOIN answers a ON ar.answer_id = a.id
        JOIN questions q ON a.question_id = q.id
        WHERE q.session_id = $1
        ORDER BY ar.created_at
      `, [session.id]);

      sessionResult.legacyRecordingsCount = legacyRecordingsResult.rows.length;
      sessionResult.recordingsCount += legacyRecordingsResult.rows.length;
      results.totalRecordings += legacyRecordingsResult.rows.length;
      results.legacyRecordings += legacyRecordingsResult.rows.length;

      // Process legacy recordings
      for (const recording of legacyRecordingsResult.rows) {
        if (recording.transcription) {
          sessionResult.transcribedCount++;
          results.transcribedRecordings++;
          continue;
        }

        try {
          const transcription = await transcribeAudio(recording, true);

          // Save transcription to legacy table
          await db.query(
            'UPDATE audio_recordings SET transcription = $1 WHERE id = $2',
            [transcription, recording.id]
          );

          sessionResult.transcribedCount++;
          sessionResult.newlyTranscribedCount++;
          results.transcribedRecordings++;
          results.newlyTranscribed++;

        } catch (transcribeError) {
          console.error(`Error transcribing legacy recording ${recording.id}:`, transcribeError);
          sessionResult.errors.push({
            recordingId: recording.id,
            type: 'legacy',
            error: transcribeError.message
          });
          results.errors.push({
            sessionId: session.id,
            sessionName: session.name,
            recordingId: recording.id,
            type: 'legacy',
            error: transcribeError.message
          });
        }
      }

      results.sessions.push(sessionResult);
      results.sessionsProcessed++;
    }

    // Generate combined transcript document
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    let combinedTranscript = `# Workshop Transcript

**Workshop:** ${workshop.name}
**Client:** ${workshop.client_name || 'Not specified'}
**Generated:** ${now}

**Mission Statement:**
${workshop.mission_statement || 'Not specified'}

---

# Sessions

`;

    // Add each session's transcripts (both new and legacy)
    for (const session of sessions) {
      let sessionHasTranscripts = false;
      let sessionTranscriptContent = '';

      // Get NEW transcriptions for this session
      const newTranscriptionsResult = await db.query(`
        SELECT transcription, chunk_index, created_at, 'session_recording' as source_type
        FROM session_recordings
        WHERE session_id = $1 AND transcription IS NOT NULL
        ORDER BY chunk_index, created_at
      `, [session.id]);

      // Get LEGACY transcriptions for this session
      const legacyTranscriptionsResult = await db.query(`
        SELECT ar.transcription, ar.created_at, q.question_text, 'legacy_audio' as source_type
        FROM audio_recordings ar
        JOIN answers a ON ar.answer_id = a.id
        JOIN questions q ON a.question_id = q.id
        WHERE q.session_id = $1 AND ar.transcription IS NOT NULL
        ORDER BY ar.created_at
      `, [session.id]);

      // Add new recordings
      if (newTranscriptionsResult.rows.length > 0) {
        sessionHasTranscripts = true;
        for (const rec of newTranscriptionsResult.rows) {
          const recordedTime = new Date(rec.created_at).toISOString().replace('T', ' ').substring(0, 19);
          sessionTranscriptContent += `### Recording ${(rec.chunk_index || 0) + 1}
**Recorded:** ${recordedTime}

${rec.transcription}

`;
        }
      }

      // Add legacy recordings
      if (legacyTranscriptionsResult.rows.length > 0) {
        sessionHasTranscripts = true;
        if (newTranscriptionsResult.rows.length > 0) {
          sessionTranscriptContent += `### Legacy Recordings (Question-based mode)\n\n`;
        }

        let legacyIndex = 1;
        for (const rec of legacyTranscriptionsResult.rows) {
          const recordedTime = new Date(rec.created_at).toISOString().replace('T', ' ').substring(0, 19);
          sessionTranscriptContent += `### Answer Recording ${legacyIndex}
**Recorded:** ${recordedTime}
**Question:** ${rec.question_text || 'N/A'}

${rec.transcription}

`;
          legacyIndex++;
        }
      }

      if (sessionHasTranscripts) {
        combinedTranscript += `
---

## Session: ${session.name}
**Module:** ${session.module || 'General'}

${sessionTranscriptContent}`;
      }
    }

    // Save combined transcript
    const transcriptFileName = `workshop-${workshopId}-combined-transcript.md`;
    const transcriptDir = path.join(__dirname, '../../uploads/transcripts');

    if (!fs.existsSync(transcriptDir)) {
      fs.mkdirSync(transcriptDir, { recursive: true });
    }

    const transcriptPath = path.join(transcriptDir, transcriptFileName);

    if (isS3Configured()) {
      const s3Key = `uploads/transcripts/${transcriptFileName}`;
      await uploadBufferToS3(Buffer.from(combinedTranscript, 'utf-8'), s3Key, 'text/markdown');
      results.transcriptPath = s3Key;
    } else {
      fs.writeFileSync(transcriptPath, combinedTranscript, 'utf-8');
      results.transcriptPath = transcriptPath;
    }

    results.transcript = combinedTranscript;

    res.json(results);
  } catch (error) {
    console.error('Error generating workshop transcript:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Download combined workshop transcript
// ============================================
router.get('/workshop/:workshopId/transcript/download', async (req, res) => {
  try {
    const { workshopId } = req.params;

    // Get workshop info
    const workshopResult = await db.query(
      'SELECT name FROM workshops WHERE id = $1',
      [workshopId]
    );

    if (workshopResult.rows.length === 0) {
      return res.status(404).json({ error: 'Workshop not found' });
    }

    const workshopName = workshopResult.rows[0].name;
    const transcriptFileName = `workshop-${workshopId}-combined-transcript.md`;

    // Check if file exists
    if (isS3Configured()) {
      const s3Key = `uploads/transcripts/${transcriptFileName}`;
      try {
        const { getFileFromS3 } = require('../services/s3');
        const buffer = await getFileFromS3(s3Key);
        const fileName = `${workshopName.replace(/[^a-z0-9]/gi, '-')}-transcript.md`;
        res.setHeader('Content-Type', 'text/markdown');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(buffer.toString('utf-8'));
      } catch (s3Error) {
        return res.status(404).json({ error: 'Combined transcript not found. Generate it first.' });
      }
    } else {
      const transcriptDir = path.join(__dirname, '../../uploads/transcripts');
      const transcriptPath = path.join(transcriptDir, transcriptFileName);

      if (!fs.existsSync(transcriptPath)) {
        return res.status(404).json({ error: 'Combined transcript not found. Generate it first.' });
      }

      const content = fs.readFileSync(transcriptPath, 'utf-8');
      const fileName = `${workshopName.replace(/[^a-z0-9]/gi, '-')}-transcript.md`;
      res.setHeader('Content-Type', 'text/markdown');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(content);
    }
  } catch (error) {
    console.error('Error downloading workshop transcript:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
