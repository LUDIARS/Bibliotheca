type Environment = Record<string, string | undefined>;

export default {
  post: (result: string, name: string, env: Environment = process.env): boolean =>
    Boolean(env[name]?.trim()) && result === env[name]?.trim(),
  postThrow: (error: unknown, name: string, env: Environment = process.env): boolean =>
    !env[name]?.trim() && error instanceof Error &&
    error.message === `Missing required environment variable: ${name}`,
};
