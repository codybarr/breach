import * as THREE from 'three';

export const CrtShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uGlitch: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uGlitch;
    uniform vec2 uRes;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

    void main() {
      vec2 uv = vUv;

      // Glitch: horizontal tearing bands.
      float band = floor(uv.y * 38.0 + floor(uTime * 24.0) * 7.0);
      float h = hash(vec2(band, floor(uTime * 30.0)));
      float tear = step(0.86 - uGlitch * 0.4, h) * uGlitch;
      uv.x += (hash(vec2(band, 3.1)) - 0.5) * 0.08 * tear;

      // Chromatic aberration, stronger toward the edges and during glitches.
      vec2 dir = (uv - 0.5);
      float ab = 0.0012 + uGlitch * 0.012;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir * ab + vec2(tear * 0.01, 0.0)).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir * ab).b;

      // Scanlines + aperture grille.
      float lines = 0.86 + 0.14 * sin(uv.y * uRes.y * 1.5708);
      float grille = 0.95 + 0.05 * sin(uv.x * uRes.x * 2.0944);
      col *= lines * grille;

      // Rolling refresh bar, flicker, grain.
      float roll = smoothstep(0.0, 0.02, abs(fract(uv.y * 0.5 - uTime * 0.07) - 0.5));
      col *= 0.96 + 0.04 * roll;
      col *= 0.985 + 0.015 * sin(uTime * 113.0);
      col += (hash(uv * uRes + uTime) - 0.5) * 0.035;

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
