import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, User, Mail, Lock, Cake, CreditCard, Globe, Music2, ChevronRight, Check, Apple } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './Account.css';

const GENRES = ['Electronic','Hip-Hop','Jazz','Classical','Rock','Indie','R&B','Ambient','Folk','Metal','Pop','Soul','Reggae','Latin','World'];
const COUNTRIES = ['France','Germany','United Kingdom','Switzerland','Italy','Spain','Netherlands','Belgium','Sweden','United States','Japan','Brazil','Canada','Australia','Portugal'];

export default function Account() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [username,    setUsername]    = useState(user?.username || 'listener_user');
  const [editingUser, setEditingUser] = useState(false);
  const [birthdate,   setBirthdate]   = useState('');
  const [countries,   setCountries]   = useState([]);
  const [genres,      setGenres]      = useState([]);
  const [countryOpen, setCountryOpen] = useState(false);
  const [genreOpen,   setGenreOpen]   = useState(false);
  const [saved,       setSaved]       = useState(false);

  function toggleCountry(c) { setCountries(cs => cs.includes(c) ? cs.filter(x=>x!==c) : [...cs,c]); }
  function toggleGenre(g)   { setGenres(gs => gs.includes(g) ? gs.filter(x=>x!==g) : [...gs,g]); }

  function save() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="page account-page animate-in">

      {/* Back header */}
      <div className="account-header">
        <button className="account-back glass" onClick={() => navigate('/profile')}>
          <ChevronLeft size={18} />
        </button>
        <h1>Account</h1>
        <button className={`account-save-btn${saved ? ' saved' : ''}`} onClick={save}>
          {saved ? <><Check size={14} /> Saved</> : 'Save'}
        </button>
      </div>

      {/* Identity */}
      <div className="account-section">
        <div className="account-section-label">Identity</div>

        <div className="account-row glass">
          <User size={16} className="account-row-icon" />
          <div className="account-row-body">
            <div className="account-row-label">Username</div>
            {editingUser
              ? <input className="account-input" value={username} onChange={e=>setUsername(e.target.value)} onBlur={()=>setEditingUser(false)} autoFocus />
              : <div className="account-row-val">{username}</div>
            }
          </div>
          <button className="account-row-action" onClick={()=>setEditingUser(true)}>Change</button>
        </div>

        <div className="account-row glass">
          <Mail size={16} className="account-row-icon" />
          <div className="account-row-body">
            <div className="account-row-label">Email</div>
            <div className="account-row-val">{user?.email || 'listener@reef.fm'}</div>
          </div>
        </div>

        <div className="account-row glass">
          <Cake size={16} className="account-row-icon" />
          <div className="account-row-body">
            <div className="account-row-label">Birthday</div>
            <input
              type="date"
              className="account-input account-date"
              value={birthdate}
              onChange={e=>setBirthdate(e.target.value)}
              placeholder="dd/mm/yyyy"
            />
          </div>
        </div>
      </div>

      {/* Security */}
      <div className="account-section">
        <div className="account-section-label">Security</div>
        <button className="account-row glass account-row-btn">
          <Lock size={16} className="account-row-icon" />
          <div className="account-row-body">
            <div className="account-row-label">Change Password</div>
            <div className="account-row-val">Send reset link to your email</div>
          </div>
          <ChevronRight size={15} className="account-row-chevron" />
        </button>
      </div>

      {/* Payment */}
      <div className="account-section">
        <div className="account-section-label">Payment</div>

        <button className="account-row glass account-row-btn account-apple-pay">
          <Apple size={18} className="account-row-icon" />
          <div className="account-row-body">
            <div className="account-row-label">Apple Pay</div>
            <div className="account-row-val">Tap to set up</div>
          </div>
          <ChevronRight size={15} className="account-row-chevron" />
        </button>

        <button className="account-row glass account-row-btn">
          <CreditCard size={16} className="account-row-icon" />
          <div className="account-row-body">
            <div className="account-row-label">Bank Card</div>
            <div className="account-row-val">Add or manage card</div>
          </div>
          <ChevronRight size={15} className="account-row-chevron" />
        </button>
      </div>

      {/* Location */}
      <div className="account-section">
        <div className="account-section-label">Location</div>
        <div className="account-row glass account-row-btn" onClick={()=>setCountryOpen(o=>!o)}>
          <Globe size={16} className="account-row-icon" />
          <div className="account-row-body">
            <div className="account-row-label">Countries</div>
            <div className="account-row-val">
              {countries.length ? countries.slice(0,3).join(', ') + (countries.length>3 ? ` +${countries.length-3}` : '') : 'Select countries'}
            </div>
          </div>
          <ChevronRight size={15} className={`account-row-chevron${countryOpen?' rotated':''}`} />
        </div>
        {countryOpen && (
          <div className="account-chip-panel glass">
            {COUNTRIES.map(c => (
              <button key={c} className={`account-chip${countries.includes(c)?' active':''}`} onClick={()=>toggleCountry(c)}>
                {countries.includes(c) && <Check size={11} />} {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Taste */}
      <div className="account-section">
        <div className="account-section-label">Music Taste</div>
        <div className="account-row glass account-row-btn" onClick={()=>setGenreOpen(o=>!o)}>
          <Music2 size={16} className="account-row-icon" />
          <div className="account-row-body">
            <div className="account-row-label">Favorite Genres</div>
            <div className="account-row-val">
              {genres.length ? genres.slice(0,4).join(', ') + (genres.length>4 ? ` +${genres.length-4}` : '') : 'Select genres'}
            </div>
          </div>
          <ChevronRight size={15} className={`account-row-chevron${genreOpen?' rotated':''}`} />
        </div>
        {genreOpen && (
          <div className="account-chip-panel glass">
            {GENRES.map(g => (
              <button key={g} className={`account-chip${genres.includes(g)?' active':''}`} onClick={()=>toggleGenre(g)}>
                {genres.includes(g) && <Check size={11} />} {g}
              </button>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
