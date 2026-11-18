import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { uploadSignature } from '@/admin/api';
import { Img } from '@/components/ui/Img';
import type { Image } from '@/types/api';

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

/** Uploads straight to Cloudinary with a short-lived server signature; image bytes never touch our API. */
async function upload(
  file: File,
  folder: 'products' | 'categories' | 'content',
): Promise<{ url: string; publicId: string }> {
  const sig = await uploadSignature(folder);
  const body = new FormData();
  body.append('file', file);
  body.append('api_key', sig.apiKey);
  body.append('signature', sig.signature);
  for (const [k, v] of Object.entries(sig.params)) body.append(k, String(v));
  const res = await fetch(sig.uploadUrl, { method: 'POST', body });
  if (!res.ok) throw new Error('The image could not be uploaded. Check the file type and try again.');
  const json = (await res.json()) as { secure_url?: string; public_id?: string };
  if (!json.secure_url?.startsWith('https://') || !json.public_id)
    throw new Error('The image host returned an unexpected response.');
  return { url: json.secure_url, publicId: json.public_id };
}

export function ImageUploader({
  images,
  onChange,
  folder,
  max = 12,
}: {
  images: Image[];
  onChange: (next: Image[]) => void;
  folder: 'products' | 'categories' | 'content';
  max?: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const added: Image[] = [];
    try {
      for (const file of Array.from(files).slice(0, max - images.length)) {
        if (!TYPES.includes(file.type)) {
          toast.error(`${file.name}: use JPG, PNG, WebP or AVIF.`);
          continue;
        }
        if (file.size > MAX_BYTES) {
          toast.error(`${file.name} is larger than 8 MB.`);
          continue;
        }
        const { url, publicId } = await upload(file, folder);
        added.push({
          url,
          publicId,
          alt:
            file.name
              .replace(/\.[^.]+$/, '')
              .replace(/[-_]+/g, ' ')
              .slice(0, 100) || 'Product image',
        });
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
    if (added.length) onChange([...images, ...added]);
    setBusy(false);
    if (input.current) input.current.value = '';
  }
  const move = (i: number, d: -1 | 1) => {
    const n = [...images];
    const j = i + d;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j]!, n[i]!];
    onChange(n);
  };

  return (
    <div>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {images.map((img, i) => (
          <li key={img.url} className="border border-taupe p-2">
            <div className="aspect-square bg-ivory">
              <Img image={img} width={300} sizes="200px" className="h-full w-full" />
            </div>
            <label className="sr-only" htmlFor={`alt-${i}`}>
              Description of image {i + 1}
            </label>
            <input
              id={`alt-${i}`}
              className="field mt-2 !py-2 !text-[13px]"
              value={img.alt}
              maxLength={200}
              onChange={(e) => onChange(images.map((x, k) => (k === i ? { ...x, alt: e.target.value } : x)))}
            />
            <div className="mt-2 flex justify-between text-[11px] uppercase tracking-[0.12em]">
              <span>{i === 0 ? 'Main' : ''}</span>
              <span className="flex gap-3">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Move earlier"
                  className="disabled:opacity-30"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === images.length - 1}
                  aria-label="Move later"
                  className="disabled:opacity-30"
                >
                  →
                </button>
                <button
                  type="button"
                  onClick={() => onChange(images.filter((_, k) => k !== i))}
                  className="text-[#8a2f26]"
                >
                  Remove
                </button>
              </span>
            </div>
          </li>
        ))}
      </ul>
      {images.length < max && (
        <>
          <input
            ref={input}
            type="file"
            accept={TYPES.join(',')}
            multiple
            className="sr-only"
            id={`upload-${folder}`}
            onChange={(e) => onFiles(e.target.files)}
          />
          <label
            htmlFor={`upload-${folder}`}
            className={`btn-secondary mt-4 cursor-pointer ${busy ? 'pointer-events-none opacity-50' : ''}`}
          >
            {busy ? 'Uploading' : 'Upload images'}
          </label>
          <p className="mt-2 text-[12px] text-stone">
            JPG, PNG, WebP or AVIF, up to 8 MB. Describe each image for accessibility.
          </p>
        </>
      )}
    </div>
  );
}
