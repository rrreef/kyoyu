import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Play } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { usePlayer } from '../contexts/PlayerContext';
import { useLibrary } from '../contexts/LibraryContext';
import SourceButtons from '../components/SourceButtons';
import ContentStateBadge from '../components/ContentStateBadge';
import ClaimCTA from '../components/ClaimCTA';
import EntityPlaceholder from '../components/EntityPlaceholder';
import './CanonicalArtistPage.css';

export default function CanonicalArtistPage() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [artist, setArtist] = useState(null);
  const [links, setLinks] = useState([]);
  const [nativeTracks, setNativeTracks] = useState([]);
  const [ingestError, setIngestError] = useState(false);
  
  const { playTrack } = usePlayer();
  const { isFollowing, toggleFollow } = useLibrary();

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setIngestError(false);
      try {
        const isDiscogs = id.startsWith('discogs-');
        const discogsId = isDiscogs ? parseInt(id.replace('discogs-', ''), 10) : null;

        // 1. If discogs entity, try to ingest first (may already exist)
        if (isDiscogs && discogsId) {
          try {
            const res = await fetch('/api/discogs-ingest', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'artist', discogsId }),
            });
            if (!res.ok) {
              console.warn('Ingest returned', res.status, '— will try fetching directly');
              setIngestError(true);
            }
          } catch (err) {
            console.warn('Ingest failed:', err);
            setIngestError(true);
          }
        }

        // 2. Fetch canonical artist from DB
        let artistData = null;
        if (isDiscogs && discogsId) {
          const { data, error } = await supabase
            .from('canonical_artists')
            .select('*')
            .eq('discogs_id', discogsId)
            .maybeSingle();
          if (!error && data) artistData = data;
        } else {
          const { data, error } = await supabase
            .from('canonical_artists')
            .select('*')
            .eq('slug', id)
            .maybeSingle();
          if (!error && data) artistData = data;
        }

        // 3. If DB has no data but we have a discogs ID, show a minimal page from Discogs search cache
        if (!artistData && isDiscogs) {
          // Fallback: fetch directly from Discogs search to at least show the name
          try {
            const searchRes = await fetch('/api/discogs-search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: '', type: 'artist', perPage: 1 }),
            });
            // If we can't get data, create a minimal placeholder
            artistData = {
              id: `temp-${discogsId}`,
              name: 'Loading artist...',
              discogs_id: discogsId,
              native_available: false,
              profile_text: null,
            };
          } catch {
            artistData = {
              id: `temp-${discogsId}`,
              name: 'Artist',
              discogs_id: discogsId,
              native_available: false,
              profile_text: null,
            };
          }
        }

        if (!artistData) {
          setLoading(false);
          return;
        }

        setArtist(artistData);

        // 4. Fetch external links (only if real DB entity)
        if (artistData.id && !String(artistData.id).startsWith('temp-')) {
          const { data: linksData } = await supabase
            .from('external_links')
            .select('*')
            .eq('entity_type', 'artist')
            .eq('entity_id', artistData.id);
          if (linksData) setLinks(linksData);
        }

        // 5. Fetch native tracks
        if (artistData.name && artistData.name !== 'Loading artist...') {
          const { data: tracksData } = await supabase
            .from('tracks')
            .select('*')
            .ilike('artist', `%${artistData.name}%`)
            .eq('visibility', 'public');
          if (tracksData) setNativeTracks(tracksData);
        }

      } catch (err) {
        console.error('Error loading artist data:', err);
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

  if (!artist) {
    return <div className="canonical-page animate-in" style={{ padding: '32px', color: 'var(--text-muted)' }}>Artist not found</div>;
  }

  const following = isFollowing(artist.id);
  const hasNativeTracks = nativeTracks.length > 0;

  return (
    <div className="canonical-page animate-in">
      {/* Hero */}
      <div className="canonical-hero">
        <div className="canonical-hero-bg" />
        <div className="canonical-hero-content">
          <div className="canonical-hero-top">
            {artist.image_url ? (
              <img src={artist.image_url} alt={artist.name} className="canonical-hero-avatar" />
            ) : (
              <EntityPlaceholder name={artist.name} type="artist" className="canonical-hero-avatar" />
            )}
            <div className="canonical-hero-info">
              <ContentStateBadge isNative={hasNativeTracks || artist.native_available} entityType="artist" />
              <h1 className="canonical-hero-name">{artist.name}</h1>
              {artist.real_name && (
                <div className="canonical-hero-realname">{artist.real_name}</div>
              )}
            </div>
          </div>
          
          <div className="canonical-hero-actions">
            <button className="artist-follow-btn" onClick={() => toggleFollow(artist.id)}>
              {following ? 'Following' : 'Follow'}
            </button>
            {hasNativeTracks && (
              <button className="artist-play-btn glass-sm" onClick={() => playTrack(nativeTracks[0], nativeTracks)}>
                <Play size={16} style={{ marginRight: '8px' }} />
                Play
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="canonical-body">
        {/* Ingest error notice */}
        {ingestError && (
          <div className="canonical-notice glass-sm">
            Some metadata may be unavailable. Try refreshing.
          </div>
        )}

        {/* Profile / Bio */}
        {artist.profile_text && (
          <section className="canonical-section">
            <div className="section-title"><span>About</span></div>
            <p className="canonical-bio">{artist.profile_text}</p>
          </section>
        )}

        {/* External Links */}
        {links.length > 0 && (
          <section className="canonical-section">
            <div className="section-title"><span>Find on other platforms</span></div>
            <SourceButtons links={links} />
          </section>
        )}

        {/* Native Tracks */}
        {hasNativeTracks && (
          <section className="canonical-section">
            <div className="section-title"><span>Tracks on ree.fm</span></div>
            <div className="canonical-tracks-list">
              {nativeTracks.map(track => (
                <div key={track.id} className="canonical-track-item glass" onClick={() => playTrack(track, nativeTracks)}>
                  <Play size={14} />
                  <div className="canonical-track-info">
                    <div className="canonical-track-title">{track.title}</div>
                    {track.album && <div className="canonical-track-album">{track.album}</div>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Claim CTA for external-only */}
        {!hasNativeTracks && (
          <section className="canonical-section">
            <ClaimCTA entityType="artist" entityName={artist.name} />
          </section>
        )}
      </div>
    </div>
  );
}
