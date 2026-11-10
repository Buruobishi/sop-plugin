const SOP_DB = "sop-recorder";
const SOP_STORE = "guide";
const SOP_KEY = "current";

function openSopDb() {
  return new Promise(function (resolve, reject) {
    const request = indexedDB.open(SOP_DB, 1);
    request.onupgradeneeded = function () {
      const db = request.result;
      if (!db.objectStoreNames.contains(SOP_STORE)) db.createObjectStore(SOP_STORE);
    };
    request.onsuccess = function () {
      resolve(request.result);
    };
    request.onerror = function () {
      reject(request.error);
    };
  });
}

function emptyGuide() {
  return {
    title: "未命名流程",
    description: "",
    recording: false,
    startedAt: null,
    steps: [],
  };
}

async function loadGuide() {
  const db = await openSopDb();
  return new Promise(function (resolve, reject) {
    const tx = db.transaction(SOP_STORE, "readonly");
    const request = tx.objectStore(SOP_STORE).get(SOP_KEY);
    request.onsuccess = function () {
      resolve(request.result || emptyGuide());
    };
    request.onerror = function () {
      reject(request.error);
    };
  });
}

async function saveGuide(guide) {
  const db = await openSopDb();
  return new Promise(function (resolve, reject) {
    const tx = db.transaction(SOP_STORE, "readwrite");
    tx.objectStore(SOP_STORE).put(guide, SOP_KEY);
    tx.oncomplete = function () {
      resolve(guide);
    };
    tx.onerror = function () {
      reject(tx.error);
    };
  });
}
