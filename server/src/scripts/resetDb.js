require('dotenv').config();
const { pool } = require('../models/db');

const resetDb = async () => {
  const client = await pool.connect();

  try {
    console.log('Dropping all tables...');
    await client.query('BEGIN');

    // Drop all tables in correct order (respecting foreign keys)
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

    console.log('All tables dropped.');

    // Recreate base tables
    console.log('Creating sessions table...');
    await client.query(`
      CREATE TABLE sessions (
        id SERIAL PRIMARY KEY,
        session_number INTEGER NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        module VARCHAR(100) NOT NULL,
        lead_consultant VARCHAR(255),
        date DATE,
        duration VARCHAR(100),
        status VARCHAR(50) DEFAULT 'not_started',
        scheduled_date DATE,
        start_time TIME,
        end_time TIME,
        agenda TEXT,
        questions_generated BOOLEAN DEFAULT FALSE,
        question_count INTEGER DEFAULT 30,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Creating entities table...');
    await client.query(`
      CREATE TABLE entities (
        id SERIAL PRIMARY KEY,
        code VARCHAR(10) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        industry VARCHAR(255),
        sector VARCHAR(255),
        business_context TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Creating categories table...');
    await client.query(`
      CREATE TABLE categories (
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

    console.log('Creating questions table...');
    await client.query(`
      CREATE TABLE questions (
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

    // Admin V2 tables
    console.log('Creating global_workshop_config table...');
    await client.query(`
      CREATE TABLE global_workshop_config (
        id SERIAL PRIMARY KEY,
        workshop_name VARCHAR(255) DEFAULT 'S/4HANA Pre-Discovery Workshop',
        client_name VARCHAR(255),
        start_date DATE,
        end_date DATE,
        industry_context TEXT,
        custom_instructions TEXT,
        questions_per_session INTEGER DEFAULT 30,
        generation_status VARCHAR(50) DEFAULT 'not_generated',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default config
    await client.query(`
      INSERT INTO global_workshop_config (id, workshop_name)
      VALUES (1, 'S/4HANA Pre-Discovery Workshop')
    `);

    console.log('Creating global_audience_profiles table...');
    await client.query(`
      CREATE TABLE global_audience_profiles (
        id SERIAL PRIMARY KEY,
        department VARCHAR(255) NOT NULL,
        typical_roles TEXT,
        key_concerns TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Creating generated_questions table...');
    await client.query(`
      CREATE TABLE generated_questions (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
        entity_id INTEGER REFERENCES entities(id),
        question_number INTEGER,
        question_text TEXT NOT NULL,
        category_name VARCHAR(255),
        is_critical BOOLEAN DEFAULT FALSE,
        ai_rationale TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    console.log('Creating indexes...');
    await client.query('CREATE INDEX idx_questions_session ON questions(session_id)');
    await client.query('CREATE INDEX idx_questions_entity ON questions(entity_id)');
    await client.query('CREATE INDEX idx_answers_question ON answers(question_id)');
    await client.query('CREATE INDEX idx_audio_answer ON audio_recordings(answer_id)');
    await client.query('CREATE INDEX idx_documents_answer ON documents(answer_id)');
    await client.query('CREATE INDEX idx_global_audience_dept ON global_audience_profiles(department)');
    await client.query('CREATE INDEX idx_sessions_scheduled ON sessions(scheduled_date)');
    await client.query('CREATE INDEX idx_generated_questions_session ON generated_questions(session_id)');

    await client.query('COMMIT');
    console.log('\n========================================');
    console.log('Database reset complete!');
    console.log('All tables have been recreated (empty).');
    console.log('========================================\n');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error resetting database:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

resetDb().catch(console.error);
