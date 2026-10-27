import { money } from '../format.js';

const stateOf = (seat, selected) => {
  if (selected.has(seat.label)) return 'selected';
  if (seat.heldByYou) return 'yours';
  if (seat.status === 'BOOKED') return 'booked';
  if (seat.status === 'HELD') return 'held';
  return seat.category === 'PREMIUM' ? 'premium' : 'available';
};
const WORDS = { selected: 'selected', yours: 'reserved by you', booked: 'booked', held: 'temporarily reserved', premium: 'available', available: 'available' };

export const SeatLegend = () => (
  <ul className="seat-legend list-inline small" aria-label="Seat legend">
    {[['available', 'Available'], ['premium', 'Premium'], ['selected', 'Selected'], ['held', 'Reserved by others'], ['yours', 'Reserved by you'], ['booked', 'Booked']].map(([k, t]) => (
      <li key={k} className="list-inline-item"><span className={`seat seat-${k} seat-demo`} aria-hidden="true" /> {t}</li>
    ))}
  </ul>
);

/** Presentational seat grid. Selection state lives in the parent; the server remains the authority on availability. */
export default function SeatMap({ seats, selected, onToggle }) {
  const rows = [];
  for (const s of seats) {
    if (!rows.length || rows[rows.length - 1].row !== s.row) rows.push({ row: s.row, seats: [] });
    rows[rows.length - 1].seats.push(s);
  }
  return (
    <div className="seat-scroll">
      <div className="screen-bar" aria-hidden="true">SCREEN</div>
      <div role="group" aria-label="Seat map" className="seat-grid">
        {rows.map(({ row, seats: rs }) => (
          <div className="seat-row" key={row}>
            <span className="row-label" aria-hidden="true">{row}</span>
            {rs.map((s, i) => {
              const st = stateOf(s, selected);
              const disabled = !['selected', 'available', 'premium'].includes(st);
              return (
                <span key={s.label} className={i === Math.floor(rs.length / 2) ? 'aisle-gap' : undefined}>
                  <button type="button" className={`seat seat-${st}`} disabled={disabled} aria-pressed={st === 'selected'}
                    title={`${s.label} · ${money(s.price)}`} onClick={() => onToggle(s)}>
                    <span aria-hidden="true">{s.number}</span>
                    <span className="visually-hidden">{`Seat ${s.label}, ${s.category.toLowerCase()}, ${money(s.price)}, ${WORDS[st]}`}</span>
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
