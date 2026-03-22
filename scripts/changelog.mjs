import { blue, bold, cyan, dim, green } from 'ansis'
import { generate, isPrerelease } from 'changelogithub'
import semver from 'semver'
import { simpleGit } from 'simple-git'

// NOTE: keep in sync with pnpm catalog version for changelogithub
const changelogihubVersion = '14.0.0'

const git = simpleGit()

/**
 * `changelogithub` sendRelease replacement to send `make_latest` field for stable releases,
 * and avoid marking pre-releases as latest.
 * @param config {import('changelogithub').ChangelogOptions}
 * @param content {string}
 * @return {Promise<{html_url: string, id: number}>}
 */
async function sendRelease(config, content) {
  const headers = {
    'Authorization': `Bearer ${config.token}`,
    'Content-Type': 'application/json',
  }

  const baseUrl = `https://${config.baseUrlApi}/repos/${config.releaseRepo}/releases`

  let url = baseUrl
  let method = 'POST'

  // Check if the release already exists (e.g. re-run of the workflow)
  try {
    const existing = await fetch(`${baseUrl}/tags/${config.to}`, { headers })
    const data = await existing.json()
    if (data.url) {
      url = data.url
      method = 'PATCH'
    }
  }
  catch {
    // Release does not exist yet, proceed with POST
  }

  const body = {
    body: content,
    draft: config.draft || false,
    name: config.name || config.to,
    prerelease: config.prerelease,
    tag_name: config.to,
    // Only mark stable releases as latest, never pre-releases
    make_latest: config.prerelease ? 'false' : 'true',
  }

  console.log(cyan(method === 'POST' ? 'Creating release notes...' : 'Updating release notes...'))

  const res = await fetch(url, {
    method,
    headers,
    body: JSON.stringify(body),
  })

  /** @type {{html_url: string, id: number}} */
  const release = await res.json()
  console.log(green(`Released on ${release.html_url}`))
  return release
}

// eslint-disable-next-line node/prefer-global/process
const packages = JSON.parse(process.env.PUBLISHED_PACKAGES)

// NOTE: DON'T use `await Promise.all()` here, we'll get logs mixed in the terminal, keep this logic sequential
for (const { name, version } of packages) {
  const newTag = `${name}@${version}`
  const prerelease = isPrerelease(version)
  const channel = semver.prerelease(version)?.[0] ?? 'stable'

  // Fetch only the tags for this specific package, sorted by semver descending.
  // Using --list with a pattern and --sort=-version:refname avoids fetching all
  // tags across the entire repo, which can be very large in a monorepo over time.
  const { all: allTags } = await git.tags([
    '--list',
    `${name}@*`,
    '--sort=-version:refname',
  ])

  // Exclude current version and filter by channel (stable, alpha, beta)
  // to avoid mixing release lines, then pick the most recent one.
  const prevTag = allTags
    .map(t => t.replace(`${name}@`, ''))
    .filter((v) => {
      const pre = semver.prerelease(v)?.[0] ?? 'stable'
      return v !== version && pre === channel
    })
    .at(0)

  const prevFullTag = prevTag ? `${name}@${prevTag}` : undefined

  console.log(`Changelog for ${newTag} | channel: ${channel} (from: ${prevFullTag ?? 'initial release'})`)

  console.log(dim(`changelo${bold('github')} `) + dim(`v${changelogihubVersion}`))

  const { commits, config, output } = await generate({
    from: prevFullTag,
    to: newTag,
    draft: prerelease,
    prerelease,
    // eslint-disable-next-line node/prefer-global/process
    token: process.env.GITHUB_TOKEN,
  })

  console.log(cyan(config.from) + dim(' -> ') + blue(config.to) + dim(` (${commits.length} commits)`))
  console.log(dim('--------------'))
  console.log()
  console.log(output.replace(/&nbsp;/g, ''))
  console.log()
  console.log(dim('--------------'))

  await sendRelease(config, output)
}
