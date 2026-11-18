import { imageSrcSet, localImageInfo, localSrcSet, optimizeImage } from '@/lib/images';
import type { Image } from '@/types/api';
import { cn } from '@/lib/cn';
import { Placeholder, type PlaceholderKind } from '@/components/ui/Placeholder';

interface Props {
  seed?: number;
  kind?: PlaceholderKind;
  image: Image | null | undefined;
  sizes?: string;
  className?: string;
  eager?: boolean;
  width?: number;
}

/** Renders a real image, or abstract placeholder artwork when none has been uploaded yet. Never a stock photo. */
export function Img({
  seed = 0,
  kind,
  image,
  sizes = '(min-width: 1024px) 33vw, 50vw',
  className,
  eager,
  width = 800,
}: Props) {
  if (!image) return <Placeholder seed={seed} kind={kind} className={className} />;
  const local = localImageInfo(image.url);
  const img = (
    <img
      src={optimizeImage(image.url, width)}
      srcSet={local ? undefined : imageSrcSet(image.url)}
      sizes={sizes}
      alt={image.alt}
      width={local?.w}
      height={local?.h}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={cn('object-cover', className)}
    />
  );
  const webp = local ? localSrcSet(image.url) : undefined;
  // Local photographs: browsers that understand WebP get a right-sized copy; everyone else keeps the original file.
  return webp ? (
    <picture>
      <source type="image/webp" srcSet={webp} sizes={sizes} />
      {img}
    </picture>
  ) : (
    img
  );
}
