// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Utility to save / download a Blob with a native OS "Save As" file picker prompt
 * where supported (Chromium: Chrome, Edge, Brave, Opera on Desktop via File System Access API),
 * with graceful fallback to standard browser download (Safari, Firefox, Mobile).
 */
export async function saveBlobWithPicker(
  blob: Blob,
  suggestedName: string,
  mimeType = "application/octet-stream"
): Promise<void> {
  // 1. File System Access API (Chrome, Edge, Opera, Brave on Desktop)
  if (typeof window !== "undefined" && "showSaveFilePicker" in window) {
    try {
      const is3mf = suggestedName.toLowerCase().endsWith(".3mf");
      const isZip = suggestedName.toLowerCase().endsWith(".zip");
      const ext = is3mf ? ".3mf" : isZip ? ".zip" : "";
      const description = is3mf ? "3MF Project Archive" : isZip ? "ZIP Archive" : "File";
      
      const effectiveMime = is3mf ? "application/vnd.ms-package.3dmanufacturing-3dmodel+xml" : isZip ? "application/zip" : mimeType;
      
      const fileHandle = await (window as any).showSaveFilePicker({
        suggestedName,
        types: ext
          ? [
              {
                description,
                accept: { [effectiveMime]: [ext] },
              },
            ]
          : undefined,
      });

      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err: any) {
      // If user deliberately canceled the native file picker, do not fallback to download
      if (err?.name === "AbortError") {
        return;
      }
      // If any other unexpected error occurred, proceed to fallback below
    }
  }

  // 2. Universal Fallback for Safari, Firefox, iOS, Android
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = suggestedName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
