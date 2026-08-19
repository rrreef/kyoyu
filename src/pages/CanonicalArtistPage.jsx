import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapPin, Users, Music, Calendar, Play } from 'lucide-react';
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
  
  const { playTrack } = usePlayer();
  const { isFollowing, toggleFollow } = useLibrary();

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
            body: JSON.stringify({ type: 'artist', discogsId })
          });
          if (!res.ok) {
            console.error('Failed to ingest artist');
          }
          fetchId = discogsId; // We'll query by discogs_id
        }

        // 2. Fetch canonical artist
        let query = supabase.from('canonical_artists').select('*');
        if (id.startsWith('discogs-')) {
          query = query.eq('discogs_id', fetchId);
        } else {
          query = query.eq('slug', fetchId);
        }
        
        const { data: artistData, error: artistError } = await query.single();
        if (artistError || !artistData) {
          console.error('Artist not found', artistError);
          setLoading(false);
          return;
        }
        setArtist(artistData);

        // 3. Fetch external links
        const { data: linksData } = await supabase
          .from('external_links')
          .select('*')
          .eq('entity_type', 'artist')
          .eq('entity_id', artistData.id);
        
        if (linksData) setLinks(linksData);

        // 4. Fetch native tracks
        const { data: tracksData } = await supabase
          .from('tracks')
          .select('*')
          .ilike('artist', `%${artistData.name}%`)
          .eq('visibility', 'public');
          
        if (tracksData) setNativeTracks(tracksData);

      } catch (err) {
        console.error('Error loading artist data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id]);

  if (loading) {
    return <div className="artist-page animate-in" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <div className="loading-spinner">Loading...</div>
    </div>;
  }

  if (!artist) {
    return <div className="artist-page animate-in">Artist not found</div>;
  }

  const following = isFollowing(artist.id);
  const hasNativeTracks = nativeTracks.length > 0;

  return (
    <div className="artist-page animate-in">
      {/* Hero */}
      <div className="artist-hero">
        <div className="artist-hero-bg" />
        <div className="artist-hero-content">
          <div className="artist-hero-top">
            <EntityPlaceholder name={artist.name} type="artist" className="canonical-hero-avatar" />
            <div className="canonical-hero-info">
              <ContentStateBadge isNative={hasNativeTracks} entityType="artist" />
              <h1 className="artist-hero-name">{artist.name}</h1>
            </div>
          </div>
          
          <div className="artist-hero-actions" style={{ marginTop: 'var(--sp-4)' }}>
            <button className="artist-follow-btn" onClick={() => toggleFollow(artist.id)}>
              {following ? 'Following' : 'Follow'}
            </button>
            {hasNativeTracks && (
              <button className="artist-play-btn glass-sm" onClick={() => playTrack(nativeTracks[0])}>
                <Play size={16} style={{ marginRight: '8px' }} />
                Play Latest
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="page">
        {/* Profile / Bio */}
        {artist.profile_text && (
          <section className="artist-bio-section">
            <div className="section-title"><span>About</span></div>
            <p className="artist-bio">{artist.profile_text}</p>
          </section>
        )}

        {/* Native Tracks */}
        {hasNativeTracks ? (
          <section className="artist-discography">
            <div className="section-title"><span>Tracks on ree.fm</span></div>
            <div className="tracks-list">
              {nativeTracks.map(track => (
                <div key={track.id} className="track-item glass" onClick={() => playTrack(track)}>
                  <Play size={16} />
                  <div className="track-info">
                    <div className="track-title">{track.title}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <section className="artist-claim-section">
            <ClaimCTA entityType="artist" entityName={artist.name} />
          </section>
        )}

        {/* External Links */}
        {links.length > 0 && (
          <section className="artist-external-links">
            <div className="section-title"><span>Find on other platforms</span></div>
            <SourceButtons links={links} />
          </section>
        )}
      </div>
    </div>
  );
}
