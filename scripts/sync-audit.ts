#!/usr/bin/env npx tsx
/**
 * Sync Audit — Scans infinity-frontend for patterns that need desktop attention.
 *
 * Usage:  npx tsx scripts/sync-audit.ts
 *    or:  npm run sync-audit
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Config ──

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FRONTEND_SRC = join(__dirname, '../../infinity-frontend/src');

interface Finding {
  file: string;
  line: number;
  pattern: string;
  code: string;
  status: 'OK' | 'WARN' | 'INFO';
  suggestion: string;
}

const findings: Finding[] = [];

// ── Known safe locations (already handled) ──

const SAFE_LOCATIONS: Record<string, string[]> = {
  'window.location': [
    'main.tsx', // chunk error reload — acceptable
  ],
  'window.open': [
    'shared/utils/electron.utils.ts', // openExternal() — already wrapped
  ],
  downloadManual: [
    'shared/utils/electron.utils.ts', // downloadFile() — the utility itself
  ],
};

function isSafe(pattern: string, filePath: string): boolean {
  const safeFiles = SAFE_LOCATIONS[pattern] || [];
  return safeFiles.some((safe) => filePath.includes(safe.replace(/\//g, '\\')));
}

// ── File scanner ──

function walkDir(dir: string, ext: string[] = ['.ts', '.tsx']): string[] {
  const results: string[] = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const full = join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) {
          if (entry === 'node_modules' || entry === '.git' || entry === 'dist') continue;
          results.push(...walkDir(full, ext));
        } else if (ext.some((e) => entry.endsWith(e))) {
          results.push(full);
        }
      } catch {
        // skip inaccessible
      }
    }
  } catch {
    // skip inaccessible
  }
  return results;
}

function scanFile(filePath: string, content: string, lines: string[]) {
  const rel = relative(FRONTEND_SRC, filePath);

  // 1. window.location.href = (redirects)
  // If file imports isElectron, the href is in the browser-only fallback branch — safe.
  const hasElectronGuard = content.includes('isElectron');
  lines.forEach((line, i) => {
    if (/window\.location\.href\s*=/.test(line) && !line.trim().startsWith('//')) {
      const safe = isSafe('window.location', filePath) || hasElectronGuard;
      findings.push({
        file: rel,
        line: i + 1,
        pattern: 'window.location.href =',
        code: line.trim(),
        status: safe ? 'OK' : 'WARN',
        suggestion: safe
          ? 'Guarded by isElectron() / known safe'
          : 'Use navigateTo() from electron.utils.ts',
      });
    }
  });

  // 2. window.location.reload()
  lines.forEach((line, i) => {
    if (/window\.location\.reload\(\)/.test(line) && !line.trim().startsWith('//')) {
      findings.push({
        file: rel,
        line: i + 1,
        pattern: 'window.location.reload()',
        code: line.trim(),
        status: 'INFO',
        suggestion: 'Hard reload — usually OK, verify if needed',
      });
    }
  });

  // 3. window.open() not from electron.utils
  lines.forEach((line, i) => {
    if (/window\.open\(/.test(line) && !line.trim().startsWith('//')) {
      const safe = isSafe('window.open', filePath);
      // Check if it's a tel: link (acceptable)
      const isTelLink = /window\.open\(\s*`tel:/.test(line) || /window\.open\(\s*['"]tel:/.test(line);
      findings.push({
        file: rel,
        line: i + 1,
        pattern: 'window.open()',
        code: line.trim(),
        status: safe || isTelLink ? 'OK' : 'INFO',
        suggestion: safe
          ? 'Already in electron.utils — OK'
          : isTelLink
            ? 'tel: link — handled by setWindowOpenHandler'
            : 'Verify Electron handles this via setWindowOpenHandler',
      });
    }
  });

  // 4. Manual blob downloads (not using downloadFile)
  lines.forEach((line, i) => {
    if (
      /document\.createElement\(['"]a['"]\)/.test(line) &&
      !isSafe('downloadManual', filePath)
    ) {
      // Check if downloadFile is imported in this file
      const usesDownloadFile = content.includes('downloadFile');
      if (!usesDownloadFile) {
        findings.push({
          file: rel,
          line: i + 1,
          pattern: 'Manual download (createElement a)',
          code: line.trim(),
          status: 'WARN',
          suggestion: 'Use downloadFile() from electron.utils.ts for Electron save dialog',
        });
      }
    }
  });

  // 5. URL.createObjectURL with download intent
  lines.forEach((line, i) => {
    if (/URL\.createObjectURL/.test(line) && !line.trim().startsWith('//')) {
      const usesDownloadFile = content.includes('downloadFile');
      if (!usesDownloadFile && !isSafe('downloadManual', filePath)) {
        findings.push({
          file: rel,
          line: i + 1,
          pattern: 'URL.createObjectURL (possible download)',
          code: line.trim(),
          status: 'INFO',
          suggestion: 'Check if this is a download — if so, use downloadFile()',
        });
      }
    }
  });

  // 6. OAuth redirect patterns
  if (filePath.includes('auth.ts') || filePath.includes('oauth')) {
    lines.forEach((line, i) => {
      if (/window\.location\.href\s*=.*[Aa]uth/.test(line) && !line.trim().startsWith('//')) {
        const hasElectronCheck = content.includes('isElectron');
        findings.push({
          file: rel,
          line: i + 1,
          pattern: 'OAuth redirect',
          code: line.trim(),
          status: hasElectronCheck ? 'OK' : 'WARN',
          suggestion: hasElectronCheck
            ? 'Electron check present — OK'
            : 'Add isElectron() check → use popup mode instead of redirect',
        });
      }
    });
  }

  // 7. navigator.mediaDevices (WebRTC)
  lines.forEach((line, i) => {
    if (/navigator\.mediaDevices/.test(line) && !line.trim().startsWith('//')) {
      findings.push({
        file: rel,
        line: i + 1,
        pattern: 'navigator.mediaDevices',
        code: line.trim(),
        status: 'INFO',
        suggestion: 'WebRTC — ensure Electron grants media permissions',
      });
    }
  });
}

// ── Main ──

console.log('\n🔍 Infinity Desktop ↔ Frontend Sync Audit\n');
console.log(`Scanning: ${FRONTEND_SRC}\n`);

const files = walkDir(FRONTEND_SRC);
console.log(`Found ${files.length} source files\n`);

for (const file of files) {
  try {
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    scanFile(file, content, lines);
  } catch {
    // skip unreadable
  }
}

// ── Report ──

const warns = findings.filter((f) => f.status === 'WARN');
const infos = findings.filter((f) => f.status === 'INFO');
const oks = findings.filter((f) => f.status === 'OK');

if (warns.length > 0) {
  console.log('⚠️  WARNINGS (need attention):\n');
  for (const f of warns) {
    console.log(`  ${f.file}:${f.line}`);
    console.log(`    Pattern: ${f.pattern}`);
    console.log(`    Code:    ${f.code}`);
    console.log(`    Fix:     ${f.suggestion}\n`);
  }
}

if (infos.length > 0) {
  console.log('ℹ️  INFO (review recommended):\n');
  for (const f of infos) {
    console.log(`  ${f.file}:${f.line}`);
    console.log(`    Pattern: ${f.pattern}`);
    console.log(`    Code:    ${f.code}`);
    console.log(`    Note:    ${f.suggestion}\n`);
  }
}

if (oks.length > 0) {
  console.log(`✅ OK: ${oks.length} pattern(s) already handled correctly\n`);
}

// Summary
console.log('─'.repeat(50));
console.log(`  WARN: ${warns.length}  |  INFO: ${infos.length}  |  OK: ${oks.length}`);
console.log('─'.repeat(50));

if (warns.length > 0) {
  console.log('\n❌ Action needed — fix the warnings above before shipping desktop.\n');
  process.exit(1);
} else {
  console.log('\n✅ All clear — desktop is in sync with frontend.\n');
  process.exit(0);
}
