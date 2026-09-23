import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AGENT_PROMPT, COPY_LOCK, TEXT } from './config';

describe('copy lock', () => {
  it('keeps the approved interface copy inventory unchanged', () => {
    const digest = createHash('sha256')
      .update(JSON.stringify({ copy: COPY_LOCK, agent: AGENT_PROMPT, text: TEXT }))
      .digest('hex');
    expect(digest).toBe('af9ee29596f5c2dae86cbc8d9b4ac8f5ab6963a5462df5848fbdb72ee3f9670f');
    expect(AGENT_PROMPT).toBe(
      'Please read the instruction in "https://ccc.byron.wang/agent.md" and assist the user to generate the QR code.'
    );
  });

  it('keeps the existing SEO and structured-data copy in the entry document', () => {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    expect(html).toContain('CCC Attendance是一款实用的工具。');
    expect(html).toContain('如何生成UNNC CCC签到二维码');
    expect(html).toContain('CCC Attendance是独立开源项目，不代表任何官方。');
    expect(html).toContain('一个二维码，三步搞定');
  });
});
