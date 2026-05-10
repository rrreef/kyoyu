import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Users, Music, Clock, TrendingUp, UserCheck, AlertCircle } from 'lucide-react';
import './AdminApp.css';

const CACHE_KEY = 'reef_admin_overview';
const CACHE_TTL = 60_000; // 1 minute

function getCached() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch { return null; }
}

function setCache(data) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

/* ── Skeleton card ─────────────────────────────────────── */
function KpiSkeleton() {
  return (
    <div className="adm-kpi-grid">
      {[...Array(5)].map((_, i) => (
        <div className="adm-kpi adm-kpi--skeleton" key={i}>
          <div className="adm-skeleton adm-skeleton--icon" />
          <div className="adm-skeleton adm-skeleton--label" />
          <div className="adm-skeleton adm-skeleton--value" />
        </div>
      ))}
    </div>
  );
}

export default function AdminOverview() {
  const cached  = getCached();
  const [stats,   setStats]   = useState(cached?.stats  ?? null);
  const [recent,  setRecent]  = useState(cached?.recent ?? { users: [], tracks: [] });
  const [loading, setLoading] = useState(!cached);

  const load = useCallback(async () => {
    try {
      // Single RPC — all stats in one Postgres call, one network round-trip
      const { data, error } = await supabase.rpc('get_admin_stats');
      if (error) throw error;

      const newStats = {
        totalUsers:  data.totalUsers  ?? 0,
        creators:    data.creators    ?? 0,
        listeners:   (data.totalUsers ?? 0) - (data.creators ?? 0),
        totalTracks: data.totalTracks ?? 0,
        pending:     data.pending     ?? 0,
        banned:      data.banned      ?? 0,
      };
      const newRecent = {
        users:  data.recentUsers  ?? [],
        tracks: data.recentTracks ?? [],
      };

      setStats(newStats);
      setRecent(newRecent);
      setCache({ stats: newStats, recent: newRecent });
    } catch (e) {
      console.error('AdminOverview load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // If cache is stale or missing, fetch fresh data
    if (!getCached()) load();
    else {
      // Cache valid — silently refresh in background after 2s
      const t = setTimeout(load, 2000);
      return () => clearTimeout(t);
    }
  }, [load]);

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

      {/* KPI cards */}
      {loading && !stats ? (
        <KpiSkeleton />
      ) : (
        <div className="adm-kpi-grid">
          {kpis.map(k => (
            <div className="adm-kpi" key={k.label}>
              <div className="adm-kpi-icon" style={{ background: k.color + '22', color: k.color }}>{k.icon}</div>
              <div className="adm-kpi-label">{k.label}</div>
              <div className="adm-kpi-value">{k.value.toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

      {/* Recent tables */}
      <div className="adm-overview-grid">
        {/* Recent users */}
        <div className="adm-card">
          <div className="adm-card-header">
            <div className="adm-card-title">Recent Sign-ups</div>
          </div>
          <div className="adm-table-wrap">
            {loading && recent.users.length === 0 ? (
              <div className="adm-table-skeleton">
                {[...Array(5)].map((_, i) => <div className="adm-skeleton adm-skeleton--row" key={i}/>)}
              </div>
            ) : (
              <table className="adm-table">
                <thead>
                  <tr><th>User</th><th>Role</th><th>Joined</th></tr>
                </thead>
                <tbody>
                  {recent.users.length === 0 && (
                    <tr><td colSpan={3} className="adm-empty">No users yet</td></tr>
                  )}
                  {recent.users.map(u => (
                    <tr key={u.id}>
                      <td>
                        <div className="adm-user-cell">
                          <div className="adm-avatar-initial">{(u.display_name || '?')[0].toUpperCase()}</div>
                          <div className="adm-user-name">{u.display_name || '—'}</div>
                        </div>
                      </td>
                      <td><span className={`adm-badge adm-badge-${u.role}`}>{u.role}</span></td>
                      <td style={{ color: 'var(--adm-txt-2)', fontSize: 12 }}>{new Date(u.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Recent tracks */}
        <div className="adm-card">
          <div className="adm-card-header">
            <div className="adm-card-title">Recent Tracks</div>
          </div>
          <div className="adm-table-wrap">
            {loading && recent.tracks.length === 0 ? (
              <div className="adm-table-skeleton">
                {[...Array(5)].map((_, i) => <div className="adm-skeleton adm-skeleton--row" key={i}/>)}
              </div>
            ) : (
              <table className="adm-table">
                <thead>
                  <tr><th>Track</th><th>Status</th><th>Added</th></tr>
                </thead>
                <tbody>
                  {recent.tracks.length === 0 && (
                    <tr><td colSpan={3} className="adm-empty">No tracks yet</td></tr>
                  )}
                  {recent.tracks.map(t => (
                    <tr key={t.id}>
                      <td>
                        <div className="adm-user-name">{t.title}</div>
                        <div className="adm-user-sub">{t.artist}</div>
                      </td>
                      <td><span className={`adm-badge adm-badge-${t.status}`}>{t.status}</span></td>
                      <td style={{ color: 'var(--adm-txt-2)', fontSize: 12 }}>{new Date(t.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
