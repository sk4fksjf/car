(() => {
  'use strict';
  window.__hodReady = true;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const pad = (n) => String(n).padStart(2, '0');
  const rub = (n) => Math.round(n).toLocaleString('ru-RU') + ' ₽';

  /* =========================================================
     Автомобили и ролики.
     Ролик i начинается с машины CARS[i] в кадре и заканчивается
     машиной CARS[i + 1]. Время — в секундах исходного ролика:
       from — с какого момента запускать (до этого машина стоит),
       swap — когда в кадр въезжает следующая (меняем подпись),
       to   — когда она полностью остановилась (ставим на паузу).
     ========================================================= */
  const CARS = [
    {
      brand: 'Mercedes-Benz', name: 'S-Class', version: 'S 450 4MATIC Long', short: 'S-Class',
      power: '367', accel: '5,1',
      tariff: { min: 49, wait: 12, h1: 2690, h3: 6990, d1: 15900 },
    },
    {
      brand: 'BMW', name: '7 Series', version: '740Li xDrive', short: '7 Series',
      power: '380', accel: '5,4',
      tariff: { min: 44, wait: 10, h1: 2390, h3: 6290, d1: 14500 },
    },
  ];
  // align — как сдвинуть/увеличить/подсветить первый кадр ролика, чтобы он
  // совпал с последним кадром предыдущего (замерено по кадрам; dx, dy — доли
  // ширины и высоты кадра). Поправка тает, пока машины едут.
  const CLIPS = [
    { el: $('[data-clip="0"]'), from: 0.85, swap: 3.9, to: 7.7, align: { s: 1.02, dx: -2 / 480, dy: 2 / 270, gain: 1.054 } },
    { el: $('[data-clip="1"]'), from: 0, swap: 3.2, to: 8.0, align: { s: 1.0025, dx: -4 / 480, dy: -3 / 270, gain: 1.059 } },
  ];
  // 24 кадра × 1.25 = ровно 30 кадров/с — ровно ложится на экран 60 Гц, без рывков
  const RATE = 1.25;
  const SEAM_FADE = 300; // мс: короткая склейка на клике, пока машина ещё стоит

  /* =========================================================
     Плавный скролл (Lenis), если библиотека загрузилась
     ========================================================= */
  let lenis = null;
  const initLenis = () => {
    if (lenis || reduced || !window.Lenis) return;
    lenis = new window.Lenis({ lerp: 0.085, wheelMultiplier: 0.9 });
  };
  if (window.Lenis) initLenis();
  else window.__onLenis = initLenis;
  $$('a[href^="#"]').forEach((a) =>
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (id.length < 2) return e.preventDefault(); // ссылка-заглушка
      const target = id === '#top' ? 0 : $(id);
      if (target === null) return;
      e.preventDefault();
      closeMenu();
      if (lenis) lenis.scrollTo(target, { duration: 1.8 });
      else if (target === 0) window.scrollTo({ top: 0, behavior: 'smooth' });
      else target.scrollIntoView({ behavior: 'smooth' });
    })
  );

  /* =========================================================
     HERO: по стрелке (или клику по кадру) машина уезжает,
     приезжает следующая
     ========================================================= */
  const hero = $('[data-hero]');
  const media = $('[data-hero-media]');
  const btnNext = $('[data-next]');
  const ring = $('[data-ring]');
  const RING_LEN = 308;
  const subEl = $('[data-car-sub]');
  const nameEl = $('[data-car-name]');
  const stills = $$('[data-still]');
  let cur = 0;
  let busy = false;
  let stillOn = 0; // какое фото сейчас лежит поверх видео (null — видно само видео)

  $('[data-total]').textContent = pad(CARS.length);

  function setRing(p) {
    ring.style.strokeDashoffset = RING_LEN * (1 - clamp(p));
  }

  /* Одометр: меняются только те цифры, что отличаются, и каждая
     докручивается вперёд по ленте 0–9, как механический счётчик. */
  const STRIP = Array.from({ length: 20 }, (_, d) => `<span>${d % 10}</span>`).join('');
  function odo(el, text, animate = true) {
    const prev = el.dataset.odo ?? text;
    el.dataset.odo = text;
    el.classList.add('odo');
    el.setAttribute('aria-label', text);
    const strips = [];
    el.innerHTML = [...text].map((ch, i) => {
      if (!/\d/.test(ch)) return `<span class="odo__ch" aria-hidden="true">${ch}</span>`;
      // сравниваем с цифрой на той же позиции, считая справа
      const old = prev[prev.length - (text.length - i)];
      const from = /\d/.test(old) ? +old : +ch;
      const to = +ch >= from ? +ch : +ch + 10;
      strips.push({ from, to });
      return `<span class="odo__col" aria-hidden="true"><span class="odo__strip" style="transform:translateY(${-from * 5}%)">${STRIP}</span></span>`;
    }).join('');
    const els = $$('.odo__strip', el);
    if (!animate || reduced) {
      els.forEach((s, k) => (s.style.transform = `translateY(${-(strips[k].to % 10) * 5}%)`));
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      els.forEach((s, k) => {
        const { from, to } = strips[k];
        if (from === to) return;
        s.style.setProperty('--dur', `${1.1 + (to - from) * 0.06}s`);
        s.style.transitionDelay = `${k * 70}ms`;
        s.classList.add('is-rolling');
        s.style.transform = `translateY(${-to * 5}%)`;
      });
    }));
  }
  const odoEls = ['[data-car-power]', '[data-car-accel]', '[data-car-price]', '[data-count]'].map((s) => $(s));
  odoEls.forEach((el) => odo(el, el.textContent, false));

  /* Огромное название: буквы уезжают вверх, новые выезжают снизу */
  const letters = (text) => [...text].map((ch, i) =>
    `<span class="nm__c" style="--i:${i}">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('');
  function nameOut() {
    if (reduced) return;
    $('.nm', nameEl)?.classList.add('is-out');
  }
  function nameIn(text) {
    nameEl.setAttribute('aria-label', text);
    nameEl.innerHTML = `<span class="nm${reduced ? '' : ' is-pre'}" aria-hidden="true">${letters(text)}</span>`;
    if (reduced) return;
    const nm = $('.nm', nameEl);
    nm.getBoundingClientRect(); // фиксируем стартовое положение букв
    requestAnimationFrame(() => nm.classList.remove('is-pre'));
  }
  nameEl.setAttribute('aria-label', nameEl.textContent);
  nameEl.innerHTML = `<span class="nm" aria-hidden="true">${letters(nameEl.textContent)}</span>`;

  const fade = (el, out) =>
    el.animate(
      out
        ? [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-8px)' }]
        : [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
      { duration: out ? 500 : 900, easing: 'cubic-bezier(.2,.75,.15,1)', fill: 'forwards' }
    );

  function renderInfo(i) {
    const c = CARS[i];
    subEl.textContent = `${c.brand} · ${c.version}`;
    fade(subEl, false);
    nameIn(c.name);
    odo(odoEls[0], c.power);
    odo(odoEls[1], c.accel);
    odo(odoEls[2], String(c.tariff.min));
    odo(odoEls[3], pad(i + 1));
  }

  /* Фото поверх видео */
  function showStill(i, dur = 450) {
    const s = stills[i];
    stillOn = i;
    s.classList.add('is-on');
    s.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur, easing: 'ease-out' });
    stills.forEach((o) => o !== s && o.classList.remove('is-on'));
  }
  function hideStill() {
    if (stillOn === null) return;
    const s = stills[stillOn];
    stillOn = null;
    s.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing: 'ease-in' })
      .finished.then(() => stillOn === null && s.classList.remove('is-on'));
  }

  // ставим скрытый ролик на кадр, где машина ещё стоит
  function cue(clip) {
    const v = clip.el;
    const seek = () => { if (Math.abs(v.currentTime - clip.from) > 0.05) v.currentTime = clip.from; };
    if (v.readyState >= 1) seek();
    else v.addEventListener('loadedmetadata', seek, { once: true });
  }
  // видимый ролик на старте не трогаем: пусть браузер спокойно грузит его
  CLIPS.slice(1).forEach(cue);

  // Запускать ролики может только сайт. Chrome сам ставит видео на паузу
  // в скрытой вкладке и сам же запускает при возвращении — такие запуски гасим.
  let playingEl = null;
  CLIPS.forEach(({ el }) => el.addEventListener('play', () => {
    if (el !== playingEl) el.pause();
  }));

  function play(clip, nextIndex) {
    return new Promise((resolve) => {
      const v = clip.el;
      let swapped = false;
      let done = false;
      let lastT = v.currentTime;
      let lastMove = performance.now();
      const swap = () => {
        if (swapped) return;
        swapped = true;
        renderInfo(nextIndex);
      };
      const check = () => {
        if (done) return;
        const t = v.currentTime;
        if (t > lastT + 0.004) {
          lastT = t;
          lastMove = performance.now();
          // ролик реально поехал — фото больше не нужно
          if (stillOn !== null && t > clip.from + 0.04) hideStill();
        }
        setRing((t - clip.from) / (clip.to - clip.from));
        if (t >= clip.swap) swap();
        if (t >= clip.to || v.ended) return finish();
        // последние ~1.1 с замедляемся, чтобы пауза наступила мягко, а не обрывом
        const k = clamp((t - (clip.to - 1.1)) / 1.1);
        const rate = RATE - (RATE - 0.45) * k * k * (3 - 2 * k);
        if (Math.abs(v.playbackRate - rate) > 0.03) v.playbackRate = rate;
      };
      const loop = () => {
        check();
        if (!done) requestAnimationFrame(loop);
      };
      const stop = () => {
        done = true;
        playingEl = null;
        v.pause();
        v.removeEventListener('timeupdate', check);
        v.removeEventListener('error', bail);
        clearInterval(watchdog);
      };
      const finish = () => {
        if (done) return;
        stop();
        swap();
        resolve();
      };
      // Ролик не идёт: браузер не дал его запустить, поставил на паузу
      // (экономия батареи, режим энергосбережения) или видео не загрузилось.
      // Не зависаем — мягко показываем фото следующей машины.
      function bail() {
        if (done) return;
        stop();
        swap();
        showStill(nextIndex, 700);
        setRing(1);
        resolve();
      }
      v.addEventListener('timeupdate', check);
      v.addEventListener('error', bail);
      const watchdog = setInterval(() => {
        if (done) return;
        // в скрытой вкладке не считаем простой — браузер просто спит
        if (document.visibilityState !== 'visible') { lastMove = performance.now(); return; }
        if (v.paused) v.play().catch(() => {});
        if (performance.now() - lastMove > 1400) bail();
      }, 250);
      playingEl = v;
      v.playbackRate = RATE;
      const p = v.play();
      if (p) p.catch((e) => { if (e && e.name === 'NotAllowedError') bail(); });
      requestAnimationFrame(loop);
    });
  }

  // где внутри <video>/<img> лежит сам кадр (object-fit: cover + object-position)
  function frameBox(v) {
    const bw = v.clientWidth, bh = v.clientHeight;
    const vw = v.videoWidth || v.naturalWidth || 1920, vh = v.videoHeight || v.naturalHeight || 1080;
    const k = Math.max(bw / vw, bh / vh);
    const W = vw * k, H = vh * k;
    const [px, py] = getComputedStyle(v).objectPosition.split(' ').map((s) => parseFloat(s) / 100);
    return { W, H, ox: (bw - W) * px, oy: (bh - H) * py };
  }

  // у роликов и фото одна точка масштабирования — центр кадра,
  // тогда запас scale: 1.03 одинаков и кадры остаются совмещёнными
  const layers = [...CLIPS.map((c) => c.el), ...stills];
  function setOrigins() {
    layers.forEach((el) => {
      const { W, H, ox, oy } = frameBox(el);
      el.style.transformOrigin = `${(ox + W / 2).toFixed(1)}px ${(oy + H / 2).toFixed(1)}px`;
    });
  }
  CLIPS.forEach(({ el }) => el.addEventListener('loadedmetadata', setOrigins));
  addEventListener('resize', setOrigins);
  setOrigins();

  // делаем ролик видимым — синхронно, чтобы запуск видео остался внутри клика.
  // seam — склейка с предыдущим роликом: подгоняем кадр под него и коротко растворяем
  function show(clip, seam) {
    const v = clip.el;
    if (Math.abs(v.currentTime - clip.from) > 0.05) v.currentTime = clip.from;
    if (v.classList.contains('is-active')) return;
    const others = CLIPS.filter((c) => c !== clip);
    if (seam) {
      setOrigins();
      const { W, H } = frameBox(v);
      const a = clip.align;
      const T = `translate(${(a.dx * W).toFixed(2)}px, ${(a.dy * H).toFixed(2)}px) scale(${a.s})`;
      const F = `brightness(${a.gain})`;
      v.animate(
        [{ transform: T, filter: F }, { transform: T, filter: F, offset: 0.12 }, { transform: 'none', filter: 'none' }],
        { duration: 3000, easing: 'cubic-bezier(.45,0,.25,1)' }
      );
      v.animate([{ opacity: 0 }, { opacity: 1 }], { duration: SEAM_FADE, easing: 'linear' });
    }
    v.classList.add('is-top', 'is-active');
    setTimeout(() => {
      others.forEach((c) => c.el.classList.remove('is-active'));
      v.classList.remove('is-top');
    }, seam ? SEAM_FADE + 60 : 40);
  }

  function next() {
    if (busy) return;
    busy = true;
    btnNext.classList.add('is-busy');
    ring.classList.remove('is-reset');

    const nextIndex = (cur + 1) % CARS.length;
    const clip = CLIPS[cur];
    const following = CLIPS[nextIndex];

    fade(subEl, true);
    nameOut();

    let run;
    if (reduced) {
      renderInfo(nextIndex);
      showStill(nextIndex, 300);
      run = Promise.resolve();
    } else {
      // если поверх лежит фото этой же машины — оно и есть стартовый кадр,
      // склейка не нужна; иначе подгоняем ролик под кадр на паузе
      show(clip, stillOn === null);
      run = play(clip, nextIndex);
    }

    run.then(() => {
      // машина остановилась — ролик стоит на паузе на последнем кадре,
      // а следующий заранее ставим на старт
      cue(following);
      ring.classList.add('is-reset');
      setRing(0);
      cur = nextIndex;
      busy = false;
      btnNext.classList.remove('is-busy');
    });
  }

  btnNext.addEventListener('click', next);

  let heroVisible = true;
  new IntersectionObserver(([e]) => (heroVisible = e.isIntersecting)).observe(hero);
  addEventListener('keydown', (e) => {
    if (heroVisible && e.key === 'ArrowRight' && !e.target.closest('input, textarea')) next();
  });

  // на телефоне можно смахнуть кадр влево — следующая машина
  let sx = null;
  media.addEventListener('pointerdown', (e) => (sx = e.pointerType === 'mouse' ? null : e.clientX));
  media.addEventListener('pointerup', (e) => {
    if (sx !== null && sx - e.clientX > 50) next();
    sx = null;
  });

  /* =========================================================
     Вступление: отметить, что уже показали, и убрать слой
     ========================================================= */
  const intro = $('[data-intro]');
  const html = document.documentElement;
  if (html.classList.contains('intro-play') && intro) {
    try { sessionStorage.setItem('hod-intro', '1'); } catch (e) { /* приватный режим */ }
    const skip = () => { html.classList.add('intro-skip'); intro.remove(); };
    intro.addEventListener('click', skip);
    setTimeout(() => intro.isConnected && intro.remove(), 3400);
  } else {
    intro?.remove();
  }

  // кадр проявляется, когда фото первой машины уже готово — не показываем пустой экран
  if (html.classList.contains('no-intro')) {
    const first = stills[0];
    let shown = false;
    const reveal = () => {
      if (shown) return;
      shown = true;
      requestAnimationFrame(() => requestAnimationFrame(() => hero.classList.add('is-shown')));
    };
    if (first.complete && first.naturalWidth) (first.decode ? first.decode().catch(() => {}) : Promise.resolve()).then(reveal);
    else first.addEventListener('load', reveal, { once: true });
    first.addEventListener('error', reveal, { once: true });
    setTimeout(reveal, 2500); // медленный интернет — не держим экран тёмным дольше
  }

  /* =========================================================
     Манифест: слова проявляются по мере скролла
     ========================================================= */
  const words = $('[data-words]');
  words.innerHTML = words.innerHTML
    .split(/(\s+)/)
    .map((part) => (/^\s+$/.test(part) ? part : `<span class="w">${part}</span>`))
    .join('');
  const wordEls = $$('.w', words);

  /* =========================================================
     Тарифы: таблица и калькулятор
     ========================================================= */
  const fmt = (n) => n.toLocaleString('ru-RU') + ' ₽';
  $('[data-ptable]').innerHTML = CARS.map(
    (c) => `
    <div class="ptable__row" role="row">
      <span class="ptable__car" role="cell"><b>${c.short}</b><small>${c.version}</small></span>
      <span class="ptable__cell ptable__cell--main" role="cell"><em>Минута</em>${fmt(c.tariff.min)}</span>
      <span class="ptable__cell" role="cell"><em>Ожидание</em>${fmt(c.tariff.wait)}/мин</span>
      <span class="ptable__cell" role="cell"><em>1 час</em>${fmt(c.tariff.h1)}</span>
      <span class="ptable__cell" role="cell"><em>3 часа</em>${fmt(c.tariff.h3)}</span>
      <span class="ptable__cell" role="cell"><em>Сутки</em>${fmt(c.tariff.d1)}</span>
    </div>`
  ).join('');

  const calcClasses = $('[data-calc-classes]');
  const calcInput = $('[data-calc-input]');
  let calcIdx = 0;
  calcClasses.innerHTML = CARS.map(
    (c, i) => `<button type="button" class="chip" role="radio" aria-checked="${i === 0}" data-i="${i}">${c.short}</button>`
  ).join('');
  calcClasses.addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    calcIdx = +b.dataset.i;
    $$('.chip', calcClasses).forEach((c) => c.setAttribute('aria-checked', c === b));
    updateCalc();
  });

  function fmtTime(m) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    if (!h) return `${mm} мин`;
    return mm ? `${h} ч ${mm} мин` : `${h} ч`;
  }

  function updateCalc() {
    const m = +calcInput.value;
    const t = CARS[calcIdx].tariff;
    calcInput.style.setProperty('--p', `${((m - calcInput.min) / (calcInput.max - calcInput.min)) * 100}%`);
    $('[data-calc-time]').textContent = fmtTime(m);

    const perMin = m * t.min;
    const options = [{ label: 'Поминутно', price: perMin }];
    [['1 час', 60, t.h1], ['3 часа', 180, t.h3], ['Сутки', 1440, t.d1]].forEach(([name, mins, price]) => {
      const extra = Math.max(0, m - mins);
      options.push({ label: extra ? `Пакет «${name}» + ${fmtTime(extra)}` : `Пакет «${name}»`, price: price + extra * t.min });
    });
    const best = options.reduce((a, b) => (b.price < a.price ? b : a));
    const isPackage = best.label !== 'Поминутно';

    const minEl = $('[data-calc-minutes]');
    minEl.textContent = rub(perMin);
    minEl.classList.toggle('is-crossed', isPackage);
    $('[data-calc-best-label]').textContent = isPackage ? 'Выгоднее пакетом' : 'Лучший вариант';
    $('[data-calc-best]').textContent = rub(best.price);
    $('[data-calc-note]').textContent = isPackage
      ? `${best.label} — экономия ${rub(perMin - best.price)}`
      : 'На короткой поездке минуты дешевле любого пакета';
  }
  calcInput.addEventListener('input', updateCalc);
  updateCalc();

  /* =========================================================
     Карта: свободные машины
     ========================================================= */
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let dots = '';
  for (let i = 0; i < 64; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.pow(rnd(), 0.8);
    const x = (300 + Math.cos(a) * r * 205).toFixed(1);
    const y = (300 + Math.sin(a) * r * 222).toFixed(1);
    const hot = i % 9 === 0;
    dots += `<circle class="map__dot${hot ? ' map__dot--hot' : ''}" cx="${x}" cy="${y}" r="${hot ? 3.5 : 2.2}" style="transition-delay:${(900 + r * 1100 + rnd() * 400) | 0}ms"/>`;
    if (hot) dots += `<circle class="map__ping" cx="${x}" cy="${y}" r="8" style="animation-delay:${(rnd() * 3000) | 0}ms"/>`;
  }
  $('[data-map-dots]').innerHTML = dots;

  /* =========================================================
     Появление при скролле, счётчики, шаги
     ========================================================= */
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    }),
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
  );
  $$('[data-reveal], [data-footer-word]').forEach((el) => io.observe(el));

  const countIO = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      countIO.unobserve(e.target);
      const el = e.target;
      const to = parseFloat(el.dataset.countTo);
      if (reduced) return (el.textContent = to.toLocaleString('ru-RU'));
      const t0 = performance.now();
      const dur = 2000;
      const tick = (now) => {
        const p = clamp((now - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 4);
        el.textContent = Math.round(to * eased).toLocaleString('ru-RU');
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }),
    { threshold: 0.6 }
  );
  $$('[data-count-to]').forEach((el) => countIO.observe(el));

  const steps = $$('[data-step]');
  const screens = $$('[data-screen]');
  const stepsList = $('.steps');
  const dotsBox = $('[data-how-dots]');
  const howMobile = matchMedia('(max-width: 900px)');
  let stepNow = 0;

  dotsBox.innerHTML = steps.map((_, i) =>
    `<button type="button" class="how__dot${i ? '' : ' is-active'}" role="tab" aria-label="Шаг ${i + 1}" aria-selected="${!i}"></button>`
  ).join('');
  const stepDots = $$('.how__dot', dotsBox);

  function setStep(i) {
    if (i === stepNow) return;
    stepNow = i;
    steps.forEach((s, k) => s.classList.toggle('is-active', k === i));
    screens.forEach((s) => s.classList.toggle('is-active', +s.dataset.screen === i));
    stepDots.forEach((d, k) => {
      d.classList.toggle('is-active', k === i);
      d.setAttribute('aria-selected', k === i);
    });
  }

  // компьютер: шаг меняется, когда его текст доходит до середины экрана
  const stepIO = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (e.isIntersecting && !howMobile.matches) setStep(+e.target.dataset.step);
    }),
    { rootMargin: '-45% 0px -45% 0px' }
  );
  steps.forEach((s) => stepIO.observe(s));

  // телефон: шаги листаются свайпом, экран телефона меняется вслед.
  // Шаг меняется, только когда карточка явно ближе остальных (зона ±35%),
  // поэтому, если палец замер между карточками, ничего не мигает.
  const maxScroll = () => stepsList.scrollWidth - stepsList.clientWidth;
  const stepPos = (i) => Math.min(steps[i].offsetLeft - steps[0].offsetLeft, maxScroll());
  const nearestStep = () => {
    const x = stepsList.scrollLeft;
    let best = 0;
    steps.forEach((_, k) => { if (Math.abs(stepPos(k) - x) < Math.abs(stepPos(best) - x)) best = k; });
    return best;
  };
  let lockStep = null; // пока листаем по нажатию на точку, промежуточные шаги не показываем
  let settleTimer = 0;
  const settle = () => { lockStep = null; setStep(nearestStep()); };
  stepsList.addEventListener('scroll', () => {
    if (!howMobile.matches) return;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, 140);
    if (lockStep !== null) return;
    const x = stepsList.scrollLeft;
    const pitch = stepPos(1) - stepPos(0) || 1;
    steps.forEach((_, k) => { if (Math.abs(stepPos(k) - x) < pitch * 0.35) setStep(k); });
  }, { passive: true });
  if ('onscrollend' in window) stepsList.addEventListener('scrollend', () => howMobile.matches && settle());

  function goStep(i) {
    i = clamp(i, 0, steps.length - 1);
    lockStep = i;
    setStep(i);
    stepsList.scrollTo({ left: stepPos(i), behavior: reduced ? 'auto' : 'smooth' });
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, 900); // на случай, если прокрутка не понадобилась
  }
  stepDots.forEach((d, i) => d.addEventListener('click', () => goStep(i)));
  // тап по шагу тоже переключает экран
  steps.forEach((s, i) => s.addEventListener('click', () => howMobile.matches && i !== stepNow && goStep(i)));

  // сам телефон тоже можно листать пальцем: влево — следующий шаг, вправо — предыдущий
  const phoneEl = $('.phone');
  let px = null, py = null;
  phoneEl.addEventListener('touchstart', (e) => { px = e.touches[0].clientX; py = e.touches[0].clientY; }, { passive: true });
  phoneEl.addEventListener('touchend', (e) => {
    if (px === null || !howMobile.matches) return;
    const dx = e.changedTouches[0].clientX - px, dy = e.changedTouches[0].clientY - py;
    px = py = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.4) goStep(stepNow + (dx < 0 ? 1 : -1));
  }, { passive: true });

  /* =========================================================
     Автопарк: машина «просыпается», когда фото появилось на экране
     ========================================================= */
  const fronts = $$('[data-ignite]').map((el) => ({ el, layers: $('.car__layers', el), woke: null }));
  const wakeIO = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      wakeIO.unobserve(e.target);
      const f = fronts.find((x) => x.el === e.target);
      // ждём, пока шторка откроет кадр, — и включаем фары
      setTimeout(() => { f.el.classList.add('is-awake'); f.woke = performance.now(); }, reduced ? 0 : 750);
    }),
    { threshold: 0.45 }
  );
  fronts.forEach((f) => wakeIO.observe(f.el));

  // наезд камеры: при появлении кадр «оседает» с 1.16, дальше медленно приближается по скроллу
  function updateFronts(now, vh) {
    fronts.forEach((f) => {
      const r = f.el.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) return;
      const t = f.woke === null ? 0 : clamp((now - f.woke) / 2600);
      const settle = 1 + 0.16 * Math.pow(1 - t, 3);
      const p = clamp((vh - r.top) / (vh + r.height));
      // на телефоне камера ближе — машина крупнее; data-zoom задаёт свой масштаб
      const base = f.el.dataset.zoom ? +f.el.dataset.zoom : innerWidth < 760 ? 1.32 : 1.08;
      const push = f.el.dataset.zoom ? 0.04 : 0.12;
      f.layers.style.scale = (settle * (base + p * push)).toFixed(4);
    });
  }

  /* =========================================================
     Покадровые эффекты
     ========================================================= */
  const header = $('[data-header]');
  const progress = $('[data-progress]');
  const heroContent = $('[data-hero-content]');
  const expand = $('[data-expand]');
  const expandFrame = $('[data-expand-frame]');
  const expandText = $('[data-expand-text]');
  const parallaxImgs = $$('[data-parallax]');
  const mobile = matchMedia('(max-width: 760px), (max-aspect-ratio: 5/4)'); // как в CSS: первый экран «стопкой»

  let lastY = scrollY;
  let hideAcc = 0;

  function frame(now) {
    if (lenis) lenis.raf(now);
    const y = scrollY;
    const vh = innerHeight;
    const dy = y - lastY;
    lastY = y;

    const max = document.documentElement.scrollHeight - vh;
    progress.style.transform = `scaleX(${max > 0 ? y / max : 0})`;

    header.classList.toggle('is-solid', y > 40);
    if (!header.classList.contains('nav-open')) {
      hideAcc = clamp(hideAcc + dy, -80, 80);
      if (y < vh * 0.6 || hideAcc < -40) header.classList.remove('is-hidden');
      else if (hideAcc > 40) header.classList.add('is-hidden');
    }

    if (!reduced) {
      // hero: кадр медленно приближается и уходит в темноту
      if (y < vh * 1.2 && !mobile.matches) {
        const p = clamp(y / vh);
        media.style.transform = `scale(${1 + p * 0.08})`;
        media.style.opacity = 1 - p * 0.65;
        heroContent.style.transform = `translateY(${p * -60}px)`;
        heroContent.style.opacity = 1 - p * 1.3;
      }

      // манифест: слова загораются по очереди
      const wr = words.getBoundingClientRect();
      const wp = clamp((vh * 0.82 - wr.top) / (wr.height + vh * 0.25));
      const lit = Math.round(wp * wordEls.length);
      wordEls.forEach((w, i) => w.classList.toggle('on', i < lit));

      // раскрытие кадра до полного экрана
      // кадр начинает расти, как только секция показалась снизу,
      // и становится полноэкранным к ~70% закреплённого участка
      const er = expand.getBoundingClientRect();
      const pinned = expand.offsetHeight - vh;
      const ep = clamp((vh - er.top) / (vh + pinned * 0.7));
      const eased = ep * ep * (3 - 2 * ep);
      expandFrame.style.setProperty('--p', eased.toFixed(4));
      const tp = clamp((-er.top / pinned - 0.5) / 0.3);
      expandText.style.opacity = tp;
      expandText.style.transform = `translateY(${(1 - tp) * 30}px)`;

      // параллакс фотографий
      parallaxImgs.forEach((img) => {
        const r = img.parentElement.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) return;
        const c = (r.top + r.height / 2 - vh / 2) / vh;
        img.style.transform = `translate3d(0, ${c * -6}%, 0)`;
      });
      updateFronts(now, vh);
    } else {
      expandFrame.style.setProperty('--p', 1);
      expandText.style.opacity = 1;
      wordEls.forEach((w) => w.classList.add('on'));
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* =========================================================
     Мелочи: меню, FAQ, год
     ========================================================= */
  const burger = $('[data-burger]');
  function closeMenu() {
    header.classList.remove('nav-open');
    burger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    lenis?.start();
  }
  burger.addEventListener('click', () => {
    const open = header.classList.toggle('nav-open');
    burger.setAttribute('aria-expanded', open);
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) lenis?.stop(); else lenis?.start();
  });

  $$('[data-acc] .acc__btn').forEach((btn) =>
    btn.addEventListener('click', () => {
      const item = btn.closest('.acc__item');
      const open = !item.classList.contains('is-open');
      item.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open);
    })
  );


  $('[data-year]').textContent = new Date().getFullYear();
})();
