export interface EquipmentImportItem { qr_code: string; name: string; spec: string | null }
export interface EquipmentImportPayload {
  service: 'bibliotheca'; version: 1; issuedAt: number; expiresAt: number;
  source: string; actorId: string; instructionHash: string; items: EquipmentImportItem[];
}
export interface SignedEquipmentImport { payload: string; signature: string }
export function parseEquipmentItems(value: unknown): EquipmentImportItem[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 500) throw new Error('Expected 1..500 items');
  const seen = new Set<string>();
  return value.map(item => {
    if (!item || typeof item !== 'object' || typeof item.qr_code !== 'string'
      || !/^BB-[A-Z0-9_-]{1,80}$/.test(item.qr_code) || seen.has(item.qr_code)
      || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 200
      || (item.spec != null && (typeof item.spec !== 'string' || item.spec.length > 2000))) {
      throw new Error('Invalid or duplicate equipment item');
    }
    seen.add(item.qr_code);
    return { qr_code: item.qr_code, name: item.name.trim(), spec: item.spec?.trim() || null };
  });
}
