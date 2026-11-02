(() => {
  "use strict";

  const APP_VERSION = "1.0.1";
  const STORAGE_KEY = "shoppingPlanner:v1";
  const SCHEMA_VERSION = 1;

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
  const STATUS_LABELS = { pending: "Pendiente", partial: "Compra parcial", purchased: "Comprado", skipped: "No comprar" };
  const dateFormatter = new Intl.DateTimeFormat("es-EC", { day: "numeric", month: "short", year: "numeric" });
  const shortMonthFormatter = new Intl.DateTimeFormat("es-EC", { month: "short" });

  let state = loadState();
  let activeStatusFilter = "all";
  let activeView = "shopping";
  let installPrompt = null;
  let toastTimer = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function todayISO() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
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

  function normalizeText(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }

  function createInitialState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      items: window.SHOPPING_ITEMS.map((item) => ({
        ...item,
        brand: "",
        purchaseStatus: "pending",
        quantityPurchased: 0,
        actualUnit: item.unit,
        purchaseDate: "",
      })),
      settings: {
        defaultCadence: "fortnightly",
        cycleStart: todayISO(),
        showOptional: true,
        showInactive: false,
      },
      history: [],
      lastSaved: null,
    };
  }

  function normalizeLoadedState(raw) {
    const initial = createInitialState();
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.items)) return initial;
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
      merged.actualUnit = UNIT_META[stored.actualUnit] ? stored.actualUnit : merged.unit;
      merged.quantityPurchased = normalizeQuantityForUnit(stored.quantityPurchased || 0, merged.actualUnit);
      merged.purchaseStatus = STATUS_LABELS[stored.purchaseStatus] ? stored.purchaseStatus : "pending";
      merged.planStatus = ["regular", "optional", "inactive"].includes(stored.planStatus) ? stored.planStatus : base.planStatus;
      return merged;
    });
    return {
      ...initial,
      ...raw,
      schemaVersion: SCHEMA_VERSION,
      items,
      settings: { ...initial.settings, ...(raw.settings || {}) },
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

  function recommendedForCurrentPlan(item) {
    if (item.monthlyQty == null || !Number.isFinite(Number(item.monthlyQty))) return null;
    if (item.referenceDays > 30) return Number(item.monthlyQty);
    const planDays = CADENCE_DAYS[state.settings.defaultCadence] || 30;
    const quantity = Number(item.monthlyQty) * planDays / Number(item.referenceDays || 30);
    const unitFamily = UNIT_META[item.unit]?.family;
    return ["mass", "volume", "length"].includes(unitFamily) ? quantity : Math.ceil(quantity);
  }

  function normalizedPurchased(item) {
    const result = convertQuantity(item.quantityPurchased || 0, item.actualUnit || item.unit, item.unit);
    return result == null ? 0 : result;
  }

  function calculateProjection(item, overrides = {}) {
    const referenceQty = Object.prototype.hasOwnProperty.call(overrides, "referenceQty")
      ? overrides.referenceQty
      : item.monthlyQty;
    const purchasedQty = overrides.purchasedQty ?? normalizedPurchased(item);
    const purchaseDate = parseLocalDate(overrides.purchaseDate ?? item.purchaseDate);
    if (referenceQty == null || Number(referenceQty) <= 0 || Number(purchasedQty) <= 0) {
      return { durationDays: null, usableDays: null, replenishmentDate: null, shelfLimited: false };
    }
    const durationDays = Number(item.referenceDays || 30) * Number(purchasedQty) / Number(referenceQty);
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
    const recommended = recommendedForCurrentPlan(item);
    if (purchased <= 0) return "pending";
    if (recommended == null || recommended <= 0) return "pending";
    return purchased + 1e-9 >= recommended * 0.98 ? "purchased" : "partial";
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
      if (activeStatusFilter !== "all" && item.purchaseStatus !== activeStatusFilter) return false;
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

    const recommended = recommendedForCurrentPlan(item);
    $(".recommended-quantity", card).textContent = recommended == null
      ? "definir cantidad"
      : formatQuantity(recommended, item.unit);

    const projection = calculateProjection(item);
    const durationLabel = $(".duration-label", card);
    if (projection.usableDays != null) {
      const dateText = projection.replenishmentDate ? ` · hasta ${dateFormatter.format(projection.replenishmentDate)}` : "";
      durationLabel.textContent = `${formatNumber(projection.usableDays, 0)} días de cobertura${dateText}`;
    } else {
      durationLabel.textContent = item.monthlyQty == null ? "Falta definir la recomendación" : "Sin compra registrada";
    }

    const toggle = $(".purchase-toggle", card);
    toggle.setAttribute("aria-pressed", String(item.purchaseStatus === "purchased"));
    toggle.setAttribute("aria-label", item.purchaseStatus === "purchased" ? `Desmarcar ${item.name}` : `Marcar ${item.name} como comprado`);
    toggle.addEventListener("click", () => togglePurchased(item.id));
    $(".product-open", card).addEventListener("click", () => openProductDialog(item.id));

    const quantityInput = $(".actual-quantity", card);
    quantityInput.value = item.quantityPurchased || 0;
    quantityInput.setAttribute("aria-label", `Cantidad comprada de ${item.name}`);
    quantityInput.addEventListener("change", () => updateQuantity(item.id, quantityInput.value, unitSelect.value));
    quantityInput.addEventListener("blur", () => updateQuantity(item.id, quantityInput.value, unitSelect.value));

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
    $(".fill-recommended-button", card).addEventListener("click", () => fillRecommended(item.id));

    const status = $(".product-status", card);
    if (item.purchaseStatus === "skipped") {
      status.textContent = "Excluido de esta compra. Puedes reactivarlo desde los detalles.";
      status.classList.add("warning");
    } else if (projection.shelfLimited) {
      status.textContent = `Conviene dividir la compra: conservación estimada de ${formatNumber(item.shelfLifeDays, 0)} días.`;
      status.classList.add("warning");
    } else if (item.purchaseStatus === "partial") {
      status.textContent = "Compra parcial frente a la cantidad recomendada para este ciclo.";
      status.classList.add("partial");
    }
    return fragment;
  }

  function createTag(text) {
    const tag = document.createElement("span");
    tag.textContent = text;
    return tag;
  }

  function renderSummary() {
    const eligible = state.items.filter(includedBySettings);
    const skipped = eligible.filter((item) => item.purchaseStatus === "skipped").length;
    const planned = eligible.filter((item) => item.purchaseStatus !== "skipped");
    const purchased = planned.filter((item) => item.purchaseStatus === "purchased").length;
    const partial = planned.filter((item) => item.purchaseStatus === "partial").length;
    const pending = planned.filter((item) => item.purchaseStatus === "pending").length;
    const progress = planned.length ? Math.round((purchased + partial * 0.5) / planned.length * 100) : 0;
    $("#summary-purchased").textContent = purchased;
    $("#summary-total").textContent = planned.length;
    $("#summary-pending").textContent = pending;
    $("#summary-partial").textContent = partial;
    $("#summary-skipped").textContent = skipped;
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

  function renderAll() {
    populateCategoryFilter();
    renderShoppingList();
    renderReplenishment();
    renderSettings();
  }

  function findItem(id) {
    return state.items.find((item) => item.id === id);
  }

  function togglePurchased(id) {
    const item = findItem(id);
    if (!item) return;
    if (item.purchaseStatus === "purchased") {
      item.purchaseStatus = "pending";
      item.quantityPurchased = 0;
      item.purchaseDate = "";
    } else {
      const recommended = recommendedForCurrentPlan(item);
      if (recommended == null) {
        openProductDialog(id);
        showToast("Primero define la cantidad recomendada.");
        return;
      }
      item.quantityPurchased = Number(recommended.toFixed(3));
      item.actualUnit = item.unit;
      item.purchaseStatus = "purchased";
      item.purchaseDate = todayISO();
    }
    saveState({ render: true });
  }

  function updateQuantity(id, rawQuantity, unit) {
    const item = findItem(id);
    if (!item) return;
    item.actualUnit = UNIT_META[unit] ? unit : item.unit;
    item.quantityPurchased = normalizeQuantityForUnit(rawQuantity, item.actualUnit);
    if (item.purchaseStatus !== "skipped") item.purchaseStatus = statusFromQuantity(item);
    if (item.quantityPurchased > 0 && !item.purchaseDate) item.purchaseDate = todayISO();
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
    if (nextInBase > 0 && !item.purchaseDate) item.purchaseDate = todayISO();
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
    item.purchaseStatus = "purchased";
    item.purchaseDate = todayISO();
    saveState({ render: true });
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
    const projection = calculateProjection(item, {
      referenceQty: Number.isFinite(referenceQty) && referenceQty > 0 ? referenceQty : null,
      purchasedQty: Number.isFinite(purchasedQty) ? purchasedQty : 0,
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

  function saveProductFromDialog(event) {
    event.preventDefault();
    const item = findItem($("#product-id").value);
    if (!item) return;
    const name = $("#product-name-input").value.trim();
    const recommendedRaw = $("#recommended-quantity-input").value;
    const selectedUnit = $("#recommended-unit-input").value;
    const purchased = normalizeQuantityForUnit($("#purchased-quantity-input").value, selectedUnit);
    item.name = name || item.name;
    item.brand = $("#product-brand-input").value.trim();
    item.monthlyQty = recommendedRaw === "" ? null : normalizeQuantityForUnit(recommendedRaw, selectedUnit);
    item.unit = selectedUnit;
    item.quantityPurchased = purchased;
    item.actualUnit = item.unit;
    item.purchaseDate = $("#purchase-date-input").value;
    item.purchaseStatus = $("#product-status-input").value;
    if (!$("#habitual-input").checked) item.planStatus = "inactive";
    else item.planStatus = $("#optional-input").checked ? "optional" : "regular";
    item.notes = $("#product-note-input").value.trim();
    if (item.monthlyQty == null && item.purchaseStatus !== "skipped") item.purchaseStatus = "pending";
    if (item.purchaseStatus === "purchased" && purchased <= 0) item.purchaseStatus = "pending";
    if (item.purchaseStatus !== "skipped" && purchased > 0 && item.purchaseStatus === "pending") item.purchaseStatus = statusFromQuantity(item);
    saveState({ render: true });
    $("#product-dialog").close();
    showToast("Producto actualizado.");
  }

  function switchView(view, { updateHash = true } = {}) {
    if (!["shopping", "replenishment", "settings"].includes(view)) view = "shopping";
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
    if (view === "replenishment") renderReplenishment();
    if (updateHash) history.replaceState(null, "", `#${{ shopping: "comprar", replenishment: "reposicion", settings: "ajustes" }[view]}`);
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
    const snapshot = {
      endedAt: new Date().toISOString(),
      cycleStart: state.settings.cycleStart,
      purchased: state.items.filter((item) => item.purchaseStatus === "purchased").length,
      partial: state.items.filter((item) => item.purchaseStatus === "partial").length,
    };
    state.history.push(snapshot);
    state.history = state.history.slice(-12);
    const nextCycleStart = $("#new-cycle-date").value || todayISO();
    const cycleStartDate = parseLocalDate(nextCycleStart);
    const cycleEndDate = addDays(cycleStartDate, CADENCE_DAYS[state.settings.defaultCadence] || 30);
    state.items.forEach((item) => {
      const projection = calculateProjection(item);
      const remainsCovered = projection.replenishmentDate && projection.replenishmentDate > cycleEndDate;
      if (remainsCovered && item.purchaseStatus !== "skipped") return;
      item.purchaseStatus = "pending";
      item.quantityPurchased = 0;
      item.actualUnit = item.unit;
      item.purchaseDate = "";
    });
    state.settings.cycleStart = nextCycleStart;
    saveState({ render: true });
    $("#new-cycle-dialog").close();
    switchView("shopping");
    showToast("Nuevo ciclo iniciado; se conservó lo que aún tiene cobertura.");
  }

  function exportPayload() {
    return JSON.stringify({ app: "Compras familiares", appVersion: APP_VERSION, exportedAt: new Date().toISOString(), state }, null, 2);
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

  function resetApplication() {
    localStorage.removeItem(STORAGE_KEY);
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
    ["#recommended-quantity-input", "#purchased-quantity-input", "#purchase-date-input"].forEach((selector) => $(selector).addEventListener("input", updateDialogProjection));
    $("#recommended-unit-input").addEventListener("change", convertDialogUnit);

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
    return { "#comprar": "shopping", "#reposicion": "replenishment", "#ajustes": "settings" }[location.hash] || "shopping";
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("./sw.js").catch((error) => console.warn("No se pudo registrar el modo sin conexión", error));
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
