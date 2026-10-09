'use client';
import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { changeTheme, getTheme, subscribeTheme } from '@/lib/theme';
export function ThemeToggle(){
  const theme=useSyncExternalStore(subscribeTheme,getTheme,()=>'light');
  const dark=theme==='dark';
  return <button className="theme-toggle" type="button" aria-label={dark?'Ativar tema claro':'Ativar tema escuro'} title={dark?'Ativar tema claro':'Ativar tema escuro'} onClick={()=>changeTheme(dark?'light':'dark')}>{dark?<Sun size={17}/>:<Moon size={17}/>}<span>{dark?'Claro':'Escuro'}</span></button>;
}
