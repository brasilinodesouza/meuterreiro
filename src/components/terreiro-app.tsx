'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowRight, Bell, Check, ChevronRight, CircleHelp, House as HouseIcon, Leaf, LogOut, Menu, Plus, Search, Settings, ShieldCheck, ShoppingBag, Users, Wallet, X, CalendarDays, Mail, Phone, Pencil, Heart, LoaderCircle } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { demoHouse, demoMediums, formatDate, houseSchema, mediumSchema, states, statusLabels, type House, type Medium } from '@/lib/data';
import { Modal } from './modal';
import { FinancePages, type FinanceView } from './finance-pages';
import { applyFinance, emptyFinance, financeSchema, money, summarize, today, type FinanceCommand, type FinanceState } from '@/lib/finance';
import { loadFinance, saveFinance } from '@/lib/finance-repository';

type View = 'inicio' | 'mediuns' | 'configuracoes' | FinanceView;
const navigation = [
  { id: 'inicio', label: 'Visão geral', icon: HouseIcon }, { id: 'mediuns', label: 'Médiuns', icon: Users },
  { id: 'mensalidades', label: 'Mensalidades', icon: CalendarDays }, { id: 'caixa', label: 'Caixa', icon: Wallet },
  { id: 'gastos', label: 'Gastos', icon: ShoppingBag }, { id: 'lembretes', label: 'Lembretes', icon: Bell }, { id: 'configuracoes', label: 'Configurações', icon: Settings },
] as const;
const demoStorage = 'meuterreiro.demo.v1';
const demoFinanceStorage = 'meuterreiro.finance.v1';
function Brand() { return <div className="brand"><span className="brand-icon"><Leaf size={23} /></span><span>Meu<span className="brand-light">Terreiro</span><small>GESTÃO COM PROPÓSITO</small></span></div>; }
function Submit({ busy, children }: { busy: boolean; children: React.ReactNode }) { return <button className="button primary" disabled={busy} type="submit">{busy ? <LoaderCircle size={17} className="spin" /> : null}{busy ? 'Salvando…' : children}</button>; }

export function TerreiroApp() {
  const [user, setUser] = useState<User | null>(null);
  const [demo, setDemo] = useState(false);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [house, setHouse] = useState<House | null>(null);
  const [mediums, setMediums] = useState<Medium[]>([]);
  const [view, setView] = useState<View>('inicio');
  const [mobileMenu, setMobileMenu] = useState(false);
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
    if (!user || !supabase || demo) return;
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
  }, [user, demo]);

  useEffect(() => {
    if (!demo) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== demoFinanceStorage) return;
      try { setFinance(financeSchema.parse(event.newValue ? JSON.parse(event.newValue) : emptyFinance())); setFinanceUnavailable(false); }
      catch { setFinanceUnavailable(true); setError('O financeiro da demonstração não pôde ser lido. Recarregue para tentar novamente.'); }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [demo]);

  function startDemo() {
    let demoData = { house: demoHouse, mediums: demoMediums };
    try {
      const saved = localStorage.getItem(demoStorage);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.house?.id === 'demo' && houseSchema.safeParse(parsed.house).success && Array.isArray(parsed.mediums) && parsed.mediums.every((m: Medium) => m.terreiro_id === 'demo' && mediumSchema.safeParse(m).success)) demoData = parsed;
      }
    } catch { /* A demonstração pode começar novamente se o armazenamento estiver indisponível. */ }
    setHouse(demoData.house); setMediums(demoData.mediums); setDemo(true); setError(''); setView('inicio');
    try {
      const saved = localStorage.getItem(demoFinanceStorage);
      const financial = saved ? financeSchema.parse(JSON.parse(saved)) : {
        ...emptyFinance(), reminders: ['Comprar vela','Comprar produto de limpeza'].map((description,i) => ({ id: `demo-reminder-${i}`, terreiro_id: 'demo', description, category: i ? 'Limpeza' as const : 'Velas e artigos' as const, due_on: null, completed_at: null, request_id: `demo-reminder-request-${i}`, created_at: new Date().toISOString() })),
      };
      setFinance(financial); setFinanceUnavailable(false);
    } catch { setFinanceUnavailable(true); setError('Não foi possível ler o financeiro da demonstração. Os dados salvos foram preservados.'); }
  }

  async function commitFinance(command: FinanceCommand) {
    if (!house || financeUnavailable) throw new Error('O financeiro não está disponível. Recarregue a página para tentar novamente.');
    if (financialWrite.current) throw new Error('Aguarde o registro anterior terminar.');
    financialWrite.current = true;
    try {
      if (demo) {
        const saved = localStorage.getItem(demoFinanceStorage);
        const current = saved ? financeSchema.parse(JSON.parse(saved)) : finance;
        const next = applyFinance(current,command,house.id,mediums.map(m=>m.id));
        try { localStorage.setItem(demoFinanceStorage,JSON.stringify(next)); }
        catch { throw new Error('O navegador não permitiu salvar. O registro não foi concluído; tente fora do modo privado.'); }
        setFinance(next);
      } else {
        // Valida no cliente; o banco também verifica o acesso e as regras de cada registro.
        applyFinance(finance,command,house.id,mediums.map(m=>m.id));
        await saveFinance(house.id,command);
        try { setFinance(await loadFinance(house.id)); }
        catch { setFinanceUnavailable(true); setError('Registro salvo no banco, mas o resumo não pôde ser atualizado. Recarregue a página.'); }
      }
      setNotice(command.type==='expense' && command.reminder_id ? 'Compra concluída! O gasto foi registrado e o caixa atualizado.' : command.type==='pay' ? 'Pagamento registrado e caixa atualizado.' : command.type==='dues' ? 'Mensalidades criadas. Cadastros existentes foram preservados.' : 'Registro salvo com sucesso.');
    } finally { financialWrite.current = false; }
  }
  function persistDemo(nextHouse: House, nextMediums: Medium[]) {
    try { localStorage.setItem(demoStorage, JSON.stringify({ house: nextHouse, mediums: nextMediums })); }
    catch { setNotice('Alterações nesta sessão. O navegador não permitiu salvar a demonstração.'); }
  }
  async function logout() {
    if (!demo && supabase) {
      const result = await supabase.auth.signOut();
      if (result.error) { setError('Não foi possível sair. Tente novamente.'); return; }
    }
    setDemo(false); setUser(null); setHouse(null); setMediums([]); setFinance(emptyFinance()); setFinanceUnavailable(Boolean(supabase)); setView('inicio'); setError(''); setNotice(''); setProfile(null); setEditor(null);
  }
  function exportData() {
    const blob = new Blob([JSON.stringify({ version: 2, exported_at: new Date().toISOString(), house, mediums, finance, finance_complete: !financeUnavailable }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'meuterreiro-exportacao.json'; a.click(); URL.revokeObjectURL(url);
    setNotice('Exportação concluída. Guarde o arquivo em um local seguro.');
  }
  if (loading) return <main className="loading"><Brand /><LoaderCircle className="spin" /><p>Preparando sua casa…</p></main>;
  if (recovery) return <Auth recovery onDone={() => setRecovery(false)} onDemo={startDemo} />;
  if (!demo && !user) return <Auth onDemo={startDemo} />;
  if (!house) return <main className="onboarding"><Brand /><div className="onboarding-card"><span className="eyebrow">PRIMEIRO PASSO</span><h1>Vamos dar um lugar<br />à sua casa.</h1><p>Cadastre seu terreiro para começar a organizar as pessoas e a rotina.</p>{error && <p className="alert error" role="alert">{error}</p>}<HouseForm userId={user!.id} onSave={h => { setHouse(h); setError(''); void loadFinance(h.id).then(f=>{setFinance(f);setFinanceUnavailable(false);}).catch(()=>{setFinanceUnavailable(true);setError('Execute a migração 002 para habilitar o financeiro.');}); }} /><button className="text-button" onClick={logout}>Sair da conta</button></div></main>;

  const filtered = mediums.filter(m => m.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')) && (status === 'todos' || m.status === status));
  const activeCount = mediums.filter(m => m.status === 'ativo').length;
  const totals = summarize(finance,today().slice(0,7));
  const pendingDues = finance.dues.filter(d=>d.status==='pendente');
  const title = navigation.find(n => n.id === view)!.label;
  const selectView = (id: View) => { setView(id); setMobileMenu(false); setNotice(''); };

  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenu ? 'open' : ''}`}><Brand /><div className="house-label"><span className="house-avatar"><HouseIcon size={19} /></span><div><strong>{house.name}</strong><small>{house.city} · {house.state}</small></div></div><span className="nav-label">ESPAÇO DA CASA</span><nav aria-label="Navegação principal">{navigation.map(item => <button key={item.id} className={view === item.id ? 'nav-item selected' : 'nav-item'} onClick={() => selectView(item.id)}><item.icon size={19} /><span>{item.label}</span></button>)}</nav><div className="sidebar-bottom"><div className="care-note"><Heart size={18} /><p>Mais organização.<br /><strong>Mais tempo para cuidar.</strong></p></div><button className="nav-item" onClick={logout}><LogOut size={18} />{demo ? 'Sair da demonstração' : 'Sair da conta'}</button></div></aside>
    {mobileMenu && <button aria-label="Fechar menu" className="menu-overlay" onClick={() => setMobileMenu(false)} />}
    <div className="workspace"><header className="topbar"><div className="breadcrumb"><button className="menu-button" aria-label="Abrir menu" onClick={() => setMobileMenu(!mobileMenu)}><Menu /></button><span>Minha casa</span><ChevronRight size={14} /><strong>{title}</strong></div><div className="topbar-right"><span className="private"><ShieldCheck size={15} /> Espaço privado</span><span className="user-avatar" title={user?.email ?? 'Demonstração'}>{demo ? 'D' : user?.email?.[0].toUpperCase()}</span></div></header>
    <main className="main-content">
      {demo && <div className="demo-banner"><span><CircleHelp size={16} />Demonstração · Dados fictícios salvos apenas neste navegador.</span><button onClick={logout}>Voltar ao acesso <ArrowRight size={14} /></button></div>}
      {error && <div role="alert" className="alert error">{error}<button aria-label="Fechar aviso" onClick={() => setError('')}><X size={16} /></button></div>}
      {notice && <div role="status" className="alert success">{notice}<button aria-label="Fechar aviso" onClick={() => setNotice('')}><X size={16} /></button></div>}
      {view === 'inicio' && <>
        <div className="page-heading"><div><span className="eyebrow">CUIDADO QUE COMEÇA NA ORGANIZAÇÃO</span><h1>Sua casa, em harmonia<span>.</span></h1><p>Um olhar sobre as pessoas e os próximos passos do seu terreiro.</p></div><button className="button primary" onClick={() => setEditor('new')}><Plus size={18} /> Cadastrar médium</button></div>
        <section className="welcome-card"><div><span className="tag"><Leaf size={13} /> NOSSA CASA</span><h2>{house.name}</h2><p>Cada pessoa faz parte dessa história.<br />Cuide dos vínculos, organize o caminho.</p><button className="welcome-link" onClick={() => selectView('configuracoes')}>Ver dados do terreiro <ArrowRight size={17} /></button></div><div className="welcome-art" aria-hidden="true"><div className="art-ring ring-one" /><div className="art-ring ring-two" /><Leaf size={110} strokeWidth={0.8} /><span className="art-spark">✦</span></div></section>
        <section className="stats" aria-label="Resumo da casa"><div className="stat-card"><span className="stat-icon"><Users size={21} /></span><span>Médiuns cadastrados</span><strong>{mediums.length.toString().padStart(2, '0')}</strong><small><span className="green-dot" /> {activeCount} em atividade na casa</small></div><div className="stat-card"><span className="stat-icon amber"><CalendarDays size={21} /></span><span>Mensalidades pendentes</span><strong>{financeUnavailable?'—':pendingDues.length}</strong><small>{financeUnavailable?'Financeiro indisponível':`${money(pendingDues.reduce((a,d)=>a+d.amount_cents,0))} a receber`}</small></div><div className="stat-card"><span className="stat-icon purple"><Wallet size={21} /></span><span>Saldo do caixa</span><strong className="money-total">{financeUnavailable?'—':money(totals.balance)}</strong><small>{financeUnavailable?'Financeiro indisponível':`${money(totals.outgoing)} em gastos neste mês`}</small></div></section>
        <div className="dashboard-grid"><section className="panel"><div className="panel-heading"><div><h2>Pessoas da casa</h2><p>Quem faz parte do seu terreiro.</p></div><button className="text-button" onClick={() => selectView('mediuns')}>Ver todos <ArrowRight size={16} /></button></div>{mediums.length ? <div className="people-list">{mediums.slice(0,4).map(m => <button className="person-row" key={m.id} onClick={() => setProfile(m)}><Avatar name={m.name} /><span className="person-name"><strong>{m.name}</strong><small>{m.role}</small></span><span className={`status ${m.status}`}>{statusLabels[m.status]}</span><ChevronRight size={16} /></button>)}</div> : <Empty onNew={() => setEditor('new')} />}</section><section className="panel next-steps"><span className="eyebrow">UM PASSO DE CADA VEZ</span><h2>Comece pelo essencial.</h2><p>A base da sua gestão está nas pessoas e nas informações da casa.</p><div className="step"><span className="step-check"><Check size={14} /></span><div><strong>Cadastre seu terreiro</strong><small>Uma casa, um espaço só seu.</small></div></div><div className="step"><span className={mediums.length ? 'step-check' : 'step-number'}>{mediums.length ? <Check size={14} /> : '2'}</span><div><strong>Traga as pessoas da casa</strong><small>Cadastre e mantenha os perfis em dia.</small></div></div><div className="step"><span className="step-number">3</span><div><strong>Organize o financeiro</strong><small>Mensalidades e gastos atualizam o caixa automaticamente.</small></div></div></section></div>
      </>}
      {view === 'mediuns' && <><div className="page-heading"><div><span className="eyebrow">QUEM CAMINHA COM A CASA</span><h1>Médiuns<span>.</span></h1><p>Cadastros, vínculos e histórias em um só lugar.</p></div><button className="button primary" onClick={() => setEditor('new')}><Plus size={18} /> Cadastrar médium</button></div><section className="panel"><div className="filter-bar"><label className="search-field"><Search size={18} /><input aria-label="Buscar médium pelo nome" placeholder="Buscar pelo nome…" value={search} onChange={e => setSearch(e.target.value)} /></label><select aria-label="Filtrar por situação" value={status} onChange={e => setStatus(e.target.value)}><option value="todos">Todas as situações</option>{Object.entries(statusLabels).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select><span>{filtered.length} {filtered.length === 1 ? 'pessoa' : 'pessoas'}</span></div>{mediums.length === 0 ? <Empty onNew={() => setEditor('new')} /> : filtered.length === 0 ? <div className="empty"><Search /><h3>Nenhum cadastro encontrado.</h3><p>Tente outro nome ou altere o filtro.</p></div> : <div className="table-scroll"><table><thead><tr><th>Nome</th><th>Função na casa</th><th>Entrada</th><th>Situação</th><th><span className="sr-only">Perfil</span></th></tr></thead><tbody>{filtered.map(m => <tr key={m.id}><td><button className="table-name" onClick={() => setProfile(m)}><Avatar name={m.name} /><span>{m.name}<small>{m.phone || 'Sem telefone cadastrado'}</small></span></button></td><td>{m.role}</td><td>{formatDate(m.joined_on)}</td><td><span className={`status ${m.status}`}>{statusLabels[m.status]}</span></td><td><button className="text-button" onClick={() => setProfile(m)}>Ver perfil <ChevronRight size={15} /></button></td></tr>)}</tbody></table></div>}</section></>}
      {view === 'configuracoes' && <><div className="page-heading"><div><span className="eyebrow">DO JEITO DA SUA CASA</span><h1>Configurações<span>.</span></h1><p>Informações do terreiro e uma cópia dos seus cadastros.</p></div></div><div className="settings-grid"><section className="panel settings-panel"><h2>Dados do terreiro</h2><p>As informações que identificam sua casa.</p><HouseForm initial={house} userId={house.owner_id} demo={demo} onSave={h => { setHouse(h); if (demo) persistDemo(h, mediums); setNotice('Dados do terreiro atualizados.'); }} /></section><section className="panel settings-panel"><span className="stat-icon"><ArrowDownToLine /></span><h2>Seus dados com você</h2><p>Baixe uma cópia em JSON dos cadastros, mensalidades, gastos, caixa e lembretes. A exportação é uma cópia manual; a restauração será adicionada em outra etapa.</p><button className="button secondary" onClick={exportData}><ArrowDownToLine size={17} /> Exportar cadastros</button><div className="account-note"><ShieldCheck size={18} /><div><strong>{demo ? 'Ambiente de demonstração' : 'Conta conectada'}<small>{demo ? 'Sem sincronização entre dispositivos.' : user?.email}</small></strong></div></div></section></div></>}
      {(['mensalidades','caixa','gastos','lembretes'] as string[]).includes(view) && <FinancePages view={view as FinanceView} finance={finance} mediums={mediums} onSave={commitFinance} onNavigate={next=>{setView(next);setMobileMenu(false);}} unavailable={financeUnavailable} />}
      <footer className="footer"><span>MeuTerreiro <span>·</span> Feito para cuidar da sua casa.</span><span><Leaf size={13} /> Cada casa tem sua história.</span></footer>
    </main></div>
    {profile && <Modal title="Perfil do médium" onClose={() => setProfile(null)}><div className="profile-heading"><Avatar name={profile.name} /><h2>{profile.name}</h2><span className={`status ${profile.status}`}>{statusLabels[profile.status]}</span></div><dl className="profile-data"><div><dt>Função na casa</dt><dd>{profile.role}</dd></div><div><dt>Data de entrada</dt><dd>{formatDate(profile.joined_on)}</dd></div><div><dt><Phone size={14} /> Telefone</dt><dd>{profile.phone || 'Não informado'}</dd></div><div><dt><Mail size={14} /> E-mail</dt><dd>{profile.email || 'Não informado'}</dd></div></dl><div className="profile-notes"><h3>Observações</h3><p>{profile.notes || 'Nenhuma observação cadastrada.'}</p></div><button className="button primary" onClick={() => { setEditor(profile); setProfile(null); }}><Pencil size={16} /> Editar cadastro</button></Modal>}
    {editor && <Modal title={editor === 'new' ? 'Cadastrar médium' : 'Editar cadastro'} onClose={() => setEditor(null)}><MediumForm initial={editor === 'new' ? undefined : editor} house={house} demo={demo} onSave={m => { const next = [...mediums.filter(item => item.id !== m.id), m].sort((a,b) => a.name.localeCompare(b.name, 'pt-BR')); setMediums(next); if (demo) persistDemo(house,next); setEditor(null); setNotice('Cadastro salvo com sucesso.'); }} /></Modal>}
  </div>;
}

function Avatar({ name }: { name: string }) { return <span className="avatar">{name.trim().split(/\s+/).slice(0,2).map(n => n[0]).join('').toUpperCase()}</span>; }
function Empty({ onNew }: { onNew: () => void }) { return <div className="empty"><Users size={32} /><h3>Uma casa começa pelas pessoas.</h3><p>Cadastre o primeiro médium para começar.</p><button className="button secondary" onClick={onNew}><Plus size={16} /> Cadastrar médium</button></div>; }
function HouseForm({ initial, userId, demo = false, onSave }: { initial?: House; userId: string; demo?: boolean; onSave: (h: House) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(''); const parsed = houseSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setBusy(true);
    try {
      if (demo && initial) { onSave({ ...initial, ...parsed.data }); return; }
      if (!supabase) throw new Error();
      const query = initial ? supabase.from('terreiros').update(parsed.data).eq('id',initial.id) : supabase.from('terreiros').insert({ ...parsed.data, owner_id: userId });
      const result = await query.select().single(); if (result.error) throw result.error; onSave(result.data);
    } catch { setError('Não foi possível salvar o terreiro. Confira a conexão e a configuração do banco.'); }
    finally { setBusy(false); }
  }
  return <form className="form" onSubmit={submit}><label>Nome do terreiro<input name="name" required minLength={3} maxLength={120} defaultValue={initial?.name} placeholder="Como sua casa se chama?" /></label><div className="form-grid"><label>Cidade<input name="city" required minLength={2} maxLength={80} defaultValue={initial?.city} placeholder="Sua cidade" /></label><label>Estado<select name="state" required defaultValue={initial?.state ?? ''}><option value="" disabled>Selecione</option>{states.map(s => <option key={s}>{s}</option>)}</select></label></div>{error && <p className="alert error" role="alert">{error}</p>}<Submit busy={busy}>{initial ? 'Salvar alterações' : 'Cadastrar meu terreiro'}</Submit></form>;
}

function MediumForm({ initial, house, demo, onSave }: { initial?: Medium; house: House; demo: boolean; onSave: (m: Medium) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(''); const parsed = mediumSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setBusy(true);
    try {
      if (demo) { onSave({ ...parsed.data, id: initial?.id ?? crypto.randomUUID(), terreiro_id: house.id, created_at: initial?.created_at ?? new Date().toISOString() }); return; }
      if (!supabase) throw new Error();
      const query = initial ? supabase.from('mediuns').update(parsed.data).eq('id',initial.id).eq('terreiro_id',house.id) : supabase.from('mediuns').insert({ ...parsed.data, terreiro_id: house.id });
      const result = await query.select().single(); if (result.error) throw result.error; onSave(result.data);
    } catch { setError('Não foi possível salvar o cadastro. Confira sua conexão e tente novamente.'); }
    finally { setBusy(false); }
  }
  return <form className="form" onSubmit={submit}><p className="form-intro">Mantenha os dados de quem faz parte da casa em dia.</p><label>Nome completo<input name="name" required minLength={3} maxLength={120} defaultValue={initial?.name} autoComplete="name" placeholder="Nome do médium" /></label><div className="form-grid"><label>Telefone <small>(opcional)</small><input name="phone" type="tel" maxLength={25} defaultValue={initial?.phone} placeholder="(11) 99999-9999" /></label><label>E-mail <small>(opcional)</small><input name="email" type="email" defaultValue={initial?.email} placeholder="nome@exemplo.com" /></label></div><div className="form-grid"><label>Função na casa<input name="role" required minLength={2} maxLength={80} defaultValue={initial?.role ?? 'Médium'} placeholder="Médium, cambone, ogã…" /></label><label>Data de entrada<input name="joined_on" type="date" required defaultValue={initial?.joined_on ?? new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })} /></label></div><label>Situação<select name="status" defaultValue={initial?.status ?? 'ativo'}>{Object.entries(statusLabels).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label><label>Observações <small>(opcional)</small><textarea name="notes" rows={3} maxLength={2000} defaultValue={initial?.notes} placeholder="Informações úteis para a organização da casa." /></label>{error && <p className="alert error" role="alert">{error}</p>}<Submit busy={busy}>{initial ? 'Salvar alterações' : 'Cadastrar médium'}</Submit></form>;
}

function Auth({ onDemo, recovery = false, onDone }: { onDemo: () => void; recovery?: boolean; onDone?: () => void }) {
  const [mode, setMode] = useState<'login'|'signup'|'reset'>('login'); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(''); setMessage(''); if (!supabase) return;
    const data = new FormData(e.currentTarget); const email = String(data.get('email') ?? '').trim(); const password = String(data.get('password') ?? '');
    setBusy(true);
    try {
      if (recovery) { const result = await supabase.auth.updateUser({ password }); if (result.error) throw result.error; onDone?.(); return; }
      if (mode === 'reset') { const result = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin }); if (result.error) throw result.error; setMessage('Se este e-mail tiver uma conta, você receberá o link para redefinir a senha.'); return; }
      const result = mode === 'signup' ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } }) : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (mode === 'signup' && !result.data.session) setMessage('Confira seu e-mail para confirmar a conta. Depois, volte aqui para entrar.');
    } catch { setError(mode === 'login' ? 'Não foi possível entrar. Confira o e-mail e a senha, a confirmação da conta e sua conexão.' : 'Não foi possível concluir. Tente novamente em instantes ou confira a configuração do acesso.'); }
    finally { setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-story"><Brand /><div className="auth-copy"><span className="eyebrow">CADA CASA TEM SUA HISTÓRIA</span><h1>Mais tempo<br />para o que<br /><em>tem valor.</em></h1><p>Um espaço para organizar seu terreiro<br />e cuidar de quem caminha com você.</p><div className="auth-benefits"><span><Check size={16} /> Pessoas e vínculos em um só lugar</span><span><Check size={16} /> Sua casa no celular e no computador</span><span><Check size={16} /> Um espaço privado para cada terreiro</span></div></div><div className="auth-leaf" aria-hidden="true"><Leaf size={210} strokeWidth={0.65} /></div><small className="auth-caption">Organização que acolhe. Cuidado que permanece.</small></section><section className="auth-access"><div className="auth-box"><span className="eyebrow">BEM-VINDO AO MEUTERREIRO</span><h2>{recovery ? 'Escolha uma nova senha.' : mode === 'signup' ? 'O começo de um novo cuidado.' : mode === 'reset' ? 'Vamos recuperar seu acesso.' : 'Sua casa começa aqui.'}</h2><p>{mode === 'signup' ? 'Crie sua conta e cadastre seu terreiro.' : 'Entre para acompanhar e organizar sua casa.'}</p>{!supabase ? <div className="setup-notice"><CircleHelp size={21} /><div><strong>Primeira versão pronta para conhecer</strong><p>O acesso com conta será liberado após conectar o Supabase. Por enquanto, explore a demonstração.</p></div></div> : <form className="form" onSubmit={submit}>{!recovery && <label>E-mail<input name="email" type="email" required autoComplete="email" placeholder="Seu e-mail" /></label>}{(recovery || mode !== 'reset') && <label>Senha<input name="password" type="password" required minLength={mode === 'signup' || recovery ? 8 : 1} autoComplete={mode === 'signup' || recovery ? 'new-password' : 'current-password'} placeholder={mode === 'signup' || recovery ? 'Pelo menos 8 caracteres' : 'Sua senha'} /></label>}{mode === 'login' && !recovery && <button type="button" className="text-button forgot" onClick={() => { setMode('reset'); setError(''); setMessage(''); }}>Esqueci minha senha</button>}{error && <p className="alert error" role="alert">{error}</p>}{message && <p className="alert success" role="status">{message}</p>}<Submit busy={busy}>{recovery ? 'Salvar nova senha' : mode === 'signup' ? 'Criar minha conta' : mode === 'reset' ? 'Enviar link de recuperação' : 'Entrar na minha casa'}</Submit></form>}{supabase && !recovery && <button className="text-button auth-switch" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setMessage(''); }}>{mode === 'login' ? 'Ainda não tem conta? Criar conta' : 'Já tenho conta. Entrar'}</button>}{!recovery && <><div className="divider"><span>CONHEÇA PRIMEIRO</span></div><button className="button secondary demo-button" onClick={onDemo}>Explorar demonstração <ArrowRight size={17} /></button><small className="auth-hint">Sem cadastro. Com dados fictícios.</small></>}<p className="auth-privacy"><ShieldCheck size={16} /> Cada terreiro tem seu próprio espaço.</p></div></section></main>;
}
