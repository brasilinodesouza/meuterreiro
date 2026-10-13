import type { Medium } from '@/lib/data';
import { birthNumerology } from '@/lib/birth-numerology';

export function BirthNumerology({ birthDate, sex }: { birthDate: Medium['birth_date']; sex: Medium['sex'] | '' }) {
  const result = birthNumerology(birthDate, sex);
  if (!result) return null;
  return <section className="birth-numerology" aria-label="Tábua numerológica" role="status" aria-live="polite" aria-atomic="true">
    <h3>Tábua numerológica</h3>
    <p className="birth-numerology-sum">Soma da data de nascimento: <strong>{result.sum}</strong></p>
    <p className="birth-numerology-calculation">{result.expression}</p>
    {result.orixas ? <p className="birth-numerology-result"><span>{result.sum === 28 ? 'Orixás apontados pela tabela' : 'Pai / mãe de cabeça pela tabela'}</span><strong>{result.orixas.join(', ')}</strong></p> : <p>Selecione o sexo para consultar o pai ou a mãe de cabeça na tabela.</p>}
    {result.note && <p>{result.note}</p>}
    <small>Correspondência conforme a tábua numerológica fornecida.</small>
  </section>;
}
