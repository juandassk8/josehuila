import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, checkPassword, signToken, verifyToken, randomToken, digest } from './security.mjs';
test('passwords use independent salts and reject incorrect passwords', async () => {
  const a = await hashPassword('valid-test-password');
  const b = await hashPassword('valid-test-password');
  assert.notEqual(a, b);
  assert.equal(await checkPassword('valid-test-password', a), true);
  assert.equal(await checkPassword('incorrect', a), false);
  await assert.rejects(hashPassword('short'));
});
test('JWT rejects tampering, expiry and another signing key', () => {
  const secret = randomToken();
  const token = signToken({ sub: 'user', role: 'authenticated' }, secret);
  assert.equal(verifyToken(token, secret).sub, 'user');
  assert.equal(verifyToken(token + 'x', secret), null);
  assert.equal(verifyToken(token, randomToken()), null);
  assert.equal(verifyToken(signToken({ sub: 'user' }, secret, -1), secret), null);
  assert.equal(verifyToken('eyJhbGciOiJub25lIn0.e30.', secret), null);
  assert.notEqual(digest(randomToken()), digest(randomToken()));
});
