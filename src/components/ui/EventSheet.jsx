import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import './AlbumSheet.css';

export default function EventSheet({ events, initialIndex, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex || 0);
  const currentEvent = events[currentIndex];

  const sheetRef = useRef(null);
  const startY = useRef(0);
  const currentY = useRef(0);

  const handlePrev = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };
  const handleNext = () => {
    if (currentIndex < events.length - 1) setCurrentIndex(currentIndex + 1);
  };

  const onTouchStart = (e) => {
    // Only drag from the handle row
    if (!e.target.closest('.as-handle-row')) return;
    startY.current = e.touches[0].clientY;
    currentY.current = startY.current;
    if (sheetRef.current) {
      sheetRef.current.style.transition = 'none';
    }
  };

  const onTouchMove = (e) => {
    if (!startY.current) return;
    currentY.current = e.touches[0].clientY;
    const dy = currentY.current - startY.current;
    if (dy > 0 && sheetRef.current) {
      e.preventDefault();
      sheetRef.current.style.transform = `translateY(${dy}px)`;
    }
  };

  const onTouchEndHandler = () => {
    if (!startY.current) return;
    const dy = currentY.current - startY.current;
    startY.current = 0;
    if (sheetRef.current) {
      sheetRef.current.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
      if (dy > 120) {
        sheetRef.current.style.transform = `translateY(100%)`;
        setTimeout(onClose, 300);
      } else {
        sheetRef.current.style.transform = 'translateY(0)';
      }
    }
  };

  useEffect(() => {
    if (!currentEvent) return;
    
    // Check if we're in the native iOS app
    const isNativeApp = () => {
      try { return !!window.webkit?.messageHandlers?.player; }
      catch(e) { return false; }
    };
    
    if (isNativeApp()) {
      // Map Event data to Native Album format so the Swift wrapper renders it natively
      const ts = Date.now();
      window.__lastFastOpenTs = ts;
      
      let tracks = [];
      
      // Timetable mapped as track sections
      if (currentEvent.timetable) {
        Object.keys(currentEvent.timetable).forEach(floor => {
          tracks.push({
            id: 'floor_' + floor,
            title: '── ' + floor.toUpperCase() + ' ──',
            artist: '',
            url: ''
          });
          currentEvent.timetable[floor].forEach(set => {
            if (!set.artist || !set.artist.trim()) return; // skip empty artist slots
            tracks.push({
              id: 'set_' + set.artist + set.time,
              title: set.artist,
              artist: set.time,
              url: ''
            });
          });
        });
      }

      // Location, date, and address
      const eventSubtitle = `Berghain\n${currentEvent.day} ${currentEvent.date}\nAm Wriezener Bahnhof, 10243 Berlin`;

      try {
        window.webkit.messageHandlers.player.postMessage({
          albumOpen: true,
          nativeAlbum: {
            _ts: String(ts),
            id: currentEvent.id || String(Date.now()),
            title: currentEvent.title,
            artist: eventSubtitle,
            cover: currentEvent.image || null,
            genre: "Event",
            year: null,
            label: currentEvent.link || null,
            description: currentEvent.description || null,
            tracks: tracks
          }
        });
      } catch(e) {}
      
      // Setup close handler so Swift can trigger onClose
      window.__kyoyuCloseNativeAlbum = (incomingTs) => {
        if (incomingTs && window.__lastFastOpenTs && String(incomingTs) !== String(window.__lastFastOpenTs)) {
           return;
        }
        onClose();
      };

      // Expose prev/next navigation so Swift can trigger swiping
      window.__kyoyuEventPrev = () => {
        if (currentIndex > 0) setCurrentIndex(prev => prev - 1);
      };
      window.__kyoyuEventNext = () => {
        if (currentIndex < events.length - 1) setCurrentIndex(prev => prev + 1);
      };
      window.__kyoyuEventIndex = currentIndex;
      window.__kyoyuEventCount = events.length;
    } else {
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') onClose();
        if (e.key === 'ArrowLeft') handlePrev();
        if (e.key === 'ArrowRight') handleNext();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
    
    return () => {
      if (isNativeApp()) {
        delete window.__kyoyuCloseNativeAlbum;
        delete window.__kyoyuEventPrev;
        delete window.__kyoyuEventNext;
        delete window.__kyoyuEventIndex;
        delete window.__kyoyuEventCount;
        try {
          window.webkit.messageHandlers.player.postMessage({ albumOpen: false });
        } catch(e) {}
      }
    };
  }, [currentEvent, onClose]);

  if (!currentEvent) return null;
  
  // If native app, render nothing since Swift handles the presentation.
  const isNativeApp = () => { try { return !!window.webkit?.messageHandlers?.player; } catch(e){ return false; } };
  if (isNativeApp()) return null;

  return (
    <div className="album-sheet-backdrop" onClick={onClose}>
      <div 
        className="album-sheet" 
        onClick={e => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEndHandler}
        ref={sheetRef}
      >
        <div className="as-handle-row" onClick={onClose}>
          <div className="as-handle"></div>
        </div>
        
        <button className="as-close" onClick={onClose}><X size={18}/></button>

        <div className="as-hero">
          <div className="as-art">
            {currentEvent.image ? (
              <img src={currentEvent.image} alt={currentEvent.title} />
            ) : (
              <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #2a2a32 0%, #111 100%)' }} />
            )}
          </div>
          <div className="as-meta">
            <h1 className="as-album-title" style={{ fontSize: '1.25rem', marginBottom: '4px' }}>{currentEvent.title}</h1>
            <p className="as-album-artist">
              Berghain<br/>
              {currentEvent.day} {currentEvent.date}<br/>
              Am Wriezener Bahnhof, 10243 Berlin
            </p>
            
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button 
                onClick={handlePrev} 
                disabled={currentIndex === 0} 
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '100px', padding: '6px 14px', color: '#fff', fontSize: '0.8rem', opacity: currentIndex === 0 ? 0.3 : 1 }}
              >
                Previous
              </button>
              <button 
                onClick={handleNext} 
                disabled={currentIndex === events.length - 1} 
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '100px', padding: '6px 14px', color: '#fff', fontSize: '0.8rem', opacity: currentIndex === events.length - 1 ? 0.3 : 1 }}
              >
                Next
              </button>
            </div>
          </div>
        </div>

        <div className="as-body">
          {currentEvent.timetable && Object.keys(currentEvent.timetable).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {Object.keys(currentEvent.timetable).map(floor => (
                <div key={floor}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '6px' }}>
                    {floor}
                  </h3>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {currentEvent.timetable[floor].map((set, i) => (
                      <li key={i} style={{ display: 'flex', gap: '16px', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)', width: '50px', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{set.time}</span>
                        <span style={{ fontSize: '1rem', color: '#fff', fontWeight: 500 }}>{set.artist}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
