"use client";

import { useEffect, useRef } from "react";

/**
 * Full-screen "liquid chrome" background: an original WebGL shader.
 *
 * A domain-warped noise field is treated as a height map. Normals come from finite differences,
 * the surface reflects a banded studio environment mapped onto a shadow → silver → highlight ramp,
 * and a specular highlight follows the cursor. Moving the mouse presses a soft dent into the metal
 * that relaxes back over time.
 */

export interface ChromeParams {
  speed: number;
  scale: number;
  warp: number;
  contrast: number;
  specPower: number;
  specStrength: number;
  tintStrength: number;
  shadow: string;
  silver: string;
  highlight: string;
  tint: string;
}

export const DEFAULT_CHROME: ChromeParams = {
  speed: 0.3,
  scale: 2,
  warp: 1.5,
  contrast: 0.6,
  specPower: 12,
  specStrength: 0.3,
  tintStrength: 0.15,
  shadow: "#05030D",
  silver: "#333340",
  highlight: "#808099",
  tint: "#263366",
};

const VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform float uPress;
uniform float uSpeed, uScale, uWarp, uContrast, uSpecPower, uSpecStrength, uTintStrength;
uniform vec3 uShadow, uSilver, uHighlight, uTint;

vec2 grad(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = dot(grad(i), f);
  float b = dot(grad(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(grad(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(grad(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  mat2 rot = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) {
    sum += amp * noise(p);
    p = rot * p;
    amp *= 0.5;
  }
  return sum;
}

float heightAt(vec2 p, float t, vec2 m) {
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - 0.7 * t));
  vec2 r = vec2(fbm(p + uWarp * q + vec2(1.7, 9.2) + 0.3 * t), fbm(p + uWarp * q + vec2(8.3, 2.8) - 0.2 * t));
  float h = fbm(p + uWarp * r);
  vec2 d = p - m;
  float dist2 = dot(d, d);
  // A soft dent plus a ring, so the metal looks pressed and rippling.
  h -= uPress * 0.28 * exp(-dist2 * 2.2);
  h += uPress * 0.06 * sin(sqrt(dist2) * 9.0 - uTime * 3.0) * exp(-dist2 * 1.1);
  return h;
}

void main() {
  vec2 aspect = vec2(uRes.x / uRes.y, 1.0);
  // 0.6 maps the editor-style "scale" onto broad, slow folds.
  vec2 p = (vUv - 0.5) * aspect * uScale * 0.6;
  vec2 m = (uMouse - 0.5) * aspect * uScale * 0.6;
  float t = uTime * uSpeed;

  float e = 0.012;
  float h = heightAt(p, t, m);
  float hx = heightAt(p + vec2(e, 0.0), t, m);
  float hy = heightAt(p + vec2(0.0, e), t, m);
  vec3 n = normalize(vec3((h - hx) / e * 0.55, (h - hy) / e * 0.55, 1.0));

  vec3 view = vec3(0.0, 0.0, 1.0);
  vec3 r = reflect(-view, n);

  // Banded studio environment, like soft boxes reflected in polished metal.
  float env = 0.5 + 0.5 * sin(r.y * 3.2 + r.x * 1.4 + h * 5.0);
  env = mix(env, env * env * (3.0 - 2.0 * env), uContrast);
  env = pow(env, mix(1.0, 2.2, uContrast));

  vec3 col = mix(uShadow, uSilver, smoothstep(0.0, 0.55, env));
  col = mix(col, uHighlight, smoothstep(0.55, 1.0, env));

  // Key light leans toward the cursor.
  vec3 light = normalize(vec3((uMouse - 0.5) * 1.6, 0.9));
  float spec = pow(max(dot(reflect(-light, n), view), 0.0), uSpecPower) * uSpecStrength;
  col += spec * mix(uHighlight, vec3(1.0), 0.35);

  // Cool tint in the grazing angles.
  float fresnel = pow(1.0 - clamp(n.z, 0.0, 1.0), 1.5);
  col = mix(col, col + uTint, uTintStrength + fresnel * 0.25);

  // Vignette back into the shadow color so text stays readable at the edges.
  vec2 v = vUv - 0.5;
  col = mix(col, uShadow, smoothstep(0.35, 0.95, length(v * vec2(1.1, 1.3))));

  gl_FragColor = vec4(col, 1.0);
}`;

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
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

export function LiquidChrome({ params = DEFAULT_CHROME }: { params?: ChromeParams }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "high-performance" });
    if (!gl) return; // CSS gradient fallback stays visible.

    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vs || !fs || !program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const u = (name: string) => gl.getUniformLocation(program, name);
    gl.uniform1f(u("uSpeed"), params.speed);
    gl.uniform1f(u("uScale"), params.scale);
    gl.uniform1f(u("uWarp"), params.warp);
    gl.uniform1f(u("uContrast"), params.contrast);
    gl.uniform1f(u("uSpecPower"), params.specPower);
    gl.uniform1f(u("uSpecStrength"), params.specStrength);
    gl.uniform1f(u("uTintStrength"), params.tintStrength);
    gl.uniform3fv(u("uShadow"), hexToRgb(params.shadow));
    gl.uniform3fv(u("uSilver"), hexToRgb(params.silver));
    gl.uniform3fv(u("uHighlight"), hexToRgb(params.highlight));
    gl.uniform3fv(u("uTint"), hexToRgb(params.tint));
    const uRes = u("uRes");
    const uTime = u("uTime");
    const uMouse = u("uMouse");
    const uPress = u("uPress");

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Render below native resolution: the surface is soft, and this keeps laptops cool.
    const quality = Math.min(window.devicePixelRatio || 1, 2) * 0.5;

    const resize = () => {
      canvas.width = Math.max(1, Math.floor(window.innerWidth * quality));
      canvas.height = Math.max(1, Math.floor(window.innerHeight * quality));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    const target = { x: 0.5, y: 0.5 };
    const mouse = { x: 0.5, y: 0.5 };
    let press = 0;
    let energy = 0;
    const onMove = (event: PointerEvent) => {
      const nx = event.clientX / window.innerWidth;
      const ny = 1 - event.clientY / window.innerHeight;
      energy = Math.min(1, energy + Math.hypot(nx - target.x, ny - target.y) * 6);
      target.x = nx;
      target.y = ny;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    let frame = 0;
    let running = true;
    const start = performance.now();
    const draw = (now: number) => {
      mouse.x += (target.x - mouse.x) * 0.06;
      mouse.y += (target.y - mouse.y) * 0.06;
      energy *= 0.96;
      press += (Math.max(0.35, energy) - press) * 0.08;
      gl.uniform1f(uTime, reduceMotion ? 12 : (now - start) / 1000);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.uniform1f(uPress, press);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (running && !reduceMotion) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    const onVisibility = () => {
      cancelAnimationFrame(frame);
      running = !document.hidden;
      if (running) frame = requestAnimationFrame(draw);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVisibility);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [params]);

  return <canvas ref={canvasRef} className="chrome-canvas" aria-hidden="true" />;
}
