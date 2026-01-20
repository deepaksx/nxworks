require('dotenv').config();
const { pool } = require('../models/db');

const addObservationsTable = async () => {
  const client = await pool.connect();

  try {
    console.log('Creating observations table...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS observations (
        id SERIAL PRIMARY KEY,
        answer_id INTEGER REFERENCES answers(id) ON DELETE CASCADE,
        observation_number INTEGER NOT NULL DEFAULT 1,
        obtained_info JSONB,
        missing_info JSONB,
        summary TEXT,
        raw_observation TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_observations_answer ON observations(answer_id)
    `);

    console.log('Observations table created successfully!');
  } catch (error) {
    console.error('Error creating table:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

addObservationsTable().catch(console.error);
