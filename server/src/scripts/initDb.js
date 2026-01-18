require('dotenv').config();
const { pool } = require('../models/db');

const initDb = async () => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create sessions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        session_number INTEGER NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        module VARCHAR(100) NOT NULL,
        lead_consultant VARCHAR(255),
        date DATE,
        duration VARCHAR(100),
        status VARCHAR(50) DEFAULT 'not_started',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create entities table
    await client.query(`
      CREATE TABLE IF NOT EXISTS entities (
        id SERIAL PRIMARY KEY,
        code VARCHAR(10) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create categories table
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
        entity_id INTEGER REFERENCES entities(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(50),
        question_range VARCHAR(50),
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create questions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS questions (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
        entity_id INTEGER REFERENCES entities(id) ON DELETE CASCADE,
        category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        question_number INTEGER NOT NULL,
        question_text TEXT NOT NULL,
        category_name VARCHAR(255),
        is_critical BOOLEAN DEFAULT FALSE,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create answers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS answers (
        id SERIAL PRIMARY KEY,
        question_id INTEGER REFERENCES questions(id) ON DELETE CASCADE,
        text_response TEXT,
        respondent_name VARCHAR(255),
        respondent_role VARCHAR(255),
        notes TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create audio_recordings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS audio_recordings (
        id SERIAL PRIMARY KEY,
        answer_id INTEGER REFERENCES answers(id) ON DELETE CASCADE,
        file_path VARCHAR(500) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100),
        file_size INTEGER,
        duration_seconds INTEGER,
        transcription TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create documents table
    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        answer_id INTEGER REFERENCES answers(id) ON DELETE CASCADE,
        file_path VARCHAR(500) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100),
        file_size INTEGER,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create workshop_participants table
    await client.query(`
      CREATE TABLE IF NOT EXISTS workshop_participants (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(255),
        company VARCHAR(255),
        email VARCHAR(255),
        is_present BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    await client.query('CREATE INDEX IF NOT EXISTS idx_questions_session ON questions(session_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_questions_entity ON questions(entity_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_answers_question ON answers(question_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_audio_answer ON audio_recordings(answer_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_documents_answer ON documents(answer_id)');

    await client.query('COMMIT');
    console.log('Database initialized successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error initializing database:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

initDb().catch(console.error);
