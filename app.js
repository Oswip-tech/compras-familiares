(() => {
  "use strict";

  const APP_VERSION = "2.1.2";
  const STORAGE_KEY = "shoppingPlanner:v1";
  const SCHEMA_VERSION = 2;

  const CATEGORY_META = {
    despensa: { label: "Despensa", icon: "<svg viewBox='0 0 24 24'><path d='M4 9h16v11H4zM7 9V5h10v4M8 13h8'/></svg>" },
    "proteinas-lacteos": { label: "Proteínas y lácteos", icon: "<svg viewBox='0 0 24 24'><path d='M8 3h8l2 5v12H6V8zM9 8h6M9 12h6'/></svg>" },
    "verduras-tuberculos": { label: "Verduras y tubérculos", icon: "<svg viewBox='0 0 24 24'><path d='M12 21c-5 0-8-3-8-7 0-3 2-5 5-5 0-3 2-6 5-6 3 0 5 3 5 6 1 1 2 3 1 5 0 4-3 7-8 7Z'/><path d='M12 21V9m0 4-4-2m4 6 5-3'/></svg>" },
    "frutas-pan": { label: "Frutas y pan", icon: "<svg viewBox='0 0 24 24'><path d='M12 7c5-4 9 0 8 5-1 6-5 9-8 9s-7-3-8-9c-1-5 3-9 8-5Z'/><path d='M12 7c0-3 2-5 5-5m-5 5C9 5 8 3 8 2'/></svg>" },
    lavanderia: { label: "Lavandería", icon: "<svg viewBox='0 0 24 24'><rect x='4' y='2' width='16' height='20' rx='2'/><circle cx='12' cy='14' r='5'/><path d='M7 6h3m3 0h1'/></svg>" },
    "cocina-pisos": { label: "Cocina y pisos", icon: "<svg viewBox='0 0 24 24'><path d='m7 3 10 10m-8-8-5 5 10 10 5-5M4 20h7'/></svg>" },
    "bano-papel": { label: "Baño y papel", icon: "<svg viewBox='0 0 24 24'><path d='M5 3h10a4 4 0 0 1 0 8H5z'/><circle cx='15' cy='7' r='1'/><path d='M5 11v10h8v-8'/></svg>" },
    "higiene-personal": { label: "Higiene personal", icon: "<svg viewBox='0 0 24 24'><path d='M9 3h6v4H9zM7 7h10v14H7zM10 11h4'/></svg>" },
  };

  const UNIT_META = {
    kg: { family: "mass", factor: 1000 },
    g: { family: "mass", factor: 1 },
    L: { family: "volume", factor: 1000 },
    ml: { family: "volume", factor: 1 },
    m: { family: "length", factor: 1 },
    unidades: { family: "count", factor: 1 },
    latas: { family: "cans", factor: 1 },
    paquetes: { family: "packs", factor: 1 },
    rollos: { family: "rolls", factor: 1 },
    bandejas: { family: "trays", factor: 1 },
  };

  const CADENCE_DAYS = { weekly: 7, fortnightly: 15, monthly: 30 };
  const CADENCE_LABELS = { weekly: "semanal", fortnightly: "quincenal", monthly: "mensual" };
  const STATUS_LABELS = { pending: "Pendiente", partial: "Compra parcial", purchased: "Comprado", onhand: "Aún lo tengo", skipped: "No comprar" };
  const dateFormatter = new Intl.DateTimeFormat("es-EC", { day: "numeric", month: "short", year: "numeric" });
  const shortMonthFormatter = new Intl.DateTimeFormat("es-EC", { month: "short" });
  const moneyFormatter = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" });

  let state = loadState();
  let activeStatusFilter = "all";
  let activeView = "shopping";
  let installPrompt = null;
  let toastTimer = null;
  let receiptObjectUrl = null;
  let receiptRenderToken = 0;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function todayISO() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function createCycleId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `cycle-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function parseLocalDate(value) {
    if (!value) return null;
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day, 12, 0, 0);
  }

  function toISODate(date) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + Math.max(0, Math.round(days)));
    return result;
  }

  function formatNumber(value, maximumFractionDigits = 2) {
    if (value == null || Number.isNaN(Number(value))) return "";
    return new Intl.NumberFormat("es-EC", { maximumFractionDigits }).format(Number(value));
  }

  function formatQuantity(value, unit) {
    const singularUnits = {
      unidades: "unidad",
      latas: "lata",
      paquetes: "paquete",
      rollos: "rollo",
      bandejas: "bandeja",
    };
    const label = Math.abs(Number(value) - 1) < 1e-9 ? (singularUnits[unit] || unit) : unit;
    return `${formatNumber(value)} ${label}`;
  }

  function formatMoney(value) {
    return moneyFormatter.format(Number(value) || 0);
  }

  function normalizeText(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }

  function createInitialState() {
    const cycleId = createCycleId();
    return {
      schemaVersion: SCHEMA_VERSION,
      items: window.SHOPPING_ITEMS.map((item) => ({
        ...item,
        brand: "",
        purchaseStatus: "pending",
        quantityPurchased: 0,
        actualUnit: item.unit,
        purchaseDate: "",
        purchaseCycleId: "",
        stockState: "unknown",
        stockQuantity: null,
        stockUnit: item.unit,
        stockCheckedAt: "",
        receiptLabel: "",
        actualLineTotal: null,
        receiptReviewed: false,
        lastUnitPrice: null,
        lastPriceDate: "",
      })),
      settings: {
        defaultCadence: "fortnightly",
        cycleStart: todayISO(),
        cycleId,
        showOptional: true,
        showInactive: false,
      },
      currentReceipt: {
        cycleId,
        date: todayISO(),
        store: "",
        invoiceNumber: "",
        reportedTotal: null,
        reviewedAt: null,
        photoKey: null,
      },
      history: [],
      lastSaved: null,
    };
  }

  function normalizeLoadedState(raw) {
    const initial = createInitialState();
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.items)) return initial;
    const settings = { ...initial.settings, ...(raw.settings || {}) };
    if (!settings.cycleId || typeof settings.cycleId !== "string") settings.cycleId = initial.settings.cycleId;
    const storedById = new Map(raw.items.map((item) => [item.id, item]));
    const items = window.SHOPPING_ITEMS.map((base) => {
      const stored = storedById.get(base.id) || {};
      const merged = { ...base, ...stored };
      const storedQuantity = Object.prototype.hasOwnProperty.call(stored, "monthlyQty")
        ? stored.monthlyQty
        : base.monthlyQty;
      merged.unit = UNIT_META[merged.unit] ? merged.unit : base.unit;
      merged.monthlyQty = storedQuantity == null ? null : normalizeQuantityForUnit(storedQuantity, merged.unit);
      merged.brand = typeof stored.brand === "string" ? stored.brand.trim() : "";
      merged.actualUnit = compatibleUnits(merged.unit).includes(stored.actualUnit) ? stored.actualUnit : merged.unit;
      merged.quantityPurchased = normalizeQuantityForUnit(stored.quantityPurchased || 0, merged.actualUnit);
      merged.purchaseStatus = STATUS_LABELS[stored.purchaseStatus] ? stored.purchaseStatus : "pending";
      merged.planStatus = ["regular", "optional", "inactive"].includes(stored.planStatus) ? stored.planStatus : base.planStatus;
      merged.purchaseCycleId = typeof stored.purchaseCycleId === "string" && stored.purchaseCycleId
        ? stored.purchaseCycleId
        : merged.quantityPurchased > 0 ? settings.cycleId : "";
      merged.stockState = ["unknown", "have", "none"].includes(stored.stockState) ? stored.stockState : "unknown";
      merged.stockUnit = compatibleUnits(merged.unit).includes(stored.stockUnit) ? stored.stockUnit : merged.unit;
      merged.stockQuantity = stored.stockQuantity == null || stored.stockQuantity === ""
        ? null
        : normalizeStockQuantity(stored.stockQuantity);
      merged.stockCheckedAt = typeof stored.stockCheckedAt === "string" ? stored.stockCheckedAt : "";
      merged.receiptLabel = typeof stored.receiptLabel === "string" ? stored.receiptLabel.trim() : "";
      merged.actualLineTotal = stored.actualLineTotal == null || stored.actualLineTotal === ""
        ? null
        : Math.max(0, Number(stored.actualLineTotal) || 0);
      merged.receiptReviewed = Boolean(stored.receiptReviewed);
      merged.lastUnitPrice = stored.lastUnitPrice == null || !Number.isFinite(Number(stored.lastUnitPrice))
        ? null
        : Math.max(0, Number(stored.lastUnitPrice));
      merged.lastPriceDate = typeof stored.lastPriceDate === "string" ? stored.lastPriceDate : "";
      if (merged.purchaseStatus === "onhand" && merged.stockState !== "have") merged.stockState = "have";
      return merged;
    });
    const currentReceipt = {
      ...initial.currentReceipt,
      ...(raw.currentReceipt || {}),
      cycleId: settings.cycleId,
    };
    currentReceipt.date = typeof currentReceipt.date === "string" ? currentReceipt.date : todayISO();
    currentReceipt.store = typeof currentReceipt.store === "string" ? currentReceipt.store : "";
    currentReceipt.invoiceNumber = typeof currentReceipt.invoiceNumber === "string" ? currentReceipt.invoiceNumber : "";
    currentReceipt.reportedTotal = currentReceipt.reportedTotal == null || currentReceipt.reportedTotal === ""
      ? null
      : Math.max(0, Number(currentReceipt.reportedTotal) || 0);
    currentReceipt.photoKey = typeof currentReceipt.photoKey === "string" ? currentReceipt.photoKey : null;
    return {
      ...initial,
      ...raw,
      schemaVersion: SCHEMA_VERSION,
      items,
      settings,
      currentReceipt,
      history: Array.isArray(raw.history) ? raw.history.slice(-12) : [],
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? normalizeLoadedState(JSON.parse(raw)) : createInitialState();
    } catch (error) {
      console.warn("No se pudo leer el almacenamiento local", error);
      return createInitialState();
    }
  }

  function saveState({ render = false } = {}) {
    state.lastSaved = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      updateLastSavedLabel();
    } catch (error) {
      showToast("No se pudo guardar. Revisa el espacio del navegador.");
      console.error(error);
    }
    if (render) renderAll();
  }

  function convertQuantity(quantity, fromUnit, toUnit) {
    const from = UNIT_META[fromUnit];
    const to = UNIT_META[toUnit];
    if (!from || !to || from.family !== to.family) return fromUnit === toUnit ? Number(quantity) : null;
    return Number(quantity) * from.factor / to.factor;
  }

  function isDiscreteUnit(unit) {
    const family = UNIT_META[unit]?.family;
    return Boolean(family && !["mass", "volume", "length"].includes(family));
  }

  function normalizeQuantityForUnit(quantity, unit) {
    const numeric = Math.max(0, Number(quantity) || 0);
    return isDiscreteUnit(unit) ? Math.ceil(numeric) : numeric;
  }

  function normalizeStockQuantity(quantity) {
    return Math.max(0, Number(quantity) || 0);
  }

  function planDays() {
    return CADENCE_DAYS[state.settings.defaultCadence] || 30;
  }

  function normalizedPurchased(item) {
    const result = convertQuantity(item.quantityPurchased || 0, item.actualUnit || item.unit, item.unit);
    return result == null ? 0 : result;
  }

  function refreshLastUnitPrice(item) {
    const purchased = normalizedPurchased(item);
    if (purchased <= 0 || item.actualLineTotal == null) return;
    item.lastUnitPrice = Number(item.actualLineTotal) / purchased;
    item.lastPriceDate = state.currentReceipt?.date || item.purchaseDate || todayISO();
  }

  function normalizedStock(item) {
    if (item.stockState !== "have" || item.stockQuantity == null) return 0;
    const result = convertQuantity(item.stockQuantity, item.stockUnit || item.unit, item.unit);
    return result == null ? 0 : result;
  }

  function dailyConsumption(item) {
    if (item.monthlyQty == null || Number(item.monthlyQty) <= 0) return null;
    return Number(item.monthlyQty) / Number(item.referenceDays || 30);
  }

  function safeDaysForPlan(item) {
    if (Number(item.referenceDays || 30) > 30) return Number(item.referenceDays);
    const candidates = [planDays(), Number(item.cadenceDays || 0), Number(item.shelfLifeDays || 0)].filter((value) => value > 0);
    return Math.max(1, Math.min(...candidates));
  }

  function safeTargetQuantity(item) {
    const daily = dailyConsumption(item);
    if (daily == null) return null;
    return Number(item.referenceDays || 30) > 30
      ? Number(item.monthlyQty)
      : daily * safeDaysForPlan(item);
  }

  function isBatchItem(item) {
    return Number(item.referenceDays || 30) > 30;
  }

  function batchDaysRemaining(item) {
    const daily = dailyConsumption(item);
    if (!isBatchItem(item) || daily == null || daily <= 0) return null;
    return normalizedStock(item) / daily;
  }

  function recommendedForCurrentPlan(item) {
    const target = safeTargetQuantity(item);
    if (target == null) return null;
    if (item.stockState === "have" && item.stockQuantity == null) return 0;
    const stock = normalizedStock(item);
    if (isBatchItem(item) && stock > 0) {
      const daysRemaining = batchDaysRemaining(item);
      if (daysRemaining != null && daysRemaining > planDays()) return 0;
      return normalizeQuantityForUnit(target, item.unit);
    }
    const needed = Math.max(0, target - stock);
    return isDiscreteUnit(item.unit) ? Math.ceil(needed) : needed;
  }

  function availableQuantity(item) {
    return normalizedStock(item) + normalizedPurchased(item);
  }

  function quantityTolerance(item, target) {
    if (isDiscreteUnit(item.unit)) return 1e-9;
    if (["kg", "L"].includes(item.unit)) return Math.max(Number(target || 0) * 0.1, 0.1);
    if (["g", "ml"].includes(item.unit)) return Math.max(Number(target || 0) * 0.1, 50);
    return Math.max(Number(target || 0) * 0.1, 0.1);
  }

  function calculatePurchaseAdvice(item) {
    const target = safeTargetQuantity(item);
    const stock = normalizedStock(item);
    const purchased = normalizedPurchased(item);
    const needed = target == null ? null : recommendedForCurrentPlan(item);
    if (item.stockState === "have" && item.stockQuantity == null) {
      return purchased > 0
        ? { level: "warning", message: "Marcaste que aún lo tienes. Indica cuánto queda para saber si esta compra es necesaria.", needed: null, excess: null }
        : { level: "safe", message: "Lo tienes en casa. No necesitas comprarlo en este ciclo.", needed: 0, excess: 0 };
    }
    if (target == null) {
      return purchased > 0
        ? { level: "info", message: "Define la cantidad recomendada para calcular si compraste de más.", needed: null, excess: null }
        : { level: "none", message: "", needed: null, excess: null };
    }
    const available = stock + purchased;
    const allowed = isBatchItem(item) || isDiscreteUnit(item.unit)
      ? stock + Number(needed || 0)
      : target;
    const excess = Math.max(0, available - allowed);
    const tolerance = quantityTolerance(item, target);
    if (excess > tolerance) {
      const perishable = Number(item.shelfLifeDays || 0) > 0 && Number(item.shelfLifeDays) <= 30;
      const coverage = dailyConsumption(item) ? available / dailyConsumption(item) : null;
      const preservation = Number(item.shelfLifeDays || 0);
      const message = perishable
        ? `Puede desperdiciarse: tienes ${formatQuantity(available, item.unit)} y para ${safeDaysForPlan(item)} días conviene ${formatQuantity(target, item.unit)}. Evita ${formatQuantity(excess, item.unit)} extra.`
        : `Compraste más de lo planificado. Alcanzaría aproximadamente ${formatNumber(coverage, 0)} días.`;
      return { level: perishable ? "danger" : "warning", message, needed, excess, coverage, preservation };
    }
    if (needed <= 0 && purchased <= 0 && stock > 0) {
      const days = batchDaysRemaining(item);
      const message = days != null
        ? `Aún tienes para aproximadamente ${formatNumber(days, 0)} días. No repongas este lote todavía.`
        : "Ya tienes suficiente en casa para este ciclo.";
      return { level: "safe", message, needed: 0, excess: 0 };
    }
    if ((stock > 0 || purchased > 0) && purchased + tolerance < needed) {
      const missing = Math.max(0, needed - purchased);
      return {
        level: "partial",
        message: `Aún falta ${formatQuantity(missing, item.unit)} para cubrir este ciclo.`,
        needed,
        excess: 0,
      };
    }
    if (purchased > 0 || stock > 0) {
      return { level: "safe", message: `Cantidad adecuada para aproximadamente ${safeDaysForPlan(item)} días.`, needed, excess: 0 };
    }
    return { level: "none", message: "", needed, excess: 0 };
  }

  function calculateProjection(item, overrides = {}) {
    const referenceQty = Object.prototype.hasOwnProperty.call(overrides, "referenceQty")
      ? overrides.referenceQty
      : item.monthlyQty;
    const purchasedQty = overrides.purchasedQty ?? normalizedPurchased(item);
    const stockQty = Object.prototype.hasOwnProperty.call(overrides, "stockQty") ? overrides.stockQty : normalizedStock(item);
    const totalQty = Number(purchasedQty || 0) + Number(stockQty || 0);
    const dateValue = overrides.purchaseDate ?? (Number(purchasedQty) > 0 ? item.purchaseDate : item.stockCheckedAt);
    const purchaseDate = parseLocalDate(dateValue);
    if (referenceQty == null || Number(referenceQty) <= 0 || totalQty <= 0) {
      return { durationDays: null, usableDays: null, replenishmentDate: null, shelfLimited: false };
    }
    const durationDays = Number(item.referenceDays || 30) * totalQty / Number(referenceQty);
    const shelfLife = Number(item.shelfLifeDays || 0);
    const shelfLimited = shelfLife > 0 && shelfLife < durationDays;
    const usableDays = shelfLimited ? shelfLife : durationDays;
    return {
      durationDays,
      usableDays,
      shelfLimited,
      replenishmentDate: purchaseDate ? addDays(purchaseDate, usableDays) : null,
    };
  }

  function cadenceKey(item) {
    if (item.monthlyQty == null) return "stock";
    const days = Number(item.cadenceDays || item.referenceDays || 30);
    if (days <= 7) return "weekly";
    if (days <= 15) return "fortnightly";
    if (days <= 30) return "monthly";
    if (days <= 60) return "bimonthly";
    return "quarterly";
  }

  function cadenceLabel(item) {
    const key = cadenceKey(item);
    return {
      weekly: "Semanal",
      fortnightly: "Quincenal",
      monthly: "Mensual",
      bimonthly: "Cada 2 meses",
      quarterly: "Cada 3 meses",
      stock: "Por reserva",
    }[key];
  }

  function compatibleUnits(unit) {
    const meta = UNIT_META[unit];
    if (!meta) return [unit];
    return Object.entries(UNIT_META).filter(([, value]) => value.family === meta.family).map(([key]) => key);
  }

  function statusFromQuantity(item) {
    const purchased = normalizedPurchased(item);
    const stock = normalizedStock(item);
    const target = safeTargetQuantity(item);
    if (item.stockState === "have" && item.stockQuantity == null && purchased <= 0) return "onhand";
    if (target == null) return purchased > 0 ? "purchased" : item.stockState === "have" ? "onhand" : "pending";
    const needed = recommendedForCurrentPlan(item);
    const available = stock + purchased;
    if (purchased <= 0 && needed != null && needed <= 1e-9 && stock > 0) return "onhand";
    if (purchased > 0 && needed != null && purchased + 1e-9 >= needed) return "purchased";
    if (available > 0) return "partial";
    return "pending";
  }

  function includedBySettings(item) {
    if (item.planStatus === "inactive" && !state.settings.showInactive) return false;
    if (item.planStatus === "optional" && !state.settings.showOptional) return false;
    return true;
  }

  function filteredItems() {
    const search = normalizeText($("#search-input")?.value);
    const category = $("#category-filter")?.value || "all";
    const cadence = $("#cadence-filter")?.value || "all";
    return state.items.filter((item) => {
      if (!includedBySettings(item)) return false;
      if (search && !normalizeText(`${item.name} ${item.brand || ""} ${item.notes}`).includes(search)) return false;
      if (category !== "all" && item.category !== category) return false;
      if (cadence !== "all" && cadenceKey(item) !== cadence) return false;
      if (activeStatusFilter === "onhand" && item.stockState !== "have") return false;
      if (activeStatusFilter !== "all" && activeStatusFilter !== "onhand" && item.purchaseStatus !== activeStatusFilter) return false;
      return true;
    });
  }

  function populateCategoryFilter() {
    const select = $("#category-filter");
    const current = select.value || "all";
    select.innerHTML = "<option value='all'>Todas</option>";
    Object.entries(CATEGORY_META).forEach(([value, meta]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = meta.label;
      select.append(option);
    });
    select.value = current;
  }

  function renderShoppingList() {
    const container = $("#category-list");
    const visible = filteredItems();
    container.innerHTML = "";
    Object.keys(CATEGORY_META).forEach((category) => {
      const items = visible.filter((item) => item.category === category);
      if (!items.length) return;
      const fragment = $("#category-section-template").content.cloneNode(true);
      const section = $(".category-section", fragment);
      const heading = $(".category-heading", fragment);
      const productList = $(".product-list", fragment);
      $(".category-icon", fragment).innerHTML = CATEGORY_META[category].icon;
      $(".category-name", fragment).textContent = CATEGORY_META[category].label;
      const pending = items.filter((item) => item.purchaseStatus === "pending" || item.purchaseStatus === "partial").length;
      $(".category-count", fragment).textContent = `${pending} pendiente${pending === 1 ? "" : "s"} · ${items.length} producto${items.length === 1 ? "" : "s"}`;
      heading.addEventListener("click", () => {
        const expanded = heading.getAttribute("aria-expanded") !== "false";
        heading.setAttribute("aria-expanded", String(!expanded));
      });
      items.forEach((item) => productList.append(createProductCard(item)));
      container.append(section);
    });
    $("#empty-state").hidden = visible.length > 0;
    renderSummary();
  }

  function createProductCard(item) {
    const fragment = $("#product-card-template").content.cloneNode(true);
    const card = $(".product-card", fragment);
    card.dataset.itemId = item.id;
    card.classList.toggle("is-purchased", item.purchaseStatus === "purchased");
    card.classList.toggle("is-onhand", item.stockState === "have");
    card.classList.toggle("is-skipped", item.purchaseStatus === "skipped");
    $(".product-name", card).textContent = item.name;
    const brandLabel = $(".product-brand", card);
    if (item.brand) {
      brandLabel.textContent = `Marca habitual: ${item.brand}`;
      brandLabel.hidden = false;
    }

    const tags = $(".product-tags", card);
    if (item.planStatus === "optional") tags.append(createTag("Opcional"));
    if (item.planStatus === "inactive") tags.append(createTag("No habitual"));
    if (item.monthlyQty == null) tags.append(createTag("Definir cantidad"));
    if (item.stockState === "have") tags.append(createTag("En casa"));

    const recommended = recommendedForCurrentPlan(item);
    $(".recommended-quantity", card).textContent = recommended == null
      ? "definir cantidad"
      : recommended <= 0 ? "no comprar ahora" : formatQuantity(recommended, item.unit);

    const projection = calculateProjection(item);
    const durationLabel = $(".duration-label", card);
    if (projection.usableDays != null) {
      const dateText = projection.replenishmentDate ? ` · hasta ${dateFormatter.format(projection.replenishmentDate)}` : "";
      durationLabel.textContent = `${formatNumber(projection.usableDays, 0)} días de cobertura${dateText}`;
    } else if (item.stockState === "have" && item.stockQuantity == null) {
      durationLabel.textContent = "Disponible en casa · cantidad sin indicar";
    } else {
      durationLabel.textContent = item.monthlyQty == null ? "Falta definir la recomendación" : "Sin compra registrada";
    }

    $(".product-open", card).addEventListener("click", () => openProductDialog(item.id));

    const buyButton = $(".buy-button", card);
    const hasPurchase = normalizedPurchased(item) > 0;
    buyButton.textContent = hasPurchase ? item.purchaseStatus === "partial" ? "✓ Compra parcial" : "✓ Comprado" : "✓ Compré";
    buyButton.setAttribute("aria-pressed", String(hasPurchase));
    buyButton.setAttribute("aria-label", hasPurchase ? `Desmarcar compra de ${item.name}` : `Marcar ${item.name} como comprado`);
    buyButton.addEventListener("click", () => togglePurchased(item.id));

    const onHandButton = $(".onhand-button", card);
    const hasStock = item.stockState === "have";
    onHandButton.textContent = hasStock ? "✓ Aún lo tengo" : "⌂ Aún lo tengo";
    onHandButton.setAttribute("aria-pressed", String(hasStock));
    onHandButton.setAttribute("aria-label", hasStock ? `Quitar existencia en casa de ${item.name}` : `Indicar que ${item.name} aún está en casa`);
    onHandButton.addEventListener("click", () => toggleOnHand(item.id));

    const skipButton = $(".skip-button", card);
    const isSkipped = item.purchaseStatus === "skipped";
    skipButton.textContent = isSkipped ? "✓ No comprar" : "No comprar en este ciclo";
    skipButton.setAttribute("aria-pressed", String(isSkipped));
    skipButton.addEventListener("click", () => toggleSkipped(item.id));

    const quantityInput = $(".actual-quantity", card);
    quantityInput.value = item.quantityPurchased || 0;
    quantityInput.setAttribute("aria-label", `Cantidad comprada de ${item.name}`);
    quantityInput.addEventListener("change", () => updateQuantity(item.id, quantityInput.value, unitSelect.value));

    const unitSelect = $(".actual-unit", card);
    compatibleUnits(item.unit).forEach((unit) => {
      const option = document.createElement("option");
      option.value = unit;
      option.textContent = unit;
      unitSelect.append(option);
    });
    unitSelect.value = compatibleUnits(item.unit).includes(item.actualUnit) ? item.actualUnit : item.unit;
    unitSelect.dataset.previousUnit = unitSelect.value;
    unitSelect.addEventListener("change", () => {
      const previousUnit = unitSelect.dataset.previousUnit || item.actualUnit || item.unit;
      const converted = convertQuantity(Number(quantityInput.value), previousUnit, unitSelect.value);
      if (converted != null) quantityInput.value = Number(converted.toFixed(3));
      unitSelect.dataset.previousUnit = unitSelect.value;
      updateQuantity(item.id, quantityInput.value, unitSelect.value);
    });

    $(".quantity-decrease", card).addEventListener("click", () => stepQuantity(item.id, -1));
    $(".quantity-increase", card).addEventListener("click", () => stepQuantity(item.id, 1));

    const status = $(".product-status", card);
    const advice = calculatePurchaseAdvice(item);
    if (item.purchaseStatus === "skipped") {
      status.textContent = "Excluido de esta compra. Puedes reactivarlo desde los detalles.";
      status.classList.add("warning");
    } else if (advice.message) {
      const message = document.createElement("span");
      message.textContent = advice.message;
      status.append(message);
      status.classList.add(advice.level === "info" ? "partial" : advice.level);
      if (["danger", "warning"].includes(advice.level) && advice.needed != null) {
        const safeButton = document.createElement("button");
        safeButton.type = "button";
        safeButton.className = "status-action";
        safeButton.textContent = advice.needed > 0 ? `Usar ${formatQuantity(advice.needed, item.unit)}` : "No comprar ahora";
        safeButton.addEventListener("click", () => applySafeQuantity(item.id));
        status.append(safeButton);
      }
    }
    const quantityDetails = $(".quantity-details", card);
    quantityDetails.open = item.purchaseStatus === "partial" || ["danger", "warning"].includes(advice.level);
    return fragment;
  }

  function createTag(text) {
    const tag = document.createElement("span");
    tag.textContent = text;
    return tag;
  }

  function renderSummary() {
    const eligible = state.items.filter(includedBySettings);
    const planned = eligible.filter((item) => item.purchaseStatus !== "skipped");
    const purchased = planned.filter((item) => item.purchaseStatus === "purchased").length;
    const onhand = planned.filter((item) => item.stockState === "have").length;
    const coveredAtHome = planned.filter((item) => item.purchaseStatus === "onhand").length;
    const partial = planned.filter((item) => item.purchaseStatus === "partial").length;
    const pending = planned.filter((item) => item.purchaseStatus === "pending").length;
    const alerts = planned.filter((item) => ["danger", "warning"].includes(calculatePurchaseAdvice(item).level)).length;
    const progress = planned.length ? Math.round((purchased + coveredAtHome) / planned.length * 100) : 0;
    $("#summary-bought").textContent = purchased;
    $("#summary-onhand").textContent = onhand;
    $("#summary-alerts").textContent = alerts;
    $("#summary-total").textContent = planned.length;
    $("#summary-pending").textContent = pending + partial;
    $("#summary-coverage").textContent = `${progress}%`;
    $("#shopping-progress").setAttribute("aria-valuenow", progress);
    $("#shopping-progress-value").style.width = `${progress}%`;
    $("#cycle-label").textContent = `Compra ${CADENCE_LABELS[state.settings.defaultCadence] || "mensual"}`;
  }

  function renderReplenishment() {
    const list = $("#replenishment-list");
    list.innerHTML = "";
    const now = parseLocalDate(todayISO());
    let unknown = 0;
    const projected = [];
    state.items.forEach((item) => {
      if (!includedBySettings(item) || item.purchaseStatus === "skipped") return;
      const projection = calculateProjection(item);
      if (!projection.replenishmentDate) {
        unknown += 1;
        return;
      }
      const daysRemaining = Math.ceil((projection.replenishmentDate - now) / 86400000);
      projected.push({ item, ...projection, daysRemaining });
    });
    projected.sort((a, b) => a.replenishmentDate - b.replenishmentDate);
    projected.forEach((entry) => list.append(createReplenishmentItem(entry)));
    if (!projected.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML = "<h3>Aún no hay fechas calculadas</h3><p>Registra cantidades y fechas de compra para ver las próximas reposiciones.</p>";
      list.append(empty);
    }
    $("#replenish-overdue-count").textContent = projected.filter((entry) => entry.daysRemaining < 0).length;
    $("#replenish-week-count").textContent = projected.filter((entry) => entry.daysRemaining >= 0 && entry.daysRemaining <= 7).length;
    $("#replenish-month-count").textContent = projected.filter((entry) => entry.daysRemaining >= 0 && entry.daysRemaining <= 30).length;
    $("#replenish-unknown-count").textContent = unknown;
  }

  function createReplenishmentItem(entry) {
    const fragment = $("#replenishment-item-template").content.cloneNode(true);
    $(".replenishment-day", fragment).textContent = entry.replenishmentDate.getDate();
    $(".replenishment-month", fragment).textContent = shortMonthFormatter.format(entry.replenishmentDate).replace(".", "");
    $(".replenishment-name", fragment).textContent = entry.item.name;
    const detail = entry.shelfLimited
      ? `Cobertura limitada por conservación a ${formatNumber(entry.usableDays, 0)} días`
      : `${formatNumber(entry.usableDays, 0)} días estimados de consumo`;
    $(".replenishment-detail", fragment).textContent = detail;
    const urgency = $(".replenishment-urgency", fragment);
    urgency.textContent = entry.daysRemaining < 0 ? "Vencido" : entry.daysRemaining === 0 ? "Hoy" : entry.daysRemaining <= 7 ? `${entry.daysRemaining} días` : "Programado";
    if (entry.daysRemaining < 0) urgency.style.background = "var(--red-100)";
    return fragment;
  }

  function renderSettings() {
    $("#default-cadence").value = state.settings.defaultCadence;
    $("#cycle-start-date").value = state.settings.cycleStart || todayISO();
    $("#show-optional-items").checked = Boolean(state.settings.showOptional);
    $("#show-non-habitual-items").checked = Boolean(state.settings.showInactive);
    $("#app-version").textContent = `v${APP_VERSION}`;
    updateLastSavedLabel();
  }

  function invoiceItems() {
    return state.items.filter((item) => item.purchaseCycleId === state.settings.cycleId && normalizedPurchased(item) > 0);
  }

  function invoiceRealTotal() {
    return invoiceItems().reduce((total, item) => total + (item.actualLineTotal == null ? 0 : Number(item.actualLineTotal)), 0);
  }

  function projectedBudget() {
    let total = 0;
    let priced = 0;
    let missing = 0;
    state.items.filter(includedBySettings).forEach((item) => {
      if (item.purchaseStatus === "skipped") return;
      const quantity = recommendedForCurrentPlan(item);
      if (quantity == null || quantity <= 0) return;
      if (item.lastUnitPrice == null) {
        missing += 1;
        return;
      }
      total += quantity * Number(item.lastUnitPrice);
      priced += 1;
    });
    return { total, priced, missing };
  }

  function updateInvoiceSummary() {
    const items = invoiceItems();
    const total = invoiceRealTotal();
    const reviewed = items.filter((item) => item.receiptReviewed).length;
    const projected = projectedBudget();
    const linesWithoutTotal = items.filter((item) => item.actualLineTotal == null).length;
    $("#invoice-real-label").textContent = linesWithoutTotal ? "Subtotal registrado" : "Gasto real";
    $("#invoice-real-total").textContent = formatMoney(total);
    $("#invoice-reviewed-count").textContent = `${reviewed} de ${items.length}`;
    $("#invoice-projected-total").textContent = formatMoney(projected.total);
    $("#invoice-missing-prices").textContent = projected.missing;

    const difference = $("#receipt-difference");
    difference.className = "receipt-difference";
    const reported = state.currentReceipt.reportedTotal;
    if (reported == null) {
      difference.textContent = linesWithoutTotal
        ? `Agrega el total impreso. Faltan precios en ${linesWithoutTotal} línea${linesWithoutTotal === 1 ? "" : "s"}.`
        : "Agrega el total impreso para comparar.";
      return;
    }
    const delta = Number(reported) - total;
    if (Math.abs(delta) < 0.01 && linesWithoutTotal === 0) {
      difference.textContent = "✓ El total de las líneas coincide con la factura.";
      difference.classList.add("safe");
    } else if (delta >= 0) {
      difference.textContent = `Faltan ${formatMoney(delta)} por asignar${linesWithoutTotal ? ` en ${linesWithoutTotal} línea${linesWithoutTotal === 1 ? "" : "s"}` : ""}.`;
      difference.classList.add("warning");
    } else {
      difference.textContent = `Las líneas superan el total impreso por ${formatMoney(Math.abs(delta))}. Revisa cantidades y precios.`;
      difference.classList.add("danger");
    }
  }

  function updateInvoiceItemCalculation(card, item) {
    const purchased = normalizedPurchased(item);
    const unitPrice = purchased > 0 && item.actualLineTotal != null
      ? Number(item.actualLineTotal) / purchased
      : item.lastUnitPrice;
    const nextQuantity = recommendedForCurrentPlan(item);
    $(".invoice-unit-price", card).textContent = unitPrice == null
      ? "Precio unitario: por calcular"
      : `Precio estimado: ${formatMoney(unitPrice)} por ${item.unit}`;
    $(".invoice-next-estimate", card).textContent = unitPrice == null || nextQuantity == null
      ? "Próxima compra: falta precio o cantidad"
      : `Próxima compra: ${formatMoney(unitPrice * nextQuantity)} para ${formatQuantity(nextQuantity, item.unit)}`;
    $(".invoice-item-status", card).textContent = item.receiptReviewed
      ? "Revisado y guardado"
      : item.actualLineTotal == null ? "Falta el total pagado" : "Pendiente de marcar como revisado";
    card.classList.toggle("is-reviewed", item.receiptReviewed);
  }

  function createInvoiceItem(item) {
    const fragment = $("#invoice-item-template").content.cloneNode(true);
    const card = $(".invoice-item", fragment);
    const title = $(".invoice-item-title", card);
    const quantityInput = $(".invoice-item-quantity", card);
    const unitSelect = $(".invoice-item-unit", card);
    const totalInput = $(".invoice-item-total", card);
    const reviewedInput = $(".invoice-item-reviewed", card);
    const nameInput = $(".invoice-item-name", card);
    const brandInput = $(".invoice-item-brand", card);
    const receiptLabelInput = $(".invoice-item-receipt-label", card);

    title.textContent = item.name;
    quantityInput.value = item.quantityPurchased || 0;
    fillUnitSelect(unitSelect, item.actualUnit || item.unit);
    unitSelect.value = compatibleUnits(item.unit).includes(item.actualUnit) ? item.actualUnit : item.unit;
    unitSelect.dataset.previousUnit = unitSelect.value;
    totalInput.value = item.actualLineTotal == null ? "" : item.actualLineTotal;
    reviewedInput.checked = Boolean(item.receiptReviewed);
    nameInput.value = item.name;
    brandInput.value = item.brand || "";
    receiptLabelInput.value = item.receiptLabel || "";
    $(".invoice-item-details", card).open = !item.receiptReviewed && Boolean(item.receiptLabel || item.brand);

    const persist = () => {
      item.name = nameInput.value.trim() || item.name;
      item.brand = brandInput.value.trim();
      item.receiptLabel = receiptLabelInput.value.trim();
      item.actualUnit = UNIT_META[unitSelect.value] ? unitSelect.value : item.unit;
      item.quantityPurchased = normalizeQuantityForUnit(quantityInput.value, item.actualUnit);
      item.actualLineTotal = totalInput.value === "" ? null : Math.max(0, Number(totalInput.value) || 0);
      item.receiptReviewed = reviewedInput.checked;
      item.purchaseStatus = statusFromQuantity(item);
      if (item.quantityPurchased > 0) {
        item.purchaseCycleId = state.settings.cycleId;
        if (!item.purchaseDate) item.purchaseDate = state.currentReceipt.date || todayISO();
      } else {
        item.purchaseCycleId = "";
        item.purchaseDate = "";
        item.actualLineTotal = null;
        item.receiptReviewed = false;
      }
      const cycleItems = invoiceItems();
      state.currentReceipt.reviewedAt = cycleItems.length > 0 && cycleItems.every((entry) => entry.receiptReviewed)
        ? new Date().toISOString()
        : null;
      refreshLastUnitPrice(item);
      title.textContent = item.name;
      saveState();
      updateInvoiceItemCalculation(card, item);
      updateInvoiceSummary();
      if (item.quantityPurchased <= 0) renderInvoice();
    };

    unitSelect.addEventListener("change", () => {
      const previousUnit = unitSelect.dataset.previousUnit || item.actualUnit || item.unit;
      const converted = convertQuantity(Number(quantityInput.value), previousUnit, unitSelect.value);
      if (converted != null) quantityInput.value = Number(converted.toFixed(3));
      unitSelect.dataset.previousUnit = unitSelect.value;
      reviewedInput.checked = false;
      persist();
    });
    quantityInput.addEventListener("change", () => {
      reviewedInput.checked = false;
      persist();
    });
    quantityInput.addEventListener("blur", () => {
      if (Number(quantityInput.value) !== Number(item.quantityPurchased)) persist();
    });
    [totalInput, nameInput, brandInput, receiptLabelInput].forEach((input) => input.addEventListener("input", () => {
      if (input === totalInput) reviewedInput.checked = false;
      persist();
    }));
    reviewedInput.addEventListener("change", persist);
    updateInvoiceItemCalculation(card, item);
    return fragment;
  }

  async function renderReceiptPhoto() {
    const token = ++receiptRenderToken;
    const preview = $("#receipt-photo-preview");
    const empty = $("#receipt-photo-empty");
    const remove = $("#receipt-photo-remove");
    const label = $("#receipt-photo-button-label");
    if (receiptObjectUrl) {
      URL.revokeObjectURL(receiptObjectUrl);
      receiptObjectUrl = null;
    }
    if (!state.currentReceipt.photoKey || !window.ReceiptStorage) {
      preview.hidden = true;
      preview.removeAttribute("src");
      empty.hidden = false;
      remove.hidden = true;
      label.textContent = "Tomar foto o subir factura";
      return;
    }
    try {
      const blob = await window.ReceiptStorage.getImage(state.currentReceipt.photoKey);
      if (token !== receiptRenderToken) return;
      if (!blob) throw new Error("La foto guardada ya no está disponible.");
      receiptObjectUrl = URL.createObjectURL(blob);
      preview.src = receiptObjectUrl;
      preview.hidden = false;
      empty.hidden = true;
      remove.hidden = false;
      label.textContent = "Reemplazar foto";
    } catch (error) {
      console.warn(error);
      preview.hidden = true;
      empty.hidden = false;
      remove.hidden = true;
      label.textContent = "Tomar foto o subir factura";
    }
  }

  async function saveReceiptPhoto(file) {
    if (!file || !window.ReceiptStorage) return;
    try {
      await window.ReceiptStorage.saveImage(state.settings.cycleId, file);
      state.currentReceipt.photoKey = state.settings.cycleId;
      saveState();
      await renderReceiptPhoto();
      showToast("Foto guardada solo en este teléfono.");
    } catch (error) {
      showToast(error.message || "No se pudo guardar la foto.");
    } finally {
      $("#receipt-photo-input").value = "";
    }
  }

  async function removeReceiptPhoto() {
    const key = state.currentReceipt.photoKey;
    if (key && window.ReceiptStorage) {
      try {
        await window.ReceiptStorage.deleteImage(key);
      } catch (error) {
        showToast(error.message || "No se pudo quitar la foto.");
        return;
      }
    }
    state.currentReceipt.photoKey = null;
    saveState();
    await renderReceiptPhoto();
    showToast("Foto eliminada de este teléfono.");
  }

  function renderInvoice() {
    const items = invoiceItems();
    const list = $("#invoice-list");
    list.innerHTML = "";
    items.forEach((item) => list.append(createInvoiceItem(item)));
    $("#invoice-empty").hidden = items.length > 0;
    $("#receipt-store").value = state.currentReceipt.store || "";
    $("#receipt-date").value = state.currentReceipt.date || todayISO();
    $("#receipt-number").value = state.currentReceipt.invoiceNumber || "";
    $("#receipt-reported-total").value = state.currentReceipt.reportedTotal == null ? "" : state.currentReceipt.reportedTotal;
    updateInvoiceSummary();
    void renderReceiptPhoto();
  }

  function renderAll() {
    populateCategoryFilter();
    renderShoppingList();
    renderReplenishment();
    renderInvoice();
    renderSettings();
  }

  function findItem(id) {
    return state.items.find((item) => item.id === id);
  }

  function togglePurchased(id) {
    const item = findItem(id);
    if (!item) return;
    if (normalizedPurchased(item) > 0) {
      item.quantityPurchased = 0;
      item.purchaseDate = "";
      item.purchaseCycleId = "";
      item.actualLineTotal = null;
      item.receiptReviewed = false;
      item.purchaseStatus = statusFromQuantity(item);
    } else {
      const recommended = recommendedForCurrentPlan(item);
      if (recommended == null) {
        openProductDialog(id);
        showToast("Primero define la cantidad recomendada.");
        return;
      }
      if (recommended <= 0) {
        item.purchaseStatus = statusFromQuantity(item);
        saveState({ render: true });
        showToast("Ya tienes suficiente; no hace falta comprarlo ahora.");
        return;
      }
      item.quantityPurchased = Number(recommended.toFixed(3));
      item.actualUnit = item.unit;
      item.purchaseDate = todayISO();
      item.purchaseCycleId = state.settings.cycleId;
      item.actualLineTotal = null;
      item.receiptReviewed = false;
      item.purchaseStatus = statusFromQuantity(item);
    }
    saveState({ render: true });
  }

  function toggleOnHand(id) {
    const item = findItem(id);
    if (!item) return;
    if (item.stockState === "have") {
      item.stockState = "unknown";
      item.stockQuantity = null;
      item.stockCheckedAt = "";
      item.purchaseStatus = item.purchaseStatus === "skipped" ? "skipped" : statusFromQuantity(item);
      showToast("Se quitó la marca “Aún lo tengo”.");
    } else {
      item.stockState = "have";
      item.stockQuantity = null;
      item.stockUnit = item.unit;
      item.stockCheckedAt = todayISO();
      item.quantityPurchased = 0;
      item.actualUnit = item.unit;
      item.purchaseDate = "";
      item.purchaseCycleId = "";
      item.actualLineTotal = null;
      item.receiptReviewed = false;
      item.purchaseStatus = "onhand";
      showToast("Marcado como disponible en casa.");
    }
    saveState({ render: true });
  }

  function toggleSkipped(id) {
    const item = findItem(id);
    if (!item) return;
    if (item.purchaseStatus === "skipped") {
      item.purchaseStatus = statusFromQuantity(item);
      showToast("Producto reactivado para este ciclo.");
    } else {
      item.purchaseStatus = "skipped";
      item.quantityPurchased = 0;
      item.actualUnit = item.unit;
      item.purchaseDate = "";
      item.purchaseCycleId = "";
      item.actualLineTotal = null;
      item.receiptReviewed = false;
      showToast("No se comprará en este ciclo.");
    }
    saveState({ render: true });
  }

  function updateQuantity(id, rawQuantity, unit) {
    const item = findItem(id);
    if (!item) return;
    item.actualUnit = UNIT_META[unit] ? unit : item.unit;
    item.quantityPurchased = normalizeQuantityForUnit(rawQuantity, item.actualUnit);
    if (item.purchaseStatus !== "skipped") item.purchaseStatus = statusFromQuantity(item);
    if (item.quantityPurchased > 0) {
      if (!item.purchaseDate) item.purchaseDate = todayISO();
      item.purchaseCycleId = state.settings.cycleId;
    } else {
      item.purchaseDate = "";
      item.purchaseCycleId = "";
      item.actualLineTotal = null;
    }
    item.receiptReviewed = false;
    refreshLastUnitPrice(item);
    saveState({ render: true });
  }

  function stepQuantity(id, direction) {
    const item = findItem(id);
    if (!item) return;
    const recommended = recommendedForCurrentPlan(item);
    if (recommended == null) {
      openProductDialog(id);
      showToast("Primero define la cantidad recomendada.");
      return;
    }
    const increment = isDiscreteUnit(item.unit) ? 1 : recommended >= 10 ? 1 : recommended >= 1 ? 0.5 : 0.1;
    const currentInBase = normalizedPurchased(item);
    const nextInBase = normalizeQuantityForUnit(currentInBase + direction * increment, item.unit);
    item.quantityPurchased = Number(nextInBase.toFixed(3));
    item.actualUnit = item.unit;
    item.purchaseStatus = statusFromQuantity(item);
    if (nextInBase > 0) {
      if (!item.purchaseDate) item.purchaseDate = todayISO();
      item.purchaseCycleId = state.settings.cycleId;
    } else {
      item.purchaseDate = "";
      item.purchaseCycleId = "";
      item.actualLineTotal = null;
    }
    item.receiptReviewed = false;
    refreshLastUnitPrice(item);
    saveState({ render: true });
  }

  function fillRecommended(id) {
    const item = findItem(id);
    const recommended = item && recommendedForCurrentPlan(item);
    if (!item) return;
    if (recommended == null) {
      openProductDialog(id);
      showToast("Primero define la cantidad recomendada.");
      return;
    }
    item.quantityPurchased = Number(recommended.toFixed(3));
    item.actualUnit = item.unit;
    item.purchaseStatus = statusFromQuantity(item);
    item.purchaseDate = recommended > 0 ? todayISO() : "";
    item.purchaseCycleId = recommended > 0 ? state.settings.cycleId : "";
    item.actualLineTotal = null;
    item.receiptReviewed = false;
    saveState({ render: true });
  }

  function applySafeQuantity(id) {
    const item = findItem(id);
    if (!item) return;
    const advice = calculatePurchaseAdvice(item);
    const safeQuantity = advice.needed == null ? recommendedForCurrentPlan(item) : advice.needed;
    if (safeQuantity == null) {
      openProductDialog(id);
      return;
    }
    item.quantityPurchased = Number(Math.max(0, safeQuantity).toFixed(3));
    item.actualUnit = item.unit;
    item.purchaseDate = safeQuantity > 0 ? todayISO() : "";
    item.purchaseCycleId = safeQuantity > 0 ? state.settings.cycleId : "";
    item.actualLineTotal = null;
    item.receiptReviewed = false;
    item.purchaseStatus = statusFromQuantity(item);
    saveState({ render: true });
    showToast(safeQuantity > 0 ? "Cantidad ajustada para evitar sobrecompra." : "Compra retirada: ya tienes suficiente.");
  }

  function fillUnitSelect(select, selected) {
    const units = compatibleUnits(selected);
    select.innerHTML = "";
    units.forEach((unit) => {
      const option = document.createElement("option");
      option.value = unit;
      option.textContent = unit;
      select.append(option);
    });
    select.value = units.includes(selected) ? selected : units[0];
  }

  function openProductDialog(id) {
    const item = findItem(id);
    if (!item) return;
    $("#product-id").value = item.id;
    $("#product-dialog-category").textContent = `${CATEGORY_META[item.category]?.label || "Producto"} · ${cadenceLabel(item)}`;
    $("#product-dialog-title").textContent = item.name;
    $("#product-name-input").value = item.name;
    $("#product-brand-input").value = item.brand || "";
    $("#recommended-quantity-input").value = item.monthlyQty ?? "";
    fillUnitSelect($("#recommended-unit-input"), item.unit);
    $("#recommended-unit-input").dataset.previousUnit = item.unit;
    const purchasedInBase = convertQuantity(item.quantityPurchased || 0, item.actualUnit || item.unit, item.unit);
    $("#purchased-quantity-input").value = purchasedInBase ?? 0;
    $("#stock-quantity-input").value = item.stockQuantity ?? "";
    fillUnitSelect($("#stock-unit-input"), item.stockUnit || item.unit);
    $("#stock-unit-input").dataset.previousUnit = item.stockUnit || item.unit;
    $("#purchase-date-input").value = item.purchaseDate || "";
    $("#product-status-input").value = item.purchaseStatus;
    $("#habitual-input").checked = item.planStatus !== "inactive";
    $("#optional-input").checked = item.planStatus === "optional";
    $("#product-note-input").value = item.notes || "";
    updateDialogProjection();
    $("#product-dialog").showModal();
  }

  function updateDialogProjection() {
    const item = findItem($("#product-id").value);
    if (!item) return;
    const referenceQty = Number($("#recommended-quantity-input").value);
    const purchasedQty = Number($("#purchased-quantity-input").value);
    const selectedUnit = $("#recommended-unit-input").value || item.unit;
    const stockRaw = $("#stock-quantity-input").value;
    const stockQty = stockRaw === ""
      ? 0
      : convertQuantity(Number(stockRaw), $("#stock-unit-input").value || selectedUnit, selectedUnit);
    const projection = calculateProjection(item, {
      referenceQty: Number.isFinite(referenceQty) && referenceQty > 0 ? referenceQty : null,
      purchasedQty: Number.isFinite(purchasedQty) ? purchasedQty : 0,
      stockQty: stockQty == null ? 0 : stockQty,
      purchaseDate: $("#purchase-date-input").value,
    });
    $("#dialog-duration").textContent = projection.usableDays == null ? "Sin datos suficientes" : `${formatNumber(projection.usableDays, 0)} días de cobertura`;
    $("#dialog-replenishment-date").textContent = projection.replenishmentDate ? `Reposición estimada: ${dateFormatter.format(projection.replenishmentDate)}` : "Agrega una cantidad y fecha de compra.";
  }

  function convertDialogUnit(event) {
    const select = event.target;
    const previousUnit = select.dataset.previousUnit || select.value;
    const nextUnit = select.value;
    if (previousUnit === nextUnit) return;
    [$("#recommended-quantity-input"), $("#purchased-quantity-input")].forEach((input) => {
      if (input.value === "") return;
      const converted = convertQuantity(Number(input.value), previousUnit, nextUnit);
      if (converted != null) input.value = Number(converted.toFixed(3));
    });
    select.dataset.previousUnit = nextUnit;
    updateDialogProjection();
  }

  function convertStockDialogUnit(event) {
    const select = event.target;
    const previousUnit = select.dataset.previousUnit || select.value;
    const nextUnit = select.value;
    const input = $("#stock-quantity-input");
    if (previousUnit !== nextUnit && input.value !== "") {
      const converted = convertQuantity(Number(input.value), previousUnit, nextUnit);
      if (converted != null) input.value = Number(converted.toFixed(3));
    }
    select.dataset.previousUnit = nextUnit;
    updateDialogProjection();
  }

  function saveProductFromDialog(event) {
    event.preventDefault();
    const item = findItem($("#product-id").value);
    if (!item) return;
    const name = $("#product-name-input").value.trim();
    const recommendedRaw = $("#recommended-quantity-input").value;
    const selectedUnit = $("#recommended-unit-input").value;
    const purchased = normalizeQuantityForUnit($("#purchased-quantity-input").value, selectedUnit);
    const previousUnit = item.unit;
    const stockRaw = $("#stock-quantity-input").value;
    const stockUnit = $("#stock-unit-input").value || selectedUnit;
    const requestedStatus = $("#product-status-input").value;
    item.name = name || item.name;
    item.brand = $("#product-brand-input").value.trim();
    item.monthlyQty = recommendedRaw === "" ? null : normalizeQuantityForUnit(recommendedRaw, selectedUnit);
    item.unit = selectedUnit;
    if (item.lastUnitPrice != null && previousUnit !== selectedUnit) {
      const unitsPerPrevious = convertQuantity(1, previousUnit, selectedUnit);
      if (unitsPerPrevious) item.lastUnitPrice = item.lastUnitPrice / unitsPerPrevious;
    }
    item.quantityPurchased = purchased;
    item.actualUnit = item.unit;
    item.purchaseDate = $("#purchase-date-input").value;
    item.stockUnit = compatibleUnits(selectedUnit).includes(stockUnit) ? stockUnit : selectedUnit;
    item.stockQuantity = stockRaw === "" ? null : normalizeStockQuantity(stockRaw);
    item.stockState = requestedStatus === "onhand" || (item.stockQuantity != null && item.stockQuantity > 0)
      ? "have"
      : stockRaw === "" ? "unknown" : "none";
    item.stockCheckedAt = item.stockState === "have" ? todayISO() : "";
    item.purchaseStatus = requestedStatus;
    if (!$("#habitual-input").checked) item.planStatus = "inactive";
    else item.planStatus = $("#optional-input").checked ? "optional" : "regular";
    item.notes = $("#product-note-input").value.trim();
    if (requestedStatus === "onhand" && purchased > 0) {
      item.quantityPurchased = 0;
      item.purchaseDate = "";
    }
    if (requestedStatus === "skipped") {
      item.quantityPurchased = 0;
      item.purchaseDate = "";
      item.actualLineTotal = null;
    }
    if (item.purchaseStatus !== "skipped") item.purchaseStatus = statusFromQuantity(item);
    if (item.monthlyQty == null && item.purchaseStatus !== "onhand") item.purchaseStatus = "pending";
    item.purchaseCycleId = item.quantityPurchased > 0 ? state.settings.cycleId : "";
    if (item.quantityPurchased > 0 && !item.purchaseDate) item.purchaseDate = todayISO();
    if (item.quantityPurchased <= 0) item.actualLineTotal = null;
    item.receiptReviewed = false;
    refreshLastUnitPrice(item);
    saveState({ render: true });
    $("#product-dialog").close();
    showToast("Producto actualizado.");
  }

  function switchView(view, { updateHash = true } = {}) {
    if (!["shopping", "replenishment", "invoice", "settings"].includes(view)) view = "shopping";
    activeView = view;
    $$(".view").forEach((panel) => {
      const active = panel.dataset.view === view;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
    $$("[data-view-target]").forEach((button) => {
      const active = button.dataset.viewTarget === view;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    if (view === "shopping") renderShoppingList();
    if (view === "replenishment") renderReplenishment();
    if (view === "invoice") renderInvoice();
    if (updateHash) history.replaceState(null, "", `#${{ shopping: "comprar", replenishment: "reposicion", invoice: "factura", settings: "ajustes" }[view]}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showToast(message) {
    const toast = $("#toast");
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2800);
  }

  function openDialog(id) {
    const dialog = $(`#${id}`);
    if (dialog && !dialog.open) dialog.showModal();
  }

  function closeDialogFromButton(button) {
    const dialog = button.closest("dialog");
    if (dialog) dialog.close();
  }

  function updateLastSavedLabel() {
    const label = $("#last-saved-label");
    if (!label) return;
    if (!state.lastSaved) {
      label.textContent = "Sin cambios";
      return;
    }
    const date = new Date(state.lastSaved);
    label.textContent = `Hoy, ${date.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" })}`;
  }

  function startNewCycle() {
    const nextCycleStart = $("#new-cycle-date").value || todayISO();
    const snapshot = {
      cycleId: state.settings.cycleId,
      endedAt: new Date().toISOString(),
      cycleStart: state.settings.cycleStart,
      purchased: invoiceItems().length,
      partial: state.items.filter((item) => item.purchaseStatus === "partial").length,
      realTotal: invoiceRealTotal(),
      reviewed: invoiceItems().filter((item) => item.receiptReviewed).length,
      store: state.currentReceipt.store || "",
      receiptDate: state.currentReceipt.date || "",
      invoiceNumber: state.currentReceipt.invoiceNumber || "",
      reportedTotal: state.currentReceipt.reportedTotal,
    };
    state.history.push(snapshot);
    state.history = state.history.slice(-12);
    state.items.forEach((item) => {
      const remaining = estimateRemainingAt(item, nextCycleStart);
      if (remaining != null && remaining > quantityTolerance(item, safeTargetQuantity(item) || 0) / 10) {
        item.stockState = "have";
        item.stockQuantity = Number(remaining.toFixed(3));
        item.stockUnit = item.unit;
        item.stockCheckedAt = nextCycleStart;
      } else {
        item.stockState = "unknown";
        item.stockQuantity = null;
        item.stockUnit = item.unit;
        item.stockCheckedAt = "";
      }
      item.quantityPurchased = 0;
      item.actualUnit = item.unit;
      item.purchaseDate = "";
      item.purchaseCycleId = "";
      item.actualLineTotal = null;
      item.receiptReviewed = false;
      item.purchaseStatus = statusFromQuantity(item);
    });
    const nextCycleId = createCycleId();
    state.settings.cycleStart = nextCycleStart;
    state.settings.cycleId = nextCycleId;
    state.currentReceipt = {
      cycleId: nextCycleId,
      date: nextCycleStart,
      store: snapshot.store,
      invoiceNumber: "",
      reportedTotal: null,
      reviewedAt: null,
      photoKey: null,
    };
    saveState({ render: true });
    $("#new-cycle-dialog").close();
    switchView("shopping");
    showToast("Nuevo ciclo iniciado; el sobrante quedó como inventario en casa.");
  }

  function estimateRemainingAt(item, targetDateValue) {
    const purchased = normalizedPurchased(item);
    const stock = normalizedStock(item);
    if (item.stockState === "have" && item.stockQuantity == null && purchased <= 0) return null;
    const targetDate = parseLocalDate(targetDateValue);
    if (!targetDate) return purchased + stock;
    const stockDate = parseLocalDate(item.stockCheckedAt || state.settings.cycleStart) || targetDate;
    if (purchased <= 0) return consumeBetween(item, stock, stockDate, targetDate);
    const purchaseDate = parseLocalDate(item.purchaseDate || state.currentReceipt.date || state.settings.cycleStart) || targetDate;
    const stockAtPurchase = consumeBetween(item, stock, stockDate, purchaseDate);
    return consumeBetween(item, stockAtPurchase + purchased, purchaseDate, targetDate);
  }

  function consumeBetween(item, quantity, fromDate, toDate) {
    if (quantity <= 0) return 0;
    const elapsed = fromDate && toDate ? Math.max(0, Math.floor((toDate - fromDate) / 86400000)) : 0;
    const shelfLife = Number(item.shelfLifeDays || 0);
    if (shelfLife > 0 && elapsed >= shelfLife) return 0;
    const daily = dailyConsumption(item);
    if (daily == null) return quantity;
    return Math.max(0, quantity - daily * elapsed);
  }

  function exportPayload() {
    const backupState = JSON.parse(JSON.stringify(state));
    if (backupState.currentReceipt) backupState.currentReceipt.photoKey = null;
    return JSON.stringify({
      app: "Compras familiares",
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      photoIncluded: false,
      state: backupState,
    }, null, 2);
  }

  function openExportDialog() {
    $("#export-data").value = exportPayload();
    openDialog("export-dialog");
  }

  function downloadExport() {
    const blob = new Blob([exportPayload()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `compras-familiares-${todayISO()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Respaldo descargado.");
  }

  async function copyExport() {
    try {
      await navigator.clipboard.writeText($("#export-data").value);
      showToast("Respaldo copiado.");
    } catch {
      $("#export-data").select();
      document.execCommand("copy");
      showToast("Respaldo copiado.");
    }
  }

  function importText(text) {
    const parsed = JSON.parse(text);
    const incoming = parsed.state || parsed;
    if (!incoming || !Array.isArray(incoming.items)) throw new Error("El archivo no contiene una lista válida.");
    state = normalizeLoadedState(incoming);
    state.currentReceipt.photoKey = null;
    saveState({ render: true });
  }

  function confirmImport() {
    const error = $("#import-error");
    error.hidden = true;
    try {
      const text = $("#import-data").value.trim();
      if (!text) throw new Error("Selecciona un archivo o pega el contenido del respaldo.");
      importText(text);
      $("#import-dialog").close();
      showToast("Respaldo restaurado.");
    } catch (exception) {
      error.textContent = exception.message || "No se pudo leer el respaldo.";
      error.hidden = false;
    }
  }

  async function resetApplication() {
    localStorage.removeItem(STORAGE_KEY);
    if (window.ReceiptStorage) {
      try {
        await window.ReceiptStorage.clearAll();
      } catch (error) {
        console.warn("No se pudieron limpiar las fotos locales", error);
      }
    }
    state = createInitialState();
    saveState({ render: true });
    $("#reset-dialog").close();
    switchView("shopping");
    showToast("La lista inicial fue restaurada.");
  }

  function updateConnectionStatus() {
    const pill = $("#connection-status");
    const text = $("span:last-child", pill);
    const online = navigator.onLine;
    pill.classList.toggle("is-offline", !online);
    text.textContent = online ? "Datos guardados en este teléfono" : "Sin conexión · la app sigue disponible";
  }

  function saveReceiptMetadata() {
    state.currentReceipt.cycleId = state.settings.cycleId;
    state.currentReceipt.store = $("#receipt-store").value.trim();
    state.currentReceipt.date = $("#receipt-date").value || todayISO();
    state.currentReceipt.invoiceNumber = $("#receipt-number").value.trim();
    state.currentReceipt.reportedTotal = $("#receipt-reported-total").value === ""
      ? null
      : Math.max(0, Number($("#receipt-reported-total").value) || 0);
    saveState();
    updateInvoiceSummary();
  }

  function bindEvents() {
    $("#search-input").addEventListener("input", (event) => {
      $("#clear-search-button").hidden = !event.target.value;
      renderShoppingList();
    });
    $("#clear-search-button").addEventListener("click", () => {
      $("#search-input").value = "";
      $("#clear-search-button").hidden = true;
      renderShoppingList();
      $("#search-input").focus();
    });
    $("#status-filters").addEventListener("click", (event) => {
      const button = event.target.closest("[data-status-filter]");
      if (!button) return;
      activeStatusFilter = button.dataset.statusFilter;
      $$("[data-status-filter]").forEach((chip) => {
        const selected = chip === button;
        chip.classList.toggle("is-selected", selected);
        chip.setAttribute("aria-pressed", String(selected));
      });
      renderShoppingList();
    });
    $("#category-filter").addEventListener("change", renderShoppingList);
    $("#cadence-filter").addEventListener("change", renderShoppingList);
    $("#reset-filters-button").addEventListener("click", () => {
      activeStatusFilter = "all";
      $("#search-input").value = "";
      $("#category-filter").value = "all";
      $("#cadence-filter").value = "all";
      $$("[data-status-filter]").forEach((chip) => {
        const selected = chip.dataset.statusFilter === "all";
        chip.classList.toggle("is-selected", selected);
        chip.setAttribute("aria-pressed", String(selected));
      });
      renderShoppingList();
    });
    $$("[data-view-target]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.viewTarget)));
    $$("[data-dialog-close]").forEach((button) => button.addEventListener("click", () => closeDialogFromButton(button)));
    $$("dialog").forEach((dialog) => dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    }));
    $("#product-form").addEventListener("submit", saveProductFromDialog);
    ["#recommended-quantity-input", "#purchased-quantity-input", "#stock-quantity-input", "#purchase-date-input"].forEach((selector) => $(selector).addEventListener("input", updateDialogProjection));
    $("#recommended-unit-input").addEventListener("change", convertDialogUnit);
    $("#stock-unit-input").addEventListener("change", convertStockDialogUnit);

    ["#receipt-store", "#receipt-date", "#receipt-number", "#receipt-reported-total"].forEach((selector) => {
      $(selector).addEventListener("input", saveReceiptMetadata);
    });
    $("#receipt-photo-input").addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (file) void saveReceiptPhoto(file);
    });
    $("#receipt-photo-remove").addEventListener("click", () => void removeReceiptPhoto());

    $("#default-cadence").addEventListener("change", (event) => {
      state.settings.defaultCadence = event.target.value;
      state.items.forEach((item) => {
        if (item.purchaseStatus !== "skipped") item.purchaseStatus = statusFromQuantity(item);
      });
      saveState({ render: true });
      showToast("Cantidades recalculadas para el nuevo ciclo.");
    });
    $("#cycle-start-date").addEventListener("change", (event) => {
      state.settings.cycleStart = event.target.value || todayISO();
      saveState();
    });
    $("#show-optional-items").addEventListener("change", (event) => {
      state.settings.showOptional = event.target.checked;
      saveState({ render: true });
    });
    $("#show-non-habitual-items").addEventListener("change", (event) => {
      state.settings.showInactive = event.target.checked;
      saveState({ render: true });
    });

    $("#new-cycle-button").addEventListener("click", () => {
      $("#new-cycle-date").value = todayISO();
      openDialog("new-cycle-dialog");
    });
    $("#confirm-new-cycle-button").addEventListener("click", startNewCycle);
    $("#export-button").addEventListener("click", openExportDialog);
    $("#copy-export-button").addEventListener("click", copyExport);
    $("#download-export-button").addEventListener("click", downloadExport);
    $("#import-button").addEventListener("click", () => {
      $("#import-data").value = "";
      $("#import-error").hidden = true;
      openDialog("import-dialog");
    });
    $("#import-file").addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (file) $("#import-data").value = await file.text();
    });
    $("#confirm-import-button").addEventListener("click", confirmImport);
    $("#reset-app-button").addEventListener("click", () => openDialog("reset-dialog"));
    $("#confirm-reset-button").addEventListener("click", resetApplication);

    window.addEventListener("online", updateConnectionStatus);
    window.addEventListener("offline", updateConnectionStatus);
    window.addEventListener("hashchange", () => switchView(viewFromHash(), { updateHash: false }));
    window.addEventListener("storage", (event) => {
      if (event.key === STORAGE_KEY) {
        state = loadState();
        renderAll();
      }
    });
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      installPrompt = event;
      $("#install-app-button").hidden = false;
    });
    $("#install-app-button").addEventListener("click", async () => {
      if (!installPrompt) return;
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      $("#install-app-button").hidden = true;
    });
  }

  function viewFromHash() {
    return { "#comprar": "shopping", "#reposicion": "replenishment", "#factura": "invoice", "#ajustes": "settings" }[location.hash] || "shopping";
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("./sw.js?v=2.1.2").catch((error) => console.warn("No se pudo registrar el modo sin conexión", error));
    }
  }

  function init() {
    populateCategoryFilter();
    bindEvents();
    renderAll();
    updateConnectionStatus();
    switchView(viewFromHash(), { updateHash: false });
    registerServiceWorker();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
