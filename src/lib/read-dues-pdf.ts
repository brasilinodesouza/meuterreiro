import { parseDuesReport, pdfItemsToLines } from './dues-import';

export async function readDuesPdf(file: File) {
  if (file.size > 10 * 1024 * 1024) throw new Error('Selecione um PDF de até 10 MB.');
  if (!file.name.toLowerCase().endsWith('.pdf')) throw new Error('Selecione um arquivo PDF.');
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = `/pdfjs/pdf.worker-${pdfjs.version}.min.mjs`;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), standardFontDataUrl: `/pdfjs/fonts-${pdfjs.version}/`, stopAtErrors: true });
  try {
    const document = await task.promise;
    if (document.numPages > 50) throw new Error('Selecione um relatório com até 50 páginas.');
    const lines: string[] = [];
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      lines.push(...pdfItemsToLines(content.items.filter(item => 'str' in item)));
      page.cleanup();
    }
    return parseDuesReport(lines);
  } finally { await task.destroy(); }
}
