import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { subscribeToAnnouncements } from '../lib/api';

const AuthContext = createContext(null);
const LAST_VIEWED_KEY = 'ekal_announcements_last_viewed';

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [roleRow, setRoleRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasUnreadAnnouncements, setHasUnreadAnnouncements] = useState(false);

  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null);
      setRoleRow(null);
      return;
    }
    const [{ data: profileData, error: profileErr }, { data: roleData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('user_roles').select('*').eq('user_id', userId).maybeSingle(),
    ]);
    if (!profileErr) setProfile(profileData);
    setRoleRow(roleData ?? null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      loadProfile(session?.user?.id).finally(() => setLoading(false));
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      loadProfile(session?.user?.id);
    });

    return () => listener.subscription.unsubscribe();
  }, [loadProfile]);

  // ANN-04: unread badge — checked once against the newest announcement,
  // then kept live via realtime for anything posted while the user is
  // active elsewhere in the app.
  useEffect(() => {
    if (!session?.user) {
      setHasUnreadAnnouncements(false);
      return;
    }

    let cancelled = false;
    const lastViewed = localStorage.getItem(LAST_VIEWED_KEY);

    supabase
      .from('announcements')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data && (!lastViewed || data.created_at > lastViewed)) {
          setHasUnreadAnnouncements(true);
        }
      });

    const unsubscribe = subscribeToAnnouncements(() => setHasUnreadAnnouncements(true));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [session?.user?.id]);

  function markAnnouncementsRead() {
    localStorage.setItem(LAST_VIEWED_KEY, new Date().toISOString());
    setHasUnreadAnnouncements(false);
  }

  async function login({ email, password }) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  const isSuperAdmin = roleRow?.role === 'super_admin';
  const isChapterAdmin = roleRow?.role === 'chapter_admin';
  const isAdmin = isSuperAdmin || isChapterAdmin;

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    chapterId: profile?.chapter_id ?? null,
    isAdmin,
    isChapterAdmin,
    isSuperAdmin,
    adminChapterId: isChapterAdmin ? roleRow.chapter_id : null,
    loading,
    login,
    logout,
    refreshProfile: () => loadProfile(session?.user?.id),
    hasUnreadAnnouncements,
    markAnnouncementsRead,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
