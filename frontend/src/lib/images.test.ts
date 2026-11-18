import { describe, expect, it } from 'vitest';
import { imageSrcSet, optimizeImage } from '@/lib/images';

const url = 'https://res.cloudinary.com/demo/image/upload/v1/maple/a.jpg';
describe('image helpers', () => {
  it('adds auto format, quality and width to Cloudinary URLs', () => {
    expect(optimizeImage(url, 800)).toBe(
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_800,c_limit/v1/maple/a.jpg',
    );
  });
  it('leaves other hosts untouched', () => {
    expect(optimizeImage('https://example.com/a.jpg', 800)).toBe('https://example.com/a.jpg');
    expect(imageSrcSet('https://example.com/a.jpg')).toBeUndefined();
  });
  it('builds a srcset for Cloudinary', () => expect(imageSrcSet(url, [400, 800])).toContain('w_400'));
});

import { localImageInfo, localSrcSet } from '@/lib/images';
describe('local photographs', () => {
  it('builds a WebP srcset from the generated manifest', () => {
    const set = localSrcSet('/brand/about-bracelet.jpg');
    expect(set).toContain('/brand/about-bracelet-400.webp 400w');
    expect(set).toContain('/brand/about-bracelet-960.webp 960w');
    expect(localImageInfo('/brand/about-bracelet.jpg')).toMatchObject({ w: 960, h: 960 });
  });
  it('returns nothing for unknown images', () => expect(localSrcSet('/nope.jpg')).toBeUndefined());
});
