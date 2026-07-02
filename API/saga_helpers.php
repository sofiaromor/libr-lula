<?php

function normalizeSagaKey(?string $sagaName): ?string
{
    $sagaName = trim((string) $sagaName);

    if ($sagaName === "") {
        return null;
    }

    $lowerName = function_exists("mb_strtolower")
        ? mb_strtolower($sagaName, "UTF-8")
        : strtolower($sagaName);

    $key = preg_replace(
        '/[^\p{L}\p{N}]+/u',
        '-',
        $lowerName
    );

    $key = trim((string) $key, "-");

    if ($key === "") {
        return hash("sha256", $lowerName);
    }

    return $key;
}

function readSagaPostData(): array
{
    $sagaNameText = trim(
        (string) ($_POST["saga_name"] ?? "")
    );

    $sagaNumberText = trim(
        (string) ($_POST["saga_number"] ?? "")
    );

    if ($sagaNumberText !== "" && $sagaNameText === "") {
        throw new InvalidArgumentException(
            "Debes indicar el nombre de la saga antes del número."
        );
    }

    $sagaNumber = null;

    if ($sagaNumberText !== "") {
        $normalizedNumber = str_replace(
            ",",
            ".",
            $sagaNumberText
        );

        if (!is_numeric($normalizedNumber)) {
            throw new InvalidArgumentException(
                "El número de la saga no es válido."
            );
        }

        $sagaNumber = (float) $normalizedNumber;

        if ($sagaNumber < 0) {
            throw new InvalidArgumentException(
                "El número de la saga no puede ser negativo."
            );
        }
    }

    $sagaName = $sagaNameText !== ""
        ? $sagaNameText
        : null;

    return [
        "saga_name" => $sagaName,
        "saga_number" => $sagaNumber,
        "saga_key" => normalizeSagaKey($sagaName),
    ];
}