const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";

export const generateResourceSlug = (name: string, fallback: string): string => {
  const base = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 70)
    .replace(/-+$/gu, "") || fallback;
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(9)), (byte) =>
    alphabet[byte % alphabet.length],
  ).join("");

  return `${base}-${suffix}`;
};
