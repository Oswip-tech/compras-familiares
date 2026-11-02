/* eslint-disable no-console */
"use strict";

global.window = global;
require("../data.js");
require("../catalog-supermaxi.js");

const items = global.SHOPPING_ITEMS;
const catalog = global.SUPERMAXI_CATALOG;
const errors = [];
const ids = new Set();
let optionCount = 0;
let verifiedCount = 0;

for (const item of items) {
  const product = catalog.products[item.id];
  if (!product?.presentations?.length) {
    errors.push(`${item.id}: sin presentaciones`);
    continue;
  }
  if (!product.presentations.some((entry) => entry.id === product.defaultPresentationId)) {
    errors.push(`${item.id}: presentación predeterminada inexistente`);
  }
  for (const presentation of product.presentations) {
    optionCount += 1;
    if (!presentation.id || ids.has(presentation.id)) errors.push(`${item.id}: id duplicado o vacío ${presentation.id || "(vacío)"}`);
    ids.add(presentation.id);
    if (!(Number(presentation.packQty) > 0) || !presentation.packUnit) errors.push(`${presentation.id}: cantidad/unidad inválida`);
    if (presentation.storeId !== 741) errors.push(`${presentation.id}: local distinto de Wayra 741`);
    if (presentation.priceStatus === "verified") {
      verifiedCount += 1;
      for (const key of ["price", "capturedAt", "productId", "sku", "barcode", "sourceUrl"]) {
        if (presentation[key] == null || presentation[key] === "") errors.push(`${presentation.id}: falta ${key}`);
      }
    }
  }
}

for (const productId of Object.keys(catalog.products)) {
  if (!items.some((item) => item.id === productId)) errors.push(`${productId}: catálogo sin producto base`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ products: items.length, options: optionCount, verifiedPrices: verifiedCount, storeId: catalog.store.id }, null, 2));
}
