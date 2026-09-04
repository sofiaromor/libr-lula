function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("es")
    .trim();
}

export function normalizeShelfScore(value) {
  const score = Number(value);
  return Number.isInteger(score) && score >= 1 && score <= 5 ? score : 0;
}

export function formatShelfScore(value) {
  const score = normalizeShelfScore(value);
  return score ? `${score}/5` : "Sin puntuar";
}

export function filterShelfItems(items, { query = "", score = "all" } = {}) {
  const normalizedQuery = normalizeText(query);
  const normalizedFilter = ["all", "unrated", "1", "2", "3", "4", "5"].includes(String(score))
    ? String(score)
    : "all";

  return (items || []).filter((item) => {
    const book = item?.book || {};
    const searchableText = normalizeText(`${book.title || ""} ${book.author || ""}`);
    const itemScore = normalizeShelfScore(item?.score);

    if (normalizedQuery && !searchableText.includes(normalizedQuery)) return false;
    if (normalizedFilter === "unrated") return itemScore === 0;
    if (normalizedFilter !== "all") return itemScore === Number(normalizedFilter);
    return true;
  });
}
