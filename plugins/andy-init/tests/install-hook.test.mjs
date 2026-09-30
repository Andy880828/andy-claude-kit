import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { COMMAND, HOOK_REL, STATE_REL, install, withHook } from '../skills/project-docs/assets/install-hook.mjs';

function project(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-hook-'));
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  return dir;
}

const settingsOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'));
const stopCommands = (s) => (s.hooks?.Stop || []).flatMap((g) => g.hooks.map((h) => h.command));

test('全新專案：複製腳本、註冊 hook、加 gitignore', () => {
  const dir = project();
  install(dir);
  assert.ok(fs.existsSync(path.join(dir, HOOK_REL)));
  assert.deepEqual(stopCommands(settingsOf(dir)), [COMMAND]);
  assert.match(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), new RegExp(STATE_REL.replace(/\./g, '\\.')));
});

test('重跑冪等：不重複註冊、不重複 gitignore', () => {
  const dir = project();
  install(dir);
  assert.deepEqual(install(dir), ['已是最新，無需變更']);
  assert.equal(stopCommands(settingsOf(dir)).length, 1);
  const ignore = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8');
  assert.equal(ignore.split(STATE_REL).length - 1, 1);
});

test('既有 settings 與其他 Stop hook 保留', () => {
  const existing = { permissions: { allow: ['Bash(git *)'] }, hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo other' }] }] } };
  const dir = project({ '.claude/settings.json': JSON.stringify(existing), '.gitignore': 'node_modules' });
  install(dir);
  const s = settingsOf(dir);
  assert.deepEqual(s.permissions, existing.permissions);
  assert.deepEqual(stopCommands(s), ['echo other', COMMAND]);
  assert.equal(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), `node_modules\n${STATE_REL}\n`);
});

test('舊版腳本會被更新', () => {
  const dir = project({ [HOOK_REL]: '// docs-sync v0.0.1 (andy-init)\n' });
  const report = install(dir);
  assert.ok(report.some((l) => l.includes('v0.0.1 →')));
});

test('同版本但被手改過、或本機版本較新 → 跳過並警告；--force 才覆蓋', () => {
  const edited = project();
  install(edited);
  const hook = path.join(edited, HOOK_REL);
  fs.appendFileSync(hook, '// 我改的\n');
  assert.ok(install(edited).some((l) => l.includes('跳過')));
  assert.match(fs.readFileSync(hook, 'utf8'), /我改的/);
  install(edited, { force: true });
  assert.doesNotMatch(fs.readFileSync(hook, 'utf8'), /我改的/);

  const newer = project({ [HOOK_REL]: '// docs-sync v99.0.0 (andy-init)\n' });
  assert.ok(install(newer).some((l) => l.includes('跳過')));
  assert.match(fs.readFileSync(path.join(newer, HOOK_REL), 'utf8'), /v99\.0\.0/);
});

test('settings.json 壞掉時整批不動', () => {
  const dir = project({ '.claude/settings.json': '{壞' });
  assert.throws(() => install(dir), /不是合法 JSON/);
  assert.ok(!fs.existsSync(path.join(dir, HOOK_REL)));
});

test('--remove 只移除自己的 hook', () => {
  const dir = project({ '.claude/settings.json': JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo other' }] }] } }) });
  install(dir);
  install(dir, { remove: true });
  assert.ok(!fs.existsSync(path.join(dir, HOOK_REL)));
  assert.deepEqual(stopCommands(settingsOf(dir)), ['echo other']);
});

test('withHook 不改動傳入物件', () => {
  const s = { hooks: { Stop: [] } };
  const frozen = JSON.stringify(s);
  withHook(s);
  assert.equal(JSON.stringify(s), frozen);
});

test('dry-run 不寫檔', () => {
  const dir = project();
  install(dir, { dryRun: true });
  assert.deepEqual(fs.readdirSync(dir), []);
});
