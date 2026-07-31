// DOM + canvas shims, installed BEFORE phaser is imported.
//
// Phaser reads `window` at module-evaluation time, so this cannot be a normal
// import — anything that pulls in phaser must `await installDom()` first and
// then use a dynamic import. That ordering is the whole reason this file exists.
//
// The canvas is real (@napi-rs/canvas), not a stub, so BootScene's procedural
// sprite and tile generation runs unmodified. That matters more than it looks:
// the harness and the shipped game then build their textures and animations
// through exactly the same code path, and there is no second art pipeline to
// drift out of sync.
import { JSDOM } from 'jsdom';
import { createCanvas, Image as CanvasImage } from '@napi-rs/canvas';

let installed = false;

export function installDom() {
  if (installed) return globalThis.window;
  installed = true;

  const dom = new JSDOM('<!doctype html><html><body><div id="game"></div></body></html>', {
    pretendToBeVisual: true,
    url: 'http://localhost/',
  });
  const { window } = dom;

  // Hand every canvas request to napi-rs. jsdom's own canvas support is absent
  // unless the `canvas` package is present, and Phaser needs a working 2D
  // context the moment a texture is generated.
  const origCreateElement = window.document.createElement.bind(window.document);
  window.document.createElement = (tag, ...rest) => {
    if (String(tag).toLowerCase() === 'canvas') {
      const c = createCanvas(1, 1);
      // napi-rs gives us getContext/toDataURL for free. Phaser additionally
      // treats the canvas as a DOM element — the ScaleManager measures it, the
      // input manager binds listeners — so supply the surface it touches.
      c.style = {};
      c.nodeType = 1;
      c.tagName = 'CANVAS';
      c.setAttribute = () => {};
      c.getAttribute = () => null;
      c.removeAttribute = () => {};
      c.addEventListener = () => {};
      c.removeEventListener = () => {};
      c.dispatchEvent = () => true;
      c.focus = () => {};
      c.blur = () => {};
      c.getBoundingClientRect = () => ({
        x: 0, y: 0, top: 0, left: 0,
        width: c.width, height: c.height,
        right: c.width, bottom: c.height,
      });
      Object.defineProperty(c, 'parentNode', { value: null, writable: true, configurable: true });
      Object.defineProperty(c, 'ownerDocument', { value: window.document, configurable: true });
      return c;
    }
    return origCreateElement(tag, ...rest);
  };

  // Node 22 defines `navigator` (and friends) as getter-only globals, so a
  // plain assignment throws. Define over them instead.
  const define = (name, value) => {
    Object.defineProperty(globalThis, name, {
      value, writable: true, configurable: true, enumerable: false,
    });
  };

  // Phaser mounts its canvas into the page even in HEADLESS mode. Our canvases
  // come from napi-rs and are not jsdom Nodes, so the real appendChild rejects
  // them. Nothing is ever displayed here, so swallowing those inserts is
  // harmless — but only those: real Nodes still go through untouched.
  const proto = window.Node.prototype;
  const origAppend = proto.appendChild;
  proto.appendChild = function appendChild(child) {
    if (child instanceof window.Node) return origAppend.call(this, child);
    return child;
  };
  const origRemove = proto.removeChild;
  proto.removeChild = function removeChild(child) {
    if (child instanceof window.Node) return origRemove.call(this, child);
    return child;
  };

  globalThis.window = window;
  globalThis.document = window.document;
  define('navigator', window.navigator);
  define('location', window.location);
  // Phaser type-tests sources with bare `instanceof HTMLVideoElement` and
  // friends. Copy the whole constructor surface across in one go rather than
  // discovering them one crash at a time.
  for (const key of Object.getOwnPropertyNames(window)) {
    if (/^(HTML|SVG)\w*Element$/.test(key) && !(key in globalThis)) {
      define(key, window[key]);
    }
  }
  globalThis.Element = window.Element;
  globalThis.Node = window.Node;
  globalThis.Event = window.Event;
  globalThis.CustomEvent = window.CustomEvent;
  globalThis.KeyboardEvent = window.KeyboardEvent;
  globalThis.MouseEvent = window.MouseEvent;
  globalThis.screen = window.screen;
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  globalThis.devicePixelRatio = 1;
  globalThis.CanvasRenderingContext2D = window.CanvasRenderingContext2D ?? function () {};
  globalThis.Image = CanvasImage;
  globalThis.ImageData = window.ImageData;
  globalThis.XMLHttpRequest = window.XMLHttpRequest;
  globalThis.URL = window.URL ?? globalThis.URL;
  globalThis.self = window;

  // Phaser's HEADLESS renderer still asks for these; absent them it throws
  // before a single frame runs.
  if (!globalThis.requestAnimationFrame) {
    globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
    globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  }
  window.focus = () => {};
  window.matchMedia = window.matchMedia ?? (() => ({ matches: false, addListener() {}, removeListener() {} }));

  return window;
}
