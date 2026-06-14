export async function writeTextWithFallback(text, options = {}) {
  const value = String(text ?? "");
  if (!value) {
    return { copied: false, method: null, error: "Clipboard text is empty." };
  }

  const desktopWriteText = options.desktopWriteText;
  if (typeof desktopWriteText === "function") {
    try {
      const result = await desktopWriteText(value);
      if (result?.ok === true) {
        return { copied: true, method: "electron" };
      }
    } catch {
      // Browser clipboard is still worth trying when Electron IPC is unavailable.
    }
  }

  const browserWriteText = options.browserWriteText;
  if (typeof browserWriteText === "function") {
    try {
      await browserWriteText(value);
      return { copied: true, method: "browser" };
    } catch {
      return { copied: false, method: null, error: "Clipboard write was blocked." };
    }
  }

  return { copied: false, method: null, error: "No clipboard writer is available." };
}

export async function readTextWithFallback(options = {}) {
  const desktopReadText = options.desktopReadText;
  if (typeof desktopReadText === "function") {
    try {
      const result = await desktopReadText();
      if (result?.ok === true) {
        return { ok: true, text: String(result.text ?? ""), method: "electron" };
      }
    } catch {
      // Browser clipboard may still work when Electron IPC is unavailable.
    }
  }

  const browserReadText = options.browserReadText;
  if (typeof browserReadText === "function") {
    try {
      return { ok: true, text: String(await browserReadText()), method: "browser" };
    } catch {
      return { ok: false, text: "", method: null, error: "Clipboard read was blocked." };
    }
  }

  return { ok: false, text: "", method: null, error: "No clipboard reader is available." };
}
