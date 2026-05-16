// 書籍用 source と機材用 source を dedicated slot で持つ facade。
// 呼び出し側 (routes/*) は MasterSource として両方の lookup を使う。
// generic array 方式と違い、 各 adapter は自分の領域だけ実装すればよい。

import type {
  BookMeta,
  BookSource,
  EquipmentMeta,
  EquipmentSource,
  MasterSource,
} from './source.ts';

export class CompositeMasterSource implements MasterSource {
  constructor(
    private readonly book: BookSource,
    private readonly equipment: EquipmentSource,
  ) {}

  lookupBook(isbn: string): Promise<BookMeta | null> {
    return this.book.lookupBook(isbn);
  }

  lookupEquipment(qrCode: string): Promise<EquipmentMeta | null> {
    return this.equipment.lookupEquipment(qrCode);
  }
}
