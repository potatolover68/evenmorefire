import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import ts from "typescript";

const SOURCE_URL = `https://raw.githubusercontent.com/wikimedia-gadgets/twinkle/master/src/morebits.js`;
const VENDOR_PATH = "vendor/morebits.js";
const OUTPUT_PATH = "userscript/morebits.d.ts";

const response = await fetch(SOURCE_URL);
if (!response.ok) {
  throw new Error(`download failed: ${response.status} ${SOURCE_URL}`);
}
const source = await response.text();
const open = source.indexOf("(function() {");
const close = source.indexOf("}());", open);
if (open < 0 || close < 0) {
  throw new Error("morebits.js wrapper not found");
}
const hoisted =
  source.slice(0, open) +
  source.slice(open + "(function() {".length, close) +
  source.slice(close + "}());".length);
const printable = hoisted
  .replace(/([=:,(]\s*)function\s+[A-Za-z0-9_$]+\s*\(/g, "$1function (")
  .replace("const Morebits = {}", "var Morebits = {}");
mkdirSync(dirname(VENDOR_PATH), { recursive: true });
writeFileSync(VENDOR_PATH, printable);
const program = ts.createProgram(["vendor/jquery-stub.d.ts", VENDOR_PATH], {
  allowJs: true,
  checkJs: true,
  strict: false,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
  skipLibCheck: true,
  noEmit: true,
});
const checker = program.getTypeChecker();
const sourceFile = program.getSourceFile(VENDOR_PATH);
let declaration;
function visit(node) {
  if (
    ts.isVariableDeclaration(node) &&
    node.name.getText(sourceFile) === "Morebits"
  )
    declaration = node;
  ts.forEachChild(node, visit);
}
visit(sourceFile);
if (!declaration) throw new Error("Morebits declaration not found");

const anchor = declaration;
const names = new Map();
const interfaces = new Map();

function primitive(type) {
  const flags = ts.TypeFlags;
  return (
    (type.flags &
      (flags.Any |
        flags.Unknown |
        flags.String |
        flags.Number |
        flags.Boolean |
        flags.BigInt |
        flags.ESSymbol |
        flags.Void |
        flags.Undefined |
        flags.Null |
        flags.Never |
        flags.NonPrimitive |
        flags.StringLiteral |
        flags.NumberLiteral |
        flags.BooleanLiteral |
        flags.BigIntLiteral |
        flags.Enum |
        flags.EnumLiteral |
        flags.UniqueESSymbol)) !==
    0
  );
}

function rendered(type) {
  return checker
    .typeToString(
      type,
      anchor,
      ts.TypeFormatFlags.NoTruncation |
        ts.TypeFormatFlags.UseStructuralFallback,
    )
    .replace(/\bfalse \| true\b/g, "boolean")
    .replace(/\btrue \| false\b/g, "boolean")
    .replace(/object<([^<>]+)>/g, "Record<$1>")
    .replace(/\bjQuery\.promise\b/g, "JQuery.Promise")
    .replace(/\bjQuery\.Promise\b/g, "JQuery.Promise");
}

function ownedByMorebits(type) {
  const file = type.symbol?.declarations?.[0]?.getSourceFile().fileName ?? "";
  return file.endsWith("morebits.js");
}

function expandable(type) {
  if (primitive(type) || !ownedByMorebits(type)) return false;
  return (
    type.getCallSignatures().length > 0 ||
    type.getConstructSignatures().length > 0 ||
    checker.getPropertiesOfType(type).length > 0
  );
}

const SKIP_TAGS = new Set([
  "memberof",
  "class",
  "namespace",
  "lends",
  "constructor",
  "typedef",
  "type",
  "extends",
  "implements",
  "augments",
  "template",
  "callback",
  "function",
  "method",
  "instance",
  "static",
  "member",
  "kind",
  "name",
  "override",
  "satisfies",
  "overload",
  "import",
  "enum",
  "this",
]);

function readTags(source) {
  if (typeof source.getParameters === "function") return source.getJsDocTags();
  return source.getJsDocTags(checker);
}

function docLines(source) {
  if (!source?.getDocumentationComment) return [];
  const summary = ts
    .displayPartsToString(source.getDocumentationComment(checker))
    .replace(/\r\n/g, "\n")
    .trim();
  const tags = [];
  for (const tag of readTags(source)) {
    if (SKIP_TAGS.has(tag.name)) continue;
    const text = ts
      .displayPartsToString(tag.text)
      .replace(/\r\n/g, "\n")
      .trim();
    if (!text) continue;
    if (
      (tag.name === "param" || tag.name === "arg" || tag.name === "argument") &&
      /^[A-Za-z0-9_$.]+$/.test(text)
    ) {
      continue;
    }
    if (
      (tag.name === "return" || tag.name === "returns") &&
      text.replace(/[-\s]/g, "") === ""
    ) {
      continue;
    }
    const [first, ...rest] = text.split("\n");
    tags.push(`@${tag.name} ${first}`.trimEnd(), ...rest);
  }
  if (!summary && tags.length === 0) return [];
  const lines = ["/**"];
  if (summary) {
    for (const line of summary.split("\n")) {
      lines.push(` * ${line.replace(/\*\//g, "*\\/")}`.trimEnd());
    }
  }
  if (summary && tags.length) lines.push(" *");
  for (const line of tags)
    lines.push(` * ${line.replace(/\*\//g, "*\\/")}`.trimEnd());
  lines.push(" */");
  return lines;
}

function describe(type, path) {
  if (type.isUnion())
    return [...new Set(type.types.map((part) => describe(part, path)))].join(
      " | ",
    );
  if (type.isIntersection())
    return type.types.map((part) => describe(part, path)).join(" & ");
  if (!expandable(type)) return rendered(type);
  return emit(type, path);
}

function emit(type, path) {
  if (names.has(type)) return names.get(type);
  let name = path.join("_");
  if (interfaces.has(name)) name = `${name}_${interfaces.size}`;
  names.set(type, name);
  interfaces.set(name, "");
  const lines = [];
  for (const signature of type.getConstructSignatures()) {
    const instance = checker.getReturnTypeOfSignature(signature);
    lines.push(
      ...docLines(signature),
      `new ${parameters(signature, path)}: ${describe(instance, [...path, "Instance"])}`,
    );
  }
  for (const signature of type.getCallSignatures()) {
    const result = checker.getReturnTypeOfSignature(signature);
    lines.push(
      ...docLines(signature),
      `${parameters(signature, path)}: ${describe(result, [...path, "Result"])}`,
    );
  }
  for (const property of checker.getPropertiesOfType(type)) {
    if (property.getName() === "prototype") continue;
    const propertyType = checker.getTypeOfSymbolAtLocation(
      property,
      property.valueDeclaration ?? anchor,
    );
    const optional = property.flags & ts.SymbolFlags.Optional ? "?" : "";
    lines.push(
      ...docLines(property),
      `${safe(property.getName())}${optional}: ${describe(propertyType, [...path, property.getName()])}`,
    );
  }
  const instance =
    type.getConstructSignatures()[0] &&
    checker.getReturnTypeOfSignature(type.getConstructSignatures()[0]);
  if (instance && names.has(instance))
    lines.push(`prototype: ${names.get(instance)}`);
  interfaces.set(name, lines.join("\n    "));
  return name;
}

function parameters(signature, path) {
  return `(${signature
    .getParameters()
    .map((parameter) => {
      const node = parameter.valueDeclaration;
      const optional =
        parameter.flags & ts.SymbolFlags.Optional ||
        node?.questionToken ||
        node?.initializer
          ? "?"
          : "";
      const parameterType = checker.getTypeOfSymbolAtLocation(
        parameter,
        node ?? anchor,
      );
      return `${safe(parameter.getName())}${optional}: ${describe(parameterType, [...path, parameter.getName()])}`;
    })
    .join(", ")})`;
}

function safe(name) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

const morebits = checker.getTypeOfSymbolAtLocation(
  checker.getSymbolAtLocation(declaration.name),
  declaration,
);
const root = emit(morebits, ["Morebits"]);
const body = [...interfaces]
  .map(([name, members]) => `  interface ${name} {\n    ${members}\n  }`)
  .join("\n");
if (
  body.length < 500 ||
  !body.includes("load") ||
  !body.includes("Loads the text for the page.") ||
  !body.includes("@param onSuccess")
) {
  throw new Error(
    `Morebits declaration looks incomplete (${body.length} chars)`,
  );
}
mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(
  OUTPUT_PATH,
  `/** Generated from ${SOURCE_URL}. Do not edit. */\nexport {}\ndeclare global {\n${body}\n  const Morebits: ${root}\n}\n`,
);
console.log(
  `wrote ${OUTPUT_PATH} (${body.length} chars, ${interfaces.size} interfaces)`,
);
