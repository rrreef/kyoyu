import { useState, useEffect } from 'react';
import './SuccessToast.css';

export default function SuccessToast() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('reef_pw_reset_success')) {
      sessionStorage.removeItem('reef_pw_reset_success');
      setVisible(true);
      const t = setTimeout(() => setVisible(false), 4000);
      return () => clearTimeout(t);
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="success-toast" role="status">
      <div className="success-toast__icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
      </div>
      <div className="success-toast__text">
        <span className="success-toast__title">Password saved</span>
        <span className="success-toast__sub">Your account password has been updated.</span>
      </div>
      <button className="success-toast__close" onClick={() => setVisible(false)} aria-label="Dismiss">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M1 1l10 10M11 1L1 11"/>
        </svg>
      </button>
    </div>
  );
}
