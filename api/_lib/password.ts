// ============================================================
// api/_lib/password.ts — bcrypt hashing, compatible with the existing
// PHP `password_hash()` / `password_verify()` hashes already stored in the
// database, so migrated users can log in with their existing password
// without a forced reset.
//
// PHP's password_hash() (PASSWORD_BCRYPT/PASSWORD_DEFAULT) produces hashes
// prefixed "$2y$". bcryptjs produces/expects "$2a$" or "$2b$". These are the
// same algorithm — "$2y$" is PHP's own marker for its (correct) handling of
// the bcrypt spec — so hashes are interchangeable once the prefix is
// normalized. This is the standard, widely-used compatibility shim.
// ============================================================

import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10; // matches PHP's PASSWORD_DEFAULT cost at the time this schema.sql was written

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, storedHash: string): Promise<boolean> {
  const normalized = storedHash.startsWith("$2y$")
    ? "$2b$" + storedHash.slice(4)
    : storedHash;
  return bcrypt.compare(plain, normalized);
}
