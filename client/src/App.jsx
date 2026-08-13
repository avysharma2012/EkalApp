import { Routes, Route } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { ProtectedRoute, GuestOnlyRoute } from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';

import { LoginPage } from './pages/LoginPage';
import { AccessRequestGate } from './pages/AccessRequestGate';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
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
import { AdminChaptersPage } from './pages/AdminChaptersPage';
import { AdminAccessRequestsPage } from './pages/AdminAccessRequestsPage';

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
          <Route path="/request-access" element={<GuestOnlyRoute><AccessRequestGate /></GuestOnlyRoute>} />
          <Route path="/forgot-password" element={<GuestOnlyRoute><ForgotPasswordPage /></GuestOnlyRoute>} />
          {/* Not GuestOnlyRoute: a password-recovery link establishes a session before the user picks a new password. */}
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          <Route path="/" element={<ProtectedRoute><DashboardRouter /></ProtectedRoute>} />
          <Route path="/hours" element={<ProtectedRoute><LogHoursPage /></ProtectedRoute>} />
          <Route path="/events" element={<ProtectedRoute><EventsPage /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />

          <Route path="/admin/access-requests" element={<ProtectedRoute adminOnly><AdminAccessRequestsPage /></ProtectedRoute>} />
          <Route path="/admin/approvals" element={<ProtectedRoute adminOnly><AdminApprovalsPage /></ProtectedRoute>} />
          <Route path="/admin/log-hours" element={<ProtectedRoute adminOnly><AdminLogHoursForVolunteerPage /></ProtectedRoute>} />
          <Route path="/admin/events" element={<ProtectedRoute adminOnly><AdminEventsPage /></ProtectedRoute>} />
          <Route path="/admin/volunteers" element={<ProtectedRoute adminOnly><AdminVolunteersPage /></ProtectedRoute>} />
          <Route path="/admin/announcements" element={<ProtectedRoute adminOnly><AdminAnnouncementsPage /></ProtectedRoute>} />
          <Route path="/admin/chapters" element={<ProtectedRoute superAdminOnly><AdminChaptersPage /></ProtectedRoute>} />

          {/* GATE-01: any other/unknown route falls back through ProtectedRoute's guard to the gate. */}
          <Route path="*" element={<ProtectedRoute><DashboardRouter /></ProtectedRoute>} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
