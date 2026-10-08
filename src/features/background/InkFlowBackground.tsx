import { useEffect, useRef } from 'react';
import { publishGlassBackground, releaseGlassBackground } from '../glass/glass-environment';
import {
  chooseQualityTier,
  DEFAULT_QUALITY_TIER,
  INK_AUTONOMOUS_MOTION,
  INK_MACRO_DRIFT,
  INK_MACRO_DRIFT_SPEED,
  INK_PALETTES,
  INK_RENDER_SCALES,
  QUALITY_SAMPLE_SIZE,
  resolveInkMotionPolicy,
  type InkMacroDrift,
  type InkMotionPolicy,
  type InkPalette,
  type InkStep
} from './ink-flow-config';

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FLOW_FRAGMENT_SHADER = `#version 300 es
precision mediump float;

in vec2 v_uv;
uniform sampler2D u_previous;
uniform vec2 u_pointer;
uniform vec2 u_velocity;
uniform float u_decay;
uniform float u_inject;
out vec4 out_color;

void main() {
  vec4 previous = texture(u_previous, v_uv);
  previous.r *= u_decay;
  previous.gb = mix(vec2(0.5), previous.gb, 1.0 - u_decay);

  float distanceToPointer = distance(v_uv, u_pointer);
  float brush = exp(-(distanceToPointer * distanceToPointer) / 0.018) * u_inject;
  float speed = min(length(u_velocity) * 18.0, 1.0);
  float strength = brush * (0.42 + speed * 1.04);

  previous.r = max(previous.r, strength);
  previous.g = mix(previous.g, clamp(u_velocity.x * 4.6 + 0.5, 0.0, 1.0), brush * 0.3);
  previous.b = mix(previous.b, clamp(u_velocity.y * 4.6 + 0.5, 0.0, 1.0), brush * 0.3);
  previous.a = 1.0;
  out_color = previous;
}`;

const INK_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
uniform sampler2D u_flow;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_flow_strength;
uniform vec3 u_ink;
uniform vec3 u_accent;
uniform float u_ink_opacity;
uniform float u_accent_opacity;
uniform vec2 u_left_drift;
uniform vec2 u_upper_drift;
uniform vec2 u_right_drift;
out vec4 out_color;

float hash21(vec2 point) {
  point = fract(point * vec2(123.34, 345.45));
  point += dot(point, point + 34.345);
  return fract(point.x * point.y);
}

float valueNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);
  float a = hash21(cell);
  float b = hash21(cell + vec2(1.0, 0.0));
  float c = hash21(cell + vec2(0.0, 1.0));
  float d = hash21(cell + vec2(1.0));
  return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
}

void main() {
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  vec2 uv = v_uv;
  vec2 paper = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  vec4 flow = texture(u_flow, uv);
  vec2 flowDirection = (flow.gb - 0.5) * 2.0 * flow.r * u_flow_strength;

  float time = u_time * ${INK_AUTONOMOUS_MOTION.timeScale};
  vec2 field = paper * 2.15;
  float warpA = valueNoise(field * 0.72 + vec2(time, -time * 0.55));
  float warpB = valueNoise(field * 1.35 + vec2(-time * 0.42, time) + warpA * 1.7);
  field += vec2(warpA - 0.5, warpB - 0.5) * ${INK_AUTONOMOUS_MOTION.warpStrength} + flowDirection * 0.9;
  float inkNoise = valueNoise(field * 1.18 + warpB * 0.7);
  float detail = valueNoise(field * 2.55 - warpA * 0.9);
  float washField = inkNoise * 0.72 + detail * 0.28;
  float wash = smoothstep(0.28, 0.74, washField);
  float flowEdge = smoothstep(0.43, 0.5, washField) * (1.0 - smoothstep(0.5, 0.58, washField));

  float leftArtwork = exp(-length((uv - (vec2(0.17, 0.6) + u_left_drift)) * vec2(3.05, 1.75)));
  float upperAir = exp(-length((uv - (vec2(0.72, 0.12) + u_upper_drift)) * vec2(1.12, 2.55)));
  float rightAir = exp(-length((uv - (vec2(0.83, 0.52) + u_right_drift)) * vec2(2.0, 1.35)));
  float movingMass = clamp(leftArtwork * 0.74 + upperAir * 0.42 + rightAir * 0.5, 0.0, 1.0);
  float macroEdge = smoothstep(0.26, 0.48, movingMass) * (1.0 - smoothstep(0.62, 0.84, movingMass));
  float edgeAir = smoothstep(0.4, 0.75, length((uv - 0.5) * vec2(0.82, 1.0)));
  float compositionMask = clamp(
    leftArtwork * 1.18 + upperAir * 0.52 + rightAir * 0.46 + edgeAir * 0.34,
    0.0,
    1.0
  );
  float cell = 6.0;
  vec2 dotCell = fract(gl_FragCoord.xy / cell) - 0.5;
  float stipple = 1.0 - smoothstep(0.08, 0.2, length(dotCell));
  float stippleGate = step(0.78, hash21(floor(gl_FragCoord.xy / cell) + floor(u_time * 0.02)));
  float fiber = hash21(vec2(floor(gl_FragCoord.x * 0.42), floor(gl_FragCoord.y * 0.14)));

  float flowHalo = flow.r * u_flow_strength * smoothstep(0.02, 0.62, wash);
  float inkAlpha = wash * compositionMask * u_ink_opacity;
  inkAlpha += stipple * stippleGate * compositionMask * 0.021;
  inkAlpha += (fiber - 0.5) * compositionMask * 0.013;
  inkAlpha += flowHalo * 0.15;

  float accentShape = smoothstep(0.42, 0.82, warpA * 0.58 + warpB * 0.42);
  float accentAlpha = (leftArtwork * accentShape + rightAir * accentShape * 0.28) * u_accent_opacity;
  accentAlpha += flowHalo * 0.2;
  float colorDepth = accentAlpha * 5.2 + flowHalo * 0.62 + flowEdge * 0.48 + macroEdge * 0.86;
  vec3 color = mix(u_ink, u_accent, clamp(colorDepth, 0.0, 0.76));
  float alpha = clamp(inkAlpha + accentAlpha, 0.0, 0.2);
  out_color = vec4(color * alpha, alpha);
}`;

type FlowTarget = {
  framebuffer: WebGLFramebuffer;
  height: number;
  texture: WebGLTexture;
  width: number;
};

const TAU = Math.PI * 2;

function createShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, fragmentSource: string) {
  const vertex = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

class InkFlowRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private targetPalette: InkPalette;
  private motion: InkMotionPolicy;
  private flowProgram: WebGLProgram;
  private inkProgram: WebGLProgram;
  private buffer: WebGLBuffer;
  private vao: WebGLVertexArrayObject;
  private flowTargets: [FlowTarget, FlowTarget] | null = null;
  private flowIndex = 0;
  private frameId = 0;
  private startTime = performance.now();
  private previousFrameTime = 0;
  private lastPointerTime = 0;
  private visible = true;
  private running = false;
  private qualityTier = DEFAULT_QUALITY_TIER;
  private frameSamples: number[] = [];
  private palette: {
    accent: [number, number, number];
    accentOpacity: number;
    ink: [number, number, number];
    inkOpacity: number;
  };
  private pointer = { x: 0.5, y: 0.5, previousX: 0.5, previousY: 0.5, velocityX: 0, velocityY: 0 };
  private resizeObserver: ResizeObserver;
  private intersectionObserver: IntersectionObserver;

  constructor(canvas: HTMLCanvasElement, targetPalette: InkPalette, motion: InkMotionPolicy) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      premultipliedAlpha: true,
      powerPreference: 'low-power',
      preserveDrawingBuffer: false
    });
    if (!gl) throw new Error('WebGL2 unavailable');

    const flowProgram = createProgram(gl, FLOW_FRAGMENT_SHADER);
    const inkProgram = createProgram(gl, INK_FRAGMENT_SHADER);
    const buffer = gl.createBuffer();
    const vao = gl.createVertexArray();
    if (!flowProgram || !inkProgram || !buffer || !vao) throw new Error('Unable to create ink renderer');

    this.canvas = canvas;
    this.gl = gl;
    this.targetPalette = targetPalette;
    const initialPalette = targetPalette;
    this.palette = {
      accent: [...initialPalette.accent],
      accentOpacity: initialPalette.accentOpacity,
      ink: [...initialPalette.ink],
      inkOpacity: initialPalette.inkOpacity
    };
    this.motion = motion;
    this.flowProgram = flowProgram;
    this.inkProgram = inkProgram;
    this.buffer = buffer;
    this.vao = vao;

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    for (const program of [flowProgram, inkProgram]) {
      const position = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    }

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry?.isIntersecting ?? false;
      if (this.visible) this.resume();
      else this.pause();
    });
    this.intersectionObserver.observe(canvas);
    this.resize();
  }

  setPalette(targetPalette: InkPalette) {
    this.targetPalette = targetPalette;
    if (!this.motion.animate) {
      this.palette = {
        accent: [...targetPalette.accent],
        accentOpacity: targetPalette.accentOpacity,
        ink: [...targetPalette.ink],
        inkOpacity: targetPalette.inkOpacity
      };
      this.render(performance.now(), 1 / 120);
      return;
    }
    this.resume();
  }

  private createFlowTarget(width: number, height: number, initialData: Uint8Array) {
    const { gl } = this;
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) throw new Error('Unable to create flow target');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, initialData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return { framebuffer, height, texture, width };
  }

  private replaceFlowTargets(width: number, height: number) {
    const { gl } = this;
    if (this.flowTargets) {
      for (const target of this.flowTargets) {
        gl.deleteFramebuffer(target.framebuffer);
        gl.deleteTexture(target.texture);
      }
    }
    const data = new Uint8Array(width * height * 4);
    for (let index = 0; index < width * height; index += 1) {
      data[index * 4 + 1] = 128;
      data[index * 4 + 2] = 128;
      data[index * 4 + 3] = 255;
    }
    this.flowTargets = [
      this.createFlowTarget(width, height, data),
      this.createFlowTarget(width, height, data)
    ];
    this.flowIndex = 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const scale = INK_RENDER_SCALES[this.qualityTier];
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.25) * scale;
    const width = Math.max(1, Math.round(rect.width * pixelRatio));
    const height = Math.max(1, Math.round(rect.height * pixelRatio));
    if (this.canvas.width === width && this.canvas.height === height && this.flowTargets) return;
    this.canvas.width = width;
    this.canvas.height = height;

    const flowScale = Math.min(1, 320 / Math.max(width, height));
    this.replaceFlowTargets(
      Math.max(32, Math.round(width * flowScale)),
      Math.max(32, Math.round(height * flowScale))
    );
    this.render(performance.now(), 1 / 120);
  }

  setPointer(clientX: number, clientY: number) {
    if (!this.motion.pointerReactive) return;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = (clientX - rect.left) / rect.width;
    const y = 1 - (clientY - rect.top) / rect.height;
    this.pointer.velocityX = x - this.pointer.x;
    this.pointer.velocityY = y - this.pointer.y;
    this.pointer.previousX = this.pointer.x;
    this.pointer.previousY = this.pointer.y;
    this.pointer.x = Math.min(1, Math.max(0, x));
    this.pointer.y = Math.min(1, Math.max(0, y));
    this.lastPointerTime = performance.now();
    this.resume();
  }

  private renderFlow(now: number, deltaSeconds: number) {
    if (!this.flowTargets || now - this.lastPointerTime > 2400) return;
    const { gl } = this;
    const source = this.flowTargets[this.flowIndex];
    const target = this.flowTargets[1 - this.flowIndex];
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    gl.useProgram(this.flowProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source.texture);
    gl.uniform1i(gl.getUniformLocation(this.flowProgram, 'u_previous'), 0);
    gl.uniform2f(gl.getUniformLocation(this.flowProgram, 'u_pointer'), this.pointer.x, this.pointer.y);
    gl.uniform2f(
      gl.getUniformLocation(this.flowProgram, 'u_velocity'),
      this.pointer.velocityX,
      this.pointer.velocityY
    );
    gl.uniform1f(gl.getUniformLocation(this.flowProgram, 'u_decay'), Math.pow(0.958, deltaSeconds * 60));
    gl.uniform1f(gl.getUniformLocation(this.flowProgram, 'u_inject'), now - this.lastPointerTime < 90 ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.flowIndex = 1 - this.flowIndex;
    this.pointer.velocityX *= 0.82;
    this.pointer.velocityY *= 0.82;
  }

  private setMacroDrift(uniformName: string, drift: InkMacroDrift, elapsedSeconds: number) {
    const phase = elapsedSeconds * TAU * INK_MACRO_DRIFT_SPEED;
    this.gl.uniform2f(
      this.gl.getUniformLocation(this.inkProgram, uniformName),
      Math.sin(phase / drift.xPeriodSeconds + drift.xPhase) * drift.xAmplitude,
      Math.cos(phase / drift.yPeriodSeconds + drift.yPhase) * drift.yAmplitude
    );
  }

  private render(now: number, deltaSeconds: number) {
    const { gl } = this;
    this.renderFlow(now, deltaSeconds);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.inkProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.flowTargets?.[this.flowIndex].texture ?? null);
    const elapsedSeconds = this.motion.animate ? (now - this.startTime) / 1000 : 0;
    gl.uniform1i(gl.getUniformLocation(this.inkProgram, 'u_flow'), 0);
    gl.uniform2f(gl.getUniformLocation(this.inkProgram, 'u_resolution'), this.canvas.width, this.canvas.height);
    gl.uniform1f(gl.getUniformLocation(this.inkProgram, 'u_time'), elapsedSeconds);
    this.setMacroDrift('u_left_drift', INK_MACRO_DRIFT.left, elapsedSeconds);
    this.setMacroDrift('u_upper_drift', INK_MACRO_DRIFT.upper, elapsedSeconds);
    this.setMacroDrift('u_right_drift', INK_MACRO_DRIFT.right, elapsedSeconds);
    gl.uniform1f(
      gl.getUniformLocation(this.inkProgram, 'u_flow_strength'),
      Math.max(0, 1 - Math.max(0, now - this.lastPointerTime - 550) / 1850)
    );
    const target = this.targetPalette;
    const blend = 1 - Math.exp(-deltaSeconds * 6.2);
    for (let channel = 0; channel < 3; channel += 1) {
      this.palette.ink[channel] += (target.ink[channel] - this.palette.ink[channel]) * blend;
      this.palette.accent[channel] += (target.accent[channel] - this.palette.accent[channel]) * blend;
    }
    this.palette.inkOpacity += (target.inkOpacity - this.palette.inkOpacity) * blend;
    this.palette.accentOpacity += (target.accentOpacity - this.palette.accentOpacity) * blend;
    gl.uniform3f(gl.getUniformLocation(this.inkProgram, 'u_ink'), ...this.palette.ink);
    gl.uniform3f(gl.getUniformLocation(this.inkProgram, 'u_accent'), ...this.palette.accent);
    gl.uniform1f(gl.getUniformLocation(this.inkProgram, 'u_ink_opacity'), this.palette.inkOpacity);
    gl.uniform1f(gl.getUniformLocation(this.inkProgram, 'u_accent_opacity'), this.palette.accentOpacity);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    publishGlassBackground(this.canvas, this.targetPalette.backgroundHex, now);
  }

  private sampleQuality(frameMs: number) {
    if (!this.motion.animate || frameMs <= 0 || frameMs > 80) return;
    this.frameSamples.push(frameMs);
    if (this.frameSamples.length < QUALITY_SAMPLE_SIZE) return;
    const average = this.frameSamples.reduce((sum, sample) => sum + sample, 0) / this.frameSamples.length;
    const fastest = Math.min(...this.frameSamples);
    this.frameSamples = [];
    const nextTier = chooseQualityTier(this.qualityTier, average, fastest);
    if (nextTier !== this.qualityTier) {
      this.qualityTier = nextTier;
      this.resize();
    }
  }

  private frame = (now: number) => {
    if (!this.running) return;
    const frameMs = this.previousFrameTime ? now - this.previousFrameTime : 0;
    const deltaSeconds = Math.min(frameMs / 1000 || 1 / 120, 0.05);
    this.previousFrameTime = now;
    this.sampleQuality(frameMs);
    this.render(now, deltaSeconds);
    if (!this.motion.animate) {
      this.running = false;
      return;
    }
    this.frameId = window.requestAnimationFrame(this.frame);
  };

  resume() {
    if (!this.visible || this.running || document.hidden) return;
    this.running = true;
    this.previousFrameTime = 0;
    this.frameId = window.requestAnimationFrame(this.frame);
  }

  pause() {
    this.running = false;
    this.previousFrameTime = 0;
    if (this.frameId) window.cancelAnimationFrame(this.frameId);
    this.frameId = 0;
  }

  destroy() {
    this.pause();
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    const { gl } = this;
    if (this.flowTargets) {
      for (const target of this.flowTargets) {
        gl.deleteFramebuffer(target.framebuffer);
        gl.deleteTexture(target.texture);
      }
    }
    gl.deleteBuffer(this.buffer);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.flowProgram);
    gl.deleteProgram(this.inkProgram);
  }
}

export function InkFlowBackground({
  step,
  palette: paletteOverride
}: {
  step: InkStep;
  palette?: InkPalette;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<InkFlowRenderer | null>(null);
  const palette = paletteOverride ?? INK_PALETTES[step];
  const paletteRef = useRef(palette);
  paletteRef.current = palette;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const coarsePointerQuery = window.matchMedia('(hover: none), (pointer: coarse)');
    const start = () => {
      const motion = resolveInkMotionPolicy({ coarsePointer: coarsePointerQuery.matches, reducedMotion: reducedMotionQuery.matches });
      rendererRef.current?.destroy();
      try {
        rendererRef.current = new InkFlowRenderer(canvas, paletteRef.current, motion);
        rendererRef.current.resume();
      } catch {
        rendererRef.current = null;
      }
    };
    const handlePointer = (event: PointerEvent) => rendererRef.current?.setPointer(event.clientX, event.clientY);
    const handleVisibility = () => {
      if (document.hidden) rendererRef.current?.pause();
      else rendererRef.current?.resume();
    };
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      rendererRef.current?.pause();
      releaseGlassBackground();
    };
    const handleContextRestored = () => start();

    start();
    window.addEventListener('pointermove', handlePointer, { passive: true });
    reducedMotionQuery.addEventListener('change', start);
    coarsePointerQuery.addEventListener('change', start);
    document.addEventListener('visibilitychange', handleVisibility);
    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    return () => {
      window.removeEventListener('pointermove', handlePointer);
      reducedMotionQuery.removeEventListener('change', start);
      coarsePointerQuery.removeEventListener('change', start);
      document.removeEventListener('visibilitychange', handleVisibility);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      rendererRef.current?.destroy();
      rendererRef.current = null;
      releaseGlassBackground();
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.setPalette(palette);
  }, [palette]);

  return (
    <div className="cursor-layer ink-flow-layer" aria-hidden="true">
      <canvas ref={canvasRef} className="cursor-layer__canvas ink-flow-layer__canvas" />
    </div>
  );
}
