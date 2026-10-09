'use client';

import { useState, type FormEvent } from 'react';
import { Check, CircleHelp, Eye, EyeOff, Leaf, LoaderCircle, ShieldCheck } from 'lucide-react';
import { z } from 'zod';
import { Brand } from './brand';
import { supabase } from '@/lib/supabase';
import { parseCredentials, parseEmail, parseNewPassword, parseSignup, signInWithUsername, USERNAME_PATTERN } from '@/lib/auth';

type Mode = 'login' | 'signup' | 'reset';
export function Auth({ recovery = false, onDone }: { recovery?: boolean; onDone?: () => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  function changeMode(next: Mode) { setMode(next); setError(''); setMessage(''); setShowPassword(false); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setError(''); setMessage('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      // Valida antes de enviar qualquer dado ao serviço de autenticação.
      const input = recovery ? parseNewPassword(values) : mode === 'signup' ? parseSignup(values) : mode === 'reset' ? parseEmail(values.email) : parseCredentials(values);
      if (!supabase) throw new Error('O acesso ainda está em preparação. O cadastro será liberado em breve.');
      setBusy(true);
      if (recovery) {
        const { error } = await supabase.auth.updateUser({ password: input as string });
        if (error) throw new Error('Não foi possível trocar a senha. Solicite um novo link de recuperação.');
        onDone?.();
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(input as string, { redirectTo: window.location.origin });
        if (error) throw new Error('Não foi possível enviar o link. Tente novamente em instantes.');
        setMessage('Se este e-mail tiver uma conta, você receberá o link para redefinir a senha.');
      } else if (mode === 'signup') {
        const account = input as ReturnType<typeof parseSignup>;
        const { data, error } = await supabase.auth.signUp({ email: account.email, password: account.password, options: { data: { username: account.username }, emailRedirectTo: window.location.origin } });
        if (error) throw new Error('Não foi possível cadastrar. Tente outro usuário ou e-mail, ou aguarde alguns instantes.');
        if (!data.session) setMessage('Confira seu e-mail para confirmar a conta. Depois entre com seu usuário e senha.');
      } else {
        await signInWithUsername(supabase, input);
      }
    } catch (err) { setError(err instanceof z.ZodError ? err.issues[0].message : err instanceof Error ? err.message : 'Não foi possível concluir. Tente novamente.'); }
    finally { setBusy(false); }
  }
  const signup = !recovery && mode === 'signup';
  return <main className="auth-page">
    <section className="auth-story"><Brand /><div className="auth-copy"><span className="eyebrow">CADA CASA TEM SUA HISTÓRIA</span><h1>Mais tempo<br />para o que<br /><em>tem valor.</em></h1><p>Um espaço para organizar seu terreiro<br />e cuidar de quem caminha com você.</p><div className="auth-benefits"><span><Check size={16} /> Pessoas e vínculos em um só lugar</span><span><Check size={16} /> Sua casa no celular e no computador</span><span><Check size={16} /> Um espaço privado para cada terreiro</span></div></div><div className="auth-leaf" aria-hidden="true"><Leaf size={210} strokeWidth={0.65} /></div><small className="auth-caption">Organização que acolhe. Cuidado que permanece.</small></section>
    <section className="auth-access"><div className="auth-box">
      <span className="eyebrow">BEM-VINDO AO MEUTERREIRO</span><h2>{recovery ? 'Escolha uma nova senha.' : signup ? 'Cadastre sua conta.' : mode === 'reset' ? 'Recupere seu acesso.' : 'Entre na sua casa.'}</h2>
      <p>{recovery ? 'Defina sua nova senha para voltar à sua casa.' : signup ? 'Escolha seu usuário e senha. O e-mail confirma sua conta e permite recuperar o acesso.' : mode === 'reset' ? 'Informe o e-mail usado no cadastro.' : 'Use seu usuário e senha para continuar.'}</p>
      {!supabase && <div className="setup-notice" id="auth-unavailable" role="status"><CircleHelp size={21} /><div><strong>Acesso em preparação</strong><p>O login e o cadastro serão liberados após a conexão do banco de dados.</p></div></div>}
      <form className="form" onSubmit={submit} key={recovery ? 'recovery' : mode}>
        {!recovery && mode !== 'reset' && <label>Usuário<input name="username" required minLength={6} maxLength={20} pattern={USERNAME_PATTERN} title="De 6 a 20 caracteres: letras, números, ponto, hífen ou sublinhado." autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="Seu usuário" /><small>6 a 20 caracteres · letras, números, ponto, hífen ou _</small></label>}
        {!recovery && (signup || mode === 'reset') && <label>E-mail<input name="email" type="email" required maxLength={254} autoComplete="email" placeholder="nome@exemplo.com" /></label>}
        {(recovery || mode !== 'reset') && <label>Senha<span className="password-field"><input name="password" type={showPassword ? 'text' : 'password'} required minLength={6} maxLength={20} autoComplete={signup || recovery ? 'new-password' : 'current-password'} placeholder="De 6 a 20 caracteres" /><button type="button" className="password-toggle" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={showPassword} onClick={()=>setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></span><small>6 a 20 caracteres</small></label>}
        {(signup || recovery) && <label>Confirmar senha<input name="confirm_password" type={showPassword ? 'text' : 'password'} required minLength={6} maxLength={20} autoComplete="new-password" placeholder="Repita sua senha" /></label>}
        {!recovery && mode === 'login' && <button type="button" className="text-button forgot" disabled={busy} onClick={()=>changeMode('reset')}>Esqueci minha senha</button>}
        {error && <p className="alert error" role="alert">{error}</p>}{message && <p className="alert success" role="status">{message}</p>}
        <button className="button primary" type="submit" disabled={busy || !supabase} aria-describedby={!supabase ? 'auth-unavailable' : undefined}>{busy ? <><LoaderCircle size={17} className="spin"/> Aguarde…</> : recovery ? 'Salvar nova senha' : signup ? 'Criar minha conta' : mode === 'reset' ? 'Enviar link de recuperação' : 'Entrar'}</button>
      </form>
      {!recovery && <div className="auth-registration"><p>{mode === 'login' ? 'Ainda não tem uma conta?' : 'Já tem uma conta?'}</p><button type="button" disabled={busy} className={`button ${mode === 'login' ? 'secondary' : 'text-button'}`} onClick={()=>changeMode(mode === 'login' ? 'signup' : 'login')}>{mode === 'login' ? 'Cadastrar-se' : 'Voltar para entrar'}</button></div>}
      <p className="auth-privacy"><ShieldCheck size={16} /> Cada terreiro tem seu próprio espaço.</p>
    </div></section>
  </main>;
}
