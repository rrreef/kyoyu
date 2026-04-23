import { Link } from 'react-router-dom';
import { payoutData } from '../data/mockData';
import './Subscription.css';

export default function Subscription() {
  const d = payoutData;
  const total = d.topArtists.reduce((sum, a) => sum + a.percent, 0);

  return (
    <div className="page subscription-page animate-in">
      <div className="sub-header">
        <div className="sub-header-badge glass-sm">Fair Payout — April 2026</div>
        <h1>Where Your Money Goes</h1>
        <p>Every cent of your KYO subscription is accounted for. Here's exactly who got paid and how much — this month.</p>
      </div>

      {/* Main split */}
      <div className="sub-split glass">
        <div className="sub-split-bar">
          <div className="sub-split-artists" style={{ width: '70%' }}>
            <span>70% — Artists</span>
          </div>
          <div className="sub-split-phase" style={{ width: '30%' }}>
            <span>30% — KYO</span>
          </div>
        </div>
        <div className="sub-split-amounts">
          <div className="sub-amount-block">
            <div className="sub-amount-val">€{d.artistPool.toFixed(2)}</div>
            <div className="sub-amount-label">Went to artists you listened to</div>
          </div>
          <div className="sub-amount-block">
            <div className="sub-amount-val sub-amount-secondary">€{d.phaseShare.toFixed(2)}</div>
            <div className="sub-amount-label">KYO operating costs & infrastructure</div>
          </div>
        </div>
      </div>

      {/* Artist breakdown */}
      <section className="sub-breakdown">
        <div className="section-title"><span>Your Artist Breakdown — This Month</span></div>
        <div className="sub-artist-list">
          {d.topArtists.map((artist, i) => (
            <div key={i} className="sub-artist-row glass">
              <div className="sub-artist-rank">{i + 1}</div>
              <div className="sub-artist-info">
                <div className="sub-artist-name">{artist.name}</div>
                <div className="sub-artist-tracks">{artist.tracks} tracks played</div>
              </div>
              <div className="sub-artist-bar-wrap">
                <div className="sub-artist-bar" style={{ width: `${artist.percent}%` }} />
              </div>
              <div className="sub-artist-pct">{artist.percent}%</div>
              <div className="sub-artist-amount">€{artist.amount.toFixed(2)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison */}
      <section className="sub-comparison glass">
        <div className="sub-comp-title">How It Compares</div>
        <div className="sub-comp-table">
          <div className="sub-comp-row">
            <span className="sub-comp-platform">KYO</span>
            <span>User-centric · directly tied to your listening</span>
            <span className="sub-comp-highlight">€{(d.artistPool / d.topArtists[0].tracks).toFixed(4)} per stream (for your top artist)</span>
          </div>
          <div className="sub-comp-row sub-comp-other">
            <span className="sub-comp-platform">Typical Streaming Platform</span>
            <span>Pro-rata pool · diluted across all platform streams</span>
            <span>€{d.comparisonSpotify.toFixed(4)} per stream (estimated)</span>
          </div>
        </div>
        <p className="sub-comp-note">
          On KYO, your subscription money only flows to the artists you actually listened to this month. If you only listen to 3 artists, only those 3 artists benefit. This is user-centric payout in practice.
        </p>
      </section>

      {/* CTA */}
      <div className="sub-cta glass">
        <div>
          <div className="sub-cta-title">Your plan: Standard · €{d.subscriptionAmount}/month</div>
          <div className="sub-cta-sub">Cancel anytime. No lock-in. Fair forever.</div>
        </div>
        <Link to="/profile" className="sub-manage-btn">Manage Plan</Link>
      </div>
    </div>
  );
}
