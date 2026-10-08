/**
 * V3.5 bulk actions send only the field that changes. Inventory and CAD BOM
 * updates used to replace every column, so { category } alone blanked the
 * part's name, SKU and count.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });

let t: TestServer;
let admin = "";
beforeAll(async () => {
  t = await startTestServer("cp-patch-");
  const team = await seedTeam(t.db, "Robo");
  admin = await t.session(await seedMember(t.db, team, "Ada", "ada@patch.test", "admin"));
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("partial updates", () => {
  it("inventory: changing the category keeps everything else", async () => {
    const made = await t.post("/api/inventory", { name: "Core Hex Motor", sku: "REV-41-1300", quantity: 4, cost: 21.5, category: "Motion", location: "Bin 3" }, admin);
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    const id = made.body.id;
    expect((await t.patch(`/api/inventory/${id}`, { category: "Electronics" }, admin)).status).toBe(200);
    const row = (await t.db.execute({ sql: "SELECT * FROM inventory WHERE id = ?", args: [id] })).rows[0] as any;
    expect(row).toMatchObject({ name: "Core Hex Motor", sku: "REV-41-1300", quantity: 4, category: "Electronics", location: "Bin 3" });
    expect((await t.patch(`/api/inventory/${id}`, { name: " " }, admin)).status).toBe(400);
  });

  it("CAD BOM: changing the status keeps the rest of the line", async () => {
    const made = await t.post("/api/cad/parts", { name: "Axon servo", section: "Intake", quantity: 2, unit_cost: 40, status: "to_order" }, admin);
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    const id = made.body.id;
    expect((await t.patch(`/api/cad/parts/${id}`, { status: "ordered" }, admin)).status).toBe(200);
    const row = (await t.db.execute({ sql: "SELECT * FROM cad_parts WHERE id = ?", args: [id] })).rows[0] as any;
    expect(row).toMatchObject({ name: "Axon servo", section: "Intake", quantity: 2, unit_cost: 40, status: "ordered" });
  });
});
