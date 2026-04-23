import { useState, useEffect } from 'react';
import './EmptyReleases.css';

/* Rotating funny messages — cycles every 4s */
const QUIPS = [
  "Silence is a vibe, but maybe upload something? 👀",
  "Your discography is as empty as my fridge on payday 🌵",
  "404: Bangers not found.",
  "The vibes exist. The files... not yet.",
  "Even tumbleweeds are looking for a track here.",
  "This desert is waiting for your sound to hit.",
  "No music? That's actually wild. Let's fix that.",
  "Crickets. Literal crickets. 🦗",
];

export default function EmptyReleases({ variant = 'creator' }) {
  const [quipIdx, setQuipIdx] = useState(0);
  const [fading,  setFading]  = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setQuipIdx(i => (i + 1) % QUIPS.length);
        setFading(false);
      }, 400);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={`er-wrap ${variant === 'listener' ? 'er-wrap--listener' : ''}`}>
      {/* Desert floor */}
      <div className="er-desert">
        <div className="er-dune er-dune--far" />
        <div className="er-dune er-dune--mid" />
        <div className="er-dune er-dune--near" />
      </div>

      {/* Tumbleweeds */}
      <div className="er-tumbleweed er-tw1">&#9643;</div>
      <div className="er-tumbleweed er-tw2">&#9643;</div>

      {/* Dust motes */}
      {[...Array(6)].map((_, i) => (
        <div key={i} className={`er-dust er-dust--${i}`} />
      ))}

      {/* Main mascot */}
      <div className="er-mascot-wrap">
        {/* Speech bubble */}
        <div className={`er-bubble ${fading ? 'er-bubble--fade' : ''}`}>
          {QUIPS[quipIdx]}
        </div>

        {/* Mascot image with bounce + float animation */}
        <div className="er-mascot-img-wrap">
          <img
            src="/empty-releases.png"
            alt="Empty library mascot"
            className="er-mascot-img"
            draggable={false}
            loading="eager"
          />

        </div>
      </div>

      {/* Subtitle */}
      <div className="er-label">
        {variant === 'creator'
          ? 'Your catalog is empty — upload your first release to get started.'
          : 'This artist hasn\'t released anything on Reef yet.'}
      </div>
    </div>
  );
}
