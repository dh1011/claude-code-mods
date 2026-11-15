import { test, expect } from 'claude-code/testing'
import { fences } from './fences'

test('finds closed blocks, skips an unclosed one', () => {
  const t = 'Hi\n```bash\nls -la\necho hi\n```\ntext\n~~~\nplain\n~~~\n```py\nstill streaming'
  expect(fences(t)).toEqual([
    { lang: 'bash', code: 'ls -la\necho hi', end: 4 },
    { lang: '', code: 'plain', end: 8 },
  ])
})

test('strips list indentation', () => {
  expect(fences('1. Run:\n   ```sh\n   make\n   ```')).toEqual([{ lang: 'sh', code: 'make', end: 3 }])
})
