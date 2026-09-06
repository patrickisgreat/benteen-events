import { describe, expect, it } from 'vitest'
import { parseRoster } from '../shared/utils/roster'

describe('parseRoster', () => {
  it('parses a bare address', () => {
    expect(parseRoster('jordan@example.com').entries).toEqual([{ email: 'jordan@example.com', name: null }])
  })

  it('pulls the display name out of a "Name <email>" pair', () => {
    expect(parseRoster('Sam Riley <sam@example.com>').entries).toEqual([
      { email: 'sam@example.com', name: 'Sam Riley' }
    ])
  })

  it('splits on newlines, commas, and semicolons alike', () => {
    const { entries } = parseRoster('a@x.com, b@x.com; c@x.com\nd@x.com')
    expect(entries.map(e => e.email)).toEqual(['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com'])
  })

  it('keeps a comma inside a display name from splitting the entry', () => {
    expect(parseRoster('Riley, Sam <sam@example.com>').entries).toEqual([
      { email: 'sam@example.com', name: 'Riley, Sam' }
    ])
  })

  it('lowercases addresses so they match the address book normalization', () => {
    expect(parseRoster('JORDAN@Example.COM').entries[0]!.email).toBe('jordan@example.com')
  })

  it('de-duplicates repeats and keeps the first spelling, name included', () => {
    const { entries } = parseRoster('Sam <sam@x.com>\nSAM@X.COM')
    expect(entries).toEqual([{ email: 'sam@x.com', name: 'Sam' }])
  })

  it('reports unparseable fragments instead of dropping them silently', () => {
    const { entries, invalid } = parseRoster('good@x.com\nnot-an-email\nalso bad@')
    expect(entries.map(e => e.email)).toEqual(['good@x.com'])
    expect(invalid).toEqual(['not-an-email', 'also bad@'])
  })

  it('strips the quotes mail clients wrap around pasted names', () => {
    expect(parseRoster('"Sam Riley" <sam@x.com>').entries[0]!.name).toBe('Sam Riley')
  })

  it('ignores blank lines and trailing separators', () => {
    const { entries, invalid } = parseRoster('\n a@x.com ,\n\n')
    expect(entries).toEqual([{ email: 'a@x.com', name: null }])
    expect(invalid).toEqual([])
  })

  it('returns nothing for an empty box', () => {
    expect(parseRoster('   ')).toEqual({ entries: [], invalid: [] })
  })

  it('separates a bare address that runs into a named one on the same line', () => {
    const { entries } = parseRoster('bare@x.com, Sam <sam@x.com>')
    expect(entries).toEqual([
      { email: 'bare@x.com', name: null },
      { email: 'sam@x.com', name: 'Sam' }
    ])
  })

  it('parses several named pairs on one line', () => {
    const { entries } = parseRoster('Sam <sam@x.com>, Jo Rivers <jo@x.com>')
    expect(entries).toEqual([
      { email: 'sam@x.com', name: 'Sam' },
      { email: 'jo@x.com', name: 'Jo Rivers' }
    ])
  })

  it('picks up a bare address trailing a named pair', () => {
    const { entries } = parseRoster('Sam <sam@x.com>, tail@x.com')
    expect(entries).toEqual([
      { email: 'sam@x.com', name: 'Sam' },
      { email: 'tail@x.com', name: null }
    ])
  })

  it('flags a malformed address inside angle brackets', () => {
    const { entries, invalid } = parseRoster('Sam <not-an-email>')
    expect(entries).toEqual([])
    expect(invalid).toEqual(['not-an-email'])
  })
})
