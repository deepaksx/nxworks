const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const db = require('../models/db');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Transcribe audio file and clean it up
router.post('/:audioId', async (req, res) => {
  try {
    const { audioId } = req.params;

    // Get audio file info from database
    const audioResult = await db.query(
      'SELECT * FROM audio_recordings WHERE id = $1',
      [audioId]
    );

    if (audioResult.rows.length === 0) {
      return res.status(404).json({ error: 'Audio recording not found' });
    }

    const audio = audioResult.rows[0];
    const filePath = path.join(__dirname, '../..', audio.file_path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Audio file not found on disk' });
    }

    console.log('Transcribing audio:', filePath);

    // Step 1: Transcribe using Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: 'whisper-1',
      language: 'en',
      response_format: 'text'
    });

    console.log('Raw transcription:', transcription);

    // Step 2: Clean up and structure using GPT
    const cleanupResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are helping transcribe and clean up audio recordings from an SAP S/4HANA pre-discovery workshop for Al Rawabi (a dairy company in UAE).

Your task:
1. Fix any grammar or unclear phrasing
2. Organize the content clearly
3. Preserve all technical details, names, and business terms
4. Format as clear, professional notes
5. If there are action items or decisions, highlight them

Keep the response concise and directly usable as meeting notes.`
        },
        {
          role: 'user',
          content: `Please clean up this transcription from a workshop discussion:\n\n${transcription}`
        }
      ],
      temperature: 0.3,
      max_tokens: 1000
    });

    const cleanedText = cleanupResponse.choices[0].message.content;

    // Step 3: Save transcription to database
    await db.query(
      'UPDATE audio_recordings SET transcription = $1 WHERE id = $2',
      [cleanedText, audioId]
    );

    res.json({
      success: true,
      raw_transcription: transcription,
      cleaned_transcription: cleanedText
    });

  } catch (error) {
    console.error('Transcription error:', error);

    if (error.code === 'invalid_api_key') {
      return res.status(401).json({ error: 'Invalid OpenAI API key. Please check OPENAI_API_KEY in .env' });
    }

    res.status(500).json({
      error: 'Failed to transcribe audio',
      details: error.message
    });
  }
});

// Get transcription for an audio
router.get('/:audioId', async (req, res) => {
  try {
    const { audioId } = req.params;

    const result = await db.query(
      'SELECT transcription FROM audio_recordings WHERE id = $1',
      [audioId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Audio recording not found' });
    }

    res.json({ transcription: result.rows[0].transcription });
  } catch (error) {
    console.error('Error fetching transcription:', error);
    res.status(500).json({ error: 'Failed to fetch transcription' });
  }
});

module.exports = router;
