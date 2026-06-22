export type ParsedColumn = {
  name: string;
  type: string;
  primaryKey: boolean;
  references?: { table: string; column?: string };
};

export type ParsedTable = {
  name: string;
  columns: ParsedColumn[];
};

export function parseCreateTables(sql: string): ParsedTable[] {
  const tables: ParsedTable[] = [];
  const tableRe = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)\s*\(([\s\S]*?)\)\s*;/gi;
  let match: RegExpExecArray | null;

  while ((match = tableRe.exec(sql)) !== null) {
    const name = match[1];
    const body = match[2] ?? "";
    if (!name) continue;

    const columns: ParsedColumn[] = [];
    const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      if (/^(PRIMARY KEY|UNIQUE|CONSTRAINT|CREATE INDEX|FOREIGN KEY)/i.test(line)) {
        continue;
      }
      const colMatch = /^(\w+)\s+([\w().,\s]+?)(?:\s+(PRIMARY KEY))?/i.exec(line.replace(/,$/, ""));
      if (!colMatch) continue;

      const colName = colMatch[1];
      const colType = colMatch[2]?.trim() ?? "unknown";
      const primaryKey = /PRIMARY KEY/i.test(line);

      let references: ParsedColumn["references"];
      const refMatch = /REFERENCES\s+(\w+)\s*\((\w+)\)/i.exec(line);
      if (refMatch) {
        references = { table: refMatch[1]!, column: refMatch[2] };
      }

      columns.push({ name: colName!, type: colType, primaryKey, references });
    }

    tables.push({ name, columns });
  }

  return tables;
}

export function mergeTablesFromFiles(
  files: { path: string; content: string }[],
): ParsedTable[] {
  const byName = new Map<string, ParsedTable>();
  for (const file of files) {
    for (const table of parseCreateTables(file.content)) {
      byName.set(table.name, table);
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function buildSchemaMarkdown(
  tables: ParsedTable[],
  migrationPaths: string[],
): string {
  const lines = ["# Backend Schema Summary", "", "## Migrations", ""];
  for (const path of migrationPaths) {
    lines.push(`- \`${path}\``);
  }
  lines.push("", "## Tables", "");

  if (tables.length === 0) {
    lines.push("_No tables parsed from migrations._", "");
    return lines.join("\n");
  }

  for (const table of tables) {
    lines.push(`### ${table.name}`, "");
    lines.push("| Column | Type | PK | References |");
    lines.push("|--------|------|----|------------|");
    for (const col of table.columns) {
      const ref = col.references
        ? `${col.references.table}${col.references.column ? `.${col.references.column}` : ""}`
        : "";
      lines.push(`| ${col.name} | ${col.type} | ${col.primaryKey ? "yes" : ""} | ${ref} |`);
    }
    lines.push("");
  }

  const relations = new Set<string>();
  for (const table of tables) {
    for (const col of table.columns) {
      if (col.references) {
        relations.add(`${table.name} ||--o{ ${col.references.table} : ${col.name}`);
      }
    }
  }

  if (relations.size > 0) {
    lines.push("## ER Diagram", "", "```mermaid", "erDiagram");
    for (const rel of relations) {
      lines.push(`  ${rel}`);
    }
    for (const table of tables) {
      lines.push(`  ${table.name} {`);
      for (const col of table.columns.slice(0, 8)) {
        const pk = col.primaryKey ? " PK" : "";
        lines.push(`    ${col.type.split("(")[0]} ${col.name}${pk}`);
      }
      lines.push("  }");
    }
    lines.push("```", "");
  }

  return lines.join("\n");
}
