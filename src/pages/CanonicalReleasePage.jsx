import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Play, Disc, Hash } from 'lucide-react';
import { usePlayer } from '../contexts/PlayerContext';
import SourceButtons from '../components/SourceButtons';
import ContentStateBadge from '../components/ContentStateBadge';
import ClaimCTA from '../components/ClaimCTA';
import EntityPlaceholder from '../components/EntityPlaceholder';
import './CanonicalReleasePage.css';

export default function CanonicalReleasePage() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [release, setRelease] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [credits, setCredits] = useState([]);
  const [links, setLinks] = useState([]);
  const [ingestError, setIngestError] = useState(false);
  
  const { playTrack } = usePlayer();

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setIngestError(false);
      try {
        const isDiscogs = id.startsWith('discogs-');
        const discogsId = isDiscogs ? parseInt(id.replace('discogs-', ''), 10) : null;

        // 1. Ingest if needed
        if (isDiscogs && discogsId) {
          try {
            const res = await fetch('/api/discogs-ingest', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'release', discogsId }),
            });
            if (!res.ok) {
              console.warn('Release ingest returned', res.status);
              setIngestError(true);
            }
          } catch (err) {
            console.warn('Release ingest failed:', err);
            setIngestError(true);
          }
        }

        // 2. Fetch canonical release
        let releaseData = null;
        if (isDiscogs && discogsId) {
          const { data } = await supabase
            .from('canonical_releases').select('*').eq('discogs_id', discogsId).maybeSingle();
          releaseData = data;
        } else {
          const { data } = await supabase
            .from('canonical_releases').select('*').eq('slug', id).maybeSingle();
          releaseData = data;
        }

        if (!releaseData) {
          setLoading(false);
          return;
        }
        setRelease(releaseData);

        // 3. Fetch canonical tracks
        const { data: tracksData } = await supabase
          .from('canonical_tracks')
          .select('*')
          .eq('release_id', releaseData.id)
          .order('position', { ascending: true });
        if (tracksData) setTracks(tracksData);

        // 4. Fetch release credits
        const { data: creditsData } = await supabase
          .from('release_credits')
          .select('*')
          .eq('release_id', releaseData.id);
        if (creditsData) setCredits(creditsData);

        // 5. Fetch external links
        const { data: linksData } = await supabase
          .from('external_links')
          .select('*')
          .eq('entity_type', 'release')
          .eq('entity_id', releaseData.id);
        if (linksData) setLinks(linksData);

      } catch (err) {
        console.error('Error loading release data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id]);

  if (loading) {
    return (
      <div className="canonical-page animate-in" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div className="loading-spinner" style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading...</div>
      </div>
    );
  }

  if (!release) {
    return <div className="canonical-page animate-in" style={{ padding: '32px', color: 'var(--text-muted)' }}>Release not found</div>;
  }

  return (
    <div className="canonical-page animate-in">
      <div className="canonical-hero">
        <div className="canonical-hero-bg" />
        <div className="canonical-hero-content">
          <div className="canonical-hero-top">
            <EntityPlaceholder name={release.title} type="release" className="canonical-hero-cover" />
            <div className="canonical-hero-info">
              <ContentStateBadge isNative={release.native_available} entityType="release" />
              <h1 className="canonical-hero-name">{release.title}</h1>
              <div className="canonical-hero-meta">
                {release.release_date && <span>{release.release_date}</span>}
                {release.genres && release.genres.length > 0 && <span> · {release.genres.join(', ')}</span>}
                {release.format && <span> · {release.format}</span>}
                {release.country && <span> · {release.country}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="canonical-body">
        {ingestError && (
          <div className="canonical-notice glass-sm">
            Some metadata may be unavailable. Try refreshing.
          </div>
        )}

        {/* Tracklist */}
        {tracks.length > 0 && (
          <section className="canonical-section">
            <div className="section-title"><span>Tracklist</span></div>
            <div className="canonical-tracks-list">
              {tracks.map(track => (
                <div key={track.id} className="canonical-track-item glass">
                  <div className="canonical-track-pos">{track.position}</div>
                  <div className="canonical-track-info">
                    <div className="canonical-track-title">{track.title}</div>
                  </div>
                  <div className="canonical-track-dur">{track.duration || ''}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Details */}
        <section className="canonical-section">
          <div className="section-title"><span>Details</span></div>
          <div className="canonical-meta-grid glass">
            {release.format && (
              <div className="canonical-meta-item">
                <span className="canonical-meta-label">Format</span>
                <span>{release.format}</span>
              </div>
            )}
            {release.catalog_number && (
              <div className="canonical-meta-item">
                <span className="canonical-meta-label">Catalog #</span>
                <span>{release.catalog_number}</span>
              </div>
            )}
            {release.barcode && (
              <div className="canonical-meta-item">
                <span className="canonical-meta-label">Barcode</span>
                <span>{release.barcode}</span>
              </div>
            )}
            {release.country && (
              <div className="canonical-meta-item">
                <span className="canonical-meta-label">Country</span>
                <span>{release.country}</span>
              </div>
            )}
            {release.styles && release.styles.length > 0 && (
              <div className="canonical-meta-item">
                <span className="canonical-meta-label">Styles</span>
                <span>{release.styles.join(', ')}</span>
              </div>
            )}
          </div>
        </section>

        {/* Credits */}
        {credits.length > 0 && (
          <section className="canonical-section">
            <div className="section-title"><span>Credits</span></div>
            <div className="canonical-credits glass">
              {credits.map((credit, i) => (
                <div key={i} className="canonical-credit-item">
                  <span className="canonical-credit-role">{credit.role}</span>
                  <span className="canonical-credit-name">{credit.artist_name}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Notes */}
        {release.notes && (
          <section className="canonical-section">
            <div className="section-title"><span>Notes</span></div>
            <p className="canonical-bio">{release.notes}</p>
          </section>
        )}

        {/* External Links */}
        {links.length > 0 && (
          <section className="canonical-section">
            <div className="section-title"><span>Listen on other platforms</span></div>
            <SourceButtons links={links} />
          </section>
        )}

        {/* Claim CTA */}
        {!release.native_available && (
          <section className="canonical-section">
            <ClaimCTA entityType="release" entityName={release.title} />
          </section>
        )}
      </div>
    </div>
  );
}
