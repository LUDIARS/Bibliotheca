// /api/me — フロントエンドが自分の identity と admin 権限を確認するための endpoint。

import { Hono } from 'hono';
import { getIdentity, requireAuth } from '../auth.ts';

export function makeMeRouter(): Hono {
  const r = new Hono();
  r.get('/', requireAuth, (c) => {
    const id = getIdentity(c);
    return c.json({
      userId: id.userId,
      displayName: id.displayName,
      role: id.role,
      isAdmin: id.isAdmin,
    });
  });
  return r;
}
