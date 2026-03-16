import gsap from "gsap";

// --- Selectors -------------------------------------------------------------
const HOVER = 'a, button, [role="button"], .cursor-target';

// --- Tunables --------------------------------------------------------------
const SIZE = 15;
const CORNER = 8;
const PAD = 8;
const LERP = 0.15;
const DUR = 0.4;
const EASE = "power3.out";

export class CursorEngine {
  private el: HTMLDivElement;
  private corners: HTMLDivElement[];

  private mouse = { x: 0, y: 0 };
  private pos = { x: 0, y: 0 };
  private cur = { w: SIZE, h: SIZE };
  private visible = false;

  private hovered: Element | null = null;
  private rafId = 0;
  private mTween: gsap.core.Tween | null = null;
  private cTween: gsap.core.Tween | null = null;

  // Bound handlers for clean removal
  private onMove: (e: MouseEvent) => void;
  private onOver: (e: MouseEvent) => void;
  private onOut: (e: MouseEvent) => void;
  private onLeave: () => void;
  private onFocusIn: (e: FocusEvent) => void;
  private onFocusOut: (e: FocusEvent) => void;
  private boundTick: () => void;

  constructor(el: HTMLDivElement, corners: HTMLDivElement[]) {
    this.el = el;
    this.corners = corners;
    this.el.style.opacity = "0";
    this.onMove = this.handleMove.bind(this);
    this.onOver = this.handleOver.bind(this);
    this.onOut = this.handleOut.bind(this);
    this.onLeave = this.handleLeave.bind(this);
    this.onFocusIn = this.handleFocusIn.bind(this);
    this.onFocusOut = this.handleFocusOut.bind(this);
    this.boundTick = this.tick.bind(this);
  }

  start() {
    document.addEventListener("mousemove", this.onMove, { passive: true });
    document.addEventListener("mouseover", this.onOver, { passive: true });
    document.addEventListener("mouseout", this.onOut, { passive: true });
    document.addEventListener("mouseleave", this.onLeave, { passive: true });
    document.addEventListener("focusin", this.onFocusIn, { passive: true });
    document.addEventListener("focusout", this.onFocusOut, { passive: true });
    this.rafId = requestAnimationFrame(this.boundTick);
  }

  destroy() {
    cancelAnimationFrame(this.rafId);
    document.removeEventListener("mousemove", this.onMove);
    document.removeEventListener("mouseover", this.onOver);
    document.removeEventListener("mouseout", this.onOut);
    document.removeEventListener("mouseleave", this.onLeave);
    document.removeEventListener("focusin", this.onFocusIn);
    document.removeEventListener("focusout", this.onFocusOut);
    this.mTween?.kill();
    this.cTween?.kill();
  }

  // --- Corner size --------------------------------------------------------

  private setCorners(s: number, anim: boolean) {
    if (anim) {
      this.cTween?.kill();
      this.cTween = gsap.to(this.corners, {
        width: s,
        height: s,
        duration: DUR,
        ease: EASE,
      });
    } else {
      const px = s + "px";
      for (let i = 0; i < 4; i++) {
        this.corners[i].style.width = px;
        this.corners[i].style.height = px;
      }
    }
  }

  // --- Morph --------------------------------------------------------------

  private morphRect(r: DOMRect) {
    const w = r.width + PAD * 2;
    const h = r.height + PAD * 2;
    this.cur.w = w;
    this.cur.h = h;

    this.mTween?.kill();
    this.mTween = gsap.to(this.el, { width: w, height: h, duration: DUR, ease: EASE });
    this.setCorners(CORNER, true);
  }

  private morphEl(t: Element) {
    this.morphRect(t.getBoundingClientRect());
  }

  private morphReset() {
    this.cur.w = SIZE;
    this.cur.h = SIZE;
    this.mTween?.kill();
    this.mTween = gsap.to(this.el, { width: SIZE, height: SIZE, duration: DUR, ease: EASE });
    this.setCorners(CORNER, true);
  }

  private hardReset() {
    this.cur.w = SIZE;
    this.cur.h = SIZE;
    this.mTween?.kill();
    this.cTween?.kill();
    this.el.style.width = SIZE + "px";
    this.el.style.height = SIZE + "px";
    this.setCorners(CORNER, false);
  }

  // --- Event handlers -----------------------------------------------------

  private handleMove(e: MouseEvent) {
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;

    if (!this.visible) {
      this.visible = true;
      this.pos.x = e.clientX;
      this.pos.y = e.clientY;
      this.el.style.opacity = "1";
    }
  }

  private handleLeave() {
    this.visible = false;
    this.el.style.opacity = "0";
  }

  private handleOver(e: MouseEvent) {
    const t = (e.target as Element)?.closest?.(HOVER);
    if (!t) return;
    this.hovered = t;
    this.morphEl(t);
  }

  private handleOut(e: MouseEvent) {
    const t = (e.target as Element)?.closest?.(HOVER);
    if (!t) return;
    if ((e.relatedTarget as Element)?.closest?.(HOVER) === t) return;
    this.hovered = null;
    this.morphReset();
  }

  private handleFocusIn(e: FocusEvent) {
    const t = (e.target as Element)?.closest?.(HOVER);
    if (!t) return;
    this.hovered = t;
    this.morphEl(t);
  }

  private handleFocusOut(e: FocusEvent) {
    const t = (e.target as Element)?.closest?.(HOVER);
    if (!t) return;
    if ((e.relatedTarget as Element)?.closest?.(HOVER) === t) return;
    this.hovered = null;
    this.morphReset();
  }

  // --- Animation loop -----------------------------------------------------

  private tick() {
    if (!this.visible) {
      this.rafId = requestAnimationFrame(this.boundTick);
      return;
    }

    if (this.hovered && !document.contains(this.hovered)) {
      this.hovered = null;
      this.hardReset();
    }

    const rect = this.hovered ? this.hovered.getBoundingClientRect() : null;
    let tx: number, ty: number;

    if (rect && this.hovered) {
      tx = rect.left + rect.width / 2;
      ty = rect.top + rect.height / 2;
      if (!this.mTween || !this.mTween.isActive()) {
        const w = rect.width + PAD * 2;
        const h = rect.height + PAD * 2;
        this.cur.w = w;
        this.cur.h = h;
        this.el.style.width = w + "px";
        this.el.style.height = h + "px";
      }
    } else {
      tx = this.mouse.x;
      ty = this.mouse.y;
    }

    this.pos.x += (tx - this.pos.x) * LERP;
    this.pos.y += (ty - this.pos.y) * LERP;

    this.el.style.transform = `translate3d(${this.pos.x - this.cur.w / 2}px, ${this.pos.y - this.cur.h / 2}px, 0)`;

    this.rafId = requestAnimationFrame(this.boundTick);
  }
}
