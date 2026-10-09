import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#244c3c"/><g fill="none" stroke="#d9e7c5" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"><path d="M174 313c-76-125 60-180 172-146 13 118-43 216-145 163"/><path d="M165 363c34-82 82-137 134-157"/></g></svg>`;
await mkdir('public/icons', { recursive: true });
for (const size of [192, 512]) await sharp(Buffer.from(svg)).resize(size,size).png().toFile(`public/icons/icon-${size}.png`);
await sharp(Buffer.from(svg)).png().toFile('public/icons/icon-maskable-512.png');
await sharp(Buffer.from(svg)).resize(180,180).png().toFile('public/icons/apple-touch-icon.png');
