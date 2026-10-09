// @vitest-environment node
import { readFileSync } from "node:fs";
import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";

describe("team notebook migration", () => {
  it("rolls back an interrupted collaboration upgrade so both columns can be retried", async () => {
    const db = createClient({url:'file::memory:'});
    try {
      await db.execute('CREATE TABLE notebook_pages(id INTEGER PRIMARY KEY)');
      const sql = readFileSync(new URL('../versions/112-notebook-collaboration.sql',import.meta.url),'utf8');
      await expect(db.executeMultiple(sql.slice(0,sql.indexOf('ALTER TABLE notebook_pages ADD COLUMN crdt_epoch')) + 'SELECT * FROM interrupted_migration;')).rejects.toThrow();
      expect((await db.execute('PRAGMA table_info(notebook_pages)')).rows.map(r=>r.name)).toEqual(['id']);
      await db.executeMultiple(sql);
      expect((await db.execute('PRAGMA table_info(notebook_pages)')).rows.map(r=>r.name)).toEqual(['id','crdt_state','crdt_epoch']);
    } finally { db.close(); }
  });
  it("upgrades default member roles without touching private notebooks or custom permissions", async () => {
    const db = createClient({ url: "file::memory:" });
    try {
      await db.executeMultiple(`
        CREATE TABLE teams(id INTEGER PRIMARY KEY);
        CREATE TABLE members(id INTEGER PRIMARY KEY);
        CREATE TABLE roles(name TEXT, is_system INTEGER, permissions TEXT);
        INSERT INTO teams VALUES(1);
        INSERT INTO members VALUES(1);
        INSERT INTO roles VALUES('Admin',1,'["*"]'),('Member',1,'["view_ai"]'),
          ('Verified Member',1,'["manage_documentation"]'),('Read-only custom',0,'[]'),
          ('Member',0,'[]'),('Malformed system',1,'broken');
        CREATE TABLE nb_notebooks(owner TEXT, title TEXT);
        INSERT INTO nb_notebooks VALUES('private@example.test','Private legacy data');
      `);
      await db.executeMultiple(readFileSync(new URL("../versions/111-team-notebook.sql", import.meta.url), "utf8"));
      const roles = (await db.execute("SELECT * FROM roles")).rows;
      expect(JSON.parse(String(roles.find(r => r.name === "Member" && r.is_system === 1)!.permissions))).toEqual(["view_ai", "edit_notebook", "organize_notebook"]);
      expect(JSON.parse(String(roles.find(r => r.name === "Verified Member")!.permissions))).toContain("edit_notebook");
      expect(roles.find(r => r.name === "Read-only custom")!.permissions).toBe("[]");
      expect(roles.find(r => r.name === "Member" && r.is_system === 0)!.permissions).toBe("[]");
      expect(roles.find(r => r.name === "Admin")!.permissions).toBe('["*"]');
      expect((await db.execute("SELECT * FROM nb_notebooks")).rows[0].title).toBe("Private legacy data");
      expect((await db.execute("SELECT * FROM notebook_books")).rows).toHaveLength(0);
    } finally { db.close(); }
  });
});
