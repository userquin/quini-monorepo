/* eslint-disable node/prefer-global/process */
import { simpleGit } from 'simple-git'

const git = simpleGit()
const prNumber = process.env.PR_NUMBER
const repo = process.env.GITHUB_REPOSITORY
const token = process.env.GITHUB_TOKEN

const MARKER_START = '<!-- changelog-start -->'
const MARKER_END = '<!-- changelog-end -->'
const MARKER_REGEX = /<!-- changelog-start -->[\s\S]*<!-- changelog-end -->/
const LAST_TAG_REGEX = /tag:\s*([^,)]+)/

async function resolveLogin(sha) {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/commits/${sha}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    return data.author?.login ?? null
  }
  catch {
    return null
  }
}

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

  // Get commits from last tag to HEAD using git log
  const log = lastTag
    ? await git.log({ from: lastTag, to: 'HEAD' })
    : await git.log()

  // Filter out bot commits and changesets release commits
  const commits = log.all.filter(c =>
    !c.author_email.includes('[bot]')
    && !c.message.includes('[ci] release')
    && !c.message.includes('Version Packages'),
  )

  console.log(`Found ${commits.length} commits since ${lastTag ?? 'beginning'}`)

  // Resolve distinct contributor logins — one API call per unique email
  const seenEmails = new Set()
  const contributorsList = [] // "- Full Name (@login)"
  const contributorsAvatars = [] // "[![login](...)](...)

  for (const c of commits) {
    if (!seenEmails.has(c.author_email)) {
      seenEmails.add(c.author_email)
      const login = await resolveLogin(c.hash)
      if (login) {
        contributorsList.push(`- ${c.author_name} ( @${login} )`)
        contributorsAvatars.push(
          `[![${login}](https://github.com/${login}.png?size=32)](https://github.com/${login})`,
        )
      }
      else {
        contributorsList.push(`- ${c.author_name}`)
      }
    }
  }

  const commitsBody = commits
    .map(c => `- ${c.message.split('\n')[0]} (${c.hash.substring(0, 7)})`)
    .join('\n')

  const contributorsBody = contributorsList.length > 0
    ? `\n### 💖 Contributors\n${contributorsList.join('\n')}\n${contributorsAvatars.join(' ')}`
    : ''

  const section = [
    MARKER_START,
    '### ⏳ Unreleased changes',
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
    console.log(`Updated PR #${prNumber} with ${commits.length} commits and ${seenEmails.size} contributors.`)
  else
    console.error(`Failed to update PR: ${updateRes.statusText}`)
}

run().catch(console.error)
