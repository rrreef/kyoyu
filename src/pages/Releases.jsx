import { useState, useEffect, useCallback, useMemo } from 'react';
import { Play, Download, MessageSquare, Star, X, Eye, EyeOff, Upload,
         Loader, RefreshCw, Filter, Music } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchMyTracks } from '../lib/uploadPipeline';
import { supabase } from '../lib/supabase';
import EmptyReleases from '../components/EmptyReleases';
import './Releases.css';

/* ─── No genre palettes — plain dark throughout ─────────── */
function paletteFor(_genre) {
  return { gradient: 'linear-gradient(160deg,#141414 0%,#0d0d0d 100%)', accent: 'transparent' };
}

/** Maps a raw Supabase track row → UI-ready shape */
function adaptTrack(t) {
  const { gradient, accent } = paletteFor(t.genre);
  const hasAlbum = t.album && t.album.trim();
  const artist   = t.artist || '—';
  const year     = t.year;
  // Grouping key: explicit album > artist+year fallback > individual track
  const groupKey = hasAlbum
    ? `album:${t.album.trim()}__${artist}`
    : (artist !== '—' && year)
      ? `ay:${artist}__${year}`
      : `single:${t.id}`;
  // Display name for the album card
  const albumName = hasAlbum ? t.album.trim()
    : (artist !== '—' && year) ? artist   // show artist as album name
    : t.title;
  return {
    id:           t.id,
    title:        t.title,
    artist,
    albumName,
    groupKey,
    year,
    format:       t.format || 'Digital',
    visibility:   t.visibility,
    status:       t.status,
    genre:        t.genre,
    label:        t.label || null,
    tags:         Array.isArray(t.tags) ? t.tags : (t.genre ? [t.genre] : []),
    duration:     t.duration || '—',
    uploadDate:   t.created_at?.slice(0, 10),
    artworkUrl:   t.artworkUrl || null,
    gradient,
    accentColor:  accent,
    streams:      0,
    downloads:    0,
    comments:     0,
    feedback:     0,
    feedbackCount:0,
    revenue:      0,
    _raw:         t,
  };
}

/** Returns a CSS background — artwork image or plain dark fallback */
function artBg(rel) {
  if (rel?.artworkUrl) {
    return {
      backgroundImage: `url(${rel.artworkUrl})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  return { background: '#111' };
}

/** Group an array of tracks into album objects */
function groupIntoAlbums(tracks) {
  const map = new Map();
  tracks.forEach(rel => {
    const key = rel.groupKey;          // set in adaptTrack
    if (!map.has(key)) {
      map.set(key, {
        albumKey:    key,
        albumName:   rel.albumName,
        artist:      rel.artist,
        year:        rel.year,
        artworkUrl:  rel.artworkUrl || null,
        label:       rel.label,
        format:      rel.format,
        accentColor: rel.accentColor,
        tracks:      [],
        visibility:  rel.visibility,
        status:      rel.status,
      });
    }
    const grp = map.get(key);
    if (!grp.artworkUrl && rel.artworkUrl) grp.artworkUrl = rel.artworkUrl;
    if (rel.status === 'pending') grp.status = 'pending';
    if (grp.visibility !== rel.visibility) grp.visibility = 'mixed';
    grp.tracks.push(rel);
  });
  return [...map.values()];
}

/* ─── Component ──────────────────────────────────────────── */
export default function Releases({ filter = 'all' }) {
  const [releases,  setReleases]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [selected,  setSelected]  = useState(null);   // album group object
  const [toggling,  setToggling]  = useState(false);
  const navigate = useNavigate();

  /* ── Filter state ── */
  const [fArtist, setFArtist] = useState('All');
  const [fLabel,  setFLabel]  = useState('All');
  const [fDate,   setFDate]   = useState('All');
  const [fCollab, setFCollab] = useState('All');
  const [fStatus, setFStatus] = useState('All');

  /* Unique artist names */
  const artistOptions = useMemo(() => {
    const names = [...new Set(releases.map(r => r.artist).filter(Boolean))];
    return ['All', ...names];
  }, [releases]);

  /* Unique label names — always include 'All' so filter shows even when empty */
  const labelOptions = useMemo(() => {
    const names = [...new Set(releases.map(r => r.label).filter(Boolean))];
    return ['All', ...names];
  }, [releases]);

  /* Derived filtered + sorted tracks (pre-grouping) */
  const filteredTracks = useMemo(() => {
    const now = new Date();
    const curYear = now.getFullYear();
    // Route-level visibility filter
    let list = filter === 'public'  ? releases.filter(r => r.visibility === 'public')
             : filter === 'private' ? releases.filter(r => r.visibility !== 'public')
             : [...releases];
    // User pill filters
    if (fArtist !== 'All') list = list.filter(r => r.artist === fArtist);
    if (fLabel  !== 'All') list = list.filter(r => r.label  === fLabel);
    if (fCollab === 'Solo')   list = list.filter(r => !/[&,]|feat\.|vs\./i.test(r.artist));
    if (fCollab === 'Collab') list = list.filter(r => /[&,]|feat\.|vs\./i.test(r.artist));
    if (filter === 'all') {
      if (fStatus === 'Public')   list = list.filter(r => r.visibility === 'public');
      if (fStatus === 'Private')  list = list.filter(r => r.visibility === 'private');
      if (fStatus === 'Pending')  list = list.filter(r => r.status === 'pending');
    }
    // Date filters use album year
    if (fDate === 'This Year')  list = list.filter(r => (r.year ?? new Date(r.uploadDate).getFullYear()) === curYear);
    if (fDate === 'This Month') {
      const ym = `${curYear}-${String(now.getMonth()+1).padStart(2,'0')}`;
      list = list.filter(r => r.uploadDate?.startsWith(ym));
    }
    if (fDate === 'Newest') list = [...list].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    if (fDate === 'Oldest') list = [...list].sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
    return list;
  }, [releases, filter, fArtist, fLabel, fDate, fCollab, fStatus]);

  /* Group filtered tracks into album objects */
  const albumGroups = useMemo(() => groupIntoAlbums(filteredTracks), [filteredTracks]);

  const anyFilterActive = fArtist!=='All' || fLabel!=='All' || fDate!=='All' || fCollab!=='All' || fStatus!=='All';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tracks = await fetchMyTracks();
      setReleases(tracks.map(adaptTrack));
    } catch (e) {
      setError(e.message || 'Failed to load releases.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* Preload mascot so it's cached before EmptyReleases mounts */
  useEffect(() => {
    const img = new window.Image();
    img.src = '/empty-releases.png';
  }, []);

  /* Select / deselect an album group */
  const selectAlbum = (album) =>
    setSelected(prev => prev?.albumKey === album.albumKey ? null : album);

  /* Toggle visibility for ALL tracks in the selected album */
  async function toggleVisibility() {
    if (!selected || toggling) return;
    const next = (selected.visibility === 'public') ? 'private' : 'public';
    setToggling(true);
    const trackIds = selected.tracks.map(t => t.id);
    const { error: dbErr } = await supabase
      .from('tracks')
      .update({ visibility: next })
      .in('id', trackIds);
    if (!dbErr) {
      const updatedTracks = selected.tracks.map(t => ({ ...t, visibility: next }));
      const updatedAlbum  = { ...selected, visibility: next, tracks: updatedTracks };
      setSelected(updatedAlbum);
      setReleases(prev => prev.map(r => trackIds.includes(r.id) ? { ...r, visibility: next } : r));
    }
    setToggling(false);
  }

  const PAGE_TITLE = filter === 'public' ? 'Public Releases'
                   : filter === 'private' ? 'Private Releases'
                   : 'Releases';
  const albumCount = albumGroups.length;
  const PAGE_SUB   = filter === 'public'  ? 'Published & live on the platform'
                   : filter === 'private' ? 'Drafts, scheduled & shared-only'
                   : `${albumCount} album${albumCount !== 1 ? 's' : ''} in your catalog`;

  /* ── Loading state ─────────────────────────────────────── */
  if (loading) {
    return (
      <div className="page releases-page animate-in">
        <div className="rel-page-header">
          <div><h1>{PAGE_TITLE}</h1></div>
        </div>
        <div className="rel-loading-spinner">
          <Loader size={22} className="rel-spinner-icon" />
        </div>
      </div>
    );
  }

  /* ── Error state ───────────────────────────────────────── */
  if (error) {
    return (
      <div className="page releases-page animate-in">
        <div className="rel-page-header">
          <div><h1>{PAGE_TITLE}</h1></div>
        </div>
        <div className="rel-empty">
          <p className="rel-empty-error">{error}</p>
          <button className="rel-upload-btn" onClick={load}>
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page releases-page animate-in">

      {/* Header */}
      <div className="rel-page-header">
        <div>
          <h1>{PAGE_TITLE}</h1>
          <p className="rel-page-sub">
            {PAGE_SUB}
            {releases.length > 0 && filter === 'all' && <>&nbsp;·&nbsp; click an album to see details</>}
          </p>
        </div>
        <button className="rel-upload-btn" onClick={() => navigate('/upload')}>
          <Upload size={13} /> Upload New
        </button>
      </div>

      {/* ── Filter bar ── */}
      {releases.length > 0 && (
        <div className="rel-filter-bar">
          {/* Artist */}
          <div className="rel-filter-group">
            <span className="rel-filter-label">Artist</span>
            <div className="rel-filter-pills">
              {artistOptions.slice(0, 6).map(a => (
                <button key={a} className={`rel-filter-pill ${fArtist===a?'active':''}`} onClick={()=>setFArtist(a)}>{a}</button>
              ))}
            </div>
          </div>

          {/* Label — always visible */}
          <div className="rel-filter-group">
            <span className="rel-filter-label">Label</span>
            <div className="rel-filter-pills">
              {labelOptions.map(l => (
                <button key={l} className={`rel-filter-pill ${fLabel===l?'active':''}`} onClick={()=>setFLabel(l)}>{l}</button>
              ))}
            </div>
          </div>

          {/* Date */}
          <div className="rel-filter-group">
            <span className="rel-filter-label">Date</span>
            <div className="rel-filter-pills">
              {['All','Newest','Oldest','This Year','This Month'].map(d => (
                <button key={d} className={`rel-filter-pill ${fDate===d?'active':''}`} onClick={()=>setFDate(d)}>{d}</button>
              ))}
            </div>
          </div>

          <div className="rel-filter-group">
            <span className="rel-filter-label">Collaborations</span>
            <div className="rel-filter-pills">
              {['All','Solo','Collab'].map(c => (
                <button key={c} className={`rel-filter-pill ${fCollab===c?'active':''}`} onClick={()=>setFCollab(c)}>{c}</button>
              ))}
            </div>
          </div>

          {/* Status filter — only shown in 'all' view */}
          {filter === 'all' && (
            <div className="rel-filter-group">
              <span className="rel-filter-label">Status</span>
              <div className="rel-filter-pills">
                {['All','Public','Private','Pending'].map(s => (
                  <button key={s} className={`rel-filter-pill ${fStatus===s?'active':''}`} onClick={()=>setFStatus(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {anyFilterActive && (
            <button className="rel-filter-clear" onClick={()=>{setFArtist('All');setFLabel('All');setFDate('All');setFCollab('All');setFStatus('All');}}>Clear filters</button>
          )}
        </div>
      )}

      {/* Empty catalog */}
      {releases.length === 0 && (
        <EmptyReleases variant="creator" />
      )}

      {/* ── Album grid ── */}
      {albumGroups.length > 0 && (
        <div className={`rel-grid ${selected ? 'has-selection' : ''}`}>
          {albumGroups.map(album => {
            const isSelected = selected?.albumKey === album.albumKey;
            const isDimmed   = selected && !isSelected;
            const multiTrack = album.tracks.length > 1;
            return (
              <div
                key={album.albumKey}
                className={`rel-card ${isSelected ? 'selected' : ''} ${isDimmed ? 'dimmed' : ''}`}
                onClick={() => selectAlbum(album)}
              >
                <div className="rel-card-art" style={artBg(album)}>
                  {!album.artworkUrl && (
                    <div className="rel-card-art-fallback">
                      <Music size={28} strokeWidth={1} />
                    </div>
                  )}
                  <div className="rel-card-play"><Play size={18} fill="currentColor" /></div>
                  {album.visibility === 'private' && (
                    <div className="rel-card-private"><EyeOff size={9} /> Private</div>
                  )}
                  {album.status === 'pending' && (
                    <div className="rel-card-pending">Pending</div>
                  )}
                  {multiTrack && (
                    <div className="rel-card-count">{album.tracks.length}</div>
                  )}
                </div>
                <div className="rel-card-info">
                  <div className="rel-card-title">{album.albumName}</div>
                  <div className="rel-card-artist">{album.artist}</div>
                  <div className="rel-card-meta">{album.year || '—'} · {album.format}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Detail panel — slides up ── */}
      {selected && (
        <div
          className="rel-overlay"
          onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}
        >
          <div className="rel-panel glass">
            <button className="rel-panel-close" onClick={() => setSelected(null)}>
              <X size={14} />
            </button>

            {/* Header */}
            <div className="rdp-header">
              <div className="rdp-art" style={artBg(selected)}>
                {!selected.artworkUrl && (
                  <div className="rdp-art-fallback"><Music size={22} strokeWidth={1} /></div>
                )}
              </div>
              <div className="rdp-meta">
                <div className="rdp-title">{selected.albumName}</div>
                <div className="rdp-album">{selected.artist}</div>
                <div className="rdp-details">
                  {selected.year && <><span>{selected.year}</span><span>·</span></>}
                  <span>{selected.format}</span>
                  <span>·</span>
                  {selected.visibility === 'public'
                    ? <span className="rdp-vis pub"><Eye size={10} /> Public</span>
                    : selected.visibility === 'mixed'
                      ? <span className="rdp-vis priv"><Eye size={10} /> Mixed</span>
                      : <span className="rdp-vis priv"><EyeOff size={10} /> Private</span>
                  }
                </div>
              </div>
            </div>

            {/* Tracklist */}
            <div className="rdp-tracklist">
              {selected.tracks.map((t, i) => (
                <div key={t.id} className="rdp-track-row">
                  <span className="rdp-track-num">{i + 1}</span>
                  <span className="rdp-track-title">{t.title}</span>
                  <span className="rdp-track-fmt">{t.format}</span>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="rdp-actions">
              <button className="rdp-btn">Edit Metadata</button>
              <button className="rdp-btn">Manage Credits</button>
              <button
                className={`rdp-btn rdp-btn--danger ${toggling ? 'loading' : ''}`}
                onClick={toggleVisibility}
                disabled={toggling || selected.visibility === 'mixed'}
              >
                {toggling
                  ? <Loader size={12} className="spin-sm" />
                  : (selected.visibility === 'public' ? 'Unpublish' : 'Publish')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
