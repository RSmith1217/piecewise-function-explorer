const colors = ['#e96933', '#168b83', '#7658c7'];
const defaults = [
  { expr: '', low: '-∞', high: '-2', lowInc: false, highInc: false },
  { expr: '', low: '-2', high: '2', lowInc: true, highInc: true },
  { expr: '', low: '2', high: '∞', lowInc: false, highInc: false }
];

let pieces = structuredClone(defaults);
let range = 10;
const rulesEl = document.querySelector('#rules');
const canvas = document.querySelector('#graph');
const ctx = canvas.getContext('2d');
const message = document.querySelector('#message');

function conditionHTML(p, i) {
  const lowInfinite = p.low.includes('∞');
  const highInfinite = p.high.includes('∞');
  return `
    <div class="condition" aria-label="Interval for piece ${i + 1}">
      <input class="bound low" aria-label="Lower endpoint" value="${p.low}" ${lowInfinite ? 'disabled' : ''}>
      <button class="ineq low-op" type="button" aria-label="Toggle lower endpoint inclusion">${p.lowInc ? '≤' : '<'}</button>
      <span>x</span>
      <button class="ineq high-op" type="button" aria-label="Toggle upper endpoint inclusion">${p.highInc ? '≤' : '<'}</button>
      <input class="bound high" aria-label="Upper endpoint" value="${p.high}" ${highInfinite ? 'disabled' : ''}>
    </div>`;
}

function renderEditor() {
  rulesEl.innerHTML = pieces.map((p, i) => `
    <div class="rule" data-index="${i}" style="--color:${colors[i]}">
      <div class="expression-wrap">
        <input class="expression" aria-label="Rule ${i + 1}" value="${p.expr}" placeholder="rule ${i + 1}, e.g. x + 2" autocomplete="off" spellcheck="false">
      </div>
      ${conditionHTML(p, i)}
    </div>`).join('');

  rulesEl.querySelectorAll('.rule').forEach(rule => {
    const i = Number(rule.dataset.index);
    rule.querySelector('.expression').addEventListener('input', e => { pieces[i].expr = e.target.value; draw(); });
    rule.querySelector('.low').addEventListener('input', e => { pieces[i].low = e.target.value; draw(); });
    rule.querySelector('.high').addEventListener('input', e => { pieces[i].high = e.target.value; draw(); });
    rule.querySelector('.low-op').addEventListener('click', e => {
      pieces[i].lowInc = !pieces[i].lowInc;
      e.currentTarget.textContent = pieces[i].lowInc ? '≤' : '<'; draw();
    });
    rule.querySelector('.high-op').addEventListener('click', e => {
      pieces[i].highInc = !pieces[i].highInc;
      e.currentTarget.textContent = pieces[i].highInc ? '≤' : '<'; draw();
    });
  });
}

function compile(raw) {
  if (!raw.trim()) return null;
  let s = raw.toLowerCase().replaceAll('−', '-').replaceAll('^', '**').replaceAll('π', 'pi');
  s = s.replace(/(\d|x|\))(?=x|\()/g, '$1*');
  const allowed = /^[0-9x+\-*/().,\s_a-z]+$/;
  if (!allowed.test(s)) throw new Error('Use x, numbers, and standard operations.');
  const names = { sqrt:'Math.sqrt', abs:'Math.abs', sin:'Math.sin', cos:'Math.cos', tan:'Math.tan', log:'Math.log10', ln:'Math.log', exp:'Math.exp', pi:'Math.PI' };
  for (const [name, replacement] of Object.entries(names)) s = s.replace(new RegExp(`\\b${name}\\b`, 'g'), replacement);
  if (/[a-z_]/i.test(s.replaceAll('Math', '').replaceAll('sqrt','').replaceAll('abs','').replaceAll('sin','').replaceAll('cos','').replaceAll('tan','').replaceAll('log10','').replaceAll('log','').replaceAll('exp','').replaceAll('PI','').replaceAll('x',''))) throw new Error('That function name is not supported yet.');
  return new Function('x', `"use strict"; return (${s});`);
}

function numericBound(value, fallback) {
  if (value.includes('∞')) return fallback;
  const n = Number(value.replace('−', '-'));
  return Number.isFinite(n) ? n : NaN;
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return rect;
}

function draw() {
  const { width: w, height: h } = resizeCanvas();
  ctx.clearRect(0, 0, w, h);
  const sx = x => w / 2 + x * (w / (2 * range));
  const sy = y => h / 2 - y * (h / (2 * range));
  const step = range <= 6 ? 1 : range <= 12 ? 2 : 5;

  ctx.lineWidth = 1;
  ctx.font = '10px DM Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let v = -range; v <= range; v += step) {
    ctx.beginPath(); ctx.strokeStyle = v === 0 ? '#78817d' : '#e8e6df';
    ctx.moveTo(sx(v), 0); ctx.lineTo(sx(v), h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, sy(v)); ctx.lineTo(w, sy(v)); ctx.stroke();
    if (v !== 0) { ctx.fillStyle = '#8a908d'; ctx.fillText(v, sx(v), sy(0) + 7); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(v, sx(0) - 7, sy(v)); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; }
  }
  ctx.fillStyle = '#4d5652'; ctx.font = 'italic 13px Georgia'; ctx.fillText('x', w - 12, sy(0) + 7); ctx.textAlign = 'left'; ctx.fillText('y', sx(0) + 8, 8);

  let graphed = 0;
  let error = '';
  pieces.forEach((p, i) => {
    let fn;
    try { fn = compile(p.expr); } catch (e) { error ||= `Piece ${i + 1}: ${e.message}`; return; }
    if (!fn) return;
    let low = numericBound(p.low, -range), high = numericBound(p.high, range);
    if (!Number.isFinite(low) || !Number.isFinite(high)) { error ||= `Piece ${i + 1}: enter numeric endpoints.`; return; }
    if (low >= high) { error ||= `Piece ${i + 1}: the lower endpoint must be smaller.`; return; }
    graphed++;
    const left = Math.max(-range, low), right = Math.min(range, high);
    if (left >= right) return;

    // Colored interval band and its vertical boundaries.
    ctx.fillStyle = colors[i] + '12'; ctx.fillRect(sx(left), 0, sx(right) - sx(left), h);
    [[low, p.lowInc], [high, p.highInc]].forEach(([x, inc]) => {
      if (x < -range || x > range) return;
      ctx.save(); ctx.strokeStyle = colors[i] + '88'; ctx.lineWidth = 1.5; ctx.setLineDash(inc ? [] : [6, 5]);
      ctx.beginPath(); ctx.moveTo(sx(x), 0); ctx.lineTo(sx(x), h); ctx.stroke(); ctx.restore();
    });

    ctx.save(); ctx.strokeStyle = colors[i]; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); let drawing = false;
    for (let px = sx(left); px <= sx(right); px += 1) {
      const x = (px - w / 2) / (w / (2 * range));
      let y; try { y = fn(x); } catch { y = NaN; }
      const py = sy(y);
      if (!Number.isFinite(y) || py < -h * 2 || py > h * 3) { drawing = false; continue; }
      if (!drawing) { ctx.moveTo(px, py); drawing = true; } else ctx.lineTo(px, py);
    }
    ctx.stroke(); ctx.restore();

    function endpoint(x, included) {
      if (x < -range || x > range) return;
      let y; try { y = fn(x); } catch { return; }
      if (!Number.isFinite(y) || y < -range || y > range) return;
      ctx.beginPath(); ctx.arc(sx(x), sy(y), 5.5, 0, Math.PI * 2);
      ctx.fillStyle = included ? colors[i] : '#fff'; ctx.fill();
      ctx.strokeStyle = colors[i]; ctx.lineWidth = 2.5; ctx.stroke();
    }
    if (!p.low.includes('∞')) endpoint(low, p.lowInc);
    if (!p.high.includes('∞')) endpoint(high, p.highInc);
  });
  message.textContent = error;
  document.querySelector('#emptyState').classList.toggle('hidden', graphed > 0);
  document.querySelector('#windowLabel').textContent = `−${range} to ${range}`;
}

document.querySelector('#exampleButton').addEventListener('click', () => {
  pieces = [
    { expr: '-x - 1', low: '-∞', high: '-2', lowInc: false, highInc: false },
    { expr: 'x^2 - 2', low: '-2', high: '2', lowInc: true, highInc: true },
    { expr: '0.5x + 1', low: '2', high: '∞', lowInc: false, highInc: false }
  ]; renderEditor(); draw();
});
document.querySelector('#resetButton').addEventListener('click', () => { pieces = structuredClone(defaults); range = 10; renderEditor(); draw(); });
document.querySelector('#zoomIn').addEventListener('click', () => { range = Math.max(5, range - 5); draw(); });
document.querySelector('#zoomOut').addEventListener('click', () => { range = Math.min(30, range + 5); draw(); });
new ResizeObserver(draw).observe(document.querySelector('.canvas-wrap'));
renderEditor();
draw();
