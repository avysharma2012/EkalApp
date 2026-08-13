import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Navbar() {
  const { user, profile, isAdmin, isSuperAdmin, isChapterAdmin, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const links = isAdmin
    ? [
        { to: '/', label: 'Dashboard' },
        { to: '/admin/access-requests', label: 'Access Requests' },
        { to: '/admin/approvals', label: 'Approvals' },
        { to: '/admin/log-hours', label: 'Log Hours' },
        { to: '/admin/events', label: 'Events' },
        { to: '/admin/volunteers', label: 'Volunteers' },
        { to: '/admin/announcements', label: 'Announcements' },
        ...(isSuperAdmin ? [{ to: '/admin/chapters', label: 'Chapters' }] : []),
      ]
    : [
        { to: '/', label: 'Dashboard' },
        { to: '/hours', label: 'Log Hours' },
        { to: '/events', label: 'Events' },
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
          <NavLink key={l.to} to={l.to} end={l.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
            {l.label}
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
