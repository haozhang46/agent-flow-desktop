import { describe, expect, it } from "vitest";
import {
  buildSchemaMarkdown,
  mergeTablesFromFiles,
  parseCreateTables,
} from "../../src/utils/parseSqlMigrations";

const SAMPLE = `
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE document_chunks (
  id UUID PRIMARY KEY,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL
);
`;

describe("parseSqlMigrations", () => {
  it("parses CREATE TABLE statements", () => {
    const tables = parseCreateTables(SAMPLE);
    expect(tables.map((t) => t.name)).toEqual(["documents", "document_chunks"]);
    expect(tables[1]?.columns.some((c) => c.references?.table === "documents")).toBe(true);
  });

  it("merges tables from multiple files", () => {
    const merged = mergeTablesFromFiles([
      { path: "001.sql", content: SAMPLE },
      { path: "002.sql", content: "CREATE TABLE users (id UUID PRIMARY KEY);" },
    ]);
    expect(merged.map((t) => t.name)).toEqual(["document_chunks", "documents", "users"]);
  });

  it("builds schema markdown with erDiagram", () => {
    const tables = parseCreateTables(SAMPLE);
    const md = buildSchemaMarkdown(tables, ["backend/migrations/001_documents.sql"]);
    expect(md).toContain("# Backend Schema Summary");
    expect(md).toContain("### documents");
    expect(md).toContain("erDiagram");
    expect(md).toContain("document_chunks");
  });
});
