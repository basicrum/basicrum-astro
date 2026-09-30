// Module-boundary helpers for the unit tests: list source files and extract
// every module specifier a file references (static imports, side-effect
// imports, re-exports and literal dynamic imports). JavaScript is parsed with
// acorn; declaration files, which acorn cannot parse, get a comment-stripped
// specifier scan, so a false match there fails loudly rather than passing.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { parse } from "acorn";

/** Recursively list .js and .d.ts files below a directory. */
export function listSourceFiles(dir, { recursive = true } = {}) {
  const files = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (recursive) files.push(...listSourceFiles(path, { recursive }));
    } else if (name.endsWith(".js") || name.endsWith(".mjs") || name.endsWith(".d.ts")) {
      files.push(path);
    }
  }
  return files;
}

function walk(node, visit) {
  if (!node || typeof node.type !== "string") return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "loc" || key === "range") continue;
    const value = node[key];
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
    else if (value && typeof value.type === "string") walk(value, visit);
  }
}

/**
 * @returns {{ specifier: string, kind: "static" | "side-effect" | "re-export" | "dynamic" | "dynamic-unresolvable" }[]}
 */
export function moduleSpecifiers(file) {
  const source = readFileSync(file, "utf8");
  if (file.endsWith(".d.ts")) return declarationSpecifiers(source);
  const ast = parse(source, { ecmaVersion: "latest", sourceType: "module", allowHashBang: true });
  const found = [];
  walk(ast, (node) => {
    if (node.type === "ImportDeclaration") {
      found.push({ specifier: node.source.value, kind: node.specifiers.length === 0 ? "side-effect" : "static" });
    } else if ((node.type === "ExportNamedDeclaration" || node.type === "ExportAllDeclaration") && node.source) {
      found.push({ specifier: node.source.value, kind: "re-export" });
    } else if (node.type === "ImportExpression") {
      if (node.source.type === "Literal" && typeof node.source.value === "string") {
        found.push({ specifier: node.source.value, kind: "dynamic" });
      } else {
        found.push({ specifier: "<non-literal>", kind: "dynamic-unresolvable" });
      }
    }
  });
  return found;
}

function declarationSpecifiers(source) {
  const code = stripComments(source);
  const found = [];
  for (const match of code.matchAll(/\bfrom\s*["']([^"'\n]+)["']/g)) found.push({ specifier: match[1], kind: "static" });
  for (const match of code.matchAll(/\bimport\s*["']([^"'\n]+)["']/g)) found.push({ specifier: match[1], kind: "side-effect" });
  for (const match of code.matchAll(/\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g)) found.push({ specifier: match[1], kind: "dynamic" });
  return found;
}

/** Source text with comments blanked out, for checks that must ignore prose. */
export function codeWithoutComments(file) {
  const source = readFileSync(file, "utf8");
  if (file.endsWith(".d.ts")) return stripComments(source);
  const ranges = [];
  parse(source, {
    ecmaVersion: "latest", sourceType: "module", allowHashBang: true,
    onComment: (_block, _text, start, end) => ranges.push([start, end]),
  });
  let code = source;
  for (const [start, end] of ranges.reverse()) code = code.slice(0, start) + " ".repeat(end - start) + code.slice(end);
  return code;
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

/** Absolute path a relative specifier resolves to, ignoring a ?query suffix. */
export function resolveSpecifier(file, specifier) {
  return resolve(dirname(file), specifier.split("?")[0]);
}

export function isInside(dir, path) {
  const base = resolve(dir);
  return path === base || path.startsWith(base + sep);
}
