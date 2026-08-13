import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Navbar() {
  const { user, profile, isAdmin, isSuperAdmin, isChapterAdmin, hasUnreadAnnouncements, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const announcementsTo = isAdmin ? '/admin/announcements' : '/announcements';
  const links = isAdmin
    ? [
        { to: '/', label: 'Dashboard' },
        { to: '/admin/access-requests', label: 'Access Requests' },
        { to: '/admin/approvals', label: 'Approvals' },
        { to: '/admin/certificates', label: 'Certificates' },
        { to: '/admin/log-hours', label: 'Log Hours' },
        { to: '/admin/events', label: 'Events' },
        { to: '/admin/volunteers', label: 'Volunteers' },
        { to: announcementsTo, label: 'Announcements' },
        ...(isSuperAdmin ? [{ to: '/admin/chapters', label: 'Chapters' }] : []),
      ]
    : [
        { to: '/', label: 'Dashboard' },
        { to: '/hours', label: 'Log Hours' },
        { to: '/events', label: 'Events' },
        { to: announcementsTo, label: 'Announcements' },
        { to: '/profile', label: 'Profile' },
      ];

  const roleLabel = isSuperAdmin ? 'Super Admin' : isChapterAdmin ? 'Chapter Admin' : 'Volunteer';

  return (
    <header className="navbar">
      <div className="navbar-brand">
        <span className="brand-mark">EKAL</span>
        <span className="brand-sub">Volunteering</span>
      </div>
      <nav className="navbar-links">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')} style={{ position: 'relative' }}>
            {l.label}
            {l.to === announcementsTo && hasUnreadAnnouncements && (
              <span style={{ position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)' }} />
            )}
          </NavLink>
        ))}
      </nav>
      <div className="navbar-user">
        <span className="user-name">{profile?.name || user.email}</span>
        <span className="role-badge">{roleLabel}</span>
        <button className="btn btn-ghost" onClick={handleLogout}>Sign out</button>
      </div>
    </header>
  );
}
