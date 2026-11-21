import * as THREE from '../vendor/three.module.js';

function makeCanvasTexture(width, height, drawFn, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  drawFn(ctx, width, height);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  if (repeatX > 1 || repeatY > 1) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
  }
  tex.needsUpdate = true;
  return tex;
}

export const TEXTURES = {
  // Clean BattleBit brick facade: seamless horizontal courses without dark cube outlines
  brick: makeCanvasTexture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#9c5243';
    ctx.fillRect(0, 0, w, h);
    const rows = 4;
    const cols = 2;
    const bh = h / rows;
    const bw = w / cols;
    const shades = ['#a85848', '#b05e4d', '#9e5141', '#a55646'];
    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (bw * 0.5);
      for (let c = -1; c <= cols; c++) {
        ctx.fillStyle = shades[(r * 3 + c + 4) % shades.length];
        ctx.fillRect(c * bw + offset, r * bh, bw - 1.5, bh - 1.5);
      }
      // Subtle horizontal mortar line
      ctx.fillStyle = 'rgba(215, 205, 195, 0.22)';
      ctx.fillRect(0, r * bh + bh - 1.5, w, 1.5);
    }
  }),

  // Clean BattleBit brutalist concrete panel: matte surface with subtle form-tie dots, no dark cube border
  concrete: makeCanvasTexture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#b4bcc2';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.fillRect(0, 0, w, h / 2);
    // Subtle horizontal architectural seam
    ctx.fillStyle = 'rgba(60, 68, 76, 0.14)';
    ctx.fillRect(0, h - 1, w, 1);
    // Architectural form-tie dots
    ctx.fillStyle = 'rgba(70, 78, 86, 0.26)';
    ctx.beginPath();
    ctx.arc(14, 16, 2, 0, Math.PI * 2);
    ctx.arc(w - 14, 16, 2, 0, Math.PI * 2);
    ctx.arc(14, h - 16, 2, 0, Math.PI * 2);
    ctx.arc(w - 14, h - 16, 2, 0, Math.PI * 2);
    ctx.fill();
  }),

  // Clean structural dark concrete / foundation trim
  darkConcrete: makeCanvasTexture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#6c757d';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.fillRect(0, 0, w, 6);
    ctx.fillStyle = 'rgba(25, 30, 35, 0.18)';
    ctx.fillRect(0, h - 2, w, 2);
  }),

  // BattleBit HESCO / tactical sandbag weave
  sandbag: makeCanvasTexture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#c2ad7c';
    ctx.fillRect(0, 0, w, h);
    const rows = 3;
    const rh = h / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * 16;
      ctx.fillStyle = r % 2 === 0 ? '#b8a270' : '#cab584';
      ctx.fillRect(0, r * rh + 1, w, rh - 2);
      ctx.strokeStyle = 'rgba(75, 65, 45, 0.28)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(off + 16, r * rh);
      ctx.lineTo(off + 16, (r + 1) * rh);
      ctx.moveTo(off + 48, r * rh);
      ctx.lineTo(off + 48, (r + 1) * rh);
      ctx.stroke();
    }
  }),

  // Clean low-poly timber / interior furniture & crate wood
  wood: makeCanvasTexture(64, 64, (ctx, w, h) => {
    const planks = ['#9c6d42', '#91643b', '#a47448', '#8d6038'];
    const ph = h / 4;
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = planks[i];
      ctx.fillRect(0, i * ph, w, ph);
      ctx.fillStyle = 'rgba(40, 22, 8, 0.22)';
      ctx.fillRect(0, i * ph, w, 1.5);
    }
  }),

  // Corrugated shipping container / industrial metal panel
  container: makeCanvasTexture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#dce0e4';
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) {
      ctx.fillStyle = (x / 8) % 2 === 0 ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.08)';
      ctx.fillRect(x, 0, 4, h);
    }
  }),

  // Clean low-poly BattleBit terrain grass (subtle geometric tonal variation)
  grass: makeCanvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#556e43';
    ctx.fillRect(0, 0, w, h);
    const tones = ['#516940', '#587246', '#4e663d', '#5c7649'];
    for (let y = 0; y < h; y += 16) {
      for (let x = 0; x < w; x += 16) {
        const idx = ((x * 19 + y * 37) >> 4) % tones.length;
        ctx.fillStyle = tones[idx];
        ctx.fillRect(x, y, 16, 16);
      }
    }
  }, 32, 24),

  road: makeCanvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#32373d';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d5dbdb';
    ctx.fillRect(0, 4, w, 3);
    ctx.fillRect(0, h - 7, w, 3);
    ctx.fillStyle = '#f1c40f';
    ctx.fillRect(16, h / 2 - 2, 40, 4);
    ctx.fillRect(80, h / 2 - 2, 36, 4);
  }, 24, 1),

  camoUS: makeCanvasTexture(32, 32, (ctx, w, h) => {
    ctx.fillStyle = '#3f5870';
    ctx.fillRect(0, 0, w, h);
    const cols = ['#2f4356', '#4f6b88', '#5d687a'];
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = cols[i % cols.length];
      ctx.fillRect((i * 13) % w, (i * 23) % h, 7, 5);
    }
  }),

  camoRU: makeCanvasTexture(32, 32, (ctx, w, h) => {
    ctx.fillStyle = '#5e493a';
    ctx.fillRect(0, 0, w, h);
    const cols = ['#46352a', '#705543', '#4d583b'];
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = cols[i % cols.length];
      ctx.fillRect((i * 17) % w, (i * 19) % h, 7, 5);
    }
  })
};
