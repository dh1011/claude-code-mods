// `end`: the line index of the closing fence.
export type Fence = { lang: string; code: string; end: number }

type Open = { indent: number; mark: string; lang: string; body: string[] }

// Closed fenced blocks (``` or ~~~) in a markdown text; an unclosed one
// (a reply still streaming) is left out.
export function fences(text: string): Fence[] {
  const out: Fence[] = []
  let open: Open | null = null

  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (open === null) {
      const m = /^(\s*(?:(?:[-*+]|\d+[.)])\s+)?)(`{3,}|~{3,})\s*([^\s`]*)/.exec(line)
      if (m) open = { indent: (m[1] ?? '').length, mark: m[2] ?? '```', lang: m[3] ?? '', body: [] }
      continue
    }
    const close = /^\s*(`{3,}|~{3,})\s*$/.exec(line)?.[1]
    if (close !== undefined && close[0] === open.mark[0] && close.length >= open.mark.length) {
      out.push({ lang: open.lang, code: open.body.join('\n'), end: i })
      open = null
      continue
    }
    const pad = (/^ */.exec(line)?.[0] ?? '').length
    open.body.push(line.slice(Math.min(pad, open.indent)))
  }
  return out
}
