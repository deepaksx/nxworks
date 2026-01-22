/**
 * Transcript Manager Service
 *
 * Manages a consolidated markdown transcript file for each session.
 * - Appends each chunk's transcript to a single MD file
 * - Can regenerate the MD file from saved recordings
 * - Supports re-analysis of all transcripts
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('../models/db');
const { isS3Configured, uploadBufferToS3, getFileFromS3 } = require('./s3');

// Directory for local transcript storage
const TRANSCRIPT_DIR = path.join(__dirname, '../../uploads/transcripts');

// Ensure transcript directory exists
if (!fs.existsSync(TRANSCRIPT_DIR)) {
  fs.mkdirSync(TRANSCRIPT_DIR, { recursive: true });
}

/**
 * Get or create transcript file path for a session
 */
async function getTranscriptFilePath(sessionId) {
  const result = await pool.query(
    'SELECT transcript_file_path FROM sessions WHERE id = $1',
    [sessionId]
  );

  if (result.rows.length === 0) {
    throw new Error('Session not found');
  }

  if (result.rows[0].transcript_file_path) {
    return result.rows[0].transcript_file_path;
  }

  // Create new transcript file path
  const fileName = `session-${sessionId}-transcript.md`;
  const filePath = isS3Configured()
    ? `uploads/transcripts/${fileName}`
    : path.join(TRANSCRIPT_DIR, fileName);

  // Update session with file path
  await pool.query(
    'UPDATE sessions SET transcript_file_path = $1 WHERE id = $2',
    [filePath, sessionId]
  );

  return filePath;
}

/**
 * Get session info for transcript header
 */
async function getSessionInfo(sessionId) {
  const result = await pool.query(`
    SELECT s.name as session_name, w.name as workshop_name, w.mission_statement
    FROM sessions s
    JOIN workshops w ON s.workshop_id = w.id
    WHERE s.id = $1
  `, [sessionId]);

  return result.rows[0] || {};
}

/**
 * Append a transcript chunk to the session's MD file
 */
async function appendTranscript(sessionId, chunkIndex, transcriptText, timestamp = new Date()) {
  const filePath = await getTranscriptFilePath(sessionId);
  const sessionInfo = await getSessionInfo(sessionId);

  // Format the chunk entry
  const formattedTime = timestamp.toISOString().replace('T', ' ').substring(0, 19);
  const chunkEntry = `
---

## Chunk ${chunkIndex + 1}
**Recorded:** ${formattedTime}

${transcriptText}

`;

  if (isS3Configured()) {
    // For S3: Read existing, append, upload
    let existingContent = '';
    try {
      const existing = await getFileFromS3(filePath);
      existingContent = existing.toString('utf-8');
    } catch (e) {
      // File doesn't exist yet, create header
      existingContent = createTranscriptHeader(sessionInfo, sessionId);
    }

    const newContent = existingContent + chunkEntry;
    await uploadBufferToS3(Buffer.from(newContent, 'utf-8'), filePath, 'text/markdown');
  } else {
    // For local: Check if file exists, create header if not
    if (!fs.existsSync(filePath)) {
      const header = createTranscriptHeader(sessionInfo, sessionId);
      fs.writeFileSync(filePath, header, 'utf-8');
    }

    // Append the chunk
    fs.appendFileSync(filePath, chunkEntry, 'utf-8');
  }

  return filePath;
}

/**
 * Create the header for a new transcript file
 */
function createTranscriptHeader(sessionInfo, sessionId) {
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  return `# Session Transcript

**Workshop:** ${sessionInfo.workshop_name || 'Unknown'}
**Session:** ${sessionInfo.session_name || 'Unknown'}
**Session ID:** ${sessionId}
**Created:** ${now}

**Mission Statement:**
${sessionInfo.mission_statement || 'Not specified'}

---

# Transcripts

`;
}

/**
 * Regenerate the transcript MD file from all saved recordings
 */
async function regenerateTranscript(sessionId) {
  // Get all recordings with transcriptions, ordered by chunk_index
  const recordings = await pool.query(`
    SELECT id, chunk_index, transcription, created_at
    FROM session_recordings
    WHERE session_id = $1 AND transcription IS NOT NULL
    ORDER BY chunk_index ASC, created_at ASC
  `, [sessionId]);

  if (recordings.rows.length === 0) {
    return { success: false, message: 'No transcribed recordings found' };
  }

  const sessionInfo = await getSessionInfo(sessionId);

  // Build complete transcript
  let content = createTranscriptHeader(sessionInfo, sessionId);

  for (const recording of recordings.rows) {
    const formattedTime = new Date(recording.created_at).toISOString().replace('T', ' ').substring(0, 19);
    content += `
---

## Chunk ${(recording.chunk_index || 0) + 1}
**Recorded:** ${formattedTime}

${recording.transcription}

`;
  }

  // Save the regenerated transcript
  const filePath = await getTranscriptFilePath(sessionId);

  if (isS3Configured()) {
    await uploadBufferToS3(Buffer.from(content, 'utf-8'), filePath, 'text/markdown');
  } else {
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  return {
    success: true,
    chunksIncluded: recordings.rows.length,
    filePath
  };
}

/**
 * Get full transcript content
 */
async function getTranscriptContent(sessionId) {
  const result = await pool.query(
    'SELECT transcript_file_path FROM sessions WHERE id = $1',
    [sessionId]
  );

  if (result.rows.length === 0 || !result.rows[0].transcript_file_path) {
    return null;
  }

  const filePath = result.rows[0].transcript_file_path;

  if (isS3Configured()) {
    try {
      const buffer = await getFileFromS3(filePath);
      return buffer.toString('utf-8');
    } catch (e) {
      return null;
    }
  } else {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return fs.readFileSync(filePath, 'utf-8');
  }
}

/**
 * Get all transcripts combined as plain text (for re-analysis)
 */
async function getAllTranscriptsText(sessionId) {
  const recordings = await pool.query(`
    SELECT transcription, chunk_index
    FROM session_recordings
    WHERE session_id = $1 AND transcription IS NOT NULL
    ORDER BY chunk_index ASC, created_at ASC
  `, [sessionId]);

  if (recordings.rows.length === 0) {
    return '';
  }

  return recordings.rows
    .map(r => `[Chunk ${(r.chunk_index || 0) + 1}]\n${r.transcription}`)
    .join('\n\n');
}

module.exports = {
  getTranscriptFilePath,
  appendTranscript,
  regenerateTranscript,
  getTranscriptContent,
  getAllTranscriptsText
};
