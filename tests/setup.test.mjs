import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  BLOCK_END,
  BLOCK_START,
  MANIFEST_NAME,
  apply,
  parseOptionArgs,
  plan,
  renderOptions,
  upsertBlock,
} from '../plugins/andy-init/skills/setup/scripts/setup.mjs';

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'andy-init-'));
}

function run(root, opts = {}) {
  const result = plan({ root, ...opts });
  if (!opts.dryRun) apply(result, 'test');
  return result;
}

const kinds = (result, kind) => result.actions.filter((a) => a.kind === kind).map((a) => a.key);
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('首次安裝：建立 AGENTS.md、rules、CLAUDE.md 區塊、偏好檔、settings language', () => {
  const root = tmpRoot();
  const result = run(root);

  assert.ok(kinds(result, 'add').includes('AGENTS.md'));
  assert.match(read(root, 'AGENTS.md'), /AGENTS\.md` 是規則本體/);
  assert.ok(fs.existsSync(path.join(root, 'rules/python/coding-style.md')));
  assert.ok(!fs.existsSync(path.join(root, 'rules/README.md')), '說明檔不應被當成 rule 安裝');
  assert.match(read(root, 'CLAUDE.md'), /@~\/\.claude\/AGENTS\.md/);
  assert.ok(fs.existsSync(path.join(root, 'project-docs.preferences.md')));
  assert.equal(JSON.parse(read(root, 'settings.json')).language, '繁體中文');
  assert.ok(fs.existsSync(path.join(root, MANIFEST_NAME)));
});

test('重跑：全部未變更', () => {
  const root = tmpRoot();
  run(root);
  const second = run(root);
  const changed = second.actions.filter((a) => !['same', 'skip'].includes(a.kind));
  assert.deepEqual(changed, []);
});

test('手改過的受管檔會被跳過；--force 先備份再覆蓋', () => {
  const root = tmpRoot();
  run(root);
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '我自己改的\n');

  const skipped = run(root);
  assert.ok(kinds(skipped, 'skip').includes('AGENTS.md'));
  assert.equal(read(root, 'AGENTS.md'), '我自己改的\n');

  run(root, { force: true });
  assert.match(read(root, 'AGENTS.md'), /工程習慣/);
  const backups = fs.readdirSync(root).filter((f) => f.startsWith('AGENTS.md.bak-'));
  assert.equal(backups.length, 1);
  assert.equal(fs.readFileSync(path.join(root, backups[0]), 'utf8'), '我自己改的\n');
});

test('既有但非 andy-init 建立的檔案（例如舊 ECC 的 AGENTS.md）不會被覆蓋', () => {
  const root = tmpRoot();
  fs.writeFileSync(path.join(root, 'AGENTS.md'), 'ECC 舊內容\n');
  const result = run(root);
  assert.ok(kinds(result, 'skip').includes('AGENTS.md'));
  assert.equal(read(root, 'AGENTS.md'), 'ECC 舊內容\n');
});

test('CLAUDE.md 區塊外的內容保留，且重跑不重複插入', () => {
  const root = tmpRoot();
  const codegraph = '<!-- CODEGRAPH_START -->\n## CodeGraph\n<!-- CODEGRAPH_END -->\n';
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), codegraph);
  run(root);
  run(root);
  const text = read(root, 'CLAUDE.md');
  assert.ok(text.includes(codegraph));
  assert.equal(text.split(BLOCK_START).length - 1, 1);
});

test('upsertBlock：標記不成對時拒絕處理', () => {
  assert.throws(() => upsertBlock(`${BLOCK_START}\n殘缺\n`, 'x'), /不成對/);
  assert.equal(upsertBlock(`a\n${BLOCK_START}\nold\n${BLOCK_END}\nb\n`, 'new'), `a\n${BLOCK_START}\nnew\n${BLOCK_END}\nb\n`);
});

test('settings.json 不合法時整批不寫入', () => {
  const root = tmpRoot();
  fs.writeFileSync(path.join(root, 'settings.json'), '{ 壞掉');
  const result = plan({ root });
  assert.ok(kinds(result, 'error').includes('settings.json'));
});

test('settings.json 既有設定保留，只改 language', () => {
  const root = tmpRoot();
  fs.writeFileSync(path.join(root, 'settings.json'), JSON.stringify({ model: 'opus', language: 'English' }));
  run(root);
  assert.deepEqual(JSON.parse(read(root, 'settings.json')), { model: 'opus', language: '繁體中文' });
});

test('改動使用者既有的 CLAUDE.md、settings.json 前先備份', () => {
  const root = tmpRoot();
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '我的全域規則\n');
  fs.writeFileSync(path.join(root, 'settings.json'), '{\n    "model": "opus"\n}');
  run(root);
  const baks = fs.readdirSync(root).filter((f) => f.includes('.bak-'));
  assert.ok(baks.some((f) => f.startsWith('CLAUDE.md.bak-')));
  assert.ok(baks.some((f) => f.startsWith('settings.json.bak-')));
  const claudeBak = baks.find((f) => f.startsWith('CLAUDE.md.bak-'));
  assert.equal(read(root, claudeBak), '我的全域規則\n');
});

test('manifest 缺 files 欄位也能處理', () => {
  const root = tmpRoot();
  fs.writeFileSync(path.join(root, MANIFEST_NAME), '{}');
  assert.doesNotThrow(() => run(root));
});

test('兩次 --force 的備份不互相覆蓋', () => {
  const root = tmpRoot();
  run(root);
  fs.writeFileSync(path.join(root, 'AGENTS.md'), 'v1\n');
  run(root, { force: true });
  fs.writeFileSync(path.join(root, 'AGENTS.md'), 'v2\n');
  run(root, { force: true });
  const baks = fs.readdirSync(root).filter((f) => f.startsWith('AGENTS.md.bak-'));
  assert.equal(baks.length, 2);
});

test('偏好檔已存在就不覆蓋', () => {
  const root = tmpRoot();
  fs.writeFileSync(path.join(root, 'project-docs.preferences.md'), '我的偏好\n');
  run(root);
  assert.equal(read(root, 'project-docs.preferences.md'), '我的偏好\n');
});

test('dry-run 不寫任何檔', () => {
  const root = tmpRoot();
  const result = plan({ root });
  assert.ok(result.actions.some((a) => a.kind === 'add'));
  assert.deepEqual(fs.readdirSync(root), []);
});

test('payload 移除的受管檔：沒手改就刪除', () => {
  const root = tmpRoot();
  run(root);
  const stale = 'rules/python/old-rule.md';
  fs.writeFileSync(path.join(root, stale), 'old\n');
  const manifestPath = path.join(root, MANIFEST_NAME);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.files[stale] = crypto.createHash('sha256').update('old\n').digest('hex');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));

  const result = run(root);
  assert.ok(kinds(result, 'remove').includes(stale));
  assert.ok(!fs.existsSync(path.join(root, stale)));
});

test('rules 目錄裡非受管的 .md 會被列為警告', () => {
  const root = tmpRoot();
  fs.mkdirSync(path.join(root, 'rules/python'), { recursive: true });
  fs.writeFileSync(path.join(root, 'rules/python/hooks.md'), 'ECC 舊檔\n');
  const result = run(root);
  assert.ok(result.warnings.some((w) => w.includes('rules/python/hooks.md')));
});

// ---- 可選規則變體（subagent-mode） ----

const INVESTIGATE = /子 agent 負責「\*\*搞清楚\*\*」/;
const IMPLEMENT = /子 agent 可以\*\*實作\*\*/;

test('subagent-mode 預設 investigate：只留調查版，標記行不寫出', () => {
  const root = tmpRoot();
  run(root);
  const text = read(root, 'AGENTS.md');
  assert.match(text, INVESTIGATE);
  assert.doesNotMatch(text, IMPLEMENT);
  assert.doesNotMatch(text, /andy-init:(option|end-option)/);
});

test('subagent-mode=implement：只留實作版，並記在 manifest', () => {
  const root = tmpRoot();
  run(root, { options: { 'subagent-mode': 'implement' } });
  const text = read(root, 'AGENTS.md');
  assert.match(text, IMPLEMENT);
  assert.doesNotMatch(text, INVESTIGATE);
  assert.equal(JSON.parse(read(root, MANIFEST_NAME)).options['subagent-mode'], 'implement');
});

test('重跑不帶選項：沿用 manifest 記的選擇，全部未變更', () => {
  const root = tmpRoot();
  run(root, { options: { 'subagent-mode': 'implement' } });
  const second = run(root);
  assert.equal(second.options['subagent-mode'], 'implement');
  assert.deepEqual(second.actions.filter((a) => !['same', 'skip'].includes(a.kind)), []);
});

test('切換選項：沒手改過的 AGENTS.md 會更新成另一個變體', () => {
  const root = tmpRoot();
  run(root);
  const switched = run(root, { options: { 'subagent-mode': 'implement' } });
  assert.ok(kinds(switched, 'update').includes('AGENTS.md'));
  assert.match(read(root, 'AGENTS.md'), IMPLEMENT);
});

test('切換選項：手改過的 AGENTS.md 照樣跳過（選項不能繞過手改保護）', () => {
  const root = tmpRoot();
  run(root);
  fs.appendFileSync(path.join(root, 'AGENTS.md'), '\n我自己加的\n');
  const switched = run(root, { options: { 'subagent-mode': 'implement' } });
  assert.ok(kinds(switched, 'skip').includes('AGENTS.md'));
  assert.match(read(root, 'AGENTS.md'), INVESTIGATE);
});

test('選項值不合法、未知選項：直接拋錯，不寫任何檔', () => {
  const root = tmpRoot();
  assert.throws(() => plan({ root, options: { 'subagent-mode': 'yolo' } }), /不合法/);
  assert.throws(() => plan({ root, options: { 'no-such-option': 'x' } }), /未知選項/);
  assert.ok(!fs.existsSync(path.join(root, 'AGENTS.md')));
});

test('renderOptions：標記不成對或引用未知選項時拋錯', () => {
  const opts = { 'subagent-mode': 'investigate' };
  assert.throws(() => renderOptions('<!-- andy-init:option subagent-mode=investigate -->\nx', opts), /結束標記/);
  assert.throws(() => renderOptions('x\n<!-- andy-init:end-option -->', opts), /開始標記/);
  assert.throws(() => renderOptions('<!-- andy-init:option nope=a -->\nx\n<!-- andy-init:end-option -->', opts), /未知選項/);
  assert.equal(renderOptions('沒有標記\n', opts), '沒有標記\n');
});

test('parseOptionArgs：只收 OPTIONS 裡的 --名稱=值', () => {
  assert.deepEqual(parseOptionArgs(['--dry-run', '--subagent-mode=implement', '--foo=bar']), {
    'subagent-mode': 'implement',
  });
});
