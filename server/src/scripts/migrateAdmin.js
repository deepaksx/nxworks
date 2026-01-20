require('dotenv').config();
const { pool } = require('../models/db');

const migrateAdmin = async () => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Creating workshop_config table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS workshop_config (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE UNIQUE,
        agenda_text TEXT,
        agenda_date DATE,
        agenda_start_time TIME,
        agenda_end_time TIME,
        target_question_count INTEGER DEFAULT 50,
        industry_context TEXT,
        custom_instructions TEXT,
        generation_status VARCHAR(50) DEFAULT 'not_generated',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Creating audience_profiles table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS audience_profiles (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
        department VARCHAR(255) NOT NULL,
        typical_roles TEXT,
        key_concerns TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Creating generated_questions table...');
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

    // Check if columns exist before adding them
    console.log('Extending entities table with industry/sector/business_context...');

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

    // Create indexes
    console.log('Creating indexes...');
    await client.query('CREATE INDEX IF NOT EXISTS idx_workshop_config_session ON workshop_config(session_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_audience_profiles_session ON audience_profiles(session_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_generated_questions_session ON generated_questions(session_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_generated_questions_status ON generated_questions(status)');

    await client.query('COMMIT');
    console.log('Admin migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error during admin migration:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

migrateAdmin().catch(console.error);
