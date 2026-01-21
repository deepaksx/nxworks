/**
 * Share Routes - Public endpoints for shared checklist access
 *
 * Features:
 * - Enable/disable sharing for sessions
 * - Public login with username/password
 * - Exclusive lock mechanism (only one user at a time)
 * - Heartbeat to maintain lock
 * - Full checklist access for authenticated users
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
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

// JWT secret (use env var or fallback)
const JWT_SECRET = process.env.JWT_SECRET || 'nxworks-share-secret-key-change-in-production';
const LOCK_TIMEOUT_MINUTES = 2;

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
// Middleware: Verify JWT token
// ============================================
const verifyShareToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.shareAuth = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Helper: Check if lock is valid (not expired)
const isLockValid = (lockedAt) => {
  if (!lockedAt) return false;
  const lockTime = new Date(lockedAt);
  const now = new Date();
  const diffMinutes = (now - lockTime) / (1000 * 60);
  return diffMinutes < LOCK_TIMEOUT_MINUTES;
};

// Helper: Generate random password
const generatePassword = () => {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
};

// ============================================
// ADMIN ENDPOINTS (manage sharing)
// ============================================

// Enable sharing for a session
router.post('/workshops/:workshopId/sessions/:sessionId/share/enable', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { username } = req.body;

    // Generate token and password
    const shareToken = crypto.randomBytes(32).toString('hex');
    const password = generatePassword();
    const passwordHash = await bcrypt.hash(password, 10);

    // Update session
    const result = await db.query(`
      UPDATE sessions SET
        share_enabled = TRUE,
        share_token = $1,
        share_username = $2,
        share_password_hash = $3,
        share_locked_by = NULL,
        share_locked_at = NULL
      WHERE id = $4
      RETURNING id, name, share_token, share_username
    `, [shareToken, username || 'participant', passwordHash, sessionId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = result.rows[0];
    const shareUrl = `${req.protocol}://${req.get('host')}/share/${shareToken}`;

    res.json({
      success: true,
      shareUrl,
      username: session.share_username,
      password, // Return plain password only on enable
      token: shareToken
    });
  } catch (error) {
    console.error('Error enabling share:', error);
    res.status(500).json({ error: error.message });
  }
});

// Disable sharing for a session
router.post('/workshops/:workshopId/sessions/:sessionId/share/disable', async (req, res) => {
  try {
    const { sessionId } = req.params;

    await db.query(`
      UPDATE sessions SET
        share_enabled = FALSE,
        share_token = NULL,
        share_username = NULL,
        share_password_hash = NULL,
        share_locked_by = NULL,
        share_locked_at = NULL
      WHERE id = $1
    `, [sessionId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error disabling share:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get share status for a session
router.get('/workshops/:workshopId/sessions/:sessionId/share/status', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const result = await db.query(`
      SELECT share_enabled, share_token, share_username, share_locked_by, share_locked_at
      FROM sessions WHERE id = $1
    `, [sessionId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = result.rows[0];
    const shareUrl = session.share_token
      ? `${req.protocol}://${req.get('host')}/share/${session.share_token}`
      : null;

    res.json({
      enabled: session.share_enabled,
      shareUrl,
      username: session.share_username,
      isLocked: isLockValid(session.share_locked_at),
      lockedBy: session.share_locked_by
    });
  } catch (error) {
    console.error('Error getting share status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Regenerate password for a session
router.post('/workshops/:workshopId/sessions/:sessionId/share/regenerate-password', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const password = generatePassword();
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await db.query(`
      UPDATE sessions SET share_password_hash = $1
      WHERE id = $2 AND share_enabled = TRUE
      RETURNING share_username
    `, [passwordHash, sessionId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found or sharing not enabled' });
    }

    res.json({
      success: true,
      username: result.rows[0].share_username,
      password
    });
  } catch (error) {
    console.error('Error regenerating password:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// PUBLIC ENDPOINTS (shared access)
// ============================================

// Get session info (no auth needed, for login page)
router.get('/share/:token/info', async (req, res) => {
  try {
    const { token } = req.params;

    const result = await db.query(`
      SELECT s.id, s.name, s.module, w.name as workshop_name, w.client_name,
             s.share_locked_by, s.share_locked_at
      FROM sessions s
      JOIN workshops w ON s.workshop_id = w.id
      WHERE s.share_token = $1 AND s.share_enabled = TRUE
    `, [token]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired share link' });
    }

    const session = result.rows[0];
    const locked = isLockValid(session.share_locked_at);

    res.json({
      sessionName: session.name,
      module: session.module,
      workshopName: session.workshop_name,
      clientName: session.client_name,
      isLocked: locked,
      lockedBy: locked ? session.share_locked_by : null
    });
  } catch (error) {
    console.error('Error getting share info:', error);
    res.status(500).json({ error: error.message });
  }
});

// Login and acquire lock
router.post('/share/:token/login', async (req, res) => {
  try {
    const { token } = req.params;
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // Get session
    const result = await db.query(`
      SELECT id, name, share_username, share_password_hash, share_locked_by, share_locked_at
      FROM sessions
      WHERE share_token = $1 AND share_enabled = TRUE
    `, [token]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired share link' });
    }

    const session = result.rows[0];

    // Verify credentials
    if (username !== session.share_username) {
      return res.status(401).json({ error: 'Invalid username' });
    }

    const validPassword = await bcrypt.compare(password, session.share_password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Check if locked by someone else
    if (isLockValid(session.share_locked_at) && session.share_locked_by !== username) {
      return res.status(423).json({
        error: 'Session is currently in use',
        lockedBy: session.share_locked_by
      });
    }

    // Acquire lock
    await db.query(`
      UPDATE sessions SET share_locked_by = $1, share_locked_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [username, session.id]);

    // Generate JWT
    const jwtToken = jwt.sign(
      { token, sessionId: session.id, username },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token: jwtToken,
      sessionId: session.id,
      sessionName: session.name
    });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: error.message });
  }
});

// Heartbeat to keep lock alive
router.post('/share/:token/heartbeat', verifyShareToken, async (req, res) => {
  try {
    const { sessionId, username } = req.shareAuth;

    await db.query(`
      UPDATE sessions SET share_locked_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND share_locked_by = $2
    `, [sessionId, username]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error heartbeat:', error);
    res.status(500).json({ error: error.message });
  }
});

// Release lock
router.post('/share/:token/release', verifyShareToken, async (req, res) => {
  try {
    const { sessionId, username } = req.shareAuth;

    await db.query(`
      UPDATE sessions SET share_locked_by = NULL, share_locked_at = NULL
      WHERE id = $1 AND share_locked_by = $2
    `, [sessionId, username]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error releasing lock:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CHECKLIST ENDPOINTS (requires auth)
// ============================================

// Get checklist items
router.get('/share/:token/checklist', verifyShareToken, async (req, res) => {
  try {
    const { sessionId } = req.shareAuth;

    const result = await db.query(`
      SELECT * FROM session_checklist_items
      WHERE session_id = $1
      ORDER BY item_number
    `, [sessionId]);

    const items = result.rows;
    const missing = items.filter(i => i.status === 'missing');
    const obtained = items.filter(i => i.status === 'obtained');

    res.json({ missing, obtained, total: items.length });
  } catch (error) {
    console.error('Error getting checklist:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get checklist stats
router.get('/share/:token/checklist/stats', verifyShareToken, async (req, res) => {
  try {
    const { sessionId } = req.shareAuth;

    const result = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'missing') as missing,
        COUNT(*) FILTER (WHERE status = 'obtained') as obtained,
        COUNT(*) FILTER (WHERE importance = 'critical' AND status = 'missing') as critical_missing,
        COUNT(*) FILTER (WHERE importance = 'critical' AND status = 'obtained') as critical_obtained
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
      completionPercent: stats.total > 0
        ? Math.round((parseInt(stats.obtained) / parseInt(stats.total)) * 100)
        : 0
    });
  } catch (error) {
    console.error('Error getting checklist stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload audio chunk
router.post('/share/:token/audio', verifyShareToken, upload.single('audio'), async (req, res) => {
  try {
    const { sessionId } = req.shareAuth;
    const { duration_seconds, chunk_index } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    let filePath;
    let fileName;

    if (isS3Configured()) {
      const uniqueName = `${uuidv4()}.webm`;
      const s3Key = `uploads/session-audio/${uniqueName}`;
      await uploadBufferToS3(req.file.buffer, s3Key, req.file.mimetype || 'audio/webm');
      filePath = s3Key;
      fileName = uniqueName;
    } else {
      filePath = `uploads/session-audio/${req.file.filename}`;
      fileName = req.file.filename;
    }

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

// Transcribe and analyze audio
router.post('/share/:token/audio/:audioId/analyze', verifyShareToken, async (req, res) => {
  try {
    const { sessionId } = req.shareAuth;
    const { audioId } = req.params;

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
      const analysisResult = await analyzeTranscriptionAgainstChecklist(sessionId, audio.transcription);
      if (analysisResult.obtainedItems.length > 0) {
        await markItemsAsObtained(analysisResult.obtainedItems);
      }

      return res.json({
        transcription: audio.transcription,
        obtainedCount: analysisResult.obtainedItems.length,
        remainingMissing: analysisResult.remainingMissing
      });
    }

    // Get file path
    let filePath = audio.file_path;
    let tempFile = null;

    if (filePath.startsWith('uploads/') && isS3Configured()) {
      const { GetObjectCommand } = require('@aws-sdk/client-s3');
      const { getS3Client, getBucketName } = require('../services/s3');

      const s3Client = getS3Client();
      const response = await s3Client.send(new GetObjectCommand({
        Bucket: getBucketName(),
        Key: filePath
      }));

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

    // Verify file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`Audio file not found at path: ${filePath}`);
    }

    const fileStats = fs.statSync(filePath);
    if (fileStats.size === 0) {
      throw new Error('Audio file is empty');
    }

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

    // Save transcription
    await db.query(
      'UPDATE session_recordings SET transcription = $1 WHERE id = $2',
      [transcription, audioId]
    );

    // Analyze against checklist
    const analysisResult = await analyzeTranscriptionAgainstChecklist(sessionId, transcription);

    if (analysisResult.obtainedItems.length > 0) {
      await markItemsAsObtained(analysisResult.obtainedItems);
    }

    // Save additional findings if any
    if (analysisResult.additionalFindings && analysisResult.additionalFindings.length > 0) {
      await saveAdditionalFindings(sessionId, audioId, analysisResult.additionalFindings);
    }

    res.json({
      transcription,
      obtainedCount: analysisResult.obtainedItems.length,
      remainingMissing: analysisResult.remainingMissing,
      obtainedItems: analysisResult.obtainedItems,
      findingsCount: analysisResult.additionalFindings?.length || 0
    });
  } catch (error) {
    console.error('Error transcribing/analyzing audio:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get additional findings
router.get('/share/:token/findings', verifyShareToken, async (req, res) => {
  try {
    const { sessionId } = req.shareAuth;

    const findings = await getSessionFindings(sessionId);

    // Calculate stats
    const stats = {
      total: findings.length,
      highRisk: findings.filter(f => f.sap_risk_level === 'high').length,
      mediumRisk: findings.filter(f => f.sap_risk_level === 'medium').length,
      lowRisk: findings.filter(f => f.sap_risk_level === 'low').length
    };

    res.json({ all: findings, stats });
  } catch (error) {
    console.error('Error getting findings:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Document upload configuration for shared access
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
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (req, file, cb) => {
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
      cb(new Error('Only PDF, Word documents, and text files are allowed'), false);
    }
  }
});

// Upload document for shared session
router.post('/share/:token/document', verifyShareToken, documentUpload.single('document'), async (req, res) => {
  try {
    const { sessionId } = req.shareAuth;

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

// Analyze document for shared session
router.post('/share/:token/document/:documentId/analyze', verifyShareToken, async (req, res) => {
  try {
    const { sessionId } = req.shareAuth;
    const { documentId } = req.params;

    // Get document record
    const docResult = await db.query(
      'SELECT * FROM session_documents WHERE id = $1 AND session_id = $2',
      [documentId, sessionId]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docResult.rows[0];

    if (doc.analysis_status === 'completed' && doc.extracted_text) {
      return res.json({
        message: 'Document already analyzed',
        obtainedCount: doc.obtained_count,
        findingsCount: doc.findings_count
      });
    }

    await db.query(
      'UPDATE session_documents SET analysis_status = $1 WHERE id = $2',
      ['processing', documentId]
    );

    // Get file and extract text
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

      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      fileBuffer = Buffer.concat(chunks);

      tempFile = path.join('/tmp', `doc_${documentId}${path.extname(doc.original_name)}`);
      fs.writeFileSync(tempFile, fileBuffer);
      filePath = tempFile;
    } else if (!path.isAbsolute(filePath)) {
      filePath = path.join(__dirname, '../..', filePath);
      fileBuffer = fs.readFileSync(filePath);
    } else {
      fileBuffer = fs.readFileSync(filePath);
    }

    // Extract text
    let extractedText = '';
    const mimeType = doc.mime_type || '';
    const ext = path.extname(doc.original_name || doc.file_name).toLowerCase();

    try {
      if (mimeType === 'application/pdf' || ext === '.pdf') {
        const pdfData = await pdfParse(fileBuffer);
        extractedText = pdfData.text;
      } else if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/msword' ||
        ext === '.docx' || ext === '.doc'
      ) {
        const result = await mammoth.extractRawText({ path: filePath });
        extractedText = result.value;
      } else if (mimeType.startsWith('text/') || ext === '.txt' || ext === '.csv') {
        extractedText = fileBuffer.toString('utf-8');
      } else {
        throw new Error(`Unsupported file type: ${mimeType || ext}`);
      }
    } catch (extractError) {
      await db.query(
        'UPDATE session_documents SET analysis_status = $1 WHERE id = $2',
        ['failed', documentId]
      );
      throw new Error(`Failed to extract text: ${extractError.message}`);
    }

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

    await db.query(
      'UPDATE session_documents SET extracted_text = $1 WHERE id = $2',
      [extractedText, documentId]
    );

    // Analyze against checklist
    const analysisResult = await analyzeDocumentAgainstChecklist(sessionId, extractedText, doc.original_name);

    if (analysisResult.obtainedItems && analysisResult.obtainedItems.length > 0) {
      await markItemsAsObtained(analysisResult.obtainedItems, 'document');
    }

    let savedFindings = [];
    if (analysisResult.additionalFindings && analysisResult.additionalFindings.length > 0) {
      savedFindings = await saveAdditionalFindings(sessionId, null, analysisResult.additionalFindings);
    }

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
      findingsCount: savedFindings.length
    });
  } catch (error) {
    console.error('Error analyzing document:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
