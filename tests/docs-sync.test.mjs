import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), '../plugins/andy-init/skills/project-docs/assets/docs-sync.cjs');

function git(cwd, ...args) {
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd, stdio: 'ignore' });
}

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-sync-'));
  git(dir, 'init', '-q', '-b', 'main');
  write(dir, 'src/app.py', 'print(1)\n');
  write(dir, 'docs/PROGRESS.md', '# PROGRESS\n');
  write(dir, 'AGENTS.md', '# AGENTS\n');
  write(dir, '.gitignore', '.claude/.docs-sync-state.json\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'init');
  return dir;
}

function write(dir, rel, content) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), content);
}

/** 以真實 hook 行程執行，回傳是否擋下。 */
function stop(cwd, extra = {}, env = {}) {
  const res = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ hook_event_name: 'Stop', cwd, stop_hook_active: false, ...extra }),
    encoding: 'utf8',
    // 以 GIT_CONFIG_* 固定「自己」的 user.email，與 git() helper 提交時用的 t@t 一致
    env: { ...process.env, DOCS_SYNC_DISABLE: '', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'user.email', GIT_CONFIG_VALUE_0: 't@t', ...env },
  });
  assert.equal(res.status, 0, `hook 應永遠 exit 0，stderr: ${res.stderr}`);
  if (!res.stdout.trim()) return { block: false };
  const out = JSON.parse(res.stdout);
  return { block: out.decision === 'block', reason: out.reason };
}

test('沒有任何變更 → 放行', () => {
  assert.equal(stop(repo()).block, false);
});

test('只改文件 → 放行', () => {
  const dir = repo();
  write(dir, 'docs/PROGRESS.md', '# PROGRESS\n更新\n');
  write(dir, 'AGENTS.md', '# AGENTS\n新陷阱\n');
  write(dir, 'README.md', 'readme\n');
  assert.equal(stop(dir).block, false);
});

test('只改 .gitignore／.gitattributes（例如安裝 hook 本身）→ 放行', () => {
  const dir = repo();
  write(dir, '.gitignore', '.claude/.docs-sync-state.json\nnode_modules/\n');
  write(dir, 'sub/.gitattributes', '* text=auto\n');
  assert.equal(stop(dir).block, false);
});

test('改程式 → 擋下，reason 列出檔案與要檢查的文件', () => {
  const dir = repo();
  write(dir, 'src/app.py', 'print(2)\n');
  write(dir, 'src/new.py', 'x = 1\n');
  const r = stop(dir);
  assert.equal(r.block, true);
  assert.match(r.reason, /src\/app\.py/);
  assert.match(r.reason, /src\/new\.py/);
  assert.match(r.reason, /docs\/PROGRESS\.md/);
});

/** 把上次擋下的時間改到冷卻期之外，模擬「5 分鐘後」。 */
function expireCooldown(dir, msAgo = 6 * 60 * 1000) {
  const file = path.join(dir, '.claude/.docs-sync-state.json');
  const state = JSON.parse(fs.readFileSync(file, 'utf8'));
  state.blockedAt = new Date(Date.now() - msAgo).toISOString();
  fs.writeFileSync(file, JSON.stringify(state));
}

test('同一批檔案只擋一次：內容再變也不重擋', () => {
  const dir = repo();
  write(dir, 'src/app.py', 'print(2)\n');
  assert.equal(stop(dir).block, true);
  assert.equal(stop(dir).block, false);
  write(dir, 'src/app.py', 'print(3)\n');
  expireCooldown(dir);
  assert.equal(stop(dir).block, false);
});

test('出現新路徑才再擋，且冷卻 5 分鐘內不擋；冷卻後補擋不漏', () => {
  const dir = repo();
  write(dir, 'src/app.py', 'print(2)\n');
  assert.equal(stop(dir).block, true);
  write(dir, 'src/new.py', 'x = 1\n');
  assert.equal(stop(dir).block, false, '冷卻中');
  expireCooldown(dir, 4 * 60 * 1000);
  assert.equal(stop(dir).block, false, '4 分鐘仍在冷卻中');
  expireCooldown(dir);
  const r = stop(dir);
  assert.equal(r.block, true);
  assert.match(r.reason, /src\/new\.py/);
});

test('冷卻期間 commit 的新檔案，冷卻後仍會被擋（head 不在冷卻中推進）', () => {
  const dir = repo();
  write(dir, 'src/app.py', 'print(2)\n');
  assert.equal(stop(dir).block, true);
  git(dir, 'commit', '-qam', 'app');
  write(dir, 'src/late.py', 'z = 1\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'late');
  assert.equal(stop(dir).block, false, '冷卻中');
  expireCooldown(dir);
  const r = stop(dir);
  assert.equal(r.block, true);
  assert.match(r.reason, /src\/late\.py/);
});

test('擋過的一批部分 commit 後（集合變小）不重擋', () => {
  const dir = repo();
  assert.equal(stop(dir).block, false);
  write(dir, 'src/app.py', 'print(2)\n');
  write(dir, 'src/b.py', 'b = 1\n');
  assert.equal(stop(dir).block, true);
  git(dir, 'commit', '-qm', 'app only', '--', 'src/app.py');
  expireCooldown(dir);
  assert.equal(stop(dir).block, false);
  assert.equal(stop(dir).block, false, 'head 推進後只剩 src/b.py，仍是擋過的');
});

test('工作區乾淨後清空紀錄：同一檔案下一批再改會再擋', () => {
  const dir = repo();
  assert.equal(stop(dir).block, false);
  write(dir, 'src/app.py', 'print(2)\n');
  assert.equal(stop(dir).block, true);
  git(dir, 'commit', '-qam', 'change');
  assert.equal(stop(dir).block, false);
  assert.equal(stop(dir).block, false); // 這次 changed 為空 → 清空 paths
  write(dir, 'src/app.py', 'print(3)\n');
  assert.equal(stop(dir).block, false, '冷卻照算');
  expireCooldown(dir);
  assert.equal(stop(dir).block, true);
});

test('blockedAt 在未來（時鐘倒退）不當成冷卻中', () => {
  const dir = repo();
  write(dir, 'src/app.py', 'print(2)\n');
  assert.equal(stop(dir).block, true);
  write(dir, 'src/new.py', 'x = 1\n');
  expireCooldown(dir, -60 * 60 * 1000);
  assert.equal(stop(dir).block, true);
});

test('v1.1 舊 state（只有 fingerprint）→ 視為沒擋過，擋一次', () => {
  const dir = repo();
  write(dir, 'src/app.py', 'print(2)\n');
  write(dir, '.claude/.docs-sync-state.json', JSON.stringify({ fingerprint: 'abc', blockedAt: '2020-01-01T00:00:00Z' }));
  assert.equal(stop(dir).block, true);
});

test('stop_hook_active → 放行（防無限迴圈）', () => {
  const dir = repo();
  write(dir, 'src/app.py', 'print(2)\n');
  assert.equal(stop(dir, { stop_hook_active: true }).block, false);
});

test('非 git 目錄 → 放行', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-sync-nogit-'));
  write(dir, 'app.py', 'x\n');
  assert.equal(stop(dir).block, false);
});

test('commit 之後才出現的程式變更也會被偵測', () => {
  const dir = repo();
  assert.equal(stop(dir).block, false); // 記下目前 HEAD
  write(dir, 'src/app.py', 'print(9)\n');
  git(dir, 'commit', '-qam', 'change');
  const r = stop(dir);
  assert.equal(r.block, true);
  assert.match(r.reason, /src\/app\.py/);
});

test('已擋過的變更 commit 後不會再擋', () => {
  const dir = repo();
  assert.equal(stop(dir).block, false);
  write(dir, 'src/app.py', 'print(5)\n');
  assert.equal(stop(dir).block, true);
  git(dir, 'commit', '-qam', 'change');
  assert.equal(stop(dir).block, false);
});

test('commit 了中文檔名的文件 → 放行（git 預設會把非 ASCII 路徑加引號跳脫）', () => {
  const dir = repo();
  assert.equal(stop(dir).block, false);
  write(dir, 'docs/中文說明.md', '內容\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'docs');
  assert.equal(stop(dir).block, false);
});

test('中文檔名的程式變更（已 commit）→ 擋下且 reason 顯示原檔名', () => {
  const dir = repo();
  assert.equal(stop(dir).block, false);
  write(dir, 'src/計算.py', 'x = 1\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'code');
  const r = stop(dir);
  assert.equal(r.block, true);
  assert.match(r.reason, /src\/計算\.py/);
});

test('pull 進來的別人的 commit 不算本輪變更', () => {
  const dir = repo();
  assert.equal(stop(dir).block, false);
  write(dir, 'src/theirs.py', 'y = 2\n');
  git(dir, 'add', '-A');
  execFileSync('git', ['-c', 'user.name=other', '-c', 'user.email=other@x', 'commit', '-qm', 'theirs'], { cwd: dir, stdio: 'ignore' });
  assert.equal(stop(dir, {}, { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'user.email', GIT_CONFIG_VALUE_0: 'me@x' }).block, false);
});

test('DOCS_SYNC_DISABLE=1 → 放行', () => {
  const dir = repo();
  write(dir, 'src/app.py', 'print(2)\n');
  assert.equal(stop(dir, {}, { DOCS_SYNC_DISABLE: '1' }).block, false);
});

test('hook 輸入壞掉 → exit 0 放行', () => {
  const res = spawnSync(process.execPath, [HOOK], { input: '{壞', encoding: 'utf8' });
  assert.equal(res.status, 0);
  assert.equal(res.stdout, '');
  assert.match(res.stderr, /無法解析/);
});
