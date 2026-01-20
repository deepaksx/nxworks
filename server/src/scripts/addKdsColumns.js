require('dotenv').config();
const { pool } = require('../models/db');

const addKdsColumns = async () => {
  const client = await pool.connect();

  try {
    console.log('Adding KDS and BPML columns to session_reports table...');

    // Add kds_items column
    await client.query(`
      ALTER TABLE session_reports
      ADD COLUMN IF NOT EXISTS kds_items JSONB DEFAULT '[]'::jsonb
    `);

    // Add bpml_items column
    await client.query(`
      ALTER TABLE session_reports
      ADD COLUMN IF NOT EXISTS bpml_items JSONB DEFAULT '[]'::jsonb
    `);

    console.log('KDS and BPML columns added successfully!');
  } catch (error) {
    console.error('Error adding columns:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

addKdsColumns().catch(console.error);
