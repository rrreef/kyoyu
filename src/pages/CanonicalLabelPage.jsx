import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
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
  const [ingestError, setIngestError] = useState(false);

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
              body: JSON.stringify({ type: 'label', discogsId }),
            });
            if (!res.ok) {
              console.warn('Label ingest returned', res.status);
              setIngestError(true);
            }
          } catch (err) {
            console.warn('Label ingest failed:', err);
            setIngestError(true);
          }
        }

        // 2. Fetch canonical label
        let labelData = null;
        if (isDiscogs && discogsId) {
          const { data } = await supabase
            .from('canonical_labels').select('*').eq('discogs_id', discogsId).maybeSingle();
          labelData = data;
        } else {
          const { data } = await supabase
            .from('canonical_labels').select('*').eq('slug', id).maybeSingle();
          labelData = data;
        }

        if (!labelData) {
          setLoading(false);
          return;
        }
        setLabel(labelData);

        // 3. Fetch releases for this label
        if (labelData.id) {
          const { data: releasesData } = await supabase
            .from('canonical_releases')
            .select('*')
            .eq('label_id', labelData.id);
          if (releasesData) setReleases(releasesData);
        }

        // 4. Fetch external links
        if (labelData.id) {
          const { data: linksData } = await supabase
            .from('external_links')
            .select('*')
            .eq('entity_type', 'label')
            .eq('entity_id', labelData.id);
          if (linksData) setLinks(linksData);
        }

      } catch (err) {
        console.error('Error loading label data:', err);
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

  if (!label) {
    return <div className="canonical-page animate-in" style={{ padding: '32px', color: 'var(--text-muted)' }}>Label not found</div>;
  }

  return (
    <div className="canonical-page animate-in">
      <div className="canonical-hero">
        <div className="canonical-hero-bg" />
        <div className="canonical-hero-content">
          <div className="canonical-hero-top">
            <EntityPlaceholder name={label.name} type="label" className="canonical-hero-avatar" />
            <div className="canonical-hero-info">
              <ContentStateBadge isNative={label.native_available} entityType="label" />
              <h1 className="canonical-hero-name">{label.name}</h1>
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

        {/* Profile */}
        {label.profile_text && (
          <section className="canonical-section">
            <div className="section-title"><span>About</span></div>
            <p className="canonical-bio">{label.profile_text}</p>
          </section>
        )}

        {/* Contact */}
        {label.contact_info && (
          <section className="canonical-section">
            <div className="section-title"><span>Contact</span></div>
            <p className="canonical-bio" style={{ fontSize: '0.85rem' }}>{label.contact_info}</p>
          </section>
        )}

        {/* Releases */}
        {releases.length > 0 && (
          <section className="canonical-section">
            <div className="section-title"><span>Releases</span></div>
            <div className="canonical-releases-grid">
              {releases.map(rel => (
                <Link key={rel.id} to={`/release/${rel.slug || rel.id}`} className="canonical-release-card glass">
                  <EntityPlaceholder name={rel.title} type="release" className="canonical-release-cover" />
                  <div className="canonical-release-info">
                    <div className="canonical-release-title">{rel.title}</div>
                    {rel.release_date && <div className="canonical-release-year">{rel.release_date}</div>}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* External Links */}
        {links.length > 0 && (
          <section className="canonical-section">
            <div className="section-title"><span>Find elsewhere</span></div>
            <SourceButtons links={links} />
          </section>
        )}

        {/* Claim CTA */}
        {!label.native_available && (
          <section className="canonical-section">
            <ClaimCTA entityType="label" entityName={label.name} />
          </section>
        )}
      </div>
    </div>
  );
}
