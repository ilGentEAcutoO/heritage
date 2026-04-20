/**
 * Unit tests for the production-seed guard in scripts/seed-demo.ts.
 *
 * The guard is a pure function (assertRemoteConsent) that accepts injected
 * argv, env, isTTY, and prompt dependencies so it can be tested without
 * touching any real database or readline stream.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { assertRemoteConsent } from '../../scripts/seed-demo';

const noopPrompt = async (_q: string) => '';

describe('assertRemoteConsent', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number | string | null) => {
      throw new Error(`process.exit(${_code})`);
    });
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  // --local path — guard is a no-op
  it('does nothing when --remote is absent', async () => {
    await expect(
      assertRemoteConsent(['node', 'seed-demo.ts', '--local'], {}, false, noopPrompt),
    ).resolves.toBeUndefined();
  });

  it('does nothing when no flag is passed', async () => {
    await expect(
      assertRemoteConsent(['node', 'seed-demo.ts'], {}, false, noopPrompt),
    ).resolves.toBeUndefined();
  });

  // CONFIRM=yes bypasses prompt
  it('passes when CONFIRM=yes is set (non-TTY)', async () => {
    await expect(
      assertRemoteConsent(['node', 'seed-demo.ts', '--remote'], { CONFIRM: 'yes' }, false, noopPrompt),
    ).resolves.toBeUndefined();
  });

  it('passes when CONFIRM=yes is set (TTY)', async () => {
    await expect(
      assertRemoteConsent(['node', 'seed-demo.ts', '--remote'], { CONFIRM: 'yes' }, true, noopPrompt),
    ).resolves.toBeUndefined();
  });

  // Non-TTY without CONFIRM must abort
  it('calls process.exit(1) when non-TTY and CONFIRM not set', async () => {
    await expect(
      assertRemoteConsent(['node', 'seed-demo.ts', '--remote'], {}, false, noopPrompt),
    ).rejects.toThrow('process.exit(1)');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Refusing to seed production'),
    );
  });

  // TTY interactive path — correct answer
  it('passes when TTY and user answers "yes"', async () => {
    const prompt = vi.fn(async (_q: string) => 'yes');
    await expect(
      assertRemoteConsent(['node', 'seed-demo.ts', '--remote'], {}, true, prompt),
    ).resolves.toBeUndefined();
    expect(prompt).toHaveBeenCalledOnce();
  });

  // TTY interactive path — wrong answers
  it.each([['no'], ['Yes'], ['YES'], ['y'], [''], [' yes']])(
    'calls process.exit(1) when TTY and user answers "%s"',
    async (answer) => {
      const prompt = vi.fn(async (_q: string) => answer);
      await expect(
        assertRemoteConsent(['node', 'seed-demo.ts', '--remote'], {}, true, prompt),
      ).rejects.toThrow('process.exit(1)');
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Refusing to seed production'),
      );
    },
  );

  // CONFIRM set to wrong value on TTY should still prompt
  it('prompts interactively even when CONFIRM is set to wrong value on TTY', async () => {
    const prompt = vi.fn(async (_q: string) => 'no');
    await expect(
      assertRemoteConsent(['node', 'seed-demo.ts', '--remote'], { CONFIRM: 'YES' }, true, prompt),
    ).rejects.toThrow('process.exit(1)');
    expect(prompt).toHaveBeenCalledOnce();
  });
});
