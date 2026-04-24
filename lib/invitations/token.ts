import { createHash, randomBytes } from "crypto";

export function generateInviteToken(size = 32): string {
  return randomBytes(size).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
