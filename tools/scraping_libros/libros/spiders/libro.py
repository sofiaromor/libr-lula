from __future__ import annotations

import re
from datetime import datetime, timezone
from urllib.parse import urlsplit, urlunsplit

import scrapy

from libros.items import LibroItem


ESPACIOS = re.compile(r"\s+")
SOLO_DIGITOS = re.compile(r"\D+")
ISBN_VALIDO = re.compile(r"^(?:\d{9}[\dX]|\d{13})$")

TERMINOS_EDICION = re.compile(
    r"\b(?:"
    r"ed\.?|edici[oó]n|tapa\s+dura|tapa\s+blanda|encuadernaci[oó]n|"
    r"formato\s+bolsillo|libro\s+de\s+bolsillo|coleccionista|"
    r"especial|limitada|ilustrada|cantos?\s+(?:tintados?|pintados?)"
    r")\b",
    re.IGNORECASE,
)


def texto_limpio(value: object) -> str:
    return ESPACIOS.sub(" ", str(value or "").replace("\xa0", " ")).strip()


def isbn_limpio(value: object) -> str | None:
    value = re.sub(r"[^0-9Xx]", "", str(value or "")).upper()
    return value if ISBN_VALIDO.fullmatch(value) else None


def entero_limpio(value: object) -> int | None:
    digits = SOLO_DIGITOS.sub("", str(value or ""))
    return int(digits) if digits else None


def separar_edicion(titulo: str) -> tuple[str, str | None]:
    """Conserva el título original y ofrece una versión base no destructiva."""
    ediciones: list[str] = []

    def quitar_grupo(match: re.Match[str]) -> str:
        contenido = texto_limpio(match.group(1))
        if TERMINOS_EDICION.search(contenido):
            ediciones.append(contenido)
            return ""
        return match.group(0)

    base = re.sub(r"[\(\[]([^\)\]]+)[\)\]]", quitar_grupo, titulo)
    base = texto_limpio(base).strip(" -–—,:")

    return base or titulo, " · ".join(ediciones) or None


class LibroSpider(scrapy.Spider):
    name = "libro"
    allowed_domains = ["casadellibro.com"]

    categoria_predeterminada = (
        "https://www.casadellibro.com/libros/"
        "literatura/narrativa-fantastica/121012000"
    )

    def __init__(
        self,
        categoria_url: str | None = None,
        max_paginas: str | int = 1,
        pagina_inicial: str | int = 1,
        cantidad_paginas: str | int | None = None,
        *args,
        **kwargs,
    ):
        super().__init__(*args, **kwargs)

        self.categoria_url = self.normalizar_categoria_url(
            texto_limpio(categoria_url or self.categoria_predeterminada)
        )

        try:
            inicio = int(pagina_inicial)
        except (TypeError, ValueError):
            inicio = 1

        self.pagina_inicial = max(1, inicio)

        if cantidad_paginas is None:
            # Compatibilidad con los comandos antiguos:
            # max_paginas=2 sigue recorriendo las páginas 1 y 2.
            try:
                pagina_final = int(max_paginas)
            except (TypeError, ValueError):
                pagina_final = 1

            pagina_final = max(1, min(pagina_final, 10))
            self.pagina_inicial = 1
            self.pagina_final = pagina_final
        else:
            try:
                cantidad = int(cantidad_paginas)
            except (TypeError, ValueError):
                cantidad = 1

            # Limita el tamaño del lote, no el número absoluto de página.
            cantidad = max(1, min(cantidad, 10))
            self.pagina_final = self.pagina_inicial + cantidad - 1

        self.logger.info(
            "Se recopilarán las páginas %s a %s (%s página(s)).",
            self.pagina_inicial,
            self.pagina_final,
            self.pagina_final - self.pagina_inicial + 1,
        )

    async def start(self):
        yield scrapy.Request(
            self.url_pagina(self.pagina_inicial),
            callback=self.parse,
            meta={"pagina": self.pagina_inicial},
        )

    @staticmethod
    def normalizar_categoria_url(url: str) -> str:
        """Devuelve la URL base de categoria, aunque se reciba una /pN."""
        partes = urlsplit(url)
        ruta = re.sub(r"/p\d+/?$", "", partes.path.rstrip("/"), flags=re.I)
        return urlunsplit(
            (partes.scheme, partes.netloc, ruta, partes.query, partes.fragment)
        )

    def url_pagina(self, pagina: int) -> str:
        """Construye la paginacion real: pagina 2 -> /p2."""
        partes = urlsplit(self.categoria_url)
        numero = max(1, int(pagina))
        ruta_base = re.sub(
            r"/p\d+/?$", "", partes.path.rstrip("/"), flags=re.I
        )
        ruta = ruta_base if numero == 1 else f"{ruta_base}/p{numero}"

        return urlunsplit(
            (partes.scheme, partes.netloc, ruta, partes.query, partes.fragment)
        )

    def parse(self, response):
        # Prioriza los resultados paginados y evita carruseles promocionales
        # repetidos. Si Casa del Libro cambia el contenedor, usa respaldo.
        tarjetas = response.css("div.results div.products div.product-card")

        if not tarjetas:
            self.logger.warning(
                "No se encontro el listado principal en %s; se usa el selector "
                "de respaldo.",
                response.url,
            )
            tarjetas = response.css("div.product-card")

        if not tarjetas:
            self.logger.warning(
                "No se encontraron tarjetas en %s. Puede haber cambiado la web.",
                response.url,
            )

        for tarjeta in tarjetas:
            enlace = (
                tarjeta.css('a[href^="/libro-"]::attr(href)').get()
                or tarjeta.css('a[href*="/libro-"]::attr(href)').get()
            )

            if enlace:
                yield response.follow(enlace, callback=self.parse_libro)

        pagina_actual = int(response.meta.get("pagina", 1))

        if pagina_actual < self.pagina_final:
            pagina_siguiente = pagina_actual + 1
            yield scrapy.Request(
                self.url_pagina(pagina_siguiente),
                callback=self.parse,
                meta={"pagina": pagina_siguiente},
            )

    def parse_libro(self, response):
        def extraer_campo(*nombres: str) -> str | None:
            for nombre in nombres:
                texto = response.xpath(
                    "normalize-space(string("
                    f'//h3[@data-campo="{nombre}"]'
                    "))"
                ).get()

                texto = texto_limpio(texto)

                if not texto:
                    continue

                if ":" in texto:
                    texto = texto.split(":", 1)[1]

                return texto_limpio(texto) or None

            return None

        titulo_original = texto_limpio(
            response.css("h1.balance-title::text").get()
            or response.css("h1::text").get()
        )
        titulo_base, edicion = separar_edicion(titulo_original)

        autora = texto_limpio(
            response.xpath(
                'normalize-space(string('
                '//h3[contains(normalize-space(.), "Escrito por")]'
                "))"
            ).get()
        )

        if autora.lower().startswith("escrito por"):
            autora = texto_limpio(autora[len("escrito por") :])

        textos_sinopsis = response.xpath(
            '//div[contains(@class, "resumen-content")]//p//text()'
        ).getall()
        sinopsis = texto_limpio(" ".join(textos_sinopsis))

        generos = [
            texto_limpio(genero)
            for genero in response.xpath(
                '//a[contains(@href, "/libros/literatura/") and @title]/@title'
            ).getall()
            if texto_limpio(genero)
        ]
        generos = list(dict.fromkeys(generos))

        isbn = isbn_limpio(extraer_campo("ISBN"))
        numero_paginas = entero_limpio(
            extraer_campo("Número de páginas", "Numero de paginas")
        )
        editorial = extraer_campo("Editorial")
        idioma = extraer_campo("Idioma")
        fecha_publicacion = extraer_campo(
            "Fecha de lanzamiento",
            "Fecha de publicación",
            "Fecha de publicacion",
        )
        anio = entero_limpio(extraer_campo("Año de edición", "Ano de edicion"))

        if not anio and fecha_publicacion:
            coincidencia_anio = re.search(r"\b(?:19|20)\d{2}\b", fecha_publicacion)
            anio = int(coincidencia_anio.group(0)) if coincidencia_anio else None

        encuadernacion = extraer_campo("Encuadernación", "Encuadernacion")
        saga = extraer_campo("Serie/Saga", "Saga", "Serie")

        imagen_portada = (
            response.css('img[style*="--p-ficha-"]::attr(src)').get()
            or response.css('meta[property="og:image"]::attr(content)').get()
        )
        imagen_portada = (
            response.urljoin(imagen_portada) if imagen_portada else None
        )

        avisos: list[str] = []

        if not titulo_original:
            avisos.append("Falta el título")
        if not autora:
            avisos.append("Falta el autor")
        if not isbn:
            avisos.append("Falta un ISBN válido")
        if not sinopsis:
            avisos.append("Falta la sinopsis")
        if not numero_paginas:
            avisos.append("Falta el número de páginas")

        source_id = isbn or response.url.rstrip("/").rsplit("/", 1)[-1]

        yield LibroItem(
            titulo=titulo_original or None,
            titulo_base=titulo_base or None,
            edicion=edicion,
            autora=autora or None,
            sinopsis=sinopsis or None,
            genero_literario=generos[-1] if generos else None,
            generos_fuente=generos,
            isbn=isbn,
            numero_paginas=numero_paginas,
            editorial=editorial,
            idioma=idioma or "Español",
            fecha_publicacion=fecha_publicacion,
            anio=anio,
            encuadernacion=encuadernacion,
            saga=saga,
            imagen_portada=imagen_portada,
            provider="casa_del_libro",
            source_id=source_id,
            url=response.url,
            extraido_en=datetime.now(timezone.utc).isoformat(),
            avisos=avisos,
        )
