import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const theme = readFileSync(new URL('../../src/features/companion/poster-theme.css', import.meta.url), 'utf8');
const base = readFileSync(new URL('../../src/features/companion/companion.css', import.meta.url), 'utf8');
const palette = (source) => Object.fromEntries([...source.matchAll(/--([\w-]+):\s*(#[\da-f]{6})\s*;/gi)].map((match) => [match[1], match[2]]));
function luminance(hex) {
  const rgb = [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + .05) / (values[1] + .05);
}
for (const mode of ['light', 'dark']) {
  test(`poster theme maintains AA small-text and semantic-status contrast in ${mode} mode`, () => {
    const light = { ...palette(base.split('html, body')[0]), ...palette(theme.slice(0, theme.indexOf('.tc-companion {'))) };
    const colors = mode === 'dark' ? { ...light, ...palette(theme.split('@media (prefers-color-scheme: dark)')[1].split('.tc-companion {')[0]) } : light;
    for (const text of ['ink', 'ink-soft', 'text', 'muted']) {
      for (const background of ['paper', 'paper-2', 'surface']) {
        assert.ok(contrast(colors[text], colors[background]) >= 4.5, `${text} on ${background}`);
      }
    }
    assert.ok(contrast(colors['on-ink'], colors.ink) >= 4.5, 'button text');
    for (const tone of ['good', 'warn', 'stop', 'neutral']) {
      assert.ok(contrast(colors[tone], colors[`${tone}-bg`]) >= 4.5, `${tone} status`);
    }
  });
}
