import fs from 'node:fs';
import path from 'node:path';

function getApiKey() {
  const envPath = path.resolve(process.cwd(), '.env');
  const envTxtPath = path.resolve(process.cwd(), '.env.txt');
  let content = '';
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf8');
  } else if (fs.existsSync(envTxtPath)) {
    content = fs.readFileSync(envTxtPath, 'utf8');
  }
  const match = content.match(/STITCH_API_KEY\s*=\s*(.+)/);
  if (!match) {
    throw new Error('STITCH_API_KEY not found in .env');
  }
  return match[1].trim().replace(/^["']|["']$/g, '');
}

let rpcId = 1;
async function callMcp(apiKey, name, args, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch('https://stitch.googleapis.com/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: rpcId++,
          method: 'tools/call',
          params: {
            name,
            arguments: args,
          },
        }),
      });

      if (!res.ok) {
        if (res.status === 429 && attempt < retries) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();
      if (json.error) {
        throw new Error(json.error.message || 'MCP Error');
      }

      const text = json.result?.content?.[0]?.text;
      if (!text) return {};
      return JSON.parse(text);
    } catch (err) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      throw err;
    }
  }
}

function getPhase(label) {
  const prefix = label.split('_')[0].toLowerCase();

  // Phase 8 (Cloud)
  if (
    ['02b', '07', '18', '18b'].includes(prefix) ||
    prefix.startsWith('10') ||
    prefix.startsWith('42') ||
    prefix.startsWith('43') ||
    prefix.startsWith('44') ||
    prefix.startsWith('45')
  ) {
    return 'phase8';
  }

  // Phase 1
  if (
    ['01', '02', '03', '04', '06', '07b', '09', '18c', '32a'].includes(prefix) ||
    prefix.startsWith('08') ||
    prefix.startsWith('46')
  ) {
    return 'phase1';
  }

  // Phase 2
  if (
    ['05', '05b', '25'].includes(prefix) ||
    prefix.startsWith('38') ||
    prefix.startsWith('23') ||
    prefix.startsWith('24') ||
    prefix.startsWith('27')
  ) {
    return 'phase2';
  }

  // Phase 3
  if (['11', '12', '12b', '13', '14', '15', '16', '16b', '17'].includes(prefix)) {
    return 'phase3';
  }

  // Phase 4
  if (
    prefix === '30' ||
    prefix.startsWith('26') ||
    prefix.startsWith('28') ||
    prefix.startsWith('29')
  ) {
    return 'phase4';
  }

  // Phase 5
  if (
    ['32b', '33', '34', '36', '40', '40b'].includes(prefix) ||
    prefix.startsWith('31') ||
    prefix.startsWith('35') ||
    prefix.startsWith('41')
  ) {
    return 'phase5';
  }

  // Phase 6
  if (['19', '19b', '21', '22'].includes(prefix) || prefix.startsWith('20')) {
    return 'phase6';
  }

  // Phase 7
  if (prefix.startsWith('37') || prefix.startsWith('39')) {
    return 'phase7';
  }

  return 'phase1';
}

async function main() {
  const apiKey = getApiKey();

  // 1. List projects to find Hospivo
  const projectsData = await callMcp(apiKey, 'list_projects', {});
  const hospivoProj = projectsData.projects?.find((p) =>
    p.title?.toLowerCase().includes('hospivo')
  );

  if (!hospivoProj) {
    console.error('Hospivo project not found');
    process.exit(1);
  }

  const projId = hospivoProj.name.replace('projects/', '');

  // 2. Get project details for screenInstances (contains screen labels)
  const projectDetails = await callMcp(apiKey, 'get_project', {
    name: hospivoProj.name,
  });

  const screenMap = new Map();
  for (const si of projectDetails.screenInstances || []) {
    if (si.sourceScreen && si.label && !si.label.startsWith('Generating') && !si.hidden) {
      if (!screenMap.has(si.sourceScreen)) {
        screenMap.set(si.sourceScreen, si.label);
      }
    }
  }

  // Special-case duplicate 08a instance if needed
  // Ensure '08a_Login_ChooseName' points to canonical login screen
  const loginCanonical = 'projects/' + projId + '/screens/bc4f843a59234c5d8e0d709fff936669';
  if (screenMap.has(loginCanonical)) {
    screenMap.set(loginCanonical, '08a_Login_ChooseName');
  }

  // 3. List all screens
  const screensData = await callMcp(apiKey, 'list_screens', {
    projectId: projId,
  });

  const screens = screensData.screens || [];
  const processedLabels = new Set();

  for (const screen of screens) {
    const label = screenMap.get(screen.name);
    if (!label || processedLabels.has(label)) {
      continue;
    }
    processedLabels.add(label);

    const phase = getPhase(label);
    const targetDir = path.resolve(process.cwd(), 'designs', phase);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const htmlPath = path.join(targetDir, `${label}.html`);
    const pngPath = path.join(targetDir, `${label}.png`);

    const hasHtml = fs.existsSync(htmlPath);
    const hasPng = fs.existsSync(pngPath);

    if (hasHtml && hasPng) {
      console.log(`${label}: OK`);
      continue;
    }

    try {
      // Download HTML if missing
      if (!hasHtml) {
        const htmlRes = await callMcp(apiKey, 'download_file', {
          name: `${screen.name}/fileEntries/html`,
        });
        if (htmlRes?.html) {
          fs.writeFileSync(htmlPath, htmlRes.html, 'utf8');
        }
      }

      // Download Screenshot if missing
      if (!hasPng) {
        try {
          const imgRes = await callMcp(apiKey, 'download_file', {
            name: `${screen.name}/fileEntries/screenshot`,
          });
          if (imgRes?.image) {
            fs.writeFileSync(pngPath, Buffer.from(imgRes.image, 'base64'));
          }
        } catch {
          // Screenshot is optional ("if the server gives one")
        }
      }

      console.log(`${label}: OK`);
    } catch {
      console.log(`${label}: failed`);
    }
  }
}

main().catch(() => {
  process.exit(1);
});
