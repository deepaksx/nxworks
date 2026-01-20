require('dotenv').config();
const { pool } = require('../models/db');

const addWebsiteColumn = async () => {
  const client = await pool.connect();

  try {
    console.log('Adding client_website column to workshops table...');

    await client.query(`
      ALTER TABLE workshops
      ADD COLUMN IF NOT EXISTS client_website VARCHAR(500)
    `);

    console.log('Column added successfully!');
  } catch (error) {
    console.error('Error adding column:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

addWebsiteColumn().catch(console.error);
