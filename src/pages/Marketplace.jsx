import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Star, MapPin, Package, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { vinylMarketplace } from '../data/mockData';
import { VinylCard } from '../components/ui/Cards';
import './Marketplace.css';

export default function Marketplace() {
  const [filter, setFilter] = useState({ genre: 'All', condition: 'All', country: 'All' });
  const [sortBy, setSortBy] = useState('recent');

  const conditions = ['All', 'Mint (M)', 'Near Mint (NM)', 'Very Good Plus (VG+)', 'Very Good (VG)'];
  const genres = ['All', 'Techno', 'Jazz', 'Ambient', 'Hip-Hop', 'Electronic'];

  const filtered = vinylMarketplace.filter(v => {
    if (filter.genre !== 'All' && v.genre !== filter.genre) return false;
    if (filter.condition !== 'All' && v.condition !== filter.condition) return false;
    return true;
  });

  return (
    <div className="page marketplace-page animate-in">
      <div className="mp-header">
        <div>
          <h1>Vinyl Marketplace</h1>
          <p>Buy and sell vinyl from sellers worldwide. Community-driven, catalog-linked.</p>
        </div>
        <Link to="/upload" className="mp-list-btn glass-sm">List a Record</Link>
      </div>

      {/* Stats bar */}
      <div className="mp-stats glass">
        <div className="mp-stat"><Package size={16} /><span>{vinylMarketplace.length * 48} listings</span></div>
        <div className="mp-stat"><MapPin size={16} /><span>12 countries</span></div>
        <div className="mp-stat"><Star size={16} /><span>Verified sellers</span></div>
      </div>

      {/* Filters */}
      <div className="mp-filters">
        <div className="filter-group">
          <label className="filter-label">Genre</label>
          <div className="filter-chips">
            {genres.map(g => (
              <button
                key={g}
                className={`filter-chip ${filter.genre === g ? 'active' : ''}`}
                onClick={() => setFilter(p => ({ ...p, genre: g }))}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-group">
          <label className="filter-label">Condition</label>
          <div className="filter-chips">
            {conditions.map(c => (
              <button
                key={c}
                className={`filter-chip ${filter.condition === c ? 'active' : ''}`}
                onClick={() => setFilter(p => ({ ...p, condition: c }))}
              >
                {c.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Listings */}
      <div className="mp-results">
        <div className="mp-results-header">
          <span className="mp-results-count">{filtered.length} listings</span>
          <select className="mp-sort" value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="recent">Most Recent</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="rating">Seller Rating</option>
          </select>
        </div>
        <div className="mp-grid">
          {filtered.map(v => (
            <div key={v.id} className="mp-listing-card glass-card">
              <div className="mp-listing-cover">
                <img src={v.cover} alt={v.release} />
                <div className="mp-condition-badge">{v.condition.split(' ')[0]}</div>
              </div>
              <div className="card-body">
                <Link to={`/marketplace/${v.id}`} className="card-title">{v.release}</Link>
                <div className="card-sub">{v.artist}</div>
                <div className="mp-listing-meta">
                  <span className="card-genre">{v.format}</span>
                  <span className="card-year">{v.country}</span>
                </div>
                <div className="mp-listing-seller">
                  <div className="mp-seller-name">{v.seller}</div>
                  <div className="mp-seller-rating"><Star size={11} fill="currentColor" /> {v.sellerRating} · {v.sellerSales.toLocaleString()} sales</div>
                </div>
                <div className="mp-listing-footer">
                  <div>
                    <div className="mp-price">€{v.price.toFixed(2)}</div>
                    <div className="mp-shipping">+ €{v.shipping.toFixed(2)} shipping</div>
                  </div>
                  <button className="mp-buy-btn">Buy Now</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
