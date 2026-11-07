import * as THREE from 'three';

/** Full-screen procedural "digital rain" + grid behind everything. */
export class Background {
  mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 1 },
        uSize: { value: new THREE.Vector2(1600, 900) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vPos;
        uniform vec2 uSize;
        void main() { vPos = uv * uSize; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime, uIntensity;
        varying vec2 vPos;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

        // Pseudo-glyph: a 5x7 dot pattern seeded per cell, re-rolled over time.
        float glyph(vec2 cell, vec2 f, float seed) {
          vec2 g = floor(f * vec2(5.0, 7.0));
          if (f.x < 0.1 || f.x > 0.9 || f.y < 0.08 || f.y > 0.92) return 0.0;
          return step(0.52, hash(g + cell * 13.0 + seed));
        }

        void main() {
          vec2 cellSize = vec2(14.0, 20.0);
          vec2 cell = floor(vPos / cellSize);
          vec2 f = fract(vPos / cellSize);
          float col = cell.x;
          float speed = 3.0 + hash(vec2(col, 1.0)) * 9.0;
          float offset = hash(vec2(col, 7.0)) * 200.0;
          float head = mod(uTime * speed + offset, 90.0);
          float y = 90.0 - mod(cell.y, 90.0);
          float d = head - y;
          float trail = d >= 0.0 ? exp(-d * 0.16) : 0.0;
          float lit = step(0.35, hash(vec2(col, 3.0)));
          float g = glyph(cell, f, floor(uTime * (1.0 + hash(cell) * 3.0)));
          float b = g * trail * lit;
          vec3 c = vec3(0.1, 1.0, 0.45) * b * 0.32;
          c += vec3(0.75, 1.0, 0.85) * g * step(abs(d), 0.5) * lit * 0.45;

          // Faint perspective-free grid.
          vec2 gp = fract(vPos / 80.0);
          float grid = (step(gp.x, 0.012) + step(gp.y, 0.012)) * 0.035;
          c += vec3(0.0, 0.6, 0.5) * grid;

          gl_FragColor = vec4(c * uIntensity, 1.0);
        }
      `,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.mesh.position.z = -500;
    this.mesh.renderOrder = -1000;
  }

  resize(cam: THREE.OrthographicCamera) {
    const w = cam.right - cam.left, h = cam.top - cam.bottom;
    this.mesh.scale.set(w, h, 1);
    this.mesh.position.set((cam.left + cam.right) / 2, (cam.top + cam.bottom) / 2, -500);
    this.mat.uniforms.uSize.value.set(w, h);
  }

  setIntensity(v: number) {
    this.mat.uniforms.uIntensity.value = v;
  }

  update(t: number) {
    this.mat.uniforms.uTime.value = t;
  }
}
