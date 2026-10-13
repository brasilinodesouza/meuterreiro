import { Leaf } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';

export function Brand({ buttonProps }: { buttonProps?: ButtonHTMLAttributes<HTMLButtonElement> } = {}) {
  const content = <><span className="brand-icon"><Leaf size={23} /></span><span>Meu<span className="brand-light">Terreiro</span><small>GESTÃO COM PROPÓSITO</small></span></>;
  return buttonProps
    ? <button {...buttonProps} type="button" className="brand brand-button">{content}</button>
    : <div className="brand">{content}</div>;
}
