"""Rebuild offline README previews from actual mod-hook output. No UI automation."""
import base64
import io
import json
import os
import pathlib
import shutil
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

DEMO = pathlib.Path(__file__).resolve().parent
ROOT = DEMO.parent.parent
GENERATED = DEMO / '.generated'
MEDIA = ROOT / 'docs' / 'media'
GENERATED.mkdir(exist_ok=True)
MEDIA.mkdir(exist_ok=True)


def font(size):
    candidates = [os.environ.get('DEMO_FONT', ''), 'DejaVuSansMono.ttf',
                  'C:/Windows/Fonts/DejaVuSansMono.ttf',
                  '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
                  '/System/Library/Fonts/Menlo.ttc']
    for name in candidates:
        if not name:
            continue
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    raise SystemExit('Install DejaVu Sans Mono, or set DEMO_FONT to a monospace font file.')


def palette():
    im = Image.new('RGB', (640, 320), '#181825')
    draw = ImageDraw.Draw(im)
    draw.text((30, 24), 'A little color, right in the chat.', font=font(22), fill='#cdd6f4')
    colors = [('#cba6f7', 'lavender'), ('#89b4fa', 'blue'), ('#a6e3a1', 'green'), ('#f9e2af', 'yellow')]
    for i, (color, label) in enumerate(colors):
        x = 30 + 150 * i
        draw.rounded_rectangle((x, 82, x + 130, 238), radius=18, fill=color)
        draw.text((x, 262), label, font=font(17), fill='#a6adc8')
    im.save(GENERATED / 'palette.png')


def walk(node):
    if isinstance(node, dict):
        yield node
        for child in node.get('children', []):
            yield from walk(child)


def render_image():
    data = json.loads((GENERATED / 'snapshots.json').read_text(encoding='utf-8'))
    image_node = next(node for node in walk(data['image']) if node['type'] == 'Image')
    sample = Image.open(io.BytesIO(base64.b64decode(image_node['props']['source']['png']))).convert('RGB')
    im = Image.new('RGB', (1120, 650), '#1e1e2e')
    draw = ImageDraw.Draw(im)
    draw.text((32, 28), 'inline-image', font=font(24), fill='#cdd6f4')
    draw.line((32, 68, 1088, 68), fill='#45475a', width=1)
    row = next(node for node in walk(data['image']) if node['type'] == 'Text')
    draw.text((32, 98), ''.join(row['children']), font=font(22), fill='#cdd6f4')
    im.paste(sample, (58, 148))
    draw.text((58, 484), 'PNG preview directly under the Read result.', font=font(19), fill='#a6adc8')
    draw.text((32, 596), 'Scripted preview · actual hook output · sample PNG', font=font(18), fill='#7f849c')
    im.save(MEDIA / 'inline-image.png', optimize=True)


def record(name):
    tape = GENERATED / f'{name}.tape'
    shell = 'cmd.exe' if os.name == 'nt' else 'bash'
    tape.write_text('\n'.join([
        f'Output docs/media/{name}.gif', f'Set Shell "{shell}"',
        'Set FontFamily "DejaVu Sans Mono"', 'Set FontSize 20',
        'Set Width 1120', 'Set Height 650', 'Set Padding 28',
        'Set Framerate 12', 'Set Theme "Catppuccin Mocha"', 'Set TypingSpeed 1ms',
        'Hide',
        f'Type "bun --jsx-runtime classic --jsx-factory h docs/demos/record.ts {name}"',
        'Enter', 'Sleep 600ms', 'Show', 'Sleep 8s', 'Hide', '',
    ]), encoding='utf-8')
    subprocess.run(['vhs', str(tape)], cwd=ROOT, check=True)
    with Image.open(MEDIA / f'{name}.gif') as gif:
        if gif.n_frames < 3:
            raise SystemExit(f'{name}: recording did not produce an animation')
        # Review frame kept outside tracked media.
        gif.seek(gif.n_frames // 2)
        gif.convert('RGB').save(GENERATED / f'{name}-review.png')


if __name__ == '__main__':
    for program in ('bun', 'vhs', 'ttyd', 'ffmpeg'):
        if not shutil.which(program):
            sys.exit(f'Missing prerequisite: {program}')
    palette()
    subprocess.run(['bun', '--jsx-runtime', 'classic', '--jsx-factory', 'h', 'docs/demos/record.ts', 'snapshots'], cwd=ROOT, check=True)
    render_image()
    record('copy-code')
    print('Built docs/media/inline-image.png and copy-code.gif')
