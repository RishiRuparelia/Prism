(()=>{
// ===== STARS =====
const starsEl = document.getElementById('stars');
for (let i = 0; i < 160; i++) {
  const s = document.createElement('div');
  s.className = 'star';
  const size = Math.random() * 2.2 + 0.4;
  s.style.cssText = `width:${size}px;height:${size}px;left:${Math.random()*100}%;top:${Math.random()*65}%;--dur:${2+Math.random()*4}s;--delay:${Math.random()*5}s;--min-o:${0.1+Math.random()*0.4};`;
  starsEl.appendChild(s);
}

// ===== WORKERS =====
const workersEl = document.getElementById('workers');
const workerData = [
  { x: -60, ex: 80, y: 23, dur: 8 },
  { x: 360, ex: 240, y: 23, dur: 10 },
  { x: -30, ex: 120, y: 23, dur: 12 },
  { x: 380, ex: 180, y: 23, dur: 9 },
  { x: 20, ex: 150, y: 23, dur: 7 },
];
workerData.forEach((w, i) => {
  const el = document.createElement('div');
  el.className = 'worker';
  el.style.cssText = `left:0;bottom:${w.y}px;--walk-dur:${w.dur}s;--start-x:${w.x}px;--end-x:${w.ex}px;animation-delay:${-i*1.8}s;`;
  el.innerHTML = `<svg viewBox="0 0 14 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="10" width="6" height="8" rx="1" fill="#c8a840" opacity="0.9"/>
    <circle cx="7" cy="7" r="4" fill="#d4a85c"/>
    <rect x="3" y="4" width="8" height="3" rx="1" fill="#c9a84c" opacity="0.8"/>
    <rect x="3" y="4" width="2" height="7" rx="1" fill="#a07830" opacity="0.7"/>
    <rect x="4" y="17" width="3" height="7" rx="1" fill="#a07830"/>
    <rect x="7" y="19" width="3" height="5" rx="1" fill="#a07830"/>
    <rect x="1" y="10" width="3" height="2" rx="1" fill="#c8a840" opacity="0.8"/>
    <rect x="10" y="10" width="3" height="2" rx="1" fill="#c8a840" opacity="0.8"/>
    <rect x="0" y="5" width="14" height="5" rx="1" fill="#e8c870" opacity="0.85" stroke="#9a7820" stroke-width="0.5"/>
  </svg>`;
  workersEl.appendChild(el);
});

// ===== DUST =====
const dustEl = document.getElementById('dust-container');
for (let i = 0; i < 25; i++) {
  const d = document.createElement('div');
  d.className = 'dust';
  d.style.cssText = `position:absolute;left:calc(50% + ${(Math.random()-0.5)*300}px);bottom:${18+Math.random()*3}%;--d:${2+Math.random()*3}s;--delay:${Math.random()*4}s;--dx:${(Math.random()-0.5)*40}px;animation-iteration-count:infinite;`;
  dustEl.appendChild(d);
}


})();
