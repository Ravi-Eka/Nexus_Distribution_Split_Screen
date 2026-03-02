import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AdminDashboard from './pages/AdminDashboard';
import ClientPlayer from './pages/ClientPlayer';

function App() {
  return (
    <Router>
      <Routes>
        {/* Redirect root to admin dashboard */}
        <Route path="/" element={<Navigate to="/admin" replace />} />

        {/* Admin Dashboard */}
        <Route path="/admin" element={<AdminDashboard />} />

        {/* Client Video Player, expects a position param from 1 to 6 */}
        <Route path="/client/:position" element={<ClientPlayer />} />
      </Routes>
    </Router>
  );
}

export default App;
