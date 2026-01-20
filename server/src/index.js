require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const workshopsRouter = require('./routes/workshops');
const sessionsRouter = require('./routes/sessions');
const questionsRouter = require('./routes/questions');
const answersRouter = require('./routes/answers');
const participantsRouter = require('./routes/participants');
const transcribeRouter = require('./routes/transcribe');
const observationRouter = require('./routes/observation');
const researchRouter = require('./routes/research');
const reportsRouter = require('./routes/reports');
const adminRouter = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve uploads - use /tmp in production (Render)
if (process.env.NODE_ENV === 'production') {
  app.use('/uploads', express.static('/tmp/uploads'));
} else {
  app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
}

// Serve static files from React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../client/dist')));
}

// API Routes
app.use('/api/workshops', workshopsRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/questions', questionsRouter);
app.use('/api/answers', answersRouter);
app.use('/api/participants', participantsRouter);
app.use('/api/transcribe', transcribeRouter);
app.use('/api/observation', observationRouter);
app.use('/api/research', researchRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/admin', adminRouter);

// Health check with env status
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: {
      NODE_ENV: process.env.NODE_ENV || 'not set',
      DATABASE_URL: process.env.DATABASE_URL ? 'configured' : 'missing',
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? 'configured' : 'missing',
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'configured' : 'missing',
      AWS_S3: (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_S3_BUCKET) ? 'configured' : 'missing',
      AWS_S3_BUCKET: process.env.AWS_S3_BUCKET || 'not set'
    }
  });
});

// Serve React app for any other routes in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? 'set (' + process.env.ANTHROPIC_API_KEY.substring(0, 10) + '...)' : 'NOT SET'}`);
  console.log(`OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? 'set' : 'NOT SET'}`);
});
