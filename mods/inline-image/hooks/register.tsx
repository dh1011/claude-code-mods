import type { Register } from 'claude-code'

// The Image element takes at most 2 MiB of PNG bytes; as base64 that is 4/3 as long.
const MAX_BASE64 = Math.floor((2 * 1024 * 1024 * 4) / 3)
const MAX_COLUMNS = 64
const MAX_ROWS = 24

type ReadImage = { type: 'image'; file: { base64: string; type: string } }

/** A finished Read call that returned an image, as ToolUse rows and ToolGroup calls both carry it. */
type Call = { tool: string; input: unknown; isRunning: boolean; isErrored: boolean; output?: unknown }

function isReadImage(output: unknown): output is ReadImage {
  const o = output as Partial<ReadImage> | undefined
  return o?.type === 'image' && typeof o.file?.base64 === 'string'
}

function readImageOf(call: Call): ReadImage | null {
  if (call.tool !== 'Read' || call.isRunning || call.isErrored || !isReadImage(call.output)) return null
  return call.output
}

/** Width and height from a PNG's IHDR chunk, or null when it isn't a PNG. */
function pngSize(base64: string): { width: number; height: number } | null {
  const decode = (Uint8Array as unknown as { fromBase64(s: string): Uint8Array }).fromBase64
  const head = decode(base64.slice(0, 32))
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (head.length < 24 || signature.some((b, i) => head[i] !== b)) return null
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

/** Largest box of cells that fits, keeping the picture's shape (a cell is about twice as tall as wide). */
function fit(width: number, height: number, maxCols: number, maxRows: number) {
  let columns = Math.max(1, Math.min(255, maxCols))
  let rows = Math.round((columns * height) / width / 2)
  const rowCap = Math.max(1, Math.min(255, maxRows))
  if (rows > rowCap) {
    rows = rowCap
    columns = Math.max(1, Math.min(columns, Math.round((rows * 2 * width) / height)))
  }
  return { columns, rows: Math.max(1, rows) }
}

type Plan =
  | { kind: 'image'; png: string; columns: number; rows: number; name: string }
  | { kind: 'note'; text: string }

/** What to draw for one image-returning Read call. */
function plan(call: Call, image: ReadImage, viewportColumns: number): Plan {
  const name = (call.input as { file_path?: string } | undefined)?.file_path?.split(/[\\/]/).pop() ?? 'image'
  const { base64, type } = image.file
  const size = type === 'image/png' ? pngSize(base64) : null
  if (!size) return { kind: 'note', text: `${name}: inline preview shows PNG only (this is ${type})` }
  if (base64.length > MAX_BASE64) return { kind: 'note', text: `${name}: too large to show inline` }
  const box = fit(size.width, size.height, Math.min(MAX_COLUMNS, viewportColumns - 4), MAX_ROWS)
  return { kind: 'image', png: base64, name, ...box }
}

export const register: Register = on => {
  // A call drawn as its own row: under --verbose, in ctrl+o, or an unfolded group.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const image = readImageOf(e.props)
    if (!image) return next(e)

    const row = await next(e)
    const { Box, Text, Image } = $.ui.resolve(e)
    const p = plan(e.props, image, e.viewport?.columns ?? 80)
    return (
      <Box flexDirection="column">
        {row}
        <Box paddingLeft={2}>
          {p.kind === 'image' ? (
            <Image source={{ png: p.png }} columns={p.columns} rows={p.rows} alt={`[${p.name}]`} />
          ) : (
            <Text dimColor>({p.text})</Text>
          )}
        </Box>
      </Box>
    )
  })

  // The usual case: reads folded into one line ("Read 1 file"). Keep the line, add the pictures under it.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.isExpanded) return next(e)
    const viewportColumns = e.viewport?.columns ?? 80
    const plans: Plan[] = []
    for (const call of e.props.calls) {
      const image = readImageOf(call)
      if (image) plans.push(plan(call, image, viewportColumns))
    }
    if (plans.length === 0) return next(e)

    const line = await next(e)
    const { Box, Text, Image } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {line}
        {plans.map((p, i) => (
          <Box paddingLeft={2}>
            {p.kind === 'image' ? (
              <Image key={`img-${i}`} source={{ png: p.png }} columns={p.columns} rows={p.rows} alt={`[${p.name}]`} />
            ) : (
              <Text dimColor>({p.text})</Text>
            )}
          </Box>
        ))}
      </Box>
    )
  })
}
