/**
 * Parsing for the host's bulk "add contacts" box. Lives in shared/ so
 * the composer's live preview and the server route that actually inserts run the
 * exact same rules — the preview can never promise something the route rejects.
 */

/** One parsed person: a normalized email and the display name, if one was given. */
export interface RosterEntry {
  readonly email: string
  readonly name: string | null
}

export interface ParsedRoster {
  /** Valid, de-duplicated entries in the order they were first seen. */
  readonly entries: readonly RosterEntry[]
  /** Fragments that looked like an address but aren't one — shown back to the admin. */
  readonly invalid: readonly string[]
}

// Deliberately strict-ish but not RFC-complete: one @, no spaces, a dotted host.
// Anything odd is surfaced as invalid rather than silently dropped.
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/

/** Every `Name <email>` pair on a line, with whatever text preceded each one. */
const PAIR_RE = /([^<>]*)<([^<>]*)>/g

const isEmail = (value: string): boolean => EMAIL_RE.test(value)

/** Trim, and strip the wrapping quotes mail clients put around pasted names. */
function cleanName(raw: string): string | null {
  const name = raw.trim().replace(/^["']|["']$/g, '').trim()
  return name || null
}

/**
 * Splits the text in front of a `<email>` into any bare addresses that ran into
 * it, plus the display name. Walking left-to-right and stopping at the first
 * segment that isn't itself an address is what lets `Riley, Sam <sam@x.com>`
 * keep its comma (neither segment is an address, so both are the name) while
 * `bare@x.com, Sam <sam@x.com>` still yields two people.
 */
function splitPrefix(prefix: string): { leading: string[], name: string | null } {
  const segments = prefix.split(',').map(s => s.trim())
  let i = 0
  const leading: string[] = []
  // Empty segments are just the separator trailing the previous pair, not a name.
  while (i < segments.length - 1 && (!segments[i] || isEmail(segments[i]!.toLowerCase()))) {
    if (segments[i]) leading.push(segments[i]!)
    i++
  }
  return { leading, name: cleanName(segments.slice(i).join(', ')) }
}

/**
 * Parse a pasted blob of recipients. Accepts newline-, comma-, and
 * semicolon-separated addresses, with or without a `Name <email>` wrapper.
 * Emails are lowercased (the `contacts` table normalizes the same way), and the
 * first spelling of a repeated address wins so its name isn't lost to a later
 * bare paste of the same person.
 */
export function parseRoster(input: string): ParsedRoster {
  const entries: RosterEntry[] = []
  const invalid: string[] = []
  const seen = new Set<string>()

  function add(rawEmail: string, name: string | null): void {
    const chunk = rawEmail.trim()
    if (!chunk) return
    const email = chunk.toLowerCase()
    if (!isEmail(email)) {
      if (!invalid.includes(chunk)) invalid.push(chunk)
      return
    }
    if (seen.has(email)) return
    seen.add(email)
    entries.push({ email, name })
  }

  const addBareList = (text: string): void => {
    for (const segment of text.split(',')) add(segment, null)
  }

  // Newlines and semicolons always separate people; a comma might be part of a
  // display name, so it's only resolved per-line (see splitPrefix).
  for (const line of input.split(/[\n\r;]+/)) {
    if (!line.trim()) continue

    let lastIndex = 0
    for (const match of line.matchAll(PAIR_RE)) {
      const { leading, name } = splitPrefix(match[1] ?? '')
      for (const bare of leading) add(bare, null)
      add(match[2] ?? '', name)
      lastIndex = match.index + match[0].length
    }
    // Text after the final pair — or the whole line when it had no pairs at all.
    addBareList(line.slice(lastIndex))
  }

  return { entries, invalid }
}
