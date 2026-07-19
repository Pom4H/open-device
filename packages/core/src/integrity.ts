/** Subresource-Integrity-style sha256 digests over raw artifact bytes. */

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export async function computeIntegrity(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return `sha256-${toBase64(new Uint8Array(digest))}`;
}

export async function verifyIntegrity(
  bytes: Uint8Array,
  expected: string,
): Promise<boolean> {
  return (await computeIntegrity(bytes)) === expected;
}
