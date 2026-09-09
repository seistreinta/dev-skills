#!/usr/bin/env node
/**
 * Local Claude Code usage report.
 *
 * Reads your own ~/.claude/projects transcripts plus your local git history and
 * reports what share of your commits were AI-assisted.
 *
 * Runs entirely offline. Nothing is uploaded. Prompt and response text is never
 * read - only tool names, file paths, timestamps and token counts.
 *
 * Requires Node 18+. No dependencies.
 *
 *   node ai-usage-report.js --scan ~/proyects
 *   node ai-usage-report.js --scan ~/proyects --out ./reports
 *
 * Pass --scan <dir> pointing at where you keep your repos. Without it the
 * denominator only covers repos Claude actually ran in, which overstates your
 * percentage by ignoring repos you worked in without AI.
 *
 * Writes report.csv and report.json into a timestamped folder under the OS
 * temp directory, and prints that path. Pass --out <dir> to write elsewhere.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { execFileSync } = require('child_process');

const WINDOW_DAYS = 30; // how far back from a commit we look for a session
const DAY_MS = 86400000;
const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);
const TRIVIAL = /^[\s{}()[\];,.:]*$/;
const US = '\u001f'; // git pretty-format field separator

/** Mirror Anthropic's "effective line" rule: >3 chars, not bracket-only. */
function effective(line) {
  const s = line.trim();
  return s.length > 3 && !TRIVIAL.test(s);
}

const norm = (p) => String(p).split('\\').join('/').toLowerCase();

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) out[a.slice(2)] = argv[i + 1]?.startsWith('--') ? true : argv[++i];
  }
  return out;
}

/** Recursively collect *.jsonl, including nested subagents/ transcripts. */
function walk(dir, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (e.isFile() && e.name.endsWith('.jsonl')) acc.push(full);
  }
  return acc;
}

/**
 * Find git repos under a directory (depth-limited, skips heavy folders).
 * Used so the denominator includes repos you committed to without using AI.
 */
function findRepos(dir, depth = 3, acc = new Set()) {
  if (depth < 0) return acc;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  if (entries.some((e) => e.name === '.git')) {
    acc.add(dir);
    return acc; // don't descend into a repo's own subdirectories
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    findRepos(path.join(dir, e.name), depth - 1, acc);
  }
  return acc;
}

function git(repo, args) {
  try {
    return execFileSync('git', ['-C', repo, ...args], {
      encoding: 'utf8',
      maxBuffer: 512 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 180000,
    });
  } catch {
    return '';
  }
}

/**
 * Scan transcripts.
 *
 * `touches` maps a file's basename -> [{ full, ts }]. Keying on basename then
 * matching by path suffix lets a commit in the main repo match a session that
 * ran inside a git worktree, where absolute paths differ but repo-relative
 * paths agree.
 */
async function scanTranscripts(root, sinceMs) {
  const sessions = new Map();
  const touches = new Map();
  const files = walk(root);

  for (let i = 0; i < files.length; i++) {
    if ((i + 1) % 50 === 0 || i === files.length - 1) {
      process.stderr.write(`  scanned ${i + 1}/${files.length} transcripts\n`);
    }
    const rl = readline.createInterface({
      input: fs.createReadStream(files[i], { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line || line.charCodeAt(0) !== 123 /* { */) continue;
      let d;
      try {
        d = JSON.parse(line);
      } catch {
        continue;
      }
      if (d.type !== 'assistant') continue;

      const ts = Date.parse(d.timestamp);
      if (!Number.isFinite(ts) || ts < sinceMs) continue;

      const sid = d.sessionId || path.basename(files[i], '.jsonl');
      let s = sessions.get(sid);
      if (!s) {
        s = { cwd: d.cwd || '', first: ts, last: ts, edits: 0, lines: 0, outTok: 0 };
        sessions.set(sid, s);
      }
      if (ts < s.first) s.first = ts;
      if (ts > s.last) s.last = ts;
      if (!s.cwd && d.cwd) s.cwd = d.cwd;

      const msg = d.message || {};
      s.outTok += msg.usage?.output_tokens || 0;

      for (const b of msg.content || []) {
        if (!b || b.type !== 'tool_use' || !EDIT_TOOLS.has(b.name)) continue;
        const inp = b.input || {};
        const fp = inp.file_path || inp.notebook_path;
        if (!fp) continue;
        const body = inp.new_string || inp.content || inp.new_source || '';
        s.edits++;
        for (const ln of String(body).split('\n')) if (effective(ln)) s.lines++;

        const full = norm(fp);
        const base = full.slice(full.lastIndexOf('/') + 1);
        let list = touches.get(base);
        if (!list) touches.set(base, (list = []));
        list.push({ full, ts });
      }
    }
  }
  return { sessions, touches };
}

/** Classify this author's commits in one repo as AI-assisted or not. */
function analyseRepo(root, author, sinceMs, touches) {
  const since = new Date(sinceMs).toISOString().slice(0, 10);
  const log = git(root, [
    'log',
    `--since=${since}`,
    `--author=${author}`,
    '--no-merges',
    `--pretty=format:%H${US}%aI${US}%s`,
    '--name-only',
  ]);
  if (!log.trim()) return null;

  const stats = { commits: 0, aiCommits: 0, files: 0, aiFiles: 0 };
  for (const block of log.split('\n\n')) {
    const lines = block.trim().split('\n').filter(Boolean);
    if (!lines.length || !lines[0].includes(US)) continue;
    const cts = Date.parse(lines[0].split(US)[1]);
    const changed = lines.slice(1);
    if (!Number.isFinite(cts) || !changed.length) continue;

    stats.commits++;
    stats.files += changed.length;
    let hit = false;

    for (const rel of changed) {
      const suffix = '/' + norm(rel);
      const base = suffix.slice(suffix.lastIndexOf('/') + 1);
      for (const t of touches.get(base) || []) {
        if (!t.full.endsWith(suffix)) continue; // same filename, different path
        const delta = cts - t.ts;
        if (delta >= 0 && delta <= WINDOW_DAYS * DAY_MS) {
          stats.aiFiles++;
          hit = true;
          break;
        }
      }
    }
    if (hit) stats.aiCommits++;
  }
  return stats;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projects = args.projects || path.join(os.homedir(), '.claude', 'projects');

  const author =
    args.author ||
    (() => {
      try {
        return execFileSync('git', ['config', '--global', 'user.email'], {
          encoding: 'utf8',
        }).trim();
      } catch {
        return '';
      }
    })();
  if (!author) {
    console.error('No git author email found. Pass --author you@company.com');
    process.exit(1);
  }

  let sinceMs = args.since
    ? Date.parse(args.since + 'T00:00:00Z')
    : Date.now() - 90 * DAY_MS;
  if (!Number.isFinite(sinceMs)) {
    console.error('Bad --since. Use YYYY-MM-DD');
    process.exit(1);
  }

  // Claude Code deletes transcripts older than cleanupPeriodDays (default 30).
  // Counting commits from before the oldest surviving transcript inflates the
  // denominator and silently understates the ratio, so clamp to real coverage.
  const all = walk(projects);
  if (!all.length) {
    console.error(`No transcripts found under ${projects}`);
    process.exit(1);
  }
  let oldest = Infinity;
  for (const f of all) {
    try {
      const m = fs.statSync(f).mtimeMs;
      if (m < oldest) oldest = m;
    } catch {}
  }
  if (oldest > sinceMs) {
    process.stderr.write(
      `NOTE: oldest transcript is ${new Date(oldest).toISOString().slice(0, 10)}; ` +
        `clamping window to that date.\n` +
        `      Raise cleanupPeriodDays in ~/.claude/settings.json to keep more.\n\n`
    );
    sinceMs = oldest;
  }

  process.stderr.write(`Author : ${author}\n`);
  process.stderr.write(`Since  : ${new Date(sinceMs).toISOString().slice(0, 10)}\n\n`);

  const { sessions, touches } = await scanTranscripts(projects, sinceMs);

  const roots = new Set();
  const seenCwd = new Set();
  for (const s of sessions.values()) {
    if (!s.cwd || seenCwd.has(s.cwd)) continue;
    seenCwd.add(s.cwd);
    const r = git(s.cwd, ['rev-parse', '--show-toplevel']).trim();
    if (r) roots.add(r);
  }

  // Repos you committed to without ever running Claude belong in the
  // denominator too, otherwise the percentage only reflects AI-touched repos.
  if (args.scan) {
    const base = args.scan.startsWith('~')
      ? path.join(os.homedir(), args.scan.slice(1))
      : args.scan;
    for (const d of findRepos(path.resolve(base))) {
      const r = git(d, ['rev-parse', '--show-toplevel']).trim();
      if (r) roots.add(r);
    }
  }

  const perRepo = [];
  for (const root of roots) {
    const st = analyseRepo(root, author, sinceMs, touches);
    if (st && st.commits) perRepo.push({ repo: path.basename(root), root, ...st });
  }

  const days = new Set(
    [...sessions.values()].map((s) => new Date(s.first).toISOString().slice(0, 10))
  );
  const sum = (k) => perRepo.reduce((a, r) => a + r[k], 0);
  const totC = sum('commits');
  const totA = sum('aiCommits');
  const totF = sum('files');
  const totAF = sum('aiFiles');
  const pct = totC ? (100 * totA) / totC : 0;
  const fpct = totF ? (100 * totAF) / totF : 0;

  const edits = [...sessions.values()].reduce((a, s) => a + s.edits, 0);
  const linesW = [...sessions.values()].reduce((a, s) => a + s.lines, 0);
  const outTok = [...sessions.values()].reduce((a, s) => a + s.outTok, 0);

  const pad = (n) => String(n).padStart(10);
  const bar = '='.repeat(60);
  console.log(bar);
  console.log(`  CLAUDE CODE USAGE   ${new Date(sinceMs).toISOString().slice(0, 10)} -> today`);
  console.log(bar);
  console.log(`  Sessions             ${pad(sessions.size)}`);
  console.log(`  Active days          ${pad(days.size)}`);
  console.log(`  AI file edits        ${pad(edits)}`);
  console.log(`  AI effective lines   ${pad(linesW)}`);
  console.log(`  Output tokens        ${pad(outTok)}`);
  console.log('-'.repeat(60));
  console.log(`  Your commits         ${pad(totC)}`);
  console.log(`  AI-assisted commits  ${pad(totA)}`);
  console.log(`  COMMITS WITH AI      ${pct.toFixed(1).padStart(9)}%`);
  console.log(`  FILES WITH AI        ${fpct.toFixed(1).padStart(9)}%`);
  console.log(bar);

  if (perRepo.length) {
    console.log('\n  Per repository:');
    for (const r of perRepo.sort((a, b) => b.commits - a.commits)) {
      const p = ((100 * r.aiCommits) / r.commits).toFixed(1);
      console.log(
        `   ${r.repo.padEnd(32)} ${String(r.aiCommits).padStart(4)}/${String(r.commits).padEnd(5)} ${p.padStart(5)}%`
      );
    }
  }

  const since = new Date(sinceMs).toISOString().slice(0, 10);

  // Default to a timestamped folder under the OS temp directory so reports do
  // not accumulate in a working tree. The path is printed so the caller can
  // open the files before the OS reclaims them.
  const slug = author.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const stamp = new Date().toISOString().slice(0, 19).split(':').join('');
  const outDir = path.resolve(
    args.out || path.join(os.tmpdir(), 'ai-usage-report', `${slug}-${stamp}`)
  );
  fs.mkdirSync(outDir, { recursive: true });

  const rows = [
    ['author', 'repo', 'commits', 'ai_commits', 'pct', 'files', 'ai_files', 'sessions', 'active_days', 'since'],
    ...perRepo.map((r) => [
      author, r.repo, r.commits, r.aiCommits,
      ((100 * r.aiCommits) / r.commits).toFixed(1),
      r.files, r.aiFiles, sessions.size, days.size, since,
    ]),
  ];
  const csvPath = path.join(outDir, 'report.csv');
  fs.writeFileSync(
    csvPath,
    rows
      .map((r) => r.map((c) => (/[",]/.test(String(c)) ? `"${String(c).split('"').join('""')}"` : c)).join(','))
      .join('\n') + '\n'
  );

  const jsonPath = path.join(outDir, 'report.json');
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        author, since, generated: new Date().toISOString(),
        sessions: sessions.size, activeDays: days.size,
        aiEdits: edits, aiLines: linesW, outputTokens: outTok,
        commits: totC, aiCommits: totA, commitPct: +pct.toFixed(1),
        files: totF, aiFiles: totAF, filePct: +fpct.toFixed(1),
        repos: perRepo.map(({ root, ...r }) => r),
      },
      null,
      2
    ) + '\n'
  );

  console.log(`\n  Reports written to:\n    ${outDir}`);
  console.log(`      report.csv`);
  console.log(`      report.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
