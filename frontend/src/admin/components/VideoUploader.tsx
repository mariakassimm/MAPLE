import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { uploadSignature } from '@/admin/api';
import type { Image } from '@/types/api';

const MAX_BYTES = 60 * 1024 * 1024;
const TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

/** Uploads straight to Cloudinary with a short-lived server signature (video bytes never touch our API). */
async function upload(file: File, onProgress: (pct: number) => void): Promise<{ url: string; poster: string }> {
  const sig = await uploadSignature('content', 'video');
  const body = new FormData();
  body.append('file', file);
  body.append('api_key', sig.apiKey);
  body.append('signature', sig.signature);
  for (const [k, v] of Object.entries(sig.params)) body.append(k, String(v));
  const json = await new Promise<{ secure_url?: string; public_id?: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', sig.uploadUrl);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      try {
        xhr.status < 300 ? resolve(JSON.parse(xhr.responseText)) : reject(new Error('upload'));
      } catch {
        reject(new Error('upload'));
      }
    };
    xhr.onerror = () => reject(new Error('upload'));
    xhr.send(body);
  }).catch(() => {
    throw new Error('The video could not be uploaded. Check the file type and size, then try again.');
  });
  if (!json.secure_url?.startsWith('https://')) throw new Error('The video host returned an unexpected response.');
  // Cloudinary converts on the fly: phone recordings (.mov / HEVC) are delivered as widely playable H.264 .mp4,
  // and a still frame from the first second makes a poster image.
  const base = json.secure_url.replace(/\.[^./]+$/, '');
  const url = `${base.replace('/video/upload/', '/video/upload/f_mp4,vc_h264,q_auto/')}.mp4`;
  const poster = `${base.replace('/video/upload/', '/video/upload/so_1,w_1600,q_auto/')}.jpg`;
  return { url, poster };
}

export function VideoUploader({
  url,
  onChange,
}: {
  url: string | null;
  onChange: (url: string | null, poster?: Image) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);

  async function onFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!TYPES.includes(file.type)) {
      toast.error('Use an MP4, WebM or MOV video.');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('That video is larger than 60 MB. Trim or compress it first.');
      return;
    }
    setBusy(true);
    setPct(0);
    try {
      const r = await upload(file, setPct);
      onChange(r.url, { url: r.poster, alt: 'MAPLE homepage hero' });
      toast.success('Video uploaded. Remember to click Save homepage.');
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
    if (input.current) input.current.value = '';
  }

  return (
    <div>
      {url && (
        <div className="mb-4 max-w-md">
          <video
            src={url}
            muted
            loop
            playsInline
            autoPlay
            className="aspect-video w-full bg-ivory object-cover"
            aria-label="Hero video preview"
          />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="mt-2 text-[11px] uppercase tracking-[0.12em] text-[#8a2f26]"
          >
            Remove video
          </button>
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/*"
        className="sr-only"
        id="upload-hero-video"
        onChange={(e) => onFile(e.target.files)}
      />
      <label
        htmlFor="upload-hero-video"
        className={`btn-secondary cursor-pointer ${busy ? 'pointer-events-none opacity-50' : ''}`}
      >
        {busy ? `Uploading ${pct}%` : url ? 'Replace video' : 'Upload video'}
      </label>
      <p className="mt-2 text-[12px] text-stone">
        MP4, WebM or MOV, up to 60 MB. On a phone you can choose one from your gallery or record a new one.
      </p>
    </div>
  );
}
