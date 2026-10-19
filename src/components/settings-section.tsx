import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import styles from './settings-section.module.css';

export function SettingsSection({ title, description, children }: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return <details className={`panel ${styles.section}`}>
    <summary className={styles.summary}>
      <div className={styles.heading}><h2>{title}</h2><p>{description}</p></div>
      <span className={styles.action} aria-hidden="true">
        <span className={styles.expand}>Expandir</span>
        <span className={styles.collapse}>Recolher</span>
        <ChevronDown size={20} className={styles.chevron} />
      </span>
    </summary>
    <div className={styles.content}>{children}</div>
  </details>;
}
