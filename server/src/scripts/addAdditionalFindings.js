require('dotenv').config();
const { pool } = require('../models/db');

async function addAdditionalFindingsColumn() {
  const client = await pool.connect();
  try {
    console.log('Adding additional_findings column to observations table...');

    await client.query(`
      ALTER TABLE observations
      ADD COLUMN IF NOT EXISTS additional_findings JSONB DEFAULT '[]'::jsonb
    `);

    console.log('Column added successfully!');
  } catch (error) {
    console.error('Error adding column:', error);
    throw error;
  } finally {
    client.release();
  }
}

addAdditionalFindingsColumn()
  .then(() => {
    console.log('Migration complete');
    process.exit(0);
  })
  .catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
