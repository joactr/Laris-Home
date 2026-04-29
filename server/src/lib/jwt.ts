const jwtSecret = process.env.JWT_SECRET ?? (() => {
  throw new Error('JWT_SECRET is required');
})();

export const AUTH_TOKEN_TTL = '7d';

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
