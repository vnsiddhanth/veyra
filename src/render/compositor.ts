/**
 * Frame compositor shared by the program monitor and the exporter.
 *
 * Canvas 2D does the compositing (transforms, opacity, blend modes, CSS-style filters, text);
 * WebGL2 (`PixelFx`) handles per-pixel effects. Both run on OffscreenCanvas, so the same code
 * renders preview frames and export frames — what you see is what you export.
 */
import type { Project, TextContent } from '@/project/schema/types';
import { cssFilter, effectNum, hasPixelEffects, maskEffect } from './effects';
import { subtitleTextAt, type ResolvedLayer } from './evaluate';
import { PixelFx } from './pixel-fx';

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

/** A decoded visual for a layer, already oriented for display. */
export interface LayerImage {
  source: CanvasImageSource & TexImageSource;
  width: number;
  height: number;
}

const BLEND: Record<string, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  add: 'lighter',
};

export const DEFAULT_SUBTITLE_STYLE: TextContent = {
  text: '',
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 44,
  fontWeight: 600,
  color: '#ffffff',
  background: 'rgba(0,0,0,0.55)',
  align: 'center',
  outline: null,
  shadow: null,
  letterSpacing: 0,
  lineHeight: 1.25,
};

function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Strip the b/i/u tags subtitle cues may carry; canvas text is plain. */
const plain = (s: string) => s.replace(/<\/?[biu]>/gi, '');

export class Compositor {
  readonly canvas: AnyCanvas;
  /** The 2D context this compositor draws with (reused for read-back; some engines return null for a second getContext). */
  readonly ctx: Ctx2D;
  private fx: PixelFx | null | undefined;
  private scratch: AnyCanvas | null = null;
  private maskCanvas: AnyCanvas | null = null;
  /** Effects that could not be applied on this device (reported, never silently dropped). */
  readonly skipped = new Set<string>();

  constructor(canvas: AnyCanvas) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false }) as Ctx2D | null;
    if (!ctx) throw new Error('2D canvas is unavailable.');
    this.ctx = ctx;
  }

  private pixelFx(): PixelFx | null {
    if (this.fx === undefined) this.fx = PixelFx.create();
    return this.fx;
  }

  dispose() {
    this.fx?.dispose();
    this.fx = undefined;
    this.scratch = null;
    this.maskCanvas = null;
  }

  /** Render one frame. `images` maps clip id → decoded image for media layers. */
  render(p: Project, layers: ResolvedLayer[], images: Map<string, LayerImage>, frameIndex: number): void {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const k = W / p.settings.width;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    ctx.fillStyle = p.settings.background;
    ctx.fillRect(0, 0, W, H);

    for (const layer of layers) {
      const tr = layer.transition;
      let alpha = layer.opacity;
      let dx = 0;
      let extraScale = 1;
      let clipShape: ((c: Ctx2D) => void) | null = null;
      let draw = true;
      let dip: { color: string; amount: number } | null = null;
      if (tr) {
        const q = tr.progress;
        switch (tr.type) {
          case 'crossfade':
            if (tr.role === 'to') alpha *= q;
            break;
          case 'dip-black':
          case 'dip-white':
            draw = tr.role === 'from' ? q < 0.5 : q >= 0.5;
            if (tr.role === 'to') dip = { color: tr.type === 'dip-black' ? '#000' : '#fff', amount: 1 - Math.abs(2 * q - 1) };
            break;
          case 'wipe-left':
          case 'wipe-right':
          case 'wipe-up':
          case 'wipe-down':
            if (tr.role === 'to') {
              const dir = tr.type;
              clipShape = (c) => {
                c.beginPath();
                if (dir === 'wipe-left') c.rect(W * (1 - q), 0, W * q, H);
                else if (dir === 'wipe-right') c.rect(0, 0, W * q, H);
                else if (dir === 'wipe-up') c.rect(0, H * (1 - q), W, H * q);
                else c.rect(0, 0, W, H * q);
                c.clip();
              };
            }
            break;
          case 'slide-left':
            dx = tr.role === 'from' ? -q * W : (1 - q) * W;
            break;
          case 'slide-right':
            dx = tr.role === 'from' ? q * W : -(1 - q) * W;
            break;
          case 'zoom':
            if (tr.role === 'to') {
              alpha *= q;
              extraScale = 0.6 + 0.4 * q;
            }
            break;
          case 'circle':
            if (tr.role === 'to') {
              clipShape = (c) => {
                c.beginPath();
                c.arc(W / 2, H / 2, q * Math.hypot(W, H) * 0.5, 0, Math.PI * 2);
                c.clip();
              };
            }
            break;
        }
      }

      if (draw && alpha > 0.001) {
        ctx.save();
        if (clipShape) clipShape(ctx);
        ctx.globalAlpha = alpha;
        ctx.globalCompositeOperation = BLEND[layer.clip.blendMode] ?? 'source-over';
        ctx.filter = cssFilter(layer.clip.effects, k);
        const isText = !!layer.clip.text || layer.asset?.kind === 'subtitle';
        if (isText) this.drawText(ctx, p, layer, k, dx, extraScale);
        else {
          const img = images.get(layer.clip.id);
          if (img) this.drawMedia(ctx, p, layer, img, k, dx, extraScale, frameIndex);
        }
        ctx.restore();
      }
      if (dip && dip.amount > 0) {
        ctx.save();
        ctx.globalAlpha = dip.amount;
        ctx.fillStyle = dip.color;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    }
  }

  private drawMedia(ctx: Ctx2D, p: Project, layer: ResolvedLayer, img: LayerImage, k: number, dx: number, extraScale: number, frameIndex: number) {
    const { clip } = layer;
    const info = layer.asset?.info;
    // Natural (display) size of the media, which may have been decoded at a smaller size.
    const mw = info?.width || img.width;
    const mh = info?.height || img.height;
    const fit = Math.min(p.settings.width / mw, p.settings.height / mh);
    const bw = mw * fit * k;
    const bh = mh * fit * k;

    let source: CanvasImageSource = img.source;
    let sw = img.width;
    let sh = img.height;

    if (hasPixelEffects(clip.effects)) {
      const fx = this.pixelFx();
      if (fx) {
        source = fx.apply(img.source, img.width, img.height, clip.effects, frameIndex);
      } else {
        for (const e of clip.effects) if (e.enabled) this.skipped.add(e.type);
      }
    }
    const mask = maskEffect(clip.effects);
    if (mask) {
      source = this.applyMask(source, sw, sh, mask);
    }

    const t = clip.transform;
    const sx = layer.scale * extraScale * (t.flipH ? -1 : 1);
    const sy = layer.scale * (t.scaleY / (t.scaleX || 1)) * extraScale * (t.flipV ? -1 : 1);
    const crop = t.crop;
    const cx0 = crop.left * sw;
    const cy0 = crop.top * sh;
    const cw = Math.max(1, sw * (1 - crop.left - crop.right));
    const ch = Math.max(1, sh * (1 - crop.top - crop.bottom));

    ctx.translate(this.canvas.width / 2 + layer.x * k + dx, this.canvas.height / 2 + layer.y * k);
    ctx.rotate((layer.rotation * Math.PI) / 180);
    ctx.scale(sx, sy);
    // Cropping hides edges but keeps the picture where it was.
    ctx.drawImage(source, cx0, cy0, cw, ch, -bw / 2 + crop.left * bw, -bh / 2 + crop.top * bh, bw * (cw / sw), bh * (ch / sh));
  }

  private applyMask(source: CanvasImageSource, w: number, h: number, mask: ResolvedLayer['clip']['effects'][number]): AnyCanvas {
    if (!this.scratch) this.scratch = makeCanvas(w, h);
    if (!this.maskCanvas) this.maskCanvas = makeCanvas(w, h);
    const s = this.scratch;
    const m = this.maskCanvas;
    for (const c of [s, m]) {
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
    }
    const mc = m.getContext('2d') as Ctx2D;
    mc.setTransform(1, 0, 0, 1, 0, 0);
    mc.clearRect(0, 0, w, h);
    const feather = effectNum(mask, 'feather', 0.05) * Math.min(w, h);
    mc.filter = feather > 0.5 ? `blur(${feather.toFixed(1)}px)` : 'none';
    mc.fillStyle = '#fff';
    const cx = effectNum(mask, 'cx', 0.5) * w;
    const cy = effectNum(mask, 'cy', 0.5) * h;
    const rw = effectNum(mask, 'w', 0.6) * w;
    const rh = effectNum(mask, 'h', 0.6) * h;
    const invert = mask.params.invert === true;
    if (invert) {
      mc.fillRect(-w, -h, w * 3, h * 3);
      mc.globalCompositeOperation = 'destination-out';
    }
    mc.beginPath();
    if (mask.params.shape === 'rect') mc.rect(cx - rw / 2, cy - rh / 2, rw, rh);
    else mc.ellipse(cx, cy, rw / 2, rh / 2, 0, 0, Math.PI * 2);
    mc.fill();
    mc.globalCompositeOperation = 'source-over';
    mc.filter = 'none';

    const sc = s.getContext('2d') as Ctx2D;
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.globalCompositeOperation = 'source-over';
    sc.clearRect(0, 0, w, h);
    sc.drawImage(source, 0, 0, w, h);
    sc.globalCompositeOperation = 'destination-in';
    sc.drawImage(m, 0, 0);
    sc.globalCompositeOperation = 'source-over';
    return s;
  }

  private drawText(ctx: Ctx2D, p: Project, layer: ResolvedLayer, k: number, dx: number, extraScale: number) {
    const { clip } = layer;
    const isSub = layer.asset?.kind === 'subtitle';
    const style = clip.text ?? DEFAULT_SUBTITLE_STYLE;
    let text = isSub ? subtitleTextAt(layer.asset, layer.sourceTime) : clip.text?.text ?? '';
    if (!text) return;
    text = plain(text);

    // Text animation (in/out presets).
    let alphaMul = 1;
    let ox = 0;
    let oy = 0;
    let sMul = 1;
    const anim = clip.effects.find((e) => e.enabled && e.type === 'text-animation');
    if (anim) {
      const dur = Math.max(0.05, effectNum(anim, 'duration', 0.5));
      const localS = layer.local / 705_600_000;
      const totalS = clip.duration / 705_600_000;
      const pin = Math.min(1, localS / dur);
      const pout = Math.min(1, Math.max(0, (totalS - localS) / dur));
      const easeOut = (x: number) => 1 - (1 - x) ** 3;
      switch (anim.params.in) {
        case 'fade':
          alphaMul *= pin;
          break;
        case 'slide-up':
          alphaMul *= pin;
          oy += (1 - easeOut(pin)) * 60;
          break;
        case 'slide-left':
          alphaMul *= pin;
          ox += (1 - easeOut(pin)) * 120;
          break;
        case 'pop':
          sMul *= 0.5 + 0.5 * easeOut(pin);
          alphaMul *= Math.min(1, pin * 2);
          break;
        case 'typewriter':
          text = text.slice(0, Math.ceil(text.length * pin));
          break;
      }
      switch (anim.params.out) {
        case 'fade':
          alphaMul *= pout;
          break;
        case 'slide-down':
          alphaMul *= pout;
          oy += (1 - easeOut(pout)) * 60;
          break;
        case 'slide-right':
          alphaMul *= pout;
          ox += (1 - easeOut(pout)) * 120;
          break;
        case 'pop':
          sMul *= 0.5 + 0.5 * easeOut(pout);
          alphaMul *= Math.min(1, pout * 2);
          break;
      }
    }
    if (alphaMul <= 0.001 || !text) return;

    const lines = text.split('\n');
    const size = style.fontSize * k;
    ctx.font = `${style.fontWeight} ${size}px ${style.fontFamily}`;
    if ('letterSpacing' in ctx) (ctx as { letterSpacing: string }).letterSpacing = `${style.letterSpacing * k}px`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = style.align;
    const lh = size * style.lineHeight;
    const widths = lines.map((l) => ctx.measureText(l).width);
    const maxW = Math.max(...widths, 1);
    const totalH = lh * lines.length;

    // Credits roll: the whole block travels at constant speed from just outside one edge to just
    // outside the other over the clip's duration (project units; k converts to canvas pixels).
    const roll = clip.effects.find((e) => e.enabled && e.type === 'credits-roll');
    if (roll && clip.duration > 0) {
      const prog = Math.min(1, Math.max(0, layer.local / clip.duration));
      const sc = layer.scale * extraScale;
      if (roll.params.direction === 'left') {
        const span = (maxW / k) * sc;
        ox += p.settings.width / 2 + span / 2 - prog * (p.settings.width + span);
      } else {
        const span = (totalH / k) * sc;
        oy += p.settings.height / 2 + span / 2 - prog * (p.settings.height + span);
      }
    }

    // Subtitles sit near the bottom by default.
    const baseY = isSub && !clip.text ? p.settings.height * 0.5 - p.settings.height * 0.08 - totalH / (2 * k) : 0;
    ctx.translate(this.canvas.width / 2 + (layer.x + ox) * k + dx, this.canvas.height / 2 + (layer.y + baseY + oy) * k);
    ctx.rotate((layer.rotation * Math.PI) / 180);
    const s = layer.scale * extraScale * sMul;
    ctx.scale(s, s);
    ctx.globalAlpha *= alphaMul;

    const anchorX = style.align === 'left' ? -maxW / 2 : style.align === 'right' ? maxW / 2 : 0;
    if (style.background) {
      const pad = size * 0.3;
      ctx.fillStyle = style.background;
      ctx.fillRect(-maxW / 2 - pad, -totalH / 2 - pad * 0.5, maxW + pad * 2, totalH + pad);
    }
    if (style.shadow) {
      ctx.shadowColor = style.shadow.color;
      ctx.shadowBlur = style.shadow.blur * k;
      ctx.shadowOffsetX = style.shadow.x * k;
      ctx.shadowOffsetY = style.shadow.y * k;
    }
    lines.forEach((line, i) => {
      const y = -totalH / 2 + lh * (i + 0.5);
      if (style.outline && style.outline.width > 0) {
        ctx.lineJoin = 'round';
        ctx.lineWidth = style.outline.width * 2 * k;
        ctx.strokeStyle = style.outline.color;
        ctx.strokeText(line, anchorX, y);
      }
      ctx.fillStyle = style.color;
      ctx.fillText(line, anchorX, y);
    });
  }
}
