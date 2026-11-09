import { parseDuesJson } from './dues-import';
import { readDuesPdf } from './read-dues-pdf';

export async function readDuesFile(file: File) {
  if (file.size > 10 * 1024 * 1024) throw new Error('Selecione um arquivo de até 10 MB.');
  const name = file.name.toLowerCase();
  if (name.endsWith('.json')) return parseDuesJson(await file.text());
  if (name.endsWith('.pdf')) return readDuesPdf(file);
  throw new Error('Selecione um relatório PDF ou um backup JSON.');
}
