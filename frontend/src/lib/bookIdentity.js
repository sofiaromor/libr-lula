const EDITION_WORDS = [
  "edicion",
  "edition",
  "especial",
  "limitada",
  "ilustrada",
  "coleccionista",
  "aniversario",
  "tapa dura",
  "tapa blanda",
  "bolsillo",
  "rustica",
  "cartone",
  "hardcover",
  "paperback",
  "mass market",
  "ebook",
  "e book",
  "audiolibro",
  "audio book",
  "kindle",
  "cantos pintados",
];

function text(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

export function normalizedIdentity(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("es-ES")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

export function normalizedAuthorIdentity(value) {
  const clean = normalizedIdentity(value).replace(/^(?:por|by)\s+/u, "");
  const tokens = clean.split(" ").filter(Boolean);

  return tokens.length > 1 ? [...tokens].sort().join(" ") : clean;
}

export function hasEditionMarker(value) {
  const clean = normalizedIdentity(value);
  return EDITION_WORDS.some((word) => clean.includes(word));
}

export function deriveBaseTitle(title, explicitBase = "") {
  const preferred = text(explicitBase);
  if (preferred) return preferred;

  let result = text(title);
  if (!result) return "";

  result = result.replace(
    /\s*(?:\(([^)]{1,120})\)|\[([^\]]{1,120})\])\s*$/u,
    (match, roundContent, squareContent) => {
      const content = roundContent || squareContent;
      const normalizedContent = normalizedIdentity(content);
      const isSeriesMarker =
        /(?:^| )(?:saga|serie|libro|book|volumen|volume)(?: |$)/u.test(normalizedContent) ||
        /#\s*\d/u.test(content);

      return hasEditionMarker(content) || isSeriesMarker ? "" : match;
    },
  );

  const separatorMatch = result.match(/^(.*?)(?:\s+[-–—|:]\s+)([^-–—|:]{2,120})$/u);
  if (separatorMatch && hasEditionMarker(separatorMatch[2])) {
    result = separatorMatch[1];
  }

  result = result.replace(
    /\s+(?:ed\.?|edicion|edition)\s+(?:especial|limitada|ilustrada|coleccionista|aniversario|de bolsillo|en tapa dura|en tapa blanda).*$/iu,
    "",
  );

  return text(result) || text(title);
}

export function workIdentityKey(title, author, explicitBase = "") {
  const baseTitle = deriveBaseTitle(title, explicitBase);
  const normalizedTitle = normalizedIdentity(baseTitle);
  const normalizedAuthor = normalizedAuthorIdentity(author);

  return normalizedTitle && normalizedAuthor
    ? `${normalizedTitle}::${normalizedAuthor}`
    : "";
}

function tokenSet(value) {
  return new Set(normalizedIdentity(value).split(" ").filter(Boolean));
}

export function titleSimilarity(left, right) {
  const a = tokenSet(left);
  const b = tokenSet(right);

  if (a.size === 0 || b.size === 0) return 0;

  let common = 0;
  for (const token of a) {
    if (b.has(token)) common += 1;
  }

  return (2 * common) / (a.size + b.size);
}
