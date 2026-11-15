// Fixed, offline demo fixtures. Import the actual hooks; never duplicate their behavior.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { register as copyCode } from '../../mods/copy-code/hooks/register'
import { register as inlineImage } from '../../mods/inline-image/hooks/register'

type Node = { type: string; props: Record<string, any>; children: any[] }
const element = (type: string) => (props: Record<string, any>): Node => {
  const { children = [], ...rest } = props
  return { type, props: rest, children }
}
const elements = Object.fromEntries(['Box', 'Text', 'Markdown', 'Button', 'Image'].map(t => [t, element(t)]))
;(globalThis as any).h = (tag: any, props: any, ...children: any[]) =>
  tag({ ...props, children: children.flat(Infinity).filter(x => x != null && x !== false) })
if (!(Uint8Array as any).fromBase64) {
  ;(Uint8Array as any).fromBase64 = (text: string) => Uint8Array.from(Buffer.from(text, 'base64'))
}

function fixture(register: any) {
  const hooks: { event: string; match: any; fn: any }[] = []
  const sleeps: (() => void)[] = []
  const state = { clipboard: '', commands: [] as string[] }
  const on = (event: string, match: any, fn?: any) => hooks.push({
    event, match: typeof match === 'function' ? {} : match, fn: fn ?? match,
  })
  const $: any = {
    ui: {
      resolve: () => elements,
      invalidate: async () => {}, log: async () => {}, toast: async () => {},
      copy: async (e: any) => {
        const result = await dispatch('ui.copy', e, async () => ({ value: { isCopied: true } }))
        return result.value ?? result
      },
    },
    clock: { sleep: () => new Promise<void>(resolve => sleeps.push(resolve)) },
    command: { register: async ({ name }: any) => { state.commands.push(name) } },
    process: { run: async (_argv: any, init: any) => {
      state.clipboard = init?.stdin ?? ''
      return { exitCode: 0, stdout: '', stderr: '' }
    } },
  }
  async function dispatch(event: string, e: any, bottom: any = async () => ({})): Promise<any> {
    const chain = hooks.filter(h => h.event === event && Object.entries(h.match).every(([k, v]) => e[k] === v))
    return chain.reduceRight((next, h) => (args: any) => h.fn($, args, next), bottom)(e)
  }
  register(on)
  return { $, dispatch, state, sleeps }
}

function walk(node: any): Node[] {
  return node && typeof node === 'object' ? [node, ...(node.children ?? []).flatMap(walk)] : []
}
const clone = (value: any) => JSON.parse(JSON.stringify(value))
const generated = join(import.meta.dir, '.generated')
const snapshotPath = join(generated, 'snapshots.json')

async function snapshots() {
  const copy = fixture(copyCode)
  await copy.dispatch('session.start', {})
  assert.deepEqual(copy.state.commands, ['copy-code'])
  const message = "Try this small example:\n\n```typescript\nconst greeting = 'Hello, mods!'\nconsole.log(greeting)\n```\n\nThen run it:\n\n```sh\nbun run app.ts\n```"
  const event = { component: 'AssistantMessage', requestId: 'sample-reply', surface: 'terminal', props: { text: message } }
  const drawCopy = () => copy.dispatch('ui.render', event, async (e: any) => element('Markdown')({ text: e.props.text }))
  const before = await drawCopy()
  assert.equal(walk(before).filter(n => n.type === 'Button').length, 2, JSON.stringify(before))
  const button = walk(before).find(n => n.type === 'Button')!
  const pressing = button.props.onPress({ surface: 'terminal' })
  for (let n = 0; copy.sleeps.length === 0 && n < 30; n++) await Bun.sleep(0)
  assert.equal(copy.sleeps.length, 1, 'copy button must enter its two-second confirmation state')
  const copied = await drawCopy()
  assert.equal(walk(copied).find(n => n.type === 'Button')?.props.label, '✓ Copied typescript')
  assert.equal(copy.state.clipboard, "const greeting = 'Hello, mods!'\nconsole.log(greeting)")
  const firstClipboard = copy.state.clipboard
  copy.sleeps.splice(0).forEach(resolve => resolve())
  await pressing
  const reset = await drawCopy()
  assert.equal(walk(reset).find(n => n.type === 'Button')?.props.label, '⧉ Copy typescript')
  const command = await copy.dispatch('command.run', { command: 'copy-code', args: '2' })
  assert.equal(command.text, 'Copied block 2: sh (1 line)')
  assert.equal(copy.state.clipboard, 'bun run app.ts')

  const image = fixture(inlineImage)
  const png = readFileSync(join(generated, 'palette.png')).toString('base64')
  const imageTree = await image.dispatch('ui.render', {
    component: 'ToolUse', surface: 'terminal', viewport: { columns: 84, rows: 28 },
    props: { tool: 'Read', input: { file_path: 'examples/palette.png' }, isRunning: false, isErrored: false,
      output: { type: 'image', file: { base64: png, type: 'image/png' } } },
  }, async () => element('Text')({ children: ['Read(examples/palette.png)'] }))
  const actualImage = walk(imageTree).find(n => n.type === 'Image')!
  assert.equal(actualImage.props.source.png, png)
  assert.equal(actualImage.props.alt, '[palette.png]')
  assert.ok(actualImage.props.columns <= 64 && actualImage.props.rows <= 24)

  writeFileSync(snapshotPath, JSON.stringify({
    copy: { before: clone(before), copied: clone(copied), reset: clone(reset), command: command.text,
      firstClipboard, secondClipboard: copy.state.clipboard },
    image: clone(imageTree),
  }, null, 2) + '\n')
  console.log('Demo fixtures verified: real button states, copied blocks, and image payload.')
}

const color = (n: number, s: string) => `\x1b[${n}m${s}\x1b[0m`
function markdown(text: string): string[] {
  let code = false
  return text.split('\n').map(line => {
    if (line.startsWith('```')) {
      code = !code
      return color(90, code ? `  ┌─ ${line.slice(3)}` : '  └────────────────────────────────────')
    }
    return code ? color(36, `  │ ${line}`) : line
  })
}
function lines(node: any): string[] {
  if (typeof node === 'string') return [node]
  if (!node) return []
  if (node.type === 'Markdown') return markdown(node.props.text)
  if (node.type === 'Button') return ['  ' + color(node.props.dimColor ? 90 : 32, `[ ${node.props.label} ]`)]
  return (node.children ?? []).flatMap(lines)
}
function paint(title: string, content: string[], note: string) {
  const body = [color(1, title), color(90, '─'.repeat(74)), '', ...content]
  while (body.length < 21) body.push('')
  process.stdout.write('\x1b[?25l\x1b[2J\x1b[H' + body.join('\r\n') + '\r\n' + color(90, note))
}
async function record(name: string) {
  const data = JSON.parse(readFileSync(snapshotPath, 'utf8'))
  if (name === 'copy-code') {
    const note = 'Scripted preview · actual mod hooks · mock clipboard'
    paint('copy-code', lines(data.copy.before), note)
    await Bun.sleep(2500)
    paint('copy-code', [...lines(data.copy.copied), '', color(32, 'Block 1 copied to the fixture clipboard.')], note)
    await Bun.sleep(2500)
    paint('copy-code', [...lines(data.copy.reset), '', color(35, '❯ /copy-code 2'), data.copy.command], note)
  } else throw new Error(`Unknown demo: ${name}`)
  await Bun.sleep(4500)
  process.stdout.write('\x1b[?25h')
}

if (process.argv[2] === 'snapshots') await snapshots()
else await record(process.argv[2])
