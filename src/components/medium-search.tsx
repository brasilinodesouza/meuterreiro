'use client';

import { useRef } from 'react';
import { Search, X } from 'lucide-react';
import styles from './medium-search.module.css';

export function MediumSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return <div className={`search-field ${styles.field}`}>
    <Search size={18} aria-hidden="true" />
    <input ref={input} aria-label="Buscar médium pelo nome" placeholder="Buscar pelo nome…" value={value} onChange={event => onChange(event.target.value)} autoComplete="off" spellCheck={false} />
    {value && <button type="button" className={styles.clear} aria-label="Limpar busca" title="Limpar busca" onClick={() => { onChange(''); input.current?.focus(); }}><X size={16} aria-hidden="true" /></button>}
  </div>;
}
