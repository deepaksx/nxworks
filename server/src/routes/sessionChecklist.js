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
  analyzeDocumentAgainstChecklist
} = require('../services/directChecklistGenerator');

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

    // Analyze against checklist
    const analysisResult = await analyzeTranscriptionAgainstChecklist(sessionId, transcription);

    // Mark items as obtained
    if (analysisResult.obtainedItems.length > 0) {
      await markItemsAsObtained(analysisResult.obtainedItems);
    }

    // Save additional findings
    let savedFindings = [];
    if (analysisResult.additionalFindings && analysisResult.additionalFindings.length > 0) {
      savedFindings = await saveAdditionalFindings(sessionId, audioId, analysisResult.additionalFindings);
    }

    res.json({
      transcription,
      obtainedCount: analysisResult.obtainedItems.length,
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

module.exports = router;
