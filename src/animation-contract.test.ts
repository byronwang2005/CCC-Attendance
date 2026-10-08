// Visual geometry, computed styles, and motion preferences are verified in
// tests/browser/glass.spec.ts. Keep only the entry-point sharing contract here.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('shared material entry points', () => {
  it.each(['src/main.tsx', 'src/404.tsx'])('%s loads the shared environment and stylesheet', path => {
    const source = readFileSync(path, 'utf8');
    expect(source).toContain('GlassEnvironment');
    expect(source).toContain("'./features/glass/glass.css'");
  });
});
