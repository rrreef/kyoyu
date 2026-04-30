import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Download, RefreshCw, Pencil, Ban, Trash2, CheckCircle } from 'lucide-react';
import './AdminApp.css';

/* ── CSV export helper ── */
function exportCSV(rows, filename) {
  if (!rows.length) return;
  const keys = ['id', 'display_name', 'email', 'role', 'banned', 'created_at', 'track_count'];
  const csv = [
    keys.join(','),
    ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(',')),
  ].join('\n');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
    download: filename,
  });
  a.click();
}

/* ── Toast ── */
function useToast() {
  const [toast, setToast] = useState(null);
  const show = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);
  return { toast, show };
}

/* ── Edit User Modal ── */
function EditModal({ user, onClose, onSaved }) {
  const [form, setForm] = useState({
    display_name: user.display_name || '',
    artist_name:  user.artist_name  || '',
    role:         user.role         || 'listener',
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: form.display_name, artist_name: form.artist_name, role: form.role })
      .eq('id', user.id);
    setSaving(false);
    if (!error) onSaved();
    else alert(error.message);
  }

  return (
    <div className="adm-modal-overlay" onClick={onClose}>
      <div className="adm-modal" onClick={e => e.stopPropagation()}>
        <div className="adm-modal-title">Edit User</div>
        <div className="adm-modal-sub">{user.email}</div>
        <div className="adm-field">
          <label className="adm-label">Display Name</label>
          <input className="adm-input" value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} />
        </div>
        <div className="adm-field">
          <label className="adm-label">Artist Name</label>
          <input className="adm-input" value={form.artist_name} onChange={e => setForm(f => ({ ...f, artist_name: e.target.value }))} />
        </div>
        <div className="adm-field">
          <label className="adm-label">Role</label>
          <select className="adm-select" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
            <option value="listener">Listener</option>
            <option value="creator">Creator</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="adm-modal-actions">
          <button className="adm-btn adm-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="adm-btn adm-btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Delete Confirm Modal ── */
function DeleteModal({ user, onClose, onDeleted }) {
  const [loading, setLoading] = useState(false);

  async function doDelete() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin-delete-user', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ userId: user.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Delete failed');
      onDeleted();
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="adm-modal-overlay" onClick={onClose}>
      <div className="adm-modal" onClick={e => e.stopPropagation()}>
        <div className="adm-modal-title">Delete user?</div>
        <div className="adm-modal-sub">
          This will permanently delete <strong>{user.display_name || user.email}</strong> and all their tracks. This cannot be undone.
        </div>
        <div className="adm-modal-actions">
          <button className="adm-btn adm-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="adm-btn adm-btn-danger" onClick={doDelete} disabled={loading}>
            {loading ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main component ── */
export default function AdminUsers() {
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [filter,  setFilter]  = useState('all');   // all | creator | listener | admin | banned
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const { toast, show } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*, tracks(count)')
      .order('created_at', { ascending: false });
    if (!error) setUsers(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleBan(user) {
    const { error } = await supabase
      .from('profiles')
      .update({ banned: !user.banned })
      .eq('id', user.id);
    if (error) { show(error.message, 'error'); return; }
    show(user.banned ? 'User unbanned' : 'User banned');
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, banned: !u.banned } : u));
  }

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchQ = !q
      || u.email?.toLowerCase().includes(q)
      || u.display_name?.toLowerCase().includes(q)
      || u.artist_name?.toLowerCase().includes(q);
    const matchF = filter === 'all'
      || filter === 'banned' ? u.banned : u.role === filter;
    return matchQ && (filter === 'all' || matchF);
  });

  function csvRows() {
    return filtered.map(u => ({
      id: u.id,
      display_name: u.display_name,
      email: u.email,
      role: u.role,
      banned: u.banned,
      created_at: u.created_at,
      track_count: u.tracks?.[0]?.count ?? 0,
    }));
  }

  const FILTERS = ['all', 'creator', 'listener', 'admin', 'banned'];

  return (
    <div>
      <div className="adm-page-title">Users</div>
      <div className="adm-page-sub">{users.length} registered accounts</div>

      <div className="adm-card">
        <div className="adm-card-header">
          <div className="adm-toolbar">
            <input
              className="adm-search"
              placeholder="Search email, name…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="adm-filter-tabs">
              {FILTERS.map(f => (
                <button key={f} className={`adm-filter-tab${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="adm-btn adm-btn-ghost adm-btn-sm" onClick={load}>
              <RefreshCw size={13}/>
            </button>
            <button className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => exportCSV(csvRows(), 'users.csv')}>
              <Download size={13}/> CSV
            </button>
          </div>
        </div>

        <div className="adm-table-wrap">
          {loading ? (
            <div className="adm-spinner">Loading…</div>
          ) : (
            <table className="adm-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Tracks</th>
                  <th>Joined</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={6}><div className="adm-empty"><div className="adm-empty-icon">👤</div>No users match</div></td></tr>
                )}
                {filtered.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div className="adm-user-cell">
                        <div className="adm-avatar-initial">{(u.display_name || u.email || '?')[0].toUpperCase()}</div>
                        <div>
                          <div className="adm-user-name">{u.display_name || '—'}</div>
                          <div className="adm-user-sub">{u.email}</div>
                          {u.artist_name && <div className="adm-user-sub" style={{ color: '#a5b4fc' }}>{u.artist_name}</div>}
                        </div>
                      </div>
                    </td>
                    <td><span className={`adm-badge adm-badge-${u.role}`}>{u.role}</span></td>
                    <td style={{ color: 'var(--adm-txt-2)' }}>{u.tracks?.[0]?.count ?? 0}</td>
                    <td style={{ color: 'var(--adm-txt-2)', fontSize: 12 }}>{new Date(u.created_at).toLocaleDateString()}</td>
                    <td>
                      {u.banned
                        ? <span className="adm-badge adm-badge-banned">Banned</span>
                        : <span style={{ color: 'var(--adm-txt-3)', fontSize: 12 }}>Active</span>
                      }
                    </td>
                    <td>
                      <div className="adm-actions">
                        <button className="adm-btn adm-btn-ghost adm-btn-sm" title="Edit user" onClick={() => setEditing(u)}>
                          <Pencil size={12}/>
                        </button>
                        <button
                          className={`adm-btn adm-btn-sm ${u.banned ? 'adm-btn-success' : 'adm-btn-warn'}`}
                          title={u.banned ? 'Unban' : 'Ban'}
                          onClick={() => toggleBan(u)}
                        >
                          {u.banned ? <CheckCircle size={12}/> : <Ban size={12}/>}
                          {u.banned ? 'Unban' : 'Ban'}
                        </button>
                        <button className="adm-btn adm-btn-danger adm-btn-sm" title="Delete" onClick={() => setDeleting(u)}>
                          <Trash2 size={12}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editing  && <EditModal   user={editing}  onClose={() => setEditing(null)}  onSaved={() => { setEditing(null);  show('Saved'); load(); }} />}
      {deleting && <DeleteModal user={deleting} onClose={() => setDeleting(null)} onDeleted={() => { setDeleting(null); show('User deleted'); load(); }} />}

      {toast && <div className={`adm-toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
