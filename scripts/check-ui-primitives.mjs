import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import ts from "typescript";

const root = resolve(process.cwd(), "apps/web/src");
const sourceExtensions = new Set([".ts", ".tsx"]);
const nativeControls = new Set([
  "button",
  "input",
  "textarea",
  "select",
  "label",
  "fieldset",
  "legend",
  "details",
  "summary",
  "dialog",
]);
const retiredDaisyClasses = new Set([
  "form-control",
  "input-bordered",
  "select-bordered",
  "textarea-bordered",
  "file-input-bordered",
]);
const failures = [];

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function attributeOf(opening, name) {
  return opening.attributes.properties.find(
    (property) => ts.isJsxAttribute(property) && property.name.text === name,
  );
}

function staticClassNames(attribute) {
  if (!attribute?.initializer) return [];
  if (ts.isStringLiteral(attribute.initializer)) {
    return attribute.initializer.text.split(/\s+/).filter(Boolean);
  }
  if (
    !ts.isJsxExpression(attribute.initializer) ||
    !attribute.initializer.expression
  ) {
    return [];
  }

  const values = [];
  function collect(node) {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      values.push(node.text);
      return;
    }
    ts.forEachChild(node, collect);
  }
  collect(attribute.initializer.expression);
  return values.flatMap((value) => value.split(/\s+/).filter(Boolean));
}

function inspectJsxElement(path, sourceFile, opening) {
  const tagName = opening.tagName.getText(sourceFile);
  const line = lineOf(sourceFile, opening);
  const displayPath = relative(process.cwd(), path);

  if (nativeControls.has(tagName)) {
    failures.push(`${displayPath}:${line} native UI element: <${tagName}>`);
  }

  const classes = new Set(staticClassNames(attributeOf(opening, "className")));
  for (const retired of retiredDaisyClasses) {
    if (classes.has(retired)) {
      failures.push(
        `${displayPath}:${line} retired daisyUI v4 class: ${retired}`,
      );
    }
  }

  if (tagName !== "Button") return;
  let replacement;
  if (classes.has("card")) replacement = "ActionCard";
  else if (classes.has("tab")) replacement = "Tab";
  else if (classes.has("modal-backdrop")) replacement = "ActionSurface";
  else if (
    classes.has("absolute") &&
    !classes.has("btn") &&
    !attributeOf(opening, "tone")
  ) {
    replacement = "ActionSurface";
  }
  if (replacement) {
    failures.push(
      `${displayPath}:${line} Button has structural styling; use ${replacement}`,
    );
  }
}

async function inspect(path) {
  const source = await readFile(path, "utf8");
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      inspectJsxElement(path, sourceFile, node);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await visit(path);
    else if (sourceExtensions.has(extname(entry.name))) await inspect(path);
  }
}

await visit(root);

if (failures.length) {
  console.error(
    ["Application UI must be composed from @aow/ui primitives.", ...failures].join(
      "\n",
    ),
  );
  process.exitCode = 1;
} else {
  console.log("UI primitive boundary verified.");
}
