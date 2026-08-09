import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const publicRoot = path.join(__dirname, 'public');
const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });

const args = process.argv.slice(2);
let port = 5177;
let inputArg = null;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if ((arg === '--port' || arg === '-p') && args[i + 1]) {
    port = Number(args[i + 1]);
    i += 1;
  } else if (arg.startsWith('--port=')) {
    port = Number(arg.slice('--port='.length));
  } else if (!inputArg) {
    inputArg = arg;
  }
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Port must be an integer from 1 to 65535.');
}

let currentRoot = await resolveFolder(inputArg ?? 'output');
let cachedScan = null;

async function resolveFolder(folder) {
  const candidates = path.isAbsolute(folder)
    ? [folder]
    : [path.resolve(process.cwd(), folder), path.resolve(projectRoot, folder)];

  for (const candidate of candidates) {
    try {
      const stat = await fs.promises.stat(candidate);
      if (stat.isDirectory()) {
        return await fs.promises.realpath(candidate);
      }
    } catch {
      // Try next candidate.
    }
  }

  throw new Error(`Folder not found: ${folder}`);
}

function encodeId(value) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeId(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function normalizeRelative(value) {
  return value.split(path.sep).join('/');
}

function isMarkdown(fileName) {
  return fileName.toLowerCase().endsWith('.md');
}

function isLectureFile(fileName) {
  return fileName.toLowerCase() === 'lecture.md';
}

function sortByName(a, b) {
  return collator.compare(a.name, b.name);
}

async function listMarkdownFiles(root) {
  const result = [];

  async function walk(dir) {
    const entries = (await fs.promises.readdir(dir, { withFileTypes: true })).sort(sortByName);
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
      } else if (entry.isFile() && isMarkdown(entry.name)) {
        result.push(absolute);
      }
    }
  }

  await walk(root);
  return result;
}

async function readFirstHeading(filePath) {
  const text = await fs.promises.readFile(filePath, 'utf8');
  const heading = text.match(/^#\s+(.+)$/m);
  return heading?.[1]?.trim() || null;
}

async function readManifestTitle(dir) {
  try {
    const manifestPath = path.join(dir, 'lesson-manifest.json');
    const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'));
    return manifest.title || manifest.topicTitle || manifest.topicId || null;
  } catch {
    return null;
  }
}

async function buildEntry(filePath, allMarkdown) {
  const dir = path.dirname(filePath);
  const relativeFile = normalizeRelative(path.relative(currentRoot, filePath));
  const relativeDir = normalizeRelative(path.relative(currentRoot, dir)) || '.';
  const title = await readFirstHeading(filePath)
    ?? await readManifestTitle(dir)
    ?? path.basename(dir)
    ?? path.basename(filePath, '.md');

  const siblingFiles = allMarkdown
    .filter((file) => path.dirname(file) === dir && file !== filePath)
    .map((file) => ({
      id: encodeId(normalizeRelative(path.relative(currentRoot, file))),
      name: path.basename(file),
      path: normalizeRelative(path.relative(currentRoot, file))
    }));

  return {
    id: encodeId(relativeFile),
    title,
    path: relativeFile,
    folder: relativeDir,
    materialCount: siblingFiles.length,
    materials: siblingFiles
  };
}

async function scanLectures() {
  const allMarkdown = await listMarkdownFiles(currentRoot);
  const lectureFiles = allMarkdown.filter((file) => isLectureFile(path.basename(file)));
  const primaryFiles = lectureFiles.length > 0 ? lectureFiles : allMarkdown;
  const lectures = [];

  for (const file of primaryFiles) {
    lectures.push(await buildEntry(file, allMarkdown));
  }

  lectures.sort((a, b) => collator.compare(a.path, b.path));
  cachedScan = { root: currentRoot, count: lectures.length, lectures };
  return cachedScan;
}

async function getScan() {
  return cachedScan ?? await scanLectures();
}

function json(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}

function text(res, status, payload) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(payload);
}

async function readRequestBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 16_384) throw new Error('Request body is too large.');
  }
  return body;
}

function resolveInsideRoot(relativePath) {
  const absolute = path.resolve(currentRoot, relativePath);
  const normalizedRoot = `${currentRoot}${path.sep}`;
  if (absolute !== currentRoot && !absolute.startsWith(normalizedRoot)) {
    throw new Error('Path is outside the selected folder.');
  }
  return absolute;
}

async function serveLecture(reqUrl, res) {
  const id = reqUrl.searchParams.get('id');
  if (!id) return json(res, 400, { error: 'Missing lecture id.' });

  const relativePath = decodeId(id);
  const filePath = resolveInsideRoot(relativePath);
  if (!isMarkdown(filePath)) return json(res, 400, { error: 'Only Markdown files can be opened.' });

  const content = await fs.promises.readFile(filePath, 'utf8');
  const scan = await getScan();
  const lecture = scan.lectures.find((item) => item.id === id) ?? {
    id,
    title: await readFirstHeading(filePath) ?? path.basename(filePath, '.md'),
    path: normalizeRelative(path.relative(currentRoot, filePath)),
    folder: normalizeRelative(path.relative(currentRoot, path.dirname(filePath))) || '.',
    materialCount: 0,
    materials: []
  };

  return json(res, 200, { ...lecture, content });
}

async function serveAsset(reqUrl, res) {
  const baseId = reqUrl.searchParams.get('base');
  const href = reqUrl.searchParams.get('href');
  if (!baseId || !href) return json(res, 400, { error: 'Missing asset parameters.' });
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return json(res, 400, { error: 'External assets are not proxied.' });

  const baseFile = decodeId(baseId);
  const assetPath = resolveInsideRoot(path.join(path.dirname(baseFile), href));
  const stat = await fs.promises.stat(assetPath);
  if (!stat.isFile()) return json(res, 404, { error: 'Asset not found.' });

  const ext = path.extname(assetPath).toLowerCase();
  const types = new Map([
    ['.png', 'image/png'],
    ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.gif', 'image/gif'],
    ['.webp', 'image/webp'],
    ['.svg', 'image/svg+xml'],
    ['.pdf', 'application/pdf']
  ]);

  res.writeHead(200, { 'content-type': types.get(ext) ?? 'application/octet-stream' });
  fs.createReadStream(assetPath).pipe(res);
}

async function serveStatic(reqUrl, res) {
  const pathname = decodeURIComponent(reqUrl.pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = path.resolve(publicRoot, relative);
  const normalizedPublic = `${publicRoot}${path.sep}`;
  if (filePath !== publicRoot && !filePath.startsWith(normalizedPublic)) {
    return text(res, 403, 'Forbidden');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentTypes = new Map([
    ['.html', 'text/html; charset=utf-8'],
    ['.css', 'text/css; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8']
  ]);

  try {
    const content = await fs.promises.readFile(filePath);
    res.writeHead(200, { 'content-type': contentTypes.get(ext) ?? 'application/octet-stream' });
    res.end(content);
  } catch {
    text(res, 404, 'Not found');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && reqUrl.pathname === '/api/lectures') {
      cachedScan = null;
      return json(res, 200, await scanLectures());
    }

    if (req.method === 'GET' && reqUrl.pathname === '/api/lecture') {
      return await serveLecture(reqUrl, res);
    }

    if (req.method === 'GET' && reqUrl.pathname === '/api/asset') {
      return await serveAsset(reqUrl, res);
    }

    if (req.method === 'POST' && reqUrl.pathname === '/api/root') {
      const body = JSON.parse(await readRequestBody(req) || '{}');
      if (!body.root || typeof body.root !== 'string') {
        return json(res, 400, { error: 'Root folder is required.' });
      }
      currentRoot = await resolveFolder(body.root);
      cachedScan = null;
      return json(res, 200, await scanLectures());
    }

    if (req.method === 'GET') {
      return await serveStatic(reqUrl, res);
    }

    text(res, 405, 'Method not allowed');
  } catch (error) {
    json(res, 500, { error: error.message });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Course viewer: http://127.0.0.1:${port}`);
  console.log(`Folder: ${currentRoot}`);
});
