import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import WorkshopView from './pages/WorkshopView';
import WorkshopSetup from './pages/WorkshopSetup';
import SessionView from './pages/SessionView';
import QuestionView from './pages/QuestionView';
import ReportView from './pages/ReportView';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="workshop/:workshopId" element={<WorkshopView />} />
        <Route path="workshop/:workshopId/setup" element={<WorkshopSetup />} />
        <Route path="workshop/:workshopId/session/:sessionId" element={<SessionView />} />
        <Route path="workshop/:workshopId/session/:sessionId/question/:questionId" element={<QuestionView />} />
        <Route path="workshop/:workshopId/session/:sessionId/report/:reportId" element={<ReportView />} />
      </Route>
    </Routes>
  );
}

export default App;
