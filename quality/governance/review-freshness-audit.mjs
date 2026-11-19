import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
/**
 * Advisory-only GitHub review metadata audit, not a protected branch gate.
 * It cannot authenticate distinct ChatGPT writers/reviewers or issue PASS.
 * Node 20+, no dependencies.  Read-only endpoints; never prints credentials.
 */
const SHA = /^[0-9a-f]{40}$/i
const marker = (body, kind) => String(body || '').slice(0, 300).includes(`DA-${kind}-v2`)
// Associate queue evidence with its declared target, not incidental links.
// A reference to another PR in the narrative is not a review of that PR.
const reviewHeadingKind = line => {
  const m = /^\s*(?:#{1,4}\s*)?\*{0,2}\s*DA-REVIEW-(REQUEST|RESULT)-v2\b/i.exec(String(line || ''))
  return m ? m[1].toUpperCase() : null
}
const prMarker = (body, n) => {
  const lines = String(body || '').slice(0, 1800).split(/\r?\n/)
  const heading = lines.find(line => reviewHeadingKind(line))
  if (heading) {
    // Ignore history/related references after the actual heading decision.
    const targetPart = heading.split(/\s+[-–—]\s+(?:PASS|FAIL|BLOCKED|STALE)\b/i)[0]
    const explicit = [...targetPart.matchAll(/\bPR\s*#(\d+)\b/gi)].map(x => Number(x[1]))
    if (explicit.length) return explicit.every(id => id === n)
    // Canonical '#422 / #216': the first unlabeled number is the target.
    // The second number is the coordination issue, not another target PR.
    const canonical = /DA-REVIEW-(?:REQUEST|RESULT)-v2\s*[-:–—]\s*#(\d+)\b/i.exec(targetPart)
    return canonical ? Number(canonical[1]) === n : false
  }
  // Older canonical READY/RESULT comments can use a standalone '## PR #418'
  // or 'READY for PR #418' line. Do not search all prose for PR links.
  const field = lines.find(line => /^\s*(?:#{1,4}\s*)?(?:\*{0,2}\s*)?(?:READY\s+for\s+)?PR\s*#\d+\b/i.test(line))
  const match = field && /\bPR\s*#(\d+)\b/i.exec(field)
  return Boolean(match && Number(match[1]) === n)
}

// Review evidence may show HEAD/base/main in one label row. Do not
// interpret a later main SHA as an omitted or NOT VERIFIED base value.
const shaCell = value => {
  const clean = String(value ?? '').replace(/[\x60*]/g, '').trim()
  return SHA.test(clean) ? clean.toLowerCase() : null
}
const labelledSha = (body, key) => {
  const pattern = key === 'head'
    ? /\bHEAD\b\s*(?:\*{0,2}\s*:)?\s*[\x60*\s]*([a-f0-9]{40})\b/i
    : /\bbase\b\s*(?:\*{0,2}\s*:)?\s*[\x60*\s]*([a-f0-9]{40})\b/i
  for (const line of String(body || '').split(/\r?\n/)) {
    const match = pattern.exec(line)
    if (match) return match[1].toLowerCase()
  }
  return null
}
const versionPairIn = body => {
  for (const line of String(body || '').split(/\r?\n/)) {
    const hi = line.search(/\bHEAD\b/i), bi = line.search(/\bbase\b/i)
    if (hi < 0 || bi < hi) continue
    // 'HEAD: sha; base: sha' records have separately labeled fields.
    const explicitHead = labelledSha(line, 'head')
    const explicitBase = labelledSha(line, 'base')
    if (explicitHead && explicitBase) return { head: explicitHead, base: explicitBase }
    // In 'HEAD / stored base / main: head / base / main', require the
    // FIRST TWO data cells to be exact hashes. Never skip a missing cell.
    const colon = line.indexOf(':')
    if (colon < 0 || hi > colon || bi > colon) continue
    const cells = line.slice(colon + 1).split(/\s*\/\s*/)
    if (cells.length < 2) continue
    const head = shaCell(cells[0]), base = shaCell(cells[1])
    if (head && base) return { head, base }
  }
  return null
}
// Explicit current target fields take precedence over explanatory historical refs.
// Do not borrow a missing HEAD/base from a history row, even if its SHA matches.
const currentVersionIn = body => {
  const currentLines = String(body || '').split(/\r?\n/).filter(line =>
    !/\b(?:historical|previous|older|old|tarihsel|önceki|eski)\b/i.test(line))
  // A combined "HEAD / base: h / b" line must be parsed as TWO data cells,
  // not as a separate "base: h" label. Exclude such rows from single fields.
  // Only declarations beginning with a target metadata label are SHA evidence.
  // Review prose such as "inspected: complete HEAD/base diff" is not a target.
  const isCombinedTarget = line =>
    /^\s*(?:[-*]\s*)?\*{0,2}(?:exact\s+)?(?:PR\s+)?HEAD\b/i.test(line) &&
    /\bbase\b/i.test(line)
  const isSeparateTarget = line =>
    /^\s*(?:[-*]\s*)?\*{0,2}(?:(?:exact\s+)?(?:PR\s+)?(?:HEAD|base)|(?:exact\s+)?target)\b/i.test(line)
  const combined = currentLines.filter(isCombinedTarget)
  const pairs = combined.map(line => versionPairIn(line))
  // Every current combined declaration must be complete and valid. A broken
  // second declaration cannot disappear behind an otherwise matching pair.
  if (pairs.some(pair => !pair)) return null
  const separate = currentLines.filter(line =>
    !isCombinedTarget(line) && isSeparateTarget(line)).join('\n')
  // Multiple separately labelled declarations may repeat only the SAME value.
  // Read them all: picking only the first silently hides a conflicting revision.
  const separateValues = key => {
    // Capture declarations BEFORE checking their values: an explicit
    // "base: NOT VERIFIED" must invalidate the record, not disappear.
    const re = key === 'head'
      ? /\bHEAD\b\s*(?:\*{0,2}\s*:)?\s*[\x60*\s]*([^\s\x60*;,/]+)/gi
      : /\bbase\b\s*(?:\*{0,2}\s*:)?\s*[\x60*\s]*([^\s\x60*;,/]+)/gi
    return [...separate.matchAll(re)].map(match => shaCell(match[1]))
  }
  const heads = separateValues('head'), bases = separateValues('base')
  if (heads.includes(null) || bases.includes(null) ||
      new Set(heads).size > 1 || new Set(bases).size > 1) return null
  const head = heads[0] || null, base = bases[0] || null
  if (Boolean(head) !== Boolean(base)) return null
  if (head && base) pairs.push({ head, base })
  if (!pairs.length) return null
  // Conflicting current metadata is not trustworthy even when one pair matches.
  const first = pairs[0]
  return pairs.every(pair => pair.head === first.head && pair.base === first.base)
    ? first : null
}
const headIn = body => currentVersionIn(body)?.head || null
const baseIn = body => currentVersionIn(body)?.base || null

// A review with an explicit target must not be borrowed by another PR with
// identical HEAD/base SHAs. Incidental "Related: PR #..." prose is not a target.
const provenanceMatchesPr = (body, number) => {
  const lines = String(body || '').slice(0, 1800).split(/\r?\n/)
  const targetLines = lines.filter(line =>
    /^\s*(?:[-*]\s*)?\*{0,2}(?:Exact\s+target|Target\s+PR)\*{0,2}\s*:/i.test(line) ||
    /^\s*#{1,4}\s*REVIEW-PROVENANCE-v1\b.*\bPR\s*#\d+/i.test(line))
  if (!targetLines.length) return true // legacy SHA-only provenance
  return targetLines.every(line => {
    const ids = [...line.matchAll(/\bPR\s*#(\d+)\b/gi)].map(m => Number(m[1]))
    return ids.length === 1 && ids[0] === number
  })
}

export function assessReviewEvidence({ pr, mainSha, queueComments, reviews, prComments = [], queueIssue = 216 }) {
  if (!pr || !Number.isInteger(pr.number) || !SHA.test(pr.head?.sha || '') || !SHA.test(pr.base?.sha || '') || !SHA.test(mainSha || '') || !Array.isArray(queueComments) || !Array.isArray(reviews) || !Array.isArray(prComments)) {
    return { state: 'UNKNOWN', reason: 'missing_or_invalid_metadata', independentIdentity: 'UNVERIFIED', ci: 'NOT_CHECKED', mergePermitted: false }
  }
  const head = pr.head.sha.toLowerCase(), base = pr.base.sha.toLowerCase(), main = mainSha.toLowerCase()
  const evidence = { pr: pr.number, head, base, main, queueIssue, independentIdentity: 'UNVERIFIED', ci: 'NOT_CHECKED', mergePermitted: false }
  if (pr.state !== 'open' || pr.draft === true) return { ...evidence, state: 'NOT_READY', reason: 'pr_closed_or_draft' }
  if (base !== main) return { ...evidence, state: 'STALE', reason: 'base_differs_from_live_main' }
  const relevant = queueComments.filter(c => prMarker(c.body, pr.number))
  const requests = relevant.filter(c => marker(c.body, 'REVIEW-REQUEST'))
  const results = relevant.filter(c => marker(c.body, 'REVIEW-RESULT'))
  const exact = c => headIn(c.body) === head && baseIn(c.body) === base
  if (!requests.some(exact)) return { ...evidence, state: requests.length ? 'STALE' : 'MISSING', reason: requests.length ? 'ready_record_for_different_sha' : 'no_ready_record' }
  const latestRequest = requests.filter(exact).sort((a,b) => (a.id || 0) - (b.id || 0)).at(-1)
  const currentResults = results.filter(c => exact(c) && Number.isSafeInteger(c.id) && Number.isSafeInteger(latestRequest.id) && c.id > latestRequest.id)
  if (!currentResults.length) return { ...evidence, state: 'PENDING', reason: 'no_matching_result', resultCount: 0 }
  const provenance = [
    ...reviews.filter(r => r.commit_id?.toLowerCase() === head),
    // PR Conversation issue comments have no commit_id; check exact SHA in their body.
    ...prComments
  ].filter(r => /REVIEW-PROVENANCE-v1/.test(String(r.body || '').slice(0, 300)) &&
    provenanceMatchesPr(r.body, pr.number) &&
    headIn(r.body) === head && baseIn(r.body) === base)
  if (!provenance.length) return { ...evidence, state: 'UNVERIFIED', reason: 'no_matching_review_provenance', resultCount: currentResults.length }
  const latest = [...currentResults].sort((a,b) => (a.id || 0) - (b.id || 0)).at(-1)
  const body = String(latest.body || '')
  // Not a PASS verdict: text is self-reported, cannot establish independent identity.
  const headingLine = body.split(/\r?\n/).find(line =>
    reviewHeadingKind(line) === 'RESULT') || ''
  // A historical PASS in '(previous PASS invalidated)' is not a decision.
  // Read only explicit decision slots after a delimiter or KARAR/SONUÇ.
  // Keep every declared heading decision slot, including unsupported values.
  // The PR target segment is metadata, not a decision; history in parentheses
  // after a decision does not add another vote.
  const headingSlots = headingLine.split(/\s+[—–-]\s+/).slice(1)
    .filter(segment => !/^\s*(?:PR\s*)?#\d+\b/i.test(segment))
  // A heading must declare one unambiguous CURRENT decision. A second verdict
  // separated by a slash, semicolon or prose cannot silently become PASS.
  // Explicitly historical parenthetical status is not a current vote.
  const headingDecision = slot => {
    const clean = slot.trim().replace(/^\*+/, '')
    const leading = /^(PASS|FAIL|BLOCKED|STALE)\b/i.exec(clean)
    if (!leading) return null
    const current = clean.replace(/\([^)]*\b(?:previous|historical|older|old|tarihsel|önceki|eski)\b[^)]*\)/gi, '')
    const votes = [...current.matchAll(/\b(?:PASS|FAIL|BLOCKED|STALE|CHANGES\s+REQUIRED)\b/gi)]
    return votes.length === 1 ? leading[1].toUpperCase() : null
  }
  const headingVotes = headingSlots.length
    ? headingSlots.map(headingDecision)
    : [...headingLine.matchAll(/[—–:-]\s*(PASS|FAIL|BLOCKED|STALE)\b/gi)]
      .map(match => headingDecision(headingLine.slice(match.index + match[0].lastIndexOf(match[1]))))
  // Unsupported explicit decisions cannot be silently skipped behind a PASS heading.
  const explicitFields = [...body.matchAll(/(?:^|\n)\s*(?:[-*]\s*)?\*{0,2}(?:KARAR|SONUÇ)\*{0,2}:\*{0,2}\s*\*{0,2}([^\r\n]+)/gim)]
    .map(match => match[1].replace(/\*+/g, '').trim())
  const explicitVotes = explicitFields.map(headingDecision)
  const choices = new Set([...headingVotes, ...explicitVotes])
  const decision = headingVotes.includes(null) || explicitVotes.includes(null) || headingVotes.length > 1 || explicitVotes.length > 1 || choices.size > 1
    ? null : explicitVotes[0] || headingVotes[0] || null
  const disposition = decision ? 'REPORTED_' + decision : 'UNCLASSIFIED'
  return { ...evidence, state: 'RECORDED', reason: 'review_metadata_matches_current_sha', disposition, resultId: latest.id || null, matchingReviewCount: provenance.length, warning: 'Human review of identity, exact diff, tests and merge gates is still mandatory' }
}

export async function githubPage({ fetcher, endpoint, token }) {
  const res = await fetcher(`https://api.github.com${endpoint}`, {
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', Authorization: `Bearer ${token}` }
  })
  if (!res.ok) throw new Error(`GitHub read denied: HTTP ${res.status}`)
  return res.json()
}

export async function allPages({ fetcher, path, token, maxPages = 30 }) {
  const out = []
  for (let page = 1; page <= maxPages; page++) {
    const join = path.includes('?') ? '&' : '?'
    const data = await githubPage({ fetcher, endpoint: `${path}${join}per_page=100&page=${page}`, token })
    if (!Array.isArray(data)) throw new Error('Invalid pagination response')
    out.push(...data)
    if (data.length < 100) return out
  }
  throw new Error('Truncated pagination limit; manual review required')
}

export async function auditLive({ owner, repo, prNumber, queueIssue = 216, token, fetcher = fetch }) {
  if (!/^[a-z\d_.-]+$/i.test(owner) || !/^[a-z\d_.-]+$/i.test(repo) || !Number.isSafeInteger(prNumber) || prNumber < 1 || !Number.isSafeInteger(queueIssue) || queueIssue < 1 || !token) {
    throw new Error('Missing/invalid repo, PR, queue or read-only token')
  }
  const path = `/repos/${owner}/${repo}`
  // Serialize snapshots and re-check live main at end to catch in-flight drift.
  const ref = async () => (await githubPage({ fetcher, endpoint: `${path}/git/ref/heads/main`, token })).object.sha
  const mainBefore = await ref()
  const pr = await githubPage({ fetcher, endpoint: `${path}/pulls/${prNumber}`, token })
  const queueComments = await allPages({ fetcher, path: `${path}/issues/${queueIssue}/comments`, token })
  const reviews = await allPages({ fetcher, path: `${path}/pulls/${prNumber}/reviews`, token })
  const prComments = await allPages({ fetcher, path: `${path}/issues/${prNumber}/comments`, token })
  const prAfter = await githubPage({ fetcher, endpoint: `${path}/pulls/${prNumber}`, token })
  const mainAfter = await ref()
  if (mainBefore !== mainAfter) return { state: 'UNKNOWN', reason: 'main_changed_during_snapshot', independentIdentity: 'UNVERIFIED', mergePermitted: false }
  if (pr.head?.sha !== prAfter.head?.sha || pr.base?.sha !== prAfter.base?.sha || pr.state !== prAfter.state || pr.draft !== prAfter.draft) return { state: 'UNKNOWN', reason: 'pr_changed_during_snapshot', independentIdentity: 'UNVERIFIED', mergePermitted: false }
  return assessReviewEvidence({ pr: prAfter, mainSha: mainAfter, queueComments, reviews, prComments, queueIssue })
}

async function cli() {
  const opts = Object.fromEntries(process.argv.slice(2).filter(x => /^--(repo|pr|queue)=/.test(x)).map(x => x.slice(2).split(/=(.*)/s).slice(0, 2)))
  const [owner, repo, extra] = String(opts.repo || '').split('/')
  if (extra || !owner || !repo || !/^\d+$/.test(opts.pr || '') || opts.queue && !/^\d+$/.test(opts.queue)) throw new Error('Usage: node review-freshness-audit.mjs --repo=owner/repo --pr=N [--queue=216] (GITHUB_TOKEN read-only required)')
  return auditLive({ owner, repo, prNumber: Number(opts.pr), queueIssue: Number(opts.queue || 216), token: process.env.GITHUB_TOKEN })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await cli()
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    // Advisory never becomes a green GitHub gate, even for self-reported PASS.
    process.exitCode = 2
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ state: 'UNKNOWN', reason: String(error.message || 'read_failure'), independentIdentity: 'UNVERIFIED', mergePermitted: false })}\n`)
    process.exitCode = 2
  }
}
