'use client';

import { useState, type FormEvent } from 'react';
import { LoaderCircle } from 'lucide-react';
import { membershipRpc, parseInvite } from '@/lib/memberships';

export function JoinHouse({ invitation, onJoined, onCancel }: { invitation: string; onJoined: () => void; onCancel?: () => void }) {
  const [value, setValue] = useState(invitation);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try { await membershipRpc('terreiro_join', { p_token: parseInvite(value) }); onJoined(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível aceitar o convite.'); }
    finally { setBusy(false); }
  }
  return <form className="form" onSubmit={submit}><label>Link ou código de convite<input name="invite" required value={value} onChange={event => setValue(event.target.value)} placeholder="Cole o convite recebido do responsável" autoComplete="off" /></label><p>Você entrará como usuário. O responsável poderá alterar sua permissão depois.</p>{error && <p className="alert error" role="alert">{error}</p>}<button className="button primary" disabled={busy}>{busy && <LoaderCircle size={17} className="spin" />}{busy ? 'Vinculando…' : 'Aceitar convite e entrar'}</button>{onCancel && <button className="text-button" type="button" disabled={busy} onClick={onCancel}>Cancelar convite</button>}</form>;
}
