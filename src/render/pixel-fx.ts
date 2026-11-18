/**
 * WebGL2 per-layer pixel effects: temperature/tint, levels, 3D LUT, chroma key, vignette, grain.
 * One fragment shader applies the enabled effects in a fixed order. Works on OffscreenCanvas in
 * workers and on the main thread. If WebGL2 is unavailable, `PixelFx.create()` returns null and the
 * compositor reports the effects as skipped rather than pretending they were applied.
 */
import type { EffectInstance } from '@/project/schema/types';
import { effectNum } from './effects';

const VERT = `#version 300 es
in vec2 p;
out vec2 uv;
void main() { uv = vec2((p.x + 1.0) * 0.5, 1.0 - (p.y + 1.0) * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 uv;
out vec4 o;
uniform sampler2D src;
uniform sampler3D lut;
uniform bool useBal, useCurves, useLut, useKey, useVig, useGrain;
uniform vec2 bal;
uniform vec3 curves;
uniform float lutMix, lutSize;
uniform vec3 keyColor;
uniform vec3 keyParams;
uniform vec2 vig;
uniform float grain, seed;
uniform vec2 res;

vec2 cbcr(vec3 c) {
  return vec2(-0.168736 * c.r - 0.331264 * c.g + 0.5 * c.b, 0.5 * c.r - 0.418688 * c.g - 0.081312 * c.b);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + seed) * 43758.5453); }

void main() {
  vec4 s = texture(src, uv);
  float a = s.a;
  vec3 c = a > 0.0 ? s.rgb / a : vec3(0.0);
  if (useBal) {
    c.r *= 1.0 + 0.2 * bal.x;
    c.b *= 1.0 - 0.2 * bal.x;
    c.g *= 1.0 - 0.15 * bal.y;
  }
  if (useCurves) {
    c = curves.x + c * (1.0 + curves.z - curves.x);
    c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / curves.y));
  }
  if (useLut) {
    vec3 q = clamp(c, 0.0, 1.0) * ((lutSize - 1.0) / lutSize) + 0.5 / lutSize;
    c = mix(c, texture(lut, q).rgb, lutMix);
  }
  if (useKey) {
    float d = distance(cbcr(c), cbcr(keyColor));
    float k = smoothstep(keyParams.x, keyParams.x + keyParams.y, d);
    a *= k;
    float luma = dot(c, vec3(0.299, 0.587, 0.114));
    float spill = (1.0 - smoothstep(keyParams.x, keyParams.x + keyParams.y + 0.15, d)) * keyParams.z;
    c = mix(c, vec3(luma), spill);
  }
  if (useVig) {
    vec2 d2 = (uv - 0.5) * vec2(res.x / res.y, 1.0);
    float r = length(d2) / length(vec2(res.x / res.y, 1.0) * 0.5);
    c *= mix(1.0, 1.0 - smoothstep(1.0 - vig.y, 1.0, r), vig.x);
  }
  if (useGrain) {
    c += (hash(uv * res) - 0.5) * grain * 0.25;
  }
  c = clamp(c, 0.0, 1.0);
  o = vec4(c * a, a);
}`;

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const v = m ? parseInt(m[1]!, 16) : 0x00ff00;
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

/** Decode a LUT stored in effect params: `size` and base64 RGB bytes in `data`. */
export function decodeLutParams(e: EffectInstance): { size: number; data: Uint8Array } | null {
  const size = effectNum(e, 'size', 0);
  const b64 = e.params.data;
  if (!size || typeof b64 !== 'string' || !b64) return null;
  const bin = atob(b64);
  if (bin.length !== size * size * size * 3) return null;
  const data = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
  return { size, data };
}

export class PixelFx {
  private readonly canvas: OffscreenCanvas;
  private readonly gl: WebGL2RenderingContext;
  private readonly prog: WebGLProgram;
  private readonly tex: WebGLTexture;
  private readonly lutTex: WebGLTexture;
  private lutKey = '';
  private readonly loc = new Map<string, WebGLUniformLocation | null>();

  static create(): PixelFx | null {
    try {
      if (typeof OffscreenCanvas === 'undefined') return null;
      const canvas = new OffscreenCanvas(2, 2);
      const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: true });
      if (!gl) return null;
      return new PixelFx(canvas, gl);
    } catch {
      return null;
    }
  }

  private constructor(canvas: OffscreenCanvas, gl: WebGL2RenderingContext) {
    this.canvas = canvas;
    this.gl = gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
    this.prog = prog;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const pLoc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(pLoc);
    gl.vertexAttribPointer(pLoc, 2, gl.FLOAT, false, 0, 0);

    this.tex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    for (const [k, v] of [
      [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
      [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
      [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
    ] as const)
      gl.texParameteri(gl.TEXTURE_2D, k, v);
    this.lutTex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.lutTex);
    for (const [k, v] of [
      [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
      [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
      [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
      [gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE],
    ] as const)
      gl.texParameteri(gl.TEXTURE_3D, k, v);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB8, 1, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0]));
    gl.uniform1i(this.u('src'), 0);
    gl.uniform1i(this.u('lut'), 1);
  }

  private u(name: string): WebGLUniformLocation | null {
    if (!this.loc.has(name)) this.loc.set(name, this.gl.getUniformLocation(this.prog, name));
    return this.loc.get(name)!;
  }

  /** Apply the pixel effects of `effects` to `source` (w×h). Returns the canvas holding the result. */
  apply(source: TexImageSource, w: number, h: number, effects: readonly EffectInstance[], frameIndex: number): OffscreenCanvas {
    const gl = this.gl;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    const on = (type: string) => effects.find((e) => e.enabled && e.type === type);
    const bal = on('color-balance');
    const cur = on('curves');
    const lut = on('lut');
    const key = on('chroma-key');
    const vig = on('vignette');
    const grn = on('grain');
    gl.uniform1i(this.u('useBal'), bal ? 1 : 0);
    if (bal) gl.uniform2f(this.u('bal'), effectNum(bal, 'temperature', 0), effectNum(bal, 'tint', 0));
    gl.uniform1i(this.u('useCurves'), cur ? 1 : 0);
    if (cur) gl.uniform3f(this.u('curves'), effectNum(cur, 'shadows', 0), Math.max(0.05, effectNum(cur, 'midtones', 1)), effectNum(cur, 'highlights', 0));
    let lutOk = false;
    if (lut) {
      const key3 = `${lut.id}:${String(lut.params.data ?? '').length}:${String(lut.params.data ?? '').slice(0, 64)}`;
      if (key3 !== this.lutKey) {
        const decoded = decodeLutParams(lut);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_3D, this.lutTex);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        if (decoded) gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB8, decoded.size, decoded.size, decoded.size, 0, gl.RGB, gl.UNSIGNED_BYTE, decoded.data);
        this.lutKey = decoded ? key3 : '';
      }
      lutOk = this.lutKey !== '';
      gl.uniform1f(this.u('lutMix'), effectNum(lut, 'mix', 1));
      gl.uniform1f(this.u('lutSize'), effectNum(lut, 'size', 2));
    }
    gl.uniform1i(this.u('useLut'), lutOk ? 1 : 0);
    gl.uniform1i(this.u('useKey'), key ? 1 : 0);
    if (key) {
      const [r, g, b] = hexToRgb(String(key.params.color ?? '#00ff00'));
      gl.uniform3f(this.u('keyColor'), r, g, b);
      gl.uniform3f(this.u('keyParams'), effectNum(key, 'similarity', 0.3) * 0.5, effectNum(key, 'smoothness', 0.08) * 0.5, effectNum(key, 'spill', 0.5));
    }
    gl.uniform1i(this.u('useVig'), vig ? 1 : 0);
    if (vig) gl.uniform2f(this.u('vig'), effectNum(vig, 'amount', 0.5), effectNum(vig, 'softness', 0.5));
    gl.uniform1i(this.u('useGrain'), grn ? 1 : 0);
    if (grn) {
      gl.uniform1f(this.u('grain'), effectNum(grn, 'amount', 0.25));
      gl.uniform1f(this.u('seed'), (frameIndex % 997) * 0.137);
    }
    gl.uniform2f(this.u('res'), w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }
}

/** Parse an Adobe/Resolve .cube 3D LUT into 8-bit RGB (size ≤ 65). */
export function parseCubeLut(text: string): { size: number; data: Uint8Array; title: string } {
  let size = 0;
  let title = '';
  let domainMin = [0, 0, 0];
  let domainMax = [1, 1, 1];
  const values: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [kw, ...rest] = line.split(/\s+/);
    if (kw === 'TITLE') title = line.slice(5).trim().replace(/^"|"$/g, '');
    else if (kw === 'LUT_3D_SIZE') size = parseInt(rest[0] ?? '0', 10);
    else if (kw === 'LUT_1D_SIZE') throw new Error('1D LUTs are not supported. Use a 3D .cube LUT.');
    else if (kw === 'DOMAIN_MIN') domainMin = rest.map(Number);
    else if (kw === 'DOMAIN_MAX') domainMax = rest.map(Number);
    else if (/^[-+0-9.]/.test(kw!)) {
      const nums = line.split(/\s+/).map(Number);
      if (nums.length !== 3 || nums.some((x) => !Number.isFinite(x))) throw new Error(`Invalid LUT line: ${line.slice(0, 40)}`);
      values.push(...nums);
    }
  }
  if (!(size >= 2 && size <= 65)) throw new Error('Missing or unsupported LUT_3D_SIZE (2–65).');
  if (values.length !== size * size * size * 3) throw new Error(`Expected ${size ** 3} LUT entries, found ${values.length / 3}.`);
  const data = new Uint8Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const ch = i % 3;
    const v = (values[i]! - domainMin[ch]!) / (domainMax[ch]! - domainMin[ch]! || 1);
    data[i] = Math.round(Math.max(0, Math.min(1, v)) * 255);
  }
  // .cube order is red-fastest, which matches a 3D texture's x (s) axis = red.
  return { size, data, title };
}

export function bytesToBase64(data: Uint8Array): string {
  let s = '';
  for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(s);
}
