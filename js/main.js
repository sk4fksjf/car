(() => {
  'use strict';

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
      model: 'Mercedes-Benz S-Class', version: 'S 450 4MATIC Long', short: 'S-Class',
      spec: '3.0 л · 367 л.с. · 0–100 км/ч за 5,1 с',
      tariff: { min: 49, wait: 12, h1: 2690, h3: 6990, d1: 15900 },
    },
    {
      model: 'BMW 7 Series', version: '740Li xDrive', short: '7 Series',
      spec: '3.0 л · 380 л.с. · 0–100 км/ч за 5,4 с',
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
  if (window.Lenis && !reduced) {
    lenis = new window.Lenis({ lerp: 0.085, wheelMultiplier: 0.9 });
  }
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
     HERO: по стрелке машина уезжает, приезжает следующая
     ========================================================= */
  const btnNext = $('[data-next]');
  const ring = $('[data-ring]');
  const RING_LEN = 308;
  const modelEl = $('.hero__model');
  let cur = 0;
  let busy = false;

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
      strips.push({ from, to, i });
      return `<span class="odo__col" aria-hidden="true"><span class="odo__strip" style="transform:translateY(${-from * 5}%)">${STRIP}</span></span>`;
    }).join('');
    if (!animate || reduced) {
      $$('.odo__strip', el).forEach((s, k) => (s.style.transform = `translateY(${-(strips[k].to % 10) * 5}%)`));
      return;
    }
    const els = $$('.odo__strip', el);
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
  const odoSpec = $('[data-car-spec]');
  const odoPrice = $('[data-car-price]');
  const odoCount = $('[data-count]');
  [odoSpec, odoPrice, odoCount].forEach((el) => odo(el, el.textContent, false));

  function renderInfo(i) {
    const c = CARS[i];
    $('[data-car-model]').textContent = c.model;
    $('[data-car-version]').textContent = c.version;
    odo(odoSpec, c.spec);
    odo(odoPrice, String(c.tariff.min));
    odo(odoCount, pad(i + 1));
  }

  const fade = (els, out) =>
    els.forEach((el, k) =>
      el.animate(
        out
          ? [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-10px)' }]
          : [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }],
        { duration: out ? 600 : 1000, delay: k * 90, easing: 'cubic-bezier(.2,.75,.15,1)', fill: 'forwards' }
      )
    );

  // готовим ролик: ставим на кадр, где машина ещё стоит
  function cue(clip) {
    return new Promise((resolve) => {
      const v = clip.el;
      const seek = () => {
        if (Math.abs(v.currentTime - clip.from) < 0.05) return resolve();
        v.addEventListener('seeked', resolve, { once: true });
        v.currentTime = clip.from;
      };
      if (v.readyState >= 1) seek();
      else v.addEventListener('loadedmetadata', seek, { once: true });
      setTimeout(resolve, 2500);
    });
  }
  CLIPS.forEach(cue);

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
      const check = () => {
        if (done) return;
        const t = v.currentTime;
        setRing((t - clip.from) / (clip.to - clip.from));
        if (!swapped && t >= clip.swap) {
          swapped = true;
          renderInfo(nextIndex);
          fade([modelEl]);
        }
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
      const finish = () => {
        if (done) return;
        done = true;
        playingEl = null;
        v.pause();
        v.removeEventListener('timeupdate', check);
        v.removeEventListener('error', finish);
        clearInterval(watchdog);
        clearTimeout(fallback);
        if (!swapped) { renderInfo(nextIndex); fade([modelEl]); }
        resolve();
      };
      // timeupdate — подстраховка для фоновой вкладки, где rAF засыпает
      v.addEventListener('timeupdate', check);
      v.addEventListener('error', finish);
      // браузер приостановил ролик в фоне — на видимой вкладке доигрываем
      const watchdog = setInterval(() => {
        if (!done && v.paused && document.visibilityState === 'visible') v.play().catch(() => {});
      }, 700);
      // крайний случай: видео так и не смогло доиграть
      const fallback = setTimeout(finish, 30000);
      playingEl = v;
      v.playbackRate = RATE;
      v.play().catch(() => {});
      requestAnimationFrame(loop);
    });
  }

  // где внутри <video> лежит сам кадр (object-fit: cover + object-position)
  function frameBox(v) {
    const bw = v.clientWidth, bh = v.clientHeight;
    const vw = v.videoWidth || 1920, vh = v.videoHeight || 1080;
    const k = Math.max(bw / vw, bh / vh);
    const W = vw * k, H = vh * k;
    const [px, py] = getComputedStyle(v).objectPosition.split(' ').map((s) => parseFloat(s) / 100);
    return { W, H, ox: (bw - W) * px, oy: (bh - H) * py };
  }

  // у обоих роликов одна точка масштабирования — центр кадра,
  // тогда запас scale: 1.03 одинаков и кадры остаются совмещёнными
  function setOrigins() {
    CLIPS.forEach(({ el }) => {
      const { W, H, ox, oy } = frameBox(el);
      el.style.transformOrigin = `${(ox + W / 2).toFixed(1)}px ${(oy + H / 2).toFixed(1)}px`;
    });
  }
  CLIPS.forEach(({ el }) => el.addEventListener('loadedmetadata', setOrigins));
  addEventListener('resize', setOrigins);
  setOrigins();

  // показываем ролик, поставленный на стартовый кадр.
  // seam — склейка с предыдущим: подгоняем кадр под него и коротко растворяем
  async function show(clip, seam) {
    if (clip.el.classList.contains('is-active')) return;
    await cue(clip);
    const v = clip.el;
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

  async function next() {
    if (busy) return;
    busy = true;
    btnNext.classList.add('is-busy');
    ring.classList.remove('is-reset');

    const nextIndex = (cur + 1) % CARS.length;
    const clip = CLIPS[cur];
    const following = CLIPS[nextIndex];

    fade([modelEl], true);

    if (reduced) {
      renderInfo(nextIndex);
      fade([modelEl]);
      await show(following, false);
    } else {
      // на экране стоит на паузе предыдущий ролик с этой же машиной —
      // подставляем нужный, подогнав его кадр, и сразу запускаем
      await show(clip, true);
      await play(clip, nextIndex);
      // машина остановилась — ролик просто стоит на паузе на последнем кадре,
      // а следующий заранее готовим в фоне
      cue(following);
    }

    ring.classList.add('is-reset');
    setRing(0);

    cur = nextIndex;
    busy = false;
    btnNext.classList.remove('is-busy');
  }

  btnNext.addEventListener('click', next);

  const hero = $('[data-hero]');
  let heroVisible = true;
  new IntersectionObserver(([e]) => (heroVisible = e.isIntersecting)).observe(hero);
  addEventListener('keydown', (e) => {
    if (heroVisible && e.key === 'ArrowRight' && !e.target.closest('input, textarea')) next();
  });

  // свайп влево по кадру
  const media = $('[data-hero-media]');
  let sx = null;
  media.addEventListener('pointerdown', (e) => (sx = e.clientX));
  media.addEventListener('pointerup', (e) => {
    if (sx !== null && sx - e.clientX > 50) next();
    sx = null;
  });

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

  // телефон: шаги листаются свайпом, экран телефона меняется вслед
  const stepOffset = (i) => steps[i].offsetLeft - steps[0].offsetLeft;
  stepsList.addEventListener('scroll', () => {
    if (!howMobile.matches) return;
    const x = stepsList.scrollLeft;
    let best = 0;
    steps.forEach((_, k) => {
      if (Math.abs(stepOffset(k) - x) < Math.abs(stepOffset(best) - x)) best = k;
    });
    setStep(best);
  }, { passive: true });
  stepDots.forEach((d, i) => d.addEventListener('click', () => {
    stepsList.scrollTo({ left: stepOffset(i), behavior: reduced ? 'auto' : 'smooth' });
    setStep(i);
  }));
  // тап по шагу тоже переключает экран
  steps.forEach((s, i) => s.addEventListener('click', () => {
    if (howMobile.matches) stepDots[i].click();
  }));

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
  const mobile = matchMedia('(max-width: 760px)');

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
    } else {
      expandFrame.style.setProperty('--p', 1);
      expandText.style.opacity = 1;
      wordEls.forEach((w) => w.classList.add('on'));
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* =========================================================
     Мелочи: меню, FAQ, промокод, год
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

  const promoStatus = $('[data-promo-status]');
  $('[data-promo]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('ХОД30');
      promoStatus.textContent = 'Скопировано';
    } catch {
      promoStatus.textContent = 'ХОД30';
    }
    setTimeout(() => (promoStatus.textContent = 'Скопировать'), 1800);
  });

  $('[data-year]').textContent = new Date().getFullYear();
})();
