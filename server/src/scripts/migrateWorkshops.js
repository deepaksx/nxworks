require('dotenv').config();
const { pool } = require('../models/db');

const migrateWorkshops = async () => {
  const client = await pool.connect();

  try {
    console.log('Starting workshop migration...');
    await client.query('BEGIN');

    // Drop old tables and recreate with workshop structure
    console.log('Dropping old tables...');
    await client.query('DROP TABLE IF EXISTS audio_recordings CASCADE');
    await client.query('DROP TABLE IF EXISTS documents CASCADE');
    await client.query('DROP TABLE IF EXISTS answers CASCADE');
    await client.query('DROP TABLE IF EXISTS generated_questions CASCADE');
    await client.query('DROP TABLE IF EXISTS questions CASCADE');
    await client.query('DROP TABLE IF EXISTS categories CASCADE');
    await client.query('DROP TABLE IF EXISTS workshop_participants CASCADE');
    await client.query('DROP TABLE IF EXISTS global_audience_profiles CASCADE');
    await client.query('DROP TABLE IF EXISTS session_templates CASCADE');
    await client.query('DROP TABLE IF EXISTS sessions CASCADE');
    await client.query('DROP TABLE IF EXISTS entities CASCADE');
    await client.query('DROP TABLE IF EXISTS global_workshop_config CASCADE');
    await client.query('DROP TABLE IF EXISTS workshops CASCADE');

    // Create workshops table (top-level container)
    console.log('Creating workshops table...');
    await client.query(`
      CREATE TABLE workshops (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        client_name VARCHAR(255),
        industry_context TEXT,
        custom_instructions TEXT,
        questions_per_session INTEGER DEFAULT 30,
        status VARCHAR(50) DEFAULT 'setup',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create entities table (belongs to workshop)
    console.log('Creating entities table...');
    await client.query(`
      CREATE TABLE entities (
        id SERIAL PRIMARY KEY,
        workshop_id INTEGER REFERENCES workshops(id) ON DELETE CASCADE,
        code VARCHAR(10) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        industry VARCHAR(255),
        sector VARCHAR(255),
        business_context TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(workshop_id, code)
      )
    `);

    // Create sessions table (belongs to workshop)
    console.log('Creating sessions table...');
    await client.query(`
      CREATE TABLE sessions (
        id SERIAL PRIMARY KEY,
        workshop_id INTEGER REFERENCES workshops(id) ON DELETE CASCADE,
        session_number INTEGER NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        module VARCHAR(100) NOT NULL,
        agenda TEXT,
        question_count INTEGER DEFAULT 30,
        questions_generated BOOLEAN DEFAULT FALSE,
        status VARCHAR(50) DEFAULT 'not_started',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(workshop_id, session_number)
      )
    `);

    // Create questions table
    console.log('Creating questions table...');
    await client.query(`
      CREATE TABLE questions (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
        entity_id INTEGER REFERENCES entities(id) ON DELETE SET NULL,
        question_number INTEGER NOT NULL,
        question_text TEXT NOT NULL,
        category_name VARCHAR(255),
        is_critical BOOLEAN DEFAULT FALSE,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create answers table
    console.log('Creating answers table...');
    await client.query(`
      CREATE TABLE answers (
        id SERIAL PRIMARY KEY,
        question_id INTEGER REFERENCES questions(id) ON DELETE CASCADE,
        text_response TEXT,
        respondent_name VARCHAR(255),
        respondent_role VARCHAR(255),
        notes TEXT,
        observation TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create audio_recordings table
    console.log('Creating audio_recordings table...');
    await client.query(`
      CREATE TABLE audio_recordings (
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
    console.log('Creating documents table...');
    await client.query(`
      CREATE TABLE documents (
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
    console.log('Creating workshop_participants table...');
    await client.query(`
      CREATE TABLE workshop_participants (
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
    console.log('Creating indexes...');
    await client.query('CREATE INDEX idx_entities_workshop ON entities(workshop_id)');
    await client.query('CREATE INDEX idx_sessions_workshop ON sessions(workshop_id)');
    await client.query('CREATE INDEX idx_questions_session ON questions(session_id)');
    await client.query('CREATE INDEX idx_answers_question ON answers(question_id)');
    await client.query('CREATE INDEX idx_audio_answer ON audio_recordings(answer_id)');
    await client.query('CREATE INDEX idx_documents_answer ON documents(answer_id)');

    await client.query('COMMIT');
    console.log('\n========================================');
    console.log('Workshop migration complete!');
    console.log('New structure: Workshop -> Entities/Sessions -> Questions -> Answers');
    console.log('========================================\n');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error during migration:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

migrateWorkshops().catch(console.error);
