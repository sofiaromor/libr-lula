// Build an offline visual fixture from the actual React components and CSS.
// The only mocked module is the backend API: this cannot read/write user data.
// Usage: node tests/buildShelfFixture.mjs /absolute/path/to/fixture.html
import { build } from "vite";
import { gzipSync } from "node:zlib";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const result = await build({
  configFile: false,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  root: fileURLToPath(new URL("..", import.meta.url)),
  logLevel: "error",
  plugins: [{
    name: "isolate-library-backend",
    resolveId(source, importer) {
      if (importer?.endsWith("MiBibliotecaImpl.jsx") && source === "./lib/library.js") return "\0fixture-library";
    },
    load(id) {
      if (id !== "\0fixture-library") return;
      return `export const getLibraryStatus = () => ["Leído", "is-completed"];
        export const LIBRARY_STATUS_LABELS = {};
        export const getMyLibrary = () => { throw new Error("Backend disabled in fixture"); };
        export const removePersonalSpine = getMyLibrary, updateLibraryScore = getMyLibrary,
          updatePersonalSpineCrop = getMyLibrary, uploadPersonalSpine = getMyLibrary;`;
    },
  }],
  build: {
    write: false,
    lib: { entry: fileURLToPath(new URL("./fixtures/shelves.jsx", import.meta.url)), formats: ["iife"], name: "ShelfFixture" },
    minify: true,
  },
});
const outputs = (Array.isArray(result) ? result : [result]).flatMap((bundle) => bundle.output);
const script = outputs.filter((output) => output.type === "chunk").map((output) => output.code).join("\n");
const css = outputs.filter((output) => output.fileName.endsWith(".css")).map((output) => output.source).join("\n");
const app = `<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  *{box-sizing:border-box} :root{--ink:#30271d;--cream:#fffdf8;--muted:#817364;--accent-dark:#8a4d30;--line:#e4d8ca;--green:#426951}
  body{margin:0;font-family:Georgia,serif;background:#f8f0e6} button,input,select{font:inherit}
  ${css}</style><div id="root"></div><script>${script.replaceAll("</script", "<\\/script")}</script></html>`;
const encoded = gzipSync(app).toString("base64");
const html = `<!doctype html><html><meta charset="utf-8"><style>body{margin:0;background:#eee;font:14px sans-serif}iframe{border:1px solid #ccc;height:820px}section{display:flex;gap:12px;align-items:start}label{display:block}</style>
  <h1>Verificación aislada de Librélula</h1><p>Datos sintéticos. No se conecta a la base de datos.</p><section id="frames"></section>
  <script>(async()=>{const bytes=Uint8Array.from(atob("${encoded}"),c=>c.charCodeAt(0));const app=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  for(const width of [390,320,420,650,1280]){const cell=document.createElement('div');const label=document.createElement('label');label.textContent=width+' px';const iframe=document.createElement('iframe');iframe.id='width-'+width;iframe.width=width;iframe.srcdoc=app;cell.append(label,iframe);document.querySelector('#frames').append(cell)}})()</script></html>`;
if (!process.argv[2]) throw new Error("Provide an output HTML path outside the repository");
await writeFile(process.argv[2], html);
console.log(`Built isolated fixture: ${process.argv[2]}`);
