// 複数の MasterSource を順に試す合成 adapter。 書籍は OpenBD、 機材はローカル、
// という現状の組合せをコール側からは 1 つの MasterSource として見せる。

import type {
  BookMeta,
  EquipmentMeta,
  MasterSource,
} from './source.ts';

export class CompositeMasterSource implements MasterSource {
  constructor(private readonly sources: ReadonlyArray<MasterSource>) {}

  async lookupBook(isbn: string): Promise<BookMeta | null> {
    for (const s of this.sources) {
      const hit = await s.lookupBook(isbn);
      if (hit) return hit;
    }
    return null;
  }

  async lookupEquipment(qrCode: string): Promise<EquipmentMeta | null> {
    for (const s of this.sources) {
      const hit = await s.lookupEquipment(qrCode);
      if (hit) return hit;
    }
    return null;
  }
}
