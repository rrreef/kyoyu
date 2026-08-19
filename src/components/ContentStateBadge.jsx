import React from 'react';
import './ContentStateBadge.css';

export default function ContentStateBadge({ isNative, entityType }) {
  return (
    <div className="content-state-badge glass-sm">
      <span className={`state-dot ${isNative ? 'native' : 'external'}`} />
      <span className="state-text">
        {isNative ? 'On ree.fm' : 'Not yet on ree.fm'}
      </span>
    </div>
  );
}
