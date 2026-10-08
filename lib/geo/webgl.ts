/**
 * Whether this browser can draw the map: MapLibre 6 needs WebGL 2. Old GPUs and some virtual
 * desktops cannot, and there both surfaces fall back to their lists. The probe's context is
 * released at once, since browsers cap how many WebGL contexts may live at the same time.
 */
export function supportsWebGL2(doc: Pick<Document, "createElement"> = document): boolean {
  try {
    const gl = doc.createElement("canvas").getContext("webgl2") as Partial<WebGL2RenderingContext> | null;
    if (!gl) return false;
    gl.getExtension?.("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

let known: boolean | undefined;

/** `supportsWebGL2`, asked once per page: every probe costs a context. */
export function webgl2Available(): boolean {
  known ??= supportsWebGL2();
  return known;
}
