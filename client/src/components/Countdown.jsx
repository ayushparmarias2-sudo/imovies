import { useEffect, useState } from 'react';

/** Counts down to `until`; calls onExpire once when it reaches zero. The remaining time is derived from a ticking clock. */
export default function Countdown({ until, onExpire }) {
  const [now, setNow] = useState(() => Date.now());
  const left = Math.max(0, Math.floor((new Date(until) - now) / 1000));
  const expired = left === 0;

  useEffect(() => {
    if (expired) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expired, until]);
  useEffect(() => { if (expired) onExpire?.(); }, [expired]); // eslint-disable-line react-hooks/exhaustive-deps -- fire once per expiry; onExpire is a fresh closure each render

  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  return <span className={left < 60 ? 'text-danger fw-bold' : 'fw-bold'} aria-live="off">{mm}:{ss}</span>;
}
