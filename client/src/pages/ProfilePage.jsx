import { useAuth } from '../context/AuthContext';

export function ProfilePage() {
  const { user, profile } = useAuth();

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>My Profile</h1>
          <p>Your Ekal volunteer details.</p>
        </div>
      </div>

      <div className="card">
        <div className="profile-grid">
          <div className="profile-field">
            <div className="label">Name</div>
            <div className="value">{profile?.name}</div>
          </div>
          <div className="profile-field">
            <div className="label">Email</div>
            <div className="value">{user?.email}</div>
          </div>
          <div className="profile-field">
            <div className="label">Country</div>
            <div className="value">{profile?.country || '—'}</div>
          </div>
          <div className="profile-field">
            <div className="label">Date joined</div>
            <div className="value">{profile?.date_joined ? new Date(profile.date_joined + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
