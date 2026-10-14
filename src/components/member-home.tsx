'use client';

import { useState } from 'react';
import { CalendarDays, ChevronRight, House as HouseIcon, Menu, RefreshCw, ShieldCheck, UserRound } from 'lucide-react';
import type { House, Medium } from '@/lib/data';
import { formatDate, statusLabels } from '@/lib/data';
import { money, type FinanceState } from '@/lib/finance';
import { AppSidebar } from './app-sidebar';

const navigation = [
  { id: 'inicio', label: 'Minha casa', icon: HouseIcon },
  { id: 'dados', label: 'Meus dados', icon: UserRound },
  { id: 'mensalidades', label: 'Minhas mensalidades', icon: CalendarDays },
] as const;
type MemberView = typeof navigation[number]['id'];

export function MemberHome({ house, mediums, finance, unavailable, error, name, onLogout, onReload }: {
  house: House; mediums: Medium[]; finance: FinanceState; unavailable: boolean; error: string; name: string; onLogout: () => void; onReload: () => void;
}) {
  const medium = mediums[0];
  const [view, setView] = useState<MemberView>('inicio');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const title = navigation.find(item => item.id === view)!.label;
  function selectView(next: MemberView) { setView(next); setMobileMenu(false); }

  return <div className={`app-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
    <AppSidebar house={house} navigation={navigation} view={view} mobileOpen={mobileMenu} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(current => !current)} onCloseMobile={() => setMobileMenu(false)} onNavigate={selectView} onLogout={onLogout} />
    {mobileMenu && <button type="button" aria-label="Fechar menu" className="menu-overlay" onClick={() => setMobileMenu(false)} />}
    <div className="workspace">
      <header className="topbar member-topbar">
        <div className="breadcrumb"><button type="button" className="menu-button" aria-label="Abrir menu" aria-expanded={mobileMenu} aria-controls="main-sidebar" onClick={() => setMobileMenu(current => !current)}><Menu /></button><span>Minha casa</span><ChevronRight size={14} /><strong>{title}</strong></div>
        <div className="topbar-right"><span className="private"><ShieldCheck size={14} /> Espaço privado</span><span className="user-avatar" title={name}>{name.trim().split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase()}</span></div>
      </header>
      <main className="main-content member-content">
        <div className="page-heading"><div><span className="eyebrow">MINHA CASA</span><h1>{view === 'inicio' ? house.name : title}</h1><p>{house.city} · {house.state}</p></div><button type="button" className="button secondary" onClick={onReload}><RefreshCw size={16} /> Atualizar</button></div>
        <div className="users-heading"><div><h2>Olá, {name}.</h2><p>Você está vinculado ao terreiro como usuário.</p></div></div>
        {error && <p className="alert error" role="alert">{error}</p>}
        {view !== 'mensalidades' && <section className="panel settings-panel"><h2>Meus dados</h2>{medium ? <dl className="profile-data"><div><dt>Nome</dt><dd>{medium.name}</dd></div><div><dt>Situação</dt><dd>{statusLabels[medium.status]}</dd></div><div><dt>Nascimento</dt><dd>{medium.birth_date ? formatDate(medium.birth_date) : 'Não informado'}</dd></div><div><dt>Telefone</dt><dd>{medium.phone || 'Não informado'}</dd></div></dl> : <p>Sua conta já está vinculada à casa. Peça à administração para associar seu cadastro de médium e liberar a consulta das mensalidades.</p>}</section>}
        {view !== 'dados' && <section className="panel settings-panel"><h2>Minhas mensalidades</h2>{unavailable ? <p>Não foi possível carregar as mensalidades. Use Atualizar para tentar novamente.</p> : finance.dues.length ? <div className="table-scroll"><table><thead><tr><th>Referência</th><th>Vencimento</th><th>Valor</th><th>Situação</th></tr></thead><tbody>{[...finance.dues].sort((a,b) => b.reference.localeCompare(a.reference)).map(due => <tr key={due.id}><td>{due.reference.slice(0,7).split('-').reverse().join('/')}</td><td>{formatDate(due.due_on)}</td><td>{money(due.amount_cents)}</td><td>{due.status === 'pago' ? 'Paga' : due.status === 'isento' ? 'Isenta' : 'Pendente'}</td></tr>)}</tbody></table></div> : <p>Nenhuma mensalidade disponível para sua conta.</p>}</section>}
      </main>
    </div>
  </div>;
}
