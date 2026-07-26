export interface InternalAuthEnv {
  INTERNAL_JOB_TOKEN?: string;
  APP_ENV?: string;
}

export class InternalAuthError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function constantTimeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;

  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a[index] ^ b[index];
  }
  return mismatch === 0;
}

export function requireInternalJobToken(
  request: Request,
  env: InternalAuthEnv,
) {
  const expected = env.INTERNAL_JOB_TOKEN?.trim();
  if (!expected) {
    throw new InternalAuthError(
      503,
      "INTERNAL_AUTH_NOT_CONFIGURED",
      "Internal operations are not configured.",
    );
  }

  const authorization = request.headers.get("authorization") || "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!supplied || !constantTimeEqual(supplied, expected)) {
    throw new InternalAuthError(
      401,
      "INTERNAL_AUTH_REQUIRED",
      "Internal authorization is required.",
    );
  }
}
