export function normalizeCollectionVisibility(value) {
  return value === "public" ? "public" : "private";
}

export function collectionFollowerLabel(count) {
  const value = Math.max(0, Number(count) || 0);
  return `${value} ${value === 1 ? "seguidor" : "seguidores"}`;
}

export function collectionBookLabel(count) {
  const value = Math.max(0, Number(count) || 0);
  return `${value} ${value === 1 ? "libro" : "libros"}`;
}
