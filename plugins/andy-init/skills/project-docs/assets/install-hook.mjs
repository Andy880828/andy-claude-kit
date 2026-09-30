#!/usr/bin/env node
// 把 docs-sync Stop hook 裝進專案：複製腳本、註冊到 .claude/settings.json、state 檔加進 .gitignore。
// 用法：node install-hook.mjs <專案根目錄> [--dry-run] [--remove] [--force]
// 冪等：只在 plugin 內的版本較新時更新；本機較新或同版本卻被手改過就跳過（--force 才覆蓋）。
// settings.json 其他內容原樣保留。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ASSET = path.join(path.dirname(fileURLToPath(import.meta.url)), 'docs-sync.cjs');
export const HOOK_REL = '.claude/hooks/docs-sync.cjs';
export const STATE_REL = '.claude/.docs-sync-state.json';
export const COMMAND = `node "$CLAUDE_PROJECT_DIR/${HOOK_REL}"`;
const VERSION_RE = /^\/\/ docs-sync v(\d+\.\d+\.\d+)/m;

export function scriptVersion(text) {
  return text?.match(VERSION_RE)?.[1] ?? null;
}

/** a < b 回傳負數；缺版本號視為最舊。 */
export function compareVersions(a, b) {
  const pa = (a ?? '0.0.0').split('.').map(Number);
  const pb = (b ?? '0.0.0').split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

function writeAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.andy-init-tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

function isOurs(hook) {
  return hook?.type === 'command' && typeof hook.command === 'string' && hook.command.includes('docs-sync.cjs');
}

/** 回傳加入（或移除）docs-sync 之後的 settings 物件，不改動傳入值。 */
export function withHook(settings, { remove = false } = {}) {
  const hooks = { ...(settings.hooks || {}) };
  const stop = (hooks.Stop || [])
    .map((group) => ({ ...group, hooks: (group.hooks || []).filter((h) => !isOurs(h)) }))
    .filter((group) => group.hooks.length > 0);
  if (!remove) stop.push({ hooks: [{ type: 'command', command: COMMAND, timeout: 15 }] });
  if (stop.length) hooks.Stop = stop;
  else delete hooks.Stop;
  const next = { ...settings, hooks };
  if (!Object.keys(hooks).length) delete next.hooks;
  return next;
}

function readJson(file) {
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, 'utf8');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${file} 不是合法 JSON，未做任何修改：${err.message}`);
  }
}

export function install(projectRoot, { dryRun = false, remove = false, force = false } = {}) {
  const report = [];
  const hookPath = path.join(projectRoot, HOOK_REL);
  const settingsPath = path.join(projectRoot, '.claude', 'settings.json');
  const gitignorePath = path.join(projectRoot, '.gitignore');

  const settings = readJson(settingsPath); // 先驗證，壞掉就整批不動
  const asset = fs.readFileSync(ASSET, 'utf8');
  const current = fs.existsSync(hookPath) ? fs.readFileSync(hookPath, 'utf8') : null;

  const writes = [];
  if (remove) {
    if (current != null) {
      report.push(`移除 ${HOOK_REL}`);
      writes.push(() => fs.rmSync(hookPath));
    }
  } else if (current !== asset) {
    const from = scriptVersion(current);
    const to = scriptVersion(asset);
    const cmp = current == null ? 1 : compareVersions(to, from);
    if (cmp <= 0 && !force) {
      const why = cmp < 0 ? `本機 v${from} 比 plugin 的 v${to} 新` : `同為 v${to} 但本機內容被改過`;
      report.push(`跳過 ${HOOK_REL}：${why}（--force 會覆蓋）`);
    } else {
      report.push(current == null ? `新增 ${HOOK_REL}（v${to}）` : `更新 ${HOOK_REL}（v${from ?? '?'} → v${to}）`);
      writes.push(() => writeAtomic(hookPath, asset));
    }
  }

  const nextSettings = withHook(settings, { remove });
  if (JSON.stringify(nextSettings) !== JSON.stringify(settings)) {
    report.push(`${remove ? '移除' : '註冊'} .claude/settings.json 的 Stop hook`);
    writes.push(() => writeAtomic(settingsPath, JSON.stringify(nextSettings, null, 2) + '\n'));
  }

  const gitignore = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
  if (!remove && !gitignore.split(/\r?\n/).includes(STATE_REL)) {
    report.push(`.gitignore 加入 ${STATE_REL}`);
    const sep = gitignore && !gitignore.endsWith('\n') ? '\n' : '';
    writes.push(() => fs.writeFileSync(gitignorePath, `${gitignore}${sep}${STATE_REL}\n`));
  }

  if (!dryRun) writes.forEach((w) => w());
  return report.length ? report : ['已是最新，無需變更'];
}

function main(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const unknown = [...flags].filter((f) => !['--dry-run', '--remove', '--force'].includes(f));
  const [root] = argv.filter((a) => !a.startsWith('--'));
  if (!root || unknown.length) throw new Error('用法：node install-hook.mjs <專案根目錄> [--dry-run] [--remove] [--force]');
  const dryRun = flags.has('--dry-run');
  const lines = install(path.resolve(root), { dryRun, remove: flags.has('--remove'), force: flags.has('--force') });
  console.log([dryRun ? '【預覽】' : '【已套用】', ...lines.map((l) => `- ${l}`)].join('\n'));
}

// node 會把主模組 realpath；直接比字串在 symlink 路徑下會讓腳本什麼都不做就結束。
function isEntryPoint() {
  try {
    return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(`install-hook 失敗：${err.message}`);
    process.exitCode = 1;
  }
}
