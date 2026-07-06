import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

const root = process.cwd();
const jsFiles = [
  'api/_redis.js',
  'api/app-config.js',
  'api/ban.js',
  'api/scores.js',
  'js/config.js',
  'js/app.js',
  'js/audio.js',
  'js/fps-game.js',
  'js/game.js',
  'js/storage.js',
];

const localHtmlRefs = extractAttrRefs('index.html', /<(?:script|link)\b[^>]*(?:src|href)=['"]([^'"]+)['"][^>]*>/gi)
  .filter(isLocalRef);

const assetRefs = [
  ...extractAttrRefs('index.html', /\b(?:src|href)=['"]([^'"]+)['"]/gi),
  ...extractCssUrls('css/style.css'),
].filter(isLocalRef);

const warnings = [];
let failures = 0;

for (const file of jsFiles) {
  checkExists(file);
  runNodeCheck(file);
}

for (const ref of uniqueRefs(localHtmlRefs)) {
  checkExists(ref.path, `HTML local reference from ${ref.from}`);
}

for (const ref of uniqueRefs(assetRefs)) {
  checkExists(ref.path, `asset/static reference from ${ref.from}`);
}

const appSource = readFileSync(join(root, 'js/app.js'), 'utf8');
const configApiSource = readFileSync(join(root, 'api/app-config.js'), 'utf8');
const banApiSource = readFileSync(join(root, 'api/ban.js'), 'utf8');
const envExampleSource = readFileSync(join(root, '.env.example'), 'utf8');

checkFailure(
  /https:\/\/[a-z0-9-]+\.supabase\.co/i.test(appSource),
  'js/app.js must not hardcode a Supabase project URL.'
);
checkFailure(
  /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/.test(appSource),
  'js/app.js must not hardcode JWT/API-key-like values.'
);
checkFailure(
  !appSource.includes('window.AppConfig.load()'),
  'js/app.js must load Supabase config at runtime.'
);
checkFailure(
  !configApiSource.includes('SUPABASE_URL') || !configApiSource.includes('SUPABASE_ANON_KEY'),
  'api/config.js must support Supabase public environment variable names.'
);
checkFailure(
  /SERVICE_ROLE/i.test(configApiSource),
  'api/config.js must not expose service-role environment variables.'
);
checkFailure(
  !/req\.method === 'POST'[\s\S]*?isAdminRequest/.test(banApiSource),
  'api/ban.js POST must require an admin token.'
);
checkFailure(
  !/req\.method === 'DELETE'[\s\S]*?isAdminRequest/.test(banApiSource),
  'api/ban.js DELETE must require an admin token.'
);
for (const key of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'KV_REST_API_URL', 'KV_REST_API_TOKEN']) {
  checkFailure(!envExampleSource.includes(key), `.env.example missing ${key}.`);
}
checkFailure(
  /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/.test(envExampleSource),
  '.env.example must not contain JWT/API-key-like values.'
);

checkWarning(
  appSource.includes('debugger;'),
  'js/app.js contains a debugger statement for devtools detection; verify it does not pause normal users during QA.'
);
checkWarning(
  !existsSync(join(root, '.env.local')),
  '.env.local is absent locally; Vercel must define KV_REST_API_URL and KV_REST_API_TOKEN before API smoke tests.'
);
checkWarning(
  /supabaseAnonKey/.test(readFileSync(join(root, 'js/app.js'), 'utf8')),
  'Supabase public anon config is loaded client-side; confirm this is intentional and protected by RLS/allowed origins.'
);

if (warnings.length) {
  console.log('QA warnings:');
  for (const warning of warnings) console.log(`- ${warning}`);
}

if (failures > 0) {
  console.error(`QA check failed with ${failures} failure(s).`);
  process.exit(1);
}

console.log(`QA check passed: ${jsFiles.length} JS files syntax-checked and ${new Set(assetRefs.map(r => r.path)).size} local static references verified.`);

function runNodeCheck(file) {
  try {
    execFileSync(process.execPath, ['--check', file], { cwd: root, stdio: 'pipe' });
  } catch (error) {
    failures++;
    const output = `${error.stdout || ''}${error.stderr || ''}`.trim();
    console.error(`Syntax check failed for ${file}${output ? `:\n${output}` : ''}`);
  }
}

function checkExists(target, label = target) {
  const fullPath = join(root, target);
  if (!existsSync(fullPath)) {
    failures++;
    console.error(`Missing ${label}: ${target}`);
  }
}

function checkWarning(condition, message) {
  if (condition) warnings.push(message);
}

function checkFailure(condition, message) {
  if (condition) {
    failures++;
    console.error(message);
  }
}

function extractAttrRefs(file, regex) {
  const fullPath = join(root, file);
  const text = readFileSync(fullPath, 'utf8');
  return [...text.matchAll(regex)].map(match => resolveRef(file, match[1]));
}

function extractCssUrls(file) {
  const fullPath = join(root, file);
  const text = readFileSync(fullPath, 'utf8');
  return [...text.matchAll(/url\((['"]?)([^)'"]+)\1\)/gi)].map(match => resolveRef(file, match[2]));
}

function resolveRef(from, rawRef) {
  const cleanRef = rawRef.split('#')[0].split('?')[0];
  const path = normalize(join(dirname(from), cleanRef)).replace(/\\/g, '/');
  return { from, rawRef, path };
}

function isLocalRef(ref) {
  return ref.rawRef &&
    !/^(?:https?:)?\/\//i.test(ref.rawRef) &&
    !/^data:/i.test(ref.rawRef) &&
    !/^mailto:/i.test(ref.rawRef) &&
    !/^#/i.test(ref.rawRef);
}

function uniqueRefs(refs) {
  return [...new Map(refs.map(ref => [`${ref.path}\0${ref.from}`, ref])).values()];
}
