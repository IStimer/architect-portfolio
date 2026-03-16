import { readdir, writeFile, mkdir } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import sharp from 'sharp';

const PUBLIC_DIR = join(new URL('.', import.meta.url).pathname, '..', 'public');
const IMG_DIR = join(PUBLIC_DIR, 'img');
const THUMBS_DIR = join(PUBLIC_DIR, 'img', 'thumbs');
const OUT_FILE = join(new URL('.', import.meta.url).pathname, '..', 'src', 'data', 'lqip-data.json');
const DIMS_FILE = join(new URL('.', import.meta.url).pathname, '..', 'src', 'data', 'image-dimensions.json');

async function collectWebpFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'thumbs') {
      files.push(...await collectWebpFiles(full));
    } else if (entry.name.endsWith('.webp')) {
      files.push(full);
    }
  }
  return files;
}

async function generateLqip(filePath) {
  const buffer = await sharp(filePath)
    .resize(20, null, { withoutEnlargement: true })
    .blur(1)
    .webp({ quality: 20 })
    .toBuffer();
  return `data:image/webp;base64,${buffer.toString('base64')}`;
}

async function generateThumb(filePath, outputPath) {
  await mkdir(dirname(outputPath), { recursive: true });
  await sharp(filePath)
    .resize(200, null, { withoutEnlargement: true })
    .webp({ quality: 60 })
    .toFile(outputPath);
}

async function main() {
  const files = await collectWebpFiles(IMG_DIR);
  files.sort();

  const lqip = {};
  const dims = {};
  let thumbCount = 0;

  for (const file of files) {
    const rel = relative(IMG_DIR, file);
    const key = '/img/' + rel;

    // LQIP base64
    lqip[key] = await generateLqip(file);

    // Image dimensions
    const metadata = await sharp(file).metadata();
    dims[key] = { w: metadata.width, h: metadata.height };

    // Thumbnail file
    const thumbPath = join(THUMBS_DIR, rel);
    await generateThumb(file, thumbPath);
    thumbCount++;
  }

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(lqip, null, 2) + '\n');
  await writeFile(DIMS_FILE, JSON.stringify(dims, null, 2) + '\n');
  console.log(`Generated LQIP for ${Object.keys(lqip).length} images -> ${OUT_FILE}`);
  console.log(`Generated dimensions for ${Object.keys(dims).length} images -> ${DIMS_FILE}`);
  console.log(`Generated ${thumbCount} thumbnails -> ${THUMBS_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
