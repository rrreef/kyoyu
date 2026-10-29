import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, Camera, Music, Download, Upload, Disc3, Settings, ChevronRight, Heart, BarChart3, FileText, Bell, LogOut, ChevronLeft, Activity, Radio, ShieldCheck, MessageSquare } from 'lucide-react';
import { userProfile, payoutData } from '../data/mockData';
import { useAuth } from '../contexts/AuthContext';
import { setVIState } from '../lib/visualIdentityStore';
import { supabase } from '../lib/supabase';
import './Profile.css';

export default function Profile() {
  const { user, role, logout, avatarSrc, setAvatarSrc } = useAuth();
  const navigate = useNavigate();
  const isNativeApp = !!window.webkit?.messageHandlers?.player;
  const u = userProfile;
  const [avatarMenu, setAvatarMenu] = useState(false);
  const [showSignOut, setShowSignOut] = useState(false);
  const [activeSubpage, setActiveSubpage] = useState(null);
  const fileRef = useRef();

  function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = async () => {
      URL.revokeObjectURL(objUrl);
      const scale = Math.min(360 / img.naturalWidth, 360 / img.naturalHeight, 1);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      const dataUrl = cv.toDataURL('image/jpeg', 0.84);
      setVIState({ avatarImage: dataUrl });
      setAvatarSrc(dataUrl, user?.id);
      if (user?.id) {
        try { await supabase.from('profiles').upsert({ id: user.id, avatar_url: dataUrl }, { onConflict: 'id' }); } catch (_) {}
      }
      try { await supabase.auth.updateUser({ data: { avatar_url: dataUrl } }); } catch (_) {}
    };
    img.onerror = () => URL.revokeObjectURL(objUrl);
    img.src = objUrl;
    e.target.value = '';
    setAvatarMenu(false);
  }

  const AvatarWidget = (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div className="profile-avatar-wrap" onClick={() => setAvatarMenu(m => !m)}>
        {avatarSrc
          ? <img src={avatarSrc} alt="Avatar" className="profile-avatar-img" />
          : <div className="profile-avatar"><User size={32} /></div>
        }
        <div className="profile-avatar-overlay"><Camera size={16} /></div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
      </div>
      {avatarMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setAvatarMenu(false)} />
          <div className="avatar-menu" style={{ background: 'var(--bg-card)', backdropFilter: 'none' }}>
            <button className="avatar-menu-item" onClick={() => fileRef.current.click()}>
              {avatarSrc ? 'Replace' : 'Add photo'}
            </button>
            {avatarSrc && (
              <button className="avatar-menu-item avatar-menu-remove" onClick={async () => {
                setVIState({ avatarImage: null });
                setAvatarSrc(null, user?.id, true);
                if (user?.id) {
                  try { await supabase.from('profiles').upsert({ id: user.id, avatar_url: null }, { onConflict: 'id' }); } catch (_) {}
                }
                try { await supabase.auth.updateUser({ data: { avatar_url: null } }); } catch (_) {}
                setAvatarMenu(false);
              }}>
                Remove
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );

  if (activeSubpage === 'music-analysis') {
    return (
      <div className="page profile-page animate-in">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button className="glass" onClick={() => setActiveSubpage(null)} style={{ border: 'none', borderRadius: 999, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-primary)' }}>
            <ChevronLeft size={18} />
          </button>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Music Analysis</h1>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="glass" style={{ padding: 18, borderRadius: 20 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', opacity: 0.55, marginBottom: 6 }}>ARCHITECTURE & VERIFICATION</div>
            <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 700 }}>Zero-Placeholder Hybrid Music Intelligence</h3>
            <p style={{ margin: 0, fontSize: '0.84rem', lineHeight: 1.55, opacity: 0.82 }}>
              Kyoyu never displays fabricated or random BPM, musical key, or genre tags. Every track passes through a two-tier verification pipeline combining real-time on-device acoustic signal processing (Tier 1) with multi-provider catalog consensus & ISRC audio fingerprinting (Tier 2). Metadata is only shown once BPM, Key, and Primary Genre are all verified.
            </p>
          </div>

          <div className="glass" style={{ padding: 18, borderRadius: 20 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', opacity: 0.55, marginBottom: 6 }}>TIER 1 · ON-DEVICE ESSENTIA & ACCELERATE DSP</div>
            <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 700 }}>Direct Audio Signal Analysis</h3>
            <p style={{ margin: '0 0 10px', fontSize: '0.84rem', lineHeight: 1.55, opacity: 0.82 }}>
              When a track plays (or is pre-fetched in your queue), Kyoyu samples the core high-energy body of the audio stream and runs a 7-stage Music Information Retrieval (MIR) pipeline:
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.82rem', lineHeight: 1.6, opacity: 0.82 }}>
              <li><strong>3-Band Biquad Filterbank:</strong> Isolates sub-bass kick fundamentals (&lt; 135 Hz), harmonic midrange, and hi-hat/snare transients (&gt; 2.2 kHz).</li>
              <li><strong>Multi-Slice Beat-Grid Autocorrelation:</strong> Evaluates up to two non-overlapping 22-second high-energy windows across 68–185 BPM in 0.2 BPM steps, rejecting beatless intros and breakdowns.</li>
              <li><strong>Dotted-Eighth &amp; Octave Disambiguation:</strong> Resolves 3/4 vs 4/3 polyrhythmic ratios and half/double-time ambiguities using 4/4 kick regularity, sub-bass weight, and Ellis Dynamic Programming beat tracking.</li>
              <li><strong>Continuous Tuning Calibration (430–450 Hz):</strong> Detects microtonal pitch drift (-35 to +35 cents around A4 = 440 Hz) so vinyl rips, pitched club masters, and analog tape recordings map to their true harmonic pitch class.</li>
              <li><strong>60-Bin 3-Sub-Bin Goertzel HPCP Chromagram:</strong> Extracts a 5-octave Harmonic Pitch Class Profile with 4-tap anti-aliasing and harmonic overtone weighting.</li>
              <li><strong>Essentia 4-Profile Key Ensemble:</strong> Scores all 24 Major/Minor keys across four orthogonal tonal profiles — <em>EDMA</em> (Beatport electronic/club profile), <em>BGate</em>, <em>Shaath</em> (KeyFinder DJ profile), and <em>Krumhansl-Kessler</em> — reinforced by sub-bass tonic &amp; fifth root tracking.</li>
            </ul>
          </div>

          <div className="glass" style={{ padding: 18, borderRadius: 20 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', opacity: 0.55, marginBottom: 6 }}>TIER 2 · MULTI-PROVIDER &amp; ISRC CONSENSUS</div>
            <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 700 }}>Catalog Sources &amp; Exact Mix Matching</h3>
            <p style={{ margin: '0 0 10px', fontSize: '0.84rem', lineHeight: 1.55, opacity: 0.82 }}>
              In parallel with on-device DSP, Kyoyu queries six independent music databases and cross-validates them using mix-aware matching (distinguishing Original Mix, Extended Mix, Dub, and specific Remixes):
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.82rem', lineHeight: 1.6, opacity: 0.82 }}>
              <li><strong>Beatport v4 &amp; Public Catalog:</strong> Exact mix/remix tempo and Camelot/Standard key verification.</li>
              <li><strong>MusicBrainz &amp; ISRC Resolution:</strong> Resolves International Standard Recording Codes (ISRCs) from Deezer and iTunes to exact MusicBrainz recording MBIDs.</li>
              <li><strong>AcousticBrainz Low-Level Essentia:</strong> Queries archival Essentia analyses (<code>tonal.key_edma</code>, <code>tonal.key_key</code>, <code>tonal.chords_key</code>, and <code>rhythm.bpm</code>).</li>
              <li><strong>Discogs, Bandcamp &amp; SoundCloud:</strong> Extracts release styles, label lineage, catalog years, and liner-note tempo/key annotations.</li>
            </ul>
          </div>

          <div className="glass" style={{ padding: 18, borderRadius: 20 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', opacity: 0.55, marginBottom: 6 }}>GENRE TAXONOMY &amp; INTERACTIVE CONTROLS</div>
            <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 700 }}>How Kyoyu Uses This Information</h3>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.82rem', lineHeight: 1.6, opacity: 0.82 }}>
              <li><strong>Musicmap Genre &amp; Scene Genealogy:</strong> Fuses Discogs styles, label/artist signatures, and acoustic descriptors (sub-bass ratio, 4/4 kick regularity, syncopation index, spectral brightness) to determine primary and secondary subgenres.</li>
              <li><strong>Long-Form Mix &amp; Podcast Rule (&gt; 22 Minutes):</strong> Any continuous DJ set, radio show, or podcast exceeding 22 minutes (1,320 seconds) automatically suppresses single-track BPM, Key, and Genre tags so multi-track mixes are never mislabeled.</li>
              <li><strong>Step-Ahead Lookahead &amp; Shared Cache:</strong> Upcoming tracks in your queue, album, or radio are pre-analyzed in the background and cached globally so subsequent plays load instantaneously.</li>
              <li><strong>Tap BPM or Key to Re-Analyze:</strong> Spot an inaccurate tempo or key on any title? Simply tap directly on the <strong>BPM</strong> or <strong>Key</strong> on the Player Sheet to purge cached data and force a fresh deep acoustic + multi-provider re-analysis.</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // ── Creator profile ─────────────────────────────────────
  if (role === 'creator') {
    const contract = user?.contract || '70 / 30';
    return (
      <div className="page profile-page animate-in">
        {/* Hero */}
        <div className="profile-hero glass">
          {AvatarWidget}
          <div className="profile-info">
            <h1>{user?.artistName || user?.name || 'Admin'}</h1>
            <div className="profile-plan-badge profile-contract-badge">
              <span>Contract</span>
              <span>·</span>
              <span>{contract}</span>
            </div>
            <div className="profile-member-since">Reef Creator Portal</div>
          </div>
        </div>

        {/* Menu */}
        <div className="profile-menu">
          {[
            { icon: BarChart3, label: 'Dashboard',        to: '/dashboard' },
            { icon: Music,     label: 'My Releases',       to: '/releases'  },
            { icon: FileText,  label: 'Upload New Release', to: '/upload'   },
            { icon: Bell,      label: 'Notifications',     to: '/profile'   },
            { icon: Settings,  label: 'Account Settings',  to: '/app-settings' },
          ].map(({ icon: Icon, label, to }) => (
            <Link key={label} to={to} className="profile-menu-item glass">
              <Icon size={18} />
              <span>{label}</span>
              <ChevronRight size={16} className="profile-menu-arrow" />
            </Link>
          ))}
        </div>
      </div>
    );
  }

  // ── Listener profile ─────────────────────────────────────
  return (
    <div className="page profile-page animate-in">
      {/* Hero — tap to reveal sign-out */}
      <div
        className="profile-hero glass"
        onClick={() => setShowSignOut(s => !s)}

        style={{ cursor: 'pointer' }}
      >
        {AvatarWidget}
        <div className="profile-info">
          <h1>{user?.name || u.name}</h1>
          <div className="profile-plan-badge">
            <span>{u.plan} Plan</span>
          </div>
        </div>
        <div className="profile-hero-actions">
          {showSignOut ? (
            <button
              className="profile-dashboard-btn"
              style={{ border: '1px solid rgba(220,60,60,0.55)', color: 'rgba(220,60,60,0.85)', background: 'transparent', borderRadius: 'var(--radius-full)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', fontSize: '0.8125rem', fontWeight: 600, fontFamily: 'var(--font-body)' }}
              onClick={e => { e.stopPropagation(); logout(); }}
            >
              <LogOut size={14} />
              <span>Sign out</span>
            </button>
          ) : (
            <Link to="/dashboard" className="profile-dashboard-btn glass-sm" onClick={e => e.stopPropagation()}>
              <BarChart3 size={16} />
              <span>Dashboard</span>
            </Link>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="profile-stats">
        <div className="profile-stat glass">
          <div className="profile-stat-val">{u.totalPlays.toLocaleString()}</div>
          <div className="profile-stat-label">Streams</div>
        </div>
        <div className="profile-stat glass">
          <div className="profile-stat-val">{u.totalDownloads}</div>
          <div className="profile-stat-label">Downloads</div>
        </div>
        <div className="profile-stat glass">
          <div className="profile-stat-val">{u.totalVinylOrders}</div>
          <div className="profile-stat-label">Vinyl Orders</div>
        </div>
        <div className="profile-stat glass">
          <div className="profile-stat-val">{payoutData.topArtists.length}</div>
          <div className="profile-stat-label">Artists Supported</div>
        </div>
      </div>

      {/* Payout this month */}
      <div className="profile-payout glass">
        <div className="profile-payout-title">This Month's Artist Support</div>
        <div className="profile-payout-amt">€{payoutData.artistPool.toFixed(2)} went to {payoutData.topArtists.length} artists</div>
        <Link to="/subscription" className="profile-payout-link">
          See full breakdown →
        </Link>
      </div>

      {/* Menu */}
      <div className="profile-menu">
        {[
          { icon: User,     label: 'Account',              to: '/account'      },
          { icon: Upload,   label: 'Uploads',               to: '/uploads'      },
          { icon: Download, label: 'Downloads',             to: '/downloads'    },
          { icon: Disc3,    label: 'Merch Orders',          to: '/orders'       },
          { icon: BarChart3,label: 'Manage Subscription',   to: '/subscription' },
          { icon: Settings, label: 'Settings',              to: '/app-settings' },
        ].map(({ icon: Icon, label, to }) => (
          <Link key={label} to={to} className="profile-menu-item glass">
            <Icon size={18} />
            <span>{label}</span>
            <ChevronRight size={16} className="profile-menu-arrow" />
          </Link>
        ))}
        <button
          type="button"
          className="profile-menu-item glass"
          style={{ width: '100%', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}
          onClick={() => setActiveSubpage('music-analysis')}
        >
          <Activity size={18} />
          <span>Music Analysis</span>
          <ChevronRight size={16} className="profile-menu-arrow" />
        </button>
      </div>
    </div>
  );
}
