require('dotenv').config();
const { pool } = require('../models/db');

const initDb = async () => {
  const client = await pool.connect();

  try {
    console.log('Initializing database (fresh)...');
    await client.query('BEGIN');

    // Drop all tables first for clean slate
    console.log('Dropping existing tables...');
    await client.query('DROP TABLE IF EXISTS session_reports CASCADE');
    await client.query('DROP TABLE IF EXISTS session_checklist_items CASCADE');
    await client.query('DROP TABLE IF EXISTS session_recordings CASCADE');
    await client.query('DROP TABLE IF EXISTS observations CASCADE');
    await client.query('DROP TABLE IF EXISTS audio_recordings CASCADE');
    await client.query('DROP TABLE IF EXISTS documents CASCADE');
    await client.query('DROP TABLE IF EXISTS answers CASCADE');
    await client.query('DROP TABLE IF EXISTS questions CASCADE');
    await client.query('DROP TABLE IF EXISTS workshop_participants CASCADE');
    await client.query('DROP TABLE IF EXISTS sessions CASCADE');
    await client.query('DROP TABLE IF EXISTS entities CASCADE');
    await client.query('DROP TABLE IF EXISTS workshops CASCADE');

    // Create workshops table (top-level container)
    console.log('Creating workshops table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS workshops (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        client_name VARCHAR(255),
        client_website VARCHAR(500),
        industry_context TEXT,
        custom_instructions TEXT,
        mission_statement TEXT,
        questions_per_session INTEGER DEFAULT 30,
        status VARCHAR(50) DEFAULT 'setup',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create entities table (belongs to workshop)
    console.log('Creating entities table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS entities (
        id SERIAL PRIMARY KEY,
        workshop_id INTEGER REFERENCES workshops(id) ON DELETE CASCADE,
        code VARCHAR(10) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        industry VARCHAR(255),
        sector VARCHAR(255),
        business_context TEXT,
        website VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(workshop_id, code)
      )
    `);

    // Create sessions table (belongs to workshop)
    console.log('Creating sessions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        workshop_id INTEGER REFERENCES workshops(id) ON DELETE CASCADE,
        session_number INTEGER NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        module VARCHAR(100) NOT NULL,
        agenda TEXT,
        topics TEXT,
        question_count INTEGER DEFAULT 30,
        questions_generated BOOLEAN DEFAULT FALSE,
        checklist_mode BOOLEAN DEFAULT FALSE,
        checklist_generated BOOLEAN DEFAULT FALSE,
        status VARCHAR(50) DEFAULT 'not_started',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(workshop_id, session_number)
      )
    `);

    // Create questions table
    console.log('Creating questions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS questions (
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
      CREATE TABLE IF NOT EXISTS answers (
        id SERIAL PRIMARY KEY,
        question_id INTEGER REFERENCES questions(id) ON DELETE CASCADE,
        text_response TEXT,
        respondent_name VARCHAR(255),
        respondent_role VARCHAR(255),
        respondents JSONB DEFAULT '[]'::jsonb,
        notes TEXT,
        observation TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create observations table
    console.log('Creating observations table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS observations (
        id SERIAL PRIMARY KEY,
        answer_id INTEGER REFERENCES answers(id) ON DELETE CASCADE,
        observation_number INTEGER NOT NULL DEFAULT 1,
        obtained_info JSONB,
        missing_info JSONB,
        additional_findings JSONB,
        summary TEXT,
        raw_observation TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create audio_recordings table
    console.log('Creating audio_recordings table...');
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
    console.log('Creating documents table...');
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
    console.log('Creating workshop_participants table...');
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

    // Create session_checklist_items table (for direct checklist mode)
    console.log('Creating session_checklist_items table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS session_checklist_items (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
        item_number INTEGER NOT NULL,
        item_text TEXT NOT NULL,
        importance VARCHAR(20) DEFAULT 'important',
        category VARCHAR(255),
        suggested_question TEXT,
        status VARCHAR(20) DEFAULT 'missing',
        obtained_text TEXT,
        obtained_source VARCHAR(50),
        obtained_confidence VARCHAR(20),
        obtained_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create session_recordings table (for direct checklist mode)
    console.log('Creating session_recordings table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS session_recordings (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
        file_path VARCHAR(500) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100),
        file_size INTEGER,
        duration_seconds INTEGER,
        transcription TEXT,
        chunk_index INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create session_reports table
    console.log('Creating session_reports table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS session_reports (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
        report_type VARCHAR(50) DEFAULT 'final',
        title VARCHAR(255),
        executive_summary TEXT,
        key_findings JSONB,
        recommendations JSONB,
        risks_and_gaps JSONB,
        next_steps JSONB,
        kds_items JSONB DEFAULT '[]'::jsonb,
        bpml_items JSONB DEFAULT '[]'::jsonb,
        raw_content TEXT,
        generated_by VARCHAR(255),
        status VARCHAR(50) DEFAULT 'draft',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    console.log('Creating indexes...');
    await client.query('CREATE INDEX IF NOT EXISTS idx_entities_workshop ON entities(workshop_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sessions_workshop ON sessions(workshop_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_questions_session ON questions(session_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_questions_entity ON questions(entity_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_answers_question ON answers(question_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_observations_answer ON observations(answer_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_audio_answer ON audio_recordings(answer_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_documents_answer ON documents(answer_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_participants_session ON workshop_participants(session_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_reports_session ON session_reports(session_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_session_checklist_session ON session_checklist_items(session_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_session_checklist_status ON session_checklist_items(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_session_recordings_session ON session_recordings(session_id)');

    await client.query('COMMIT');
    console.log('\n========================================');
    console.log('Database initialized successfully!');
    console.log('========================================\n');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error initializing database:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

// Run if called directly
if (require.main === module) {
  initDb().catch(console.error);
}

module.exports = initDb;
