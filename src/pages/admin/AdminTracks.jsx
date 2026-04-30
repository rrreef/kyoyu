import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Download, RefreshCw, CheckCircle, XCircle, Trash2, Music } from 'lucide-react';
import './AdminApp.css';

function exportCSV(rows, filename) {
  if (!rows.length) return;
  const keys = ['id', 'title', 'artist', 'album', 'creator_email', 'status', 'visibility', 'format', 'created_at'];
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

function useToast() {
  const [toast, setToast] = useState(null);
  const show = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);
  return { toast, show };
}

function DeleteTrackModal({ track, onClose, onDeleted }) {
  const [loading, setLoading] = useState(false);
  async function doDelete() {
    setLoading(true);
    const { error } = await supabase.from('tracks').delete().eq('id', track.id);
    setLoading(false);
    if (error) { alert(error.message); return; }
    onDeleted();
  }
  return (
    <div className="adm-modal-overlay" onClick={onClose}>
      <div className="adm-modal" onClick={e => e.stopPropagation()}>
        <div className="adm-modal-title">Delete track?</div>
        <div className="adm-modal-sub">
          Permanently delete <strong>{track.title}</strong> by {track.artist}. This cannot be undone.
        </div>
        <div className="adm-modal-actions">
          <button className="adm-btn adm-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="adm-btn adm-btn-danger" onClick={doDelete} disabled={loading}>
            {loading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminTracks() {
  const [tracks,   setTracks]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [filter,   setFilter]   = useState('all');
  const [deleting, setDeleting] = useState(null);
  const { toast, show } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tracks')
      .select('*, profiles(display_name, email)')
      .order('created_at', { ascending: false });
    if (!error) setTracks(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function setStatus(track, status) {
    const { error } = await supabase.from('tracks').update({ status }).eq('id', track.id);
    if (error) { show(error.message, 'error'); return; }
    show(`Track marked as ${status}`);
    setTracks(prev => prev.map(t => t.id === track.id ? { ...t, status } : t));
  }

  const filtered = tracks.filter(t => {
    const q = search.toLowerCase();
    const matchQ = !q
      || t.title?.toLowerCase().includes(q)
      || t.artist?.toLowerCase().includes(q)
      || t.album?.toLowerCase().includes(q)
      || t.profiles?.display_name?.toLowerCase().includes(q);
    const matchF = filter === 'all' || t.status === filter;
    return matchQ && matchF;
  });

  function csvRows() {
    return filtered.map(t => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      creator_email: t.profiles?.email,
      status: t.status,
      visibility: t.visibility,
      format: t.format,
      created_at: t.created_at,
    }));
  }

  const FILTERS = [
    { value: 'all',      label: 'All' },
    { value: 'pending',  label: 'Pending' },
    { value: 'live',     label: 'Live' },
    { value: 'rejected', label: 'Rejected' },
  ];

  return (
    <div>
      <div className="adm-page-title">Tracks</div>
      <div className="adm-page-sub">Moderate and manage all uploaded tracks</div>

      <div className="adm-card">
        <div className="adm-card-header">
          <div className="adm-toolbar">
            <input
              className="adm-search"
              placeholder="Search title, artist, creator…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="adm-filter-tabs">
              {FILTERS.map(f => (
                <button key={f.value} className={`adm-filter-tab${filter === f.value ? ' active' : ''}`} onClick={() => setFilter(f.value)}>
                  {f.label}
                  {f.value !== 'all' && (
                    <span style={{ marginLeft: 5, opacity: .7 }}>
                      {tracks.filter(t => t.status === f.value).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="adm-btn adm-btn-ghost adm-btn-sm" onClick={load}><RefreshCw size={13}/></button>
            <button className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => exportCSV(csvRows(), 'tracks.csv')}>
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
                  <th>Track</th>
                  <th>Creator</th>
                  <th>Format</th>
                  <th>Visibility</th>
                  <th>Status</th>
                  <th>Added</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={7}><div className="adm-empty"><div className="adm-empty-icon">🎵</div>No tracks match</div></td></tr>
                )}
                {filtered.map(t => (
                  <tr key={t.id}>
                    <td>
                      <div className="adm-track-cell">
                        {t.artwork_url
                          ? <img className="adm-thumb" src={t.artwork_url} alt="" />
                          : <div className="adm-thumb-ph"><Music size={14}/></div>
                        }
                        <div>
                          <div className="adm-user-name">{t.title}</div>
                          <div className="adm-user-sub">{t.artist}{t.album ? ` · ${t.album}` : ''}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="adm-user-name" style={{ fontSize: 12 }}>{t.profiles?.display_name || '—'}</div>
                      <div className="adm-user-sub">{t.profiles?.email}</div>
                    </td>
                    <td style={{ color: 'var(--adm-txt-2)', fontSize: 12 }}>{t.format || '—'}</td>
                    <td><span className={`adm-badge adm-badge-${t.visibility}`}>{t.visibility}</span></td>
                    <td><span className={`adm-badge adm-badge-${t.status}`}>{t.status}</span></td>
                    <td style={{ color: 'var(--adm-txt-2)', fontSize: 12 }}>{new Date(t.created_at).toLocaleDateString()}</td>
                    <td>
                      <div className="adm-actions">
                        {t.status !== 'live' && (
                          <button className="adm-btn adm-btn-success adm-btn-sm" onClick={() => setStatus(t, 'live')}>
                            <CheckCircle size={12}/> Approve
                          </button>
                        )}
                        {t.status !== 'rejected' && (
                          <button className="adm-btn adm-btn-warn adm-btn-sm" onClick={() => setStatus(t, 'rejected')}>
                            <XCircle size={12}/> Reject
                          </button>
                        )}
                        <button className="adm-btn adm-btn-danger adm-btn-sm" onClick={() => setDeleting(t)}>
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

      {deleting && (
        <DeleteTrackModal
          track={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => { setDeleting(null); show('Track deleted'); load(); }}
        />
      )}

      {toast && <div className={`adm-toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
