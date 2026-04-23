import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Download, Disc3, DollarSign, FileText, Lock, RefreshCw,
         MessageSquare, CheckCircle2, Send, ArrowDownToLine,
         Percent, Clock, Wallet, BarChart3 as BarChart3Icon } from 'lucide-react';
import { dashboardData } from '../data/mockData';
import { useAuth } from '../contexts/AuthContext';
import { useDashboardPrefs } from '../hooks/useDashboardPrefs';
import './Dashboard.css';

/* ─── Constants ──────────────────────────────────────────── */
const TABS            = ['Overview', 'Payout', 'Notifications', 'Contract'];
const PERIODS         = ['Day', 'Week', 'Month', 'Year'];
const CHART_METRICS   = ['Streams', 'Downloads', 'Vinyl', 'Revenue', 'All'];

/* ─── Accent colours ─────────────────────────────────────── */
const ACCENTS = {
  orange:  { main:'rgba(255,107,26,0.95)',  mid:'rgba(255,107,26,0.32)', zero:'rgba(255,107,26,0)' },
  violet:  { main:'rgba(155,109,255,0.95)', mid:'rgba(155,109,255,0.32)', zero:'rgba(155,109,255,0)' },
  blue:    { main:'rgba(41,182,246,0.95)',  mid:'rgba(41,182,246,0.32)', zero:'rgba(41,182,246,0)' },
  emerald: { main:'rgba(80,200,120,0.95)',  mid:'rgba(80,200,120,0.32)', zero:'rgba(80,200,120,0)' },
  rose:    { main:'rgba(244,63,94,0.95)',   mid:'rgba(244,63,94,0.32)', zero:'rgba(244,63,94,0)' },
};

const METRIC_COLORS = {
  Streams:   'rgba(255,107,26,0.9)',
  Downloads: 'rgba(41,182,246,0.9)',
  Vinyl:     'rgba(155,109,255,0.9)',
  Revenue:   'rgba(80,200,120,0.9)',
};

// Default color name per metric (used when no user pref set)
const DEFAULT_MK = {
  streams:   'orange',
  downloads: 'blue',
  vinyl:     'violet',
  revenue:   'emerald',
};

/* ─── Track catalogue ────────────────────────────────────── */
const TRACKS = ['Night Drift','Phosphene','Mineral','Coral Sleep','Abyssal','Pelagic','Strandline','Thermocline','Benthic','Crepuscular'];

/* ─── KPI mock data ──────────────────────────────────────── */
const mk = (vals, extras) => vals.map((v, i) => ({ title: TRACKS[i], val: v, ...extras?.[i] })).filter(t => t.val > 0);

const KPI_DATA = {
  streams: {
    Day:   { total: 3892,   top: mk([1240,890,650,480,380,290,210,180,140,90]) },
    Week:  { total: 21400,  top: mk([7800,4200,3100,2400,1900,1400,1100,860,640,480]) },
    Month: { total: 86200,  top: mk([28400,19800,15600,11200,8400,6200,4800,3400,2600,1800]) },
    Year:  { total: 392000, top: mk([128000,82000,68000,48000,36000,24000,18000,12000,8000,5000]) },
  },
  downloads: {
    Day:   { total: 42,   top: mk([18,12,8,6,4,2,1,1,0,0]) },
    Week:  { total: 187,  top: mk([82,54,32,28,18,12,8,5,3,1]) },
    Month: { total: 734,  top: mk([294,198,142,108,68,42,28,18,12,8]) },
    Year:  { total: 4820, top: mk([1840,1240,880,640,420,280,180,120,80,50]) },
  },
  vinyl: {
    Day:   { total: 5,   top: mk([2,1,1,1,0,0,0,0,0,0]) },
    Week:  { total: 28,  top: mk([9,5,4,3,2,1,1,1,1,1]) },
    Month: { total: 97,  top: mk([28,18,12,9,7,5,3,2,2,1]) },
    Year:  { total: 552, top: mk([124,82,56,42,28,18,12,8,6,4]) },
  },
  revenue: {
    Day:   { total: 124.50,   breakdown: { streams: 45.20,   downloads: 62.40,   vinyl: 16.90  }, top: mk([42.80,28.40,18.20,12.60,8.40,5.80,3.60,2.20,1.80,0.70]) },
    Week:  { total: 842.30,   breakdown: { streams: 310.80,  downloads: 412.60,  vinyl: 118.90 }, top: mk([268.40,182.60,124.40,94.20,64.80,42.20,28.40,18.60,12.40,5.20]) },
    Month: { total: 3284.00,  breakdown: { streams: 1210.60, downloads: 1640.80, vinyl: 432.60 }, top: mk([980.60,640.80,480.40,340.20,248.60,162.40,108.20,68.40,42.60,18.80]) },
    Year:  { total: 24800.00, breakdown: { streams: 9200.00, downloads: 12400.00,vinyl: 3200.00}, top: mk([4240.00,2840.00,2120.00,1540.00,1080.00,720.00,480.00,320.00,200.00,120.00]) },
  },
};

/* ─── Chart time-series data ──────────────────────────────── */
const CHART_DATA = {
  Streams:   {
    Day:   { labels:['0h','4h','8h','12h','16h','20h','24h'], values:[80,55,240,890,640,1020,460] },
    Week:  { labels:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], values:[2400,2100,2800,3200,2900,4100,3700] },
    Month: { labels:['W1','W2','W3','W4','W5','W6','W7','W8','W9','W10','W11','W12'], values:[14000,12800,15600,18200,16800,21400,19800,23000,21600,26000,24400,28400] },
    Year:  { labels:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], values:[18000,22000,19500,28400,24000,32000,38000,35000,42000,39000,44000,52000] },
  },
  Downloads: {
    Day:   { labels:['0h','4h','8h','12h','16h','20h','24h'], values:[2,1,4,18,12,8,6] },
    Week:  { labels:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], values:[18,22,26,34,28,42,38] },
    Month: { labels:['W1','W2','W3','W4','W5','W6','W7','W8','W9','W10','W11','W12'], values:[42,38,54,68,60,82,74,92,84,102,98,120] },
    Year:  { labels:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], values:[180,240,210,340,280,420,520,480,580,540,620,740] },
  },
  Vinyl:     {
    Day:   { labels:['0h','4h','8h','12h','16h','20h','24h'], values:[0,0,1,2,1,1,0] },
    Week:  { labels:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], values:[2,3,4,6,5,9,8] },
    Month: { labels:['W1','W2','W3','W4','W5','W6','W7','W8','W9','W10','W11','W12'], values:[4,5,7,9,8,12,10,14,12,16,15,18] },
    Year:  { labels:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], values:[18,24,21,36,30,44,52,48,58,54,62,74] },
  },
  Revenue:   {
    Day:   { labels:['0h','4h','8h','12h','16h','20h','24h'], values:[4,2,8,32,22,28,18] },
    Week:  { labels:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], values:[68,82,94,120,108,164,148] },
    Month: { labels:['W1','W2','W3','W4','W5','W6','W7','W8','W9','W10','W11','W12'], values:[180,160,210,260,240,320,290,380,340,420,390,480] },
    Year:  { labels:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], values:[640,820,740,1080,960,1280,1520,1440,1820,1680,2040,2280] },
  },
};

/* ─── Formatters ─────────────────────────────────────────── */
function fmtBig(v)    { if(v>=1e6) return `${(v/1e6).toFixed(1)}M`; if(v>=1000) return `${(v/1000).toFixed(v>=10000?0:1)}k`; return v.toLocaleString(); }
function fmtEurFull(v){ return `€${v.toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:2})}`; }
function fmtEurAxis(v){ if(v>=1000) return `€${(v/1000).toFixed(1)}k`; return `€${Math.round(v)}`; }

/* ─── Chart ──────────────────────────────────────────────── */
function Chart({ period, chartStyle = 'line', accent = 'orange', metric = 'Streams', tall = false, metricColors }) {
  const col   = ACCENTS[accent] || ACCENTS.orange;
  const SVG_H = tall ? 180 : 130;
  const W     = 600;

  /* ── ALL mode — normalized multi-line ─────────────────── */
  if (metric === 'All') {
    const MKEYS  = ['Streams','Downloads','Vinyl','Revenue'];
    const labels = CHART_DATA.Streams[period].labels;
    const normalized = MKEYS.map(m => {
      const vals = CHART_DATA[m][period].values;
      const mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn || 1;
      return { m, vals: vals.map(v => (v-mn)/rng) };
    });
    const buildSpline = (vals) => {
      const pts = vals.map((v, i) => ({ x:(i/(vals.length-1))*W, y:(1-v)*SVG_H }));
      let p = `M ${pts[0].x} ${pts[0].y}`;
      for(let i=0;i<pts.length-1;i++){
        const dx=(pts[i+1].x-pts[i].x)*0.45;
        p+=` C ${pts[i].x+dx} ${pts[i].y} ${pts[i+1].x-dx} ${pts[i+1].y} ${pts[i+1].x} ${pts[i+1].y}`;
      }
      return p;
    };
    // Use user-selected per-metric colors if provided
    const getColor = (m) => {
      const key = m.toLowerCase();
      const colorName = metricColors?.[key] || DEFAULT_MK[key];
      return ACCENTS[colorName]?.main || METRIC_COLORS[m];
    };
    const yPcts = [0,0.25,0.5,0.75,1];
    return (
      <div className="chart-outer">
        <div className="chart-y-axis">
          {yPcts.map((f,i) => <span key={i}>{Math.round((1-f)*100)}%</span>)}
        </div>
        <div className="chart-inner">
          <svg viewBox={`0 0 ${W} ${SVG_H}`} className="line-chart-svg" preserveAspectRatio="none" style={{height:SVG_H}}>
            {yPcts.map((f,i)=><line key={i} x1="0" y1={f*SVG_H} x2={W} y2={f*SVG_H} stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>)}
            {normalized.map(({m,vals})=>(
              <path key={m} d={buildSpline(vals)} fill="none" stroke={getColor(m)} strokeWidth="1.8" strokeLinecap="round"/>
            ))}
          </svg>
          <div className="line-chart-labels">
            {labels.map(l=><span key={l}>{l}</span>)}
          </div>
          <div className="chart-legend">
            {MKEYS.map(m=>(
              <span key={m} className="chart-legend-item">
                <span className="chart-legend-dot" style={{background:METRIC_COLORS[m]}}/>
                {m}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ── Single metric ────────────────────────────────────── */
  const { labels, values } = CHART_DATA[metric][period];
  const min   = Math.min(...values);
  const max   = Math.max(...values);
  const range = max - min || 1;
  const isRev = metric === 'Revenue';
  const fmtY  = v => isRev ? fmtEurAxis(v) : fmtBig(v);

  const ySteps = 4;
  const yAxis  = Array.from({length:ySteps+1},(_,i)=>({
    frac: i/ySteps,
    val:  max - (i/ySteps)*range,
  }));

  /* Bar */
  if (chartStyle === 'bar') {
    const n=values.length, slotW=W/n, barW=slotW*0.55;
    const gradId=`barG-${accent}`;
    return (
      <div className="chart-outer">
        <div className="chart-y-axis">{yAxis.map(({val},i)=><span key={i}>{fmtY(val)}</span>)}</div>
        <div className="chart-inner">
          <svg viewBox={`0 0 ${W} ${SVG_H}`} className="line-chart-svg" preserveAspectRatio="none" style={{height:SVG_H}}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={col.main}/>
                <stop offset="100%" stopColor={col.mid}/>
              </linearGradient>
            </defs>
            {yAxis.map(({frac},i)=><line key={i} x1="0" y1={frac*SVG_H} x2={W} y2={frac*SVG_H} stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>)}
            {values.map((v,i)=>{
              const bH=Math.max(2,((v-min)/range)*SVG_H);
              return <rect key={i} x={i*slotW+(slotW-barW)/2} y={SVG_H-bH} width={barW} height={bH} rx="3" fill={`url(#${gradId})`}/>;
            })}
          </svg>
          <div className="line-chart-labels">{labels.map(l=><span key={l}>{l}</span>)}</div>
        </div>
      </div>
    );
  }

  /* Line / Area */
  const pts = values.map((v,i)=>({
    x:(i/(values.length-1))*W,
    y:(1-(v-min)/range)*SVG_H,
  }));
  let path=`M ${pts[0].x} ${pts[0].y}`;
  for(let i=0;i<pts.length-1;i++){
    const dx=(pts[i+1].x-pts[i].x)*0.45;
    path+=` C ${pts[i].x+dx} ${pts[i].y} ${pts[i+1].x-dx} ${pts[i+1].y} ${pts[i+1].x} ${pts[i+1].y}`;
  }
  const areaPath=`${path} L ${pts[pts.length-1].x} ${SVG_H} L ${pts[0].x} ${SVG_H} Z`;
  const gradId=`cG-${accent}-${metric}`;

  return (
    <div className="chart-outer">
      <div className="chart-y-axis">{yAxis.map(({val},i)=><span key={i}>{fmtY(val)}</span>)}</div>
      <div className="chart-inner">
        <svg viewBox={`0 0 ${W} ${SVG_H}`} className="line-chart-svg" preserveAspectRatio="none" style={{height:SVG_H}}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={col.mid}/>
              <stop offset="100%" stopColor={col.zero}/>
            </linearGradient>
          </defs>
          {yAxis.map(({frac},i)=><line key={i} x1="0" y1={frac*SVG_H} x2={W} y2={frac*SVG_H} stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>)}
          {chartStyle==='area' && <path d={areaPath} fill={`url(#${gradId})`}/>}
          <path d={path} fill="none" stroke={col.main} strokeWidth="2" strokeLinecap="round"/>
          {pts.map((pt,i)=><circle key={i} cx={pt.x} cy={pt.y} r="2.5" fill={col.main}/>)}
        </svg>
        <div className="line-chart-labels">{labels.map(l=><span key={l}>{l}</span>)}</div>
      </div>
    </div>
  );
}

/* ─── KPI Card ───────────────────────────────────────────── */
const KPI_CFG = {
  streams:   { icon:TrendingUp, label:'Total Streams', fmtT: v=>fmtBig(v),      fmtI: v=>fmtBig(v),        cls:'' },
  downloads: { icon:Download,   label:'Downloads',     fmtT: v=>fmtBig(v),      fmtI: v=>fmtBig(v),        cls:'' },
  vinyl:     { icon:Disc3,      label:'Vinyl Sold',    fmtT: v=>v.toLocaleString(), fmtI: v=>`${v} copies`, cls:'' },
  revenue:   { icon:DollarSign, label:'Total Revenue', fmtT: v=>fmtEurFull(v),  fmtI: v=>`€${v.toFixed(2)}`,cls:'highlight' },
};

function KpiCard({ type, layout, accent = 'orange' }) {
  const [period, setPeriod] = useState('Week');
  const isCompact  = layout === 'compact';
  const isDetailed = layout === 'detailed';
  const topN = isDetailed ? 10 : 3;
  const cfg  = KPI_CFG[type];
  const Icon = cfg.icon;
  const kd   = KPI_DATA[type][period];
  const col  = ACCENTS[accent] || ACCENTS.orange;

  const PeriodPills = () => (
    <div className="kpi-period-row">
      {PERIODS.map(p=>(
        <button key={p} className={`kpi-period-btn ${period===p?'active':''}`} onClick={()=>setPeriod(p)}>
          {p[0]}
        </button>
      ))}
    </div>
  );

  const TopList = ({ n }) => (
    <div className="kpi-top-list">
      {kd.top.slice(0,n).map((item,i)=>(
        <div key={i} className="kpi-top-item">
          <span className="kpi-rank">{i+1}</span>
          <span className="kpi-name">{item.title}</span>
          <span className="kpi-top-val">{cfg.fmtI(item.val)}</span>
        </div>
      ))}
    </div>
  );

  const RevBreakdown = () => (
    <div className="kpi-rev-breakdown">
      <div className="kpi-rev-row"><span>Streams</span><span>€{kd.breakdown.streams.toFixed(2)}</span></div>
      <div className="kpi-rev-row"><span>Downloads</span><span>€{kd.breakdown.downloads.toFixed(2)}</span></div>
      <div className="kpi-rev-row last"><span>Vinyl</span><span>€{kd.breakdown.vinyl.toFixed(2)}</span></div>
    </div>
  );

  /* Detailed — horizontal layout */
  if (isDetailed) {
    return (
      <div
        className={`dash-stat-card glass kpi-card kpi-detailed-card ${cfg.cls}`}
        style={{ '--dash-accent': col.main, '--dash-accent-mid': col.mid }}
      >
        <div className="kpi-detail-left">
          <PeriodPills />
          <div className="dash-stat-icon"><Icon size={22}/></div>
          <div className="dash-stat-val">{cfg.fmtT(kd.total)}</div>
          <div className="dash-stat-label">{cfg.label}</div>
          {type==='revenue' && <RevBreakdown/>}
        </div>
        <div className="kpi-detail-right">
          <div className="kpi-top-list-hdr">Top {Math.min(topN,kd.top.length)}</div>
          <TopList n={topN}/>
        </div>
      </div>
    );
  }

  /* Standard / compact */
  return (
    <div
      className={`dash-stat-card glass kpi-card ${cfg.cls}`}
      style={{ '--dash-accent': col.main, '--dash-accent-mid': col.mid }}
    >
      <div className="kpi-card-top">
        <div className="dash-stat-icon"><Icon size={18}/></div>
        <PeriodPills/>
      </div>
      <div className="dash-stat-val">{cfg.fmtT(kd.total)}</div>
      <div className="dash-stat-label">{cfg.label}</div>
      {type==='revenue' && !isCompact && <RevBreakdown/>}
      {!isCompact && <TopList n={topN}/>}
    </div>
  );
}

/* ─── Dashboard ──────────────────────────────────────────── */
/* ─── NotificationsTab ─────────────────────────────────── */
const MOCK_NOTIFS = [
  { id:1, title:'Night Drift hit 10K streams!', body:'Your track Night Drift just crossed 10,000 streams. Keep it up.', date:'Apr 15 2026', type:'milestone', read:false },
  { id:2, title:'New release sent to followers', body:'Your release “Phosphene EP” was shared to 8.3K followers.', date:'Apr 12 2026', type:'release', read:false },
  { id:3, title:'Payout processed', body:'Your April payout of €{842.30} has been sent to your bank account.', date:'Apr 1 2026', type:'payout', read:true },
  { id:4, title:'Vinyl order placed', body:'3 copies of “Mineral” vinyl sold via the Reef Shop.', date:'Mar 28 2026', type:'sale', read:true },
  { id:5, title:'Weekly digest ready', body:'Your week in stats: 21,400 streams, 187 downloads, €842 revenue.', date:'Mar 24 2026', type:'digest', read:true },
  { id:6, title:'Coral Sleep → 5K streams', body:'Your track Coral Sleep is growing — 5,000 streams this month.', date:'Mar 20 2026', type:'milestone', read:true },
  { id:7, title:'New follower milestone', body:'You now have 8,300 followers on Reef. Thank you!', date:'Mar 15 2026', type:'milestone', read:true },
  { id:8, title:'Contract renewal reminder', body:'Your creator contract renews in 30 days. No action needed unless you wish to upgrade.', date:'Mar 10 2026', type:'contract', read:true },
];

const NOTIF_ICONS = { milestone:TrendingUp, release:Disc3, payout:Wallet, sale:DollarSign, digest:BarChart3Icon, contract:FileText };


function NotificationsTab({ followers }) {
  const [notifs, setNotifs] = useState(MOCK_NOTIFS);
  const [title, setTitle]   = useState('');
  const [msg,   setMsg]     = useState('');
  const [sent,  setSent]    = useState(false);

  const handleSend = () => {
    if (!title.trim()) return;
    const newN = { id: Date.now(), title, body: msg, date: new Date().toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'}), type:'release', read:false };
    setNotifs(p => [newN, ...p]);
    setTitle(''); setMsg(''); setSent(true);
    setTimeout(() => setSent(false), 2500);
  };

  const markAllRead = () => setNotifs(p => p.map(n => ({ ...n, read:true })));
  const toggleRead  = id => setNotifs(p => p.map(n => n.id===id ? {...n,read:!n.read} : n));
  const unread = notifs.filter(n => !n.read).length;

  return (
    <div>
      {/* Send form */}
      <div className="notif-form glass">
        <div className="dash-section-title">Send to {(followers/1000).toFixed(1)}K Followers</div>
        <input type="text" placeholder="Notification title..." value={title} onChange={e=>setTitle(e.target.value)}/>
        <textarea placeholder="Message (e.g. new release, upcoming show)..." rows={3} value={msg} onChange={e=>setMsg(e.target.value)} style={{resize:'vertical'}}/>
        <button className="notif-send-btn" onClick={handleSend}>
          <Send size={14}/> {sent ? 'Sent ✓' : 'Send Notification'}
        </button>
      </div>

      {/* History */}
      <div className="notif-history-header">
        <div className="dash-section-title">Notification History</div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          {unread > 0 && <span className="notif-unread-badge">{unread} unread</span>}
          <button className="notif-mark-all" onClick={markAllRead}>Mark all read</button>
        </div>
      </div>
      <div className="notif-feed">
        {notifs.map((n, i) => {
          const Icon = NOTIF_ICONS[n.type] || TrendingUp;
          return (
            <div key={n.id} className={`notif-item glass ${n.read ? '' : 'notif-unread'}`} onClick={() => toggleRead(n.id)}>
              <div className="notif-timeline-line" style={{opacity: i < notifs.length-1 ? 1 : 0}}/>
              <div className="notif-item-icon"><Icon size={14}/></div>
              <div className="notif-item-body">
                <div className="notif-item-title">{n.title}</div>
                <div className="notif-item-text">{n.body}</div>
                <div className="notif-item-date">{n.date}</div>
              </div>
              {!n.read && <div className="notif-dot"/>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── ContractTab ───────────────────────────────────── */
function ContractTab() {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [dlFlash,      setDlFlash]      = useState(false);
  const [feedSubj,     setFeedSubj]     = useState('');
  const [feedMsg,      setFeedMsg]      = useState('');
  const [feedSent,     setFeedSent]     = useState(false);

  const handleDownload = () => {
    setDlFlash(true);
    setTimeout(() => setDlFlash(false), 2000);
  };
  const handleFeedSend = () => {
    setFeedSent(true);
    setFeedSubj(''); setFeedMsg('');
    setTimeout(() => { setFeedSent(false); setFeedbackOpen(false); }, 2500);
  };

  return (
    <div className="contract-section">
      <div className="contract-card glass">
        <FileText size={32}/>
        <div><div className="contract-status-label">Contract Status</div><div className="contract-status-val">Active — Standard Plan (70/30)</div></div>
      </div>

      <div className="contract-terms glass">
        <div className="dash-section-title">Your Contract Terms</div>
        {[['Revenue Split','70% Artist — 30% Reef'],['Exclusivity','Non-Exclusive (multi-platform)'],
          ['Payout Frequency','Monthly (net 60)'],['Download Rights','Enabled'],
          ['Physical Sales','Enabled via Reef Shop'],['Contract Term','Rolling — 30 days notice to cancel']
        ].map(([k,v]) => <div key={k} className="contract-term"><span>{k}</span><span>{v}</span></div>)}
      </div>

      {/* Action buttons */}
      <div className="contract-actions">
        <button className="contract-action-btn" onClick={handleDownload}>
          <ArrowDownToLine size={15}/>
          {dlFlash ? 'Downloading…' : 'Download PDF'}
        </button>
        <button className="contract-action-btn contract-action-btn--ghost" onClick={() => setFeedbackOpen(o=>!o)}>
          <MessageSquare size={15}/> Feedback / Contact
        </button>
      </div>

      {/* Inline feedback form */}
      {feedbackOpen && (
        <div className="contract-feedback glass">
          <div className="dash-section-title">Send Feedback</div>
          {feedSent ? (
            <div className="contract-feedback-sent"><CheckCircle2 size={18}/> Message sent — we'll get back to you shortly.</div>
          ) : (
            <>
              <input type="text" placeholder="Subject (e.g. contract question, feature request…)" value={feedSubj} onChange={e=>setFeedSubj(e.target.value)}/>
              <textarea rows={4} placeholder="Your message…" value={feedMsg} onChange={e=>setFeedMsg(e.target.value)} style={{resize:'vertical'}}/>
              <button className="notif-send-btn" onClick={handleFeedSend}><Send size={14}/> Send</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { prefs }       = useDashboardPrefs();
  const [activeTab, setActiveTab]       = useState(prefs.defaultTab    || 'Overview');
  const [period, setPeriod]             = useState(prefs.defaultPeriod || 'Week');
  const [chartMetric, setChartMetric]   = useState(prefs.chartMetric   || 'Streams');
  const [refreshKey, setRefreshKey]     = useState(0);
  const { user } = useAuth();

  const d           = dashboardData;
  const displayName = user?.artistName || user?.name || 'Admin';

  /* Sync from settings */
  useEffect(() => { setActiveTab  (prefs.defaultTab    || 'Overview'); }, [prefs.defaultTab]);
  useEffect(() => { setPeriod     (prefs.defaultPeriod || 'Week');     }, [prefs.defaultPeriod]);
  useEffect(() => { setChartMetric(prefs.chartMetric   || 'Streams');  }, [prefs.chartMetric]);

  /* Auto-refresh */
  useEffect(() => {
    if (prefs.autoRefresh === 'off') return;
    const ms    = prefs.autoRefresh === '5min' ? 300_000 : 900_000;
    const timer = setInterval(() => setRefreshKey(k=>k+1), ms);
    return () => clearInterval(timer);
  }, [prefs.autoRefresh]);

  const accent     = prefs.accentColor || 'orange';
  const col        = ACCENTS[accent]   || ACCENTS.orange;
  const layout     = prefs.layout      || 'standard';
  const isDetailed = layout === 'detailed';
  const gridClass  = layout === 'compact' ? 'dash-stats-grid--compact'
                   : layout === 'detailed' ? 'dash-stats-grid--detailed'
                   : 'dash-stats-grid--standard';

  const visibleTabs = TABS.filter(t => t !== 'Payout' || prefs.showPayout !== false);
  const resolvedTab = visibleTabs.includes(activeTab) ? activeTab : visibleTabs[0];

  return (
    <div
      key={refreshKey}
      className={`page dashboard-page animate-in`}
      style={{ '--dash-accent': col.main, '--dash-accent-mid': col.mid }}
    >
      {/* ── Header ── */}
      <div className="dash-artist-header">
        <div className="dash-artist-avatar">{displayName[0].toUpperCase()}</div>
        <div className="dash-artist-info">
          <h1>{displayName}</h1>
          <p>{d.artist.genre} · {d.artist.location}</p>
        </div>
        <div className="dash-header-right">
          {prefs.autoRefresh !== 'off' && (
            <div className="dash-refresh-badge glass-sm">
              <RefreshCw size={11}/> Auto {prefs.autoRefresh}
            </div>
          )}
          <div className="dash-contract-status glass-sm">
            <FileText size={14}/>
            <span>{d.contractStatus}</span>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="dash-tabs">
        {visibleTabs.map(tab=>(
          <button key={tab} className={`dash-tab ${resolvedTab===tab?'active':''}`} onClick={()=>setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </div>

      {/* ══ Overview ══════════════════════════════════════════ */}
      {resolvedTab === 'Overview' && (
        <div>
          {/* KPI cards */}
          {prefs.showKpis !== false && (
            <div className={`dash-stats-grid ${gridClass}`}>
              <KpiCard type="streams"   layout={layout} accent={prefs.metricColors?.streams   || 'orange'}/>
              <KpiCard type="downloads" layout={layout} accent={prefs.metricColors?.downloads || 'blue'}/>
              <KpiCard type="vinyl"     layout={layout} accent={prefs.metricColors?.vinyl     || 'violet'}/>
              <KpiCard type="revenue"   layout={layout} accent={prefs.metricColors?.revenue   || 'emerald'}/>
            </div>
          )}

          {/* Chart */}
          {prefs.showChart !== false && (
            <div className="dash-chart-card glass">
              <div className="dash-chart-header">
                <div className="dash-section-title">Stats Over Time</div>
                <div className="chart-controls">
                  <div className="period-filter">
                    {CHART_METRICS.map(m=>(
                      <button key={m} className={`period-btn ${chartMetric===m?'active':''}`} onClick={()=>setChartMetric(m)}>{m}</button>
                    ))}
                  </div>
                  <div className="period-filter">
                    {PERIODS.map(p=>(
                      <button key={p} className={`period-btn ${period===p?'active':''}`} onClick={()=>setPeriod(p)}>{p}</button>
                    ))}
                  </div>
                </div>
              </div>
              <Chart
                period={period}
                chartStyle={prefs.chartStyle || 'line'}
                accent={prefs.metricColors?.[chartMetric.toLowerCase()] || prefs.accentColor || 'orange'}
                metric={chartMetric}
                metricColors={prefs.metricColors}
                tall={isDetailed}
              />
            </div>
          )}

          {/* Top tracks */}
          {prefs.showTopTracks !== false && (
            <div className="dash-top-tracks">
              <div className="dash-section-title">Top Performing Tracks</div>
              <div className="dash-track-list">
                {d.topTracks.slice(0, isDetailed ? d.topTracks.length : layout==='compact' ? 3 : 5).map((t,i)=>(
                  <div key={t.id} className="dash-track-row glass">
                    <div className="dash-track-num">{i+1}</div>
                    <div className="dash-track-info">
                      <div className="dash-track-title">{t.title}</div>
                      <div className="dash-track-stats">{t.streams.toLocaleString()} streams · {t.downloads} downloads</div>
                    </div>
                    <div className="dash-track-revenue">€{t.revenue}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detailed: inline payout summary */}
          {isDetailed && prefs.showPayout !== false && (
            <div className="payout-breakdown glass dash-detail-payout">
              <div className="dash-section-title">Revenue Breakdown — {period}</div>
              <div className="payout-rows">
                <div className="payout-row"><span>Subscriber Revenue</span><span className="payout-row-val">€{d.monthlyRevenue.toFixed(2)}</span></div>
                <div className="payout-row"><span>Reef Share (30%)</span><span className="payout-row-val">-€{(d.monthlyRevenue*0.3).toFixed(2)}</span></div>
                <div className="payout-row payout-row-total"><span>Your Earnings (70%)</span><span className="payout-row-val">€{(d.monthlyRevenue*0.7).toFixed(2)}</span></div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ Payout ════════════════════════════════════════════ */}
      {resolvedTab === 'Payout' && (
        <div>
          <div className="payout-how glass">
            <div className="payout-how-header">
              <Wallet size={20}/>
              <span>How Your Payout Is Calculated</span>
            </div>
            <p className="payout-explainer">
              Each subscriber's monthly fee is distributed based on what they <strong>actually listened to</strong>.
              If a listener spent 20% of their total listening time on your music, you receive 20% of the 70%
              revenue pool from that subscriber's subscription.
            </p>
            <div className="payout-steps">
              {[
                { n:1, Icon:Wallet,    label:'Total Subscription Fee',       val:`€${d.monthlyRevenue.toFixed(2)} / subscriber / month` },
                { n:2, Icon:Percent,   label:'Platform Payout Pool (70%)',   val:`€${(d.monthlyRevenue*0.7).toFixed(2)} available to artists` },
                { n:3, Icon:Clock,     label:'Your Share of Listening Time', val:'Your listening time ÷ Subscriber total listening time' },
                { n:4, Icon:TrendingUp,label:'Your Payout',                  val:'Your share × payout pool', highlight:true },
              ].map(({ n, Icon, label, val, highlight }, i, arr) => (
                <div key={n}>
                  <div className={`payout-step ${highlight ? 'payout-step--result' : ''}`}>
                    <div className="payout-step-num">{n}</div>
                    <div className="payout-step-icon"><Icon size={14}/></div>
                    <div className="payout-step-body">
                      <div className="payout-step-label">{label}</div>
                      <div className="payout-step-val">{val}</div>
                    </div>
                  </div>
                  {i < arr.length - 1 && <div className="payout-step-arrow">↓</div>}
                </div>
              ))}
            </div>
            <div className="payout-formula-pill">
              <code>Payout = (Your Time ÷ Subscriber Total Time) × 70% × Subscription Fee</code>
            </div>
          </div>

          <div className="payout-breakdown glass">
            <div className="dash-section-title">This Month's Breakdown — April 2026</div>
            <div className="payout-rows">
              <div className="payout-row"><span>Total Subscriber Revenue</span><span className="payout-row-val">€{d.monthlyRevenue.toFixed(2)}</span></div>
              <div className="payout-row"><span>Reef Share (30%)</span><span className="payout-row-val" style={{color:'rgba(244,63,94,0.8)'}}>-€{(d.monthlyRevenue*0.3).toFixed(2)}</span></div>
              <div className="payout-row payout-row-total"><span>Your Earnings (70%)</span><span className="payout-row-val">€{(d.monthlyRevenue*0.7).toFixed(2)}</span></div>
            </div>
            <div className="payout-pending-box"><span>Pending Payout (next banking cycle)</span><span className="payout-pending-val">€{d.payoutPending}</span></div>
          </div>

          <div className="exclusivity-card glass">
            <div className="excl-icon"><Lock size={28}/></div>
            <div><div className="excl-title">90/10 Exclusivity Deal — Available to You</div><div className="excl-desc">Remove your catalog from all other platforms. In return, keep 90% instead of 70%.</div></div>
            <button className="excl-btn">Apply →</button>
          </div>
        </div>
      )}

      {/* ══ Contract ══════════════════════════════════════════ */}
      {resolvedTab === 'Contract' && (
        <ContractTab />
      )}

    </div>
  );
}
