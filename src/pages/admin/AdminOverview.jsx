import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Users, Music, Clock, TrendingUp, UserCheck, AlertCircle } from 'lucide-react';
import './AdminApp.css';

export default function AdminOverview() {
  const [stats, setStats]  = useState(null);
  const [recent, setRecent] = useState({ users: [], tracks: [] });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [
        { count: totalUsers },
        { count: creators },
        { count: totalTracks },
        { count: pending },
        { count: banned },
        { data: recentUsers },
        { data: recentTracks },
      ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'creator'),
        supabase.from('tracks').select('*', { count: 'exact', head: true }),
        supabase.from('tracks').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('banned', true),
        supabase.from('profiles').select('id,display_name,email,role,created_at').order('created_at', { ascending: false }).limit(8),
        supabase.from('tracks').select('id,title,artist,status,created_at,profiles(display_name)').order('created_at', { ascending: false }).limit(8),
      ]);
      setStats({ totalUsers, creators, listeners: (totalUsers ?? 0) - (creators ?? 0), totalTracks, pending, banned });
      setRecent({ users: recentUsers ?? [], tracks: recentTracks ?? [] });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const kpis = stats ? [
    { label: 'Total Users',    value: stats.totalUsers ?? 0,  icon: <Users size={16}/>,       color: '#6366f1' },
    { label: 'Creators',       value: stats.creators ?? 0,    icon: <UserCheck size={16}/>,   color: '#10b981' },
    { label: 'Total Tracks',   value: stats.totalTracks ?? 0, icon: <Music size={16}/>,       color: '#a78bfa' },
    { label: 'Pending Review', value: stats.pending ?? 0,     icon: <Clock size={16}/>,       color: '#f59e0b' },
    { label: 'Banned Users',   value: stats.banned ?? 0,      icon: <AlertCircle size={16}/>, color: '#ef4444' },
  ] : [];

  return (
    <div>
      <div className="adm-page-title">Overview</div>
      <div className="adm-page-sub">Platform health at a glance</div>

      {loading ? (
        <div className="adm-spinner">Loading stats…</div>
      ) : (
        <>
          <div className="adm-kpi-grid">
            {kpis.map(k => (
              <div className="adm-kpi" key={k.label}>
                <div className="adm-kpi-icon" style={{ background: k.color + '22', color: k.color }}>{k.icon}</div>
                <div className="adm-kpi-label">{k.label}</div>
                <div className="adm-kpi-value">{k.value.toLocaleString()}</div>
              </div>
            ))}
          </div>

          <div className="adm-overview-grid">
            {/* Recent users */}
            <div className="adm-card">
              <div className="adm-card-header">
                <div className="adm-card-title">Recent Sign-ups</div>
              </div>
              <div className="adm-table-wrap">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Role</th>
                      <th>Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.users.length === 0 && (
                      <tr><td colSpan={3} className="adm-empty">No users yet</td></tr>
                    )}
                    {recent.users.map(u => (
                      <tr key={u.id}>
                        <td>
                          <div className="adm-user-cell">
                            <div className="adm-avatar-initial">{(u.display_name || u.email || '?')[0].toUpperCase()}</div>
                            <div>
                              <div className="adm-user-name">{u.display_name || '—'}</div>
                              <div className="adm-user-sub">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td><span className={`adm-badge adm-badge-${u.role}`}>{u.role}</span></td>
                        <td style={{ color: 'var(--adm-txt-2)', fontSize: 12 }}>{new Date(u.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent tracks */}
            <div className="adm-card">
              <div className="adm-card-header">
                <div className="adm-card-title">Recent Tracks</div>
              </div>
              <div className="adm-table-wrap">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>Track</th>
                      <th>Status</th>
                      <th>Added</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.tracks.length === 0 && (
                      <tr><td colSpan={3} className="adm-empty">No tracks yet</td></tr>
                    )}
                    {recent.tracks.map(t => (
                      <tr key={t.id}>
                        <td>
                          <div className="adm-user-name">{t.title}</div>
                          <div className="adm-user-sub">{t.artist} · {t.profiles?.display_name}</div>
                        </td>
                        <td><span className={`adm-badge adm-badge-${t.status}`}>{t.status}</span></td>
                        <td style={{ color: 'var(--adm-txt-2)', fontSize: 12 }}>{new Date(t.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
