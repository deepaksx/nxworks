/**
 * Restore Script - Full restore from backup
 *
 * Restores:
 * - database.sql: Full SQL restore to database
 * - uploads/: All audio and document files to S3 or local
 *
 * Usage: npm run restore <backup_folder_name>
 * Example: npm run restore backup_20260121_143000
 */

require('dotenv').config();
const { pool } = require('../models/db');
const { isS3Configured, uploadToS3, getBucketName } = require('../services/s3');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Prompt user for confirmation
const confirmRestore = async (backupDir, manifest) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    console.log('\n========================================');
    console.log('RESTORE CONFIRMATION');
    console.log('========================================');
    console.log(`Backup: ${path.basename(backupDir)}`);
    console.log(`Created: ${manifest.createdAt}`);
    console.log(`Environment: ${manifest.environment}`);
    console.log(`Storage: ${manifest.storageType}`);
    console.log(`Files: ${manifest.files.audioCount} audio, ${manifest.files.documentCount} documents`);
    console.log('\nWARNING: This will OVERWRITE all current data!');
    console.log('========================================\n');

    rl.question('Type "RESTORE" to confirm: ', (answer) => {
      rl.close();
      resolve(answer === 'RESTORE');
    });
  });
};

// Execute SQL file
const restoreDatabase = async (client, backupDir) => {
  console.log('\nRestoring database...');

  const sqlFile = path.join(backupDir, 'database.sql');
  if (!fs.existsSync(sqlFile)) {
    throw new Error('database.sql not found in backup');
  }

  const sql = fs.readFileSync(sqlFile, 'utf8');

  // Split by semicolons but be careful with string content
  const statements = [];
  let current = '';
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const prevChar = i > 0 ? sql[i - 1] : '';

    if (!inString && (char === "'" || char === '"')) {
      inString = true;
      stringChar = char;
    } else if (inString && char === stringChar && prevChar !== '\\') {
      // Check for escaped quotes ('')
      if (sql[i + 1] !== stringChar) {
        inString = false;
      }
    }

    current += char;

    if (!inString && char === ';') {
      const stmt = current.trim();
      if (stmt && !stmt.startsWith('--')) {
        statements.push(stmt);
      }
      current = '';
    }
  }

  // Execute statements
  let executed = 0;
  let errors = 0;

  for (const stmt of statements) {
    // Skip comments and empty lines
    if (!stmt || stmt.startsWith('--')) continue;

    try {
      await client.query(stmt);
      executed++;
    } catch (error) {
      // Log but continue (some statements might fail if tables don't exist yet)
      if (!stmt.includes('TRUNCATE') && !stmt.includes('ALTER SEQUENCE')) {
        console.log(`  Warning: ${error.message.slice(0, 80)}`);
        errors++;
      }
    }
  }

  console.log(`Database restored: ${executed} statements executed, ${errors} warnings`);
};

// Upload files to S3
const restoreFilesToS3 = async (backupDir) => {
  console.log('\nRestoring files to S3...');

  const uploadsDir = path.join(backupDir, 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    console.log('No uploads folder in backup, skipping file restore');
    return { audioCount: 0, docCount: 0 };
  }

  let audioCount = 0;
  let docCount = 0;

  // Restore audio files
  const audioDir = path.join(uploadsDir, 'audio');
  if (fs.existsSync(audioDir)) {
    const audioFiles = fs.readdirSync(audioDir);
    for (const file of audioFiles) {
      const filePath = path.join(audioDir, file);
      if (fs.statSync(filePath).isFile()) {
        const key = `uploads/audio/${file}`;
        // Determine content type
        let contentType = 'audio/webm';
        if (file.endsWith('.mp3')) contentType = 'audio/mpeg';
        if (file.endsWith('.wav')) contentType = 'audio/wav';

        // Upload without deleting local (create a copy first)
        const tempPath = path.join(require('os').tmpdir(), file);
        fs.copyFileSync(filePath, tempPath);

        try {
          await uploadToS3(tempPath, key, contentType);
          audioCount++;
          console.log(`  - Uploaded: ${key}`);
        } catch (error) {
          console.log(`  - Failed to upload ${file}: ${error.message}`);
        }
      }
    }
  }

  // Restore document files
  const docsDir = path.join(uploadsDir, 'documents');
  if (fs.existsSync(docsDir)) {
    const docFiles = fs.readdirSync(docsDir);
    for (const file of docFiles) {
      const filePath = path.join(docsDir, file);
      if (fs.statSync(filePath).isFile()) {
        const key = `uploads/documents/${file}`;
        // Determine content type
        let contentType = 'application/octet-stream';
        if (file.endsWith('.pdf')) contentType = 'application/pdf';
        if (file.endsWith('.docx')) contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        if (file.endsWith('.xlsx')) contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

        // Upload without deleting local
        const tempPath = path.join(require('os').tmpdir(), file);
        fs.copyFileSync(filePath, tempPath);

        try {
          await uploadToS3(tempPath, key, contentType);
          docCount++;
          console.log(`  - Uploaded: ${key}`);
        } catch (error) {
          console.log(`  - Failed to upload ${file}: ${error.message}`);
        }
      }
    }
  }

  console.log(`S3 restore complete: ${audioCount} audio files, ${docCount} documents`);
  return { audioCount, docCount };
};

// Copy files to local uploads folder
const restoreFilesToLocal = async (backupDir) => {
  console.log('\nRestoring files to local uploads...');

  const uploadsSource = path.join(backupDir, 'uploads');
  if (!fs.existsSync(uploadsSource)) {
    console.log('No uploads folder in backup, skipping file restore');
    return { audioCount: 0, docCount: 0 };
  }

  const serverDir = path.resolve(__dirname, '../..');
  const uploadsDest = path.join(serverDir, 'uploads');
  const audioDestDir = path.join(uploadsDest, 'audio');
  const docsDestDir = path.join(uploadsDest, 'documents');

  fs.mkdirSync(audioDestDir, { recursive: true });
  fs.mkdirSync(docsDestDir, { recursive: true });

  let audioCount = 0;
  let docCount = 0;

  // Restore audio files
  const audioSource = path.join(uploadsSource, 'audio');
  if (fs.existsSync(audioSource)) {
    const audioFiles = fs.readdirSync(audioSource);
    for (const file of audioFiles) {
      const srcPath = path.join(audioSource, file);
      const destPath = path.join(audioDestDir, file);
      if (fs.statSync(srcPath).isFile()) {
        fs.copyFileSync(srcPath, destPath);
        audioCount++;
        console.log(`  - Restored: audio/${file}`);
      }
    }
  }

  // Restore document files
  const docsSource = path.join(uploadsSource, 'documents');
  if (fs.existsSync(docsSource)) {
    const docFiles = fs.readdirSync(docsSource);
    for (const file of docFiles) {
      const srcPath = path.join(docsSource, file);
      const destPath = path.join(docsDestDir, file);
      if (fs.statSync(srcPath).isFile()) {
        fs.copyFileSync(srcPath, destPath);
        docCount++;
        console.log(`  - Restored: documents/${file}`);
      }
    }
  }

  console.log(`Local restore complete: ${audioCount} audio files, ${docCount} documents`);
  return { audioCount, docCount };
};

// Main restore function
const runRestore = async (backupFolderName) => {
  if (!backupFolderName) {
    console.error('Usage: npm run restore <backup_folder_name>');
    console.error('Example: npm run restore backup_20260121_143000');
    console.error('\nAvailable backups:');

    const backupsRoot = path.resolve(__dirname, '../../backups');
    if (fs.existsSync(backupsRoot)) {
      const backups = fs.readdirSync(backupsRoot)
        .filter(f => f.startsWith('backup_'))
        .sort()
        .reverse();

      if (backups.length > 0) {
        backups.forEach(b => console.log(`  - ${b}`));
      } else {
        console.log('  (no backups found)');
      }
    } else {
      console.log('  (no backups folder)');
    }

    process.exit(1);
  }

  const backupsRoot = path.resolve(__dirname, '../../backups');
  const backupDir = path.join(backupsRoot, backupFolderName);

  if (!fs.existsSync(backupDir)) {
    console.error(`Backup not found: ${backupDir}`);
    process.exit(1);
  }

  // Read manifest
  const manifestPath = path.join(backupDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('manifest.json not found in backup folder');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  // Confirm with user
  const confirmed = await confirmRestore(backupDir, manifest);
  if (!confirmed) {
    console.log('\nRestore cancelled.');
    process.exit(0);
  }

  const client = await pool.connect();

  try {
    console.log('\n========================================');
    console.log('Starting Restore');
    console.log('========================================');

    // Restore database
    await restoreDatabase(client, backupDir);

    // Restore files
    let fileStats;
    if (isS3Configured()) {
      fileStats = await restoreFilesToS3(backupDir);
    } else {
      fileStats = await restoreFilesToLocal(backupDir);
    }

    console.log('\n========================================');
    console.log('Restore Complete!');
    console.log('========================================');
    console.log(`Database restored from: ${backupFolderName}`);
    console.log(`Files: ${fileStats.audioCount} audio, ${fileStats.docCount} documents`);
    console.log('========================================\n');

  } catch (error) {
    console.error('\nRestore failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

// Run if called directly
if (require.main === module) {
  const backupFolder = process.argv[2];
  runRestore(backupFolder)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runRestore };
