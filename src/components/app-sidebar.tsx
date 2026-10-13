'use client';

import { Heart, House, LogOut, type LucideIcon } from 'lucide-react';
import { Brand } from './brand';

export function AppSidebar<T extends string>({ house, navigation, view, mobileOpen, collapsed, onToggle, onCloseMobile, onNavigate, onLogout }: {
  house: { name: string; city: string; state: string };
  navigation: readonly { id: T; label: string; icon: LucideIcon }[];
  view: T;
  mobileOpen: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onCloseMobile: () => void;
  onNavigate: (view: T) => void;
  onLogout: () => void;
}) {
  const expanded = mobileOpen || !collapsed;
  const label = expanded ? 'Recolher menu lateral' : 'Expandir menu lateral';
  return <aside id="main-sidebar" className={`sidebar ${mobileOpen ? 'open' : ''}`}>
    <Brand buttonProps={{
      'aria-label': label,
      'aria-expanded': expanded,
      'aria-controls': 'main-sidebar',
      title: label,
      onClick: () => {
        if (window.matchMedia('(max-width: 850px)').matches) onCloseMobile();
        else onToggle();
      },
    }} />
    <div className="house-label" title={`${house.name} · ${house.city} · ${house.state}`}>
      <span className="house-avatar"><House size={19} /></span>
      <div><strong>{house.name}</strong><small>{house.city} · {house.state}</small></div>
    </div>
    <span className="nav-label">ESPAÇO DA CASA</span>
    <nav aria-label="Navegação principal">
      {navigation.map(item => <button type="button" key={item.id} className={view === item.id ? 'nav-item selected' : 'nav-item'} aria-label={item.label} title={item.label} aria-current={view === item.id ? 'page' : undefined} onClick={() => onNavigate(item.id)}><item.icon size={19} /><span>{item.label}</span></button>)}
    </nav>
    <div className="sidebar-bottom">
      <div className="care-note"><Heart size={18} /><p>Mais organização.<br /><strong>Mais tempo para cuidar.</strong></p></div>
      <button type="button" className="nav-item" aria-label="Sair da conta" title="Sair da conta" onClick={onLogout}><LogOut size={18} /><span>Sair da conta</span></button>
    </div>
  </aside>;
}
