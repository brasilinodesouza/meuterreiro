'use client';

import { useState } from 'react';
import { CalendarDays, CalendarRange, ChevronRight, House as HouseIcon, Menu, Settings, ShieldCheck, UserRound } from 'lucide-react';
import type { House, Medium } from '@/lib/data';
import { formatDate, statusLabels } from '@/lib/data';
import { money, paymentMethodText, type Due, type FinanceState } from '@/lib/finance';
import { AppSidebar } from './app-sidebar';
import { PasswordSettings } from './password-settings';
import { AutomaticDuesNotifications } from './automatic-dues-notifications';
import { EventsPanel } from './events-panel';
import { OrixaCalendar } from './orixa-calendar';
import { OrixaNotifications } from './orixa-notifications';

const navigation = [
  { id: 'inicio', label: 'Minha casa', icon: HouseIcon },
  { id: 'eventos', label: 'Eventos', icon: CalendarRange },
  { id: 'calendario', label: 'Calendário', icon: CalendarDays },
  { id: 'dados', label: 'Meus dados', icon: UserRound },
  { id: 'mensalidades', label: 'Minhas mensalidades', icon: CalendarDays },
  { id: 'configuracoes', label: 'Configurações', icon: Settings },
] as const;
type MemberView = typeof navigation[number]['id'];

export function MemberHome({ house, userId, mediums, finance, unavailable, error, name, onLogout, onReload }: {
  house: House; userId: string; mediums: Medium[]; finance: FinanceState; unavailable: boolean; error: string; name: string; onLogout: () => void; onReload: () => void;
}) {
  const medium = mediums[0];
  const [view, setView] = useState<MemberView>(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('calendario') ? 'calendario' : typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('mensalidades') ? 'mensalidades' : 'inicio');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [duesFilter, setDuesFilter] = useState<'todos' | Due['status']>('todos');
  const dues = finance.dues.filter(due => duesFilter === 'todos' || due.status === duesFilter).sort((a,b) => b.reference.localeCompare(a.reference));
  const title = navigation.find(item => item.id === view)!.label;
  function selectView(next: MemberView) { setView(next); setMobileMenu(false); }

  return <div className={`app-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
    <AutomaticDuesNotifications key={userId} userId={userId} />
    <OrixaNotifications key={`orixas:${userId}`} userId={userId} />
    <AppSidebar house={house} navigation={navigation} view={view} mobileOpen={mobileMenu} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(current => !current)} onCloseMobile={() => setMobileMenu(false)} onNavigate={selectView} onLogout={onLogout} onReload={onReload} />
    {mobileMenu && <button type="button" aria-label="Fechar menu" className="menu-overlay" onClick={() => setMobileMenu(false)} />}
    <div className="workspace">
      <header className="topbar member-topbar">
        <div className="breadcrumb"><button type="button" className="menu-button" aria-label="Abrir menu" aria-expanded={mobileMenu} aria-controls="main-sidebar" onClick={() => setMobileMenu(current => !current)}><Menu /></button><span>Minha casa</span><ChevronRight size={14} /><strong>{title}</strong></div>
        <div className="topbar-right"><span className="private"><ShieldCheck size={14} /> Espaço privado</span><span className="user-avatar" title={name}>{name.trim().split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase()}</span></div>
      </header>
      <main className="main-content member-content">
        <div className="page-heading"><div><span className="eyebrow">MINHA CASA</span><h1>{view === 'inicio' ? house.name : title}</h1><p>{house.city} · {house.state}</p></div></div>
        <div className="users-heading"><div><h2>Olá, {name}.</h2><p>Você está vinculado ao terreiro como médium.</p></div></div>
        {error && <p className="alert error" role="alert">{error}</p>}
        {(view === 'inicio' || view === 'eventos') && <EventsPanel key={`${userId}:${house.id}`} houseId={house.id} userId={userId} />}
        {view === 'calendario' && <OrixaCalendar key={`${userId}:${house.id}`} houseId={house.id} />}
        {view === 'configuracoes' && <PasswordSettings />}
        {(view === 'inicio' || view === 'dados') && <section className="panel settings-panel"><h2>Meus dados</h2>{medium ? <dl className="profile-data"><div><dt>Nome</dt><dd>{medium.name}</dd></div><div><dt>Situação</dt><dd>{statusLabels[medium.status]}</dd></div><div><dt>Nascimento</dt><dd>{medium.birth_date ? formatDate(medium.birth_date) : 'Não informado'}</dd></div><div><dt>Telefone</dt><dd>{medium.phone || 'Não informado'}</dd></div></dl> : <p>Sua conta já está vinculada à casa. Peça à administração para associar seu cadastro de médium e liberar a consulta das mensalidades.</p>}</section>}
        {(view === 'inicio' || view === 'mensalidades') && <section className="panel settings-panel"><h2>Minhas mensalidades</h2><p>Suas mensalidades são atualizadas automaticamente enquanto esta tela estiver aberta.</p>
          <div className="filter-bar member-dues-filter">
            <select aria-label="Filtrar minhas mensalidades por situação" value={duesFilter} disabled={unavailable} onChange={event => setDuesFilter(event.target.value as typeof duesFilter)}><option value="todos">Todas as situações</option><option value="pago">Pagas</option><option value="pendente">Pendentes</option><option value="isento">Isentas</option></select>
            {!unavailable && <span role="status" aria-live="polite" aria-atomic="true">{dues.length} {dues.length === 1 ? 'mensalidade' : 'mensalidades'}</span>}
          </div>
          {unavailable ? <p>Não foi possível carregar as mensalidades. Use Atualizar para tentar novamente.</p> : dues.length ? <div className="table-scroll"><table><thead><tr><th>Referência</th><th>Vencimento</th><th>Valor</th><th>Situação</th><th>Forma de pagamento</th></tr></thead><tbody>{dues.map(due => <tr key={due.id}><td>{due.reference.slice(0,7).split('-').reverse().join('/')}</td><td>{formatDate(due.due_on)}</td><td>{money(due.amount_cents)}</td><td>{due.status === 'pago' ? 'Paga' : due.status === 'isento' ? 'Isenta' : 'Pendente'}</td><td>{paymentMethodText(due)}</td></tr>)}</tbody></table></div> : <p>{finance.dues.length ? 'Nenhuma mensalidade encontrada nesta situação.' : 'Nenhuma mensalidade disponível para sua conta.'}</p>}
        </section>}
      </main>
    </div>
  </div>;
}
