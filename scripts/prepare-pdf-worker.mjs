import { copyFile, cp, mkdir, readFile } from 'node:fs/promises';
const { version } = JSON.parse(await readFile(new URL('../node_modules/pdfjs-dist/package.json', import.meta.url), 'utf8'));
const directory = new URL('../public/pdfjs/', import.meta.url);
await mkdir(directory, { recursive: true });
await copyFile(new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url), new URL(`pdf.worker-${version}.min.mjs`, directory));
await cp(new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url), new URL(`fonts-${version}/`, directory), { recursive: true });
