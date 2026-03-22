import { generate, getGitTags, isPrerelease, sendRelease } from 'changelogithub'
import semver from 'semver'

// eslint-disable-next-line node/prefer-global/process
const packages = JSON.parse(process.env.PUBLISHED_PACKAGES)

for (const { name, version } of packages) {
  const newTag = `${name}@${version}`
  const prerelease = isPrerelease(version)
  const channel = semver.prerelease(version)?.[0] ?? 'stable'

  const allTags = await getGitTags()

  const prevTag = allTags
    .filter(t => t.startsWith(`${name}@`))
    .map(t => t.replace(`${name}@`, ''))
    .filter((v) => {
      const pre = semver.prerelease(v)?.[0] ?? 'stable'
      return pre === channel
    })
    .sort((a, b) => semver.rcompare(a, b))
    .at(1)

  const prevFullTag = prevTag ? `${name}@${prevTag}` : undefined

  console.log(`Changelog for ${newTag} | channel: ${channel} (from: ${prevFullTag ?? 'initial release'})`)

  const { config, output } = await generate({
    from: prevFullTag,
    to: newTag,
    draft: prerelease,
    prerelease,
    // eslint-disable-next-line node/prefer-global/process
    token: process.env.GITHUB_TOKEN,
  })

  await sendRelease(config, output)
}
