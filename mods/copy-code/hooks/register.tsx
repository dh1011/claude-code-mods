import type { Register } from 'claude-code'
import { fences, type Fence } from './fences'
import { osc52 } from './osc52'

const trim = (s: string) => s.replace(/^\s*\n/, '').replace(/\n\s*$/, '')
const linesOf = (code: string) => {
  const n = code.split('\n').length
  return `${n} line${n === 1 ? '' : 's'}`
}

export const register: Register = on => {
  // Blocks per message, in the order messages first appeared: the last is the latest reply.
  const byMessage = new Map<string, Fence[]>()
  // Buttons showing "Copied" right now, by `${message}:${block}`.
  const copied = new Set<string>()

  // The built-in terminal copy does not reach the clipboard through herdr,
  // so terminal copies write OSC 52 to the terminal directly.
  on('ui.copy', async ($, e, next) => {
    if (e.surface !== undefined && e.surface !== 'terminal') return next(e)
    const failed = await osc52((argv, init) => $.process.run(argv, init), e.text)
    if (failed === null) return { value: { isCopied: true } }
    $.ui.log(`copy-code: direct OSC 52 failed (${failed}); trying the built-in copy`, { to: 'debug' })
    return next(e)
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'copy-code',
      description: 'Copy a code block from the latest reply (number as on its button)',
      argumentHint: '[n]',
    })
    return next(e)
  })

  on('command.run', { command: 'copy-code' }, async ($, e) => {
    const latest = [...byMessage.values()].at(-1) ?? []
    if (latest.length === 0) return { text: 'No code blocks in the latest reply.' }

    const arg = e.args.trim()
    if (arg === '' && latest.length > 1) {
      const list = latest.map((b, i) => `  ${i + 1}. ${b.lang || 'code'} (${linesOf(b.code)})`)
      return { text: `Which block? /copy-code <n>\n${list.join('\n')}` }
    }
    const n = arg === '' ? 1 : Number(arg)
    const b = latest[n - 1]
    if (!Number.isInteger(n) || b === undefined) {
      return { text: `No block ${arg}; the latest reply has ${latest.length}.` }
    }
    const r = await $.ui.copy({ text: b.code })
    return {
      text: r.isCopied
        ? `Copied block ${n}: ${b.lang || 'code'} (${linesOf(b.code)})`
        : `Copy failed: ${r.reason}`,
    }
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const text = e.props.text
    const blocks = fences(text)
    if (blocks.length === 0) return next(e)

    const id = e.requestId
    if (byMessage.has(id)) byMessage.set(id, blocks)
    else {
      byMessage.set(id, blocks)
      while (byMessage.size > 50) byMessage.delete(byMessage.keys().next().value ?? '')
    }

    const { Box, Button, Markdown } = $.ui.resolve(e)
    const lines = text.split('\n')

    // Text up to and including each closing fence, then whatever follows the last.
    const parts: string[] = []
    let from = 0
    for (const b of blocks) {
      parts.push(trim(lines.slice(from, b.end + 1).join('\n')))
      from = b.end + 1
    }
    const tail = trim(lines.slice(from).join('\n'))

    const copyButton = (b: Fence, i: number, pad: number) => {
      const name = b.lang || 'code'
      const mark = `${id}:${i}`
      const isCopied = copied.has(mark)
      return (
        <Box key={`row:${i}`} paddingLeft={pad}>
          <Button
            key={`copy:${i}`}
            label={isCopied ? `✓ Copied ${name}` : `⧉ Copy ${name}`}
            dimColor={!isCopied}
            onPress={async press => {
              const r = await $.ui.copy({ text: b.code, surface: press.surface })
              if (!r.isCopied) {
                $.ui.toast(`Copy failed: ${r.reason}`)
                return
              }
              copied.add(mark)
              $.ui.invalidate('ui.render')
              await $.clock.sleep(2000)
              copied.delete(mark)
              $.ui.invalidate('ui.render')
            }}
          />
        </Box>
      )
    }

    // The first part goes through the engine so the reply keeps its own bullet.
    const head = await next({ ...e, props: { ...e.props, text: parts[0] ?? '' } })
    const first = blocks[0]

    return (
      <Box flexDirection="column">
        {head}
        {first && copyButton(first, 0, 2)}
        {blocks.slice(1).map((b, j) => (
          <Box key={`part:${j + 1}`} flexDirection="column" paddingLeft={2} marginTop={1}>
            <Markdown text={parts[j + 1] ?? ''} />
            {copyButton(b, j + 1, 0)}
          </Box>
        ))}
        {tail !== '' && (
          <Box paddingLeft={2} marginTop={1}>
            <Markdown text={tail} />
          </Box>
        )}
      </Box>
    )
  })
}
