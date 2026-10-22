import type { SignOptions } from 'jsonwebtoken';

const jwtSecret = process.env.JWT_SECRET ?? (() => {
  throw new Error('JWT_SECRET is required');
})();

// jsonwebtoken types the TTL as its own literal union; a validated env string
// cannot be narrowed to it at compile time.
export const AUTH_TOKEN_TTL = (process.env.JWT_TTL || '7d') as SignOptions['expiresIn'];

export type AuthTokenPayload = {
  id: string;
  username: string;
  name: string;
  color?: string | null;
  householdId?: string | null;
};

export function getJwtSecret() {
  return jwtSecret;
}
