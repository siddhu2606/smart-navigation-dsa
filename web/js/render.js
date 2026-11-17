// Drawing helpers shared by the Path Finder and the Disaster Sim.
//   Physical view: FireRed-style tiles when zoomed in, a 1-pixel-per-cell overview when zoomed out.
//   Logical view : the cost grid (light = cheap, dark = expensive, black = blocked), with the grid boxes,
//                  and when zoomed in the cost of every cell and the order in which a search expanded it.
(function (SN) {
  'use strict';
  const TILE_MIN = 9;      // device pixels per cell from which the tile art is used
  const LINES_MIN = 7;     // Logical view: grid lines from here
  const COST_MIN = 22;     // Logical view: the cost of each cell from here
  const ORDER_MIN = 30;    // Logical view: expansion order numbers from here
  const NUM_FONT = 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';

  // The mapping from cells to canvas pixels: s device pixels per cell, (ox, oy) = where cell (0,0) starts.
  function makeView(cw, ch, W, H, s, ox, oy) {
    return { s, ox, oy, cw, ch, W, H,
      x0: Math.max(0, Math.floor(-ox / s)), y0: Math.max(0, Math.floor(-oy / s)),
      x1: Math.min(W - 1, Math.ceil((cw - ox) / s)), y1: Math.min(H - 1, Math.ceil((ch - oy) / s)) };
  }

  function drawBase(ctx, v, world, mode, now) {
    if (world.map.real && mode === 'physical') {      // Leaflet draws the map; we only add fire and walls on top
      ctx.clearRect(0, 0, v.cw, v.ch);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(world.over.canvas, v.ox, v.oy, v.W * v.s, v.H * v.s);
      return;
    }
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

  // ---- Logical view details ------------------------------------------------------------------------------

  // The boxes of the grid.
  function drawGridLines(ctx, v) {
    ctx.strokeStyle = 'rgba(20, 30, 55, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const top = Math.max(0, v.oy + v.y0 * v.s), bottom = Math.min(v.ch, v.oy + (v.y1 + 1) * v.s);
    const left = Math.max(0, v.ox + v.x0 * v.s), right = Math.min(v.cw, v.ox + (v.x1 + 1) * v.s);
    for (let x = v.x0; x <= v.x1 + 1; x++) { const px = Math.round(v.ox + x * v.s) + 0.5; ctx.moveTo(px, top); ctx.lineTo(px, bottom); }
    for (let y = v.y0; y <= v.y1 + 1; y++) { const py = Math.round(v.oy + y * v.s) + 0.5; ctx.moveTo(left, py); ctx.lineTo(right, py); }
    ctx.stroke();
  }

  function outlined(ctx, text, x, y, size, fill, weight) {
    ctx.font = `${weight || 600} ${size}px ${NUM_FONT}`;
    ctx.lineWidth = Math.max(2, size / 5);
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }

  // Grid boxes, then (zoomed in) the step cost of every cell and, for a search, the number of the step
  // at which it was expanded. cost: Uint8Array. first[cell] = step of first expansion (or -1); cursor = steps so far.
  function drawCellDetail(ctx, v, cost, first, cursor) {
    if (v.s < LINES_MIN) return;
    drawGridLines(ctx, v);
    if (v.s < COST_MIN) return;
    const cs = Math.min(14, v.s * 0.27), os = Math.min(22, v.s * 0.4);
    for (let y = v.y0; y <= v.y1; y++) {
      for (let x = v.x0; x <= v.x1; x++) {
        const c = y * v.W + x, px = v.ox + x * v.s, py = v.oy + y * v.s;
        if (!cost[c]) continue;
        ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        outlined(ctx, String(cost[c]), px + v.s - 3, py + v.s - 2, cs, '#3b4d68', 500);
        if (first && v.s >= ORDER_MIN && first[c] >= 0 && first[c] < cursor) {
          const label = String(first[c] + 1);
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          outlined(ctx, label, px + v.s / 2, py + v.s * 0.42, Math.min(os, (v.s * 0.9) / Math.max(2, label.length * 0.62)), '#0d2748', 700);
        }
      }
    }
  }

  // ---- markers -----------------------------------------------------------------------------------------

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
    const [x, y] = cellCenter(v, cell), r = Math.max(10, v.s * 0.6);
    ctx.fillStyle = color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(r * 1.05)}px ${NUM_FONT}`;
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

  SN.render = { makeView, drawBase, drawCellDetail, drawPath, drawFlag, drawHead, cellCenter, fitCanvas, cellAt, TILE_MIN, NUM_FONT };
})(globalThis.SN = globalThis.SN || {});
