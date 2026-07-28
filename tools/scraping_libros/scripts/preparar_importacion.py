from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlparse


MAPA_GENEROS = {
    "narrativa fantastica": "Fantasía",
    "fantasia y magia": "Fantasía",
    "novela romantica": "Romance",
    "novela romantica y erotica": "Romance",
    "narrativa contemporanea": "Narrativa contemporánea",
    "novela negra": "Novela negra",
    "novela policiaca": "Novela policíaca",
    "ciencia ficcion": "Ciencia ficción",
    "novela de ciencia ficcion": "Ciencia ficción",
    "novela de terror": "Terror",
    "novela historica": "Novela histórica",
    "literatura juvenil": "Juvenil",
    "juvenil": "Juvenil",
    "infantil": "Infantil",
}

TERMINOS_EDICION = re.compile(
    r"\b(?:"
    r"ed\.?|edici[oó]n|tapa\s+dura|tapa\s+blanda|encuadernaci[oó]n|"
    r"formato\s+bolsillo|libro\s+de\s+bolsillo|coleccionista|"
    r"especial|limitada|ilustrada|cantos?\s+(?:tintados?|pintados?)"
    r")\b",
    re.IGNORECASE,
)


SAGA_FINAL_TITULO = re.compile(
    r"\s*[\(\[]\s*(?P<name>[^\(\)\[\]]+?)"
    r"(?:,\s*#\s*|#\s*|\s+)"
    r"(?P<number>\d+)\s*[\)\]]\s*$",
    re.IGNORECASE,
)

SAGA_TEXTO = re.compile(
    r"^(?P<name>.+?)(?:,\s*#\s*|#\s*|\s+)(?P<number>\d+)$",
    re.IGNORECASE,
)


def texto(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "").replace("\xa0", " ")).strip()



def datos_saga(value: object) -> tuple[str, int | None]:
    """Extrae nombre y número de textos como 'Ciudad Medialuna 3' o 'Ciudad Medialuna, #3'."""
    value = texto(value).strip("()[] ")

    if not value:
        return "", None

    match = SAGA_TEXTO.fullmatch(value)

    if not match:
        return value, None

    name = texto(match.group("name")).strip(" ,#")

    if not name or TERMINOS_EDICION.search(name):
        return value, None

    return name, int(match.group("number"))


def normalizar_saga_en_titulo(title: str) -> tuple[str, str, int | None]:
    """Convierte '(Ciudad Medialuna 3)' en '(Ciudad Medialuna, #3)'."""
    match = SAGA_FINAL_TITULO.search(title)

    if not match:
        return title, "", None

    name = texto(match.group("name")).strip(" ,#")

    if not name or TERMINOS_EDICION.search(name):
        return title, "", None

    number = int(match.group("number"))
    prefix = texto(title[: match.start()]).rstrip(" -–—,:")
    normalized = f"{prefix} ({name}, #{number})" if prefix else f"({name}, #{number})"

    return normalized, name, number


def normalizado(value: object) -> str:
    return (
        texto(value)
        .lower()
        .translate(str.maketrans("áéíóúüñ", "aeiouun"))
    )


def isbn(value: object) -> str:
    return re.sub(r"[^0-9Xx]", "", texto(value)).upper()


def isbn_valido(value: str) -> bool:
    if len(value) == 10:
        total = 0

        for posicion, caracter in enumerate(value):
            if caracter == "X":
                if posicion != 9:
                    return False
                numero = 10
            elif caracter.isdigit():
                numero = int(caracter)
            else:
                return False

            total += numero * (10 - posicion)

        return total % 11 == 0

    if len(value) == 13 and value.isdigit():
        total = sum(
            int(caracter) * (1 if posicion % 2 == 0 else 3)
            for posicion, caracter in enumerate(value[:12])
        )
        control = (10 - total % 10) % 10
        return control == int(value[-1])

    return False


def entero(value: object) -> int | None:
    coincidencia = re.search(r"\d+", texto(value))
    return int(coincidencia.group(0)) if coincidencia else None


def url_https(value: object) -> str:
    value = texto(value)

    try:
        parsed = urlparse(value)
    except ValueError:
        return ""

    return value if parsed.scheme == "https" and parsed.netloc else ""


def genero_libr_lula(value: object) -> str:
    return MAPA_GENEROS.get(normalizado(value), "")


def separar_edicion(title: str) -> tuple[str, str]:
    ediciones: list[str] = []

    def quitar_grupo(match: re.Match[str]) -> str:
        contenido = texto(match.group(1))

        if TERMINOS_EDICION.search(contenido):
            ediciones.append(contenido)
            return ""

        return match.group(0)

    base = re.sub(r"[\(\[]([^\)\]]+)[\)\]]", quitar_grupo, title)
    return texto(base).strip(" -–—,:"), " · ".join(ediciones)


def transformar(registro: dict, posicion: int) -> dict:
    original_title = texto(registro.get("titulo") or registro.get("titulo_original"))
    title, title_saga_name, title_saga_number = normalizar_saga_en_titulo(
        original_title
    )
    source_saga_name, source_saga_number = datos_saga(registro.get("saga"))
    saga_name = title_saga_name or source_saga_name
    saga_number = title_saga_number or source_saga_number

    if saga_name and saga_number and not title_saga_name:
        title = f"{title} ({saga_name}, #{saga_number})"

    detected_title_base, detected_edition = separar_edicion(title)
    # Se recalcula para no conservar el sufijo antiguo '(Saga 3)' del JSON raw.
    title_base = detected_title_base
    edition = texto(registro.get("edicion")) or detected_edition
    author = texto(registro.get("autora"))
    synopsis = texto(registro.get("sinopsis"))
    normalized_isbn = isbn(registro.get("isbn"))
    pages = entero(registro.get("numero_paginas"))
    publisher = texto(registro.get("editorial"))
    year = entero(registro.get("anio"))
    source_url = url_https(registro.get("url"))
    cover = url_https(registro.get("imagen_portada"))
    warnings = [texto(item) for item in registro.get("avisos", []) if texto(item)]
    errors: list[str] = []

    if not title:
        errors.append("Falta el título")
    if not author:
        errors.append("Falta el autor")
    if normalized_isbn and not isbn_valido(normalized_isbn):
        errors.append("El ISBN no supera la validación")
    if not normalized_isbn:
        warnings.append("Falta el ISBN")
    if not cover:
        warnings.append("Falta una portada HTTPS")
    if not synopsis:
        warnings.append("Falta la sinopsis")
    if not pages:
        warnings.append("Falta el número de páginas")
    if not publisher:
        warnings.append("Falta la editorial")
    if not year:
        warnings.append("Falta el año")
    if not source_url:
        warnings.append("Falta la URL de procedencia")

    raw_genre = texto(registro.get("genero_literario"))
    genre = genero_libr_lula(raw_genre)

    if raw_genre and not genre:
        warnings.append(f'Revisar el género de origen: "{raw_genre}"')

    return {
        "import_id": posicion,
        "selected": False,
        "ready": not errors,
        "title": title,
        "title_base": title_base,
        "edition": edition,
        "author": author,
        "synopsis": synopsis,
        "genre": genre,
        "source_genre": raw_genre,
        "year": year,
        "pages": pages,
        "publisher": publisher,
        "language": "es",
        "isbn": normalized_isbn,
        "saga_name": saga_name,
        "saga_number": saga_number,
        "cover": cover,
        "provider": "casa_del_libro",
        "source_id": texto(registro.get("source_id")) or normalized_isbn or source_url,
        "source_url": source_url,
        "binding": texto(registro.get("encuadernacion")),
        "publication_date": texto(registro.get("fecha_publicacion")),
        "warnings": list(dict.fromkeys(warnings)),
        "errors": errors,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Prepara un JSON del scraper para revisarlo en Librélula."
    )
    parser.add_argument("entrada", type=Path)
    parser.add_argument("salida", type=Path)
    args = parser.parse_args()

    with args.entrada.open(encoding="utf-8") as source:
        raw = json.load(source)

    if not isinstance(raw, list):
        raise SystemExit("La entrada debe ser una lista JSON de libros.")

    result = [transformar(item, index + 1) for index, item in enumerate(raw)]
    seen_isbns: set[str] = set()
    seen_sources: set[str] = set()

    for item in result:
        duplicate = False

        if item["isbn"] and item["isbn"] in seen_isbns:
            item["errors"].append("ISBN duplicado dentro del archivo")
            duplicate = True

        if item["source_id"] and item["source_id"] in seen_sources:
            item["errors"].append("Fuente duplicada dentro del archivo")
            duplicate = True

        if duplicate:
            item["ready"] = False
            item["selected"] = False

        if item["isbn"]:
            seen_isbns.add(item["isbn"])
        if item["source_id"]:
            seen_sources.add(item["source_id"])

    args.salida.parent.mkdir(parents=True, exist_ok=True)

    with args.salida.open("w", encoding="utf-8", newline="\n") as destination:
        json.dump(result, destination, ensure_ascii=False, indent=2)
        destination.write("\n")

    ready = sum(bool(item["ready"]) for item in result)
    warnings = sum(bool(item["warnings"]) for item in result)
    errors = len(result) - ready

    print(f"Registros preparados: {len(result)}")
    print(f"Listos para revisión: {ready}")
    print(f"Con avisos: {warnings}")
    print(f"Bloqueados por errores: {errors}")
    print(f"Archivo creado: {args.salida.resolve()}")


if __name__ == "__main__":
    main()
