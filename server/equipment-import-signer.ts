import { createHash, createPrivateKey, sign } from 'node:crypto';
import { parseEquipmentItems, type SignedEquipmentImport, type EquipmentImportPayload } from './equipment-import-contract.ts';

/** @implements SPEC-BB-EXECUTIVE-IMPORT-001 */
export async function signEquipmentImport(input: {
  items: unknown; session: string; messageId: number; ccUrl: string; privateKey: string; now: number;
}, read: typeof fetch = fetch): Promise<SignedEquipmentImport> {
  const url = new URL(input.ccUrl);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || url.protocol !== 'http:' || url.username || url.password || url.pathname !== '/') {
    throw new Error('Cc must be the trusted local catalog endpoint');
  }
  if (!Number.isSafeInteger(input.messageId) || input.messageId < 1 || !input.session) {
    throw new Error('Cc source reference required');
  }
  const get = async (path: string): Promise<Record<string, unknown>> => {
    const response = await read(new URL(path, url), { redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Cc evidence unavailable');
    return await response.json() as Record<string, unknown>;
  };
  const history = await get(`/v1/sessions/${encodeURIComponent(input.session)}/messages?after=${input.messageId - 1}&limit=1`);
  const messages = history.messages as Array<{ id: number; author_type: string; content: string;
    metadata?: { inject_source?: string; inject_is_cc?: boolean } }> | undefined;
  const message = messages?.find(row => row.id === input.messageId);
  const source = message?.metadata?.inject_source;
  const identity = typeof source === 'string' ? /^discord:(\d+):(\d+):(\d+)$/.exec(source) : null;
  if (!message || message.author_type !== 'user' || message.metadata?.inject_is_cc !== false
    || !identity || typeof message.content !== 'string' || !message.content.trim()) {
    throw new Error('Verified human Discord instruction required');
  }
  const roster = await get('/v1/staff?platform=discord');
  const members = roster.members as Array<{ platform_user_id: string; role: string }> | undefined;
  const actorId = identity[1]!;
  if (!members?.some(member => member.platform_user_id === actorId && member.role === 'executive')) {
    throw new Error('Instruction author is not an executive');
  }
  const payload: EquipmentImportPayload = {
    service: 'bibliotheca', version: 1, issuedAt: input.now, expiresAt: input.now + 86400,
    source: source!, actorId,
    instructionHash: createHash('sha256').update(message.content, 'utf8').digest('hex'),
    items: parseEquipmentItems(input.items),
  };
  const key = createPrivateKey(input.privateKey);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Ed25519 signing key required');
  const bytes = Buffer.from(JSON.stringify(payload), 'utf8');
  return { payload: bytes.toString('base64'), signature: sign(null, bytes, key).toString('base64') };
}
