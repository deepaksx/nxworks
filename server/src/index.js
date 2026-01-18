require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const sessionsRouter = require('./routes/sessions');
const questionsRouter = require('./routes/questions');
const answersRouter = require('./routes/answers');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Serve static files from React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../client/dist')));
}

// API Routes
app.use('/api/sessions', sessionsRouter);
app.use('/api/questions', questionsRouter);
app.use('/api/answers', answersRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve React app for any other routes in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
