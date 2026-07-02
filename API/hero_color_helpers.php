<?php

declare(strict_types=1);

const LIBRELULA_FALLBACK_HERO_COLOR = '#4A4A52';
const LIBRELULA_HERO_LUMINANCE_THRESHOLD = 140.0;
const LIBRELULA_HERO_DARKEN_AMOUNT = 0.35;

function librelulaHeroLuminance(int $red, int $green, int $blue): float
{
    return 0.299 * $red + 0.587 * $green + 0.114 * $blue;
}

function librelulaNormalizeHeroColor(mixed $value): string
{
    $color = strtoupper(trim((string) $value));

    if (preg_match('/^#[0-9A-F]{6}$/', $color) !== 1) {
        return LIBRELULA_FALLBACK_HERO_COLOR;
    }

    $red = hexdec(substr($color, 1, 2));
    $green = hexdec(substr($color, 3, 2));
    $blue = hexdec(substr($color, 5, 2));

    if (
        librelulaHeroLuminance($red, $green, $blue) >
        LIBRELULA_HERO_LUMINANCE_THRESHOLD
    ) {
        $factor = 1 - LIBRELULA_HERO_DARKEN_AMOUNT;
        $red = (int) round($red * $factor);
        $green = (int) round($green * $factor);
        $blue = (int) round($blue * $factor);
    }

    if (
        librelulaHeroLuminance($red, $green, $blue) >
        LIBRELULA_HERO_LUMINANCE_THRESHOLD
    ) {
        return LIBRELULA_FALLBACK_HERO_COLOR;
    }

    return sprintf('#%02X%02X%02X', $red, $green, $blue);
}
