import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Music2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import UploadShelf from '../components/uploads/UploadShelf';

export default function MyReleases() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [uploads, setUploads] = useState([]);

  useEffect(() => {
    if (!user?.id) return;
    try {
      const raw = localStorage.getItem(`kyoyu-uploads-${user.id}`);
      setUploads(raw ? JSON.parse(raw) : []);
    } catch {}
  }, [user?.id]);

  return (
    <div className="page animate-in" style={{ paddingTop: 'var(--page-top, 80px)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 36, height: 36, borderRadius: '50%',
            background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
            color: 'var(--text-primary)', cursor: 'pointer', flexShrink: 0,
          }}
        >
          <ArrowLeft size={16} />
        </button>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          My Uploads
        </h1>
      </div>

      {uploads.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 12, paddingTop: 80,
          color: 'var(--text-muted)', textAlign: 'center',
        }}>
          <Music2 size={40} strokeWidth={1.2} />
          <div style={{ fontWeight: 600 }}>No uploads yet</div>
          <div style={{ fontSize: '0.8rem' }}>Your private music lives here</div>
        </div>
      ) : (
        <UploadShelf uploads={uploads} />
      )}
    </div>
  );
}
