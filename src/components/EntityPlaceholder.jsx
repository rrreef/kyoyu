import React from 'react';
import './EntityPlaceholder.css';

// Generate consistent background color from string
const stringToColor = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Use HSL for tasteful, muted colors matching dark theme
  const h = Math.abs(hash) % 360;
  const s = 30 + (Math.abs(hash) % 20); // 30-50% saturation
  const l = 20 + (Math.abs(hash) % 15); // 20-35% lightness (darker)
  
  return `hsl(${h}, ${s}%, ${l}%)`;
};

const getInitials = (name) => {
  if (!name) return '?';
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};

export default function EntityPlaceholder({ name = 'Unknown', type = 'artist', className = '' }) {
  const bgColor = stringToColor(name);
  const initials = getInitials(name);
  
  // Apply shape based on type (artists/labels often circles, releases squares)
  const isCircle = type === 'artist' || type === 'label';
  const shapeClass = isCircle ? 'placeholder-circle' : 'placeholder-square';
  
  return (
    <div 
      className={`entity-placeholder ${shapeClass} ${className}`}
      style={{ backgroundColor: bgColor }}
    >
      <span className="placeholder-text">{initials}</span>
    </div>
  );
}
