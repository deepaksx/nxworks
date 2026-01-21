import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import WorkshopView from './pages/WorkshopView';
import WorkshopSetup from './pages/WorkshopSetup';
import SessionView from './pages/SessionView';
import QuestionView from './pages/QuestionView';
import ReportView from './pages/ReportView';
import SharedChecklist from './pages/SharedChecklist';

function App() {
  return (
    <Routes>
      {/* Public share route (no layout) */}
      <Route path="share/:token" element={<SharedChecklist />} />

      {/* Main app routes with layout */}
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
