import { Routes, Route } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { ProtectedRoute, GuestOnlyRoute } from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';

import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { VolunteerDashboard } from './pages/VolunteerDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { LogHoursPage } from './pages/LogHoursPage';
import { EventsPage } from './pages/EventsPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminApprovalsPage } from './pages/AdminApprovalsPage';
import { AdminLogHoursForVolunteerPage } from './pages/AdminLogHoursForVolunteerPage';
import { AdminEventsPage } from './pages/AdminEventsPage';
import { AdminVolunteersPage } from './pages/AdminVolunteersPage';
import { AdminAnnouncementsPage } from './pages/AdminAnnouncementsPage';

function DashboardRouter() {
  const { isAdmin } = useAuth();
  return isAdmin ? <AdminDashboard /> : <VolunteerDashboard />;
}

function App() {
  return (
    <div className="app-shell">
      <Navbar />
      <main className="app-main">
        <Routes>
          <Route path="/login" element={<GuestOnlyRoute><LoginPage /></GuestOnlyRoute>} />
          <Route path="/register" element={<GuestOnlyRoute><RegisterPage /></GuestOnlyRoute>} />

          <Route path="/" element={<ProtectedRoute><DashboardRouter /></ProtectedRoute>} />
          <Route path="/hours" element={<ProtectedRoute><LogHoursPage /></ProtectedRoute>} />
          <Route path="/events" element={<ProtectedRoute><EventsPage /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />

          <Route path="/admin/approvals" element={<ProtectedRoute adminOnly><AdminApprovalsPage /></ProtectedRoute>} />
          <Route path="/admin/log-hours" element={<ProtectedRoute adminOnly><AdminLogHoursForVolunteerPage /></ProtectedRoute>} />
          <Route path="/admin/events" element={<ProtectedRoute adminOnly><AdminEventsPage /></ProtectedRoute>} />
          <Route path="/admin/volunteers" element={<ProtectedRoute adminOnly><AdminVolunteersPage /></ProtectedRoute>} />
          <Route path="/admin/announcements" element={<ProtectedRoute adminOnly><AdminAnnouncementsPage /></ProtectedRoute>} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
