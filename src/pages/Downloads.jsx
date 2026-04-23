import { useState, useMemo } from 'react';
import { Download, Search, ChevronUp, ChevronDown, FileAudio, X } from 'lucide-react';
import './Downloads.css';

const mockDownloads = [
  { id: 'd1',  title: 'Phantom Grid — Full Album',           artist: 'Phantom Grid',     format: 'WAV', size: '412 MB', date: '2025-04-18', type: 'Album'     },
  { id: 'd2',  title: 'Aura System — Live at Fabric',        artist: 'Aura System',      format: 'WAV', size: '188 MB', date: '2025-04-01', type: 'Mix'       },
  { id: 'd3',  title: 'Nocturnal Axis — Dissolution EP',     artist: 'Nocturnal Axis',   format: 'MP3', size: '64 MB',  date: '2025-03-22', type: 'EP'        },
  { id: 'd4',  title: 'Obsidian Records — Compilation Vol.3',artist: 'Obsidian Records', format: 'FLAC',size: '820 MB', date: '2025-03-10', type: 'Compilation'},
  { id: 'd5',  title: 'The Null Pointer — Error State',      artist: 'The Null Pointer', format: 'WAV', size: '290 MB', date: '2025-02-14', type: 'Album'     },
  { id: 'd6',  title: 'Velvet Corridor — Single',            artist: 'Velvet Corridor',  format: 'MP3', size: '12 MB',  date: '2025-01-31', type: 'Single'    },
  { id: 'd7',  title: 'Silt & Echo — Broadcast Mix',         artist: 'Silt & Echo',      format: 'WAV', size: '234 MB', date: '2024-12-19', type: 'Mix'       },
  { id: 'd8',  title: 'Mirrorform — Negative Space LP',      artist: 'Mirrorform',       format: 'FLAC',size: '1.1 GB', date: '2024-11-07', type: 'Album'     },
  { id: 'd9',  title: 'Drone Signal — Frequency Studies',    artist: 'Drone Signal',     format: 'WAV', size: '560 MB', date: '2024-10-02', type: 'Album'     },
  { id: 'd10', title: 'Pale Current — Soft Architecture',    artist: 'Pale Current',     format: 'MP3', size: '78 MB',  date: '2024-09-15', type: 'EP'        },
];

const FORMAT_COLOUR = {
  WAV:  'var(--text-primary)',
  FLAC: 'var(--orange-400, #f97316)',
  MP3:  'var(--text-muted)',
};

export default function Downloads() {
  const [query,    setQuery]  = useState('');
  const [sortDesc, setSort]   = useState(true);   // true = newest first
  const [searching, setSearching] = useState(false);

  const list = useMemo(() => {
    let arr = mockDownloads;
    if (query.trim()) {
      const q = query.toLowerCase();
      arr = arr.filter(d =>
        d.title.toLowerCase().includes(q) ||
        d.artist.toLowerCase().includes(q) ||
        d.format.toLowerCase().includes(q) ||
        d.type.toLowerCase().includes(q)
      );
    }
    return sortDesc ? [...arr].reverse() : arr;
  }, [query, sortDesc]);

  return (
    <div className="page downloads-page animate-in">

      {/* ── Header bar ── */}
      <div className="dl-header">
        <div className="dl-header-left">
          <Download size={17} strokeWidth={1.6} />
          <h1>Downloads</h1>
          <span className="dl-count">{mockDownloads.length}</span>
        </div>

        <div className="dl-header-right">
          {/* Expandable search */}
          <div className={`dl-search-wrap${searching ? ' open' : ''}`}>
            {searching && (
              <input
                className="dl-search-input"
                type="text"
                placeholder="Search downloads…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoFocus
              />
            )}
            <button
              className="dl-icon-btn"
              onClick={() => { setSearching(s => !s); if (searching) setQuery(''); }}
              title={searching ? 'Close search' : 'Search'}
            >
              {searching ? <X size={16} /> : <Search size={16} />}
            </button>
          </div>

          {/* Sort toggle */}
          <button className="dl-sort-btn" onClick={() => setSort(s => !s)}>
            {sortDesc ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
            <span>{sortDesc ? 'Newest' : 'Oldest'}</span>
          </button>
        </div>
      </div>

      {/* ── List ── */}
      {list.length === 0 ? (
        <div className="dl-empty">
          <FileAudio size={36} strokeWidth={1.2} style={{ opacity: 0.25 }} />
          <p>No downloads match your search.</p>
        </div>
      ) : (
        <div className="dl-list">
          {list.map(d => (
            <div key={d.id} className="dl-row glass">
              <div className="dl-icon-wrap">
                <FileAudio size={20} strokeWidth={1.4} />
              </div>

              <div className="dl-body">
                <div className="dl-title">{d.title}</div>
                <div className="dl-meta">
                  <span>{d.artist}</span>
                  <span className="dl-dot">·</span>
                  <span>{d.type}</span>
                  <span className="dl-dot">·</span>
                  <span>{new Date(d.date).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
              </div>

              <div className="dl-right">
                <span className="dl-format" style={{ color: FORMAT_COLOUR[d.format] }}>{d.format}</span>
                <span className="dl-size">{d.size}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
