'use client';

import { House as HouseIcon, LogOut, RefreshCw } from 'lucide-react';
import type { House, Medium } from '@/lib/data';
import { formatDate, statusLabels } from '@/lib/data';
import { money, type FinanceState } from '@/lib/finance';
import { Brand } from './brand';

export function MemberHome({ house, mediums, finance, unavailable, error, name, onLogout, onReload }: {
  house: House; mediums: Medium[]; finance: FinanceState; unavailable: boolean; error: string; name: string; onLogout: () => void; onReload: () => void;
}) {
  const medium = mediums[0];
  return <main className="member-home"><header className="member-header"><Brand /><button className="button secondary" onClick={onLogout}><LogOut size={16} /> Sair</button></header><div className="member-content"><span className="eyebrow">MINHA CASA</span><h1>{house.name}</h1><p><HouseIcon size={16} /> {house.city} · {house.state}</p><div className="users-heading"><div><h2>Olá, {name}.</h2><p>Você está vinculado ao terreiro como usuário comum.</p></div><button className="button secondary" onClick={onReload}><RefreshCw size={16} /> Atualizar</button></div>{error && <p className="alert error" role="alert">{error}</p>}<section className="panel settings-panel"><h2>Meus dados</h2>{medium ? <dl className="profile-data"><div><dt>Nome</dt><dd>{medium.name}</dd></div><div><dt>Situação</dt><dd>{statusLabels[medium.status]}</dd></div><div><dt>Nascimento</dt><dd>{medium.birth_date ? formatDate(medium.birth_date) : 'Não informado'}</dd></div><div><dt>Telefone</dt><dd>{medium.phone || 'Não informado'}</dd></div></dl> : <p>Sua conta já está vinculada à casa. Peça à administração para associar seu cadastro de médium e liberar a consulta das mensalidades.</p>}</section><section className="panel settings-panel"><h2>Minhas mensalidades</h2>{unavailable ? <p>Não foi possível carregar as mensalidades. Use Atualizar para tentar novamente.</p> : finance.dues.length ? <div className="table-scroll"><table><thead><tr><th>Referência</th><th>Vencimento</th><th>Valor</th><th>Situação</th></tr></thead><tbody>{[...finance.dues].sort((a,b) => b.reference.localeCompare(a.reference)).map(due => <tr key={due.id}><td>{due.reference.slice(0,7).split('-').reverse().join('/')}</td><td>{formatDate(due.due_on)}</td><td>{money(due.amount_cents)}</td><td>{due.status === 'pago' ? 'Paga' : due.status === 'isento' ? 'Isenta' : 'Pendente'}</td></tr>)}</tbody></table></div> : <p>Nenhuma mensalidade disponível para sua conta.</p>}</section></div></main>;
}
