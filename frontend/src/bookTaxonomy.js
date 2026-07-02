export const BOOK_THEMES = [
  "Amistad",
  "Amor",
  "Familia",
  "Duelo",
  "Identidad",
  "Salud mental",
  "Found family",
  "Venganza",
  "Supervivencia",
  "Guerra",
  "Política",
  "Clase social",
  "Mitología",
  "Brujería",
  "Maternidad",
  "Paternidad",
  "Madurez",
  "Segundas oportunidades",
  "Secretos",
  "Traición",
  "Justicia",
  "Poder",
  "Libertad",
  "Naturaleza",
  "Tecnología",
  "LGBTQ+",
];

export const BOOK_AUDIENCES = [
  "Infantil",
  "Juvenil",
  "New Adult",
  "Adulto",
];

export const BOOK_AESTHETICS = [
  "Cozy",
  "Dark academia",
  "Gótico",
  "Cottagecore",
  "Noir",
  "Medieval",
  "Victoriano",
  "Retro",
  "Futurista",
  "Cyberpunk",
  "Steampunk",
  "Urbano",
  "Rural",
  "Náutico",
  "Desértico",
  "Boscoso",
  "Invernal",
  "Otoñal",
  "Palaciego",
  "Bibliotecario",
];

export function taxonomyKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-ES")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseTaxonomyItems(value, maximum = 12) {
  if (!value || value === "[]") return [];

  let items = value;

  if (!Array.isArray(items)) {
    const text = String(value).trim();
    if (text.startsWith("[")) {
      try {
        const parsed = JSON.parse(text);
        items = Array.isArray(parsed) ? parsed : [text];
      } catch {
        items = text.split(/[,;|]+/u);
      }
    } else {
      items = text.split(/[,;|]+/u);
    }
  }

  const seen = new Set();
  return items
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item) => {
      const key = taxonomyKey(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maximum);
}

export function serializeTaxonomyItems(value, maximum = 12) {
  const items = parseTaxonomyItems(value, maximum);
  return items.length ? JSON.stringify(items) : "";
}

export function inferTaxonomyFromSubjects(subjects) {
  const items = parseTaxonomyItems(subjects, 30);
  const themes = [];
  const audiences = [];
  const aesthetics = [];

  function add(target, value) {
    if (!target.some((item) => taxonomyKey(item) === taxonomyKey(value))) {
      target.push(value);
    }
  }

  items.forEach((item) => {
    const text = taxonomyKey(item);

    if (/\b(friendship|amistad)\b/.test(text)) add(themes, "Amistad");
    if (/\b(family|familia)\b/.test(text)) add(themes, "Familia");
    if (/\b(grief|duelo|bereavement|loss)\b/.test(text)) add(themes, "Duelo");
    if (/\b(identity|identidad)\b/.test(text)) add(themes, "Identidad");
    if (/\b(mental health|salud mental)\b/.test(text)) add(themes, "Salud mental");
    if (/\b(mythology|mitologia)\b/.test(text)) add(themes, "Mitología");
    if (/\b(witch|witchcraft|bruja|brujeria)\b/.test(text)) add(themes, "Brujería");
    if (/\b(war|guerra)\b/.test(text)) add(themes, "Guerra");
    if (/\b(revenge|vengeance|venganza)\b/.test(text)) add(themes, "Venganza");
    if (/\b(survival|supervivencia)\b/.test(text)) add(themes, "Supervivencia");
    if (/\b(lgbt|lgbtq|queer|gay|lesbian|bisexual|transgender)\b/.test(text)) add(themes, "LGBTQ+");

    if (/\b(new adult)\b/.test(text)) add(audiences, "New Adult");
    if (/\b(young adult|juvenile|juvenil)\b/.test(text)) add(audiences, "Juvenil");
    if (/\b(children|childrens|infantil|middle grade)\b/.test(text)) add(audiences, "Infantil");

    if (/\b(dark academia)\b/.test(text)) add(aesthetics, "Dark academia");
    if (/\b(cottagecore)\b/.test(text)) add(aesthetics, "Cottagecore");
    if (/\b(cozy|cosy)\b/.test(text)) add(aesthetics, "Cozy");
    if (/\b(gothic|gotico|gotica)\b/.test(text)) add(aesthetics, "Gótico");
    if (/\b(cyberpunk)\b/.test(text)) add(aesthetics, "Cyberpunk");
    if (/\b(steampunk)\b/.test(text)) add(aesthetics, "Steampunk");
  });

  return {
    themes: themes.slice(0, 12),
    audiences: audiences.slice(0, 4),
    aesthetics: aesthetics.slice(0, 8),
  };
}
