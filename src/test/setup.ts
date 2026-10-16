import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// waitFor/findBy default to 1s, which flakes under a full parallel run.
configure({ asyncUtilTimeout: 4000 });

// jsdom has no layout: ProseMirror asks ranges for rects when it scrolls the
// selection into view. Empty rects are enough for tests.
if (typeof Range !== 'undefined' && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = function () { return [] as unknown as DOMRectList; };
  Range.prototype.getBoundingClientRect = function () { return new DOMRect(); };
}

// jsdom has no ResizeObserver; Radix controls (Switch, Select…) measure
// themselves with it. Many files stubbed it one by one; every test gets it.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
