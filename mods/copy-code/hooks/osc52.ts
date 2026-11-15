// Writes the text to the clipboard with OSC 52, straight to the terminal the
// session draws on. Child processes have no controlling terminal, so the
// script walks up its ancestors to the first one whose stdout is a tty.
const SCRIPT = String.raw`
p=$PPID; t=
while [ "$p" -gt 1 ] 2>/dev/null; do
  t=$(readlink /proc/$p/fd/1 2>/dev/null)
  case $t in /dev/pts/*|/dev/tty*) break ;; esac
  t=; p=$(cut -d' ' -f4 /proc/$p/stat 2>/dev/null) || break
done
[ -n "$t" ] || { echo "no terminal found" >&2; exit 3; }
b=$(base64 -w0) || exit 4
printf '\033]52;c;%s\007' "$b" > "$t"
`

type Run = (argv: readonly string[], init?: { stdin?: string; timeoutMs?: number }) =>
  Promise<{ exitCode: number; stderr: string }>

export async function osc52(run: Run, text: string): Promise<string | null> {
  try {
    const r = await run(['sh', '-c', SCRIPT], { stdin: text, timeoutMs: 5000 })
    return r.exitCode === 0 ? null : r.stderr.trim() || `exit ${r.exitCode}`
  } catch (err) {
    return String(err)
  }
}
