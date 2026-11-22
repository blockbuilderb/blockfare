// ============================================================================
// PROCEDURAL SURFACE & CAMO TEXTURES (src/assets/textures.js)
// Edit this file to customize voxel surface textures, terrain grass, or camo.
// ============================================================================

import * as THREE from '../../vendor/three.module.js';

function makeCanvasTexture(width, height, drawFn, repeatX = 1, repeatY = 1) {
  if (typeof document === 'undefined') {
    const tex = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
    if (repeatX > 1 || repeatY > 1) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeatX, repeatY);
    }
    tex.needsUpdate = true;
    return tex;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  drawFn(ctx, width, height);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  if (repeatX > 1 || repeatY > 1) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
  }
  tex.needsUpdate = true;
  return tex;
}

export const TEXTURES = {
  brick: makeCanvasTexture(256, 256, (ctx, w, h) => {
    // Deep warm mortar base
    ctx.fillStyle = '#7d6c62';
    ctx.fillRect(0, 0, w, h);

    const rows = 6;
    const cols = 3;
    const bh = h / rows;
    const bw = w / cols;
    const shades = ['#a85646', '#b35d4c', '#9c4e3f', '#a35344', '#ae5949', '#974b3c'];
    const mortarGap = 4;

    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (bw * 0.5);
      for (let c = -1; c <= cols; c++) {
        const bx = c * bw + offset;
        const by = r * bh;
        const idx = Math.abs(r * 5 + c * 3) % shades.length;
        ctx.fillStyle = shades[idx];
        ctx.fillRect(bx + mortarGap * 0.5, by + mortarGap * 0.5, bw - mortarGap, bh - mortarGap);

        // Top highlight bevel on each brick
        ctx.fillStyle = 'rgba(255, 235, 220, 0.14)';
        ctx.fillRect(bx + mortarGap * 0.5, by + mortarGap * 0.5, bw - mortarGap, 3);

        // Bottom contact shadow under each brick
        ctx.fillStyle = 'rgba(35, 18, 12, 0.24)';
        ctx.fillRect(bx + mortarGap * 0.5, by + bh - mortarGap * 0.5 - 3, bw - mortarGap, 3);
      }
    }

    // Subtle architectural weathering gradient toward bottom of block
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.04)');
    grad.addColorStop(0.75, 'rgba(0, 0, 0, 0.0)');
    grad.addColorStop(1, 'rgba(25, 20, 18, 0.14)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }),

  concrete: makeCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#b6bec5';
    ctx.fillRect(0, 0, w, h);

    // Subtle poured-concrete aggregate speckles
    for (let y = 0; y < h; y += 8) {
      for (let x = 0; x < w; x += 8) {
        const hsh = (x * 37 + y * 73) & 15;
        if (hsh < 4) {
          ctx.fillStyle = hsh < 2 ? 'rgba(255,255,255,0.045)' : 'rgba(45,52,60,0.045)';
          ctx.fillRect(x, y, 8, 8);
        }
      }
    }

    // Precast architectural panel bevel & seam lines
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.fillRect(0, 0, w, 4);
    ctx.fillRect(0, 0, 4, h);
    ctx.fillStyle = 'rgba(55, 62, 70, 0.22)';
    ctx.fillRect(0, h - 4, w, 4);
    ctx.fillRect(w - 4, 0, 4, h);

    // Mid-panel horizontal joint
    ctx.fillStyle = 'rgba(65, 73, 82, 0.14)';
    ctx.fillRect(0, h / 2 - 1, w, 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(0, h / 2 + 1, w, 2);

    // Form-tie recesses with crisp rim highlight
    const tieCoords = [
      [36, 40],
      [w - 36, 40],
      [36, h - 40],
      [w - 36, h - 40]
    ];
    for (const [tx, ty] of tieCoords) {
      ctx.fillStyle = 'rgba(50, 58, 66, 0.34)';
      ctx.beginPath();
      ctx.arc(tx, ty, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.beginPath();
      ctx.arc(tx + 1, ty + 1, 3.5, 0, Math.PI);
      ctx.fill();
    }
  }),

  darkConcrete: makeCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#6c757d';
    ctx.fillRect(0, 0, w, h);

    for (let y = 0; y < h; y += 8) {
      for (let x = 0; x < w; x += 8) {
        const hsh = (x * 29 + y * 53) & 15;
        if (hsh < 4) {
          ctx.fillStyle = hsh < 2 ? 'rgba(255,255,255,0.04)' : 'rgba(20,25,30,0.06)';
          ctx.fillRect(x, y, 8, 8);
        }
      }
    }

    // Heavy bunker foundation bevels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.11)';
    ctx.fillRect(0, 0, w, 6);
    ctx.fillStyle = 'rgba(20, 24, 28, 0.28)';
    ctx.fillRect(0, h - 6, w, 6);
    ctx.fillRect(w - 4, 0, 4, h);
  }),

  sandbag: makeCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#a89262';
    ctx.fillRect(0, 0, w, h);
    const rows = 4;
    const rh = h / rows;

    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (w * 0.25);
      const bagW = w * 0.5;
      for (let b = -1; b <= 2; b++) {
        const bx = b * bagW + off;
        const by = r * rh;

        // Pillowy sandbag body
        ctx.fillStyle = (r + b) % 2 === 0 ? '#c2ad7c' : '#cab584';
        ctx.fillRect(bx + 3, by + 3, bagW - 6, rh - 6);

        // Top highlight & bottom crease for rounded 3D pillow feel
        ctx.fillStyle = 'rgba(255, 248, 225, 0.18)';
        ctx.fillRect(bx + 5, by + 4, bagW - 10, 6);
        ctx.fillStyle = 'rgba(60, 48, 30, 0.26)';
        ctx.fillRect(bx + 4, by + rh - 9, bagW - 8, 6);

        // HESCO / burlap seam stitching
        ctx.strokeStyle = 'rgba(75, 62, 40, 0.34)';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx + 3, by + 3, bagW - 6, rh - 6);
      }
    }
  }),

  wood: makeCanvasTexture(256, 256, (ctx, w, h) => {
    const planks = ['#9c6d42', '#91643b', '#a47448', '#8d6038'];
    const ph = h / 4;
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = planks[i];
      ctx.fillRect(0, i * ph, w, ph);

      // Subtle wood grain streaks
      ctx.fillStyle = 'rgba(65, 38, 15, 0.10)';
      for (let g = 0; g < 5; g++) {
        const gy = i * ph + ((g * 13 + i * 7) % (ph - 6)) + 3;
        ctx.fillRect(0, gy, w, 2);
      }

      // Plank top highlight & seam shadow
      ctx.fillStyle = 'rgba(255, 225, 190, 0.10)';
      ctx.fillRect(0, i * ph + 3, w, 3);
      ctx.fillStyle = 'rgba(35, 18, 6, 0.32)';
      ctx.fillRect(0, i * ph, w, 3);
    }
  }),

  container: makeCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#dce0e4';
    ctx.fillRect(0, 0, w, h);
    const ribW = 16;
    for (let x = 0; x < w; x += ribW) {
      const even = (x / ribW) % 2 === 0;
      ctx.fillStyle = even ? 'rgba(0, 0, 0, 0.14)' : 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(x, 0, ribW * 0.6, h);
      ctx.fillStyle = even ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
      ctx.fillRect(x + ribW * 0.6, 0, ribW * 0.4, h);
    }
    // Top and bottom container frame rails
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.fillRect(0, 0, w, 10);
    ctx.fillRect(0, h - 10, w, 10);
  }),

  grass: makeCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#567044';
    ctx.fillRect(0, 0, w, h);
    const tones = ['#516940', '#587246', '#4e663d', '#5c7649', '#536c42', '#5f794c'];
    const cell = 16;
    for (let y = 0; y < h; y += cell) {
      for (let x = 0; x < w; x += cell) {
        const idx = ((x * 19 + y * 37) >> 4) % tones.length;
        ctx.fillStyle = tones[idx];
        ctx.fillRect(x, y, cell, cell);
        // Subtle grass blade tuft accent
        if (((x * 7 + y * 13) & 3) === 0) {
          ctx.fillStyle = 'rgba(255, 255, 220, 0.04)';
          ctx.fillRect(x + 4, y + 2, 3, 10);
        }
      }
    }
  }, 36, 26),

  road: makeCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#32373d';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d5dbdb';
    ctx.fillRect(0, 8, w, 6);
    ctx.fillRect(0, h - 14, w, 6);
    ctx.fillStyle = '#f1c40f';
    ctx.fillRect(32, h / 2 - 4, 80, 8);
    ctx.fillRect(160, h / 2 - 4, 72, 8);
  }, 24, 1),

  camoUS: makeCanvasTexture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#3f5870';
    ctx.fillRect(0, 0, w, h);
    const cols = ['#2f4356', '#4f6b88', '#5d687a'];
    for (let i = 0; i < 28; i++) {
      ctx.fillStyle = cols[i % cols.length];
      ctx.fillRect((i * 19) % w, (i * 29) % h, 12, 9);
    }
  }),

  camoRU: makeCanvasTexture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#5e493a';
    ctx.fillRect(0, 0, w, h);
    const cols = ['#46352a', '#705543', '#4d583b'];
    for (let i = 0; i < 28; i++) {
      ctx.fillStyle = cols[i % cols.length];
      ctx.fillRect((i * 23) % w, (i * 31) % h, 12, 9);
    }
  })
};
