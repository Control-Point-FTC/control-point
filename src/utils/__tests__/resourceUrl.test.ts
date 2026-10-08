import { describe, it, expect } from 'vitest';
import { resourceKey, splitDuplicates } from '../resourceUrl';

describe('resource duplicate keys', () => {
  it('treats the same page as one link', () => {
    const k = resourceKey('https://www.gm0.org/en/latest/');
    for (const u of ['http://gm0.org/en/latest', 'https://gm0.org/en/latest/#tuning', 'https://www.gm0.org/en/latest?utm_source=discord&fbclid=1']) expect(resourceKey(u)).toBe(k);
    expect(resourceKey('https://gm0.org/en/stable')).not.toBe(k);
    // Parameters that change the page stay, in any order.
    expect(resourceKey('https://x.com/a?b=2&a=1')).toBe(resourceKey('https://x.com/a?a=1&b=2'));
    expect(resourceKey('https://x.com/a?id=1')).not.toBe(resourceKey('https://x.com/a?id=2'));
  });

  it('every YouTube link form names the same video', () => {
    const k = resourceKey('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    for (const u of ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=30', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'https://youtube.com/shorts/dQw4w9WgXcQ']) expect(resourceKey(u)).toBe(k);
  });

  it('splits new links from duplicates of the library and of each other', () => {
    const items = [{ url: 'https://gm0.org' }, { url: 'https://a.com/x' }, { url: 'https://www.a.com/x/' }, { url: 'https://b.com' }];
    const { fresh, duplicates } = splitDuplicates(items, ['https://www.gm0.org/']);
    expect(fresh.map((i) => i.url)).toEqual(['https://a.com/x', 'https://b.com']);
    expect(duplicates.map((i) => i.url)).toEqual(['https://gm0.org', 'https://www.a.com/x/']);
  });
});
