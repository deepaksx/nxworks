require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../models/db');

// Session configurations
const sessions = [
  {
    session_number: 1,
    name: 'Finance & Controlling (FI/CO)',
    module: 'FICO',
    lead_consultant: 'Abu Bakar Javaid',
    date: '2026-01-19',
    duration: 'Full Day (8 hours)',
    description: 'Financial processes, pain points, GL, AR, AP, Asset Accounting, and Tax compliance',
    file: 'Al-Rawabi-Session1-FICO-Workshop-Questions-200.txt'
  },
  {
    session_number: 2,
    name: 'Materials Management (MM)',
    module: 'MM',
    lead_consultant: 'Rahul Rathore',
    date: '2026-01-20',
    duration: 'Full Day (8 hours)',
    description: 'Procurement processes, vendor relationships, purchasing workflows, inventory management',
    file: 'Al-Rawabi-Session2-MM-Workshop-Questions-200.txt'
  },
  {
    session_number: 3,
    name: 'Sales & Distribution (SD)',
    module: 'SD',
    lead_consultant: 'Sania Gul',
    date: '2026-01-21',
    duration: 'Morning Session (4 hours)',
    description: 'Sales processes, customer relationships, order management, Van Sales integration',
    file: 'Al-Rawabi-Session3-SD-Workshop-Questions-200.txt'
  },
  {
    session_number: 4,
    name: 'Production Planning (PP)',
    module: 'PP',
    lead_consultant: 'Ali Mahmoud',
    date: '2026-01-21',
    duration: 'Afternoon Session (4 hours)',
    description: 'Dairy-specific production processes, MRP, BOM management, batch management',
    file: 'Al-Rawabi-Session4-PP-Workshop-Questions-200.txt'
  },
  {
    session_number: 5,
    name: 'Quality Management (QM)',
    module: 'QM',
    lead_consultant: 'Ali Mahmoud',
    date: '2026-01-21',
    duration: 'Combined with PP Session',
    description: 'Quality inspection processes, certificates, COA management, food safety',
    file: 'Al-Rawabi-Session5-QM-Workshop-Questions-200.txt'
  },
  {
    session_number: 6,
    name: 'Human Resources (HR/HCM)',
    module: 'HR',
    lead_consultant: 'Krishna',
    date: '2026-01-22',
    duration: 'Morning Session (4 hours)',
    description: 'Organizational management, personnel administration, payroll, UAE compliance',
    file: 'Al-Rawabi-Session6-HR-Workshop-Questions-200.txt'
  },
  {
    session_number: 7,
    name: 'Enterprise Integrations & Reporting',
    module: 'Integration',
    lead_consultant: 'Cross-functional Team',
    date: '2026-01-22',
    duration: 'Afternoon Session (4 hours)',
    description: 'Integration architecture, third-party systems, custom interfaces, reporting landscape',
    file: 'Al-Rawabi-Session7-Integ-Workshop-Questions-200.txt'
  }
];

// Entity configurations
const entities = [
  {
    code: 'ARDC',
    name: 'Al Rawabi Dairy Company',
    description: 'Dairy Production, Fresh Juices, Distribution'
  },
  {
    code: 'ENF',
    name: 'Emirates National Food Company',
    description: 'Poultry Operations, Fresh & Frozen Products, Al Rawdha Brand'
  },
  {
    code: 'GF',
    name: 'Greenfields for Feed Industries',
    description: 'Animal Feed Manufacturing, Raw Material Procurement'
  }
];

// Parse questions from a text file
function parseQuestions(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const questions = [];
  let currentCategory = null;

  // Look for question lines that match the pattern: number | question | category
  const questionPattern = /^(\d+)\s*\|\s*(.+?)\s*\|\s*(.+)$/;

  for (const line of lines) {
    const match = line.trim().match(questionPattern);
    if (match) {
      const questionNumber = parseInt(match[1]);
      const questionText = match[2].trim();
      const category = match[3].trim();

      // Determine entity based on question number
      let entityCode;
      if (questionNumber >= 1 && questionNumber <= 67) {
        entityCode = 'ARDC';
      } else if (questionNumber >= 68 && questionNumber <= 134) {
        entityCode = 'ENF';
      } else if (questionNumber >= 135 && questionNumber <= 200) {
        entityCode = 'GF';
      }

      // Check if question is marked as critical
      const isCritical = questionText.toUpperCase().includes('CRITICAL:');

      questions.push({
        question_number: questionNumber,
        question_text: questionText,
        category_name: category,
        entity_code: entityCode,
        is_critical: isCritical
      });
    }
  }

  return questions;
}

async function seedDatabase() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Clearing existing data...');
    await client.query('DELETE FROM documents');
    await client.query('DELETE FROM audio_recordings');
    await client.query('DELETE FROM answers');
    await client.query('DELETE FROM questions');
    await client.query('DELETE FROM categories');
    await client.query('DELETE FROM workshop_participants');
    await client.query('DELETE FROM sessions');
    await client.query('DELETE FROM entities');

    // Insert entities
    console.log('Inserting entities...');
    const entityMap = {};
    for (const entity of entities) {
      const result = await client.query(
        'INSERT INTO entities (code, name, description) VALUES ($1, $2, $3) RETURNING id',
        [entity.code, entity.name, entity.description]
      );
      entityMap[entity.code] = result.rows[0].id;
    }

    // Insert sessions and questions
    console.log('Inserting sessions and questions...');
    const docsDir = path.join(__dirname, '../../../../');

    for (const session of sessions) {
      // Insert session
      const sessionResult = await client.query(
        `INSERT INTO sessions (session_number, name, description, module, lead_consultant, date, duration, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [session.session_number, session.name, session.description, session.module,
         session.lead_consultant, session.date, session.duration, 'not_started']
      );
      const sessionId = sessionResult.rows[0].id;

      // Parse questions from file
      const filePath = path.join(docsDir, session.file);
      if (fs.existsSync(filePath)) {
        const questions = parseQuestions(filePath);
        console.log(`  Session ${session.session_number}: Found ${questions.length} questions`);

        // Group questions by category and entity for creating categories
        const categoryGroups = {};
        for (const q of questions) {
          const key = `${q.entity_code}-${q.category_name}`;
          if (!categoryGroups[key]) {
            categoryGroups[key] = {
              entity_code: q.entity_code,
              category_name: q.category_name,
              questions: []
            };
          }
          categoryGroups[key].questions.push(q);
        }

        // Insert categories
        const categoryMap = {};
        let sortOrder = 0;
        for (const key of Object.keys(categoryGroups)) {
          const group = categoryGroups[key];
          const entityId = entityMap[group.entity_code];

          const minQ = Math.min(...group.questions.map(q => q.question_number));
          const maxQ = Math.max(...group.questions.map(q => q.question_number));

          const catResult = await client.query(
            `INSERT INTO categories (session_id, entity_id, name, question_range, sort_order)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [sessionId, entityId, group.category_name, `${minQ}-${maxQ}`, sortOrder++]
          );
          categoryMap[key] = catResult.rows[0].id;
        }

        // Insert questions
        for (const q of questions) {
          const entityId = entityMap[q.entity_code];
          const categoryKey = `${q.entity_code}-${q.category_name}`;
          const categoryId = categoryMap[categoryKey];

          await client.query(
            `INSERT INTO questions (session_id, entity_id, category_id, question_number, question_text, category_name, is_critical, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [sessionId, entityId, categoryId, q.question_number, q.question_text, q.category_name, q.is_critical, q.question_number]
          );
        }
      } else {
        console.log(`  Warning: File not found: ${filePath}`);
      }
    }

    await client.query('COMMIT');
    console.log('\nDatabase seeded successfully!');
    console.log('Total entities:', entities.length);
    console.log('Total sessions:', sessions.length);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error seeding database:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seedDatabase().catch(console.error);
