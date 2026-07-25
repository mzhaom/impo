import { readFileSync } from "node:fs";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const appSourceUrl = new URL("../app/(app)/index.tsx", import.meta.url);
const appSource = readFileSync(appSourceUrl, "utf8");
const appSourceFile = ts.createSourceFile(
  appSourceUrl.pathname,
  appSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

function tagName(node: ts.JsxOpeningLikeElement): string {
  return node.tagName.getText(appSourceFile);
}

function enclosingFunctionName(node: ts.Node): string | null {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isFunctionDeclaration(current)) {
      return current.name?.text ?? null;
    }
    current = current.parent;
  }
  return null;
}

function hasLiteralFalseEditable(node: ts.JsxOpeningLikeElement): boolean {
  return node.attributes.properties.some((attribute) => {
    if (!ts.isJsxAttribute(attribute) || attribute.name.getText(appSourceFile) !== "editable") {
      return false;
    }
    return (
      !!attribute.initializer &&
      ts.isJsxExpression(attribute.initializer) &&
      attribute.initializer.expression?.kind === ts.SyntaxKind.FalseKeyword
    );
  });
}

function lineOf(node: ts.Node): number {
  return appSourceFile.getLineAndCharacterOfPosition(node.getStart(appSourceFile)).line + 1;
}

describe("Vision text-input guard", () => {
  it("keeps every editable TextInput behind the Vision-aware wrapper", () => {
    const violations: string[] = [];
    let wrapperFound = false;
    let wrapperHasVisionGuard = false;

    const visit = (node: ts.Node) => {
      if (ts.isFunctionDeclaration(node) && node.name?.text === "KeyboardTextInput") {
        wrapperFound = true;
        wrapperHasVisionGuard =
          !!node.body &&
          node.body.statements.some(
            (statement) =>
              ts.isIfStatement(statement) &&
              statement.expression.getText(appSourceFile) === "useVisionControls()" &&
              ts.isReturnStatement(statement.thenStatement) &&
              statement.thenStatement.expression?.kind === ts.SyntaxKind.NullKeyword,
          );
      }

      const opening = ts.isJsxSelfClosingElement(node)
        ? node
        : ts.isJsxElement(node)
          ? node.openingElement
          : null;
      if (opening && tagName(opening) === "TextInput") {
        const insideWrapper = enclosingFunctionName(opening) === "KeyboardTextInput";
        if (!insideWrapper && !hasLiteralFalseEditable(opening)) {
          violations.push(`raw editable TextInput at line ${lineOf(opening)}`);
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(appSourceFile);

    expect(wrapperFound).toBe(true);
    expect(wrapperHasVisionGuard).toBe(true);
    expect(violations).toEqual([]);
  });
});

describe("Terminal ANSI rendering", () => {
  it("keeps terminal output on the styled ANSI renderer instead of a plain TextInput", () => {
    const terminalOutputs: Array<{ tag: string; contents: string }> = [];

    const visit = (node: ts.Node) => {
      const opening = ts.isJsxSelfClosingElement(node)
        ? node
        : ts.isJsxElement(node)
          ? node.openingElement
          : null;
      const accessibilityLabel = opening?.attributes.properties.find(
        (attribute) =>
          ts.isJsxAttribute(attribute) &&
          attribute.name.getText(appSourceFile) === "accessibilityLabel" &&
          attribute.initializer &&
          ts.isStringLiteral(attribute.initializer) &&
          attribute.initializer.text === "Terminal output",
      );

      if (opening && accessibilityLabel) {
        terminalOutputs.push({
          tag: tagName(opening),
          contents: node.getText(appSourceFile),
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(appSourceFile);

    expect(terminalOutputs).toHaveLength(1);
    expect(terminalOutputs[0].tag).toBe("Text");
    expect(terminalOutputs[0].contents).toContain("terminalNodes");
    expect(terminalOutputs[0].contents).not.toContain("terminalPlainText");
    expect(appSource).toContain(
      "const terminalNodes = React.useMemo(() => renderAnsiText(terminalText), [terminalText]);",
    );
  });
});

describe("Terminal fullscreen behavior", () => {
  it("opens windowed and keeps a one-tap close action in fullscreen", () => {
    expect(appSource).toContain(
      "const [terminalFullscreen, setTerminalFullscreen] = React.useState(false);",
    );
    expect(appSource).not.toContain(
      "const [terminalFullscreen, setTerminalFullscreen] = React.useState(windowWidth >= 760);",
    );
    expect(appSource).toContain(
      "onCloseTerminal={terminalFullscreen ? closeTerminalModal : undefined}",
    );
    expect(appSource).toContain('accessibilityLabel="Close terminal"');
    expect(appSource).toContain("onClose={closeTerminalModal}");
    expect(appSource).toContain("setTerminalFullscreen(false);");
  });
});
