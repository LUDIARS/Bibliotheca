import type { Context } from 'hono';

export class GlabBodyError extends Error {
  constructor(readonly status: 400 | 408 | 413) { super('Delegated body is invalid'); }
}

/** Capture once, then replay the exact authorized bytes to the existing parser.
 * @implements SPEC-BB-GLAB-SCOPED-DELEGATION-001
 */
export async function captureGlabBody(c: Context): Promise<Uint8Array> {
  const request = c.req.raw;
  const maximum = request.method === 'POST' ? 64 * 1024 : 0;
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximum)) throw new GlabBodyError(413);
  if (request.signal.aborted) throw new GlabBodyError(408);
  if (!request.body) return new Uint8Array();
  if (request.bodyUsed || Object.keys(c.req.bodyCache).length) throw new GlabBodyError(400);
  const reader = request.body.getReader();
  let cancellation: Promise<void> | undefined;
  let ended = false;
  let cancelled = false;
  const cancel = (): Promise<void> => {
    cancelled = true;
    // The single underlying cancellation owns reader shutdown on every path.
    return cancellation ??= reader.cancel().catch(() => { /* failed input is being discarded */ });
  };
  const onAbort = (): void => { void cancel(); };
  request.signal.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(onAbort, 15_000);
  timer.unref?.();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    if (request.signal.aborted) onAbort();
    while (true) {
      const part = await reader.read();
      if (cancelled) throw new GlabBodyError(408);
      if (part.done) { ended = true; break; }
      length += part.value.byteLength;
      if (length > maximum) throw new GlabBodyError(413);
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    if (request.method === 'POST') c.req.raw = new Request(request, { body: bytes, duplex: 'half' } as RequestInit);
    return bytes;
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', onAbort);
    if (!ended || cancellation) await cancel();
    reader.releaseLock();
  }
}
