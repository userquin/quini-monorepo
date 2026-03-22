import { blue, bold, cyan, dim } from 'ansis'
import { generate, getGitTags, isPrerelease, sendRelease } from 'changelogithub'
import semver from 'semver'

const changelogihubVersion = '14.0.0'

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
