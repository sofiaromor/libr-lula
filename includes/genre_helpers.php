<?php

declare(strict_types=1);

/** @return list<string> */
function librelulaGenreItems(mixed $value): array
{
    if (is_array($value)) {
        $items = $value;
    } else {
        $text = trim((string) $value);

        if ($text === '' || $text === '[]') {
            return [];
        }

        $items = null;

        if (str_starts_with($text, '[')) {
            $decoded = json_decode($text, true);
            if (is_array($decoded)) {
                $items = $decoded;
            }
        }

        if (!is_array($items)) {
            $items = preg_split('/[,;|]+/u', $text) ?: [];
        }
    }

    $clean = [];

    foreach ($items as $item) {
        $item = trim((string) $item);
        if ($item !== '') {
            $clean[] = $item;
        }
    }

    return array_values(array_unique($clean));
}

function librelulaGenreSearchText(string $value): string
{
    $value = strtr($value, [
        'Á' => 'A', 'À' => 'A', 'Ä' => 'A', 'Â' => 'A',
        'á' => 'a', 'à' => 'a', 'ä' => 'a', 'â' => 'a',
        'É' => 'E', 'È' => 'E', 'Ë' => 'E', 'Ê' => 'E',
        'é' => 'e', 'è' => 'e', 'ë' => 'e', 'ê' => 'e',
        'Í' => 'I', 'Ì' => 'I', 'Ï' => 'I', 'Î' => 'I',
        'í' => 'i', 'ì' => 'i', 'ï' => 'i', 'î' => 'i',
        'Ó' => 'O', 'Ò' => 'O', 'Ö' => 'O', 'Ô' => 'O',
        'ó' => 'o', 'ò' => 'o', 'ö' => 'o', 'ô' => 'o',
        'Ú' => 'U', 'Ù' => 'U', 'Ü' => 'U', 'Û' => 'U',
        'ú' => 'u', 'ù' => 'u', 'ü' => 'u', 'û' => 'u',
        'Ñ' => 'N', 'ñ' => 'n',
    ]);

    $value = strtolower($value);
    $value = str_replace('&', ' and ', $value);
    $value = preg_replace('/[^a-z0-9]+/', ' ', $value) ?? $value;

    return trim($value);
}

function librelulaNormalizeGenre(mixed $value): string
{
    $genres = [
        'Novela erótica',
        'Novela romántica',
        'Terror o thriller',
        'Novela histórica',
        'Novela juvenil',
        'Novela policial',
        'Novela negra o suspense',
        'Novela de aventuras',
        'Narrativa contemporánea',
        'Ciencia ficción',
        'Fantasía',
    ];

    $rules = [
        'Novela erótica' => '/\b(erotic|erotica|erotico|sensual|dark romance)\b/',
        'Novela romántica' => '/\b(romance|romantic|romantica|romantico|love story|love|chick lit)\b/',
        'Ciencia ficción' => '/\b(science fiction|sci fi|scifi|ciencia ficcion|space opera|cyberpunk|dystopia|distopia|time travel)\b/',
        'Fantasía' => '/\b(fantasy|fantasia|high fantasy|urban fantasy|epic fantasy|paranormal|magic|magical realism|realismo magico|fairies|dragons)\b/',
        'Novela histórica' => '/\b(historical|historica|historico|history|historia|period drama|war fiction|medieval)\b/',
        'Novela juvenil' => '/\b(young adult|new adult|juvenile|juvenil|middle grade|childrens|children|infantil|coming of age)\b/',
        'Novela policial' => '/\b(police procedural|policial|detective|investigation|investigacion|inspector|procedural)\b/',
        'Terror o thriller' => '/\b(horror|terror|thriller|psychological thriller|gothic|gotica|gotico)\b/',
        'Novela negra o suspense' => '/\b(noir|crime|crimen|criminal|mystery|misterio|suspense|suspenso|true crime|murder|asesinato)\b/',
        'Novela de aventuras' => '/\b(adventure|aventura|aventuras|action|accion|pirates|piratas|survival|supervivencia)\b/',
        'Narrativa contemporánea' => '/\b(contemporary|contemporanea|contemporaneo|literary fiction|literatura|fiction|ficcion|novel|novela|drama|family|familia|spanish literature)\b/',
    ];

    foreach (librelulaGenreItems($value) as $item) {
        $normalized = librelulaGenreSearchText($item);

        foreach ($genres as $genre) {
            if (librelulaGenreSearchText($genre) === $normalized) {
                return $genre;
            }
        }

        foreach ($rules as $genre => $pattern) {
            if (preg_match($pattern, $normalized) === 1) {
                return $genre;
            }
        }
    }

    return '';
}
