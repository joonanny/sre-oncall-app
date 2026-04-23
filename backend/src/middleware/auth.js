import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(new URL(process.env.JWKS_URI));

export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' });
  }

  const token = authHeader.slice(7);
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: process.env.AUTHENTIK_ISSUER,
    });
    req.user = { email: payload.email, sub: payload.sub };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
