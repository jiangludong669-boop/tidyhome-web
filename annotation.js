'use strict';

window.CabinetAnnotation = function (host, options) {
  const { cabinet, photoURL, save, cancel, create } = options;
  const draft = cabinet.drawers.map(drawer => ({ ...drawer, marker: drawer.marker && { ...drawer.marker } }));
  const changed = new Set();
  let nextNumber = Inventory.nextNumber(draft);
  let selected = null;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let gesture = null;
  const pointers = new Map();

  const view = create('section', 'annotation-screen');
  const header = create('header', 'toolbar annotation-toolbar');
  const exit = create('button', 'button ghost', '取消');
  const title = create('h1', 'title', '照片标注');
  const done = create('button', 'button primary', '完成');
  exit.onclick = cancel;
  done.onclick = async () => {
    done.disabled = true;
    const saved = await save(draft.filter(drawer => changed.has(drawer.id)));
    if (!saved) done.disabled = false;
  };
  header.append(exit, title, done);

  const stage = create('div', 'annotation-stage');
  const surface = create('div', 'annotation-surface');
  const image = create('img', 'annotation-image');
  image.src = photoURL;
  image.alt = '要标注的柜子照片';
  image.draggable = false;
  const marks = create('div', 'annotation-marks');
  surface.append(image, marks);
  const tools = create('div', 'zoom-tools');
  const minus = create('button', 'zoom-button', '−');
  const reset = create('button', 'zoom-button zoom-reset', '100%');
  const plus = create('button', 'zoom-button', '+');
  minus.setAttribute('aria-label', '缩小照片');
  reset.setAttribute('aria-label', '还原照片大小');
  plus.setAttribute('aria-label', '放大照片');
  tools.append(minus, reset, plus);
  stage.append(surface, tools);

  const panel = create('div', 'annotation-controls');
  const top = create('div', 'annotation-options');
  const picker = create('select', 'annotation-picker');
  picker.setAttribute('aria-label', '选择抽屉');
  const remove = create('button', 'button danger ghost', '移除标记');
  top.append(picker, remove);
  const sizeRow = create('label', 'size-row');
  const sizeText = create('span', '', '圆圈大小');
  const size = create('input', 'size-slider');
  size.type = 'range';
  size.min = '22';
  size.max = '68';
  const sizeValue = create('output', 'size-value');
  sizeRow.append(sizeText, size, sizeValue);
  const hint = create('p', 'annotation-hint');
  panel.append(top, sizeRow, hint);
  view.append(header, stage, panel);
  host.append(view);

  function drawPins() {
    const focussed = document.activeElement?.dataset.pin;
    const nodes = draft.filter(drawer => drawer.marker).map(drawer => {
      const button = create('button', 'pin annotation-pin', String(drawer.number));
      button.dataset.pin = drawer.id;
      button.setAttribute('aria-label', '选中 ' + Inventory.drawerName(drawer));
      button.setAttribute('aria-pressed', String(selected === drawer.id));
      button.classList.toggle('selected', selected === drawer.id);
      positionPin(button, drawer.marker);
      button.onclick = event => {
        if (event.detail !== 0) return;
        select(drawer.id);
      };
      return button;
    });
    marks.replaceChildren(...nodes);
    nodes.find(node => node.dataset.pin === focussed)?.focus({ preventScroll: true });
  }

  function positionPin(pin, marker) {
    pin.style.left = marker.x * 100 + '%';
    pin.style.top = marker.y * 100 + '%';
    pin.style.setProperty('--pin-size', marker.size + 'px');
  }

  function drawControls() {
    const selection = draft.find(drawer => drawer.id === selected);
    const addOption = new Option('点照片添加新抽屉', '');
    picker.replaceChildren(addOption, ...draft.map(drawer => new Option(
      String(drawer.number) + ' · ' + Inventory.drawerName(drawer) + (drawer.marker ? '' : '（待标注）'), drawer.id
    )));
    picker.value = selected ?? '';
    remove.disabled = !selection?.marker;
    size.disabled = !selection?.marker;
    size.value = selection?.marker?.size ?? 34;
    sizeValue.textContent = selection?.marker?.size ?? '—';
    hint.textContent = selection && !selection.marker
      ? '点一下照片，给选中的抽屉重新标注。'
      : '点空白处新增，拖动圆圈移动。双指缩放，放大后可拖动照片。';
  }

  function select(id) {
    selected = id;
    drawPins();
    drawControls();
  }

  picker.onchange = () => select(picker.value || null);
  remove.onclick = () => {
    const drawer = draft.find(drawer => drawer.id === selected);
    if (!drawer?.marker) return;
    drawer.marker = null;
    changed.add(drawer.id);
    select(null);
  };
  size.oninput = () => {
    const drawer = draft.find(drawer => drawer.id === selected);
    if (!drawer?.marker) return;
    drawer.marker.size = Number(size.value);
    changed.add(drawer.id);
    const pin = [...marks.children].find(node => node.dataset.pin === drawer.id);
    positionPin(pin, drawer.marker);
    sizeValue.textContent = size.value;
  };

  function fit() {
    const factor = Math.min(stage.clientWidth / cabinet.photo.width, stage.clientHeight / cabinet.photo.height);
    surface.style.width = cabinet.photo.width * factor + 'px';
    surface.style.height = cabinet.photo.height * factor + 'px';
    setTransform();
  }

  function setTransform() {
    const limitX = Math.max(0, (surface.offsetWidth * scale - stage.clientWidth) / 2);
    const limitY = Math.max(0, (surface.offsetHeight * scale - stage.clientHeight) / 2);
    offsetX = Inventory.clamp(offsetX, -limitX, limitX);
    offsetY = Inventory.clamp(offsetY, -limitY, limitY);
    surface.style.transform = 'translate(-50%, -50%) translate(' + offsetX + 'px, ' + offsetY + 'px) scale(' + scale + ')';
    surface.style.setProperty('--inverse-zoom', String(1 / scale));
    reset.textContent = Math.round(scale * 100) + '%';
    minus.disabled = scale <= 1;
    plus.disabled = scale >= 5;
  }

  function point(event) {
    const bounds = stage.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function zoom(newScale, oldAnchor, newAnchor = oldAnchor) {
    const oldScale = scale;
    scale = Inventory.clamp(newScale, 1, 5);
    const centerX = stage.clientWidth / 2;
    const centerY = stage.clientHeight / 2;
    offsetX = newAnchor.x - centerX - (oldAnchor.x - centerX - offsetX) * scale / oldScale;
    offsetY = newAnchor.y - centerY - (oldAnchor.y - centerY - offsetY) * scale / oldScale;
    setTransform();
  }

  function center() {
    return { x: stage.clientWidth / 2, y: stage.clientHeight / 2 };
  }

  function pair() {
    const [a, b] = pointers.values();
    return {
      middle: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))
    };
  }

  function photoPoint(event, clamp = false) {
    const bounds = surface.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    if (!clamp && (x < 0 || x > 1 || y < 0 || y > 1)) return null;
    return { x: Inventory.clamp(x, 0, 1), y: Inventory.clamp(y, 0, 1) };
  }

  stage.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('.zoom-tools')) return;
    stage.setPointerCapture(event.pointerId);
    const start = point(event);
    pointers.set(event.pointerId, start);
    if (pointers.size > 1) {
      gesture = { pinch: pair() };
      return;
    }
    const marker = event.target.closest('.annotation-pin');
    if (marker) select(marker.dataset.pin);
    const drawer = marker ? draft.find(drawer => drawer.id === selected) : null;
    const hit = drawer ? photoPoint(event, true) : null;
    gesture = {
      start, offsetX, offsetY, drawer,
      grabX: hit ? drawer.marker.x - hit.x : 0,
      grabY: hit ? drawer.marker.y - hit.y : 0,
      moved: false
    };
  });

  stage.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId) || !gesture) return;
    const now = point(event);
    pointers.set(event.pointerId, now);
    if (gesture.pinch) {
      if (pointers.size < 2) return;
      const next = pair();
      zoom(scale * next.distance / gesture.pinch.distance, gesture.pinch.middle, next.middle);
      gesture.pinch = next;
      return;
    }
    const dx = now.x - gesture.start.x;
    const dy = now.y - gesture.start.y;
    if (!gesture.moved && Math.hypot(dx, dy) < 5) return;
    gesture.moved = true;
    if (gesture.drawer) {
      const photo = photoPoint(event, true);
      const drawer = gesture.drawer;
      drawer.marker.x = Inventory.clamp(photo.x + gesture.grabX, 0, 1);
      drawer.marker.y = Inventory.clamp(photo.y + gesture.grabY, 0, 1);
      changed.add(drawer.id);
      const mark = [...marks.children].find(node => node.dataset.pin === drawer.id);
      positionPin(mark, drawer.marker);
      return;
    }
    offsetX = gesture.offsetX + dx;
    offsetY = gesture.offsetY + dy;
    setTransform();
  });

  function finishPointer(event, cancelled) {
    if (!pointers.delete(event.pointerId)) return;
    const finished = gesture;
    if (pointers.size === 0) gesture = null;
    if (cancelled || !finished || finished.pinch || finished.moved || finished.drawer) return;
    const photo = photoPoint(event);
    if (!photo) return;
    let drawer = draft.find(drawer => drawer.id === selected && !drawer.marker);
    if (!drawer) {
      drawer = { id: Inventory.id(), number: nextNumber++, name: '', marker: null, items: [] };
      draft.push(drawer);
    }
    drawer.marker = { ...photo, size: 34 };
    changed.add(drawer.id);
    select(drawer.id);
  }

  stage.addEventListener('pointerup', event => finishPointer(event, false));
  stage.addEventListener('pointercancel', event => finishPointer(event, true));
  stage.addEventListener('lostpointercapture', event => finishPointer(event, true));
  stage.addEventListener('wheel', event => {
    if (event.target.closest('.zoom-tools')) return;
    event.preventDefault();
    zoom(scale * Math.exp(-event.deltaY * .002), point(event));
  }, { passive: false });
  minus.onclick = () => zoom(scale / 1.35, center());
  reset.onclick = () => zoom(1, center());
  plus.onclick = () => zoom(scale * 1.35, center());
  fit();
  drawControls();
  drawPins();
  const observer = new ResizeObserver(fit);
  observer.observe(stage);
  return () => observer.disconnect();
};
