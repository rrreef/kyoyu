import { useState, useCallback } from 'react';
import {
  User, BarChart3, Bell, Globe, ShieldCheck, CreditCard,
  ChevronRight, RotateCcw, Check, Wifi, WifiOff, CheckCircle2,
  Camera, Paintbrush2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useDashboardPrefs } from '../hooks/useDashboardPrefs';
import { setVIState, useVIStore } from '../lib/visualIdentityStore';
import { useTheme, THEMES } from '../hooks/useTheme';
import './Settings.css';

/* ─── Settings sections ──────────────────────────────────── */
const SECTIONS = [
  { id: 'account',      label: 'Account',      icon: User          },
  { id: 'appearance',   label: 'Appearance',   icon: Paintbrush2   },
  { id: 'dashboard',    label: 'Dashboard',    icon: BarChart3     },
  { id: 'notifications',label: 'Notifications',icon: Bell          },
  { id: 'distribution', label: 'Distribution', icon: Globe         },
  { id: 'privacy',      label: 'Privacy',      icon: ShieldCheck   },
  { id: 'billing',      label: 'Billing',      icon: CreditCard    },
];

/* ─── Re-usable controls ─────────────────────────────────── */

function Toggle({ value, onChange, disabled }) {
  return (
    <button
      className={`s-toggle ${value ? 'on' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={() => !disabled && onChange(!value)}
      aria-pressed={value}
    >
      <span className="s-toggle-thumb" />
    </button>
  );
}

function PillGroup({ options, value, onChange }) {
  return (
    <div className="s-pill-group">
      {options.map(o => (
        <button
          key={o.value ?? o}
          className={`s-pill ${(o.value ?? o) === value ? 'active' : ''}`}
          onClick={() => onChange(o.value ?? o)}
        >
          {o.label ?? o}
        </button>
      ))}
    </div>
  );
}

function SettingRow({ label, hint, children, noBorder }) {
  return (
    <div className={`s-row ${noBorder ? 'no-border' : ''}`}>
      <div className="s-row-text">
        <span className="s-row-label">{label}</span>
        {hint && <span className="s-row-hint">{hint}</span>}
      </div>
      <div className="s-row-control">{children}</div>
    </div>
  );
}

function SectionHeading({ children }) {
  return <div className="s-section-heading">{children}</div>;
}

/* Saved-changes toast */
function SavedToast({ visible }) {
  if (!visible) return null;
  return (
    <div className="s-saved-toast">
      <CheckCircle2 size={14} strokeWidth={2} />
      Changes saved
    </div>
  );
}

/* ─── Section panels ─────────────────────────────────────── */

function AccountPanel({ user }) {
  const { updateProfile } = useAuth();
  const [vi]         = useVIStore();
  const [artistName, setArtistName] = useState(user?.artistName || '');
  const [bio,        setBio]        = useState(user?.bio        || '');
  const [location,   setLocation]   = useState(user?.location   || '');
  const [saved,      setSaved]      = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  let _avatarUid = 'acct-avatar-upload';

  const displayInitial = (artistName || user?.name || 'A')[0].toUpperCase();
  const avatarImage    = vi.avatarImage;
  const avatarObjPos   = vi.avatarPosition ? `${vi.avatarPosition.x}% ${vi.avatarPosition.y}%` : '50% 50%';

  /* Handle file from input or drop */
  const processAvatarFile = (f) => {
    if (!f || !f.type.startsWith('image/')) return;
    const url = URL.createObjectURL(f);
    setVIState({ avatarImage: url }); // sync to VI store → ListenerPreview too
  };

  const handleAvatarInput = (e) => {
    processAvatarFile(e.target.files?.[0]);
    e.target.value = '';
  };
  const onDragOver  = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true);  };
  const onDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true);  };
  const onDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const onDrop      = (e) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    processAvatarFile(e.dataTransfer.files?.[0]);
  };

  const handleSave = useCallback(() => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2800);
    updateProfile({ artistName, bio, location }).catch(console.warn);
  }, [artistName, bio, location, updateProfile]);

  return (
    <div className="s-panel">
      <div className="s-panel-header">
        <h2>Account</h2>
        <p>Manage your creator profile information</p>
      </div>

      <div className="s-card glass">
        <div className="s-avatar-row">

          {/* ── Avatar upload zone ── */}
          <div
            className={`s-avatar-upload ${isDragging ? 's-avatar-upload--drag' : ''}`}
            onDragOver={onDragOver}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <input
              id={_avatarUid}
              type="file"
              accept="image/*"
              onChange={handleAvatarInput}
              className="s-avatar-file-hidden"
            />
            {/* Avatar image or initials */}
            {avatarImage
              ? <img src={avatarImage} alt="profile" className="s-avatar-img" style={{ objectPosition: avatarObjPos }} />
              : <span className="s-avatar-initial">{isDragging ? '↓' : displayInitial}</span>
            }
            {/* Camera overlay — appears on hover */}
            <label htmlFor={_avatarUid} className="s-avatar-overlay" title="Change profile picture">
              <Camera size={16}/>
              <span>{avatarImage ? 'Change' : 'Upload'}</span>
            </label>
            {/* Remove btn */}
            {avatarImage && (
              <button
                type="button"
                className="s-avatar-remove"
                onClick={() => setVIState({ avatarImage: null })}
                title="Remove photo"
              >×</button>
            )}
          </div>

          <div>
            <div className="s-avatar-name">{artistName || user?.name || 'Artist'}</div>
            <div className="s-avatar-email">{user?.email || '—'}</div>
            <div className="s-avatar-hint">Click or drag an image to set your photo</div>
          </div>
        </div>
      </div>

      <div className="s-card glass">
        <SectionHeading>Profile</SectionHeading>
        <div className="s-field">
          <label>Artist / Band Name</label>
          <input
            type="text"
            value={artistName}
            onChange={e => setArtistName(e.target.value)}
            placeholder="Your name on Reef"
          />
        </div>
        <div className="s-field">
          <label>Bio</label>
          <textarea
            rows={3}
            value={bio}
            onChange={e => setBio(e.target.value)}
            placeholder="Tell listeners about yourself..."
            style={{ resize: 'vertical' }}
          />
        </div>
        <div className="s-field">
          <label>Location</label>
          <input
            type="text"
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="City, Country"
          />
        </div>
        <SavedToast visible={saved} />
        <button className="s-save-btn" onClick={handleSave}>Save Changes</button>
      </div>

      <div className="s-card glass">
        <SectionHeading>Security</SectionHeading>
        <SettingRow label="Email" hint={user?.email || '—'} noBorder>
          <span className="s-badge">Verified</span>
        </SettingRow>
        <SettingRow label="Password">
          <button className="s-ghost-btn">Change →</button>
        </SettingRow>
        <SettingRow label="Two-Factor Auth" hint="Extra security for your account" noBorder>
          <Toggle value={false} onChange={() => {}} />
        </SettingRow>
      </div>
    </div>
  );
}

/* ── Appearance panel ───────────────────────────────────────── */
const THEME_PREVIEWS = {
  dark:  { bg: '#060608', surface: 'rgba(255,255,255,0.05)', text: '#ffffff' },
  grey:  { bg: '#16161e', surface: 'rgba(255,255,255,0.08)', text: '#eeeef8' },
  white: { bg: '#f0f0f5', surface: 'rgba(255,255,255,0.85)', text: '#0f0f1a' },
};

function AppearancePanel() {
  const [theme, setTheme] = useTheme();
  return (
    <div className="s-panel">
      <div className="s-panel-header">
        <h2>Appearance</h2>
        <p>Choose your preferred interface theme</p>
      </div>
      <div className="s-card glass">
        <SectionHeading>Theme</SectionHeading>
        <div className="s-theme-grid">
          {THEMES.map(({ id, label }) => {
            const p = THEME_PREVIEWS[id];
            const active = theme === id;
            return (
              <button
                key={id}
                className={`s-theme-card ${active ? 'active' : ''}`}
                onClick={() => setTheme(id)}
                style={{ '--th-bg': p.bg, '--th-surface': p.surface, '--th-text': p.text }}
              >
                {/* Mini preview */}
                <div className="s-theme-preview">
                  <div className="s-theme-preview-bar" />
                  <div className="s-theme-preview-card" />
                  <div className="s-theme-preview-card s-theme-preview-card--2" />
                </div>
                <div className="s-theme-label">
                  {active && <Check size={11} strokeWidth={3} />}
                  {label}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Dashboard customization panel ─────────────────────────────────── */
const SWATCHES = [
  { value: 'orange',  color: '#FF6B1A' },
  { value: 'violet',  color: '#9b6dff' },
  { value: 'blue',    color: '#29b6f6' },
  { value: 'emerald', color: '#50c878' },
  { value: 'rose',    color: '#f43f5e' },
];

function DashboardPanel() {
  const { prefs, updatePref, resetPrefs } = useDashboardPrefs();
  const [saved, setSaved] = useState(false);

  function handleReset() {
    resetPrefs();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="s-panel">
      <div className="s-panel-header">
        <h2>Dashboard</h2>
        <p>Customize how your dashboard looks and behaves</p>
        <button className="s-ghost-btn s-reset-btn" onClick={handleReset}>
          <RotateCcw size={13} /> {saved ? 'Reset!' : 'Reset to defaults'}
        </button>
      </div>

      {/* Layout */}
      <div className="s-card glass">
        <SectionHeading>Layout & Density</SectionHeading>
        <SettingRow label="Dashboard Layout" hint="How information is arranged on screen">
          <PillGroup
            options={[
              { value: 'compact',  label: 'Compact'  },
              { value: 'standard', label: 'Standard' },
              { value: 'detailed', label: 'Detailed' },
            ]}
            value={prefs.layout}
            onChange={v => updatePref('layout', v)}
          />
        </SettingRow>
        <SettingRow label="Default Tab" hint="Which tab opens when you visit the dashboard" noBorder>
          <PillGroup
            options={['Overview', 'Payout', 'Notifications', 'Contract']}
            value={prefs.defaultTab}
            onChange={v => updatePref('defaultTab', v)}
          />
        </SettingRow>
      </div>

      {/* Chart */}
      <div className="s-card glass">
        <SectionHeading>Chart & Analytics</SectionHeading>
        <SettingRow label="Default Time Period" hint="Period shown when dashboard first loads">
          <PillGroup
            options={['Day', 'Week', 'Month', 'Year']}
            value={prefs.defaultPeriod}
            onChange={v => updatePref('defaultPeriod', v)}
          />
        </SettingRow>
        <SettingRow label="Chart Style">
          <PillGroup
            options={[
              { value: 'line', label: 'Line'  },
              { value: 'bar',  label: 'Bar'   },
              { value: 'area', label: 'Area'  },
            ]}
            value={prefs.chartStyle}
            onChange={v => updatePref('chartStyle', v)}
          />
        </SettingRow>
        <SettingRow label="Animate Charts" hint="Smooth entrance animations on load" noBorder>
          <Toggle value={prefs.animateCharts} onChange={v => updatePref('animateCharts', v)} />
        </SettingRow>
      </div>

      {/* Chart metric */}
      <div className="s-card glass">
        <SectionHeading>Default Chart Metric</SectionHeading>
        <SettingRow label="Chart Shows" hint="Which metric the chart displays by default" noBorder>
          <PillGroup
            options={['Streams','Downloads','Vinyl','Revenue','All']}
            value={prefs.chartMetric || 'Streams'}
            onChange={v => updatePref('chartMetric', v)}
          />
        </SettingRow>
      </div>

      {/* Per-metric colors */}
      <div className="s-card glass">
        <SectionHeading>Metric Colors</SectionHeading>
        {[
          { key: 'streams',   label: 'Streams',       hint: 'Color for stream KPI card & chart' },
          { key: 'downloads', label: 'Downloads',      hint: 'Color for downloads KPI card & chart' },
          { key: 'vinyl',     label: 'Vinyl Sold',     hint: 'Color for vinyl sales KPI card & chart' },
          { key: 'revenue',   label: 'Total Revenue',  hint: 'Color for revenue KPI card & chart', last: true },
        ].map(({ key, label, hint, last }) => (
          <SettingRow key={key} label={label} hint={hint} noBorder={last}>
            <div className="s-color-group">
              {SWATCHES.map(({ value, color }) => {
                const active = (prefs.metricColors?.[key] || 'orange') === value;
                return (
                  <button
                    key={value}
                    className={`s-color-swatch ${active ? 'active' : ''}`}
                    style={{ '--swatch-color': color }}
                    onClick={() => updatePref('metricColors', { ...prefs.metricColors, [key]: value })}
                    title={value}
                  >
                    {active && <Check size={10} strokeWidth={3} />}
                  </button>
                );
              })}
            </div>
          </SettingRow>
        ))}
      </div>

      {/* Widgets */}
      <div className="s-card glass">
        <SectionHeading>Visible Widgets</SectionHeading>
        <SettingRow label="KPI Cards" hint="Streams, downloads, vinyl, revenue">
          <Toggle value={prefs.showKpis} onChange={v => updatePref('showKpis', v)} />
        </SettingRow>
        <SettingRow label="Streams Chart" hint="The time-series chart on the overview tab">
          <Toggle value={prefs.showChart} onChange={v => updatePref('showChart', v)} />
        </SettingRow>
        <SettingRow label="Top Tracks" hint="Ranked list of your best performing tracks">
          <Toggle value={prefs.showTopTracks} onChange={v => updatePref('showTopTracks', v)} />
        </SettingRow>
        <SettingRow label="Revenue Summary" hint="Payout breakdown and earnings totals" noBorder>
          <Toggle value={prefs.showPayout} onChange={v => updatePref('showPayout', v)} />
        </SettingRow>
      </div>

      {/* Auto-refresh */}
      <div className="s-card glass">
        <SectionHeading>Data</SectionHeading>
        <SettingRow label="Auto-Refresh" hint="Automatically reload dashboard stats" noBorder>
          <PillGroup
            options={[
              { value: 'off',   label: 'Off'    },
              { value: '5min',  label: '5 min'  },
              { value: '15min', label: '15 min' },
            ]}
            value={prefs.autoRefresh}
            onChange={v => updatePref('autoRefresh', v)}
          />
        </SettingRow>
      </div>
    </div>
  );
}

/* ── Notifications panel ──────────────────────────────────── */
function NotificationsPanel() {
  const [email, setEmail] = useState({ streams: true, downloads: true, comments: false, digest: true, payout: true });
  return (
    <div className="s-panel">
      <div className="s-panel-header"><h2>Notifications</h2><p>Choose what Reef sends you</p></div>
      <div className="s-card glass">
        <SectionHeading>Email Alerts</SectionHeading>
        {[
          { key: 'streams',   label: 'New stream milestones',    hint: 'When your track hits 1K, 10K, 100K streams' },
          { key: 'downloads', label: 'DJ download notifications', hint: 'Each time someone downloads your track'      },
          { key: 'comments',  label: 'Listener comments',        hint: 'When listeners leave feedback'               },
          { key: 'digest',    label: 'Weekly performance digest', hint: 'Summary of your stats every Monday'         },
          { key: 'payout',    label: 'Payout processed',         hint: 'When your monthly payout is sent',          noBorder: true },
        ].map(({ key, label, hint, noBorder: nb }) => (
          <SettingRow key={key} label={label} hint={hint} noBorder={nb}>
            <Toggle value={email[key]} onChange={v => setEmail(p => ({ ...p, [key]: v }))} />
          </SettingRow>
        ))}
      </div>
    </div>
  );
}

/* ── Distribution panel ───────────────────────────────────── */
function DistributionPanel() {
  const [st, setSt] = useState({ worldwide: true, downloads: true, vinyl: false, hifiOnly: false });
  return (
    <div className="s-panel">
      <div className="s-panel-header"><h2>Distribution</h2><p>Control where and how your music is available</p></div>
      <div className="s-card glass">
        <SectionHeading>Availability</SectionHeading>
        <SettingRow label="Worldwide Streaming" hint="Available to all Reef subscribers globally">
          <Toggle value={st.worldwide} onChange={v => setSt(p => ({ ...p, worldwide: v }))} />
        </SettingRow>
        <SettingRow label="DJ Downloads Enabled" hint="Allow licensed downloads in professional formats">
          <Toggle value={st.downloads} onChange={v => setSt(p => ({ ...p, downloads: v }))} />
        </SettingRow>
        <SettingRow label="Vinyl Shop Listing" hint="List your releases in the Reef physical shop">
          <Toggle value={st.vinyl} onChange={v => setSt(p => ({ ...p, vinyl: v }))} />
        </SettingRow>
        <SettingRow label="Hi-Fi Listeners Only" hint="Restrict to verified audiophile subscribers" noBorder>
          <Toggle value={st.hifiOnly} onChange={v => setSt(p => ({ ...p, hifiOnly: v }))} />
        </SettingRow>
      </div>
    </div>
  );
}

/* ── Privacy panel ────────────────────────────────────────── */
function PrivacyPanel() {
  const [st, setSt] = useState({ publicStats: false, publicCatalog: true, showLocation: true, showFollowers: true });
  return (
    <div className="s-panel">
      <div className="s-panel-header"><h2>Privacy</h2><p>Control your public visibility on Reef</p></div>
      <div className="s-card glass">
        <SectionHeading>Public Profile</SectionHeading>
        <SettingRow label="Public Catalog" hint="Anyone can browse your releases">
          <Toggle value={st.publicCatalog} onChange={v => setSt(p => ({ ...p, publicCatalog: v }))} />
        </SettingRow>
        <SettingRow label="Show Stream Stats" hint="Display stream counts publicly on your artist page">
          <Toggle value={st.publicStats} onChange={v => setSt(p => ({ ...p, publicStats: v }))} />
        </SettingRow>
        <SettingRow label="Show Location" hint="Display your city/country on your profile">
          <Toggle value={st.showLocation} onChange={v => setSt(p => ({ ...p, showLocation: v }))} />
        </SettingRow>
        <SettingRow label="Show Follower Count" noBorder>
          <Toggle value={st.showFollowers} onChange={v => setSt(p => ({ ...p, showFollowers: v }))} />
        </SettingRow>
      </div>
    </div>
  );
}

/* ── Billing panel ────────────────────────────────────────── */
function BillingPanel() {
  const [bankName,    setBankName]    = useState('');
  const [iban,        setIban]        = useState('');
  const [bic,         setBic]         = useState('');
  const [street,      setStreet]      = useState('');
  const [city,        setCity]        = useState('');
  const [postcode,    setPostcode]    = useState('');
  const [country,     setCountry]     = useState('');
  const [cardNum,     setCardNum]     = useState('');
  const [cardExpiry,  setCardExpiry]  = useState('');
  const [cardCvv,     setCardCvv]     = useState('');
  const [saveCard,    setSaveCard]    = useState(false);
  const [saved,       setSaved]       = useState(false);

  const handleSave = () => { setSaved(true); setTimeout(() => setSaved(false), 2500); };

  return (
    <div className="s-panel">
      <div className="s-panel-header">
        <h2>Billing</h2>
        <p>Manage your payment methods and billing details</p>
      </div>

      {/* Current plan */}
      <div className="s-card glass">
        <div className="s-plan-display">
          <div className="s-plan-name">Creator Standard</div>
          <div className="s-plan-price">Free during beta</div>
          <div className="s-plan-desc">70/30 revenue split · Worldwide streaming · Downloads</div>
        </div>
      </div>

      {/* Bank transfer */}
      <div className="s-card glass">
        <SectionHeading>Bank Transfer Details</SectionHeading>
        <div className="s-billing-fields">
          <div className="s-billing-field">
            <label>Bank Name</label>
            <input type="text" value={bankName} onChange={e=>setBankName(e.target.value)} placeholder="e.g. Deutsche Bank" />
          </div>
          <div className="s-billing-field">
            <label>IBAN</label>
            <input type="text" value={iban} onChange={e=>setIban(e.target.value)} placeholder="DE89 3704 0044 0532 0130 00" />
          </div>
          <div className="s-billing-field">
            <label>BIC / SWIFT</label>
            <input type="text" value={bic} onChange={e=>setBic(e.target.value)} placeholder="DEUTDEDB" />
          </div>
        </div>
        <SectionHeading>Billing Address</SectionHeading>
        <div className="s-billing-fields">
          <div className="s-billing-field s-billing-field--full">
            <label>Street & Number</label>
            <input type="text" value={street} onChange={e=>setStreet(e.target.value)} placeholder="Musterstraße 12" />
          </div>
          <div className="s-billing-field">
            <label>City</label>
            <input type="text" value={city} onChange={e=>setCity(e.target.value)} placeholder="Berlin" />
          </div>
          <div className="s-billing-field">
            <label>Postcode</label>
            <input type="text" value={postcode} onChange={e=>setPostcode(e.target.value)} placeholder="10115" />
          </div>
          <div className="s-billing-field s-billing-field--full">
            <label>Country</label>
            <input type="text" value={country} onChange={e=>setCountry(e.target.value)} placeholder="Germany" />
          </div>
        </div>
      </div>

      {/* Card */}
      <div className="s-card glass">
        <SectionHeading>Card Payment</SectionHeading>
        <div className="s-billing-fields">
          <div className="s-billing-field s-billing-field--full">
            <label>Card Number</label>
            <input type="text" value={cardNum} onChange={e=>setCardNum(e.target.value)} placeholder="•••• •••• •••• ••••" maxLength={19} />
          </div>
          <div className="s-billing-field">
            <label>Expiry</label>
            <input type="text" value={cardExpiry} onChange={e=>setCardExpiry(e.target.value)} placeholder="MM / YY" maxLength={7} />
          </div>
          <div className="s-billing-field">
            <label>CVV</label>
            <input type="password" value={cardCvv} onChange={e=>setCardCvv(e.target.value)} placeholder="•••" maxLength={4} />
          </div>
        </div>
        <SettingRow label="Save card for future payouts" noBorder>
          <Toggle value={saveCard} onChange={setSaveCard} />
        </SettingRow>
      </div>

      {/* Digital payments */}
      <div className="s-card glass">
        <SectionHeading>Digital Payment Methods</SectionHeading>
        <div className="s-digital-pay-grid">
          <button className="s-dpay-btn s-dpay-btn--apple">
            <span className="s-dpay-logo">🍎</span>
            <span>Apple Pay</span>
          </button>
          <button className="s-dpay-btn s-dpay-btn--google">
            <span className="s-dpay-logo">G</span>
            <span>Google Pay</span>
          </button>
          <button className="s-dpay-btn s-dpay-btn--paypal">
            <span className="s-dpay-logo" style={{color:'#003087',fontWeight:900}}>P</span>
            <span>PayPal</span>
          </button>
        </div>
        <p className="s-dpay-note">Digital payment methods are used for receiving payouts. Connect your account to enable.</p>
      </div>

      <div className="s-billing-actions">
        {saved && <span className="s-billing-saved"><CheckCircle2 size={13}/> Saved</span>}
        <button className="s-save-btn" onClick={handleSave}>Save Billing Info</button>
      </div>
    </div>
  );
}

/* ─── Main Settings page ─────────────────────────────────── */
export default function Settings() {
  const [active, setActive] = useState('dashboard');
  const { user } = useAuth();

  const panels = {
    account:       <AccountPanel user={user} />,
    appearance:    <AppearancePanel />,
    dashboard:     <DashboardPanel />,
    notifications: <NotificationsPanel />,
    distribution:  <DistributionPanel />,
    privacy:       <PrivacyPanel />,
    billing:       <BillingPanel />,
  };

  return (
    <div className="settings-page animate-in">
      {/* Left nav */}
      <aside className="settings-nav glass">
        <div className="settings-nav-title">Settings</div>
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`settings-nav-item ${active === id ? 'active' : ''}`}
            onClick={() => setActive(id)}
          >
            <Icon size={16} strokeWidth={1.8} />
            <span>{label}</span>
            <ChevronRight size={12} className="s-nav-chevron" />
          </button>
        ))}
      </aside>

      {/* Right content */}
      <div className="settings-content">
        {panels[active]}
      </div>
    </div>
  );
}
