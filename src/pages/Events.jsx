import { useState, useMemo } from 'react';
import { Calendar, MapPin, Clock, Users, ExternalLink } from 'lucide-react';
import './Events.css';

const mockEvents = [
  {
    id: 'e1',
    title: 'Aura System — Live A/V Set',
    artist: 'Aura System',
    venue: 'Berghain',
    city: 'Berlin, DE',
    date: '2025-05-10',
    time: '23:00',
    genre: 'Techno',
    type: 'Club Night',
    price: '€18',
    capacity: 1500,
    attending: 312,
    image: null,
    initials: 'AS',
    sold_out: false,
  },
  {
    id: 'e2',
    title: 'Phantom Grid — Dissolution Tour',
    artist: 'Phantom Grid',
    venue: 'Fabric',
    city: 'London, UK',
    date: '2025-05-14',
    time: '22:00',
    genre: 'Electronic',
    type: 'Concert',
    price: '€22',
    capacity: 800,
    attending: 800,
    image: null,
    initials: 'PG',
    sold_out: true,
  },
  {
    id: 'e3',
    title: 'Nocturnal Axis b2b Velvet Corridor',
    artist: 'Nocturnal Axis & Velvet Corridor',
    venue: 'De School',
    city: 'Amsterdam, NL',
    date: '2025-05-17',
    time: '00:00',
    genre: 'Techno',
    type: 'Club Night',
    price: '€14',
    capacity: 600,
    attending: 198,
    image: null,
    initials: 'NA',
    sold_out: false,
  },
  {
    id: 'e4',
    title: 'Mirrorform — Negative Space LP Release',
    artist: 'Mirrorform',
    venue: 'Paloma Club',
    city: 'Brussels, BE',
    date: '2025-05-24',
    time: '21:00',
    genre: 'Ambient',
    type: 'Concert',
    price: '€12',
    capacity: 350,
    attending: 210,
    image: null,
    initials: 'MF',
    sold_out: false,
  },
  {
    id: 'e5',
    title: 'Drone Signal — Frequency Studies',
    artist: 'Drone Signal',
    venue: 'OT301',
    city: 'Amsterdam, NL',
    date: '2025-06-01',
    time: '20:00',
    genre: 'Experimental',
    type: 'Concert',
    price: '€10',
    capacity: 200,
    attending: 87,
    image: null,
    initials: 'DS',
    sold_out: false,
  },
  {
    id: 'e6',
    title: 'Obsidian Festival 2025',
    artist: 'Various Artists',
    venue: 'Parc de la Villette',
    city: 'Paris, FR',
    date: '2025-06-14',
    time: '14:00',
    genre: 'Various',
    type: 'Festival',
    price: '€65',
    capacity: 8000,
    attending: 3200,
    image: null,
    initials: 'OF',
    sold_out: false,
  },
  {
    id: 'e7',
    title: 'Pale Current — Soft Architecture Tour',
    artist: 'Pale Current',
    venue: 'Cabaret Sauvage',
    city: 'Paris, FR',
    date: '2025-06-20',
    time: '20:30',
    genre: 'Electronic',
    type: 'Concert',
    price: '€16',
    capacity: 500,
    attending: 341,
    image: null,
    initials: 'PC',
    sold_out: false,
  },
  {
    id: 'e8',
    title: 'Silt & Echo — Broadcast Live',
    artist: 'Silt & Echo',
    venue: 'Tresor',
    city: 'Berlin, DE',
    date: '2025-07-05',
    time: '23:59',
    genre: 'Techno',
    type: 'Club Night',
    price: '€15',
    capacity: 900,
    attending: 560,
    image: null,
    sold_out: false,
    initials: 'SE',
  },
];

const TYPE_FILTERS = ['All', 'Concert', 'Club Night', 'Festival'];

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

export default function Events() {
  const [typeFilter, setType] = useState('All');

  const filtered = useMemo(() =>
    mockEvents.filter(e => {
      if (typeFilter !== 'All' && e.type !== typeFilter) return false;
      return true;
    }),
  [typeFilter]);

  return (
    <div className="page events-page animate-in">

      {/* ── Filter chips (horizontal scroll) ── */}
      <div className="ev-filter-row">
        {TYPE_FILTERS.map(t => (
          <button
            key={t}
            className={`ev-chip${typeFilter === t ? ' active' : ''}`}
            onClick={() => setType(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Event cards — full-width, stacked ── */}
      <div className="ev-list">
        {filtered.map(ev => (
          <div key={ev.id} className={`ev-card${ev.sold_out ? ' ev-card--soldout' : ''}`}>

            {/* Left: cover art / initials */}
            <div className="ev-card-art">
              <div className="ev-card-initials">{ev.initials}</div>
              {ev.sold_out && <div className="ev-badge ev-badge--sold">Sold Out</div>}
            </div>

            {/* Right: info */}
            <div className="ev-card-body">
              <div className="ev-card-top">
                <div className="ev-card-title">{ev.title}</div>
                <div className="ev-card-artist">{ev.artist}</div>
              </div>

              <div className="ev-card-meta">
                <span className="ev-meta-item">
                  <Calendar size={11} strokeWidth={1.8} />
                  {formatDate(ev.date)}
                </span>
                <span className="ev-meta-item">
                  <Clock size={11} strokeWidth={1.8} />
                  {ev.time}
                </span>
                <span className="ev-meta-item">
                  <MapPin size={11} strokeWidth={1.8} />
                  {ev.venue}
                </span>
              </div>

              <div className="ev-card-bottom">
                <div className="ev-card-stats">
                  <span className="ev-stat-city">{ev.city}</span>
                  <span className="ev-stat-going">
                    <Users size={10} strokeWidth={1.8} />
                    {ev.attending.toLocaleString()}
                  </span>
                </div>
                <div className="ev-card-actions">
                  <span className="ev-price">{ev.price}</span>
                  <button
                    className={`ev-btn${ev.sold_out ? ' ev-btn--disabled' : ''}`}
                    disabled={ev.sold_out}
                  >
                    {ev.sold_out ? 'Sold Out' : 'Tickets'}
                    {!ev.sold_out && <ExternalLink size={10} strokeWidth={2} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Type badge */}
            <div className={`ev-type-pill ev-type-pill--${ev.type.toLowerCase().replace(/\s/g, '')}`}>
              {ev.type}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
