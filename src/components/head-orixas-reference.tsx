import { female28Note, headOrixasTable } from '@/lib/birth-numerology';
import styles from './head-orixas-reference.module.css';

export function HeadOrixasReference() {
  return <section className={`panel settings-panel ${styles.reference}`} aria-labelledby="head-orixas-reference-title">
    <span className="eyebrow">PAI E MÃE DE CABEÇA</span>
    <h2 id="head-orixas-reference-title">Numerologia dos Orixás</h2>
    <p>Esta é a tabela utilizada no cálculo dos cadastros. Some individualmente todos os dígitos da data de nascimento, sem reduzir o total, e consulte a coluna correspondente ao sexo.</p>
    <p className={styles.example}>Exemplo: <strong>13/05/1940</strong><br />1 + 3 + 0 + 5 + 1 + 9 + 4 + 0 = <strong>23</strong> · Homens: Ogum · Mulheres: Yemanjá</p>
    <div className="table-scroll" role="region" aria-label="Tabela de numerologia dos Orixás" tabIndex={0}>
      <table className={styles.table}>
        <caption>Correspondências de Pai e Mãe de Cabeça</caption>
        <thead><tr><th scope="col">Soma dos números</th><th scope="col">Homens</th><th scope="col">Mulheres</th></tr></thead>
        <tbody>{headOrixasTable.map(row => <tr key={row.label}>
          <th scope="row">{row.label}</th>
          <td>{row.masculino.join(' · ')}</td>
          <td>{row.feminino.join(' · ')}{row.footnote && <sup>{row.footnote}</sup>}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className={styles.notes}>
      <p><strong>* Soma 26:</strong> A imagem original traz a observação de que mulheres com essa soma devem evitar ter mais de dois filhos. Essa observação é uma crença da fonte, não uma orientação de saúde ou de planejamento familiar.</p>
      <p><strong>** Soma 28:</strong> {female28Note}</p>
      <small>Referência: tabela enviada, publicada pelo Centro de Umbanda Pai Oxóssi em 12/10/2014.</small>
    </div>
  </section>;
}
