(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const bench = $('#bench');
  const pipette10 = $('#pipette10'), pipette1 = $('#pipette1'), bottle = $('#bottle');
  const rack = $('#tube-rack'), incubator = $('#incubator'), incubator44 = $('#incubator44'), bglbRack = $('#bglb-rack'), ecbRack = $('#ecb-rack');
  const ose = $('#ose'), bunsen = $('#bunsen'), alcohol = $('#alcohol');
  const actionSlot = $('#actionSlot'), PER_GROUP = 5;
  const state = { stage: 1, inoculated: new Set(), positives: new Set(), selectedPositives: new Set(), sourceTube: null, sourcePair: null, bglbTube: null, ecbTube: null, bglbTubes: new Set(), ecbTubes: new Set(), usedLTBForBGLB: new Set(), alcoholSprayed: false, oseSterile: false, oseLoaded: false, ltbInIncubator: false, bglbInIncubator: false, ecbInIncubator: false, timer: null, mpnValue: '' };
  const steps = [
    ['Pengambilan sampel', 'Ambil sampel dengan pipet ukur 10 mL', 'Tarik pipet 10 mL secara tegak lurus. Lepaskan di area mulut botol yang berpendar.'],
    ['Inokulasi LTB', 'Inokulasi 15 tabung LTB', 'Isi kelompok 10 mL dengan pipet 10 mL, lalu kelompok 1 mL dan 0,1 mL dengan pipet 1 mL. Setiap kelompok berisi 5 tabung Durham.'],
    ['Inkubasi', 'Masukkan rak LTB ke inkubator', 'Tarik rak tabung LTB ke pintu inkubator yang berpendar.'],
    ['Hasil LTB', 'Amati hasil LTB', 'Perhatikan kekeruhan dan gas yang tampak pada tabung Durham.'],
    ['Pilih tabung positif', 'Pilih tabung yang menghasilkan gas', 'Klik semua tabung yang memiliki gas pada tabung Durham.'],
    ['Uji penegasan BGLB & ECB', 'Transfer LB positif ke BGLB dan ECB', 'Semprot alkohol 70%, pijarkan ose pada Bunsen, pilih tabung LTB positif bertutup, masukkan ke BGLB, lalu langsung ke ECB dengan ose yang sama.'],
    ['Inkubasi penegasan', 'Inkubasi BGLB dan ECB', 'Setelah masing-masing rak ditempatkan pada inkubatornya, inkubasi BGLB pada 37°C dan ECB pada 44°C secara bersamaan.'],
    ['Pola positif', 'Baca pola tabung', 'Pola positif dihitung otomatis dari 15 tabung LTB.'],
    ['Tabel Thomas / APM', 'Penentuan nilai APM/MPN', 'Masukkan nilai rujukan sesuai tabel/metode SOP yang digunakan, kemudian periksa jawaban.'],
    ['Kesimpulan', 'Pemeriksaan selesai', 'Hasil simulasi untuk sampel air sumur bor ASB-01.']
  ];
  const volumes = ['10 mL', '1 mL', '0,1 mL'].flatMap(volume => Array(PER_GROUP).fill(volume));
  const tubeGrid = $('#tubeGrid');
  volumes.forEach((volume, i) => {
    const tube = document.createElement('button');
    tube.type = 'button'; tube.className = 'test-tube'; tube.id = `tube-${i}`; tube.dataset.index = i; tube.dataset.volume = volume; tube.dataset.group = Math.floor(i / PER_GROUP);
    tube.setAttribute('aria-label', `Tabung LTB ${volume} nomor ${(i % PER_GROUP) + 1} dengan tabung Durham`);
    tube.innerHTML = `<span class="volume-label">${i % PER_GROUP === 0 ? volume : ''}</span><span class="tube-cap"></span><span class="liquid"></span><span class="durham-tube"><b></b></span><span class="tube-num">${(i % PER_GROUP) + 1}</span>`;
    tube.addEventListener('click', () => chooseLTB(i)); tubeGrid.append(tube);
  });
  function makeConfirmTubes(grid, medium) {
    for (let i = 0; i < 6; i++) {
      const tube = document.createElement('button'); tube.type = 'button'; tube.className = `confirm-tube ${medium}-tube`; tube.dataset.medium = medium; tube.dataset.index = i;
      tube.setAttribute('aria-label', `Tabung ${medium.toUpperCase()} nomor ${i + 1}`);
      tube.innerHTML = `<span class="tube-cap"></span><span class="liquid"></span><span class="durham-tube"><b></b></span><span>${i + 1}</span>`;
      tube.addEventListener('click', () => chooseConfirm(tube)); grid.append(tube);
    }
  }
  makeConfirmTubes($('#bglbGrid'), 'bglb'); makeConfirmTubes($('#ecbGrid'), 'ecb');

  function setStatus(message, kind = '') { $('#statusText').textContent = message; $('#statusText').className = kind; }
  function setAction(label, handler) { actionSlot.innerHTML = ''; if (!label) return; const btn = document.createElement('button'); btn.className = 'action-btn'; btn.textContent = label; btn.addEventListener('click', handler); actionSlot.append(btn); }
  function clearRequired() { $$('.required').forEach(el => el.classList.remove('required')); }
  function requireObjects(...items) { clearRequired(); items.filter(Boolean).forEach(item => item.classList.add('required')); }
  function counts() { return [0, 1, 2].map(group => [...state.positives].filter(i => Math.floor(i / PER_GROUP) === group).length); }
  function pattern() { return counts().join('–'); }
  function renderProcedure() { $('#procedureList').innerHTML = steps.map((s, i) => `<li class="${i + 1 === state.stage ? 'active' : i + 1 < state.stage ? 'done' : ''}">${s[0]}</li>`).join(''); }
  function resultsMarkup(extra = '') { const c = counts(); return `<table class="result-table"><tr><th>Volume</th><th>Positif</th><th>Total</th></tr><tr><td>10 mL</td><td>${c[0]}</td><td>5</td></tr><tr><td>1 mL</td><td>${c[1]}</td><td>5</td></tr><tr><td>0,1 mL</td><td>${c[2]}</td><td>5</td></tr></table><p class="positive-note">Pola APM/MPN = ${pattern()}</p>${extra}`; }
  function updateResults() {
    let content = '<p>Belum ada hasil. Ikuti prosedur satu per satu.</p>';
    if (state.stage === 2) content = `<p>Inokulasi selesai: <b>${state.inoculated.size}/15</b> tabung LTB.</p>`;
    if ([4, 5].includes(state.stage)) content = resultsMarkup('<p>Gas pada tabung Durham → presumtif positif.</p>');
    if (state.stage === 6) content = resultsMarkup(`<p>Transfer LB positif ke BGLB dan ECB: <b>${state.bglbTubes.size}/6</b> BGLB, <b>${state.ecbTubes.size}/6</b> ECB.</p>`);
    if (state.stage === 8) content = resultsMarkup('<p>Hasil aktual simulasi, dihitung dari 15 tabung LTB.</p>');
    $('#resultContent').innerHTML = content;
  }
  function setStage(stage) {
    state.stage = stage; const current = steps[stage - 1]; $('#stageNumber').textContent = stage; $('#progressFill').style.width = `${stage * 10}%`;
    setLabMode(stage <= 5 ? 'ltb' : 'confirm');
    $('#instructionKicker').textContent = `LANGKAH ${stage} — ${current[0].toUpperCase()}`; $('#instructionTitle').textContent = current[1]; $('#instructionText').textContent = current[2];
    setAction('', null); clearRequired(); renderProcedure(); updateResults();
    if (stage === 1) { state.alcoholSprayed = false; alcohol.classList.remove('sprayed'); requireObjects(alcohol, pipette10, bottle); setStatus('Semprot alkohol 70% pada awal pengerjaan LTB, lalu ambil sampel dengan pipet 10 mL.'); }
    if (stage === 2) { highlightNextLTB(); setStatus('Inokulasikan kelompok 10 mL terlebih dahulu.'); }
    if (stage === 3) { requireObjects(rack, incubator); setStatus('Tarik rak LTB menuju inkubator 37°C, lalu klik tombol mulai inkubasi.'); }
    if (stage === 4) { setStatus('Inkubasi selesai. Amati gas pada Durham.', 'positive-note'); setAction('Lanjut pilih tabung positif', () => setStage(5)); }
    if (stage === 5) { requireObjects(...$$('.test-tube.positive')); setStatus('Klik 6 tabung yang menunjukkan gas Durham (pola 4–2–0).'); }
    if (stage === 6) { state.alcoholSprayed = false; alcohol.classList.remove('sprayed'); requireObjects(alcohol, bunsen, ose, bglbRack, ecbRack, ...$$('.test-tube.positive')); setStatus('Semprot alkohol 70%, pijarkan ose, lalu pindahkan satu inokulum LB positif ke BGLB dan langsung ke ECB tanpa membakar ose ulang.'); }
    if (stage === 8) { setStatus(`Pola positif aktual: ${pattern()}.`, 'positive-note'); setAction('Ke penentuan APM/MPN', () => setStage(9)); }
    if (stage === 9) renderMPNForm(); if (stage === 10) renderConclusion();
  }
  function highlightNextLTB() { const first = volumes.findIndex((_, i) => !state.inoculated.has(i)); if (first < 0) return; const group = Math.floor(first / PER_GROUP); requireObjects(group === 0 ? pipette10 : pipette1, ...$$(`.test-tube[data-group="${group}"]`).filter(t => !state.inoculated.has(+t.dataset.index))); }
  function animateLiquid(el) { el.classList.add('liquid-flash'); setTimeout(() => el.classList.remove('liquid-flash'), 650); }
  function allowedPipetteForLTB(tube) { return +tube.dataset.group === 0 ? pipette10 : pipette1; }
  function handleDrop(object, target) {
    if (state.stage === 1 && object === pipette10) { if (!state.alcoholSprayed) { setStatus('✕ Semprot alkohol 70% terlebih dahulu sebagai awal pengerjaan LTB.', 'alert'); return; } if (target === bottle) { pipette10.classList.add('filled'); animateLiquid(pipette10); setStatus('✓ Sampel berhasil diambil.', 'positive-note'); setTimeout(() => setStage(2), 550); } else setStatus('✕ Lepaskan pipet di area mulut botol yang berpendar.', 'alert'); return; }
    if (state.stage === 2 && [pipette10, pipette1].includes(object)) {
      const tube = target?.closest?.('.test-tube'); if (!tube) { setStatus('✕ Lepaskan pipet dekat salah satu tabung LTB yang berpendar.', 'alert'); return; }
      if (allowedPipetteForLTB(tube) !== object) { setStatus(`✕ Gunakan pipet ${+tube.dataset.group === 0 ? '10 mL' : '1 mL'} untuk kelompok ini.`, 'alert'); return; }
      const i = +tube.dataset.index; if (state.inoculated.has(i)) { setStatus('Tabung ini sudah diinokulasi.', 'alert'); return; }
      state.inoculated.add(i); tube.classList.add('inoculated'); animateLiquid(tube); setStatus(`✓ Tabung ${tube.dataset.volume} nomor ${(i % PER_GROUP) + 1} selesai diinokulasi.`, 'positive-note'); updateResults();
      if (state.inoculated.size === volumes.length) setTimeout(() => setStage(3), 450); else highlightNextLTB(); return;
    }
    if (state.stage === 3 && object === rack) { if (target === incubator) { state.ltbInIncubator = true; setStatus('✓ Rak LB masuk ke inkubator 37°C. Klik mulai untuk inkubasi.', 'positive-note'); setAction('Mulai inkubasi LB • 2 × 24 jam', startMainIncubation); } else setStatus('✕ Lepaskan rak di area pintu inkubator yang berpendar.', 'alert'); return; }
    if ([1, 6, 7].includes(state.stage) && object === alcohol) { sprayAlcohol(); return; }
    if (state.stage === 6 && object === bglbRack) { if (state.bglbTubes.size < 6 || state.ecbTubes.size < 6) { setStatus(`✕ Selesaikan transfer berpasangan ke BGLB dan ECB terlebih dahulu (${state.bglbTubes.size}/6; ${state.ecbTubes.size}/6).`, 'alert'); return; } if (target === incubator) { state.bglbInIncubator = true; setStatus('✓ Rak BGLB masuk ke inkubator 37°C. Masukkan juga rak ECB ke inkubator 44°C.', 'positive-note'); readyConfirmationIncubation(); } else setStatus('✕ Masukkan rak BGLB ke inkubator 37°C.', 'alert'); return; }
    if (state.stage === 6 && object === ose) {
      if (target === bunsen) { if (!state.alcoholSprayed) { setStatus('✕ Semprotkan alkohol 70% terlebih dahulu.', 'alert'); return; } state.oseSterile = true; state.oseLoaded = false; ose.classList.remove('loaded'); ose.classList.add('glowing'); setStatus('✓ Ose dipijarkan sampai merah. Ambil inokulum dari LTB positif.', 'positive-note'); return; }
      const ltb = target?.closest?.('.test-tube');
      if (ltb) { const index = +ltb.dataset.index; if (!state.oseSterile) { setStatus('✕ Ose harus dipijarkan pada Bunsen terlebih dahulu.', 'alert'); return; } if (state.sourceTube !== index) { setStatus('✕ Angkat/pilih tabung LB positif yang sama terlebih dahulu.', 'alert'); return; } state.oseLoaded = true; state.oseSterile = false; ose.classList.remove('glowing'); ose.classList.add('loaded'); setStatus('✓ Inokulum bakteri berhasil diambil dengan ose. Masukkan ke BGLB.', 'positive-note'); return; }
      const tube = target?.closest?.('.bglb-tube');
      if (tube) { if (!state.oseLoaded) { setStatus('✕ Ambil inokulum LB positif dengan ose yang sudah dipijarkan.', 'alert'); return; } if (+tube.dataset.index !== state.sourcePair) { setStatus(`✕ Masukkan ke tabung BGLB ${state.sourcePair + 1} terlebih dahulu.`, 'alert'); return; } if (state.bglbTubes.has(tube)) { setStatus('Tabung BGLB ini sudah diinokulasi.', 'alert'); return; } state.bglbTube = tube; state.bglbTubes.add(tube); tube.classList.add('inoculated'); animateLiquid(tube); updateResults(); setStatus(`✓ Inokulum masuk ke BGLB ${state.sourcePair + 1}. Tanpa membakar ose ulang, langsung masukkan ose yang sama ke ECB ${state.sourcePair + 1}.`, 'positive-note'); requireObjects(ose, $$('.ecb-tube')[state.sourcePair]); return; }
      const ecb = target?.closest?.('.ecb-tube');
      if (ecb) { if (!state.oseLoaded || state.sourceTube === null) { setStatus('✕ Pindahkan inokulum ke BGLB terlebih dahulu, lalu langsung ke ECB dengan ose yang sama.', 'alert'); return; } if (+ecb.dataset.index !== state.sourcePair) { setStatus(`✕ Masukkan ke tabung ECB ${state.sourcePair + 1} agar pasangannya sesuai BGLB ${state.sourcePair + 1}.`, 'alert'); return; } if (state.ecbTubes.has(ecb)) { setStatus('Tabung ECB ini sudah diinokulasi.', 'alert'); return; } state.ecbTube = ecb; state.ecbTubes.add(ecb); state.usedLTBForBGLB.add(state.sourceTube); ecb.classList.add('inoculated'); animateLiquid(ecb); state.oseLoaded = false; ose.classList.remove('loaded'); state.sourceTube = null; state.sourcePair = null; updateResults(); if (state.ecbTubes.size === 6) { setStatus('✓ Enam pasangan BGLB dan ECB telah diinokulasi. Masukkan kedua rak ke inkubator masing-masing.', 'positive-note'); requireObjects(bglbRack, incubator, ecbRack, incubator44); } else { setStatus(`✓ Pasangan BGLB ${state.ecbTubes.size} → ECB ${state.ecbTubes.size} selesai. Pilih LB positif berikutnya, pijarkan ose, lalu ulangi.`, 'positive-note'); requireObjects(bunsen, ose, ...$$('.test-tube.positive').filter(t => !state.usedLTBForBGLB.has(+t.dataset.index))); } return; }
      setStatus('✕ Arahkan ose ke Bunsen, LTB positif, BGLB, lalu ECB.', 'alert'); return;
    }
    if (state.stage === 6 && object === ecbRack) { if (state.bglbTubes.size < 6 || state.ecbTubes.size < 6) { setStatus(`✕ Selesaikan transfer berpasangan ke BGLB dan ECB terlebih dahulu (${state.bglbTubes.size}/6; ${state.ecbTubes.size}/6).`, 'alert'); return; } if (target === incubator44) { state.ecbInIncubator = true; setStatus('✓ Rak ECB masuk ke inkubator 44°C. Masukkan juga rak BGLB ke inkubator 37°C.', 'positive-note'); readyConfirmationIncubation(); } else setStatus('✕ Masukkan rak ECB ke inkubator 44°C.', 'alert'); return; }
  }
  function chooseLTB(index) { const tube = $(`#tube-${index}`); if (state.stage === 5) { if (!state.positives.has(index)) { setStatus('✕ Tabung tersebut tidak menunjukkan gas Durham.', 'alert'); return; } state.selectedPositives.add(index); tube.classList.add('selected'); setStatus('✓ Tabung presumtif positif dipilih.', 'positive-note'); if (state.selectedPositives.size === state.positives.size) setTimeout(() => showPresentation(5), 400); } if (state.stage === 6 && state.positives.has(index)) { if (state.usedLTBForBGLB.has(index)) { setStatus('Tabung LB positif ini sudah dipindahkan ke pasangan BGLB dan ECB.', 'alert'); return; } if (state.sourceTube !== null) { setStatus(`✕ Selesaikan lebih dahulu pasangan BGLB ${state.sourcePair + 1} dan ECB ${state.sourcePair + 1}.`, 'alert'); return; } state.sourceTube = index; state.sourcePair = state.bglbTubes.size; $$('.test-tube').forEach(t => t.classList.remove('selected', 'lifted')); tube.classList.add('selected', 'lifted'); setStatus(`✓ Tabung LB positif dipilih untuk pasangan BGLB ${state.sourcePair + 1} → ECB ${state.sourcePair + 1}. Pijarkan ose lalu ambil inokulum.`, 'positive-note'); } }
  function chooseConfirm() { /* Tabung konfirmasi tetap berada di rak; inokulum dipindahkan dengan ose. */ }
  function countdown(seconds, done) { clearInterval(state.timer); let remaining = seconds; $('#timerText').textContent = `${remaining} detik`; state.timer = setInterval(() => { remaining--; $('#timerText').textContent = remaining > 0 ? `${remaining} detik` : 'selesai'; if (remaining <= 0) { clearInterval(state.timer); state.timer = null; done(); } }, 1000); }
  function startMainIncubation() { const temp = Number($('#temp37').value); if (!state.ltbInIncubator) { setStatus('✕ Masukkan rak LB ke inkubator terlebih dahulu.', 'alert'); return; } if (temp !== 37) { setStatus('✕ Atur inkubator LB pada 37°C sebelum inkubasi.', 'alert'); return; } setAction('', null); incubator.classList.add('open'); setStatus('Inkubasi LB 37°C: 2 × 24 jam.'); setTimeout(() => { incubator.classList.remove('open'); countdown(2, () => { [0, 1, 2, 3, 5, 6].forEach(i => { state.positives.add(i); $(`#tube-${i}`).classList.add('positive'); }); rack.classList.add('stored'); incubator.classList.add('has-rack'); setStage(4); }); }, 500); }
  function readyConfirmationIncubation() { if (!state.bglbInIncubator || !state.ecbInIncubator) return; setStatus('✓ BGLB berada pada inkubator 37°C dan ECB pada inkubator 44°C. Keduanya siap diinkubasi bersamaan.', 'positive-note'); setAction('Mulai inkubasi BGLB & ECB • 2 × 24 jam', incubateConfirmations); }
  function incubateConfirmations() { const temp37 = Number($('#temp37').value), temp44 = Number($('#temp44').value); if (!state.bglbInIncubator || !state.ecbInIncubator) { setStatus('✕ Masukkan kedua rak ke inkubator masing-masing.', 'alert'); return; } if (temp37 !== 37 || temp44 !== 44) { setStatus('✕ Atur inkubator BGLB pada 37°C dan inkubator ECB pada 44°C sebelum inkubasi.', 'alert'); return; } setAction('', null); setStatus('Inkubasi BGLB 37°C dan ECB 44°C: 2 × 24 jam.'); countdown(2, () => { state.bglbTubes.forEach(tube => tube.classList.add('negative')); state.ecbTubes.forEach(tube => tube.classList.add('negative')); setStatus('✓ Inkubasi selesai: BGLB dan ECB tidak menunjukkan gas.', 'positive-note'); setStage(8); showPresentation(7); }); }
  function renderMPNForm() { clearRequired(); state.mpnValue = '<2 MPN/100 mL'; $('#resultContent').innerHTML = `<table class="result-table thomas-table"><caption>TABEL THOMAS / APM</caption><tr><th>Pola tabung</th><th>Indeks MPN</th></tr><tr><td><b>0–0–0</b></td><td><b>&lt;2 MPN/100 mL</b></td></tr></table><p class="positive-note">Hasil tabel Thomas: pola 0–0–0 dengan indeks &lt;2 MPN/100 mL.</p><button id="useThomas" class="action-btn">Gunakan hasil Thomas</button>`; $('#useThomas').addEventListener('click', () => { setStatus('✓ Hasil Thomas digunakan: <2 MPN/100 mL.', 'positive-note'); setAction('Tampilkan kesimpulan', () => setStage(10)); }); }
  function renderConclusion() { clearRequired(); $('#resultContent').innerHTML = `<div class="result-pill">PEMERIKSAAN SELESAI</div><p><b>Kode sampel:</b> ASB-01<br><b>Jenis sampel:</b> Air Sumur Bor<br><b>Pola LB simulasi:</b> ${pattern()}<br><b>Tabel Thomas:</b> 0–0–0<br><b>Indeks MPN:</b> ${state.mpnValue || '&lt;2 MPN/100 mL'}</p><p>Berdasarkan hasil pemeriksaan <b>BGLB dan ECB yang menunjukkan pola 0–0–0</b>, serta hasil pembacaan pada <b>tabel MPN menunjukkan indeks MPN &lt;2/100 mL</b>, dapat disimpulkan bahwa <b>air sumur bor memiliki jumlah bakteri koliform yang sangat rendah, yaitu kurang dari 2 bakteri per 100 mL sampel</b>. Hal ini menunjukkan bahwa pada pemeriksaan tersebut <b>tidak terdeteksi adanya pertumbuhan koliform maupun E. coli pada tabung yang diuji</b>.</p>`; setStatus('PEMERIKSAAN SELESAI — hasil siap dicatat.', 'positive-note'); }
  function setLabMode(mode) { document.body.classList.toggle('module-ltb', mode === 'ltb'); document.body.classList.toggle('module-confirm', mode === 'confirm'); const title = $('.rack-title', rack); if (mode === 'confirm') { incubator.classList.add('has-rack'); title.textContent = 'LTB POSITIF • SUDAH DIINKUBASI'; if (!state.positives.size) [0, 1, 2, 3, 5, 6].forEach(i => { state.positives.add(i); $(`#tube-${i}`).classList.add('positive'); }); } else title.textContent = 'LTB + DURHAM'; }
  let dragging = null;
  function nearestTarget(x, y) {
    let candidates = []; if (state.stage === 1) candidates = [bottle]; if (state.stage === 2) candidates = $$('.test-tube'); if (state.stage === 3) candidates = [incubator]; if (state.stage === 6) candidates = [bunsen, incubator, incubator44, ...$$('.test-tube.positive'), ...$$('.bglb-tube'), ...$$('.ecb-tube')];
    return candidates.map(el => { const r = el.getBoundingClientRect(), pad = el.classList.contains('test-tube') || el.classList.contains('confirm-tube') ? 68 : 54, cx = Math.max(r.left, Math.min(x, r.right)), cy = Math.max(r.top, Math.min(y, r.bottom)); return { el, inside: x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad, distance: (x - cx) ** 2 + (y - cy) ** 2 }; }).filter(item => item.inside).sort((a, b) => a.distance - b.distance)[0]?.el || null;
  }
  bench.addEventListener('pointerdown', event => { if (event.target.closest('.test-tube, .confirm-tube, input, label')) return; const el = event.target.closest('[data-draggable]'); if (!el || !bench.contains(el) || event.button !== 0) return; const rect = el.getBoundingClientRect(), br = bench.getBoundingClientRect(); dragging = { el, dx: event.clientX - rect.left, dy: event.clientY - rect.top, br, x: event.clientX, y: event.clientY }; el.classList.add('dragging'); el.setPointerCapture(event.pointerId); event.preventDefault(); });
  bench.addEventListener('pointermove', event => { if (!dragging) return; const { el, dx, dy, br } = dragging, r = el.getBoundingClientRect(), x = Math.max(0, Math.min(event.clientX - br.left - dx, br.width - r.width)), y = Math.max(0, Math.min(event.clientY - br.top - dy, br.height - r.height)); el.style.setProperty('left', `${x}px`, 'important'); el.style.setProperty('top', `${y}px`, 'important'); el.style.setProperty('bottom', 'auto', 'important'); el.style.setProperty('right', 'auto', 'important'); $$('.drop-ready').forEach(target => target.classList.remove('drop-ready')); nearestTarget(event.clientX, event.clientY)?.classList.add('drop-ready'); dragging.x = event.clientX; dragging.y = event.clientY; });
  function endDrag(event) { if (!dragging) return; const { el } = dragging; const x = event.clientX, y = event.clientY; const target = nearestTarget(x, y); $$('.drop-ready').forEach(item => item.classList.remove('drop-ready')); el.classList.remove('dragging'); if (el.hasPointerCapture?.(event.pointerId)) el.releasePointerCapture(event.pointerId); dragging = null; handleDrop(el, target); }
  bench.addEventListener('pointerup', endDrag); bench.addEventListener('pointercancel', endDrag);
  function sprayAlcohol() { state.alcoholSprayed = true; alcohol.classList.add('sprayed'); if (state.stage === 1) { setStatus('✓ Alkohol 70% telah disemprotkan. Lanjutkan pengambilan sampel dengan pipet 10 mL.', 'positive-note'); requireObjects(pipette10, bottle); } else { setStatus('✓ Alkohol 70% telah disemprotkan. Pijarkan ose pada Bunsen hingga merah.', 'positive-note'); requireObjects(bunsen, ose); } }
  alcohol.addEventListener('click', () => { if ([1, 6, 7].includes(state.stage)) sprayAlcohol(); });
  $$('.focusable').forEach(button => button.addEventListener('click', () => { const object = $(`#${button.dataset.focus}`); if (!object) return; object.classList.add('required'); object.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); setTimeout(() => object.classList.remove('required'), 1800); }));
  $('#helpBtn').addEventListener('click', () => $('#helpDialog').showModal()); $('#closeHelp').addEventListener('click', () => $('#helpDialog').close()); $('#resetBtn').addEventListener('click', () => window.location.reload());
  const presentation = $('#presentation'); let activeSlide = 0;
  function showPresentation(index = activeSlide) { activeSlide = Math.max(0, Math.min(9, index)); $$('.slide', presentation).forEach(slide => slide.classList.toggle('active', +slide.dataset.slide === activeSlide)); $('#slideCount').textContent = `${activeSlide + 1} / 10`; $('#prevSlide').disabled = activeSlide === 0; $('#nextSlide').disabled = activeSlide === 9; presentation.classList.remove('hidden'); }
  function openLab(module) { presentation.classList.add('hidden'); if (module === 'ltb') setStage(1); if (module === 'confirm') setStage(6); if (module === 'results') setStage(8); }
  $('#prevSlide').addEventListener('click', () => showPresentation(activeSlide - 1)); $('#nextSlide').addEventListener('click', () => showPresentation(activeSlide + 1)); $('#closeSlides').addEventListener('click', () => presentation.classList.add('hidden'));
  $$('[data-open-lab]').forEach(button => button.addEventListener('click', () => openLab(button.dataset.openLab)));
  $('#videoUpload').addEventListener('change', event => { const file = event.target.files?.[0]; if (!file) return; const video = $('#sampleVideo'); video.src = URL.createObjectURL(file); video.hidden = false; video.play().catch(() => {}); });
  setStage(1);
  showPresentation(0);
})();
