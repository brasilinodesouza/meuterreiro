'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowRight, Bell, Check, ChevronRight, House as HouseIcon, Leaf, Menu, Plus, Search, Settings, ShieldCheck, ShoppingBag, Users, Wallet, X, CalendarDays, Phone, Pencil, LoaderCircle } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { formatDate, houseSchema, mediumSchema, sexLabels, states, statusLabels, type House, type Medium } from '@/lib/data';
import { Modal } from './modal';
import { Auth } from './auth';
import { Brand } from './brand';
import { AppSidebar } from './app-sidebar';
import { MediumSearch } from './medium-search';
import { BirthNumerology, MediumHeadOrixas } from './birth-numerology';
import { BirthdayNotifications, BirthdayPanel } from './birthday-notifications';
import { disableBirthdayPush } from '@/lib/birthday-push';
import { FinancePages, type FinanceView } from './finance-pages';
import { applyFinance, emptyFinance, money, summarize, today, type FinanceCommand, type FinanceState } from '@/lib/finance';
import { importDues, loadFinance, saveFinance } from '@/lib/finance-repository';
import { previewDuesImport, type ImportedDue } from '@/lib/dues-import';

type View = 'inicio' | 'mediuns' | 'configuracoes' | FinanceView;
const navigation = [
  { id: 'inicio', label: 'Visão geral', icon: HouseIcon }, { id: 'mediuns', label: 'Médiuns', icon: Users },
  { id: 'mensalidades', label: 'Mensalidades', icon: CalendarDays }, { id: 'caixa', label: 'Caixa', icon: Wallet },
  { id: 'gastos', label: 'Gastos', icon: ShoppingBag }, { id: 'lembretes', label: 'Lembretes', icon: Bell }, { id: 'configuracoes', label: 'Configurações', icon: Settings },
] as const;
function Submit({ busy, children }: { busy: boolean; children: React.ReactNode }) { return <button className="button primary" disabled={busy} type="submit">{busy ? <LoaderCircle size={17} className="spin" /> : null}{busy ? 'Salvando…' : children}</button>; }

export function TerreiroApp() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [house, setHouse] = useState<House | null>(null);
  const [mediums, setMediums] = useState<Medium[]>([]);
  const [view, setView] = useState<View>('inicio');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<Medium | 'new' | null>(null);
  const [profile, setProfile] = useState<Medium | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('todos');
  const [recovery, setRecovery] = useState(false);
  const [finance, setFinance] = useState<FinanceState>(emptyFinance);
  const [financeUnavailable, setFinanceUnavailable] = useState(Boolean(supabase));
  const financialWrite = useRef(false);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getUser().then(({ data }) => { if (alive) { setUser(data.user); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (alive) {
        if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') { setHouse(null); setMediums([]); setFinance(emptyFinance()); setFinanceUnavailable(true); setProfile(null); setEditor(null); }
        setUser(session?.user ?? null);
        if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      }
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!user || !supabase) return;
    let alive = true;
    async function load() {
      setLoading(true);
      const result = await supabase!.from('terreiros').select('*').eq('owner_id', user!.id).maybeSingle();
      if (!alive) return;
      if (result.error) { setError('Não foi possível carregar sua casa. Confira a configuração do banco e tente novamente.'); setLoading(false); return; }
      setHouse(result.data);
      if (result.data) {
        const people = await supabase!.from('mediuns').select('*').eq('terreiro_id', result.data.id).order('name');
        if (!alive) return;
        if (people.error) setError('Não foi possível carregar os médiuns. Recarregue a página para tentar novamente.');
        else setMediums(people.data ?? []);
        try {
          const financial = await loadFinance(result.data.id);
          if (!alive) return;
          setFinance(financial); setFinanceUnavailable(false);
        } catch (err) {
          if (!alive) return;
          setFinanceUnavailable(true); setError(err instanceof Error ? err.message : 'Não foi possível carregar o financeiro.');
        }
      }
      setLoading(false);
    }
    void load().catch(() => { if (alive) { setError('Não foi possível carregar os dados. Confira a conexão e recarregue a página.'); setLoading(false); } });
    return () => { alive = false; };
  }, [user]);

  async function commitFinance(command: FinanceCommand) {
    if (!house || financeUnavailable) throw new Error('O financeiro não está disponível. Recarregue a página para tentar novamente.');
    if (financialWrite.current) throw new Error('Aguarde o registro anterior terminar.');
    financialWrite.current = true;
    try {
      // Valida no cliente; o banco também verifica o acesso e as regras de cada registro.
      applyFinance(finance,command,house.id,mediums.map(m=>m.id));
      await saveFinance(house.id,command);
      try { setFinance(await loadFinance(house.id)); }
      catch { setFinanceUnavailable(true); setError('Registro salvo no banco, mas o resumo não pôde ser atualizado. Recarregue a página.'); }
      setNotice(command.type==='expense' && command.reminder_id ? 'Compra concluída! O gasto foi registrado e o caixa atualizado.' : command.type==='pay' ? 'Pagamento registrado e caixa atualizado.' : command.type==='dues' ? 'Mensalidades criadas. Cadastros existentes foram preservados.' : 'Registro salvo com sucesso.');
    } finally { financialWrite.current = false; }
  }
  async function commitImport(rows: ImportedDue[]) {
    if (!house || financeUnavailable) throw new Error('Recarregue o financeiro antes de importar.');
    if (financialWrite.current) throw new Error('Aguarde o registro anterior terminar.');
    if (previewDuesImport(rows, mediums, finance.dues).some(item => item.state === 'error')) throw new Error('Confira os nomes e as divergências antes de importar.');
    financialWrite.current = true;
    try {
      const result = await importDues(house.id, rows);
      try { setFinance(await loadFinance(house.id)); }
      catch { setFinanceUnavailable(true); setError('Importação salva no banco. Recarregue a página para atualizar o resumo.'); }
      setNotice(`Importação concluída: ${result.imported} mensalidades e ${result.payments} pagamentos registrados.`);
      return result;
    } finally { financialWrite.current = false; }
  }
  async function logout() {
    if (supabase) {
      try { await disableBirthdayPush(); } catch { /* A sessão revogada também impede os envios agendados. */ }
      const result = await supabase.auth.signOut();
      if (result.error) { setError('Não foi possível sair. Tente novamente.'); return; }
    }
    setUser(null); setHouse(null); setMediums([]); setFinance(emptyFinance()); setFinanceUnavailable(Boolean(supabase)); setView('inicio'); setError(''); setNotice(''); setProfile(null); setEditor(null);
  }
  function exportData() {
    const blob = new Blob([JSON.stringify({ version: 2, exported_at: new Date().toISOString(), house, mediums, finance, finance_complete: !financeUnavailable }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'meuterreiro-exportacao.json'; a.click(); URL.revokeObjectURL(url);
    setNotice('Exportação concluída. Guarde o arquivo em um local seguro.');
  }
  if (loading) return <main className="loading"><Brand /><LoaderCircle className="spin" /><p>Preparando sua casa…</p></main>;
  if (recovery) return <Auth recovery onDone={() => setRecovery(false)} />;
  if (!user) return <Auth />;
  if (!house) return <main className="onboarding"><Brand /><div className="onboarding-card"><span className="eyebrow">PRIMEIRO PASSO</span><h1>Vamos dar um lugar<br />à sua casa.</h1><p>Cadastre seu terreiro para começar a organizar as pessoas e a rotina.</p>{error && <p className="alert error" role="alert">{error}</p>}<HouseForm userId={user!.id} onSave={h => { setHouse(h); setError(''); void loadFinance(h.id).then(f=>{setFinance(f);setFinanceUnavailable(false);}).catch(()=>{setFinanceUnavailable(true);setError('Execute a migração 002 para habilitar o financeiro.');}); }} /><button className="text-button" onClick={logout}>Sair da conta</button></div></main>;

  const displayName = typeof user.user_metadata.full_name === 'string' && user.user_metadata.full_name ? user.user_metadata.full_name : null;
  const accountName = typeof user.user_metadata.username === 'string' && user.user_metadata.username ? user.user_metadata.username : user.email ?? 'Minha conta';
  const filtered = mediums.filter(m => m.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')) && (status === 'todos' || m.status === status));
  const activeCount = mediums.filter(m => m.status === 'ativo').length;
  const totals = summarize(finance,today().slice(0,7));
  const pendingDues = finance.dues.filter(d=>d.status==='pendente');
  const title = navigation.find(n => n.id === view)!.label;
  const selectView = (id: View) => { setView(id); setMobileMenu(false); setNotice(''); };

  return <div className={`app-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
    <AppSidebar house={house} navigation={navigation} view={view} mobileOpen={mobileMenu} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(value => !value)} onCloseMobile={() => setMobileMenu(false)} onNavigate={selectView} onLogout={logout} />
    {mobileMenu && <button aria-label="Fechar menu" className="menu-overlay" onClick={() => setMobileMenu(false)} />}
    <div className="workspace"><header className="topbar"><div className="breadcrumb"><button className="menu-button" aria-label="Abrir menu" onClick={() => setMobileMenu(!mobileMenu)}><Menu /></button><span>Minha casa</span><ChevronRight size={14} /><strong>{title}</strong></div><div className="topbar-right"><span className="private"><ShieldCheck size={15} /> Espaço privado</span><span className="user-avatar" title={displayName ?? accountName}>{(displayName ?? accountName)[0].toUpperCase()}</span></div></header>
    <main className="main-content">
      {error && <div role="alert" className="alert error">{error}<button aria-label="Fechar aviso" onClick={() => setError('')}><X size={16} /></button></div>}
      {notice && <div role="status" className="alert success">{notice}<button aria-label="Fechar aviso" onClick={() => setNotice('')}><X size={16} /></button></div>}
      {view === 'inicio' && <>
        <div className="page-heading"><div><span className="eyebrow">CUIDADO QUE COMEÇA NA ORGANIZAÇÃO</span><h1>Sua casa, em harmonia<span>.</span></h1><p>Um olhar sobre as pessoas e os próximos passos do seu terreiro.</p></div><button className="button primary" onClick={() => setEditor('new')}><Plus size={18} /> Cadastrar médium</button></div>
        <section className="welcome-card"><div><span className="tag"><Leaf size={13} /> NOSSA CASA</span><h2>{house.name}</h2><p>Cada pessoa faz parte dessa história.<br />Cuide dos vínculos, organize o caminho.</p><button className="welcome-link" onClick={() => selectView('configuracoes')}>Ver dados do terreiro <ArrowRight size={17} /></button></div><div className="welcome-art" aria-hidden="true"><div className="art-ring ring-one" /><div className="art-ring ring-two" /><Leaf size={110} strokeWidth={0.8} /><span className="art-spark">✦</span></div></section>
        <section className="stats" aria-label="Resumo da casa"><div className="stat-card"><span className="stat-icon"><Users size={21} /></span><span>Médiuns cadastrados</span><strong>{mediums.length.toString().padStart(2, '0')}</strong><small><span className="green-dot" /> {activeCount} em atividade na casa</small></div><div className="stat-card"><span className="stat-icon amber"><CalendarDays size={21} /></span><span>Mensalidades pendentes</span><strong>{financeUnavailable?'—':pendingDues.length}</strong><small>{financeUnavailable?'Financeiro indisponível':`${money(pendingDues.reduce((a,d)=>a+d.amount_cents,0))} a receber`}</small></div><div className="stat-card"><span className="stat-icon purple"><Wallet size={21} /></span><span>Saldo do caixa</span><strong className="money-total">{financeUnavailable?'—':money(totals.balance)}</strong><small>{financeUnavailable?'Financeiro indisponível':`${money(totals.outgoing)} em gastos neste mês`}</small></div></section>
        <BirthdayPanel mediums={mediums} onOpen={setProfile} /><div className="dashboard-grid"><section className="panel"><div className="panel-heading"><div><h2>Pessoas da casa</h2><p>Quem faz parte do seu terreiro.</p></div><button className="text-button" onClick={() => selectView('mediuns')}>Ver todos <ArrowRight size={16} /></button></div>{mediums.length ? <div className="people-list">{mediums.slice(0,4).map(m => <button className="person-row" key={m.id} onClick={() => setProfile(m)}><Avatar name={m.name} /><span className="person-name"><strong>{m.name}</strong><small>{statusLabels[m.status]}</small></span><span className={`status ${m.status}`}>{statusLabels[m.status]}</span><ChevronRight size={16} /></button>)}</div> : <Empty onNew={() => setEditor('new')} />}</section><section className="panel next-steps"><span className="eyebrow">UM PASSO DE CADA VEZ</span><h2>Comece pelo essencial.</h2><p>A base da sua gestão está nas pessoas e nas informações da casa.</p><div className="step"><span className="step-check"><Check size={14} /></span><div><strong>Cadastre seu terreiro</strong><small>Uma casa, um espaço só seu.</small></div></div><div className="step"><span className={mediums.length ? 'step-check' : 'step-number'}>{mediums.length ? <Check size={14} /> : '2'}</span><div><strong>Traga as pessoas da casa</strong><small>Cadastre e mantenha os perfis em dia.</small></div></div><div className="step"><span className="step-number">3</span><div><strong>Organize o financeiro</strong><small>Mensalidades e gastos atualizam o caixa automaticamente.</small></div></div></section></div>
      </>}
      {view === 'mediuns' && <><div className="page-heading"><div><span className="eyebrow">QUEM CAMINHA COM A CASA</span><h1>Médiuns<span>.</span></h1><p>Cadastros, vínculos e histórias em um só lugar.</p></div><button className="button primary" onClick={() => setEditor('new')}><Plus size={18} /> Cadastrar médium</button></div><section className="panel"><div className="filter-bar"><MediumSearch value={search} onChange={setSearch} /><select aria-label="Filtrar por situação" value={status} onChange={e => setStatus(e.target.value)}><option value="todos">Todas as situações</option>{Object.entries(statusLabels).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select><span>{filtered.length} {filtered.length === 1 ? 'pessoa' : 'pessoas'}</span></div>{mediums.length === 0 ? <Empty onNew={() => setEditor('new')} /> : filtered.length === 0 ? <div className="empty"><Search /><h3>Nenhum cadastro encontrado.</h3><p>Tente outro nome ou altere o filtro.</p></div> : <div className="table-scroll mediums-table-scroll"><table><thead><tr><th>Nome</th><th>Pai/Mãe</th><th>Situação</th><th><span className="sr-only">Perfil</span></th></tr></thead><tbody>{filtered.map(m => <tr key={m.id}><td><button className="table-name" onClick={() => setProfile(m)}><Avatar name={m.name} /><span>{m.name}<small>{m.phone || 'Sem telefone cadastrado'}</small></span></button></td><td><MediumHeadOrixas birthDate={m.birth_date} sex={m.sex} /></td><td><span className={`status ${m.status}`}>{statusLabels[m.status]}</span></td><td><button className="text-button" onClick={() => setProfile(m)}>Ver perfil <ChevronRight size={15} /></button></td></tr>)}</tbody></table></div>}</section></>}
      {view === 'configuracoes' && <><div className="page-heading"><div><span className="eyebrow">DO JEITO DA SUA CASA</span><h1>Configurações<span>.</span></h1><p>Informações do terreiro e uma cópia dos seus cadastros.</p></div></div><div className="settings-grid"><section className="panel settings-panel"><h2>Dados do terreiro</h2><p>As informações que identificam sua casa.</p><HouseForm initial={house} userId={house.owner_id} onSave={h => { setHouse(h); setNotice('Dados do terreiro atualizados.'); }} /></section><section className="panel settings-panel"><span className="stat-icon"><ArrowDownToLine /></span><h2>Seus dados com você</h2><p>Baixe uma cópia em JSON dos cadastros, mensalidades, gastos, caixa e lembretes. A exportação é uma cópia manual; a restauração será adicionada em outra etapa.</p><button className="button secondary" onClick={exportData}><ArrowDownToLine size={17} /> Exportar cadastros</button><div className="account-note"><ShieldCheck size={18} /><div><strong>Conta conectada<small>{displayName ?? accountName} · Login: {accountName}</small></strong></div></div></section></div><BirthdayNotifications userId={user.id} /></>}
      {(['mensalidades','caixa','gastos','lembretes'] as string[]).includes(view) && <FinancePages view={view as FinanceView} finance={finance} mediums={mediums} onSave={commitFinance} onImport={commitImport} onNavigate={next=>{setView(next);setMobileMenu(false);}} unavailable={financeUnavailable} />}
      <footer className="footer"><span>MeuTerreiro <span>·</span> Feito para cuidar da sua casa.</span><span><Leaf size={13} /> Cada casa tem sua história.</span></footer>
    </main></div>
    {profile && <Modal title="Perfil do médium" onClose={() => setProfile(null)}><div className="profile-heading"><Avatar name={profile.name} /><h2>{profile.name}</h2><span className={`status ${profile.status}`}>{statusLabels[profile.status]}</span></div><dl className="profile-data"><div><dt><CalendarDays size={14} /> Data de nascimento</dt><dd>{profile.birth_date ? formatDate(profile.birth_date) : 'Não informada'}</dd></div><div><dt>Sexo</dt><dd>{profile.sex ? sexLabels[profile.sex] : 'Não informado'}</dd></div><div><dt><Phone size={14} /> Telefone</dt><dd>{profile.phone || 'Não informado'}</dd></div></dl><BirthNumerology birthDate={profile.birth_date} sex={profile.sex} /><div className="profile-notes"><h3>Observações</h3><p>{profile.notes || 'Nenhuma observação cadastrada.'}</p></div><button className="button primary" onClick={() => { setEditor(profile); setProfile(null); }}><Pencil size={16} /> Editar cadastro</button></Modal>}
    {editor && <Modal title={editor === 'new' ? 'Cadastrar médium' : 'Editar cadastro'} onClose={() => setEditor(null)}><MediumForm initial={editor === 'new' ? undefined : editor} house={house} onSave={m => { const next = [...mediums.filter(item => item.id !== m.id), m].sort((a,b) => a.name.localeCompare(b.name, 'pt-BR')); setMediums(next); setEditor(null); setNotice('Cadastro salvo com sucesso.'); }} /></Modal>}
  </div>;
}

function Avatar({ name }: { name: string }) { return <span className="avatar">{name.trim().split(/\s+/).slice(0,2).map(n => n[0]).join('').toUpperCase()}</span>; }
function Empty({ onNew }: { onNew: () => void }) { return <div className="empty"><Users size={32} /><h3>Uma casa começa pelas pessoas.</h3><p>Cadastre o primeiro médium para começar.</p><button className="button secondary" onClick={onNew}><Plus size={16} /> Cadastrar médium</button></div>; }
function HouseForm({ initial, userId, onSave }: { initial?: House; userId: string; onSave: (h: House) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(''); const parsed = houseSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setBusy(true);
    try {
      if (!supabase) throw new Error();
      const query = initial ? supabase.from('terreiros').update(parsed.data).eq('id',initial.id) : supabase.from('terreiros').insert({ ...parsed.data, owner_id: userId });
      const result = await query.select().single(); if (result.error) throw result.error; onSave(result.data);
    } catch { setError('Não foi possível salvar o terreiro. Confira a conexão e a configuração do banco.'); }
    finally { setBusy(false); }
  }
  return <form className="form" onSubmit={submit}><label>Nome do terreiro<input name="name" required minLength={3} maxLength={120} defaultValue={initial?.name} placeholder="Como sua casa se chama?" /></label><div className="form-grid"><label>Cidade<input name="city" required minLength={2} maxLength={80} defaultValue={initial?.city} placeholder="Sua cidade" /></label><label>Estado<select name="state" required defaultValue={initial?.state ?? ''}><option value="" disabled>Selecione</option>{states.map(s => <option key={s}>{s}</option>)}</select></label></div>{error && <p className="alert error" role="alert">{error}</p>}<Submit busy={busy}>{initial ? 'Salvar alterações' : 'Cadastrar meu terreiro'}</Submit></form>;
}

function MediumForm({ initial, house, onSave }: { initial?: Medium; house: House; onSave: (m: Medium) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [birthDate, setBirthDate] = useState(initial?.birth_date ?? '');
  const [sex, setSex] = useState<Medium['sex'] | ''>(initial?.sex ?? '');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(''); const parsed = mediumSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setBusy(true);
    try {
      if (!supabase) throw new Error();
      const query = initial ? supabase.from('mediuns').update(parsed.data).eq('id',initial.id).eq('terreiro_id',house.id) : supabase.from('mediuns').insert({ ...parsed.data, terreiro_id: house.id });
      const result = await query.select().single(); if (result.error) throw result.error; onSave(result.data);
    } catch { setError('Não foi possível salvar o cadastro. Confira sua conexão e tente novamente.'); }
    finally { setBusy(false); }
  }
  return <form className="form" onSubmit={submit}>
    <p className="form-intro">Mantenha os dados de quem faz parte da casa em dia.</p>
    <label>Nome completo<input name="name" required minLength={3} maxLength={120} defaultValue={initial?.name} autoComplete="name" placeholder="Nome do médium" /></label>
    <label>Data de nascimento<input name="birth_date" type="date" required min="0001-01-01" max={today()} value={birthDate} onChange={event => setBirthDate(event.target.value)} autoComplete="bday" /></label>
    <label>Sexo<select name="sex" required value={sex ?? ''} onChange={event => setSex(event.target.value as Medium['sex'] | '')}><option value="" disabled>Selecione</option>{Object.entries(sexLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <BirthNumerology birthDate={birthDate} sex={sex} />
    <label>Telefone<input name="phone" type="tel" required maxLength={25} defaultValue={initial?.phone} placeholder="(11) 99999-9999" /></label>
    <label>Situação<select name="status" defaultValue={initial?.status ?? 'ativo'}>{Object.entries(statusLabels).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
    <label>Observações <small>(opcional)</small><textarea name="notes" rows={3} maxLength={2000} defaultValue={initial?.notes} placeholder="Informações úteis para a organização da casa." /></label>
    {error && <p className="alert error" role="alert">{error}</p>}
    <Submit busy={busy}>{initial ? 'Salvar alterações' : 'Cadastrar médium'}</Submit>
  </form>;
}
