#!/usr/bin/env node
// andy-init 全域環境安裝：把 payload 寫進 ~/.claude（或 CLAUDE_CONFIG_DIR）。
// 用法：node setup.mjs [--dry-run] [--force] | node setup.mjs --check-lsp
// 冪等：重跑只會動「andy-init 上次寫入後沒被手改過」的檔案；手改過的檔案跳過，--force 才會先備份再覆蓋。

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PAYLOAD_DIR = path.join(SCRIPT_DIR, '..', 'payload');
const PLUGIN_JSON = path.join(SCRIPT_DIR, '..', '..', '..', '.claude-plugin', 'plugin.json');

export const MANIFEST_NAME = 'andy-init.manifest.json';
export const BLOCK_START = '<!-- andy-init:START -->';
export const BLOCK_END = '<!-- andy-init:END -->';

// 宣告式清單：擴充全域檔案只改這裡。
// managed   = 完整受管（依 manifest 判斷能否覆蓋）
// block     = 只改寫目標檔中的受管區塊
// seed-once = 不存在才建立，之後屬於使用者
// json-merge= 合併進既有 JSON
export const ITEMS = [
  { src: 'AGENTS.md', dest: 'AGENTS.md', mode: 'managed' },
  // rules/README.md 不安裝：~/.claude/rules 下的 .md 都會被當成 rule 載入，說明檔只會白佔 context。
  { src: 'rules', dest: 'rules', mode: 'managed', exclude: ['README.md'] },
  { src: 'claude-md.block.md', dest: 'CLAUDE.md', mode: 'block' },
  { src: 'project-docs.preferences.md', dest: 'project-docs.preferences.md', mode: 'seed-once' },
  { src: 'settings.patch.json', dest: 'settings.json', mode: 'json-merge' },
];

/** node 會把主模組 realpath，直接比字串在 symlink 路徑下會失敗、讓腳本什麼都不做就結束。 */
export function isEntryPoint(metaUrl) {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(metaUrl));
  } catch {
    return false;
  }
}

export function resolveRoot(env = process.env) {
  return env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const toKey = (p) => p.split(path.sep).join('/');

function readIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
}

function listFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(full, base) : [path.relative(base, full)];
  });
}

/** 把 managed 項目展開成逐檔清單 [{src, key}]，key 為相對 root 的 posix 路徑。 */
export function expandManaged(item, payloadDir) {
  const src = path.join(payloadDir, item.src);
  if (fs.statSync(src).isFile()) return [{ src, key: item.dest }];
  const exclude = new Set(item.exclude || []);
  return listFiles(src)
    .filter((rel) => !exclude.has(toKey(rel)))
    .sort()
    .map((rel) => ({ src: path.join(src, rel), key: toKey(path.join(item.dest, rel)) }));
}

/** 在既有 CLAUDE.md 內容中插入或替換受管區塊，區塊外原樣保留。 */
export function upsertBlock(existing, inner) {
  const block = `${BLOCK_START}\n${inner.trimEnd()}\n${BLOCK_END}`;
  if (existing == null || existing.trim() === '') return `${block}\n`;
  const start = existing.indexOf(BLOCK_START);
  const end = existing.indexOf(BLOCK_END);
  if (start !== -1 && end > start) {
    return existing.slice(0, start) + block + existing.slice(end + BLOCK_END.length);
  }
  if (start !== -1 || end !== -1) throw new Error('CLAUDE.md 的 andy-init 區塊標記不成對，請手動修正後重跑');
  return `${block}\n\n${existing}`;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function deepMerge(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isPlainObject(v) && isPlainObject(base[k]) ? deepMerge(base[k], v) : v;
  }
  return out;
}

function planManaged(item, ctx) {
  const actions = [];
  const files = expandManaged(item, ctx.payloadDir);
  const seen = new Set(files.map((f) => f.key));

  for (const { src, key } of files) {
    const next = fs.readFileSync(src);
    const dest = path.join(ctx.root, key);
    const cur = readIfExists(dest);
    const recorded = ctx.manifest.files[key];
    if (cur == null) actions.push({ kind: 'add', key, dest, content: next });
    else if (cur.equals(next)) actions.push({ kind: 'same', key, dest, content: next });
    else if (recorded && sha256(cur) === recorded) actions.push({ kind: 'update', key, dest, content: next });
    else if (ctx.force) actions.push({ kind: 'update', key, dest, content: next, backup: true });
    else {
      const why = recorded ? '本機已手動修改' : '既有檔案不是 andy-init 建立的';
      actions.push({ kind: 'skip', key, dest, reason: `${why}（--force 會先備份再覆蓋）` });
    }
  }

  // 上一版有、這一版沒有的受管檔：沒被手改才移除。
  const prefix = `${item.dest}/`;
  for (const [key, hash] of Object.entries(ctx.manifest.files)) {
    if (seen.has(key) || !(key === item.dest || key.startsWith(prefix))) continue;
    const dest = path.join(ctx.root, key);
    const cur = readIfExists(dest);
    if (cur == null) continue;
    if (sha256(cur) === hash || ctx.force) actions.push({ kind: 'remove', key, dest, backup: sha256(cur) !== hash });
    else actions.push({ kind: 'skip', key, dest, reason: '已不在 payload 中，但本機改過，保留' });
  }
  return actions;
}

function planBlock(item, ctx) {
  const dest = path.join(ctx.root, item.dest);
  const cur = readIfExists(dest)?.toString('utf8') ?? null;
  const next = upsertBlock(cur, fs.readFileSync(path.join(ctx.payloadDir, item.src), 'utf8'));
  const kind = cur == null ? 'add' : cur === next ? 'same' : 'update';
  // 區塊外是使用者自己的內容，改動前一律備份
  return [{ kind, key: item.dest, dest, content: Buffer.from(next), untracked: true, backup: kind === 'update' }];
}

function planSeedOnce(item, ctx) {
  const dest = path.join(ctx.root, item.dest);
  if (fs.existsSync(dest)) return [{ kind: 'skip', key: item.dest, dest, reason: '已存在（屬於你，不覆蓋）', quiet: true }];
  return [{ kind: 'add', key: item.dest, dest, content: fs.readFileSync(path.join(ctx.payloadDir, item.src)), untracked: true }];
}

function planJsonMerge(item, ctx) {
  const dest = path.join(ctx.root, item.dest);
  const patch = JSON.parse(fs.readFileSync(path.join(ctx.payloadDir, item.src), 'utf8'));
  const raw = readIfExists(dest)?.toString('utf8');
  let base = {};
  if (raw != null && raw.trim() !== '') {
    try {
      base = JSON.parse(raw);
    } catch (err) {
      return [{ kind: 'error', key: item.dest, dest, reason: `JSON 無法解析，未寫入：${err.message}` }];
    }
  }
  const merged = deepMerge(base, patch);
  if (JSON.stringify(merged) === JSON.stringify(base)) return [{ kind: 'same', key: item.dest, dest }];
  const changed = Object.keys(patch).join(', ');
  return [{
    kind: raw == null ? 'add' : 'update', key: item.dest, dest, untracked: true, backup: raw != null,
    content: Buffer.from(JSON.stringify(merged, null, 2) + '\n'), note: `設定 ${changed}`,
  }];
}

/** ~/.claude/rules/<lang>/ 裡不是 andy-init 管的 .md 也會被載入，列出來提醒。 */
function strayRuleWarnings(ctx, managedKeys) {
  const rulesDir = path.join(ctx.root, 'rules');
  if (!fs.existsSync(rulesDir)) return [];
  const langs = new Set([...managedKeys].filter((k) => k.startsWith('rules/')).map((k) => k.split('/')[1]));
  return listFiles(rulesDir)
    .map((rel) => toKey(path.join('rules', rel)))
    .filter((key) => key.endsWith('.md') && langs.has(key.split('/')[1]) && !managedKeys.has(key))
    .map((key) => `${key} 不是 andy-init 管理的檔案，但仍會被當成 rule 載入；不需要就刪掉`);
}

const PLANNERS = { managed: planManaged, block: planBlock, 'seed-once': planSeedOnce, 'json-merge': planJsonMerge };

export function plan({ root, payloadDir = PAYLOAD_DIR, force = false }) {
  const manifestPath = path.join(root, MANIFEST_NAME);
  let manifest = { version: null, files: {} };
  if (fs.existsSync(manifestPath)) {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest = { ...manifest, ...parsed, files: parsed.files ?? {} };
  }
  const ctx = { root, payloadDir, force, manifest };
  const actions = ITEMS.flatMap((item) => PLANNERS[item.mode](item, ctx));
  const managedKeys = new Set(actions.filter((a) => !a.untracked && a.kind !== 'remove').map((a) => a.key));
  return { actions, manifest, manifestPath, warnings: strayRuleWarnings(ctx, managedKeys) };
}

function timestamp() {
  return new Date().toISOString().replace(/[-:T.Z]/g, '');
}

/** 以獨佔模式建立備份，同一毫秒內重複也不會互相覆蓋。 */
function backup(dest, stamp) {
  for (let n = 0; ; n++) {
    const target = `${dest}.bak-${stamp}${n ? `-${n}` : ''}`;
    try {
      fs.copyFileSync(dest, target, fs.constants.COPYFILE_EXCL);
      return;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }
}

// 目標是 symlink（例如指向 dotfiles repo）時寫進真正的檔案，不要把連結換成一般檔。
function writeAtomic(dest, content) {
  const real = fs.existsSync(dest) ? fs.realpathSync(dest) : dest;
  fs.mkdirSync(path.dirname(real), { recursive: true });
  const tmp = `${real}.andy-init-tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, real);
}

export function apply({ actions, manifest, manifestPath }, version) {
  const files = { ...manifest.files };
  const stamp = timestamp();
  for (const a of actions) {
    if (a.backup && fs.existsSync(a.dest)) backup(a.dest, stamp);
    if (a.kind === 'add' || a.kind === 'update') writeAtomic(a.dest, a.content);
    if (a.kind === 'remove') fs.rmSync(a.dest);
    if (a.untracked) continue;
    if (a.kind === 'remove') delete files[a.key];
    else if (a.content && a.kind !== 'skip') files[a.key] = sha256(a.content);
  }
  writeAtomic(manifestPath, JSON.stringify({ version, updatedAt: new Date().toISOString(), files }, null, 2) + '\n');
}

const LABELS = { add: '新增', update: '更新', remove: '移除', skip: '跳過', error: '錯誤', same: '未變更' };

export function formatReport(actions, warnings, { dryRun }) {
  const lines = [dryRun ? '【預覽，尚未寫入任何檔案】' : '【已套用】'];
  for (const kind of ['add', 'update', 'remove', 'skip', 'error']) {
    const list = actions.filter((a) => a.kind === kind);
    if (!list.length) continue;
    lines.push(`${LABELS[kind]}（${list.length}）`);
    for (const a of list) {
      const extra = a.reason || a.note || (a.backup ? '先備份為 .bak-<時間戳>' : '');
      lines.push(`  - ${a.key}${extra ? `：${extra}` : ''}`);
    }
  }
  const same = actions.filter((a) => a.kind === 'same').length;
  if (same) lines.push(`未變更（${same}）`);
  if (warnings.length) lines.push(`警告（${warnings.length}）`, ...warnings.map((w) => `  - ${w}`));
  return lines.join('\n');
}

// ---- LSP 偵測（給 SKILL.md 決定要裝哪些） ----

function isExecutableFile(file) {
  try {
    if (!fs.statSync(file).isFile()) return false;
    if (process.platform !== 'win32') fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function onPath(binary, env = process.env) {
  const exts = process.platform === 'win32' ? (env.PATHEXT || '.EXE;.CMD;.BAT').split(';') : [''];
  const dirs = (env.PATH || env.Path || '').split(path.delimiter).filter(Boolean);
  return dirs.some((d) => exts.some((ext) => isExecutableFile(path.join(d, binary + ext))));
}

function installedPlugins(root) {
  const file = path.join(root, 'plugins', 'installed_plugins.json');
  if (!fs.existsSync(file)) return new Set();
  try {
    return new Set(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')).plugins || {}));
  } catch {
    return new Set();
  }
}

export function checkLsp(root, payloadDir = PAYLOAD_DIR) {
  const spec = JSON.parse(fs.readFileSync(path.join(payloadDir, 'lsp.json'), 'utf8'));
  const installed = installedPlugins(root);
  const pickInstall = (i) => i[process.platform] || i.all || Object.values(i)[0];
  return {
    claudeHudInstalled: [...installed].some((k) => k.startsWith('claude-hud@')),
    knownGaps: spec.knownGaps,
    groups: spec.groups.map((g) => ({
      id: g.id,
      label: g.label,
      items: g.items.map((it) => ({
        plugin: it.plugin,
        id: `${it.plugin}@${spec.marketplace}`,
        languages: it.languages,
        binary: it.binary,
        binaryFound: onPath(it.binary),
        pluginInstalled: installed.has(`${it.plugin}@${spec.marketplace}`),
        installBinary: pickInstall(it.install),
      })),
    })),
  };
}

function readVersion() {
  return JSON.parse(fs.readFileSync(PLUGIN_JSON, 'utf8')).version;
}

function main(argv) {
  const known = new Set(['--dry-run', '--force', '--check-lsp']);
  const bad = argv.filter((a) => !known.has(a));
  if (bad.length) throw new Error(`未知參數：${bad.join(' ')}`);
  const root = resolveRoot();

  if (argv.includes('--check-lsp')) {
    console.log(JSON.stringify(checkLsp(root), null, 2));
    return 0;
  }
  const dryRun = argv.includes('--dry-run');
  const result = plan({ root, force: argv.includes('--force') });
  const hasError = result.actions.some((a) => a.kind === 'error');
  if (!dryRun && !hasError) apply(result, readVersion());
  console.log(`目標：${root}`);
  console.log(formatReport(result.actions, result.warnings, { dryRun: dryRun || hasError }));
  if (hasError) console.log('有錯誤，整批未寫入。修正後重跑。');
  return hasError ? 1 : 0;
}

if (isEntryPoint(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(`setup 失敗：${err.stack || err}`);
    process.exitCode = 1;
  }
}
