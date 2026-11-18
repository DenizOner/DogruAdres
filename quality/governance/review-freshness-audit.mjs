import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
/**
 * Advisory-only GitHub review metadata audit, not a protected branch gate.
 * It cannot authenticate distinct ChatGPT writers/reviewers or issue PASS.
 * Node 20+, no dependencies.  Read-only endpoints; never prints credentials.
 */
const SHA = /^[0-9a-f]{40}$/i
const marker = (body, kind) => String(body || '').slice(0, 300).includes(`DA-${kind}-v2`)
const prMarker = (body, n) => {
  const first = String(body || '').slice(0, 440)
  // Canonical #216 Denetçi results may use "## DA-REVIEW-RESULT-v2 — #422"
  // without a literal "PR #422" in the first 440 characters.
  const explicit = new RegExp(`(?:PR\\s*#|/pull/)${n}\\b`, 'i').test(first)
  const canonicalHeading = new RegExp(`(?:^|\\n)\\s*##\\s*DA-REVIEW-(?:REQUEST|RESULT)-v2\\s*[-:–—]\\s*#${n}\\b`, 'i').test(first)
  return explicit || canonicalHeading
}
// Canonical #216 records often put HEAD / base / main SHAs on one line.
// The first two values are HEAD/base only when labels occur in that order;
// a lone HEAD must never be accepted as a base (fail-closed).
const versionPairIn = body => {
  for (const line of String(body || '').split(/\r?\n/)) {
    const hi = line.search(/\bHEAD\b/i), bi = line.search(/\bbase\b/i)
    if (hi < 0 || bi < hi) continue
    const values = [...line.matchAll(/\b[a-f0-9]{40}\b/ig)]
    if (values.length >= 2 && values[0].index > hi && values[1].index > bi) {
      return { head: values[0][0].toLowerCase(), base: values[1][0].toLowerCase() }
    }
  }
  return null
}
const headIn = body => versionPairIn(body)?.head || /(?:exact\s+)?HEAD[^\n]{0,125}?([a-f0-9]{40})/i.exec(String(body || ''))?.[1]?.toLowerCase() || null
const baseIn = body => {
  const pair = versionPairIn(body)
  if (pair) return pair.base
  const line = String(body || '').split(/\r?\n/).find(l => /\bbase\b/i.test(l) && !/\bHEAD\b/i.test(l))
  return line ? /\bbase[^\n]{0,125}?([a-f0-9]{40})/i.exec(line)?.[1]?.toLowerCase() || null : null
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
  ].filter(r => /REVIEW-PROVENANCE-v1/.test(String(r.body || '').slice(0, 300)) && headIn(r.body) === head && baseIn(r.body) === base)
  if (!provenance.length) return { ...evidence, state: 'UNVERIFIED', reason: 'no_matching_review_provenance', resultCount: currentResults.length }
  const latest = [...currentResults].sort((a,b) => (a.id || 0) - (b.id || 0)).at(-1)
  const body = String(latest.body || '')
  // Not a PASS verdict: text is self-reported, cannot establish independent identity.
  const heading = /(?:^|\n)\s*##\s*DA-REVIEW-RESULT-v2[^\n]{0,240}\b(PASS|FAIL|BLOCKED|STALE)\b/im.exec(body)?.[1]
  const decision = heading || /\bKARAR\s*:\s*\**(PASS|FAIL|BLOCKED|STALE)\b/i.exec(body)?.[1]
  const disposition = decision ? 'REPORTED_' + decision.toUpperCase() : 'UNCLASSIFIED'
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
