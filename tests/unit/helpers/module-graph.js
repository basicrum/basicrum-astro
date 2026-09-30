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

// Declaration files cannot be parsed by acorn, so their import forms are
// matched textually after string-aware comment removal: `from "x"`,
// `import "x"`, `import("x")` with or without import attributes,
// `import x = require("x")`, and triple-slash references.
function declarationSpecifiers(source) {
  const found = [];
  for (const match of source.matchAll(/^[ \t]*\/\/\/\s*<reference\s+(?:path|types)\s*=\s*["']([^"'\n]+)["']/gm)) {
    found.push({ specifier: match[1], kind: "reference" });
  }
  const code = stripComments(source);
  for (const match of code.matchAll(/\bfrom\s*["']([^"'\n]+)["']/g)) found.push({ specifier: match[1], kind: "static" });
  for (const match of code.matchAll(/\bimport\s*["']([^"'\n]+)["']/g)) found.push({ specifier: match[1], kind: "side-effect" });
  for (const match of code.matchAll(/\bimport\s*\(\s*["']([^"'\n]+)["']\s*(?:,[^)]*)?\)/g)) found.push({ specifier: match[1], kind: "dynamic" });
  for (const match of code.matchAll(/=\s*require\s*\(\s*["']([^"'\n]+)["']\s*\)/g)) found.push({ specifier: match[1], kind: "static" });
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

/** Remove comments without touching string literals, so a string containing
 *  comment delimiters cannot hide the code that follows it. */
function stripComments(source) {
  let out = "";
  let quote = null;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (quote) {
      out += ch;
      if (ch === "\\") { out += next ?? ""; i += 1; } else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      out += ch;
    } else if (ch === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i += 1;
      out += "\n";
    } else if (ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 1;
      out += " ";
    } else {
      out += ch;
    }
  }
  return out;
}

/** Absolute path a relative specifier resolves to, ignoring a ?query suffix. */
export function resolveSpecifier(file, specifier) {
  return resolve(dirname(file), specifier.split("?")[0]);
}

export function isInside(dir, path) {
  const base = resolve(dir);
  return path === base || path.startsWith(base + sep);
}
