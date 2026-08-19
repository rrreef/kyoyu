import React from 'react';
import './SourceButtons.css';

const PLATFORM_CONFIG = {
  spotify: { icon: '🟢', text: 'Play on Spotify', color: '#1DB954' },
  youtube: { icon: '🔴', text: 'Watch on YouTube', color: '#FF0000' },
  bandcamp: { icon: '🔵', text: 'Open on Bandcamp', color: '#1DA0C3' },
  soundcloud: { icon: '🟠', text: 'Listen on SoundCloud', color: '#FF5500' },
  deezer: { icon: '🟣', text: 'Open on Deezer', color: '#A238FF' },
  discogs: { icon: '⚫', text: 'View on Discogs', color: '#333333' },
  website: { icon: '🌐', text: 'Visit Website', color: '#666666' },
};

export default function SourceButtons({ links = [] }) {
  if (!links || links.length === 0) return null;

  return (
    <div className="source-buttons-row">
      {links.map((link, i) => {
        const config = PLATFORM_CONFIG[link.platform] || PLATFORM_CONFIG.website;
        return (
          <a
            key={i}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="source-button glass-sm"
            style={{ '--platform-color': config.color }}
          >
            <span className="source-icon">{config.icon}</span>
            <span className="source-text">{config.text}</span>
          </a>
        );
      })}
    </div>
  );
}
