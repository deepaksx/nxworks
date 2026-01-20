require('dotenv').config();
const { pool } = require('../models/db');

const addReportsTable = async () => {
  const client = await pool.connect();

  try {
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
        raw_content TEXT,
        generated_by VARCHAR(255),
        status VARCHAR(50) DEFAULT 'draft',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reports_session ON session_reports(session_id)
    `);

    console.log('session_reports table created successfully!');
  } catch (error) {
    console.error('Error creating table:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

addReportsTable().catch(console.error);
