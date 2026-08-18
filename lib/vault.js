import crypto from 'node:crypto';

function key() {
  const raw = process.env.FINALIZE_VAULT_KEY || '';
  if (!raw) throw new Error('FINALIZE_VAULT_KEY is not configured');
  const buf = Buffer.from(raw, /^[A-Fa-f0-9]{64}$/.test(raw) ? 'hex' : 'base64');
  if (buf.length !== 32) throw new Error('FINALIZE_VAULT_KEY must decode to exactly 32 bytes');
  return buf;
}

export function encryptVaultPayload(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}

export function decryptVaultPayload({ ciphertext, iv, tag }) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}
