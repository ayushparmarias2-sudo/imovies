import { useState } from 'react';

const hue = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

/** Poster image with a generated gradient fallback (used when there is no URL or the image fails). */
export default function Poster({ title, url, className = '', decorative = false }) {
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return <img src={url} alt={decorative ? '' : `${title} poster`} className={`poster ${className}`} loading="lazy" onError={() => setFailed(true)} />;
  }
  const h = hue(title);
  return (
    <div className={`poster poster-fallback ${className}`} {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': `${title} poster placeholder` })}
      style={{ background: `linear-gradient(160deg, hsl(${h} 55% 28%), hsl(${(h + 50) % 360} 60% 12%))` }}>
      <span>{title}</span>
    </div>
  );
}
