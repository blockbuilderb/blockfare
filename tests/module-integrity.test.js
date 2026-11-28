import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function walkFiles(dir, ext) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath, ext));
    } else if (entry.isFile() && fullPath.endsWith(ext)) {
      results.push(fullPath);
    }
  }
  return results.sort();
}

function toRelPosix(absPath) {
  return path.relative(ROOT_DIR, absPath).replace(/\\/g, '/');
}

function stripJsCommentsPreserveLines(source) {
  return source.replace(
    /(['"`])(?:\\[\s\S]|(?!\1)[\s\S])*\1|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g,
    (match, quote) => {
      if (quote) return match;
      return match.replace(/[^\r\n]/g, ' ');
    }
  );
}

function lineNumberAt(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source.charCodeAt(i) === 10) line++;
  }
  return line;
}

function extractJsRelativeImports(source, relFile) {
  const cleaned = stripJsCommentsPreserveLines(source);
  const refs = [];
  const patterns = [
    // Static import (default / namespace / named / side-effect)
    /(?<!\.)\bimport\s+(?:[\w$*\s,{}]+\s+from\s+)?(['"])(\.\.?\/[^'"]+)\1/g,
    // Static re-export (`export * from` / `export * as ns from` / `export { ... } from`)
    /(?<!\.)\bexport\s+(?:\*(?:\s+as\s+[\w$]+)?|\{[\w$*\s,]+\})\s+from\s+(['"])(\.\.?\/[^'"]+)\1/g,
    // Dynamic `import('./...')`
    /(?<!\.)\bimport\s*\(\s*(['"])(\.\.?\/[^'"]+)\1\s*\)/g
  ];

  for (const pattern of patterns) {
    for (const match of cleaned.matchAll(pattern)) {
      refs.push({
        file: relFile,
        line: lineNumberAt(cleaned, match.index ?? 0),
        specifier: match[2],
        kind: 'js-esm'
      });
    }
  }

  return refs.sort((a, b) => a.line - b.line);
}

function extractHtmlRelativeRefs(htmlSource, relFile = 'index.html') {
  const cleaned = htmlSource.replace(/<!--[\s\S]*?-->/g, (comment) =>
    comment.replace(/[^\r\n]/g, ' ')
  );
  const refs = [];

  // <link rel="stylesheet" href="./...">
  for (const match of cleaned.matchAll(/<link\b[^>]*\bhref\s*=\s*(['"])(\.\.?\/[^'"]+)\1[^>]*>/gi)) {
    refs.push({
      file: relFile,
      line: lineNumberAt(cleaned, match.index ?? 0),
      specifier: match[2],
      kind: 'html-css'
    });
  }

  // <script type="module" src="./..."> (and any other relative script src)
  for (const match of cleaned.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = match[1] || '';
    const body = match[2] || '';
    const baseLine = lineNumberAt(cleaned, match.index ?? 0);

    const srcMatch = attrs.match(/\bsrc\s*=\s*(['"])(\.\.?\/[^'"]+)\1/i);
    const typeMatch = attrs.match(/\btype\s*=\s*(['"])([^'"]+)\1/i);
    const scriptType = typeMatch ? typeMatch[2].toLowerCase() : '';

    if (srcMatch) {
      refs.push({
        file: relFile,
        line: baseLine,
        specifier: srcMatch[2],
        kind: scriptType === 'module' ? 'html-module-src' : 'html-script-src'
      });
    } else if (scriptType === 'importmap') {
      const parsed = JSON.parse(body);
      const importsMap = (parsed && parsed.imports) || {};
      for (const target of Object.values(importsMap)) {
        if (typeof target === 'string' && (target.startsWith('./') || target.startsWith('../'))) {
          refs.push({
            file: relFile,
            line: baseLine,
            specifier: target,
            kind: 'html-importmap'
          });
        }
      }
    } else if (scriptType === 'module') {
      for (const inlineRef of extractJsRelativeImports(body, relFile)) {
        refs.push({
          ...inlineRef,
          line: baseLine + inlineRef.line - 1,
          kind: 'html-inline-module'
        });
      }
    }
  }

  return refs;
}

function extractCssRelativeRefs(cssSource, relFile) {
  const cleaned = cssSource.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
    comment.replace(/[^\r\n]/g, ' ')
  );
  const refs = [];
  const pattern = /@import\s+(?:url\(\s*(['"]?)(\.\.?\/[^'")\s]+)\1\s*\)|(['"])(\.\.?\/[^'"]+)\3)/gi;

  for (const match of cleaned.matchAll(pattern)) {
    const specifier = match[2] || match[4];
    refs.push({
      file: relFile,
      line: lineNumberAt(cleaned, match.index ?? 0),
      specifier,
      kind: 'css-import'
    });
  }
  return refs;
}

function splitSpecifier(specifier) {
  const hashIdx = specifier.indexOf('#');
  const withoutHash = hashIdx >= 0 ? specifier.slice(0, hashIdx) : specifier;
  const queryIdx = withoutHash.indexOf('?');
  if (queryIdx < 0) {
    return { cleanPath: withoutHash, query: null };
  }
  return {
    cleanPath: withoutHash.slice(0, queryIdx),
    query: withoutHash.slice(queryIdx + 1)
  };
}

function hasExactCasePath(rootDir, targetAbsPath) {
  const rel = path.relative(rootDir, targetAbsPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
  const parts = rel.split(path.sep).filter(Boolean);
  let current = rootDir;
  for (const part of parts) {
    if (!fs.existsSync(current)) return false;
    const entries = fs.readdirSync(current);
    if (!entries.includes(part)) return false;
    current = path.join(current, part);
  }
  return fs.statSync(current).isFile();
}

const INDEX_HTML = path.join(ROOT_DIR, 'index.html');
const STYLE_CSS = path.join(ROOT_DIR, 'style.css');
const CSS_FILES = walkFiles(path.join(ROOT_DIR, 'css'), '.css');
const SRC_JS_FILES = walkFiles(path.join(ROOT_DIR, 'src'), '.js');
const ALL_SCANNED_FILES = [INDEX_HTML, STYLE_CSS, ...CSS_FILES, ...SRC_JS_FILES];

// ============================================================================
// 1. Uniform `?v=N` Cache-Busting Query String Across HTML, CSS & JS Imports
// ============================================================================
test('Module Integrity #1: uniform ?v=N cache-busting query string across index.html, style.css, css/*.css, and src/**/*.js', () => {
  assert.ok(fs.existsSync(INDEX_HTML), 'index.html must exist');
  assert.ok(fs.existsSync(STYLE_CSS), 'style.css must exist');
  assert.ok(CSS_FILES.length > 0, 'css/*.css must contain stylesheets');
  assert.ok(SRC_JS_FILES.length > 0, 'src/**/*.js must contain ES modules');

  const allRefs = [
    ...extractHtmlRelativeRefs(fs.readFileSync(INDEX_HTML, 'utf8'), 'index.html'),
    ...extractCssRelativeRefs(fs.readFileSync(STYLE_CSS, 'utf8'), 'style.css'),
    ...CSS_FILES.flatMap((f) => extractCssRelativeRefs(fs.readFileSync(f, 'utf8'), toRelPosix(f))),
    ...SRC_JS_FILES.flatMap((f) =>
      extractJsRelativeImports(fs.readFileSync(f, 'utf8'), toRelPosix(f))
    )
  ];

  const versionedRefs = [];
  const malformedQueryRefs = [];
  const unversionedProjectRefs = [];
  const vendorQueryValues = new Set();

  for (const ref of allRefs) {
    const { cleanPath, query } = splitSpecifier(ref.specifier);
    if (!cleanPath.endsWith('.js') && !cleanPath.endsWith('.css')) continue;

    const absTarget = path.resolve(path.dirname(path.join(ROOT_DIR, ref.file)), cleanPath);
    const relTarget = toRelPosix(absTarget);
    const isVendor = relTarget.startsWith('vendor/');

    if (isVendor) {
      vendorQueryValues.add(query ?? '<none>');
      continue;
    }

    if (query === null) {
      unversionedProjectRefs.push(`${ref.file}:${ref.line} -> ${ref.specifier}`);
      continue;
    }

    const versionMatch = query.match(/^v=(\d+)$/);
    if (!versionMatch) {
      malformedQueryRefs.push(`${ref.file}:${ref.line} -> ${ref.specifier}`);
      continue;
    }

    versionedRefs.push({ ...ref, version: versionMatch[1] });
  }

  assert.deepEqual(
    malformedQueryRefs,
    [],
    `Malformed ?v=N query string(s) detected:\n${malformedQueryRefs.join('\n')}`
  );

  assert.deepEqual(
    unversionedProjectRefs,
    [],
    `Unversioned internal .js/.css import(s) would split ES module singletons:\n${unversionedProjectRefs.join('\n')}`
  );

  assert.ok(
    versionedRefs.length > 0,
    'Expected versioned .js?v=N and .css?v=N specifiers across HTML, CSS, and src/'
  );

  const byVersion = new Map();
  for (const ref of versionedRefs) {
    const list = byVersion.get(ref.version) || [];
    list.push(`${ref.file}:${ref.line} (${ref.specifier})`);
    byVersion.set(ref.version, list);
  }

  assert.equal(
    byVersion.size,
    1,
    `Mismatched ?v=N cache-busting versions found (splits ES module singletons like events.js / sound / VectorPool): ${JSON.stringify(
      Object.fromEntries([...byVersion.entries()].map(([v, list]) => [`v=${v}`, list.slice(0, 10)]))
    )}`
  );

  assert.ok(
    vendorQueryValues.size <= 1,
    `Vendor module imports must also use a uniform query string to avoid splitting THREE singletons, found: ${[...vendorQueryValues].join(', ')}`
  );
});

// ============================================================================
// 2. Every Relative ES Module Import Resolves to an Existing File on Disk
// ============================================================================
test('Module Integrity #2: every relative ES module import across src/**/*.js and index.html resolves to an existing file on disk', () => {
  const htmlRefs = extractHtmlRelativeRefs(
    fs.readFileSync(INDEX_HTML, 'utf8'),
    'index.html'
  ).filter((ref) =>
    ['html-module-src', 'html-inline-module', 'html-importmap', 'html-css'].includes(ref.kind)
  );

  const cssRefs = [
    ...extractCssRelativeRefs(fs.readFileSync(STYLE_CSS, 'utf8'), 'style.css'),
    ...CSS_FILES.flatMap((f) => extractCssRelativeRefs(fs.readFileSync(f, 'utf8'), toRelPosix(f)))
  ];

  const jsRefs = SRC_JS_FILES.flatMap((f) =>
    extractJsRelativeImports(fs.readFileSync(f, 'utf8'), toRelPosix(f))
  );

  const moduleAndAssetRefs = [...htmlRefs, ...cssRefs, ...jsRefs];
  assert.ok(moduleAndAssetRefs.length > 0, 'Expected relative ES module imports to validate');

  const missingOnDisk = [];
  for (const ref of moduleAndAssetRefs) {
    const { cleanPath } = splitSpecifier(ref.specifier);
    const importerDir = path.dirname(path.join(ROOT_DIR, ref.file));
    const resolvedAbs = path.resolve(importerDir, cleanPath);

    if (!fs.existsSync(resolvedAbs) || !fs.statSync(resolvedAbs).isFile()) {
      missingOnDisk.push(
        `${ref.file}:${ref.line} -> '${ref.specifier}' (missing: ${toRelPosix(resolvedAbs)})`
      );
    } else if (!hasExactCasePath(ROOT_DIR, resolvedAbs)) {
      missingOnDisk.push(
        `${ref.file}:${ref.line} -> '${ref.specifier}' (case mismatch on disk for ${toRelPosix(resolvedAbs)})`
      );
    }
  }

  assert.deepEqual(
    missingOnDisk,
    [],
    `Unresolved or case-mismatched relative imports found:\n${missingOnDisk.join('\n')}`
  );
});

// ============================================================================
// 3. Zero UTF-8 Replacement Mojibake (\uFFFD) Across HTML, CSS & JS
// ============================================================================
test('Module Integrity #3: zero UTF-8 replacement mojibake (\\uFFFD) across index.html, style.css, css/*.css, and src/**/*.js', () => {
  const mojibakeLocations = [];

  for (const absFile of ALL_SCANNED_FILES) {
    const content = fs.readFileSync(absFile, 'utf8');
    let searchFrom = 0;
    while (true) {
      const idx = content.indexOf('\uFFFD', searchFrom);
      if (idx === -1) break;
      const line = lineNumberAt(content, idx);
      mojibakeLocations.push(`${toRelPosix(absFile)}:${line}`);
      searchFrom = idx + 1;
    }
  }

  assert.deepEqual(
    mojibakeLocations,
    [],
    `UTF-8 replacement character (\\uFFFD) mojibake detected at:\n${mojibakeLocations.join('\n')}`
  );
});

// ============================================================================
// 4. Headless Node ESM Importability Check (0 document/window ReferenceErrors)
// ============================================================================
test('Module Integrity #4: key subsystems dynamically import cleanly in headless Node ESM with zero document/window ReferenceErrors', async () => {
  assert.equal(typeof globalThis.window, 'undefined', 'Headless test must run without global window');
  assert.equal(
    typeof globalThis.document,
    'undefined',
    'Headless test must run without global document'
  );

  const subsystems = [
    { relPath: 'src/config.js', expectedExports: ['PLAYER', 'COMBAT', 'BOT', 'VEHICLE_STATS'] },
    { relPath: 'src/events.js', expectedExports: ['EventBus', 'events', 'makeEventBridge'] },
    { relPath: 'src/assets/textures.js', expectedExports: ['TEXTURES'] },
    { relPath: 'src/player/VehicleControl.js', expectedExports: ['VehicleControlMethods'] },
    { relPath: 'src/bots/BotManager.js', expectedExports: ['BotManager', 'SQUAD_DEFS'] },
    { relPath: 'src/vehicles.js', expectedExports: ['VehicleManager'] }
  ];

  for (const { relPath, expectedExports } of subsystems) {
    const moduleUrl = pathToFileURL(path.join(ROOT_DIR, relPath)).href;
    let mod;
    try {
      mod = await import(moduleUrl);
    } catch (err) {
      assert.fail(
        `Headless Node ESM import of '${relPath}' failed (${err?.name || 'Error'}): ${err?.stack || err}`
      );
    }

    assert.ok(mod && typeof mod === 'object', `Expected namespace object from '${relPath}'`);
    for (const exportName of expectedExports) {
      assert.ok(
        exportName in mod && mod[exportName] !== undefined,
        `Expected '${relPath}' to export '${exportName}'`
      );
    }
  }

  assert.equal(typeof globalThis.window, 'undefined', 'Subsystems must not leak global window');
  assert.equal(typeof globalThis.document, 'undefined', 'Subsystems must not leak global document');
});

// ============================================================================
// 5. ES Module Singleton Identity Across ?v=N Graph (events / sound / VectorPool / THREE)
// ============================================================================
test('Module Integrity #5: shared ?v=N module specifiers preserve runtime singleton identity (events, sound, VectorPool, THREE)', async () => {
  const htmlRefs = extractHtmlRelativeRefs(fs.readFileSync(INDEX_HTML, 'utf8'), 'index.html');
  const mainEntry = htmlRefs.find((r) => r.kind === 'html-module-src');
  assert.ok(mainEntry, 'Expected module entry script in index.html');

  const { query } = splitSpecifier(mainEntry.specifier);
  const vMatch = query && query.match(/^v=(\d+)$/);
  assert.ok(vMatch, `Expected ?v=N on index.html module entry, got '${mainEntry.specifier}'`);
  const activeVersion = vMatch[1];

  const versionedUrl = (relPath) =>
    `${pathToFileURL(path.join(ROOT_DIR, relPath)).href}?v=${activeVersion}`;

  const [eventsMod, audioBarrel, audioIndex, vectorPoolMod, botsBarrel, botMgrMod, vehiclesMod, threeMod] =
    await Promise.all([
      import(versionedUrl('src/events.js')),
      import(versionedUrl('src/audio.js')),
      import(versionedUrl('src/audio/index.js')),
      import(versionedUrl('src/utils/VectorPool.js')),
      import(versionedUrl('src/bots.js')),
      import(versionedUrl('src/bots/BotManager.js')),
      import(versionedUrl('src/vehicles.js')),
      import(pathToFileURL(path.join(ROOT_DIR, 'vendor/three.module.js')).href)
    ]);

  // Barrel & direct subsystem module identity
  assert.equal(
    audioBarrel.sound,
    audioIndex.sound,
    'sound singleton must be identical across src/audio.js and src/audio/index.js'
  );
  assert.equal(
    botsBarrel.BotManager,
    botMgrMod.BotManager,
    'BotManager class must be identical across barrel src/bots.js and src/bots/BotManager.js'
  );

  // VectorPool shares exact THREE.Vector3 prototype from vendor/three.module.js
  const pooledVec = vectorPoolMod.tmpVec3(3, 4, 5);
  assert.ok(
    pooledVec instanceof threeMod.Vector3,
    'VectorPool tmpVec3() must return an instance of the shared vendor THREE.Vector3 class'
  );

  // BotManager's internal '../events.js?v=N' import must emit onto the exact same events singleton
  const bm = new botMgrMod.BotManager(new threeMod.Scene(), {});
  let receivedPayload = null;
  const unsub = eventsMod.events.on('bot:comms', (payload) => {
    receivedPayload = payload;
  });
  try {
    bm.onBotComms({ name: 'EagleOne' }, 'Contact front!', 'SQUAD', 12, 'COMBAT');
  } finally {
    unsub();
  }
  assert.ok(
    receivedPayload && receivedPayload.bot && receivedPayload.bot.name === 'EagleOne',
    'BotManager event bridge must publish to the shared events.js singleton'
  );
});

// ============================================================================
// 6. Static Extractor Self-Test (Comment Stripping & Multiline Specifiers)
// ============================================================================
test('Module Integrity #6: import/ref extractors ignore comments and capture multiline & barrel specifiers', () => {
  const sampleJs = [
    "// Phase 1 Refactor: import { PLAYER } from './unversioned-comment.js'",
    "/* import './block-comment.js'; export * from './block-reexport.js'; */",
    'export const NOTE = "not an import from \'./string-literal.js\'";',
    "import * as THREE from '../../vendor/three.module.js';",
    'import {',
    '  AIRCRAFT_FLIGHT_EVENTS,',
    '  syncAircraftFlightFSM',
    "} from '../core/StateMachines.js?v=146';",
    "export * from './bots/BotAI.js?v=146';",
    "export { BotManager } from './bots/BotManager.js?v=146';",
    "import './side-effect.js?v=146';",
    "const lazy = () => import('./lazy-chunk.js?v=146');"
  ].join('\n');

  const jsExtracted = extractJsRelativeImports(sampleJs, 'src/sample.js').map((r) => r.specifier);
  assert.deepEqual(jsExtracted, [
    '../../vendor/three.module.js',
    '../core/StateMachines.js?v=146',
    './bots/BotAI.js?v=146',
    './bots/BotManager.js?v=146',
    './side-effect.js?v=146',
    './lazy-chunk.js?v=146'
  ]);

  const sampleHtml = [
    '<!-- <script type="module" src="./commented-out.js"></script> -->',
    '<link rel="stylesheet" href="./style.css?v=146" />',
    '<script type="importmap">{"imports":{"three":"./vendor/three.module.js"}}</script>',
    '<script type="module" src="./src/main.js?v=146"></script>'
  ].join('\n');
  const htmlExtracted = extractHtmlRelativeRefs(sampleHtml, 'index.html').map((r) => r.specifier);
  assert.deepEqual(htmlExtracted, [
    './style.css?v=146',
    './vendor/three.module.js',
    './src/main.js?v=146'
  ]);

  const sampleCss = [
    "/* @import './css/old.css?v=146'; */",
    "@import './css/base.css?v=146';",
    '@import url("./css/hud.css?v=146");'
  ].join('\n');
  const cssExtracted = extractCssRelativeRefs(sampleCss, 'style.css').map((r) => r.specifier);
  assert.deepEqual(cssExtracted, ['./css/base.css?v=146', './css/hud.css?v=146']);
});
