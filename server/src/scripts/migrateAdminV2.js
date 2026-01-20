require('dotenv').config();
const { pool } = require('../models/db');

const migrateAdminV2 = async () => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Global workshop configuration (not per-session)
    console.log('Creating global_workshop_config table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS global_workshop_config (
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

    // Insert default config if not exists
    await client.query(`
      INSERT INTO global_workshop_config (id, workshop_name)
      VALUES (1, 'S/4HANA Pre-Discovery Workshop')
      ON CONFLICT (id) DO NOTHING
    `);

    // Global audience profiles (not per-session)
    console.log('Creating global_audience_profiles table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS global_audience_profiles (
        id SERIAL PRIMARY KEY,
        department VARCHAR(255) NOT NULL,
        typical_roles TEXT,
        key_concerns TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Session templates for scheduling
    console.log('Creating session_templates table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS session_templates (
        id SERIAL PRIMARY KEY,
        module VARCHAR(100) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        default_duration VARCHAR(100) DEFAULT '2 hours',
        suggested_question_count INTEGER DEFAULT 30,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add scheduling columns to sessions if not exist
    console.log('Adding scheduling columns to sessions...');

    const checkScheduledDate = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'sessions' AND column_name = 'scheduled_date'
    `);
    if (checkScheduledDate.rows.length === 0) {
      await client.query('ALTER TABLE sessions ADD COLUMN scheduled_date DATE');
    }

    const checkStartTime = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'sessions' AND column_name = 'start_time'
    `);
    if (checkStartTime.rows.length === 0) {
      await client.query('ALTER TABLE sessions ADD COLUMN start_time TIME');
    }

    const checkEndTime = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'sessions' AND column_name = 'end_time'
    `);
    if (checkEndTime.rows.length === 0) {
      await client.query('ALTER TABLE sessions ADD COLUMN end_time TIME');
    }

    const checkAgenda = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'sessions' AND column_name = 'agenda'
    `);
    if (checkAgenda.rows.length === 0) {
      await client.query('ALTER TABLE sessions ADD COLUMN agenda TEXT');
    }

    const checkQuestionsGenerated = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'sessions' AND column_name = 'questions_generated'
    `);
    if (checkQuestionsGenerated.rows.length === 0) {
      await client.query('ALTER TABLE sessions ADD COLUMN questions_generated BOOLEAN DEFAULT FALSE');
    }

    const checkQuestionCount = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'sessions' AND column_name = 'question_count'
    `);
    if (checkQuestionCount.rows.length === 0) {
      await client.query('ALTER TABLE sessions ADD COLUMN question_count INTEGER DEFAULT 30');
    }

    // Ensure entities have industry columns
    console.log('Ensuring entity columns exist...');
    const checkIndustry = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'entities' AND column_name = 'industry'
    `);
    if (checkIndustry.rows.length === 0) {
      await client.query('ALTER TABLE entities ADD COLUMN industry VARCHAR(255)');
    }

    const checkSector = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'entities' AND column_name = 'sector'
    `);
    if (checkSector.rows.length === 0) {
      await client.query('ALTER TABLE entities ADD COLUMN sector VARCHAR(255)');
    }

    const checkContext = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'entities' AND column_name = 'business_context'
    `);
    if (checkContext.rows.length === 0) {
      await client.query('ALTER TABLE entities ADD COLUMN business_context TEXT');
    }

    // Ensure generated_questions table exists
    console.log('Ensuring generated_questions table exists...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS generated_questions (
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
    await client.query('CREATE INDEX IF NOT EXISTS idx_global_audience_dept ON global_audience_profiles(department)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sessions_scheduled ON sessions(scheduled_date)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_generated_questions_session ON generated_questions(session_id)');

    await client.query('COMMIT');
    console.log('Admin V2 migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error during admin V2 migration:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

migrateAdminV2().catch(console.error);
