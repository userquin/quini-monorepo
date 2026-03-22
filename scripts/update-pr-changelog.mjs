import { simpleGit } from 'simple-git'

const git = simpleGit()
// eslint-disable-next-line node/prefer-global/process
const prNumber = process.env.PR_NUMBER
// eslint-disable-next-line node/prefer-global/process
const repo = process.env.GITHUB_REPOSITORY
// eslint-disable-next-line node/prefer-global/process
const token = process.env.GITHUB_TOKEN

const MARKER_START = '<!-- changelog-start -->'
const MARKER_END = '<!-- changelog-end -->'
const MARKER_REGEX = /<!-- changelog-start -->[\s\S]*<!-- changelog-end -->/
const LAST_TAG_REGEX = /tag:\s*([^,)]+)/

async function run() {
  if (!prNumber || !repo || !token) {
    console.log('Missing environment variables, skipping PR update.')
    return
  }

  // Get the most recent tag reachable from HEAD without loading all tags into memory
  const rawLog = await git.raw([
    'log',
    '--simplify-by-decoration',
    '-1',
    '--format=%D',
    '--tags',
  ])

  // rawLog example: "HEAD -> main, tag: @quini/core@0.1.6, tag: @quini/plugin@0.1.6, origin/main"
  // Any tag from the same commit works since they all point to the same SHA
  const lastTagMatch = rawLog.match(LAST_TAG_REGEX)
  const lastTag = lastTagMatch ? lastTagMatch[1].trim() : undefined

  console.log(`Last tag found: ${lastTag ?? 'none'}`)

  // Get commits from last tag to HEAD via GitHub API (includes author.login without extra calls)
  const commitsRes = await fetch(
    `https://api.github.com/repos/${repo}/pulls/${prNumber}/commits?per_page=100`,
    { headers: { Authorization: `Bearer ${token}` } },
  )

  if (!commitsRes.ok) {
    console.error(`Failed to fetch PR commits: ${commitsRes.statusText}`)
    return
  }

  const prCommits = await commitsRes.json()

  // Filter out bot commits and changesets release commits
  const commits = prCommits.filter(c =>
    !c.author?.login?.includes('[bot]')
    && !c.commit.message.includes('[ci] release')
    && !c.commit.message.includes('Version Packages'),
  )

  // Collect distinct contributors by login, preserving first appearance order
  const seenLogins = new Set()
  const contributors = []

  for (const c of commits) {
    const login = c.author?.login
    if (login && !seenLogins.has(login)) {
      seenLogins.add(login)
      // Render avatar as a clickable image in Markdown
      contributors.push(
        `[![${login}](https://github.com/${login}.png?size=32)](https://github.com/${login})`,
      )
    }
  }

  const commitsBody = commits
    .map(c => `- ${c.commit.message.split('\n')[0]} (${c.sha.substring(0, 7)})`)
    .join('\n')

  const contributorsBody = contributors.length > 0
    ? `\n### 💖 Contributors\n${contributors.join(' ')}`
    : ''

  const section = [
    MARKER_START,
    '### ⏳ Pending commits',
    commitsBody,
    contributorsBody,
    MARKER_END,
  ].join('\n')

  // Fetch current PR body
  const prRes = await fetch(`https://api.github.com/repos/${repo}/pulls/${prNumber}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!prRes.ok) {
    console.error(`Failed to fetch PR: ${prRes.statusText}`)
    return
  }

  const pr = await prRes.json()
  const currentBody = pr.body ?? ''

  const newBody = currentBody.includes(MARKER_START)
    ? currentBody.replace(MARKER_REGEX, section)
    : `${currentBody}\n\n${section}`

  const updateRes = await fetch(`https://api.github.com/repos/${repo}/pulls/${prNumber}`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: newBody }),
  })

  if (updateRes.ok)
    console.log(`Updated PR #${prNumber} with ${commits.length} commits and ${contributors.length} contributors.`)
  else
    console.error(`Failed to update PR: ${updateRes.statusText}`)
}

run().catch(console.error)
