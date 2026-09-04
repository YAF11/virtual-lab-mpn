(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const bench = $('#bench');
  const pipette10 = $('#pipette10'), pipette1 = $('#pipette1'), bottle = $('#bottle');
  const rack = $('#tube-rack'), incubator = $('#incubator'), incubator44 = $('#incubator44'), bglbRack = $('#bglb-rack'), ecbRack = $('#ecb-rack');
  const ose = $('#ose'), bunsen = $('#bunsen'), alcohol = $('#alcohol');
  const actionSlot = $('#actionSlot'), PER_GROUP = 5;
  const state = { stage: 1, inoculated: new Set(), positives: new Set(), selectedPositives: new Set(), sourceTube: null, sourceBglb: null, bglbTube: null, ecbTube: null, alcoholSprayed: false, oseSterile: false, oseLoaded: false, bglbInIncubator: false, ecbInIncubator: false, timer: null, mpnValue: '' };
  const steps = [
    ['Pengambilan sampel', 'Ambil sampel dengan pipet ukur 10 mL', 'Tarik pipet 10 mL secara tegak lurus. Lepaskan di area mulut botol yang berpendar.'],
    ['Inokulasi LTB', 'Inokulasi 15 tabung LTB', 'Isi kelompok 10 mL dengan pipet 10 mL, lalu kelompok 1 mL dan 0,1 mL dengan pipet 1 mL. Setiap kelompok berisi 5 tabung Durham.'],
    ['Inkubasi', 'Masukkan rak LTB ke inkubator', 'Tarik rak tabung LTB ke pintu inkubator yang berpendar.'],
    ['Hasil LTB', 'Amati hasil LTB', 'Perhatikan kekeruhan dan gas yang tampak pada tabung Durham.'],
    ['Pilih tabung positif', 'Pilih tabung yang menghasilkan gas', 'Klik semua tabung yang memiliki gas pada tabung Durham.'],
    ['Uji penegasan BGLB', 'Transfer inokulum positif ke BGLB dengan ose', 'Semprot alkohol 70%, pijarkan ose pada Bunsen, pilih tabung LTB positif bertutup, ambil inokulum dengan ose, lalu masukkan ke BGLB.'],
    ['ECB (jika diperlukan)', 'Konfirmasi lanjutan dengan ECB', 'Pijarkan ose, ambil inokulum dari BGLB positif, lalu masukkan ke ECB. Setelah itu masukkan rak ECB ke inkubator 44°C.'],
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
    if (state.stage === 6) content = resultsMarkup(`<p>BGLB: ${state.bglbTube?.classList.contains('positive') ? '<b>positif (gas terbentuk)</b>' : 'menunggu transfer & inkubasi'}</p>`);
    if (state.stage === 7) content = resultsMarkup('<p>BGLB positif menunjukkan konfirmasi coliform. Konfirmasi <i>E. coli</i> memerlukan tahap/metode lanjutan sesuai SOP.</p>');
    if (state.stage === 8) content = resultsMarkup('<p>Hasil aktual simulasi, dihitung dari 15 tabung LTB.</p>');
    $('#resultContent').innerHTML = content;
  }
  function setStage(stage) {
    state.stage = stage; const current = steps[stage - 1]; $('#stageNumber').textContent = stage; $('#progressFill').style.width = `${stage * 10}%`;
    $('#instructionKicker').textContent = `LANGKAH ${stage} — ${current[0].toUpperCase()}`; $('#instructionTitle').textContent = current[1]; $('#instructionText').textContent = current[2];
    setAction('', null); clearRequired(); renderProcedure(); updateResults();
    if (stage === 1) { requireObjects(pipette10, bottle); setStatus('Siap mengambil sampel dengan pipet 10 mL.'); }
    if (stage === 2) { highlightNextLTB(); setStatus('Inokulasikan kelompok 10 mL terlebih dahulu.'); }
    if (stage === 3) { requireObjects(rack, incubator); setStatus('Tarik rak LTB menuju inkubator.'); }
    if (stage === 4) { setStatus('Inkubasi selesai. Amati gas pada Durham.', 'positive-note'); setAction('Lanjut pilih tabung positif', () => setStage(5)); }
    if (stage === 5) { requireObjects(...$$('.test-tube.positive')); setStatus('Klik 6 tabung yang menunjukkan gas Durham (pola 4–2–0).'); }
    if (stage === 6) { requireObjects(alcohol, bunsen, ose, bglbRack, ...$$('.test-tube.positive')); setStatus('Semprot alkohol 70%, pijarkan ose hingga merah, lalu pilih tabung LTB positif.'); }
    if (stage === 7) { state.oseSterile = false; state.oseLoaded = false; ose.classList.remove('glowing', 'loaded'); requireObjects(alcohol, bunsen, ose, ecbRack, incubator44, ...$$('.bglb-tube.positive')); setStatus('Semprot alkohol, pijarkan ose, ambil BGLB positif, lalu masukkan ke ECB.'); }
    if (stage === 8) { setStatus(`Pola positif aktual: ${pattern()}.`, 'positive-note'); setAction('Ke penentuan APM/MPN', () => setStage(9)); }
    if (stage === 9) renderMPNForm(); if (stage === 10) renderConclusion();
  }
  function highlightNextLTB() { const first = volumes.findIndex((_, i) => !state.inoculated.has(i)); if (first < 0) return; const group = Math.floor(first / PER_GROUP); requireObjects(group === 0 ? pipette10 : pipette1, ...$$(`.test-tube[data-group="${group}"]`).filter(t => !state.inoculated.has(+t.dataset.index))); }
  function animateLiquid(el) { el.classList.add('liquid-flash'); setTimeout(() => el.classList.remove('liquid-flash'), 650); }
  function allowedPipetteForLTB(tube) { return +tube.dataset.group === 0 ? pipette10 : pipette1; }
  function handleDrop(object, target) {
    if (state.stage === 1 && object === pipette10) { if (target === bottle) { pipette10.classList.add('filled'); animateLiquid(pipette10); setStatus('✓ Sampel berhasil diambil.', 'positive-note'); setTimeout(() => setStage(2), 550); } else setStatus('✕ Lepaskan pipet di area mulut botol yang berpendar.', 'alert'); return; }
    if (state.stage === 2 && [pipette10, pipette1].includes(object)) {
      const tube = target?.closest?.('.test-tube'); if (!tube) { setStatus('✕ Lepaskan pipet dekat salah satu tabung LTB yang berpendar.', 'alert'); return; }
      if (allowedPipetteForLTB(tube) !== object) { setStatus(`✕ Gunakan pipet ${+tube.dataset.group === 0 ? '10 mL' : '1 mL'} untuk kelompok ini.`, 'alert'); return; }
      const i = +tube.dataset.index; if (state.inoculated.has(i)) { setStatus('Tabung ini sudah diinokulasi.', 'alert'); return; }
      state.inoculated.add(i); tube.classList.add('inoculated'); animateLiquid(tube); setStatus(`✓ Tabung ${tube.dataset.volume} nomor ${(i % PER_GROUP) + 1} selesai diinokulasi.`, 'positive-note'); updateResults();
      if (state.inoculated.size === volumes.length) setTimeout(() => setStage(3), 450); else highlightNextLTB(); return;
    }
    if (state.stage === 3 && object === rack) { if (target === incubator) startMainIncubation(); else setStatus('✕ Lepaskan rak di area pintu inkubator yang berpendar.', 'alert'); return; }
    if ((state.stage === 6 || state.stage === 7) && object === alcohol) { state.alcoholSprayed = true; alcohol.classList.add('sprayed'); setStatus('✓ Alkohol 70% telah disemprotkan. Pijarkan ose pada Bunsen.', 'positive-note'); requireObjects(bunsen, ose); return; }
    if (state.stage === 6 && object === bglbRack) { if (!state.bglbTube) { setStatus('✕ Inokulasikan BGLB dengan ose terlebih dahulu.', 'alert'); return; } if (target === incubator) { state.bglbInIncubator = true; setStatus('✓ Rak BGLB masuk ke inkubator 37°C.', 'positive-note'); setAction('Mulai inkubasi BGLB (5 dtk)', incubateBGLB); } else setStatus('✕ Masukkan rak BGLB ke inkubator 37°C.', 'alert'); return; }
    if (state.stage === 6 && object === ose) {
      if (target === bunsen) { if (!state.alcoholSprayed) { setStatus('✕ Semprotkan alkohol 70% terlebih dahulu.', 'alert'); return; } state.oseSterile = true; state.oseLoaded = false; ose.classList.remove('loaded'); ose.classList.add('glowing'); setStatus('✓ Ose dipijarkan sampai merah. Ambil inokulum dari LTB positif.', 'positive-note'); return; }
      const ltb = target?.closest?.('.test-tube');
      if (ltb) { const index = +ltb.dataset.index; if (!state.oseSterile) { setStatus('✕ Ose harus dipijarkan pada Bunsen terlebih dahulu.', 'alert'); return; } if (state.sourceTube !== index) { setStatus('✕ Angkat/pilih tabung LTB positif yang sama terlebih dahulu.', 'alert'); return; } state.oseLoaded = true; state.oseSterile = false; ose.classList.remove('glowing'); ose.classList.add('loaded'); setStatus('✓ Inokulum bakteri berhasil diambil dengan ose. Masukkan ke BGLB.', 'positive-note'); return; }
      const tube = target?.closest?.('.bglb-tube');
      if (tube) { if (!state.oseLoaded) { setStatus('✕ Ambil inokulum LTB positif dengan ose yang sudah dipijarkan.', 'alert'); return; } if (state.bglbTube) { setStatus('Tabung BGLB sudah diinokulasi.', 'alert'); return; } state.bglbTube = tube; tube.classList.add('inoculated'); animateLiquid(tube); state.oseLoaded = false; ose.classList.remove('loaded'); setStatus('✓ Inokulum dari ose masuk ke BGLB. Masukkan rak BGLB ke inkubator 37°C.', 'positive-note'); requireObjects(bglbRack, incubator); return; }
      setStatus('✕ Arahkan ose ke Bunsen, LTB positif, atau salah satu tabung BGLB.', 'alert'); return;
    }
    if (state.stage === 7 && object === ecbRack) { if (!state.ecbTube) { setStatus('✕ Inokulasikan ECB dengan ose terlebih dahulu.', 'alert'); return; } if (target === incubator44) { state.ecbInIncubator = true; setStatus('✓ Rak ECB masuk ke inkubator ECB.', 'positive-note'); setAction('Mulai inkubasi ECB (4 dtk)', incubateECB); } else setStatus('✕ Masukkan rak ECB ke inkubator 44°C.', 'alert'); return; }
    if (state.stage === 7 && object === ose) {
      if (target === bunsen) { if (!state.alcoholSprayed) { setStatus('✕ Semprot alkohol 70% terlebih dahulu.', 'alert'); return; } state.oseSterile = true; state.oseLoaded = false; ose.classList.remove('loaded'); ose.classList.add('glowing'); setStatus('✓ Ose berpijar. Ambil inokulum dari BGLB positif.', 'positive-note'); return; }
      const bglb = target?.closest?.('.bglb-tube');
      if (bglb) { if (!state.oseSterile) { setStatus('✕ Pijarkan ose pada Bunsen terlebih dahulu.', 'alert'); return; } if (state.sourceBglb !== bglb) { setStatus('✕ Angkat/pilih tabung BGLB positif terlebih dahulu.', 'alert'); return; } state.oseSterile = false; state.oseLoaded = true; ose.classList.remove('glowing'); ose.classList.add('loaded'); setStatus('✓ Inokulum BGLB diambil dengan ose. Masukkan ke ECB.', 'positive-note'); return; }
      const ecb = target?.closest?.('.ecb-tube');
      if (ecb) { if (!state.oseLoaded) { setStatus('✕ Ambil inokulum BGLB positif dengan ose terlebih dahulu.', 'alert'); return; } if (state.ecbTube) { setStatus('Tabung ECB sudah diinokulasi.', 'alert'); return; } state.ecbTube = ecb; ecb.classList.add('inoculated'); animateLiquid(ecb); state.oseLoaded = false; ose.classList.remove('loaded'); setStatus('✓ Inokulum dari ose masuk ke ECB. Masukkan rak ECB ke inkubator 44°C.', 'positive-note'); requireObjects(ecbRack, incubator44); return; }
      setStatus('✕ Arahkan ose ke Bunsen, BGLB positif, atau ECB.', 'alert');
    }
  }
  function chooseLTB(index) { const tube = $(`#tube-${index}`); if (state.stage === 5) { if (!state.positives.has(index)) { setStatus('✕ Tabung tersebut tidak menunjukkan gas Durham.', 'alert'); return; } state.selectedPositives.add(index); tube.classList.add('selected'); setStatus('✓ Tabung presumtif positif dipilih.', 'positive-note'); if (state.selectedPositives.size === state.positives.size) setTimeout(() => setStage(6), 400); } if (state.stage === 6 && state.positives.has(index)) { state.sourceTube = index; $$('.test-tube').forEach(t => t.classList.remove('selected', 'lifted')); tube.classList.add('selected', 'lifted'); setStatus('✓ Tabung LTB positif diangkat. Sekarang pijarkan ose lalu ambil inokulum.', 'positive-note'); } }
  function chooseConfirm(tube) { if (state.stage === 7 && tube.classList.contains('bglb-tube') && tube.classList.contains('positive')) { state.sourceBglb = tube; $$('.bglb-tube').forEach(t => t.classList.remove('selected', 'lifted')); tube.classList.add('selected', 'lifted'); setStatus('✓ BGLB positif diangkat. Pijarkan ose lalu ambil inokulum.', 'positive-note'); } }
  function countdown(seconds, done) { clearInterval(state.timer); let remaining = seconds; $('#timerText').textContent = `${remaining} detik`; state.timer = setInterval(() => { remaining--; $('#timerText').textContent = remaining > 0 ? `${remaining} detik` : 'selesai'; if (remaining <= 0) { clearInterval(state.timer); state.timer = null; done(); } }, 1000); }
  function startMainIncubation() { const temp = Number($('#temp37').value); if (temp !== 37) { setStatus('✕ Atur inkubator LTB pada 37°C sebelum inkubasi.', 'alert'); return; } incubator.classList.add('open'); setStatus('Pintu inkubator terbuka; rak dimasukkan…'); setTimeout(() => { incubator.classList.remove('open'); setStatus('Inkubasi 37°C berjalan. Waktu simulasi dipersingkat; pemeriksaan sebenarnya mengikuti SOP.'); countdown(8, () => { [0, 1, 2, 3, 5, 6].forEach(i => { state.positives.add(i); $(`#tube-${i}`).classList.add('positive'); }); setStage(4); }); }, 500); }
  function incubateBGLB() { if (!state.bglbInIncubator) { setStatus('✕ Masukkan rak BGLB ke inkubator terlebih dahulu.', 'alert'); return; } setAction('', null); setStatus('Inkubasi BGLB berlangsung…'); countdown(5, () => { state.bglbTube.classList.add('positive'); setStage(7); }); }
  function incubateECB() { const temp = Number($('#temp44').value); if (!state.ecbInIncubator) { setStatus('✕ Masukkan rak ECB ke inkubator terlebih dahulu.', 'alert'); return; } if (temp !== 44) { setStatus('✕ Atur inkubator ECB pada 44°C sebelum inkubasi.', 'alert'); return; } setAction('', null); setStatus('Inkubasi ECB 44°C berlangsung…'); countdown(4, () => { state.ecbTube.classList.add('positive'); setStage(8); }); }
  function renderMPNForm() { clearRequired(); $('#resultContent').innerHTML = `${resultsMarkup()}<div class="answer-form"><label>Nilai rujukan APM/MPN dari tabel/metode SOP</label><input id="referenceValue" inputmode="decimal" placeholder="Nilai dari tabel/SOP"><label>Jawaban nilai APM/MPN Anda</label><input id="answerValue" inputmode="decimal" placeholder="Masukkan nilai"><button id="checkAnswer">Periksa jawaban</button><p id="answerFeedback"></p></div>`; $('#checkAnswer').addEventListener('click', () => { const ref = $('#referenceValue').value.trim().replace(',', '.'); const answer = $('#answerValue').value.trim().replace(',', '.'); const feedback = $('#answerFeedback'); if (!ref) { feedback.textContent = 'Masukkan nilai rujukan dari tabel/metode yang digunakan.'; feedback.className = 'alert'; return; } if (answer && Number(answer) === Number(ref)) { feedback.textContent = '✓ Nilai APM benar.'; feedback.className = 'positive-note'; setAction('Tampilkan kesimpulan', () => { state.mpnValue = $('#answerValue').value.trim(); setStage(10); }); } else { feedback.textContent = '✕ Nilai belum tepat; bandingkan dengan nilai rujukan.'; feedback.className = 'alert'; } }); }
  function renderConclusion() { clearRequired(); $('#resultContent').innerHTML = `<div class="result-pill">PEMERIKSAAN SELESAI</div><p><b>Kode sampel:</b> ASB-01<br><b>Jenis sampel:</b> Air Sumur Bor<br><b>Pola tabung:</b> ${pattern()}<br><b>Nilai APM/MPN:</b> ${state.mpnValue || 'Belum diisi'}</p><p>Interpretasi harus mengacu pada standar mutu dan SOP laboratorium yang berlaku.</p>`; setStatus('PEMERIKSAAN SELESAI — hasil siap dicatat.', 'positive-note'); }
  let dragging = null;
  function nearestTarget(x, y) {
    let candidates = []; if (state.stage === 1) candidates = [bottle]; if (state.stage === 2) candidates = $$('.test-tube'); if (state.stage === 3) candidates = [incubator]; if (state.stage === 6) candidates = [bunsen, incubator, ...$$('.test-tube.positive'), ...$$('.bglb-tube')]; if (state.stage === 7) candidates = [bunsen, incubator44, ...$$('.bglb-tube.positive'), ...$$('.ecb-tube')];
    return candidates.map(el => { const r = el.getBoundingClientRect(), pad = el.classList.contains('test-tube') || el.classList.contains('confirm-tube') ? 68 : 54, cx = Math.max(r.left, Math.min(x, r.right)), cy = Math.max(r.top, Math.min(y, r.bottom)); return { el, inside: x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad, distance: (x - cx) ** 2 + (y - cy) ** 2 }; }).filter(item => item.inside).sort((a, b) => a.distance - b.distance)[0]?.el || null;
  }
  bench.addEventListener('pointerdown', event => { if (event.target.closest('.test-tube, .confirm-tube, input, label')) return; const el = event.target.closest('[data-draggable]'); if (!el || !bench.contains(el) || event.button !== 0) return; const rect = el.getBoundingClientRect(), br = bench.getBoundingClientRect(); dragging = { el, dx: event.clientX - rect.left, dy: event.clientY - rect.top, br, x: event.clientX, y: event.clientY }; el.classList.add('dragging'); el.setPointerCapture(event.pointerId); event.preventDefault(); });
  bench.addEventListener('pointermove', event => { if (!dragging) return; const { el, dx, dy, br } = dragging, r = el.getBoundingClientRect(), x = Math.max(0, Math.min(event.clientX - br.left - dx, br.width - r.width)), y = Math.max(0, Math.min(event.clientY - br.top - dy, br.height - r.height)); el.style.left = `${x}px`; el.style.top = `${y}px`; el.style.bottom = 'auto'; el.style.right = 'auto'; $$('.drop-ready').forEach(target => target.classList.remove('drop-ready')); nearestTarget(event.clientX, event.clientY)?.classList.add('drop-ready'); dragging.x = event.clientX; dragging.y = event.clientY; });
  function endDrag(event) { if (!dragging) return; const { el } = dragging; const x = event.clientX, y = event.clientY; const target = nearestTarget(x, y); $$('.drop-ready').forEach(item => item.classList.remove('drop-ready')); el.classList.remove('dragging'); if (el.hasPointerCapture?.(event.pointerId)) el.releasePointerCapture(event.pointerId); dragging = null; handleDrop(el, target); }
  bench.addEventListener('pointerup', endDrag); bench.addEventListener('pointercancel', endDrag);
  alcohol.addEventListener('click', () => { if (![6, 7].includes(state.stage)) return; state.alcoholSprayed = true; alcohol.classList.add('sprayed'); setStatus('✓ Alkohol 70% telah digunakan. Pijarkan ose pada Bunsen hingga merah.', 'positive-note'); requireObjects(bunsen, ose); });
  $$('.focusable').forEach(button => button.addEventListener('click', () => { const object = $(`#${button.dataset.focus}`); if (!object) return; object.classList.add('required'); object.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); setTimeout(() => object.classList.remove('required'), 1800); }));
  $('#helpBtn').addEventListener('click', () => $('#helpDialog').showModal()); $('#closeHelp').addEventListener('click', () => $('#helpDialog').close()); $('#resetBtn').addEventListener('click', () => window.location.reload());
  setStage(1);
})();
