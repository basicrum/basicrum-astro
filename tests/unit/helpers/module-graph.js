// Parse both TypeScript source and generated JavaScript/declarations so erased
// type-only imports cannot bypass the framework boundary checks.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import ts from "typescript";

/** Recursively list JavaScript, TypeScript and declaration files. */
export function listSourceFiles(dir, { recursive = true } = {}) {
  const files = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (recursive) files.push(...listSourceFiles(path, { recursive }));
    } else if (/\.(?:[cm]?js|[cm]?ts)$/.test(name)) {
      files.push(path);
    }
  }
  return files;
}

function parse(file) {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  if (source.parseDiagnostics.length) {
    throw new Error(`${file}: ${ts.flattenDiagnosticMessageText(source.parseDiagnostics[0].messageText, "\n")}`);
  }
  return source;
}

/** Extract static, type-only and dynamic module references from an AST. */
export function moduleSpecifiers(file) {
  const source = parse(file);
  const found = [];
  for (const { fileName } of [...source.referencedFiles, ...source.typeReferenceDirectives, ...source.libReferenceDirectives]) {
    found.push({ specifier: fileName, kind: "reference" });
  }
  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      found.push({ specifier: node.moduleSpecifier.text, kind: node.importClause ? "static" : "side-effect" });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      found.push({ specifier: node.moduleSpecifier.text, kind: "re-export" });
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      found.push({ specifier: node.moduleReference.expression.text, kind: "static" });
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      found.push({ specifier: node.argument.literal.text, kind: "dynamic" });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const argument = node.arguments[0];
      found.push(argument && ts.isStringLiteralLike(argument)
        ? { specifier: argument.text, kind: "dynamic" }
        : { specifier: "<non-literal>", kind: "dynamic-unresolvable" });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}

/** Print the parsed module without comments, leaving string literals intact. */
export function codeWithoutComments(file) {
  return ts.createPrinter({ removeComments: true }).printFile(parse(file));
}

/** Resolve emitted .js specifiers back to .ts when inspecting source. */
export function resolveSpecifier(file, specifier) {
  const target = resolve(dirname(file), specifier.split("?")[0]);
  if (file.endsWith(".ts") && !existsSync(target) && target.endsWith(".js")) {
    for (const extension of [".ts", ".d.ts"]) {
      const source = target.slice(0, -3) + extension;
      if (existsSync(source)) return source;
    }
  }
  return target;
}

export function isInside(dir, path) {
  const base = resolve(dir);
  return path === base || path.startsWith(base + sep);
}
