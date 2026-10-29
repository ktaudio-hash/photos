(() => {
  const PAGE_SIZE = 24;
  const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  // คำเชื่อม/คำทั่วไปที่ไม่ควรเป็นแท็ก
  const STOP_WORDS = new Set(['การ', 'และ', 'ที่', 'ของ', 'ใน', 'กับ', 'ให้', 'เพื่อ', 'จาก', 'โดย',
    'แก่', 'ความ', 'เป็น', 'มี', 'ได้', 'ต่อ', 'ครั้ง', 'ประจำ', 'ปี', 'วัน', 'ระหว่าง', 'พร้อม']);

  const $ = id => document.getElementById(id);
  let albums = [];
  let shown = PAGE_SIZE;
  let homeScrollY = 0;
  let lightboxImages = [];
  let lightboxIndex = 0;

  // ===== ข้อมูล =====
  const segmenter = window.Intl && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'word' }) : null;

  function makeTags(title) {
    const words = segmenter
      ? [...segmenter.segment(title)].filter(s => s.isWordLike).map(s => s.segment)
      : title.split(/\s+/);
    const tags = words.map(w => w.trim()).filter(w => w.length >= 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
    return [...new Set(tags)];
  }

  function imageUrl(id, width) {
    if (id.startsWith('demo-')) return demoImage(id);
    return `https://drive.google.com/thumbnail?id=${id}&sz=w${width}`;
  }

  // ภาพจำลองสำหรับ sample-data.json เท่านั้น
  function demoImage(id) {
    const hue = [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
      <rect width="400" height="300" fill="hsl(${hue},45%,70%)"/>
      <circle cx="300" cy="80" r="40" fill="hsl(${hue},60%,88%)"/>
      <path d="M0 300 L130 150 L220 240 L290 180 L400 300Z" fill="hsl(${hue},40%,45%)"/>
      <text x="16" y="32" font-family="sans-serif" font-size="18" fill="#fff">${id}</text></svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  function thaiDate(a, full) {
    return `${a.d} ${(full ? MONTHS : MONTHS_SHORT)[a.m - 1]} ${a.y}`;
  }

  function albumTitle(a) {
    return a.title || `กิจกรรมวันที่ ${thaiDate(a, true)}`;
  }

  // ===== Routing (#/album/<id> หรือ #/?y=&m=&d=&q=&tag=) =====
  function parseHash() {
    const hash = location.hash.slice(1) || '/';
    const albumMatch = hash.match(/^\/album\/([^/?]+)/);
    if (albumMatch) return { view: 'album', id: decodeURIComponent(albumMatch[1]) };
    const params = new URLSearchParams(hash.split('?')[1] || '');
    return {
      view: 'home',
      y: +params.get('y') || 0,
      m: +params.get('m') || 0,
      d: +params.get('d') || 0,
      q: params.get('q') || '',
      tag: params.get('tag') || '',
    };
  }

  function setFilters(f) {
    const params = new URLSearchParams();
    ['y', 'm', 'd', 'q', 'tag'].forEach(k => { if (f[k]) params.set(k, f[k]); });
    const qs = params.toString();
    history.replaceState(null, '', qs ? `#/?${qs}` : '#/');
    shown = PAGE_SIZE;
    renderHome(parseHash());
  }

  function route() {
    const r = parseHash();
    $('home').hidden = r.view !== 'home';
    $('album').hidden = r.view !== 'album';
    if (r.view === 'album') {
      renderAlbum(r.id);
      window.scrollTo(0, 0);
    } else {
      renderHome(r);
      window.scrollTo(0, homeScrollY);
    }
  }

  // ===== หน้าแรก =====
  function fillSelect(sel, placeholder, values, label, current) {
    sel.innerHTML = `<option value="">${placeholder}</option>` +
      values.map(v => `<option value="${v}"${v === current ? ' selected' : ''}>${label(v)}</option>`).join('');
  }

  const unique = arr => [...new Set(arr)];

  function renderHome(f) {
    document.title = 'คลังภาพกิจกรรม โรงเรียนคงทองวิทยา';
    $('status').hidden = true;
    if ($('q').value !== f.q) $('q').value = f.q;

    const dated = albums.filter(a => !a.special);
    const years = unique(dated.map(a => a.y)).sort((a, b) => b - a);
    const months = unique(dated.filter(a => !f.y || a.y === f.y).map(a => a.m)).sort((a, b) => a - b);
    const days = unique(dated.filter(a => (!f.y || a.y === f.y) && a.m === f.m).map(a => a.d)).sort((a, b) => a - b);
    fillSelect($('year'), 'ทุกปี', years, v => `พ.ศ. ${v}`, f.y);
    fillSelect($('month'), 'ทุกเดือน', months, v => MONTHS[v - 1], f.m);
    fillSelect($('day'), 'ทุกวัน', days, v => `วันที่ ${v}`, f.d);
    $('day').disabled = !f.m;

    const q = f.q.trim().toLowerCase();
    const list = dated.filter(a =>
      (!f.y || a.y === f.y) && (!f.m || a.m === f.m) && (!f.d || a.d === f.d) &&
      (!f.tag || a.tags.includes(f.tag)) &&
      (!q || a.title.toLowerCase().includes(q)));

    renderPopularTags(f.tag);

    const hasFilter = f.y || f.m || f.d || f.q || f.tag;
    $('count').textContent = list.length
      ? (hasFilter ? `พบ ${list.length} อัลบั้ม` : `ทั้งหมด ${list.length} อัลบั้ม`)
      : 'ไม่พบอัลบั้มที่ตรงกับการค้นหา';
    $('grid').innerHTML = list.slice(0, shown).map(cardHtml).join('');
    $('more').hidden = list.length <= shown;

    // อัลบั้มคัดพิเศษ (โฟลเดอร์ Can't progress) — ไม่มีวันที่ให้กรอง จึงซ่อนเมื่อกำลังค้นหา
    const others = albums.filter(a => a.special);
    $('others').hidden = !others.length || !!hasFilter;
    $('othersGrid').innerHTML = others.map(cardHtml).join('');
  }

  function renderPopularTags(active) {
    const freq = {};
    albums.forEach(a => a.tags.forEach(t => { freq[t] = (freq[t] || 0) + 1; }));
    const top = Object.keys(freq).sort((a, b) => freq[b] - freq[a]).slice(0, 15);
    if (active && !top.includes(active)) top.unshift(active);
    $('tags').innerHTML = top.map(t =>
      `<button type="button" class="tag${t === active ? ' active' : ''}" data-tag="${esc(t)}">#${esc(t)}</button>`).join('');
  }

  function cardHtml(a) {
    return `<a class="card" href="#/album/${encodeURIComponent(a.id)}">
      <img src="${imageUrl(a.cover, 600)}" alt="" loading="lazy">
      <div class="card-body">
        ${a.special ? '<span class="card-date special">ภาพคัดพิเศษ</span>' : `<span class="card-date">${thaiDate(a)}</span>`}
        <div class="card-title">${esc(albumTitle(a))}</div>
        <div class="card-meta">${a.count} ภาพ</div>
      </div>
    </a>`;
  }

  // ===== หน้าอัลบั้ม =====
  function renderAlbum(id) {
    const a = albums.find(x => x.id === id);
    if (!a) {
      $('album').hidden = true;
      $('status').hidden = false;
      $('status').innerHTML = 'ไม่พบอัลบั้มนี้ อาจถูกย้ายหรือลบไปแล้ว <a href="#/">กลับหน้าแรก</a>';
      return;
    }
    $('status').hidden = true;
    document.title = `${albumTitle(a)} — คลังภาพกิจกรรม`;
    $('albumCover').src = imageUrl(a.cover, 1600);
    $('albumDate').textContent = a.special ? 'อัลบั้มกิจกรรมอื่นๆ' : thaiDate(a, true);
    $('albumTitle').textContent = albumTitle(a);
    $('albumTags').innerHTML = a.tags.map(t =>
      `<a class="tag" href="#/?tag=${encodeURIComponent(t)}">#${esc(t)}</a>`).join('');
    $('download').href = `https://drive.google.com/drive/folders/${a.id}`;
    $('download').textContent = `ดาวน์โหลดภาพทั้งหมด (${a.count} ภาพ) ใน Google Drive`;

    lightboxImages = [a.cover, ...a.previews];
    $('previews').innerHTML = a.previews.map((p, i) =>
      `<button type="button" data-index="${i + 1}"><img src="${imageUrl(p, 500)}" alt="ภาพตัวอย่าง ${i + 1}" loading="lazy"></button>`).join('');
  }

  // ===== Lightbox =====
  function openLightbox(i) {
    lightboxIndex = (i + lightboxImages.length) % lightboxImages.length;
    $('lightboxImg').src = imageUrl(lightboxImages[lightboxIndex], 1600);
    if (!$('lightbox').open) $('lightbox').showModal();
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  // ===== Events =====
  function currentFilters() {
    const f = parseHash();
    return { y: f.y, m: f.m, d: f.d, q: f.q, tag: f.tag };
  }

  $('year').addEventListener('change', e => setFilters({ ...currentFilters(), y: +e.target.value, m: 0, d: 0 }));
  $('month').addEventListener('change', e => setFilters({ ...currentFilters(), m: +e.target.value, d: 0 }));
  $('day').addEventListener('change', e => setFilters({ ...currentFilters(), d: +e.target.value }));
  $('q').addEventListener('input', e => setFilters({ ...currentFilters(), q: e.target.value }));
  $('filters').addEventListener('submit', e => e.preventDefault());
  $('clear').addEventListener('click', () => setFilters({}));
  $('tags').addEventListener('click', e => {
    const t = e.target.closest('[data-tag]');
    if (!t) return;
    const f = currentFilters();
    setFilters({ ...f, tag: f.tag === t.dataset.tag ? '' : t.dataset.tag });
  });
  $('more').addEventListener('click', () => { shown += PAGE_SIZE; renderHome(parseHash()); });
  $('grid').addEventListener('click', e => { if (e.target.closest('.card')) homeScrollY = window.scrollY; });

  $('albumCover').addEventListener('click', () => openLightbox(0));
  $('previews').addEventListener('click', e => {
    const b = e.target.closest('[data-index]');
    if (b) openLightbox(+b.dataset.index);
  });
  $('lightbox').addEventListener('click', e => {
    const act = e.target.dataset.act;
    if (act === 'prev') openLightbox(lightboxIndex - 1);
    else if (act === 'next') openLightbox(lightboxIndex + 1);
    else if (act === 'close' || e.target === $('lightbox')) $('lightbox').close();
  });
  document.addEventListener('keydown', e => {
    if (!$('lightbox').open) return;
    if (e.key === 'ArrowLeft') openLightbox(lightboxIndex - 1);
    if (e.key === 'ArrowRight') openLightbox(lightboxIndex + 1);
  });
  window.addEventListener('hashchange', route);

  // ภาพจาก Drive บางครั้งโหลดไม่ขึ้นในครั้งแรก — ลองใหม่สูงสุด 3 ครั้ง
  document.addEventListener('error', e => {
    const img = e.target;
    if (img.tagName !== 'IMG' || !img.src.includes('drive.google.com')) return;
    const n = +(img.dataset.retry || 0);
    if (n >= 3) return;
    img.dataset.retry = n + 1;
    setTimeout(() => { img.src = img.src.replace(/&retry=\d+$/, '') + '&retry=' + (n + 1); }, 1000 * (n + 1));
  }, true);

  // ===== เริ่มต้น =====
  fetch(window.APP_CONFIG.API_URL || 'sample-data.json')
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(data => {
      albums = data.albums.map(a => ({
        ...a,
        y: +a.date.slice(0, 4),
        m: +a.date.slice(5, 7),
        d: +a.date.slice(8, 10),
        tags: a.special ? [] : makeTags(a.title),
      }));
      $('status').hidden = true;
      route();
    })
    .catch(() => {
      $('status').textContent = 'โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
    });
})();
