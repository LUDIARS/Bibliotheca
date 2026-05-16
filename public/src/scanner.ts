// カメラスキャナ — ZXing で ISBN (EAN-13 / EAN-8) と QR を読む。
// 1 つの BrowserMultiFormatReader を再利用してスタート/ストップする。

import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

export type ScanMode = 'book' | 'qr';

let reader: BrowserMultiFormatReader | null = null;
let activeStream: MediaStream | null = null;

function makeReader(mode: ScanMode): BrowserMultiFormatReader {
  const hints = new Map<DecodeHintType, unknown>();
  const formats: BarcodeFormat[] =
    mode === 'book'
      ? [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A]
      : [BarcodeFormat.QR_CODE];
  hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
  return new BrowserMultiFormatReader(hints);
}

export async function startScan(
  video: HTMLVideoElement,
  mode: ScanMode,
  onResult: (text: string) => void,
): Promise<void> {
  await stopScan();
  reader = makeReader(mode);
  await reader.decodeFromVideoDevice(undefined, video, (result) => {
    if (result) {
      const text = result.getText();
      onResult(text);
    }
  });
  // BrowserMultiFormatReader は内部で stream を持つが、 cancel 用に保持する
  activeStream = (video.srcObject as MediaStream | null) ?? null;
}

export async function stopScan(): Promise<void> {
  if (reader) {
    try {
      // @ts-expect-error — reset API は version によって名前が違う
      if (typeof reader.reset === 'function') reader.reset();
    } catch {
      // ignore
    }
    reader = null;
  }
  if (activeStream) {
    for (const t of activeStream.getTracks()) t.stop();
    activeStream = null;
  }
}
