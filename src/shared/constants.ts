/**
 * Shared layout constants used by both main + renderer.
 *
 * TOOLTIP_HALO_PX: vertical breathing room added above and below the avatar
 * inside its BrowserWindow so the whisper / hover-suggestion tooltip can
 * render outside the avatar bitmap without being clipped by the window
 * bounds. Without this halo, tooltips with `-top-8` (32 px above) get
 * clipped by the OS and never appear on screen.
 *
 * TOOLTIP_WINDOW_WIDTH: window width used so the tooltip text (which can
 * be ~10 words) has somewhere to render horizontally. The avatar bitmap is
 * centered inside this width. Pointer events outside the avatar slot are
 * disabled so click-through to the desktop still works in the wings.
 */
export const TOOLTIP_HALO_PX = 56
export const TOOLTIP_WINDOW_WIDTH = 540

