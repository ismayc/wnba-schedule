import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LEAGUE } from '../src/config/league.js'

// index.html, public/manifest.webmanifest and package.json state this app's identity
// in files no ES module can import, so src/config/league.js cannot be their source.
// The pre-paint theme script in particular MUST stay a blocking classic script: a
// `type="module"` script is deferred by spec, and the flash of the wrong palette it
// exists to prevent would come straight back.
//
// So the duplication stays, and this file is what makes it a CHECKED duplicate rather
// than an unreachable one. The sibling that already had a league config shows why this
// is worth having: the-nfl-schedule declares themeColor '#0b1220' while its index.html
// and manifest both ship '#15171b', and nothing has ever noticed.
//
// The storage prefix has a second reason to be here. test/guards.test.js matches
// storage keys with a single-quoted-literal regex, so it can only see the one in
// index.html, and it checks that against the family registry. Tying the config to
// index.html closes the chain: registry <- index.html <- LEAGUE.storageKey.
const ROOT = join(import.meta.dirname, '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')

describe('the browser chrome agrees with src/config/league.js', () => {
  const html = read('index.html')

  it('titles the page with the app name and its tagline', () => {
    const title = html.match(/<title>([^<]+)<\/title>/)[1]
    expect(title).toBe(`${LEAGUE.title} — ${LEAGUE.tagline}`)
  })

  it('paints one background color across the page, the browser UI and the manifest', () => {
    // Dark is the family default, so the bare :root block carries the shipped color.
    const cssBg = read('src/index.css').match(/--bg:\s*(#[0-9a-f]{6})/i)[1].toLowerCase()
    const meta = html.match(/<meta\s+name="theme-color"\s+content="(#[0-9a-f]{6})"/i)[1]
    const manifest = JSON.parse(read('public/manifest.webmanifest'))

    expect(cssBg).toBe(LEAGUE.themeColor.toLowerCase())
    expect(meta.toLowerCase()).toBe(LEAGUE.themeColor.toLowerCase())
    expect(manifest.theme_color.toLowerCase()).toBe(LEAGUE.themeColor.toLowerCase())
    expect(manifest.background_color.toLowerCase()).toBe(LEAGUE.themeColor.toLowerCase())
  })

  it('reads the theme from this app own storage prefix before paint', () => {
    const key = html.match(/localStorage\.getItem\('([^']+)'\)/)[1]
    expect(key).toBe(`${LEAGUE.storageKey}:theme`)
  })

  it('names the installed app with the full product title', () => {
    // The manifest's `name` is what a phone shows under the icon, so it is the full
    // title, not LEAGUE.name (which is the short league label used in body copy).
    expect(JSON.parse(read('public/manifest.webmanifest')).name).toBe(LEAGUE.title)
  })

  it('ships under the slug the .ics identity is built from', () => {
    // package.json name, the .ics UID domain, the PRODID and the Netlify feed host are
    // four spellings of one deploy slug. They must not drift apart.
    //
    // ics.filenameBase is deliberately NOT the slug here: a subscriber sees the
    // downloaded file, not the repo, so it is the short league name. That is a
    // decision, so it is asserted rather than left to drift.
    const slug = JSON.parse(read('package.json')).name
    expect(LEAGUE.ics.domain).toBe(slug)
    expect(LEAGUE.ics.prodId).toBe(`-//${slug}//EN`)
    expect(LEAGUE.feedHost).toBe(`https://${slug}.netlify.app`)
    expect(LEAGUE.ics.filenameBase).toBe('wnba')
  })
})
