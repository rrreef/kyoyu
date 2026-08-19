import React from 'react';
import { Link } from 'react-router-dom';
import './ClaimCTA.css';

export default function ClaimCTA({ entityType, entityName }) {
  const getMessage = () => {
    switch (entityType) {
      case 'artist':
        return `Are you ${entityName}? Claim this page`;
      case 'label':
        return `Manage ${entityName} on ree.fm`;
      case 'release':
        return `Upload this release to ree.fm`;
      default:
        return `Claim this ${entityType}`;
    }
  };

  const getButtonText = () => {
    return entityType === 'release' ? 'Upload Release' : 'Claim Profile';
  };

  return (
    <div className="claim-cta glass-card">
      <div className="claim-cta-content">
        <h3 className="claim-cta-title">{getMessage()}</h3>
        <p className="claim-cta-desc">
          Take control of your presence, connect with fans, and monetize your catalog directly.
        </p>
      </div>
      <Link to="/upload" className="claim-cta-btn glass-sm">
        {getButtonText()}
      </Link>
    </div>
  );
}
