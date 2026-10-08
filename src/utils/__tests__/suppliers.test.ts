import { describe, it, expect } from 'vitest';
import { cleanPurchaseUrl, detectSupplier, partSupplier, purchaseLink, supplierLabel } from '../suppliers';

describe('supplier detection', () => {
  it('reads the link first, then the SKU format, then the name', () => {
    expect(detectSupplier({ url: 'https://www.revrobotics.com/rev-41-1600/', sku: '3110-0001-0001' })).toBe('rev');
    expect(detectSupplier({ sku: 'REV-41-1600' })).toBe('rev');
    expect(detectSupplier({ sku: '2000-0025-0002' })).toBe('gobilda');
    expect(detectSupplier({ sku: '5027103001', name: 'Hub mount' })).toBe('gobilda');
    expect(detectSupplier({ sku: 'am-2985' })).toBe('andymark');
    expect(detectSupplier({ sku: '91251A540' })).toBe('mcmaster');
    expect(detectSupplier({ sku: 'BOX-12', name: 'Axon Max+ servo' })).toBe('axon');
    expect(detectSupplier({ sku: 'X1', name: 'goBILDA 2000 Series Dual Mode Servo' })).toBe('gobilda');
    expect(detectSupplier({ sku: 'X1', name: 'Zip ties' })).toBeNull();
    // "rev" inside a word is not REV.
    expect(detectSupplier({ name: 'reversible ratchet' })).toBeNull();
  });

  it('a saved supplier wins over detection; unknown saved values are ignored', () => {
    expect(partSupplier({ supplier: 'studica', sku: 'REV-41-1600' })).toBe('studica');
    expect(partSupplier({ supplier: 'nope', sku: 'REV-41-1600' })).toBe('rev');
    expect(supplierLabel('gobilda')).toBe('goBILDA');
  });
});

describe('purchase links', () => {
  it('uses the saved link, else the supplier page for its own SKU, else a name search', () => {
    expect(purchaseLink({ url: 'gobilda.com/x', sku: 'REV-41-1600' })).toBe('https://gobilda.com/x');
    expect(purchaseLink({ sku: 'REV-41-1600' })).toBe('https://www.revrobotics.com/rev-41-1600/');
    expect(purchaseLink({ sku: '2000-0025-0002' })).toBe('https://www.gobilda.com/search.php?search_query=2000-0025-0002');
    expect(purchaseLink({ sku: 'BOX-12', name: 'Axon Mini+' })).toBe('https://axon-robotics.com/search?q=Axon%20Mini%2B');
    expect(purchaseLink({ sku: 'BOX-12', name: 'Zip ties' })).toBeNull();
  });

  it('only accepts http(s) links', () => {
    expect(cleanPurchaseUrl('javascript:alert(1)')).toBeNull();
    expect(cleanPurchaseUrl('ftp://x.com/a')).toBeNull();
    expect(cleanPurchaseUrl('localhost')).toBeNull();
    expect(cleanPurchaseUrl(' www.andymark.com/products/x ')).toBe('https://www.andymark.com/products/x');
    const long = `https://www.amazon.com/dp/B0?${'q=1&'.repeat(400)}`;
    expect(cleanPurchaseUrl(long)).toBe(long);
    expect(cleanPurchaseUrl(`${long}${'x'.repeat(2000)}`)).toBeNull();
  });
});
