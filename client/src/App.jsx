import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import SessionView from './pages/SessionView';
import QuestionView from './pages/QuestionView';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="session/:sessionId" element={<SessionView />} />
        <Route path="session/:sessionId/question/:questionId" element={<QuestionView />} />
      </Route>
    </Routes>
  );
}

export default App;
