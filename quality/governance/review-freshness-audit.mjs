/**
 * Advisory-only GitHub review metadata audit, not a protected branch gate.
 * It cannot authenticate distinct ChatGPT writers/reviewers or issue PASS.
 * Node 20+, no dependencies.  Read-only endpoints; never prints credentials.
 */
const SHA = /^[0-9a-f]{40}$/i
const marker = (body, kind) => String(body || '').slice(0, 300).includes(`DA-${kind}-v2`)
const prMarker = (body, n) => new RegExp(`(?:PR\\s*#|/pull/)${n}\\b`, 'i').test(String(body || '').slice(0, 440))
const headIn = (body) => /(?:exact\s+)?HEAD[^\n]{0,125}?([a-f0-9]{40})/i.exec(String(body || ''))?.[1]?.toLowerCase() || null
const baseIn = (body) => /\bbase[^\n]{0,125}?([a-f0-9]{40})/i.exec(String(body || ''))?.[1]?.toLowerCase() || null

export function assessReviewEvidence({ pr, mainSha, queueComments, reviews, queueIssue = 216 }) {
  if (!pr || !Number.isInteger(pr.number) || !SHA.test(pr.head?.sha || '') || !SHA.test(pr.base?.sha || '') || !SHA.test(mainSha || '') || !Array.isArray(queueComments) || !Array.isArray(reviews)) {
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
  const currentResults = results.filter(exact)
  if (!currentResults.length) return { ...evidence, state: 'PENDING', reason: 'no_matching_result', resultCount: 0 }
  const provenance = reviews.filter(r => r.commit_id?.toLowerCase() === head && /REVIEW-PROVENANCE-v1/.test(r.body || '') && headIn(r.body) === head && baseIn(r.body) === base)
  if (!provenance.length) return { ...evidence, state: 'UNVERIFIED', reason: 'no_matching_review_provenance', resultCount: currentResults.length }
  const latest = [...currentResults].sort((a,b) => (a.id || 0) - (b.id || 0)).at(-1)
  const body = String(latest.body || '')
  // Not a PASS verdict: text is self-reported, cannot establish independent identity.
  const disposition = /\bFAIL\b/i.test(body.slice(0, 480)) ? 'REPORTED_FAIL' : /\bBLOCKED\b/i.test(body.slice(0, 480)) ? 'REPORTED_BLOCKED' : /\bSTALE\b/i.test(body.slice(0, 480)) ? 'REPORTED_STALE' : /\bPASS\b/i.test(body.slice(0, 480)) ? 'REPORTED_PASS' : 'UNCLASSIFIED'
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
  const mainAfter = await ref()
  if (mainBefore !== mainAfter) return { state: 'UNKNOWN', reason: 'main_changed_during_snapshot', independentIdentity: 'UNVERIFIED', mergePermitted: false }
  return assessReviewEvidence({ pr, mainSha: mainAfter, queueComments, reviews, queueIssue })
}

async function cli() {
  const opts = Object.fromEntries(process.argv.slice(2).filter(x => /^--(repo|pr|queue)=/.test(x)).map(x => x.slice(2).split(/=(.*)/s).slice(0, 2)))
  const [owner, repo, extra] = String(opts.repo || '').split('/')
  if (extra || !owner || !repo || !/^\d+$/.test(opts.pr || '') || opts.queue && !/^\d+$/.test(opts.queue)) throw new Error('Usage: node review-freshness-audit.mjs --repo=owner/repo --pr=N [--queue=216] (GITHUB_TOKEN read-only required)')
  return auditLive({ owner, repo, prNumber: Number(opts.pr), queueIssue: Number(opts.queue || 216), token: process.env.GITHUB_TOKEN })
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    const result = await cli()
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    process.exitCode = result.state === 'RECORDED' ? 0 : 2
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ state: 'UNKNOWN', reason: String(error.message || 'read_failure'), independentIdentity: 'UNVERIFIED', mergePermitted: false })}\n`)
    process.exitCode = 2
  }
}
