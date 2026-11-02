(() => {
  "use strict";

  const DATABASE_NAME = "compras-familiares-media";
  const DATABASE_VERSION = 1;
  const STORE_NAME = "receipts";
  const MAX_IMAGE_SIDE = 1600;
  const JPEG_QUALITY = 0.82;

  function ensureIndexedDB() {
    if (!("indexedDB" in window)) {
      throw new Error("Este navegador no permite guardar la foto de la factura localmente.");
    }
  }

  function validateCycleId(cycleId) {
    const normalized = String(cycleId || "").trim();
    if (!normalized) throw new Error("No se pudo identificar el ciclo de compra.");
    return normalized;
  }

  function openDatabase() {
    ensureIndexedDB();
    return new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: "cycleId" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("No se pudo abrir el almacenamiento local de facturas."));
      request.onblocked = () => reject(new Error("El almacenamiento de facturas está ocupado. Cierra otras pestañas e inténtalo nuevamente."));
    });
  }

  function requestResult(request, errorMessage) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error(errorMessage));
    });
  }

  function transactionComplete(transaction, errorMessage) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error(errorMessage));
      transaction.onabort = () => reject(new Error(errorMessage));
    });
  }

  async function runTransaction(mode, operation, errorMessage) {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(STORE_NAME, mode);
      const completed = transactionComplete(transaction, errorMessage);
      const result = await operation(transaction.objectStore(STORE_NAME));
      await completed;
      return result;
    } finally {
      database.close();
    }
  }

  async function compressImage(file) {
    if (!(file instanceof Blob) || !String(file.type || "").startsWith("image/")) {
      throw new Error("Selecciona una imagen válida de la factura.");
    }
    if (typeof window.createImageBitmap !== "function" || typeof document === "undefined") return file;

    let bitmap;
    try {
      bitmap = await window.createImageBitmap(file);
      const longestSide = Math.max(bitmap.width, bitmap.height);
      const scale = longestSide > MAX_IMAGE_SIDE ? MAX_IMAGE_SIDE / longestSide : 1;
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return file;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      const compressed = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
      if (!compressed) return file;
      return compressed.size < file.size || scale < 1 ? compressed : file;
    } catch {
      return file;
    } finally {
      if (bitmap && typeof bitmap.close === "function") bitmap.close();
    }
  }

  async function saveImage(cycleId, file) {
    const key = validateCycleId(cycleId);
    const blob = await compressImage(file);
    const record = {
      cycleId: key,
      blob,
      type: blob.type || file.type || "application/octet-stream",
      size: blob.size,
      updatedAt: new Date().toISOString(),
    };
    await runTransaction(
      "readwrite",
      (store) => requestResult(store.put(record), "No se pudo guardar la foto de la factura."),
      "No se pudo guardar la foto de la factura.",
    );
    return { type: record.type, size: record.size, updatedAt: record.updatedAt };
  }

  async function getImage(cycleId) {
    const key = validateCycleId(cycleId);
    const record = await runTransaction(
      "readonly",
      (store) => requestResult(store.get(key), "No se pudo leer la foto de la factura."),
      "No se pudo leer la foto de la factura.",
    );
    return record?.blob instanceof Blob ? record.blob : null;
  }

  async function deleteImage(cycleId) {
    const key = validateCycleId(cycleId);
    await runTransaction(
      "readwrite",
      (store) => requestResult(store.delete(key), "No se pudo eliminar la foto de la factura."),
      "No se pudo eliminar la foto de la factura.",
    );
  }

  async function clearAll() {
    await runTransaction(
      "readwrite",
      (store) => requestResult(store.clear(), "No se pudieron eliminar las fotos guardadas."),
      "No se pudieron eliminar las fotos guardadas.",
    );
  }

  window.ReceiptStorage = Object.freeze({ saveImage, getImage, deleteImage, clearAll });
})();
