require('dotenv').config();
const { pool } = require('../models/db');

async function addSessionTopicsColumn() {
  const client = await pool.connect();
  try {
    console.log('Adding topics column to sessions table...');

    await client.query(`
      ALTER TABLE sessions
      ADD COLUMN IF NOT EXISTS topics TEXT
    `);

    console.log('Column added successfully!');
  } catch (error) {
    console.error('Error adding column:', error);
    throw error;
  } finally {
    client.release();
  }
}

addSessionTopicsColumn()
  .then(() => {
    console.log('Migration complete');
    process.exit(0);
  })
  .catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
