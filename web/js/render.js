// Drawing helpers shared by the Path Finder and the Disaster Sim.
//   Physical view: FireRed-style tiles when zoomed in, a 1-pixel-per-cell overview when zoomed out.
//   Logical view : the cost grid (light = cheap, dark = expensive, black = blocked).
(function (SN) {
  'use strict';
  const TILE_MIN = 9;   // device pixels per cell from which the tile art is used

  function drawBase(ctx, v, world, mode, now) {
    ctx.fillStyle = '#0e1a14';
    ctx.fillRect(0, 0, v.cw, v.ch);
    ctx.imageSmoothingEnabled = false;
    if (mode === 'physical' && v.s >= TILE_MIN) {
      const frame = Math.floor(now / 380) % 3;
      for (let y = v.y0; y <= v.y1; y++) {
        const sy = Math.floor(v.oy + y * v.s), sh = Math.floor(v.oy + (y + 1) * v.s) - sy;
        for (let x = v.x0; x <= v.x1; x++) {
          const sx = Math.floor(v.ox + x * v.s), sw = Math.floor(v.ox + (x + 1) * v.s) - sx;
          ctx.drawImage(SN.sprites.tileFor(world.map, y * v.W + x, frame), sx, sy, sw, sh);
        }
      }
    } else {
      const img = mode === 'physical' ? world.phys.canvas : world.logic.canvas;
      ctx.imageSmoothingEnabled = v.s < 1;
      ctx.drawImage(img, v.ox, v.oy, v.W * v.s, v.H * v.s);
      ctx.imageSmoothingEnabled = false;
    }
  }

  function cellCenter(v, cell) {
    return [v.ox + (cell % v.W + 0.5) * v.s, v.oy + (((cell / v.W) | 0) + 0.5) * v.s];
  }

  function drawPath(ctx, v, path, color) {
    if (path.length < 2) return;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const trace = () => {
      ctx.beginPath();
      path.forEach((c, k) => { const [x, y] = cellCenter(v, c); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    };
    const w = Math.max(2.5, Math.min(8, v.s * 0.4));
    ctx.strokeStyle = 'rgba(16,20,28,0.85)'; ctx.lineWidth = w + 3; trace(); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = w; trace(); ctx.stroke();
  }

  // A round flag with a letter on a cell.
  function drawFlag(ctx, v, cell, color, text) {
    const [x, y] = cellCenter(v, cell), r = Math.max(8, v.s * 0.6);
    ctx.fillStyle = color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(r * 1.05)}px "Pixelify Sans", monospace`;
    ctx.fillText(text, x, y + 1);
  }

  // Pulsing ring around the last expanded cell.
  function drawHead(ctx, v, cell, now) {
    if (cell < 0) return;
    const [x, y] = cellCenter(v, cell), r = Math.max(5, v.s * 0.8) + Math.sin(now / 120) * 1.5;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#e04838'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  }

  // Size a canvas to its CSS box at the device pixel ratio. Returns false if it has no size yet.
  function fitCanvas(canvas) {
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (w < 2 || h < 2) return false;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    return true;
  }

  // Canvas pixel position of a mouse event, as a map cell index (or -1 outside the map).
  function cellAt(canvas, v, ev) {
    const r = canvas.getBoundingClientRect(), dpr = canvas.width / r.width;
    const px = (ev.clientX - r.left) * dpr, py = (ev.clientY - r.top) * dpr;
    const x = Math.floor((px - v.ox) / v.s), y = Math.floor((py - v.oy) / v.s);
    return x < 0 || y < 0 || x >= v.W || y >= v.H ? -1 : y * v.W + x;
  }

  SN.render = { drawBase, drawPath, drawFlag, drawHead, cellCenter, fitCanvas, cellAt, TILE_MIN };
})(globalThis.SN = globalThis.SN || {});
