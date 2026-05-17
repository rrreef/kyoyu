import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Play, Pause, Download, MessageSquare, Star, X, Eye, EyeOff, Upload,
         Loader, RefreshCw, Music, FileText, DollarSign, ScrollText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchMyTracks, r2Url } from '../lib/uploadPipeline';
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
    publish_at:   t.publish_at  || null,
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
    const key = rel.groupKey;
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
        publishAt:   rel.publish_at || null,
      });
    }
    const grp = map.get(key);
    if (!grp.artworkUrl && rel.artworkUrl) grp.artworkUrl = rel.artworkUrl;
    // If any track has a different visibility, mark as mixed
    if (grp.visibility !== rel.visibility) grp.visibility = 'mixed';
    // Inherit earliest publishAt
    if (rel.publish_at && !grp.publishAt) grp.publishAt = rel.publish_at;
    grp.tracks.push(rel);
  });
  return [...map.values()];
}

/* ─── Component ──────────────────────────────────────────── */
export default function Releases({ filter = 'all' }) {
  const [releases,  setReleases]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [selected,  setSelected]  = useState(null);
  const [toggling,  setToggling]  = useState(false);
  const [editing,   setEditing]   = useState(false);
  const [deleting,  setDeleting]  = useState(false);
  const [subPanel,  setSubPanel]  = useState(null);
  const [savingSub, setSavingSub] = useState(false);
  const [editFields, setEditFields] = useState(
    { albumName:'', artist:'', year:'', label:'', genre:'', description:'', visibility:'private', publishAt:'' }
  );
  const [creditsData, setCreditsData] = useState({ producer:'', mastering:'', artworkCredit:'', rows:[] });
  const [pricingData, setPricingData] = useState(
    { streamingEnabled:true, downloadsEnabled:true, currency:'EUR', albumPrice:'', downloadPrice:'' }
  );
  const [contractData, setContractData] = useState({ exclusivity: false });
  // Audio preview
  const audioRef   = useRef(null);
  const [playing,  setPlaying]   = useState(false);
  const [progress, setProgress]  = useState(0);
  const [curTime,  setCurTime]   = useState(0);
  const [duration, setDuration]  = useState(0);
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

  /* Select / deselect an album group — reset all panel state */
  const selectAlbum = (album) => {
    setEditing(false);
    setSubPanel(null);
    setPlaying(false);
    setProgress(0);
    setCurTime(0);
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    setSelected(prev => prev?.albumKey === album.albumKey ? null : album);
  };

  /* Audio preview helpers */
  function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); setPlaying(false); }
    else { el.play().catch(() => {}); setPlaying(true); }
  }
  function seekAudio(e) {
    const el = audioRef.current;
    if (!el || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    el.currentTime = pct * duration;
  }
  function fmtTime(s) {
    if (!s || isNaN(s)) return '0:00';
    return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
  }
  function currencySymbol(c) {
    return {EUR:'€',USD:'$',GBP:'£',JPY:'¥',CHF:'CHF',CAD:'CA$',AUD:'AU$'}[c] || '€';
  }

  /* ── Open a sub-panel (load data from DB) ── */
  async function openSubPanel(name) {
    // Reset all sub-panel data first
    setEditing(false);
    setSubPanel(name); // open immediately so UI doesn't freeze
    if (name === 'credits') {
      setCreditsData({ producer:'', mastering:'', artworkCredit:'', rows:[] });
      try {
        const trackIds = selected.tracks.map(t => t.id);
        const { data } = await supabase.from('track_credits').select('*').in('track_id', trackIds);
        if (data?.length) {
          setCreditsData(d => ({...d, rows: data.map(r => ({id: r.id||Math.random().toString(36).slice(2), role: r.role||'', name: r.name||''}))}));
        }
      } catch (_) { /* table may not exist yet — open with empty rows */ }
    } else if (name === 'pricing') {
      setPricingData({ streamingEnabled:true, downloadsEnabled:true, currency:'EUR', albumPrice:'', downloadPrice:'' });
    } else if (name === 'contract') {
      setContractData({ exclusivity: false });
    }
  }

  async function saveCredits() {
    if (!selected) return;
    setSavingSub(true);
    const trackId = selected.tracks[0]?.id;
    if (trackId) {
      await supabase.from('track_credits').delete().eq('track_id', trackId);
      const rows = creditsData.rows
        .filter(r => r.role?.trim() || r.name?.trim())
        .map(r => ({ track_id: trackId, role: r.role?.trim()||null, name: r.name?.trim()||null }));
      if (rows.length) await supabase.from('track_credits').insert(rows);
    }
    setSavingSub(false);
    setSubPanel(null);
  }

  async function savePricing() {
    if (!selected) return;
    setSavingSub(true);
    const trackIds = selected.tracks.map(t => t.id);
    // Columns may not exist yet; error is non-fatal
    await supabase.from('tracks').update({
      streaming_enabled: pricingData.streamingEnabled,
      downloads_enabled: pricingData.downloadsEnabled,
      currency: pricingData.currency,
      album_price: pricingData.albumPrice || null,
      download_price: pricingData.downloadPrice || null,
    }).in('id', trackIds);
    setSavingSub(false);
    setSubPanel(null);
  }

  async function saveContract() {
    if (!selected) return;
    setSavingSub(true);
    const trackIds = selected.tracks.map(t => t.id);
    await supabase.from('tracks').update({ exclusivity: contractData.exclusivity }).in('id', trackIds);
    setSavingSub(false);
    setSubPanel(null);
  }

  function startEdit() {
    const f = selected.tracks[0];
    setEditFields({
      albumName:   selected.albumName || '',
      artist:      selected.artist    || '',
      year:        selected.year      ? String(selected.year) : '',
      label:       selected.label     || f?.label || '',
      genre:       f?.genre           || '',
      description: f?.description     || '',
      visibility:  selected.visibility === 'public' ? 'public' : 'private',
      publishAt:   f?.publish_at      ? f.publish_at.slice(0, 16) : '',
    });
    setSubPanel(null);
    setEditing(true);
  }

  async function saveEdit() {
    if (!selected) return;
    const updates = {
      artist:      editFields.artist.trim()      || null,
      year:        editFields.year ? parseInt(editFields.year) : null,
      label:       editFields.label.trim()       || null,
      album:       editFields.albumName.trim()   || null,
      genre:       editFields.genre.trim()       || null,
      description: editFields.description.trim() || null,
      visibility:  editFields.visibility,
      publish_at:  editFields.publishAt          || null,
    };
    const trackIds = selected.tracks.map(t => t.id);
    const { error: dbErr } = await supabase.from('tracks').update(updates).in('id', trackIds);
    if (!dbErr) {
      const updatedTracks = selected.tracks.map(t => ({ ...t, ...updates }));
      const updatedAlbum  = { ...selected,
        albumName:  editFields.albumName || selected.albumName,
        artist:     editFields.artist    || selected.artist,
        year:       updates.year,
        label:      updates.label,
        visibility: updates.visibility,
        publishAt:  updates.publish_at,
        tracks:     updatedTracks };
      setSelected(updatedAlbum);
      setReleases(prev => prev.map(r => trackIds.includes(r.id) ? { ...r, ...updates } : r));
    }
    setEditing(false);
  }

  /* ── Delete album (all tracks) ── */
  async function deleteAlbum() {
    if (!selected || deleting) return;
    const label = selected.tracks.length === 1 ? `"${selected.tracks[0].title}"` : `"${selected.albumName}" (${selected.tracks.length} tracks)`;
    if (!window.confirm(`Permanently delete ${label}? This cannot be undone.`)) return;
    setDeleting(true);
    const trackIds = selected.tracks.map(t => t.id);
    const { error: dbErr } = await supabase.from('tracks').delete().in('id', trackIds);
    if (!dbErr) {
      setReleases(prev => prev.filter(r => !trackIds.includes(r.id)));
      setSelected(null);
    }
    setDeleting(false);
  }

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
                  {multiTrack && (
                    <div className="rel-card-count">{album.tracks.length}</div>
                  )}
                  {/* Status badge — top-right white pill */}
                  {(() => {
                    const isPublic  = album.tracks.some(t => t.visibility === 'public');
                    const hasPubAt  = album.tracks.some(t => t.publish_at);
                    if (isPublic)  return <div className="rel-card-badge">Public</div>;
                    if (hasPubAt)  return <div className="rel-card-badge">Pending</div>;
                    return               <div className="rel-card-badge">Private</div>;
                  })()}
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
      {selected && (() => {
        const firstTrack = selected.tracks[0];
        const audioSrc   = firstTrack?.storage_key ? r2Url(firstTrack.storage_key) : null;
        return (
          <div
            className="rel-overlay"
            onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}
          >
            <div className="rel-panel">
              <button className="rel-panel-close" onClick={() => setSelected(null)}>
                <X size={14} />
              </button>

              {/* ── Header: artwork + info ── */}
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

              {/* ── Audio preview player ── */}
              {audioSrc && (
                <div className="rdp-player">
                  <audio
                    ref={audioRef}
                    src={audioSrc}
                    onEnded={() => setPlaying(false)}
                    onLoadedMetadata={e => setDuration(e.target.duration)}
                    onTimeUpdate={e => {
                      setCurTime(e.target.currentTime);
                      setProgress(e.target.duration ? e.target.currentTime / e.target.duration * 100 : 0);
                    }}
                  />
                  <button className="rdp-play-btn" onClick={togglePlay}>
                    {playing ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
                  </button>
                  <div className="rdp-progress-bar" onClick={seekAudio}>
                    <div className="rdp-progress-fill" style={{ width: `${progress}%` }} />
                  </div>
                  <span className="rdp-time">{fmtTime(curTime)} / {fmtTime(duration)}</span>
                </div>
              )}

              {/* ── Content section: swapped per mode ── */}
              {editing ? (
                /* Edit form — all upload fields */
                <div className="rdp-edit-form">
                  <div className="rdp-edit-grid">
                    <div className="rdp-edit-row rdp-edit-row--full">
                      <label className="rdp-edit-label">Album / Release Title</label>
                      <input className="rdp-edit-input" value={editFields.albumName}
                        placeholder="Album or EP name"
                        onChange={e => setEditFields(f => ({...f, albumName: e.target.value}))} />
                    </div>
                    <div className="rdp-edit-row">
                      <label className="rdp-edit-label">Artist / Band Name</label>
                      <input className="rdp-edit-input" value={editFields.artist}
                        placeholder="Artist name"
                        onChange={e => setEditFields(f => ({...f, artist: e.target.value}))} />
                    </div>
                    <div className="rdp-edit-row">
                      <label className="rdp-edit-label">Label</label>
                      <input className="rdp-edit-input" value={editFields.label}
                        placeholder="Label or Self-Released"
                        onChange={e => setEditFields(f => ({...f, label: e.target.value}))} />
                    </div>
                    <div className="rdp-edit-row">
                      <label className="rdp-edit-label">Genre</label>
                      <input className="rdp-edit-input" value={editFields.genre}
                        placeholder="e.g. Techno, Jazz"
                        onChange={e => setEditFields(f => ({...f, genre: e.target.value}))} />
                    </div>
                    <div className="rdp-edit-row">
                      <label className="rdp-edit-label">Release Year</label>
                      <input className="rdp-edit-input" type="number" value={editFields.year}
                        placeholder="2026"
                        onChange={e => setEditFields(f => ({...f, year: e.target.value}))} />
                    </div>
                    <div className="rdp-edit-row rdp-edit-row--full">
                      <label className="rdp-edit-label">Description</label>
                      <textarea className="rdp-edit-input rdp-edit-textarea"
                        value={editFields.description}
                        placeholder="Release notes, liner notes…"
                        onChange={e => setEditFields(f => ({...f, description: e.target.value}))} />
                    </div>
                    <div className="rdp-edit-row rdp-edit-row--full">
                      <label className="rdp-edit-label">Visibility</label>
                      <div className="rdp-edit-vis-toggle">
                        <button
                          className={`rdp-vis-btn ${editFields.visibility === 'private' ? 'active' : ''}`}
                          onClick={() => setEditFields(f => ({...f, visibility: 'private'}))}
                        ><EyeOff size={11} /> Private</button>
                        <button
                          className={`rdp-vis-btn ${editFields.visibility === 'public' ? 'active' : ''}`}
                          onClick={() => setEditFields(f => ({...f, visibility: 'public'}))}
                        ><Eye size={11} /> Public</button>
                      </div>
                    </div>
                    {editFields.visibility === 'private' && (
                      <div className="rdp-edit-row rdp-edit-row--full">
                        <label className="rdp-edit-label">Publish Date <span style={{opacity:0.5,fontWeight:400}}>(optional — sets status to Pending)</span></label>
                        <input className="rdp-edit-input" type="datetime-local"
                          value={editFields.publishAt}
                          onChange={e => setEditFields(f => ({...f, publishAt: e.target.value}))} />
                      </div>
                    )}
                  </div>
                  <div className="rdp-actions">
                    <button className="rdp-btn rdp-btn--primary" onClick={saveEdit}>Save Changes</button>
                    <button className="rdp-btn" onClick={() => setEditing(false)}>Cancel</button>
                  </div>
                </div>
              ) : subPanel === 'credits' ? (
                /* ── Credits panel ── */
                <div className="rdp-subpanel">
                  <div className="rdp-edit-grid">
                    <div className="rdp-edit-row">
                      <label className="rdp-edit-label">Producer</label>
                      <input className="rdp-edit-input" value={creditsData.producer}
                        placeholder="Who produced this release?"
                        onChange={e => setCreditsData(d => ({...d, producer: e.target.value}))} />
                    </div>
                    <div className="rdp-edit-row">
                      <label className="rdp-edit-label">Mastering Engineer</label>
                      <input className="rdp-edit-input" value={creditsData.mastering}
                        placeholder="Engineer name and studio"
                        onChange={e => setCreditsData(d => ({...d, mastering: e.target.value}))} />
                    </div>
                    <div className="rdp-edit-row rdp-edit-row--full">
                      <label className="rdp-edit-label">Artwork / Design Credit</label>
                      <input className="rdp-edit-input" value={creditsData.artworkCredit}
                        placeholder="Designer or photographer"
                        onChange={e => setCreditsData(d => ({...d, artworkCredit: e.target.value}))} />
                    </div>
                    <div className="rdp-edit-row rdp-edit-row--full">
                      <label className="rdp-edit-label">Performers & Crew</label>
                      <div className="rdp-credit-rows">
                        {creditsData.rows.map((row, i) => (
                          <div key={row.id} className="rdp-credit-row">
                            <input className="rdp-edit-input" value={row.role}
                              placeholder="Role (Guitar, Mixing…)"
                              onChange={e => setCreditsData(d => ({...d, rows: d.rows.map((r,j) => j===i?{...r,role:e.target.value}:r)}))} />
                            <input className="rdp-edit-input" value={row.name}
                              placeholder="Name or studio"
                              onChange={e => setCreditsData(d => ({...d, rows: d.rows.map((r,j) => j===i?{...r,name:e.target.value}:r)}))} />
                            <button className="rdp-credit-remove"
                              onClick={() => setCreditsData(d => ({...d, rows: d.rows.filter((_,j)=>j!==i)}))}>
                              <X size={11} />
                            </button>
                          </div>
                        ))}
                        <button className="rdp-add-credit"
                          onClick={() => setCreditsData(d => ({...d, rows:[...d.rows,{id:Math.random().toString(36).slice(2),role:'',name:''}]}))}>
                          + Add performer / crew
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="rdp-actions">
                    <button className="rdp-btn rdp-btn--primary" onClick={saveCredits} disabled={savingSub}>
                      {savingSub ? <Loader size={12} className="spin-sm" /> : 'Save Credits'}
                    </button>
                    <button className="rdp-btn" onClick={() => setSubPanel(null)}>Cancel</button>
                  </div>
                </div>
              ) : subPanel === 'pricing' ? (
                /* ── Pricing panel ── */
                <div className="rdp-subpanel">
                  <div className="rdp-pricing-toggle-row">
                    <div>
                      <div className="rdp-toggle-label">Streaming</div>
                      <div className="rdp-toggle-sub">Available to all Reef subscribers</div>
                    </div>
                    <button
                      className={`rdp-toggle-switch ${pricingData.streamingEnabled ? 'on' : ''}`}
                      onClick={() => setPricingData(d => ({...d, streamingEnabled: !d.streamingEnabled}))}
                      aria-checked={pricingData.streamingEnabled}
                      role="switch"
                    />
                  </div>
                  <div className="rdp-pricing-toggle-row">
                    <div>
                      <div className="rdp-toggle-label">DJ Downloads</div>
                      <div className="rdp-toggle-sub">Paid per-track downloads in professional formats</div>
                    </div>
                    <button
                      className={`rdp-toggle-switch ${pricingData.downloadsEnabled ? 'on' : ''}`}
                      onClick={() => setPricingData(d => ({...d, downloadsEnabled: !d.downloadsEnabled}))}
                      aria-checked={pricingData.downloadsEnabled}
                      role="switch"
                    />
                  </div>
                  {pricingData.downloadsEnabled && (
                    <div className="rdp-edit-grid" style={{marginTop:'var(--sp-3)'}}>
                      <div className="rdp-edit-row rdp-edit-row--full">
                        <label className="rdp-edit-label">Currency</label>
                        <select className="rdp-edit-input" value={pricingData.currency}
                          onChange={e => setPricingData(d => ({...d, currency: e.target.value}))}>
                          {['EUR','USD','GBP','JPY','CHF','CAD','AUD'].map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="rdp-edit-row">
                        <label className="rdp-edit-label">Album Price (Bundle)</label>
                        <div className="rdp-price-wrap">
                          <span className="rdp-currency">{currencySymbol(pricingData.currency)}</span>
                          <input className="rdp-edit-input" type="number" step="0.10" min="0" max="50"
                            value={pricingData.albumPrice}
                            onChange={e => setPricingData(d => ({...d, albumPrice: e.target.value}))} />
                        </div>
                      </div>
                      <div className="rdp-edit-row">
                        <label className="rdp-edit-label">Price per Track</label>
                        <div className="rdp-price-wrap">
                          <span className="rdp-currency">{currencySymbol(pricingData.currency)}</span>
                          <input className="rdp-edit-input" type="number" step="0.10" min="0" max="5"
                            value={pricingData.downloadPrice}
                            onChange={e => setPricingData(d => ({...d, downloadPrice: e.target.value}))} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="rdp-actions">
                    <button className="rdp-btn rdp-btn--primary" onClick={savePricing} disabled={savingSub}>
                      {savingSub ? <Loader size={12} className="spin-sm" /> : 'Save Pricing'}
                    </button>
                    <button className="rdp-btn" onClick={() => setSubPanel(null)}>Cancel</button>
                  </div>
                </div>
              ) : subPanel === 'contract' ? (
                /* ── Contract panel ── */
                <div className="rdp-subpanel">
                  <div className="rdp-contract-options">
                    <div className={`rdp-contract-opt ${!contractData.exclusivity ? 'selected' : ''}`}
                      onClick={() => setContractData(d => ({...d, exclusivity: false}))}>
                      <div className="rdp-contract-header">
                        <span className="rdp-contract-name">Standard — 70/30</span>
                        {!contractData.exclusivity && <span className="rdp-contract-check">✓</span>}
                      </div>
                      <ul className="rdp-contract-list">
                        <li>Keep your music on all platforms</li>
                        <li>70% of streaming royalties</li>
                        <li>100% of download & vinyl revenue (minus Reef 10%)</li>
                        <li>Cancel anytime with 30 days notice</li>
                      </ul>
                    </div>
                    <div className={`rdp-contract-opt ${contractData.exclusivity ? 'selected' : ''}`}
                      onClick={() => setContractData(d => ({...d, exclusivity: true}))}>
                      <div className="rdp-contract-header">
                        <span className="rdp-contract-name">Exclusive — 90/10</span>
                        {contractData.exclusivity && <span className="rdp-contract-check">✓</span>}
                      </div>
                      <ul className="rdp-contract-list">
                        <li>Remove your catalog from all other platforms</li>
                        <li>90% of streaming royalties (20% more)</li>
                        <li>Priority placement and editorial support</li>
                        <li>Promotional support from Reef team</li>
                      </ul>
                    </div>
                  </div>
                  <div className="rdp-actions">
                    <button className="rdp-btn rdp-btn--primary" onClick={saveContract} disabled={savingSub}>
                      {savingSub ? <Loader size={12} className="spin-sm" /> : 'Save Contract'}
                    </button>
                    <button className="rdp-btn" onClick={() => setSubPanel(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                /* Default view: tracklist + actions */
                <>
                  <div className="rdp-tracklist">
                    {selected.tracks.map((t, i) => (
                      <div key={t.id} className="rdp-track-row">
                        <span className="rdp-track-num">{i + 1}</span>
                        <span className="rdp-track-title">{t.title}</span>
                        <span className="rdp-track-fmt">{t.format}</span>
                      </div>
                    ))}
                  </div>
                  <div className="rdp-actions">
                    <button className="rdp-btn" onClick={startEdit}>Edit Metadata</button>
                    <button className="rdp-btn" onClick={toggleVisibility}
                      disabled={toggling || selected.visibility === 'mixed'}>
                      {toggling ? <Loader size={12} className="spin-sm" />
                        : (selected.visibility === 'public' ? 'Unpublish' : 'Publish')}
                    </button>
                    <button className="rdp-btn" onClick={() => openSubPanel('credits')}>Credits</button>
                    <button className="rdp-btn" onClick={() => openSubPanel('pricing')}>Pricing</button>
                    <button className="rdp-btn" onClick={() => openSubPanel('contract')}>Contract</button>
                    <button className={`rdp-btn rdp-btn--delete ${deleting ? 'loading' : ''}`}
                      onClick={deleteAlbum} disabled={deleting}>
                      {deleting ? <Loader size={12} className="spin-sm" /> : 'Delete'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
