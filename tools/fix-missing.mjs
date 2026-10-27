// Retries ONLY the 3 missing Hospivo screens and prints the real reason if something fails.
// Run:  node tools/fix-missing.mjs
import fs from 'node:fs';
import path from 'node:path';

const WANTED = {
  '09_Home_Local': 'phase1',
  '20b_Fast_OutOfStock': 'phase6',
  '26b_Expiry_Expired': 'phase4',
};

function getApiKey() {
  const p = fs.existsSync('.env') ? '.env' : '.env.txt';
  const m = fs.readFileSync(p, 'utf8').match(/STITCH_API_KEY\s*=\s*(.+)/);
  if (!m) throw new Error('STITCH_API_KEY not found in .env');
  return m[1].trim().replace(/^["']|["']$/g, '');
}
const KEY = getApiKey();
let id = 1000;

async function mcp(name, args) {
  const res = await fetch('https://stitch.googleapis.com/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY },
    body: JSON.stringify({ jsonrpc: '2.0', id: id++, method: 'tools/call', params: { name, arguments: args } }),
    signal: AbortSignal.timeout(90000),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${raw.slice(0, 300)}`);
  const json = JSON.parse(raw);
  if (json.error) throw new Error('MCP error: ' + (json.error.message || JSON.stringify(json.error)).slice(0, 300));
  const text = json.result?.content?.[0]?.text;
  if (!text) throw new Error('Empty reply. Raw: ' + raw.slice(0, 300));
  try { return JSON.parse(text); } catch { return { _text: text }; }
}

async function tryTimes(label, fn, times = 4) {
  for (let i = 1; i <= times; i++) {
    try { return await fn(); }
    catch (e) {
      console.log(`  ${label} attempt ${i}/${times} failed -> ${e.message}`);
      if (i < times) await new Promise(r => setTimeout(r, 3000 * i));
    }
  }
  return null;
}

async function main() {
  const projects = await mcp('list_projects', {});
  const proj = projects.projects.find(p => p.title?.toLowerCase().includes('hospivo'));
  const projId = proj.name.replace('projects/', '');
  const details = await mcp('get_project', { name: proj.name });
  const labelToSources = {};
  for (const si of details.screenInstances || []) {
    if (si.label && WANTED[si.label] && si.sourceScreen) {
      (labelToSources[si.label] ||= new Set()).add(si.sourceScreen);
    }
  }

  for (const [label, phase] of Object.entries(WANTED)) {
    console.log(`\n=== ${label} ===`);
    const sources = [...(labelToSources[label] || [])];
    if (!sources.length) { console.log('  No screen found with this label in the project.'); continue; }
    const dir = path.resolve('designs', phase);
    fs.mkdirSync(dir, { recursive: true });
    const htmlPath = path.join(dir, label + '.html');
    const pngPath = path.join(dir, label + '.png');

    for (const src of sources) {
      console.log('  source screen:', src);

      if (!fs.existsSync(htmlPath)) {
        const r = await tryTimes('html', async () => {
          const d = await mcp('download_file', { name: `${src}/fileEntries/html` });
          if (!d.html) throw new Error('reply has no "html" field. Fields: ' + Object.keys(d).join(', '));
          return d.html;
        });
        if (r) { fs.writeFileSync(htmlPath, r, 'utf8'); console.log('  HTML saved,', r.length, 'characters'); }
        else {
          // Fallback: ask the screen itself and look for a direct download link
          const s = await tryTimes('get_screen', () => mcp('get_screen', { name: src }), 2);
          if (s) {
            console.log('  get_screen fields:', Object.keys(s).join(', '));
            const url = s.htmlCode?.downloadUrl || s.htmlCode?.url;
            if (url) {
              const resp = await fetch(url, { signal: AbortSignal.timeout(90000) });
              if (resp.ok) { fs.writeFileSync(htmlPath, await resp.text(), 'utf8'); console.log('  HTML saved via direct link'); }
              else console.log('  direct link failed: HTTP', resp.status);
            } else console.log('  no direct link found');
          }
        }
      }

      if (!fs.existsSync(pngPath)) {
        const r = await tryTimes('screenshot', async () => {
          const d = await mcp('download_file', { name: `${src}/fileEntries/screenshot` });
          if (!d.image) throw new Error('reply has no "image" field. Fields: ' + Object.keys(d).join(', '));
          return d.image;
        });
        if (r) { fs.writeFileSync(pngPath, Buffer.from(r, 'base64')); console.log('  PNG saved'); }
      }
      if (fs.existsSync(htmlPath) && fs.existsSync(pngPath)) break;
    }
    console.log(`  RESULT: html=${fs.existsSync(htmlPath)} png=${fs.existsSync(pngPath)}`);
  }
}
main().catch(e => { console.error('STOPPED:', e.message); process.exit(1); });
