'use client';

import { useEffect, useState } from 'react';
import { Copy, Link, LoaderCircle, RefreshCw, Trash2 } from 'lucide-react';
import { createHouseInvite, deleteHouseUser, invitationLink, listHouseMembers, membershipRpc, roleLabels, type HouseMember } from '@/lib/memberships';
import type { Medium } from '@/lib/data';
import { Modal } from './modal';
import { PasswordForm } from './password-settings';

export function HouseUsers({ houseId, isOwner, mediums }: { houseId: string; isOwner: boolean; mediums: Medium[] }) {
  const [members, setMembers] = useState<HouseMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [invite, setInvite] = useState<{ token: string; expires_at: string } | null>(null);
  const [link, setLink] = useState('');
  const [confirmation, setConfirmation] = useState<HouseMember | null>(null);
  const [deletion, setDeletion] = useState<HouseMember | null>(null);
  const [deletionLogin, setDeletionLogin] = useState('');
  const [deletionError, setDeletionError] = useState('');
  const [passwordMember, setPasswordMember] = useState<HouseMember | null>(null);
  async function reload() {
    setError(''); setLoading(true);
    try { setMembers(await listHouseMembers(houseId)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível carregar os médiuns.'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let alive = true;
    listHouseMembers(houseId).then(data => { if (alive) setMembers(data); }).catch(err => { if (alive) setError(err.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [houseId]);
  async function generateInvite() {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const created = await createHouseInvite(houseId);
      setInvite(created); setLink(invitationLink(window.location.origin, created.token));
      setNotice('Convite criado. Envie o link para quem faz parte da casa.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível criar o convite.'); }
    finally { setBusy(false); }
  }
  async function save(member: HouseMember, change: { role: 'usuario' | 'administrador' } | { medium_id: string | null }) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if ('role' in change) await membershipRpc('terreiro_set_role', { p_house: houseId, p_user: member.user_id, p_role: change.role });
      else await membershipRpc('terreiro_link_medium', { p_house: houseId, p_user: member.user_id, p_medium: change.medium_id });
      setMembers(await listHouseMembers(houseId));
      setConfirmation(null); setNotice('Alteração salva. O médium verá o novo acesso ao atualizar a página.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }
  async function removeUser() {
    if (busy || !isOwner || !deletion || deletionLogin.trim() !== deletion.username) return;
    setBusy(true); setDeletionError(''); setError(''); setNotice('');
    try {
      await deleteHouseUser(houseId, deletion);
      setMembers(current => current.filter(member => member.user_id !== deletion.user_id));
      setDeletion(null); setDeletionLogin('');
      setNotice('Conta do médium apagada. A conta de login foi excluída; o cadastro de médium e o histórico financeiro foram preservados.');
    } catch (err) { setDeletionError(err instanceof Error ? err.message : 'Não foi possível apagar a conta do médium.'); }
    finally { setBusy(false); }
  }
  return <section className="panel settings-panel house-users">
    <div className="users-heading"><div><h2>Médiuns do terreiro</h2><p>Todos entram como médiuns. Somente o médium responsável pode alterar as permissões.</p></div><button className="button secondary" disabled={loading || busy} onClick={reload}><RefreshCw size={16} /> Atualizar lista</button></div>
    {isOwner && <div className="invite-box"><h3>Convide as pessoas da casa</h3><p>O link vale por 7 dias e pode ser usado por mais de uma pessoa. Gerar outro link invalida o anterior.</p><button className="button primary" disabled={busy} onClick={generateInvite}>{busy ? <LoaderCircle size={16} className="spin" /> : <Link size={16} />}{invite ? 'Gerar novo convite' : 'Gerar link de convite'}</button>
      {invite && <div className="invite-result"><label>Link de convite<input readOnly value={link} onFocus={event => event.target.select()} /></label><button className="button secondary" onClick={async () => { try { await navigator.clipboard.writeText(link); setNotice('Link copiado.'); } catch { setNotice('Selecione e copie o link no campo acima.'); } }}><Copy size={16} /> Copiar link</button><small>Válido até {new Date(invite.expires_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.</small></div>}
    </div>}
    {error && <p className="alert error" role="alert">{error}</p>}{notice && <p className="alert success" role="status">{notice}</p>}
    {loading ? <p role="status">Carregando médiuns…</p> : <div className="table-scroll"><table><thead><tr><th>Pessoa</th><th>Permissão</th><th>Cadastro de médium</th><th>Senha</th>{isOwner && <th>Ação</th>}</tr></thead><tbody>{members.map(member => <tr key={member.user_id}><td><strong>{member.full_name}</strong><small className="member-login">Login: {member.username}</small></td><td>{roleLabels[member.role]}</td><td>{member.role === 'responsavel' ? 'Médium responsável pela casa' : <select aria-label={`Cadastro de médium de ${member.full_name}`} value={member.medium_id ?? ''} disabled={busy} onChange={event => void save(member, { medium_id: event.target.value || null })}><option value="">Sem vínculo com médium</option>{mediums.filter(m => !members.some(other => other.user_id !== member.user_id && other.medium_id === m.id)).map(m => <option value={m.id} key={m.id}>{m.name}</option>)}</select>}</td><td><button type="button" className="button secondary" disabled={busy} aria-label={`Alterar senha de ${member.full_name}`} onClick={() => { setNotice(''); setPasswordMember(member); }}>Alterar senha</button></td>{isOwner && <td>{member.role === 'responsavel' ? <span>Acesso protegido</span> : <div className="member-actions"><button className="button secondary" disabled={busy} onClick={() => { setError(''); setConfirmation(member); }}>{member.role === 'administrador' ? 'Tornar médium' : 'Tornar médium administrador'}</button><button type="button" className="button user-delete-button" aria-label={`Apagar conta do médium ${member.full_name}`} disabled={busy} onClick={() => { setDeletionError(''); setDeletionLogin(''); setDeletion(member); }}><Trash2 size={16} /> Apagar conta do médium</button></div>}</td>}</tr>)}</tbody></table></div>}
    <p className="users-help">Associe a conta ao cadastro correto de médium para liberar a consulta dos próprios dados e mensalidades.</p>
    {passwordMember && <Modal title="Alterar senha" onClose={() => setPasswordMember(null)}><p>Defina uma nova senha para <strong>{passwordMember.full_name}</strong> (login: <strong>{passwordMember.username}</strong>).</p><PasswordForm target={{ houseId, userId: passwordMember.user_id }} onSaved={() => { setPasswordMember(null); setNotice(`Senha de ${passwordMember.full_name} alterada com sucesso.`); }} /></Modal>}
    {confirmation && <Modal title="Alterar permissão" onClose={() => { if (!busy) setConfirmation(null); }}><p>{confirmation.role === 'administrador' ? `${confirmation.full_name} passará a consultar apenas seus próprios dados e mensalidades.` : `${confirmation.full_name} poderá gerenciar cadastros, financeiro e dados do terreiro.`}</p>{error && <p className="alert error" role="alert">{error}</p>}<div className="users-actions"><button className="button secondary" disabled={busy} onClick={() => setConfirmation(null)}>Cancelar</button><button className="button primary" disabled={busy} onClick={() => void save(confirmation, { role: confirmation.role === 'administrador' ? 'usuario' : 'administrador' })}>{busy ? 'Salvando…' : 'Confirmar alteração'}</button></div></Modal>}
    {deletion && <Modal title="Apagar conta do médium" onClose={() => { if (!busy) setDeletion(null); }}>
      <form className="form" onSubmit={event => { event.preventDefault(); void removeUser(); }}>
        <p>A conta de <strong>{deletion.full_name}</strong> (login: <strong>{deletion.username}</strong>) será excluída definitivamente. Essa pessoa perderá o acesso e precisará criar uma nova conta para entrar novamente.</p>
        <p>O cadastro de médium, as mensalidades e o histórico financeiro serão preservados.</p>
        <label>Digite o login {deletion.username} para confirmar<input autoFocus autoComplete="off" spellCheck={false} required value={deletionLogin} disabled={busy} onChange={event => setDeletionLogin(event.target.value)} /></label>
        {deletionError && <p className="alert error" role="alert">{deletionError}</p>}
        <div className="users-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => setDeletion(null)}>Cancelar</button><button type="submit" className="button user-delete-button" disabled={busy || deletionLogin.trim() !== deletion.username}>{busy && <LoaderCircle size={16} className="spin" />}{busy ? 'Apagando…' : 'Apagar definitivamente'}</button></div>
      </form>
    </Modal>}
  </section>;
}
