/** Read injected configuration without fetching secrets or loading local files. */
export function requireEnv(
  name: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
