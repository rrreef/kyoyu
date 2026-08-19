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
  
  const { playTrack } = usePlayer();

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        let fetchId = id;
        
        // 1. Ingest if needed
        if (id.startsWith('discogs-')) {
          const discogsId = id.replace('discogs-', '');
          const res = await fetch('/api/discogs-ingest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'release', discogsId })
          });
          if (!res.ok) console.error('Failed to ingest release');
          fetchId = discogsId;
        }

        // 2. Fetch canonical release
        let query = supabase.from('canonical_releases').select('*');
        if (id.startsWith('discogs-')) {
          query = query.eq('discogs_id', fetchId);
        } else {
          query = query.eq('slug', fetchId);
        }
        
        const { data: releaseData, error: releaseError } = await query.single();
        if (releaseError || !releaseData) {
          console.error('Release not found', releaseError);
          setLoading(false);
          return;
        }
        setRelease(releaseData);

        // 3. Fetch canonical_tracks
        const { data: tracksData } = await supabase
          .from('canonical_tracks')
          .select('*')
          .eq('release_id', releaseData.id)
          .order('position', { ascending: true });
        
        if (tracksData) setTracks(tracksData);

        // 4. Fetch release_credits
        const { data: creditsData } = await supabase
          .from('release_credits')
          .select('*, canonical_artists(name, slug)')
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

  if (loading) return <div className="page" style={{display: 'flex', justifyContent: 'center', height: '100vh', alignItems: 'center'}}><div className="loading-spinner">Loading...</div></div>;
  if (!release) return <div className="page">Release not found</div>;

  // Since it's a canonical page, let's assume it's external by default unless tracks have actual audio
  // but for now, we'll mark it as external if there are no playable tracks (which requires native files)
  const isNative = false; // Real logic: check if release exists in native `releases` table

  return (
    <div className="canonical-release-page animate-in">
      <div className="release-hero">
        <div className="release-hero-bg" />
        <div className="release-hero-content">
          <div className="release-hero-top">
            <EntityPlaceholder name={release.title} type="release" className="canonical-hero-cover" />
            <div className="canonical-hero-info">
              <ContentStateBadge isNative={isNative} entityType="release" />
              <h1 className="release-hero-title">{release.title}</h1>
              <div className="release-hero-meta">
                {release.released_date && <span>{new Date(release.released_date).getFullYear()}</span>}
                {release.genres && release.genres.length > 0 && <span> • {release.genres.join(', ')}</span>}
                {release.format_details && <span> • {release.format_details.join(', ')}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="page">
        <div className="release-details-grid">
          <div className="main-col">
            {/* Tracklist */}
            {tracks.length > 0 && (
              <section className="release-tracklist">
                <div className="section-title"><span>Tracklist</span></div>
                <div className="tracks-list">
                  {tracks.map(track => (
                    <div key={track.id} className="track-item glass">
                      <div className="track-pos">{track.position}</div>
                      <div className="track-info">
                        <div className="track-title">{track.title}</div>
                      </div>
                      <div className="track-duration">{track.duration}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {!isNative && (
              <section className="release-claim-section">
                <ClaimCTA entityType="release" entityName={release.title} />
              </section>
            )}

            {links.length > 0 && (
              <section className="release-external-links">
                <div className="section-title"><span>Listen on other platforms</span></div>
                <SourceButtons links={links} />
              </section>
            )}
          </div>
          
          <div className="side-col">
            <div className="meta-card glass">
              <div className="meta-item">
                <Disc size={16} />
                <div>
                  <span className="meta-label">Format</span>
                  <span>{release.format_details?.join(', ') || 'Unknown'}</span>
                </div>
              </div>
              <div className="meta-item">
                <Hash size={16} />
                <div>
                  <span className="meta-label">Catalog No.</span>
                  <span>{release.catalog_number || 'N/A'}</span>
                </div>
              </div>
              <div className="meta-item">
                <Hash size={16} />
                <div>
                  <span className="meta-label">Barcode</span>
                  <span>{release.barcode || 'N/A'}</span>
                </div>
              </div>
              {release.styles && release.styles.length > 0 && (
                <div className="meta-item">
                  <span className="meta-label">Styles</span>
                  <span>{release.styles.join(', ')}</span>
                </div>
              )}
            </div>

            {credits.length > 0 && (
              <div className="credits-card glass">
                <h3 className="card-title">Credits</h3>
                <div className="credits-list">
                  {credits.map((credit, i) => (
                    <div key={i} className="credit-item">
                      <span className="credit-role">{credit.role}</span>
                      <Link to={`/artist/${credit.canonical_artists?.slug || credit.artist_id}`} className="credit-name">
                        {credit.canonical_artists?.name || 'Unknown Artist'}
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
