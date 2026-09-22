// utils/crypto.js
// AES-256-GCM helpers for anything genuinely sensitive we store (right now:
// bill portal credentials — emails/phones/passwords for ISP/electricity
// portals). Everything else in this app stays plain — this is only for
// that one drawer of secrets.
//
// The key comes from process.env.ENCRYPTION_KEY. It can be any string —
// we run it through SHA-256 so we always end up with a proper 32-byte
// AES-256 key regardless of what the operator pastes in. Ciphertext is
// stored as a single string: "<iv>:<authTag>:<data>" (all base64) so it's
// one NVARCHAR column, nothing fancy at the DB layer.
const crypto = require('crypto');

const ALGO = 'aes-256-gcm';

function getKey() {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    // Mirrors the JWT_SECRET warning pattern in server.js — the app still
    // runs, but credential storage won't be safe until this is set.
    throw new Error('ENCRYPTION_KEY is not set — add a long random value to .env before saving credentials.');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

// encrypt(plainText) -> "iv:tag:ciphertext" (base64 each), or null for null/empty input
function encrypt(plainText) {
  if (plainText === null || plainText === undefined || plainText === '') return null;
  const key = getKey();
  const iv = crypto.randomBytes(12); // 96-bit IV is the GCM standard
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

// decrypt("iv:tag:ciphertext") -> plainText, or null if input is null/malformed
function decrypt(payload) {
  if (!payload) return null;
  const parts = String(payload).split(':');
  if (parts.length !== 3) return null;
  try {
    const key = getKey();
    const [ivB64, tagB64, dataB64] = parts;
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    return null; // wrong key / tampered / corrupt — never leak a stack trace to the client
  }
}

module.exports = { encrypt, decrypt };
