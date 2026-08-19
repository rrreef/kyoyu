import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { MapPin, Disc } from 'lucide-react';
import SourceButtons from '../components/SourceButtons';
import ContentStateBadge from '../components/ContentStateBadge';
import ClaimCTA from '../components/ClaimCTA';
import EntityPlaceholder from '../components/EntityPlaceholder';
import './CanonicalLabelPage.css';

export default function CanonicalLabelPage() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState(null);
  const [releases, setReleases] = useState([]);
  const [links, setLinks] = useState([]);

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
            body: JSON.stringify({ type: 'label', discogsId })
          });
          if (!res.ok) console.error('Failed to ingest label');
          fetchId = discogsId;
        }

        // 2. Fetch canonical label
        let query = supabase.from('canonical_labels').select('*');
        if (id.startsWith('discogs-')) {
          query = query.eq('discogs_id', fetchId);
        } else {
          query = query.eq('slug', fetchId);
        }
        
        const { data: labelData, error: labelError } = await query.single();
        if (labelError || !labelData) {
          console.error('Label not found', labelError);
          setLoading(false);
          return;
        }
        setLabel(labelData);

        // 3. Fetch canonical releases for this label
        const { data: releasesData } = await supabase
          .from('canonical_releases')
          .select('*')
          .eq('label_id', labelData.id);
          
        if (releasesData) setReleases(releasesData);

        // 4. Fetch external links
        const { data: linksData } = await supabase
          .from('external_links')
          .select('*')
          .eq('entity_type', 'label')
          .eq('entity_id', labelData.id);
        
        if (linksData) setLinks(linksData);

      } catch (err) {
        console.error('Error loading label data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id]);

  if (loading) return <div className="page" style={{display: 'flex', justifyContent: 'center', height: '100vh', alignItems: 'center'}}><div className="loading-spinner">Loading...</div></div>;
  if (!label) return <div className="page">Label not found</div>;

  const isNative = false; // Just like artist, we'd check if there are actual native releases or profiles

  return (
    <div className="canonical-label-page animate-in">
      <div className="label-hero">
        <div className="label-hero-bg" />
        <div className="label-hero-content">
          <div className="label-hero-top">
            <EntityPlaceholder name={label.name} type="label" className="canonical-hero-avatar" />
            <div className="canonical-hero-info">
              <ContentStateBadge isNative={isNative} entityType="label" />
              <h1 className="label-hero-name">{label.name}</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="page">
        {label.profile_text && (
          <section className="label-bio-section">
            <div className="section-title"><span>About</span></div>
            <p className="label-bio">{label.profile_text}</p>
          </section>
        )}

        {releases.length > 0 && (
          <section className="label-discography">
            <div className="section-title"><span>Releases</span></div>
            <div className="releases-grid">
              {releases.map(rel => (
                <Link key={rel.id} to={`/release/${rel.slug || rel.id}`} className="release-card glass">
                  <EntityPlaceholder name={rel.title} type="release" className="release-card-cover" />
                  <div className="release-card-info">
                    <div className="release-card-title">{rel.title}</div>
                    {rel.released_date && <div className="release-card-year">{new Date(rel.released_date).getFullYear()}</div>}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {!isNative && (
          <section className="label-claim-section">
            <ClaimCTA entityType="label" entityName={label.name} />
          </section>
        )}

        {links.length > 0 && (
          <section className="label-external-links">
            <div className="section-title"><span>Find elsewhere</span></div>
            <SourceButtons links={links} />
          </section>
        )}
      </div>
    </div>
  );
}
