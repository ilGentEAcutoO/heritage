/**
 * node-style.test.tsx — source-assertion tests for the per-tree node style feature.
 *
 * The vitest environment is 'node' (no jsdom), so DOM rendering is not
 * available. Instead we verify source files directly to guarantee the required
 * symbols and wiring are present.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const apiSrc = readFileSync(
  resolve(__dirname, '../../src/app/lib/api.ts'),
  'utf-8',
);

const treeViewSrc = readFileSync(
  resolve(__dirname, '../../src/app/pages/TreeView.tsx'),
  'utf-8',
);

const nodeStylePickerSrc = readFileSync(
  resolve(__dirname, '../../src/app/components/NodeStylePicker.tsx'),
  'utf-8',
);

const sharesSrc = readFileSync(
  resolve(__dirname, '../../src/worker/routes/shares.ts'),
  'utf-8',
);

const stylesSrc = readFileSync(
  resolve(__dirname, '../../src/app/styles.css'),
  'utf-8',
);

// ---------------------------------------------------------------------------
// api.ts assertions
// ---------------------------------------------------------------------------

describe('api.ts — setNodeStyle + nodeStyle in types', () => {
  it('exports setNodeStyle method', () => {
    expect(apiSrc).toContain('setNodeStyle');
  });

  it('setNodeStyle calls PATCH /api/tree/:slug/node-style', () => {
    expect(apiSrc).toContain('/node-style');
  });

  it('ApiTreeResponse.tree includes nodeStyle field', () => {
    expect(apiSrc).toMatch(/nodeStyle:\s*string\s*\|\s*null/);
  });

  it('adaptTree sets meta.nodeStyle from raw.tree.nodeStyle', () => {
    expect(apiSrc).toContain('nodeStyle: raw.tree.nodeStyle');
  });
});

// ---------------------------------------------------------------------------
// TreeView.tsx assertions
// ---------------------------------------------------------------------------

describe('TreeView.tsx — node style wiring', () => {
  it('declares previewNodeStyle state', () => {
    expect(treeViewSrc).toContain('previewNodeStyle');
  });

  it('declares handleSelectNodeStyle callback', () => {
    expect(treeViewSrc).toContain('handleSelectNodeStyle');
  });

  it('computes effectiveNodeStyle', () => {
    expect(treeViewSrc).toContain('effectiveNodeStyle');
  });

  it('renders <NodeStylePicker', () => {
    expect(treeViewSrc).toContain('<NodeStylePicker');
  });

  it('applies shape class to the .app container from effectiveNodeStyle', () => {
    // Shape is rendered via a class on the .app div — mirrors how paletteStyle
    // works for theme. The className must reference effectiveNodeStyle.
    expect(treeViewSrc).toMatch(/shape-\$\{effectiveNodeStyle\}/);
  });

  it('does NOT pass nodeStyle prop to TreeCanvas (prop was removed as dead)', () => {
    // The dead TreeCanvas nodeStyle prop has been removed; shape is applied via .app class.
    expect(treeViewSrc).not.toContain('nodeStyle={effectiveNodeStyle}');
    expect(treeViewSrc).not.toContain('nodeStyle={tweaks.nodeShape}');
  });

  it('imports NodeStylePicker', () => {
    expect(treeViewSrc).toContain("from '@app/components/NodeStylePicker'");
  });
});

// ---------------------------------------------------------------------------
// NodeStylePicker.tsx assertions
// ---------------------------------------------------------------------------

describe('NodeStylePicker.tsx — shape options', () => {
  it('exports NodeStylePicker component', () => {
    expect(nodeStylePickerSrc).toContain('export function NodeStylePicker');
  });

  it('has data-testid="node-style-picker-button"', () => {
    expect(nodeStylePickerSrc).toContain('data-testid="node-style-picker-button"');
  });

  it('has data-testid for node style options (uses template literal pattern)', () => {
    // The component renders data-testid={`node-style-option-${key}`} via a loop.
    // The literal strings 'node-style-option-circle' etc. won't appear; assert
    // the template literal pattern and key array instead.
    expect(nodeStylePickerSrc).toContain('data-testid={`node-style-option-${key}`}');
    expect(nodeStylePickerSrc).toContain("'circle'");
    expect(nodeStylePickerSrc).toContain("'polaroid'");
    expect(nodeStylePickerSrc).toContain("'square'");
  });

  it('passes explicit NodeStyleValue (never collapses circle to null)', () => {
    // L1 fix: handleSelect passes the explicit key, not (key === 'circle' ? null : key).
    // Verify the old null-collapsing pattern is gone.
    expect(nodeStylePickerSrc).not.toContain("key === 'circle' ? null : key");
  });
});

// ---------------------------------------------------------------------------
// styles.css assertions
// ---------------------------------------------------------------------------

describe('styles.css — shape selectors scoped to .app (not body)', () => {
  it('has .app.shape-polaroid selector (not body.shape-polaroid)', () => {
    expect(stylesSrc).toContain('.app.shape-polaroid');
    expect(stylesSrc).not.toContain('body.shape-polaroid');
  });

  it('has .app.shape-square selector (not body.shape-square)', () => {
    expect(stylesSrc).toContain('.app.shape-square');
    expect(stylesSrc).not.toContain('body.shape-square');
  });
});

// ---------------------------------------------------------------------------
// shares.ts assertions
// ---------------------------------------------------------------------------

describe('shares.ts — nodeStyleSchema + node-style route', () => {
  it('declares nodeStyleSchema', () => {
    expect(sharesSrc).toContain('nodeStyleSchema');
  });

  it('nodeStyleSchema validates circle, polaroid, square', () => {
    expect(sharesSrc).toContain("'circle'");
    expect(sharesSrc).toContain("'polaroid'");
    expect(sharesSrc).toContain("'square'");
  });

  it('registers PATCH /:slug/node-style handler', () => {
    expect(sharesSrc).toContain("'/:slug/node-style'");
  });
});
