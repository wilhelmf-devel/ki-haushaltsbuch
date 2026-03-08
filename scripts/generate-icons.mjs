// Generates PNG icons from icon.svg using sharp
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const svg          = readFileSync(join(root, 'public/icons/icon.svg'));
const svgMaskable  = readFileSync(join(root, 'public/icons/icon-maskable.svg'));

const icons = [
  // Standard icons (apple-touch-icon + manifest "any")
  { src: svg,         file: 'icon-192.png',            size: 192 },
  { src: svg,         file: 'icon-512.png',            size: 512 },
  { src: svg,         file: 'apple-touch-icon.png',    size: 180 },
  // Maskable icons for Android adaptive icons ("maskable")
  { src: svgMaskable, file: 'icon-maskable-192.png',   size: 192 },
  { src: svgMaskable, file: 'icon-maskable-512.png',   size: 512 },
];

for (const { src, file, size } of icons) {
  await sharp(src)
    .resize(size, size)
    .png()
    .toFile(join(root, 'public/icons', file));
  console.log(`✓ ${file} (${size}×${size})`);
}
