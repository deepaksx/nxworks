# Al Rawabi S/4HANA Pre-Discovery Workshop

A web application for conducting pre-discovery workshop sessions for Al Rawabi Group's S/4HANA implementation project.

## Features

- **7 Workshop Sessions**: Finance (FICO), Materials Management (MM), Sales & Distribution (SD), Production Planning (PP), Quality Management (QM), Human Resources (HR), and Enterprise Integrations
- **1,400 Questions**: Comprehensive questions covering all SAP modules across 3 entities
- **Multi-Entity Support**: Al Rawabi Dairy Company (ARDC), Emirates National Food Company (ENF), Greenfields for Feed Industries (GF)
- **Rich Answer Collection**:
  - Text responses
  - Audio recordings (voice notes)
  - Document uploads (PDF, Word, Excel, images)
- **Progress Tracking**: Real-time progress monitoring per session and entity
- **PostgreSQL Database**: Persistent storage for all workshop data

## Tech Stack

- **Frontend**: React 18, Vite, TailwindCSS, React Router
- **Backend**: Node.js, Express
- **Database**: PostgreSQL
- **File Storage**: Local filesystem (configurable for cloud storage)

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm or yarn

## Local Development Setup

### 1. Clone the repository

```bash
git clone https://github.com/your-org/rawabi-workshop-app.git
cd rawabi-workshop-app
```

### 2. Install dependencies

```bash
npm run install:all
```

### 3. Set up PostgreSQL database

Create a new PostgreSQL database:

```sql
CREATE DATABASE rawabi_workshop;
```

### 4. Configure environment variables

Create a `.env` file in the `server` directory:

```bash
cd server
cp .env.example .env
```

Update the `.env` file with your database credentials:

```
DATABASE_URL=postgresql://username:password@localhost:5432/rawabi_workshop
PORT=5000
NODE_ENV=development
```

### 5. Initialize the database

```bash
npm run db:init
```

### 6. Seed the questions

Make sure the question text files are in the parent directory, then run:

```bash
npm run db:seed
```

### 7. Start the development servers

```bash
npm run dev
```

The application will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:5000

## Production Deployment (Render)

### Option 1: Using render.yaml (Recommended)

1. Push the code to GitHub
2. Connect your GitHub repository to Render
3. Render will automatically detect the `render.yaml` and configure:
   - Web service for the application
   - PostgreSQL database

### Option 2: Manual Setup

1. Create a new **PostgreSQL** database on Render
2. Create a new **Web Service**:
   - Build Command: `cd client && npm install && npm run build && cd ../server && npm install`
   - Start Command: `cd server && npm start`
3. Add environment variables:
   - `NODE_ENV`: `production`
   - `DATABASE_URL`: (from your Render PostgreSQL database)

### After Deployment

Initialize and seed the database via Render Shell:

```bash
cd server
npm run db:init
npm run db:seed
```

## Project Structure

```
rawabi-workshop-app/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable components
│   │   ├── pages/          # Page components
│   │   ├── services/       # API service layer
│   │   └── hooks/          # Custom React hooks
│   └── ...
├── server/                 # Node.js backend
│   ├── src/
│   │   ├── routes/         # API routes
│   │   ├── models/         # Database models
│   │   └── scripts/        # DB init and seed scripts
│   └── uploads/            # File uploads directory
└── render.yaml             # Render deployment config
```

## API Endpoints

### Sessions
- `GET /api/sessions` - List all sessions with progress
- `GET /api/sessions/:id` - Get session details
- `PATCH /api/sessions/:id/status` - Update session status
- `GET /api/sessions/:id/progress` - Get progress by entity

### Questions
- `GET /api/questions` - List questions (with filters)
- `GET /api/questions/:id` - Get question details with answer
- `GET /api/questions/session/:id/by-category` - Get questions grouped by category

### Answers
- `POST /api/answers/question/:questionId` - Create/update answer
- `POST /api/answers/:answerId/audio` - Upload audio recording
- `POST /api/answers/:answerId/document` - Upload document
- `DELETE /api/answers/audio/:audioId` - Delete audio
- `DELETE /api/answers/document/:docId` - Delete document

## Workshop Sessions

| Session | Module | Lead Consultant | Date |
|---------|--------|-----------------|------|
| 1 | Finance & Controlling (FICO) | Abu Bakar Javaid | Jan 19, 2026 |
| 2 | Materials Management (MM) | Rahul Rathore | Jan 20, 2026 |
| 3 | Sales & Distribution (SD) | Sania Gul | Jan 21, 2026 (AM) |
| 4 | Production Planning (PP) | Ali Mahmoud | Jan 21, 2026 (PM) |
| 5 | Quality Management (QM) | Ali Mahmoud | Jan 21, 2026 (PM) |
| 6 | Human Resources (HR) | Krishna | Jan 22, 2026 (AM) |
| 7 | Enterprise Integrations | Cross-functional | Jan 22, 2026 (PM) |

## Entities

- **ARDC** - Al Rawabi Dairy Company (Questions 1-67)
- **ENF** - Emirates National Food Company (Questions 68-134)
- **GF** - Greenfields for Feed Industries (Questions 135-200)

## License

Proprietary - NXSYS

## Support

For technical support, contact:
- Email: info@nxsys.com
- Phone: +971-4-5729550
