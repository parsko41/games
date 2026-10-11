// Local stand-in for the real setup: serves the repo like GitHub Pages and answers POST /api by
// running the real server/Code.gs in a Node vm with fake Drive / Properties / Lock / Content services.
// Usage: node test/fake-server.js [port]   then open http://localhost:<port>/
const fs = require('fs'), vm = require('vm'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..');

function makeBackend() {
  let nextId = 1;
  const props = {};
  const folders = {}, files = {};
  function mkFile(name, content, parent) {
    const f = { id: 'f' + nextId++, name, content, parent,
      getBlob() { return { getDataAsString: () => f.content }; }, setContent(c) { f.content = c; }, getId() { return f.id; }, getUrl() { return 'drive://' + f.id; } };
    files[f.id] = f; return f;
  }
  function iter(l) { let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; }
  function mkFolder(name, id) {
    const d = { id: id || 'F' + nextId++, name, files: [], folders: [],
      createFolder(n) { const x = mkFolder(n); d.folders.push(x); return x; },
      getFoldersByName(n) { return iter(d.folders.filter(x => x.name === n)); },
      getFilesByName(n) { return iter(d.files.filter(f => f.name === n)); },
      createFile(n, c) { const f = mkFile(n, c, d); d.files.push(f); return f; }, getId() { return d.id; }, getUrl() { return 'drive://' + d.id; } };
    folders[d.id] = d; return d;
  }
  // Luke's real Drive layout (IDs from the changelogs)
  const tw = mkFolder('Tilework', '12wPzLtxt5awCZRKolMf--msClkw2e0b3');
  const twSave = mkFolder('Save data', '1dXMZ9SEyzDKnr7D-_RfWjDjWnAo9WpqB'); tw.folders.push(twSave);
  tw.createFile('tilework-words.txt', '0AA\n1B\n0CAT\n2R\n0DOG');
  const wh = mkFolder('Wheelhouse', '1uZxZBBM2XHhdecE2h-kJNyvXLBztgqIx');
  const whSave = wh.createFolder('Save data');               // found by name (its ID isn't recorded)
  const an = mkFolder('Answers', '1-gGJ2O0LXzXBdbX3wB6IbgpcLG7wNcwt');
  const anSave = mkFolder('Save data', '1KBmbtGoYfsDtKkbL22Gq8RTXruy1lHsw'); an.folders.push(anSave);

  const otdb = (cat) => ({ response_code: 0, results: Array.from({ length: 12 }, (_, i) => ({
    difficulty: ['easy', 'medium', 'hard'][i % 3], question: encodeURIComponent('Online question ' + cat + '-' + i + '?'),
    correct_answer: encodeURIComponent('Ans ' + cat + ' ' + i) })) });
  const ctx = {
    Logger: { log: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] === undefined ? null : props[k], setProperty: (k, v) => { props[k] = String(v); }, getProperties: () => Object.assign({}, props) }) },
    DriveApp: {
      getFolderById: id => { if (!folders[id]) throw new Error('No folder ' + id); return folders[id]; },
      getFileById: id => { if (!files[id]) throw new Error('No file ' + id); return files[id]; }
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; }, getContent() { return this.t; } }) },
    UrlFetchApp: { fetch: (url) => {
      if (/opentdb/.test(url)) { const cat = url.match(/category=(\d+)/)[1]; return { getResponseCode: () => 200, getContentText: () => JSON.stringify(otdb(cat)) }; }
      if (/wikipedia/.test(url)) return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ mostread: { articles: [{ titles: { normalized: 'Golden Gate Park' }, description: 'park in San Francisco' }] } }) };
      return { getResponseCode: () => 404, getContentText: () => '' };
    } },
    Utilities: { sleep() {}, formatDate: (d) => d.toISOString().slice(0, 10).replace(/-/g, '/') },
    JSON, Math, Date, Object, String, Number, Array, decodeURIComponent, Error
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'server', 'Code.gs'), 'utf8'), ctx);
  return { ctx, props, folders: { tw: twSave, wh: whSave, an: anSave }, calls: 0 };
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };

function start(port, backend) {
  backend = backend || makeBackend();
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        backend.calls++;
        const out = backend.ctx.doPost({ postData: { contents: body } });
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(out.getContent());
      });
      return;
    }
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    if (p === '/config.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end("window.GAMES_API_URL = '/api';"); }
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(port, () => r({ server, backend })));
}

module.exports = { start, makeBackend };
if (require.main === module) start(+process.argv[2] || 8080).then(() => console.log('Games app on http://localhost:' + (+process.argv[2] || 8080) + '/'));
