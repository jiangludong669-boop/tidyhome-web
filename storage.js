'use strict';

window.InventoryStorage = (() => {
  const stateKey = 'inventory';
  const initialState = () => ({ cabinets: [], sort: 'recent' });

  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('tidyhome-web', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('data');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Storage upgrade blocked'));
    });
  }

  function transaction(database, mutate) {
    return new Promise((resolve, reject) => {
      const tx = database.transaction('data', mutate ? 'readwrite' : 'readonly');
      const collection = tx.objectStore('data');
      const request = collection.get(stateKey);
      let value;
      let failure;
      request.onsuccess = () => {
        value = request.result ?? initialState();
        if (!mutate) return;
        try {
          mutate(value);
          collection.put(value, stateKey);
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('Storage transaction aborted'));
      tx.onerror = event => reject(event.target.error ?? tx.error ?? new Error('Storage transaction failed'));
    });
  }

  async function photoFromFile(file) {
    const original = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Unsupported photo'));
        image.src = original;
      });
      const factor = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * factor));
      const height = Math.max(1, Math.round(image.naturalHeight * factor));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { alpha: false });
      context.fillStyle = '#f1ede4';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not save photo')), 'image/jpeg', .88);
      });
      return { id: Inventory.id(), width, height, bytes: await blob.arrayBuffer() };
    } finally {
      URL.revokeObjectURL(original);
    }
  }

  function createPhotoURL(photo) {
    const blob = photo.blob ?? new Blob([photo.bytes], { type: 'image/jpeg' });
    return URL.createObjectURL(blob);
  }

  return { open, transaction, photoFromFile, createPhotoURL };
})();
