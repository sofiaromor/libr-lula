<?php

declare(strict_types=1);

function librelulaGenreKey(string $value): string
{
    $value = function_exists('mb_strtolower')
        ? mb_strtolower($value, 'UTF-8')
        : strtolower($value);

    $ascii = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value);
    if (is_string($ascii) && $ascii !== '') {
        $value = $ascii;
    }

    $value = str_replace('&', ' and ', $value);
    $value = preg_replace('/[^a-z0-9]+/i', ' ', $value) ?? $value;
    return trim(preg_replace('/\s+/', ' ', $value) ?? $value);
}

function librelulaGenreItems(mixed $value, int $maximum = 40): array
{
    if (is_array($value)) {
        $items = $value;
    } else {
        $text = trim((string) $value);
        if ($text === '' || $text === '[]') {
            return [];
        }

        $decoded = json_decode($text, true);
        $items = is_array($decoded)
            ? $decoded
            : (preg_split('/[,;|]+/u', $text) ?: []);
    }

    $result = [];
    $seen = [];

    foreach ($items as $item) {
        $clean = trim((string) $item);
        if ($clean === '') {
            continue;
        }

        $key = librelulaGenreKey($clean);
        if ($key === '' || isset($seen[$key])) {
            continue;
        }

        $seen[$key] = true;
        $result[] = $clean;

        if (count($result) >= $maximum) {
            break;
        }
    }

    return $result;
}

function librelulaGenreAppend(array &$values, string $value, int $maximum = 12): void
{
    $key = librelulaGenreKey($value);
    if ($key === '') {
        return;
    }

    foreach ($values as $existing) {
        if (librelulaGenreKey((string) $existing) === $key) {
            return;
        }
    }

    if (count($values) < $maximum) {
        $values[] = $value;
    }
}

function librelulaCanonicalAudience(string $value): ?string
{
    $text = librelulaGenreKey($value);

    if (preg_match('/\b(new adult)\b/', $text)) {
        return 'New Adult';
    }
    if (preg_match('/\b(young adult|juvenile|juvenil|teen|teenage|jeunesse)\b/', $text)) {
        return 'Juvenil';
    }
    if (preg_match('/\b(children|childrens|child|infantil|middle grade|picture book)\b/', $text)) {
        return 'Infantil';
    }
    if (preg_match('/\b(adult|adulto)\b/', $text)) {
        return 'Adulto';
    }

    return null;
}

function librelulaClassifyBookTags(mixed $value): array
{
    $genres = [];
    $themes = [];
    $audiences = [];
    $aesthetics = [];

    $canonicalGenres = [
        'fantasia' => 'Fantasía',
        'ciencia ficcion' => 'Ciencia ficción',
        'distopia' => 'Distopía',
        'ucronia' => 'Ucronía',
        'realismo magico' => 'Realismo mágico',
        'terror' => 'Terror',
        'paranormal' => 'Paranormal',
        'misterio' => 'Misterio',
        'thriller' => 'Thriller',
        'suspense' => 'Suspense',
        'novela policiaca' => 'Novela policíaca',
        'novela negra' => 'Novela negra',
        'espionaje' => 'Espionaje',
        'romance' => 'Romance',
        'novela erotica' => 'Novela erótica',
        'narrativa general' => 'Narrativa general',
        'narrativa contemporanea' => 'Narrativa contemporánea',
        'novela historica' => 'Novela histórica',
        'aventuras' => 'Aventuras',
        'drama' => 'Drama',
        'humor' => 'Humor',
        'belica' => 'Bélica',
        'western' => 'Western',
        'saga familiar' => 'Saga familiar',
        'infantil' => 'Infantil',
        'juvenil' => 'Juvenil',
        'cuento y relatos' => 'Cuento y relatos',
        'poesia' => 'Poesía',
        'teatro' => 'Teatro',
        'ensayo' => 'Ensayo',
        'biografia y memorias' => 'Biografía y memorias',
        'cronica' => 'Crónica',
        'no ficcion' => 'No ficción',
        'comic y novela grafica' => 'Cómic y novela gráfica',
    ];

    foreach (librelulaGenreItems($value) as $item) {
        $text = librelulaGenreKey($item);
        if ($text === '') {
            continue;
        }

        if (isset($canonicalGenres[$text])) {
            librelulaGenreAppend($genres, $canonicalGenres[$text], 8);
        } elseif (preg_match('/\b(romantasy|fantasy romance|romantic fantasy)\b/', $text)) {
            librelulaGenreAppend($genres, 'Fantasía', 8);
            librelulaGenreAppend($genres, 'Romance', 8);
        } elseif (preg_match('/\b(science fantasy|fantasia cientifica)\b/', $text)) {
            librelulaGenreAppend($genres, 'Fantasía', 8);
            librelulaGenreAppend($genres, 'Ciencia ficción', 8);
        } elseif (preg_match('/\b(erotic|erotica|erotico|erotica romance|spicy romance|dark romance|novela erotica)\b/', $text)) {
            librelulaGenreAppend($genres, 'Novela erótica', 8);
            librelulaGenreAppend($genres, 'Romance', 8);
        } elseif (preg_match('/\b(romance|romantic|romantica|romantico|love story|chick lit|romance fiction)\b/', $text)) {
            librelulaGenreAppend($genres, 'Romance', 8);
        } elseif (preg_match('/\b(science fiction|sci fi|scifi|ciencia ficcion|space opera|hard science fiction|time travel fiction)\b/', $text)) {
            librelulaGenreAppend($genres, 'Ciencia ficción', 8);
        } elseif (preg_match('/\b(dystopia|dystopian|distopia|distopica|distopico)\b/', $text)) {
            librelulaGenreAppend($genres, 'Distopía', 8);
        } elseif (preg_match('/\b(alternate history|alternative history|uchronia|ucronia)\b/', $text)) {
            librelulaGenreAppend($genres, 'Ucronía', 8);
        } elseif (preg_match('/\b(magical realism|magic realism|realismo magico)\b/', $text)) {
            librelulaGenreAppend($genres, 'Realismo mágico', 8);
        } elseif (preg_match('/\b(paranormal fiction|paranormal romance|supernatural fiction|urban paranormal)\b/', $text)) {
            librelulaGenreAppend($genres, 'Paranormal', 8);
            librelulaGenreAppend($genres, 'Fantasía', 8);
        } elseif (preg_match('/\b(fantasy|fantasia|high fantasy|urban fantasy|epic fantasy|dark fantasy|low fantasy|fairy tales|fairies|dragons|magic|litrpg|game lit)\b/', $text)) {
            librelulaGenreAppend($genres, 'Fantasía', 8);
        } elseif (preg_match('/\b(historical fiction|historical novel|novela historica|narrativa historica|period fiction|period drama|medieval fiction)\b/', $text)) {
            librelulaGenreAppend($genres, 'Novela histórica', 8);
        } elseif (preg_match('/\b(roman policier|policier|policiere|police procedural|policial|novela policial|detective fiction|detective stories|investigation fiction|procedural)\b/', $text)) {
            librelulaGenreAppend($genres, 'Novela policíaca', 8);
        } elseif (preg_match('/\b(noir|crime fiction|novela negra|hardboiled|crime novel|crime)\b/', $text)) {
            librelulaGenreAppend($genres, 'Novela negra', 8);
        } elseif (preg_match('/\b(mystery|misterio|murder mystery|whodunit|mystery fiction)\b/', $text)) {
            librelulaGenreAppend($genres, 'Misterio', 8);
        } elseif (preg_match('/\b(suspense|suspenso|suspense fiction)\b/', $text)) {
            librelulaGenreAppend($genres, 'Suspense', 8);
        } elseif (preg_match('/\b(thriller|psychological thriller|domestic thriller|legal thriller|medical thriller|techno thriller)\b/', $text)) {
            librelulaGenreAppend($genres, 'Thriller', 8);
        } elseif (preg_match('/\b(espionage|spy fiction|spy stories|espionaje)\b/', $text)) {
            librelulaGenreAppend($genres, 'Espionaje', 8);
        } elseif (preg_match('/\b(horror|terror|gothic horror|ghost stories|weird fiction)\b/', $text)) {
            librelulaGenreAppend($genres, 'Terror', 8);
        } elseif (preg_match('/\b(adventure|aventura|aventuras|action adventure|pirates|piratas|survival fiction|quest fiction)\b/', $text)) {
            librelulaGenreAppend($genres, 'Aventuras', 8);
        } elseif (preg_match('/\b(war fiction|military fiction|novela belica|belica)\b/', $text)) {
            librelulaGenreAppend($genres, 'Bélica', 8);
        } elseif (preg_match('/\b(western|westerns|wild west|oeste americano)\b/', $text)) {
            librelulaGenreAppend($genres, 'Western', 8);
        } elseif (preg_match('/\b(family saga|saga familiar|generational saga)\b/', $text)) {
            librelulaGenreAppend($genres, 'Saga familiar', 8);
        } elseif (preg_match('/\b(humor|humour|comedy|comedia|funny|satire|satira|comic fiction)\b/', $text)) {
            librelulaGenreAppend($genres, 'Humor', 8);
        } elseif (preg_match('/\b(drama|dramatic fiction|domestic fiction)\b/', $text)) {
            librelulaGenreAppend($genres, 'Drama', 8);
        } elseif (preg_match('/\b(juvenile fiction|young adult fiction|young adult|ya fiction|teen fiction|teenage fiction|novela juvenil|literatura juvenil|jeunesse)\b/', $text)) {
            librelulaGenreAppend($genres, 'Juvenil', 8);
            librelulaGenreAppend($audiences, 'Juvenil', 4);
        } elseif (preg_match('/\b(children s fiction|childrens fiction|children fiction|children s literature|childrens literature|middle grade|infantil|literatura infantil|picture books|children s audiobooks)\b/', $text)) {
            librelulaGenreAppend($genres, 'Infantil', 8);
            librelulaGenreAppend($audiences, 'Infantil', 4);
        } elseif (preg_match('/\b(short stories|short story|cuentos|cuento|relatos|story collection|stories collections)\b/', $text)) {
            librelulaGenreAppend($genres, 'Cuento y relatos', 8);
        } elseif (preg_match('/\b(biography|biografia|autobiography|autobiografia|memoir|memorias|personal narratives)\b/', $text)) {
            librelulaGenreAppend($genres, 'Biografía y memorias', 8);
        } elseif (preg_match('/\b(essay|essays|ensayo|ensayos)\b/', $text)) {
            librelulaGenreAppend($genres, 'Ensayo', 8);
        } elseif (preg_match('/\b(chronicle|cronica|cronicas|literary journalism|periodismo literario)\b/', $text)) {
            librelulaGenreAppend($genres, 'Crónica', 8);
        } elseif (preg_match('/\b(poetry|poesia|poems|poemas|verse)\b/', $text)) {
            librelulaGenreAppend($genres, 'Poesía', 8);
        } elseif (preg_match('/\b(drama plays|plays|playwriting|teatro|theatre|theater)\b/', $text)) {
            librelulaGenreAppend($genres, 'Teatro', 8);
        } elseif (preg_match('/\b(comic|comics|graphic novel|graphic novels|novela grafica|manga|bandes dessinees)\b/', $text)) {
            librelulaGenreAppend($genres, 'Cómic y novela gráfica', 8);
        } elseif (preg_match('/\b(nonfiction|non fiction|no ficcion|true story|divulgacion|reference works)\b/', $text)) {
            librelulaGenreAppend($genres, 'No ficción', 8);
        } elseif (preg_match('/\b(contemporary fiction|contemporanea|contemporaneo|modern fiction)\b/', $text)) {
            librelulaGenreAppend($genres, 'Narrativa contemporánea', 8);
        } elseif (preg_match('/\b(fiction|ficcion|ficciones|literary fiction|general fiction|adult fiction|form novel|novel|roman)\b/', $text)) {
            librelulaGenreAppend($genres, 'Narrativa general', 8);
        }

        $audience = librelulaCanonicalAudience($item);
        if ($audience !== null) {
            librelulaGenreAppend($audiences, $audience, 4);
        }

        if (preg_match('/\b(lgbt|lgbtq|queer|gay|lesbian|bisexual|transgender)\b/', $text)) {
            librelulaGenreAppend($themes, 'LGBTQ+', 12);
        }
        if (preg_match('/\b(love|amor)\b/', $text) && !preg_match('/\b(romance|romantic)\b/', $text)) {
            librelulaGenreAppend($themes, 'Amor', 12);
        }
        if (preg_match('/\b(friendship|amistad)\b/', $text)) {
            librelulaGenreAppend($themes, 'Amistad', 12);
        }
        if (preg_match('/\b(family|familia)\b/', $text) && !preg_match('/\b(family saga|saga familiar)\b/', $text)) {
            librelulaGenreAppend($themes, 'Familia', 12);
        }
        if (preg_match('/\b(witch|witchcraft|bruja|brujeria|blessing and cursing|magic users)\b/', $text)) {
            librelulaGenreAppend($themes, 'Brujería', 12);
        }
        if (preg_match('/\b(mythology|mitologia|angels|fairies)\b/', $text)) {
            librelulaGenreAppend($themes, 'Mitología', 12);
        }
        if (preg_match('/\b(war|guerra|revolutionaries)\b/', $text)) {
            librelulaGenreAppend($themes, 'Guerra', 12);
        }

        if (preg_match('/\b(dark academia)\b/', $text)) {
            librelulaGenreAppend($aesthetics, 'Dark academia', 8);
        }
        if (preg_match('/\b(cottagecore)\b/', $text)) {
            librelulaGenreAppend($aesthetics, 'Cottagecore', 8);
        }
        if (preg_match('/\b(cozy|cosy)\b/', $text)) {
            librelulaGenreAppend($aesthetics, 'Cozy', 8);
        }
        if (preg_match('/\b(gothic|gotico|gotica)\b/', $text)) {
            librelulaGenreAppend($aesthetics, 'Gótico', 8);
        }
        if (preg_match('/\b(noir)\b/', $text)) {
            librelulaGenreAppend($aesthetics, 'Noir', 8);
        }
        if (preg_match('/\b(cyberpunk)\b/', $text)) {
            librelulaGenreAppend($aesthetics, 'Cyberpunk', 8);
        }
        if (preg_match('/\b(steampunk)\b/', $text)) {
            librelulaGenreAppend($aesthetics, 'Steampunk', 8);
        }
    }

    return [
        'genres' => array_slice($genres, 0, 8),
        'themes' => array_slice($themes, 0, 12),
        'audiences' => array_slice($audiences, 0, 4),
        'aesthetics' => array_slice($aesthetics, 0, 8),
    ];
}

function librelulaMergeTagLists(mixed ...$lists): array
{
    $result = [];
    foreach ($lists as $list) {
        foreach (librelulaGenreItems($list) as $value) {
            librelulaGenreAppend($result, $value, 30);
        }
    }
    return $result;
}
