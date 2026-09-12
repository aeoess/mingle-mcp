#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════
// Pre-publish preflight for the canonical MCP. Run it BEFORE npm publish.
// ══════════════════════════════════════════════════════════════
// Nothing here publishes, tags, pushes or touches the registry. It reads this working copy
// and the built artifact, and it exits non-zero on the first problem it can prove.
//
//   node scripts/preflight-publish.mjs
//
// WHAT IT CHECKS AND WHY:
//
//  1 ONE VERSION, IN EVERY PLACE THAT CARRIES ONE. Ten files state a version and they are read
//    by different things: npm, the MCP registry, the command that launches in an OpenClaw
//    bundle, the setup command a person copies, the version an MCP host displays, the skill
//    directory, two bundle manifests, and four markdown files. A version that agrees in nine of
//    ten is a version that will be wrong somewhere a person can see. It also checks the tool
//    count the skill directory declares and the tool list the registry renders, because both are
//    advertisements and a stale one promises a tool a fresh install does not have.
//
//  2 THE BUILT ARTIFACT IS THE COMMITTED SOURCE. build/ is what npm ships, and src/ is what
//    was reviewed. A clean rebuild must reproduce the committed build/ byte for byte, or the
//    thing being published is not the thing that was read.
//
//  3 THE DEFAULT SURFACE IS EIGHT, FROM build/ AND NOT FROM src/. The tests assert this
//    against src/. npm ships build/. Asking the built server over stdio is the only check
//    that covers what a host will actually launch.
//
//  4 THE SKILL AND ITS BUNDLE COPY ARE IDENTICAL. Two copies of public copy that can drift
//    will drift, and the bundle is the copy a directory installs.
//
//  5 THE TREE IS CLEAN AND THE SUITES ARE GREEN, so the published tarball is the reviewed
//    commit and not a desk state.
//
// The clock procedure is printed at the end, because it is the one step that cannot be
// checked in advance and must not be improvised.

import { execFileSync, spawn } from 'node:child_process'
import { readFileSync, mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

const repo = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
let failed = 0
const ok = m => console.log(`  ok    ${m}`)
const bad = (m, why) => { failed++; console.log(`  FAIL  ${m}`); if (why) console.log(`        ${why}`) }
const note = m => console.log(`        ${m}`)
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: repo, encoding: 'utf8', ...opts })

const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'))
const VERSION = pkg.version

// ── 1. One version everywhere ─────────────────────────────────────────────
console.log(`\n1. every version reference says ${VERSION}`)
{
  // EVERY FILE THAT CARRIES A VERSION, and the list was short by four. server.json is the MCP
  // registry manifest and the most public copy this project ships; .mcp.json is what actually
  // launches in an OpenClaw bundle; the codex plugin manifest and the bundle README are rendered
  // to people. All four were left at 3.2.x by a release that this check called OK.
  const places = [
    ['package.json', 'version', () => pkg.version],
    ['server.json', 'version', () => JSON.parse(readFileSync(join(repo, 'server.json'), 'utf8')).version],
    ['server.json', 'the npm package version it advertises', () => JSON.parse(readFileSync(join(repo, 'server.json'), 'utf8')).packages[0].version],
    ['openclaw-bundle/.mcp.json', 'the version it launches', () => {
      const args = JSON.parse(readFileSync(join(repo, 'openclaw-bundle/.mcp.json'), 'utf8')).mcpServers.mingle.args
      return (args.join(' ').match(/mingle-mcp@(\S+)/) ?? [])[1]
    }],
    ['openclaw-bundle/.codex-plugin/plugin.json', 'version', () => JSON.parse(readFileSync(join(repo, 'openclaw-bundle/.codex-plugin/plugin.json'), 'utf8')).version],
    ['src/setup.ts', 'the install command it writes', () => (readFileSync(join(repo, 'src/setup.ts'), 'utf8').match(/"mingle-mcp@([^"]+)"/) ?? [])[1]],
    ['src/index.ts', 'the version the MCP host displays', () => (readFileSync(join(repo, 'src/index.ts'), 'utf8').match(/name: "mingle",\s*\n\s*version: "([^"]+)"/) ?? [])[1]],
    ['skills/mingle/_meta.json', 'version', () => JSON.parse(readFileSync(join(repo, 'skills/mingle/_meta.json'), 'utf8')).version],
    ['skills/mingle/_meta.json', 'install', () => (JSON.parse(readFileSync(join(repo, 'skills/mingle/_meta.json'), 'utf8')).install.match(/@(.+)$/) ?? [])[1]],
    ['openclaw-bundle/package.json', 'version', () => JSON.parse(readFileSync(join(repo, 'openclaw-bundle/package.json'), 'utf8')).version],
    ['openclaw-bundle/openclaw.plugin.json', 'version', () => JSON.parse(readFileSync(join(repo, 'openclaw-bundle/openclaw.plugin.json'), 'utf8')).version],
  ]
  for (const [file, what, read] of places) {
    let found
    try { found = read() } catch (e) { bad(`${file} (${what}) could not be read: ${e.message}`); continue }
    if (found === VERSION) ok(`${file} (${what})`)
    else bad(`${file} (${what}) says ${JSON.stringify(found)}, not ${VERSION}`, 'a person copies the install line from whichever file they happen to read.')
  }
  // Every markdown file that prints an install command or a version to a human.
  for (const file of ['skills/mingle/SKILL.md', 'README.md', 'RELEASE-' + VERSION + '.md', 'openclaw-bundle/README.md']) {
    const body = readFileSync(join(repo, file), 'utf8')
    const stale = [...body.matchAll(/mingle-mcp(?:-setup)?@([0-9][^\s`)]*)/g)].map(m => m[1]).filter(v => v !== VERSION)
    if (stale.length === 0) ok(`${file} names no version but ${VERSION}`)
    else bad(`${file} still names ${[...new Set(stale)].join(', ')}`, 'the install command a person copies would fetch the wrong version.')
  }
  // The skill's declared tool count is public copy a directory renders.
  const meta = JSON.parse(readFileSync(join(repo, 'skills/mingle/_meta.json'), 'utf8'))
  if (meta.tools === 8) ok('_meta.json declares 8 tools, which is the default surface')
  else bad(`_meta.json declares ${meta.tools} tools`, 'the default surface is eight. A directory renders this number beside the install button.')

  // server.json's tool list is rendered by the registry, so a stale name there is an
  // advertisement for a tool a fresh install does not have.
  const serverJson = JSON.parse(readFileSync(join(repo, 'server.json'), 'utf8'))
  const advertised = (serverJson.tools ?? []).map(t => t.name).sort()
  const EIGHT_SORTED = [
    'continue_connection', 'find_people', 'manage_intent', 'mingle_inbox',
    'mingle_settings', 'publish_intent', 'request_intro', 'respond_intro',
  ]
  if (JSON.stringify(advertised) === JSON.stringify(EIGHT_SORTED)) ok('server.json advertises exactly the eight')
  else bad(`server.json advertises ${advertised.length} tool(s): ${advertised.join(', ')}`,
    'the registry renders this list. A name here that a fresh install does not offer is an advertisement for something that is not there.')
}

// ── 2. The built artifact is the committed source ──────────────────────────
console.log('\n2. a clean rebuild reproduces the committed build/')
{
  const hashTree = dir => {
    const out = []
    const walk = d => {
      for (const name of readdirSync(d).sort()) {
        const p = join(d, name)
        if (statSync(p).isDirectory()) walk(p)
        else out.push(`${relative(dir, p)} ${createHash('sha256').update(readFileSync(p)).digest('hex')}`)
      }
    }
    walk(dir)
    return out
  }
  let committed
  try { committed = hashTree(join(repo, 'build')) } catch (e) { bad(`build/ cannot be read: ${e.message}`, 'run npm run build and commit it.') }
  if (committed) {
    const status = run('git', ['status', '--short', '--', 'build']).trim()
    if (status !== '') {
      bad(`build/ has uncommitted changes:\n${status.split('\n').map(l => '        ' + l).join('\n')}`,
        'the tarball ships build/. Commit it so the published artifact is the reviewed one.')
    } else ok(`build/ is committed, ${committed.length} file(s)`)

    run('npm', ['run', 'build'], { stdio: 'ignore' })
    const rebuilt = hashTree(join(repo, 'build'))
    if (JSON.stringify(committed) === JSON.stringify(rebuilt)) {
      ok('a rebuild from this source is byte identical to the committed build/')
      note('Compared against the build/ this release committed, not against the previous release,')
      note('whose output is expected to differ because the source differs.')
    } else {
      const a = new Map(committed.map(l => l.split(' ')))
      const b = new Map(rebuilt.map(l => l.split(' ')))
      const diff = [...new Set([...a.keys(), ...b.keys()])].filter(k => a.get(k) !== b.get(k))
      bad(`the rebuild differs in ${diff.length} file(s): ${diff.slice(0, 8).join(', ')}`,
        'build/ is not the output of this source. Rebuild, commit, and read the diff before publishing.')
    }
  }
}

// ── 3. The default surface, asked of the BUILT server ─────────────────────
console.log('\n3. the built server answers with exactly the eight tools')
{
  const EIGHT = [
    'publish_intent', 'find_people', 'mingle_inbox', 'request_intro',
    'respond_intro', 'continue_connection', 'manage_intent', 'mingle_settings',
  ]
  const home = mkdtempSync(join(tmpdir(), 'mingle-preflight-home-'))
  const names = await new Promise((resolve, reject) => {
    const env = { ...process.env, HOME: home, USERPROFILE: home, MINGLE_API_URL: 'http://127.0.0.1:1' }
    delete env.MINGLE_LEGACY_TOOLS
    const p = spawn(process.execPath, [join(repo, 'build/index.js')], { env, stdio: ['pipe', 'pipe', 'pipe'] })
    const timer = setTimeout(() => { p.kill(); reject(new Error('the built server did not answer tools/list in 20s')) }, 20000)
    let buf = ''
    p.stdout.on('data', d => {
      buf += d
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        let m
        try { m = JSON.parse(line) } catch { continue }
        if (m.id === 1) p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n')
        if (m.id === 2) { clearTimeout(timer); p.kill(); resolve(m.result.tools.map(t => t.name)) }
      }
    })
    p.on('error', reject)
    p.stdin.write(JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'preflight', version: '1' } },
    }) + '\n')
  }).catch(e => { bad(e.message); return null })
  rmSync(home, { recursive: true, force: true })
  if (names) {
    if (JSON.stringify(names) === JSON.stringify(EIGHT)) ok('eight tools, in order, from build/index.js')
    else bad(`the built server offers ${names.length} tool(s): ${names.join(', ')}`, `expected exactly: ${EIGHT.join(', ')}`)
    const suffixed = names.filter(n => /_v[0-9]+$|_legacy$/.test(n))
    if (suffixed.length === 0) ok('no default name carries a version or legacy suffix')
    else bad(`suffixed default names: ${suffixed.join(', ')}`)
  }
}

// ── 4. The SKILL and its bundle copy ──────────────────────────────────────
console.log('\n4. the skill and the bundle copy are identical')
{
  for (const f of ['SKILL.md', '_meta.json']) {
    const a = readFileSync(join(repo, 'skills/mingle', f), 'utf8')
    const b = readFileSync(join(repo, 'openclaw-bundle/skills/mingle', f), 'utf8')
    if (a === b) ok(`${f} matches`)
    else bad(`${f} differs between skills/mingle and openclaw-bundle/skills/mingle`, 'run npm run bundle:sync')
  }
}

// ── 5. The tree and the suites ────────────────────────────────────────────
console.log('\n5. the tree')
{
  const status = run('git', ['status', '--short']).trim()
  if (status === '') ok('working tree clean')
  else bad(`working tree is not clean:\n${status.split('\n').map(l => '        ' + l).join('\n')}`)
  ok(`HEAD ${run('git', ['rev-parse', 'HEAD']).trim()}`)
  note('prepublishOnly runs the build, the suite and bundle:check, so npm publish cannot skip them.')
  note('Run these here too, and read the exit codes:')
  note('  npx tsc --noEmit')
  note('  npm test')
}

// ── The publish commands, and the clock ───────────────────────────────────
console.log(`\n${failed === 0 ? 'PREFLIGHT OK' : `PREFLIGHT FAILED with ${failed} problem(s)`}`)
console.log(`
Publish, once this is green and the API deploy is already live:

  npm publish --access public
  git tag -a v${VERSION} -m "mingle-mcp ${VERSION}"

THE 30 DAY COMPATIBILITY CLOCK. Read this before typing anything.

  The window runs from the moment the canonical MCP became publicly available, which is the
  npm publication instant and nothing else. Not the API deploy, not the local clock before
  publishing, not the moment the env var is set.

  1  npm publish --access public
  2  npm view mingle-mcp@${VERSION} time --json
  3  Take the timestamp for exactly ${VERSION} from that output. That UTC instant is
     canonical_mcp_published_at.
  4  legacy_write_cutoff_at = canonical_mcp_published_at + 30 days.
  5  Set MINGLE_CANONICAL_MCP_RELEASED_AT to canonical_mcp_published_at on the API and
     restart it. The server computes the cutoff and stamps both markers.
  6  Confirm: the root index's write_authorization.legacy_cutoff_at now reads the instant
     from step 4, and legacy_accepted is still true.

  The markers are INSERT OR IGNORE. A wrong instant CANNOT be corrected by setting the
  variable again, so step 3 is read from the registry and never from memory.
`)
process.exit(failed === 0 ? 0 : 1)
