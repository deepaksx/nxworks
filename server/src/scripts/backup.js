/**
 * Backup Script - Full backup of database and files
 *
 * Creates a timestamped backup folder with:
 * - database.sql: Full SQL dump of all tables
 * - uploads/: All audio and document files
 * - manifest.json: Backup metadata
 *
 * Usage: npm run backup
 */

require('dotenv').config();
const { pool } = require('../models/db');
const { isS3Configured, getS3Client, getBucketName } = require('../services/s3');
const { GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');

// Tables to backup in order (respects foreign key dependencies)
const TABLES_IN_ORDER = [
  'workshops',
  'entities',
  'sessions',
  'questions',
  'answers',
  'observations',
  'audio_recordings',
  'documents',
  'workshop_participants',
  'session_reports'
];

// Generate backup folder name with timestamp
const getBackupFolderName = () => {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '_')
    .slice(0, 15);
  return `backup_${timestamp}`;
};

// Escape SQL string values
const escapeSqlValue = (value) => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return value.toString();
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
};

// Export a single table to SQL INSERT statements
const exportTable = async (client, tableName) => {
  const result = await client.query(`SELECT * FROM ${tableName} ORDER BY id`);

  if (result.rows.length === 0) {
    return `-- Table ${tableName}: No data\n\n`;
  }

  const columns = Object.keys(result.rows[0]);
  let sql = `-- Table ${tableName}: ${result.rows.length} rows\n`;

  for (const row of result.rows) {
    const values = columns.map(col => escapeSqlValue(row[col]));
    sql += `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`;
  }

  sql += '\n';
  return sql;
};

// Export full database schema and data
const exportDatabase = async (client, backupDir) => {
  console.log('Exporting database...');

  let sql = `-- Database Backup\n`;
  sql += `-- Generated: ${new Date().toISOString()}\n`;
  sql += `-- Environment: ${process.env.NODE_ENV || 'development'}\n\n`;

  // Add transaction wrapper
  sql += `BEGIN;\n\n`;

  // Disable triggers during restore for faster import
  sql += `-- Disable triggers for faster import\n`;
  sql += `SET session_replication_role = replica;\n\n`;

  // Truncate tables in reverse order (to handle foreign keys)
  sql += `-- Clear existing data (in reverse order for foreign keys)\n`;
  for (const table of [...TABLES_IN_ORDER].reverse()) {
    sql += `TRUNCATE TABLE ${table} CASCADE;\n`;
  }
  sql += '\n';

  // Reset sequences
  sql += `-- Reset sequences\n`;
  for (const table of TABLES_IN_ORDER) {
    sql += `ALTER SEQUENCE IF EXISTS ${table}_id_seq RESTART WITH 1;\n`;
  }
  sql += '\n';

  // Export each table
  for (const table of TABLES_IN_ORDER) {
    try {
      sql += await exportTable(client, table);
      const count = (await client.query(`SELECT COUNT(*) FROM ${table}`)).rows[0].count;
      console.log(`  - ${table}: ${count} rows`);
    } catch (error) {
      console.log(`  - ${table}: table does not exist, skipping`);
    }
  }

  // Update sequences to continue from max id
  sql += `-- Update sequences to correct values\n`;
  for (const table of TABLES_IN_ORDER) {
    sql += `SELECT setval('${table}_id_seq', COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1, false);\n`;
  }
  sql += '\n';

  // Re-enable triggers
  sql += `-- Re-enable triggers\n`;
  sql += `SET session_replication_role = DEFAULT;\n\n`;

  sql += `COMMIT;\n`;

  // Write to file
  const dbFile = path.join(backupDir, 'database.sql');
  fs.writeFileSync(dbFile, sql, 'utf8');
  console.log(`Database exported to: ${dbFile}`);

  return { rowCounts: {} };
};

// Download files from S3
const backupS3Files = async (backupDir) => {
  console.log('\nBacking up files from S3...');

  const s3Client = getS3Client();
  if (!s3Client) {
    console.log('S3 not configured, skipping S3 backup');
    return { audioCount: 0, docCount: 0 };
  }

  const bucket = getBucketName();
  const uploadsDir = path.join(backupDir, 'uploads');
  const audioDir = path.join(uploadsDir, 'audio');
  const documentsDir = path.join(uploadsDir, 'documents');

  fs.mkdirSync(audioDir, { recursive: true });
  fs.mkdirSync(documentsDir, { recursive: true });

  let audioCount = 0;
  let docCount = 0;

  // List and download audio files
  try {
    const audioList = await s3Client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: 'uploads/audio/'
    }));

    if (audioList.Contents) {
      for (const obj of audioList.Contents) {
        if (obj.Size > 0) {
          const fileName = path.basename(obj.Key);
          const destPath = path.join(audioDir, fileName);

          const getCmd = new GetObjectCommand({ Bucket: bucket, Key: obj.Key });
          const response = await s3Client.send(getCmd);

          await pipeline(response.Body, fs.createWriteStream(destPath));
          audioCount++;
          console.log(`  - Downloaded: ${fileName}`);
        }
      }
    }
  } catch (error) {
    console.log(`  Warning: Could not list audio files: ${error.message}`);
  }

  // List and download document files
  try {
    const docList = await s3Client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: 'uploads/documents/'
    }));

    if (docList.Contents) {
      for (const obj of docList.Contents) {
        if (obj.Size > 0) {
          const fileName = path.basename(obj.Key);
          const destPath = path.join(documentsDir, fileName);

          const getCmd = new GetObjectCommand({ Bucket: bucket, Key: obj.Key });
          const response = await s3Client.send(getCmd);

          await pipeline(response.Body, fs.createWriteStream(destPath));
          docCount++;
          console.log(`  - Downloaded: ${fileName}`);
        }
      }
    }
  } catch (error) {
    console.log(`  Warning: Could not list document files: ${error.message}`);
  }

  console.log(`S3 backup complete: ${audioCount} audio files, ${docCount} documents`);
  return { audioCount, docCount };
};

// Copy files from local uploads folder
const backupLocalFiles = async (backupDir) => {
  console.log('\nBacking up local files...');

  const serverDir = path.resolve(__dirname, '../..');
  const uploadsSource = path.join(serverDir, 'uploads');
  const uploadsDir = path.join(backupDir, 'uploads');
  const audioDir = path.join(uploadsDir, 'audio');
  const documentsDir = path.join(uploadsDir, 'documents');

  fs.mkdirSync(audioDir, { recursive: true });
  fs.mkdirSync(documentsDir, { recursive: true });

  let audioCount = 0;
  let docCount = 0;

  // Copy audio files
  const audioSource = path.join(uploadsSource, 'audio');
  if (fs.existsSync(audioSource)) {
    const audioFiles = fs.readdirSync(audioSource);
    for (const file of audioFiles) {
      const srcPath = path.join(audioSource, file);
      const destPath = path.join(audioDir, file);
      if (fs.statSync(srcPath).isFile()) {
        fs.copyFileSync(srcPath, destPath);
        audioCount++;
        console.log(`  - Copied: audio/${file}`);
      }
    }
  }

  // Copy document files
  const docsSource = path.join(uploadsSource, 'documents');
  if (fs.existsSync(docsSource)) {
    const docFiles = fs.readdirSync(docsSource);
    for (const file of docFiles) {
      const srcPath = path.join(docsSource, file);
      const destPath = path.join(documentsDir, file);
      if (fs.statSync(srcPath).isFile()) {
        fs.copyFileSync(srcPath, destPath);
        docCount++;
        console.log(`  - Copied: documents/${file}`);
      }
    }
  }

  console.log(`Local backup complete: ${audioCount} audio files, ${docCount} documents`);
  return { audioCount, docCount };
};

// Main backup function
const runBackup = async () => {
  const client = await pool.connect();

  try {
    console.log('\n========================================');
    console.log('Starting Full Backup');
    console.log('========================================\n');

    // Create backup directory
    const backupsRoot = path.resolve(__dirname, '../../backups');
    const backupFolder = getBackupFolderName();
    const backupDir = path.join(backupsRoot, backupFolder);

    fs.mkdirSync(backupDir, { recursive: true });
    console.log(`Backup directory: ${backupDir}\n`);

    // Export database
    await exportDatabase(client, backupDir);

    // Backup files (S3 or local)
    let fileStats;
    if (isS3Configured()) {
      fileStats = await backupS3Files(backupDir);
    } else {
      fileStats = await backupLocalFiles(backupDir);
    }

    // Create manifest
    const manifest = {
      version: '1.0',
      createdAt: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      storageType: isS3Configured() ? 's3' : 'local',
      s3Bucket: isS3Configured() ? getBucketName() : null,
      files: {
        audioCount: fileStats.audioCount,
        documentCount: fileStats.docCount
      },
      tables: TABLES_IN_ORDER
    };

    const manifestPath = path.join(backupDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    console.log('\n========================================');
    console.log('Backup Complete!');
    console.log('========================================');
    console.log(`Location: ${backupDir}`);
    console.log(`Files: ${fileStats.audioCount} audio, ${fileStats.docCount} documents`);
    console.log('\nTo restore, run: npm run restore ' + backupFolder);
    console.log('========================================\n');

    return backupDir;

  } catch (error) {
    console.error('\nBackup failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

// Run if called directly
if (require.main === module) {
  runBackup()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runBackup };
