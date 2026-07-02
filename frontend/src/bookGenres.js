export const QUICK_BOOK_GENRES = ["Fantasía", "Romance", "Thriller", "Misterio"];

export const BOOK_GENRE_GROUPS = [
  {
    key: "speculative",
    label: "Fantasía y especulativa",
    genres: [
      "Fantasía",
      "Ciencia ficción",
      "Distopía",
      "Ucronía",
      "Realismo mágico",
      "Terror",
      "Paranormal",
    ],
  },
  {
    key: "crime",
    label: "Misterio, crimen y suspense",
    genres: [
      "Misterio",
      "Thriller",
      "Suspense",
      "Novela policíaca",
      "Novela negra",
      "Espionaje",
    ],
  },
  {
    key: "romance",
    label: "Romance",
    genres: ["Romance", "Novela erótica"],
  },
  {
    key: "fiction",
    label: "Narrativa",
    genres: [
      "Narrativa general",
      "Narrativa contemporánea",
      "Novela histórica",
      "Aventuras",
      "Drama",
      "Humor",
      "Bélica",
      "Western",
      "Saga familiar",
    ],
  },
  {
    key: "young-readers",
    label: "Infantil y juvenil",
    genres: ["Infantil", "Juvenil"],
  },
  {
    key: "forms",
    label: "Otras formas literarias",
    genres: [
      "Cuento y relatos",
      "Poesía",
      "Teatro",
      "Ensayo",
      "Biografía y memorias",
      "Crónica",
      "No ficción",
      "Cómic y novela gráfica",
    ],
  },
];

export const BOOK_GENRES = [...new Set(BOOK_GENRE_GROUPS.flatMap((group) => group.genres))];

function rawGenreItems(value) {
  if (!value || value === "[]") return [];

  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }

  const text = String(value).trim();

  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map(String).map((item) => item.trim()).filter(Boolean);
      }
    } catch {
      // El valor ya era texto normal.
    }
  }

  return text
    .split(/[,;|]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizedGenreText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-ES")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const GENRE_RULES = [
  { labels: ["Fantasía", "Romance"], pattern: /\b(romantasy|fantasy romance|romantic fantasy)\b/ },
  { labels: ["Fantasía", "Ciencia ficción"], pattern: /\b(science fantasy|fantasia cientifica)\b/ },
  { labels: ["Novela erótica", "Romance"], pattern: /\b(erotic|erotica|erotico|erotica romance|spicy romance|dark romance|novela erotica)\b/ },
  { labels: ["Romance"], pattern: /\b(romance|romantic|romantica|romantico|love story|chick lit|romance fiction)\b/ },
  { labels: ["Ciencia ficción"], pattern: /\b(science fiction|sci fi|scifi|ciencia ficcion|space opera|hard science fiction|time travel fiction)\b/ },
  { labels: ["Distopía"], pattern: /\b(dystopia|dystopian|distopia|distopica|distopico)\b/ },
  { labels: ["Ucronía"], pattern: /\b(alternate history|alternative history|uchronia|ucronia)\b/ },
  { labels: ["Realismo mágico"], pattern: /\b(magical realism|magic realism|realismo magico)\b/ },
  { labels: ["Paranormal", "Fantasía"], pattern: /\b(paranormal fiction|paranormal romance|supernatural fiction|urban paranormal)\b/ },
  { labels: ["Fantasía"], pattern: /\b(fantasy|fantasia|high fantasy|urban fantasy|epic fantasy|dark fantasy|low fantasy|fairy tales|fairies|dragons|magic|litrpg|game lit)\b/ },
  { labels: ["Novela histórica"], pattern: /\b(historical fiction|historical novel|novela historica|narrativa historica|period fiction|period drama|medieval fiction)\b/ },
  { labels: ["Novela policíaca"], pattern: /\b(roman policier|policier|policiere|police procedural|policial|novela policial|detective fiction|detective stories|investigation fiction|procedural)\b/ },
  { labels: ["Novela negra"], pattern: /\b(noir|crime fiction|novela negra|hardboiled|crime novel|crime)\b/ },
  { labels: ["Misterio"], pattern: /\b(mystery|misterio|murder mystery|whodunit|mystery fiction)\b/ },
  { labels: ["Suspense"], pattern: /\b(suspense|suspenso|suspense fiction)\b/ },
  { labels: ["Thriller"], pattern: /\b(thriller|psychological thriller|domestic thriller|legal thriller|medical thriller|techno thriller)\b/ },
  { labels: ["Espionaje"], pattern: /\b(espionage|spy fiction|spy stories|espionaje)\b/ },
  { labels: ["Terror"], pattern: /\b(horror|terror|gothic horror|ghost stories|weird fiction)\b/ },
  { labels: ["Aventuras"], pattern: /\b(adventure|aventura|aventuras|action adventure|pirates|piratas|survival fiction|quest fiction)\b/ },
  { labels: ["Bélica"], pattern: /\b(war fiction|military fiction|novela belica|belica)\b/ },
  { labels: ["Western"], pattern: /\b(western|westerns|wild west|oeste americano)\b/ },
  { labels: ["Saga familiar"], pattern: /\b(family saga|saga familiar|generational saga)\b/ },
  { labels: ["Humor"], pattern: /\b(humor|humour|comedy|comedia|funny|satire|satira|comic fiction)\b/ },
  { labels: ["Drama"], pattern: /\b(drama|dramatic fiction|domestic fiction)\b/ },
  { labels: ["Juvenil"], pattern: /\b(juvenile fiction|young adult fiction|young adult|ya fiction|teen fiction|teenage fiction|novela juvenil|literatura juvenil|jeunesse)\b/ },
  { labels: ["Infantil"], pattern: /\b(children s fiction|childrens fiction|children fiction|children s literature|childrens literature|middle grade|infantil|literatura infantil|picture books|children s audiobooks)\b/ },
  { labels: ["Cuento y relatos"], pattern: /\b(short stories|short story|cuentos|cuento|relatos|stories collections|story collection)\b/ },
  { labels: ["Biografía y memorias"], pattern: /\b(biography|biografia|autobiography|autobiografia|memoir|memorias|personal narratives)\b/ },
  { labels: ["Ensayo"], pattern: /\b(essay|essays|ensayo|ensayos)\b/ },
  { labels: ["Crónica"], pattern: /\b(chronicle|cronica|cronicas|literary journalism|periodismo literario)\b/ },
  { labels: ["Poesía"], pattern: /\b(poetry|poesia|poems|poemas|verse)\b/ },
  { labels: ["Teatro"], pattern: /\b(drama plays|plays|playwriting|teatro|theatre|theater)\b/ },
  { labels: ["Cómic y novela gráfica"], pattern: /\b(comic|comics|graphic novel|graphic novels|novela grafica|manga|bandes dessinees)\b/ },
  { labels: ["No ficción"], pattern: /\b(nonfiction|non fiction|no ficcion|true story|divulgacion|reference works)\b/ },
  { labels: ["Narrativa contemporánea"], pattern: /\b(contemporary fiction|contemporanea|contemporaneo|modern fiction)\b/ },
  { labels: ["Narrativa general"], pattern: /\b(fiction|ficcion|ficciones|literary fiction|general fiction|adult fiction|form novel|novel|roman)\b/ },
];

const NON_GENRE_PATTERN = /\b(spanish literature|french literature|english literature|language materials|langue|lectures et morceaux choisis|bestseller|new york times|nyt|audiobook|audiobooks|large type books|accessible book|protected daisy|open library staff picks|lgbt|lgbtq|queer|found family|coming of age|dark academia|cottagecore|cozy|cosy|gothic aesthetic|love|family|friendship|magic users|witches|angels|courts and courtiers|women revolutionaries|blessing and cursing|cyanide poisoning)\b/;

function canonicalGenres(item) {
  const cleanItem = String(item || "").trim();
  if (!cleanItem) return [];

  const normalized = normalizedGenreText(cleanItem);
  const exact = BOOK_GENRES.find(
    (genre) => normalizedGenreText(genre) === normalized,
  );

  if (exact) return [exact];

  const match = GENRE_RULES.find((rule) => rule.pattern.test(normalized));
  if (match) return match.labels;

  // Los términos sin una equivalencia literaria clara no se convierten en filtros.
  return NON_GENRE_PATTERN.test(normalized) ? [] : [];
}

export function parseBookGenres(value) {
  const seen = new Set();

  return rawGenreItems(value)
    .map((item) => String(item).trim())
    .filter(Boolean)
    .filter((genre) => {
      const key = normalizedGenreText(genre);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 30);
}

export function normalizeBookGenres(value) {
  const seen = new Set();

  return parseBookGenres(value)
    .flatMap(canonicalGenres)
    .filter(Boolean)
    .filter((genre) => {
      const key = normalizedGenreText(genre);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

export function normalizeBookGenre(value) {
  return normalizeBookGenres(value)[0] || "";
}

export function serializeBookGenres(value) {
  const genres = normalizeBookGenres(value);
  return genres.length > 0 ? JSON.stringify(genres) : "";
}

export function readableRawGenre(value) {
  return normalizeBookGenres(value).join(", ");
}
