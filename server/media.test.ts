import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { localImage, mediaStem, safeMediaName } from "./media";

describe("offline images", () => {
  it("maps a CDN image to its saved copy by file stem, whatever the saved extension", () => {
    const dir = mkdtempSync(join(tmpdir(), "byb-media-"));
    writeFileSync(join(dir, "SAMP-UPH-CG-FAB-CHNIL.jpg"), "x");
    const swatch = "https://cdn.shopify.com/s/files/1/0932/3220/2030/files/SAMP-UPH-CG-FAB-CHNIL.webp?v=1749237447";
    expect(mediaStem(swatch)).toBe("SAMP-UPH-CG-FAB-CHNIL");
    expect(localImage(swatch, dir)).toBe("/media/SAMP-UPH-CG-FAB-CHNIL.jpg");
    // No saved copy: the CDN link stays.
    expect(localImage("https://cdn.shopify.com/s/files/other.jpg", dir)).toBe("https://cdn.shopify.com/s/files/other.jpg");
    expect(localImage(null, dir)).toBeNull();
  });

  it("serves only plain image file names", () => {
    expect(safeMediaName("cimage_6f9815505600f44c.jpg")).toBe(true);
    for (const bad of ["../.env", ".env", "a/b.jpg", "notes.txt", "x.js"]) expect(safeMediaName(bad), bad).toBe(false);
  });
});
