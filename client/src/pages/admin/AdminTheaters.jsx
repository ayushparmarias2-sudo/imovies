import { useState } from 'react';
import { api } from '../../api.js';
import { useApi } from '../../useApi.js';
import { EmptyState, ErrorState, Loading } from '../../components/State.jsx';
import { Field, FormAlert } from '../../components/AdminBits.jsx';
import { errorText } from '../../format.js';

const blankScreen = () => ({ name: 'Screen 1', rows: 8, seatsPerRow: 12, premiumRows: 2 });

export default function AdminTheaters() {
  const list = useApi('/theaters');
  const [form, setForm] = useState(null);
  const [editId, setEditId] = useState(null);
  const [orig, setOrig] = useState('');
  const [msg, setMsg] = useState('');
  const [flash, setFlash] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setScreen = (i, k, v) => set('screens', form.screens.map((s, j) => (j === i ? { ...s, [k]: v } : s)));

  const open = (t) => {
    const f = t ? { name: t.name, city: t.city, address: t.address, screens: t.screens.map((s) => ({ ...s })) } : { name: '', city: 'Indore', address: '', screens: [blankScreen()] };
    setForm(f); setEditId(t?.id || null); setOrig(JSON.stringify(f.screens)); setMsg('');
  };
  const save = async (e) => {
    e.preventDefault(); setMsg('');
    const screens = form.screens.map((s) => ({ name: s.name, rows: Number(s.rows), seatsPerRow: Number(s.seatsPerRow), premiumRows: Number(s.premiumRows) }));
    const body = { name: form.name, city: form.city, address: form.address };
    if (!editId || JSON.stringify(form.screens) !== orig) body.screens = screens; // untouched screens are not resent (locked once shows exist)
    try {
      await api(editId ? `/theaters/${editId}` : '/theaters', { method: editId ? 'PUT' : 'POST', body });
      setFlash(editId ? 'Theater updated.' : 'Theater created.'); setForm(null); list.reload();
    } catch (err) { setMsg(errorText(err)); }
  };
  const remove = async (t) => {
    if (!window.confirm(`Delete "${t.name}"?`)) return;
    try { await api(`/theaters/${t.id}`, { method: 'DELETE' }); setFlash('Theater deleted.'); list.reload(); } catch (err) { setFlash(errorText(err)); }
  };

  return (
    <>
      <div className="d-flex justify-content-between mb-3"><h2 className="h5 mb-0">Theaters</h2>{!form && <button className="btn btn-accent btn-sm" onClick={() => open(null)}>+ Add theater</button>}</div>
      {flash && <div className="alert alert-info py-2" role="status">{flash}</div>}
      {form && (
        <form className="card im-card mb-4" onSubmit={save}><div className="card-body">
          <h3 className="h6">{editId ? 'Edit theater' : 'New theater'}</h3><FormAlert msg={msg} />
          <div className="row g-2">
            <div className="col-md-4"><Field id="t-name" label="Name"><input id="t-name" className="form-control" required minLength="2" value={form.name} onChange={(e) => set('name', e.target.value)} /></Field></div>
            <div className="col-md-3"><Field id="t-city" label="City"><input id="t-city" className="form-control" required value={form.city} onChange={(e) => set('city', e.target.value)} /></Field></div>
            <div className="col-md-5"><Field id="t-addr" label="Address"><input id="t-addr" className="form-control" required minLength="5" value={form.address} onChange={(e) => set('address', e.target.value)} /></Field></div>
          </div>
          <h4 className="h6 mt-2">Screens</h4>
          {form.screens.map((s, i) => (
            <div className="row g-2 align-items-end mb-2" key={i}>
              <div className="col-6 col-md-3"><Field id={`s-n${i}`} label="Name"><input id={`s-n${i}`} className="form-control form-control-sm" required value={s.name} onChange={(e) => setScreen(i, 'name', e.target.value)} /></Field></div>
              <div className="col-4 col-md-2"><Field id={`s-r${i}`} label="Rows (≤26)"><input id={`s-r${i}`} type="number" min="1" max="26" className="form-control form-control-sm" required value={s.rows} onChange={(e) => setScreen(i, 'rows', e.target.value)} /></Field></div>
              <div className="col-4 col-md-3"><Field id={`s-s${i}`} label="Seats per row (≤30)"><input id={`s-s${i}`} type="number" min="1" max="30" className="form-control form-control-sm" required value={s.seatsPerRow} onChange={(e) => setScreen(i, 'seatsPerRow', e.target.value)} /></Field></div>
              <div className="col-4 col-md-2"><Field id={`s-p${i}`} label="Premium rows"><input id={`s-p${i}`} type="number" min="0" className="form-control form-control-sm" value={s.premiumRows} onChange={(e) => setScreen(i, 'premiumRows', e.target.value)} /></Field></div>
              <div className="col-auto mb-2"><button type="button" className="btn btn-outline-danger btn-sm" disabled={form.screens.length === 1} onClick={() => set('screens', form.screens.filter((_, j) => j !== i))}>Remove</button></div>
            </div>
          ))}
          <button type="button" className="btn btn-outline-light btn-sm" onClick={() => set('screens', [...form.screens, { ...blankScreen(), name: `Screen ${form.screens.length + 1}` }])}>+ Add screen</button>
          <div className="mt-3 d-flex gap-2"><button className="btn btn-accent btn-sm">{editId ? 'Save changes' : 'Create theater'}</button><button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setForm(null)}>Cancel</button></div>
        </div></form>
      )}
      {list.loading && <Loading />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {list.data?.length === 0 && <EmptyState title="No theaters yet" />}
      {list.data?.length > 0 && (
        <div className="table-responsive"><table className="table table-sm align-middle"><thead><tr><th>Name</th><th>City</th><th>Address</th><th>Screens</th><th /></tr></thead>
          <tbody>{list.data.map((t) => (
            <tr key={t.id}><td>{t.name}</td><td>{t.city}</td><td>{t.address}</td><td>{t.screens.map((s) => `${s.name} (${s.rows * s.seatsPerRow})`).join(', ')}</td>
              <td className="text-end text-nowrap"><button className="btn btn-outline-light btn-sm me-1" onClick={() => open(t)}>Edit</button><button className="btn btn-outline-danger btn-sm" onClick={() => remove(t)}>Delete</button></td></tr>
          ))}</tbody></table></div>
      )}
    </>
  );
}
