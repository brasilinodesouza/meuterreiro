import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import './prepare-pdf-worker.mjs';

// O mesmo identificador entra no bundle e no arquivo público de cada publicação.
await writeFile(new URL('../public/app-version.json', import.meta.url), JSON.stringify({ version: randomUUID(), builtAt: new Date().toISOString() }) + '\n');
