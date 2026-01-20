const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../models/db');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadDir = path.join(__dirname, '../../uploads');

    if (file.mimetype.startsWith('audio/')) {
      uploadDir = path.join(uploadDir, 'audio');
    } else {
      uploadDir = path.join(uploadDir, 'documents');
    }

    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'audio/webm', 'audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4',
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'image/jpeg', 'image/png', 'image/gif',
      'text/plain', 'text/csv'
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'), false);
    }
  }
});

// Create or update answer for a question
router.post('/question/:questionId', async (req, res) => {
  console.log('Save answer request:', { questionId: req.params.questionId, body: req.body });

  try {
    const { questionId } = req.params;
    const { text_response, respondent_name, respondent_role, notes, status } = req.body;

    // Check if answer exists
    const existingAnswer = await db.query(
      'SELECT id FROM answers WHERE question_id = $1',
      [questionId]
    );

    let result;
    if (existingAnswer.rows.length > 0) {
      // Update existing answer
      result = await db.query(`
        UPDATE answers
        SET text_response = COALESCE($1, text_response),
            respondent_name = COALESCE($2, respondent_name),
            respondent_role = COALESCE($3, respondent_role),
            notes = COALESCE($4, notes),
            status = COALESCE($5, status),
            updated_at = CURRENT_TIMESTAMP
        WHERE question_id = $6
        RETURNING *
      `, [text_response, respondent_name, respondent_role, notes, status, questionId]);
    } else {
      // Create new answer
      result = await db.query(`
        INSERT INTO answers (question_id, text_response, respondent_name, respondent_role, notes, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [questionId, text_response, respondent_name, respondent_role, notes, status || 'in_progress']);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error saving answer:', error);
    res.status(500).json({ error: 'Failed to save answer' });
  }
});

// Upload audio recording for an answer
router.post('/:answerId/audio', upload.single('audio'), async (req, res) => {
  console.log('Audio upload request received:', {
    answerId: req.params.answerId,
    file: req.file ? { name: req.file.filename, size: req.file.size, mime: req.file.mimetype } : 'NO FILE',
    body: req.body
  });

  try {
    const { answerId } = req.params;
    const { duration_seconds } = req.body;

    if (!req.file) {
      console.log('No file in request!');
      return res.status(400).json({ error: 'No audio file provided' });
    }

    // Use forward slashes for URL compatibility
    const relativePath = `uploads/audio/${req.file.filename}`;

    const result = await db.query(`
      INSERT INTO audio_recordings (answer_id, file_path, file_name, mime_type, file_size, duration_seconds)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [answerId, relativePath, req.file.filename, req.file.mimetype, req.file.size, duration_seconds || null]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error uploading audio:', error);
    res.status(500).json({ error: 'Failed to upload audio' });
  }
});

// Upload document for an answer
router.post('/:answerId/document', upload.single('document'), async (req, res) => {
  try {
    const { answerId } = req.params;
    const { description } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No document provided' });
    }

    // Use forward slashes for URL compatibility
    const relativePath = `uploads/documents/${req.file.filename}`;

    const result = await db.query(`
      INSERT INTO documents (answer_id, file_path, file_name, original_name, mime_type, file_size, description)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [answerId, relativePath, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, description || null]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// Delete audio recording
router.delete('/audio/:audioId', async (req, res) => {
  try {
    const { audioId } = req.params;

    // Get file path first
    const audioResult = await db.query('SELECT file_path FROM audio_recordings WHERE id = $1', [audioId]);

    if (audioResult.rows.length === 0) {
      return res.status(404).json({ error: 'Audio recording not found' });
    }

    // Delete from database
    await db.query('DELETE FROM audio_recordings WHERE id = $1', [audioId]);

    // Delete file from filesystem
    const filePath = path.join(__dirname, '../..', audioResult.rows[0].file_path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting audio:', error);
    res.status(500).json({ error: 'Failed to delete audio' });
  }
});

// Delete document
router.delete('/document/:docId', async (req, res) => {
  try {
    const { docId } = req.params;

    // Get file path first
    const docResult = await db.query('SELECT file_path FROM documents WHERE id = $1', [docId]);

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Delete from database
    await db.query('DELETE FROM documents WHERE id = $1', [docId]);

    // Delete file from filesystem
    const filePath = path.join(__dirname, '../..', docResult.rows[0].file_path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// Get answer with all attachments
router.get('/:answerId', async (req, res) => {
  try {
    const { answerId } = req.params;

    const answerResult = await db.query('SELECT * FROM answers WHERE id = $1', [answerId]);

    if (answerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Answer not found' });
    }

    const audioResult = await db.query(
      'SELECT * FROM audio_recordings WHERE answer_id = $1 ORDER BY created_at DESC',
      [answerId]
    );

    const docsResult = await db.query(
      'SELECT * FROM documents WHERE answer_id = $1 ORDER BY created_at DESC',
      [answerId]
    );

    res.json({
      ...answerResult.rows[0],
      audioRecordings: audioResult.rows,
      documents: docsResult.rows
    });
  } catch (error) {
    console.error('Error fetching answer:', error);
    res.status(500).json({ error: 'Failed to fetch answer' });
  }
});

// Reset/delete all data for a question (for testing)
router.delete('/question/:questionId/reset', async (req, res) => {
  try {
    const { questionId } = req.params;

    // Get answer ID first
    const answerResult = await db.query('SELECT id FROM answers WHERE question_id = $1', [questionId]);

    if (answerResult.rows.length === 0) {
      return res.json({ success: true, message: 'No data to reset' });
    }

    const answerId = answerResult.rows[0].id;

    // Get all audio files to delete from filesystem
    const audioFiles = await db.query('SELECT file_path FROM audio_recordings WHERE answer_id = $1', [answerId]);
    for (const audio of audioFiles.rows) {
      const filePath = path.join(__dirname, '../..', audio.file_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Get all document files to delete from filesystem
    const docFiles = await db.query('SELECT file_path FROM documents WHERE answer_id = $1', [answerId]);
    for (const doc of docFiles.rows) {
      const filePath = path.join(__dirname, '../..', doc.file_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Delete observations
    await db.query('DELETE FROM observations WHERE answer_id = $1', [answerId]);

    // Delete audio recordings
    await db.query('DELETE FROM audio_recordings WHERE answer_id = $1', [answerId]);

    // Delete documents
    await db.query('DELETE FROM documents WHERE answer_id = $1', [answerId]);

    // Delete answer
    await db.query('DELETE FROM answers WHERE id = $1', [answerId]);

    res.json({ success: true, message: 'All question data reset successfully' });
  } catch (error) {
    console.error('Error resetting question data:', error);
    res.status(500).json({ error: 'Failed to reset question data' });
  }
});

// Bulk update answers status
router.post('/bulk-status', async (req, res) => {
  try {
    const { question_ids, status } = req.body;

    if (!question_ids || !Array.isArray(question_ids) || question_ids.length === 0) {
      return res.status(400).json({ error: 'Invalid question_ids' });
    }

    // Update or create answers for each question
    const results = await Promise.all(question_ids.map(async (questionId) => {
      const existing = await db.query('SELECT id FROM answers WHERE question_id = $1', [questionId]);

      if (existing.rows.length > 0) {
        return db.query(
          'UPDATE answers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE question_id = $2 RETURNING *',
          [status, questionId]
        );
      } else {
        return db.query(
          'INSERT INTO answers (question_id, status) VALUES ($1, $2) RETURNING *',
          [questionId, status]
        );
      }
    }));

    res.json({ updated: results.length });
  } catch (error) {
    console.error('Error bulk updating answers:', error);
    res.status(500).json({ error: 'Failed to update answers' });
  }
});

module.exports = router;
