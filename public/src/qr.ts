// QR コード生成 (SVG) + 印刷ラベルレイアウト helper。
//
// qrcode lib を使って文字列を SVG QR に変換する。 ラベルは「A4 縦に N x M 個」
// のグリッドを CSS だけで組み立て、 window.print() でブラウザネイティブ印刷。

import QRCode from 'qrcode';

export interface QrLabel {
  qrCode: string;
  name: string;
  spec?: string | null;
}

/** 1 つの QR を SVG 文字列で返す。 印刷時の解像度劣化を避けるため SVG 推奨。 */
export async function renderQrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 256,
  });
}

/**
 * A4 縦サイズに対して 5 列 × 8 行 = 40 個のシール台紙レイアウトで印刷ウィンドウを開く。
 * @param labels 印刷したいラベル一覧
 */
export async function openPrintWindow(labels: QrLabel[]): Promise<void> {
  const win = window.open('', '_blank');
  if (!win) {
    alert('ポップアップがブロックされました。 ブラウザ設定で許可してください。');
    return;
  }
  const cards: string[] = [];
  for (const lb of labels) {
    const svg = await renderQrSvg(lb.qrCode);
    cards.push(`
      <div class="label">
        <div class="qr">${svg}</div>
        <div class="meta">
          <div class="name">${escapeHtml(lb.name)}</div>
          ${lb.spec ? `<div class="spec">${escapeHtml(lb.spec)}</div>` : ''}
          <div class="code">${escapeHtml(lb.qrCode)}</div>
        </div>
      </div>
    `);
  }

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <title>Bibliotheca — QR Labels (${labels.length})</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; margin: 0; padding: 8mm; background: #fff; color: #000; }
    h1 { font-size: 14px; margin: 0 0 8px; color: #555; }
    .controls { margin-bottom: 8px; }
    .controls button { padding: 6px 12px; font-size: 13px; cursor: pointer; }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 4mm;
    }
    .label {
      display: flex;
      gap: 4mm;
      border: 1px dashed #bbb;
      padding: 3mm;
      page-break-inside: avoid;
      break-inside: avoid;
      min-height: 26mm;
    }
    .label .qr { width: 22mm; height: 22mm; flex: 0 0 22mm; }
    .label .qr svg { width: 100%; height: 100%; display: block; }
    .label .meta { flex: 1; min-width: 0; }
    .label .meta .name { font-weight: 700; font-size: 11pt; line-height: 1.2; word-break: break-word; }
    .label .meta .spec { font-size: 8pt; color: #555; margin-top: 1mm; word-break: break-word; }
    .label .meta .code { font-family: ui-monospace, monospace; font-size: 7pt; color: #888; margin-top: 2mm; }
    @media print {
      .controls { display: none; }
      body { padding: 4mm; }
      @page { size: A4; margin: 8mm; }
    }
  </style>
</head>
<body>
  <h1>QR Labels — ${labels.length} items</h1>
  <div class="controls">
    <button onclick="window.print()">🖨 Print</button>
    <button onclick="window.close()">Close</button>
  </div>
  <div class="grid">
    ${cards.join('\n')}
  </div>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}
