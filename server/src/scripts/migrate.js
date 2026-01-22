/**
 * Migration Script - Safe ALTER TABLE migration (no data loss)
 *
 * This script ONLY adds new columns and tables.
 * It does NOT delete any existing data.
 *
 * Changes for Direct Checklist Mode feature:
 * - workshops: Add mission_statement column
 * - sessions: Add checklist_mode, checklist_generated columns
 * - NEW TABLE: session_checklist_items
 * - NEW TABLE: session_recordings
 *
 * Usage: npm run migrate
 */

require('dotenv').config();
const { pool } = require('../models/db');

// Helper to check if column exists
const columnExists = async (client, table, column) => {
  const result = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = $1 AND column_name = $2
  `, [table, column]);
  return result.rows.length > 0;
};

// Helper to check if table exists
const tableExists = async (client, table) => {
  const result = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_name = $1
  `, [table]);
  return result.rows.length > 0;
};

// Helper to check if index exists
const indexExists = async (client, indexName) => {
  const result = await client.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE indexname = $1
  `, [indexName]);
  return result.rows.length > 0;
};

// Migration: Add column if not exists
const addColumnIfNotExists = async (client, table, column, definition) => {
  const exists = await columnExists(client, table, column);
  if (exists) {
    console.log(`  [SKIP] ${table}.${column} already exists`);
    return false;
  }

  await client.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  console.log(`  [ADD] ${table}.${column} - ${definition}`);
  return true;
};

// Migration: Create index if not exists
const createIndexIfNotExists = async (client, indexName, table, columns) => {
  const exists = await indexExists(client, indexName);
  if (exists) {
    console.log(`  [SKIP] Index ${indexName} already exists`);
    return false;
  }

  await client.query(`CREATE INDEX ${indexName} ON ${table}(${columns})`);
  console.log(`  [ADD] Index ${indexName} on ${table}(${columns})`);
  return true;
};

// Run all migrations
const runMigrations = async () => {
  const client = await pool.connect();

  try {
    console.log('\n========================================');
    console.log('Running Safe Database Migration');
    console.log('========================================');
    console.log('This will ONLY add new columns and tables.');
    console.log('Existing data will NOT be modified or deleted.\n');

    await client.query('BEGIN');

    let changesCount = 0;

    // ===========================================
    // Migration 1: Add mission_statement to workshops
    // ===========================================
    console.log('Migration 1: workshops table');
    if (await addColumnIfNotExists(client, 'workshops', 'mission_statement', 'TEXT')) {
      changesCount++;
    }

    // ===========================================
    // Migration 2: Add checklist columns to sessions
    // ===========================================
    console.log('\nMigration 2: sessions table');
    if (await addColumnIfNotExists(client, 'sessions', 'checklist_mode', 'BOOLEAN DEFAULT FALSE')) {
      changesCount++;
    }
    if (await addColumnIfNotExists(client, 'sessions', 'checklist_generated', 'BOOLEAN DEFAULT FALSE')) {
      changesCount++;
    }

    // ===========================================
    // Migration 3: Create session_checklist_items table
    // ===========================================
    console.log('\nMigration 3: session_checklist_items table');
    const checklistTableExists = await tableExists(client, 'session_checklist_items');
    if (!checklistTableExists) {
      await client.query(`
        CREATE TABLE session_checklist_items (
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
      console.log('  [CREATE] session_checklist_items table');
      changesCount++;

      // Create indexes
      await createIndexIfNotExists(client, 'idx_session_checklist_session', 'session_checklist_items', 'session_id');
      await createIndexIfNotExists(client, 'idx_session_checklist_status', 'session_checklist_items', 'status');
      changesCount += 2;
    } else {
      console.log('  [SKIP] session_checklist_items table already exists');
    }

    // ===========================================
    // Migration 4: Create session_recordings table
    // ===========================================
    console.log('\nMigration 4: session_recordings table');
    const recordingsTableExists = await tableExists(client, 'session_recordings');
    if (!recordingsTableExists) {
      await client.query(`
        CREATE TABLE session_recordings (
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
      console.log('  [CREATE] session_recordings table');
      changesCount++;

      // Create index
      await createIndexIfNotExists(client, 'idx_session_recordings_session', 'session_recordings', 'session_id');
      changesCount++;
    } else {
      console.log('  [SKIP] session_recordings table already exists');
    }

    // ===========================================
    // Migration 5: Add share columns to sessions
    // ===========================================
    console.log('\nMigration 5: sessions share columns');
    if (await addColumnIfNotExists(client, 'sessions', 'share_enabled', 'BOOLEAN DEFAULT FALSE')) {
      changesCount++;
    }
    if (await addColumnIfNotExists(client, 'sessions', 'share_token', 'VARCHAR(64) UNIQUE')) {
      changesCount++;
    }
    if (await addColumnIfNotExists(client, 'sessions', 'share_username', 'VARCHAR(100)')) {
      changesCount++;
    }
    if (await addColumnIfNotExists(client, 'sessions', 'share_password_hash', 'VARCHAR(255)')) {
      changesCount++;
    }
    if (await addColumnIfNotExists(client, 'sessions', 'share_locked_by', 'VARCHAR(100)')) {
      changesCount++;
    }
    if (await addColumnIfNotExists(client, 'sessions', 'share_locked_at', 'TIMESTAMP')) {
      changesCount++;
    }

    // ===========================================
    // Migration 6: Add session_additional_findings table
    // ===========================================
    console.log('\nMigration 6: session_additional_findings table');
    if (!await tableExists(client, 'session_additional_findings')) {
      await client.query(`
        CREATE TABLE session_additional_findings (
          id SERIAL PRIMARY KEY,
          session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
          recording_id INTEGER REFERENCES session_recordings(id) ON DELETE CASCADE,
          finding_type VARCHAR(50) DEFAULT 'general',
          topic VARCHAR(500) NOT NULL,
          details TEXT,
          sap_analysis TEXT,
          sap_recommendation TEXT,
          sap_risk_level VARCHAR(20),
          sap_best_practice TEXT,
          source_quote TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('  [CREATE] session_additional_findings table');
      changesCount++;

      // Create index
      await createIndexIfNotExists(client, 'idx_session_findings_session', 'session_additional_findings', 'session_id');
      changesCount++;
    } else {
      console.log('  [SKIP] session_additional_findings table already exists');
    }

    // ===========================================
    // Migration 7: Add session_documents table
    // ===========================================
    console.log('\nMigration 7: session_documents table');
    if (!await tableExists(client, 'session_documents')) {
      await client.query(`
        CREATE TABLE session_documents (
          id SERIAL PRIMARY KEY,
          session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
          file_path VARCHAR(500) NOT NULL,
          file_name VARCHAR(255) NOT NULL,
          original_name VARCHAR(255),
          mime_type VARCHAR(100),
          file_size INTEGER,
          extracted_text TEXT,
          analysis_status VARCHAR(20) DEFAULT 'pending',
          obtained_count INTEGER DEFAULT 0,
          findings_count INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          analyzed_at TIMESTAMP
        )
      `);
      console.log('  [CREATE] session_documents table');
      changesCount++;

      // Create index
      await createIndexIfNotExists(client, 'idx_session_documents_session', 'session_documents', 'session_id');
      changesCount++;
    } else {
      console.log('  [SKIP] session_documents table already exists');
    }

    // ===========================================
    // Migration 8: Add transcript_file_path to sessions
    // ===========================================
    console.log('\nMigration 8: sessions.transcript_file_path column');
    await addColumnIfNotExists(client, 'sessions', 'transcript_file_path', 'VARCHAR(500)');

    // ===========================================
    // Migration 9: Add best_practice to session_checklist_items
    // ===========================================
    console.log('\nMigration 9: session_checklist_items.best_practice column');
    if (await addColumnIfNotExists(client, 'session_checklist_items', 'best_practice', 'TEXT')) {
      changesCount++;
    }

    await client.query('COMMIT');

    console.log('\n========================================');
    console.log('Migration Complete!');
    console.log('========================================');
    console.log(`Changes applied: ${changesCount}`);
    console.log('Existing data has been preserved.');
    console.log('========================================\n');

    // Verify by listing new columns/tables
    console.log('Verification:');

    const workshopCols = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'workshops' AND column_name = 'mission_statement'
    `);
    console.log(`  - workshops.mission_statement: ${workshopCols.rows.length > 0 ? 'EXISTS' : 'MISSING'}`);

    const sessionCols = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'sessions' AND column_name IN ('checklist_mode', 'checklist_generated')
    `);
    console.log(`  - sessions.checklist_mode: ${sessionCols.rows.some(r => r.column_name === 'checklist_mode') ? 'EXISTS' : 'MISSING'}`);
    console.log(`  - sessions.checklist_generated: ${sessionCols.rows.some(r => r.column_name === 'checklist_generated') ? 'EXISTS' : 'MISSING'}`);

    const checklistTable = await tableExists(client, 'session_checklist_items');
    console.log(`  - session_checklist_items table: ${checklistTable ? 'EXISTS' : 'MISSING'}`);

    const recordingsTable = await tableExists(client, 'session_recordings');
    console.log(`  - session_recordings table: ${recordingsTable ? 'EXISTS' : 'MISSING'}`);

    const shareCols = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'sessions' AND column_name LIKE 'share_%'
    `);
    console.log(`  - sessions.share_* columns: ${shareCols.rows.length} found`);

    const findingsTable = await tableExists(client, 'session_additional_findings');
    console.log(`  - session_additional_findings table: ${findingsTable ? 'EXISTS' : 'MISSING'}`);

    const documentsTable = await tableExists(client, 'session_documents');
    console.log(`  - session_documents table: ${documentsTable ? 'EXISTS' : 'MISSING'}`);

    const transcriptCol = await columnExists(client, 'sessions', 'transcript_file_path');
    console.log(`  - sessions.transcript_file_path: ${transcriptCol ? 'EXISTS' : 'MISSING'}`);

    const bestPracticeCol = await columnExists(client, 'session_checklist_items', 'best_practice');
    console.log(`  - session_checklist_items.best_practice: ${bestPracticeCol ? 'EXISTS' : 'MISSING'}`);

    console.log('\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\nMigration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

// Run if called directly
if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runMigrations };
