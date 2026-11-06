import { Hono, type MiddlewareHandler } from 'hono';
import type Database from 'better-sqlite3';
import { CompositeDelegations } from '../vendor/cernere-composite/source/delegation.js';
import type { ServiceOperationRisk } from '../vendor/cernere-composite/source/service-session.js';
import type { MasterSource } from './master/source.ts';
import { makeItemRouter } from './routes/items.ts';
import { makeLoanRouter } from './routes/loans.ts';
import { makeMeRouter } from './routes/me.ts';
import { captureGlabBody, GlabBodyError } from './glab-operation-body.ts';

export const GLAB_PREFIX = '/api/integrations/glab';
const operations: Readonly<Record<string, { action: string; risk: ServiceOperationRisk }>> = Object.freeze({
  [`GET ${GLAB_PREFIX}/items/equipment`]: { action: 'equipment.list', risk: 'read' },
  [`GET ${GLAB_PREFIX}/items/lookup`]: { action: 'items.lookup', risk: 'read' },
  [`GET ${GLAB_PREFIX}/items/books`]: { action: 'inventory.books.list', risk: 'read' },
  [`GET ${GLAB_PREFIX}/items/books/`]: { action: 'inventory.books.list', risk: 'read' },
  [`POST ${GLAB_PREFIX}/items/books`]: { action: 'inventory.books.create', risk: 'important' },
  [`POST ${GLAB_PREFIX}/items/books/`]: { action: 'inventory.books.create', risk: 'important' },
  [`GET ${GLAB_PREFIX}/me`]: { action: 'identity.self.read', risk: 'sensitive_read' },
  [`GET ${GLAB_PREFIX}/me/`]: { action: 'identity.self.read', risk: 'sensitive_read' },
  [`GET ${GLAB_PREFIX}/loans/mine`]: { action: 'loans.own.read', risk: 'sensitive_read' },
  [`POST ${GLAB_PREFIX}/loans`]: { action: 'loans.create', risk: 'important' },
  [`POST ${GLAB_PREFIX}/loans/`]: { action: 'loans.create', risk: 'important' },
});

/** Only the current delegated subject may use these self-service endpoints.
 * No role, borrower, source project or capability is accepted from the body.
 * @implements SPEC-BB-GLAB-SCOPED-DELEGATION-001
 */
export function glabAuthentication(delegations: CompositeDelegations, adminIds: ReadonlySet<string>): MiddlewareHandler {
  return async (c, next) => {
    const url = new URL(c.req.url);
    const operation = operations[`${c.req.method} ${url.pathname}`];
    if (!operation) return c.json({ error: 'unclassified_glab_operation' }, 403);
    const authorization = c.req.header('authorization') ?? '';
    const token = authorization.startsWith('Cernere-Delegation ') ? authorization.slice(19) : '';
    const requestId = c.req.header('x-cernere-request-id');
    if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !requestId || requestId.length > 128
      || requestId.includes(',') || c.req.header('cookie')) return c.json({ error: 'scoped_delegation_required' }, 401);
    let executing = false;
    try {
      const body = await captureGlabBody(c);
      const path = url.pathname + url.search;
      await delegations.run(token, { ...operation, method: c.req.method as 'GET' | 'POST',
        path, resource: path, headers: new Headers(c.req.raw.headers), requestId, body }, {
        risk: operation.risk,
        authorizeResource: decision => !c.req.raw.signal.aborted && decision.sourceProject === 'glab'
          && decision.projectKey === 'bibliotheca' && decision.user.id.trim().length > 0,
        execute: async decision => {
          if (c.req.raw.signal.aborted) throw new GlabBodyError(408);
          c.set('auth', { userId: decision.user.id, displayName: decision.user.displayName,
            role: decision.user.role, projectKey: decision.projectKey, isAdmin: adminIds.has(decision.user.id) });
          c.header('Cache-Control', 'private, no-store');
          executing = true;
          await next();
        },
      });
    } catch (error) {
      // Once execution starts, an application/DB failure keeps its original meaning.
      if (executing) throw error;
      if (error instanceof GlabBodyError) return c.json({ error: 'invalid_delegated_body' }, error.status);
      return c.json({ error: 'current_delegation_unconfirmed' }, 503);
    }
  };
}

/** The shared routers receive this middleware directly; legacy auth is never chained.
 * @implements SPEC-BB-GLAB-SCOPED-DELEGATION-001
 */
export function makeGlabRouter(db: Database.Database, master: MasterSource,
  delegations: CompositeDelegations, adminIds: ReadonlySet<string>): Hono {
  const router = new Hono();
  const authenticate = glabAuthentication(delegations, adminIds);
  router.route('/items', makeItemRouter(db, master, authenticate, row => ({
    qr_code: row.qr_code, name: row.name, spec: row.spec, added_at: row.added_at,
  })));
  router.route('/loans', makeLoanRouter(db, master, authenticate, { includeConflictRecord: false }));
  router.route('/me', makeMeRouter(authenticate));
  router.all('*', c => c.json({ error: 'unclassified_glab_operation' }, 403));
  return router;
}
