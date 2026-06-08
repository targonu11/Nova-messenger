/**
 * Выбор изображения из галереи / файлов.
 * Атрибут capture не задаётся — на телефонах не принуждает открыть только камеру.
 */
export function pickImageFromGallery() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    let settled = false;

    const finish = (file) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onWindowFocus);
      if (input.parentNode) input.remove();
      resolve(file ?? null);
    };

    const onWindowFocus = () => {
      setTimeout(() => {
        if (!input.parentNode) return;
        finish(input.files?.[0] ?? null);
      }, 320);
    };

    input.addEventListener('change', () => {
      finish(input.files?.[0] ?? null);
    });

    window.addEventListener('focus', onWindowFocus);
    document.body.appendChild(input);
    input.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none';

    try {
      if (typeof input.showPicker === 'function') {
        input.showPicker().catch(() => input.click());
      } else {
        input.click();
      }
    } catch {
      try {
        input.click();
      } catch {
        finish(null);
      }
    }
  });
}
