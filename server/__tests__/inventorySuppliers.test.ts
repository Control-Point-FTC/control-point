/**
 * V3.5 phase 5 inventory: parts keep a purchase link and a supplier
 * (detected when not chosen), invoice imports record who sells each line,
 * and the REV import accepts a link or a bare SKU and still fills the SKU
 * and link when REV's page can't be read.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";
import { parseRevProduct, revTarget } from "../revImport";

vi.setConfig({ testTimeout: 30_000 });

let t: TestServer;
let admin = "";
let team = 0;
beforeAll(async () => {
  t = await startTestServer("cp-inv-sup-");
  team = await seedTeam(t.db, "Robo");
  admin = await t.session(await seedMember(t.db, team, "Ada", "ada@inv.test", "admin"));
}, 120_000);
afterAll(async () => { await t?.stop(); });

const row = async (id: number) => (await t.db.execute({ sql: "SELECT * FROM inventory WHERE id = ?", args: [id] })).rows[0] as any;

describe("purchase link and supplier", () => {
  it("detects the supplier when none is chosen, keeps a chosen one, and validates both", async () => {
    const gb = await t.post("/api/inventory", { name: "Yellow Jacket motor", sku: "5203-2402-0019" }, admin);
    expect(gb.status, JSON.stringify(gb.body)).toBe(200);
    expect(await row(gb.body.id)).toMatchObject({ supplier: "gobilda", url: null });

    const ax = await t.post("/api/inventory", { name: "Servo", sku: "SV-1", supplier: "axon", url: "axon-robotics.com/products/max" }, admin);
    expect(await row(ax.body.id)).toMatchObject({ supplier: "axon", url: "https://axon-robotics.com/products/max" });

    expect((await t.post("/api/inventory", { name: "X", sku: "X-1", url: "javascript:alert(1)" }, admin)).status).toBe(400);
    expect((await t.post("/api/inventory", { name: "X", sku: "X-2", supplier: "acme" }, admin)).status).toBe(400);
    // Too long is refused, never saved shortened.
    const long = await t.post("/api/inventory", { name: "X", sku: "X-3", url: `https://www.amazon.com/dp/B0?${"q=1&".repeat(600)}` }, admin);
    expect(long.status).toBe(400);
    expect(long.body.error).toMatch(/too long/);

    // PATCH: only what's sent; "" clears the link, "auto" clears the choice.
    expect((await t.patch(`/api/inventory/${ax.body.id}`, { url: "", supplier: "auto" }, admin)).status).toBe(200);
    expect(await row(ax.body.id)).toMatchObject({ supplier: null, url: null, name: "Servo" });
    expect((await t.patch(`/api/inventory/${ax.body.id}`, { quantity: 3 }, admin)).status).toBe(200);
    expect(await row(ax.body.id)).toMatchObject({ supplier: null, quantity: 3 });
  });

  it("invoice imports record each line's supplier and keep an existing part's link", async () => {
    const r = await t.post("/api/inventory/import-invoice/confirm", { items: [
      { sku: "REV-41-1600", name: "Ultra 90", quantity: 2, cost: 49, category: "Motion" },
      { sku: "SRV-77", name: "Axon Mini+ servo", quantity: 1, cost: 30, category: "Motion", supplier: "axon" },
    ] }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const rows = (await t.db.execute({ sql: "SELECT sku, supplier FROM inventory WHERE team_id = ? AND sku IN ('REV-41-1600','SRV-77') ORDER BY sku", args: [team] })).rows as any[];
    expect(rows.map((x) => [x.sku, x.supplier])).toEqual([["REV-41-1600", "rev"], ["SRV-77", "axon"]]);
  });
});

describe("REV import", () => {
  it("turns links and SKUs into the canonical product page", () => {
    expect(revTarget("REV-41-1600")).toEqual({ url: "https://www.revrobotics.com/rev-41-1600/", sku: "REV-41-1600" });
    expect(revTarget("revrobotics.com/rev-41-1600?utm_source=x#reviews")).toEqual({ url: "https://www.revrobotics.com/rev-41-1600/", sku: "REV-41-1600" });
    expect(revTarget("http://www.revrobotics.com/Control-Hub")).toEqual({ url: "https://www.revrobotics.com/Control-Hub/", sku: null });
    expect(revTarget("https://evil.example/revrobotics.com")).toBeNull();
    expect(revTarget("")).toBeNull();
  });

  it("reads structured data first, then the old theme selectors", () => {
    const ld = `<script type="application/ld+json">{"@type":"Product","name":"UltraPlanetary Gearbox Kit","sku":"REV-41-1600","offers":{"price":"49.99"}}</script>`;
    expect(parseRevProduct(ld)).toMatchObject({ name: "UltraPlanetary Gearbox Kit", sku: "REV-41-1600", cost: 49.99 });
    const theme = `<h1 class="productView-title">Core Hex Motor</h1><dd class="productView-info-value--sku">REV-41-1300</dd><span class="price price--withoutTax price--main">$22.00</span>`;
    expect(parseRevProduct(theme)).toMatchObject({ name: "Core Hex Motor", sku: "REV-41-1300", cost: 22 });
    expect(parseRevProduct(`<meta property="og:title" content="Servo Hub | REV Robotics">`)).toMatchObject({ name: "Servo Hub" });
    // Breadcrumbs and the store also carry itemprop="name": only the Product's own counts.
    const micro = `<ol itemscope itemtype="https://schema.org/BreadcrumbList"><li itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem"><span itemprop="name">Motion</span></li></ol>
      <div itemscope itemtype="https://schema.org/Product"><h1 itemprop="name">Smart Robot Servo</h1><span itemprop="sku">REV-41-1097</span>
        <div itemprop="brand" itemscope itemtype="https://schema.org/Brand"><span itemprop="name">REV Robotics</span></div>
        <meta itemprop="price" content="34.00"></div>`;
    expect(parseRevProduct(micro)).toMatchObject({ name: "Smart Robot Servo", sku: "REV-41-1097", cost: 34 });
  });

  it("rejects anything that isn't REV; a REV link always comes back with its SKU and link", async () => {
    expect((await t.post("/api/inventory/scrape-rev", { url: "https://www.gobilda.com/x" }, admin)).status).toBe(400);
    // Whether or not REV's page is reachable from here, the SKU and link come back.
    const r = await t.post("/api/inventory/scrape-rev", { url: "REV-41-1600" }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ sku: "REV-41-1600", url: "https://www.revrobotics.com/rev-41-1600/", supplier: "rev" });
  });
});
