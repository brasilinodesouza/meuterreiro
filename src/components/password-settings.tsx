'use client';

import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, KeyRound, LoaderCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { changePassword } from '@/lib/passwords';

export function PasswordForm({ target, onSaved }: { target?: { houseId: string; userId: string }; onSaved?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !supabase) return;
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setBusy(true); setError(''); setNotice('');
    try {
      await changePassword(supabase, values, target);
      form.reset(); setVisible(false); setNotice('Senha alterada com sucesso.'); onSaved?.();
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível alterar a senha.'); }
    finally { setBusy(false); }
  }
  return <form className="form" onSubmit={submit}>
    <label>Nova senha<span className="password-field"><input name="password" type={visible ? 'text' : 'password'} required minLength={6} maxLength={20} autoComplete="new-password" placeholder="De 6 a 20 caracteres" disabled={busy} /><button type="button" className="password-toggle" aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={visible} disabled={busy} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></span><small>6 a 20 caracteres</small></label>
    <label>Confirmar nova senha<input name="confirm_password" type={visible ? 'text' : 'password'} required minLength={6} maxLength={20} autoComplete="new-password" placeholder="Repita a nova senha" disabled={busy} /></label>
    {error && <p className="alert error" role="alert">{error}</p>}
    {notice && <p className="alert success" role="status">{notice}</p>}
    <button type="submit" className="button primary" disabled={busy || !supabase}>{busy && <LoaderCircle size={16} className="spin" />}{busy ? 'Salvando…' : 'Salvar nova senha'}</button>
  </form>;
}

export function PasswordSettings() {
  return <section className="panel settings-panel password-settings"><span className="stat-icon"><KeyRound /></span><h2>Alterar minha senha</h2><p>Defina uma nova senha para acessar sua conta.</p><PasswordForm /></section>;
}
