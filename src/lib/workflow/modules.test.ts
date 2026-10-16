import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { WorkflowError } from "@/lib/workflow";
import { WorkflowError as DomainWorkflowError } from "./shared";

describe("workflow module boundaries", () => {
  it("keeps the existing error class identity through the facade", () => {
    expect(WorkflowError).toBe(DomainWorkflowError);
  });

  it("keeps the public entry point a re-export-only facade", () => {
    const file = readFileSync(resolve("src/lib/workflow.ts"), "utf8");
    const source = ts.createSourceFile(
      "workflow.ts",
      file,
      ts.ScriptTarget.Latest,
      true,
    );
    expect(source.statements.every(ts.isExportDeclaration)).toBe(true);
    expect(source.statements.length).toBeGreaterThan(0);
  });

  it("has no runtime import cycles or imports back through the facade", () => {
    const root = resolve("src/lib/workflow");
    const files = readdirSync(root).filter(
      (file) => file.endsWith(".ts") && !file.endsWith(".test.ts"),
    );
    const graph = new Map<string, string[]>();
    for (const file of files) {
      const path = resolve(root, file);
      const source = ts.createSourceFile(
        path,
        readFileSync(path, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      const deps: string[] = [];
      for (const node of source.statements) {
        if (!ts.isImportDeclaration(node) || node.importClause?.isTypeOnly)
          continue;
        const specifier = (node.moduleSpecifier as ts.StringLiteral).text;
        expect(specifier).not.toBe("@/lib/workflow");
        if (specifier.startsWith("."))
          deps.push(resolve(dirname(path), `${specifier}.ts`));
      }
      graph.set(path, deps);
    }
    const visited = new Set<string>();
    function walk(file: string, stack: string[]) {
      expect(
        stack,
        `Circular import: ${[...stack, file].join(" -> ")}`,
      ).not.toContain(file);
      if (visited.has(file)) return;
      for (const dep of graph.get(file) ?? []) walk(dep, [...stack, file]);
      visited.add(file);
    }
    for (const file of graph.keys()) walk(file, []);
  });
});
