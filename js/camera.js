/* ═══════════════════════════════════════
   camera.js — Камера, галерея, фото
   Nodly
════════════════════════════════════════ */

const Camera = (() => {

  let _currentNodeId = null;
  let _stream        = null;
  let _cropSrc = null;
  let _cropZoom = 1;
  let _cropX = 0;
  let _cropY = 0;
  let _cropDrag = null;
  let _pendingOriginal = null; // оригінал до кропу, зберігається до Nodes.setPhoto

  const videoEl   = document.getElementById('camera-video');
  const canvasEl  = document.getElementById('camera-canvas');
  const previewEl = document.getElementById('photo-preview');
  const previewImg= document.getElementById('photo-preview-img');
  const actionsEl = document.getElementById('photo-actions');
  const cameraEl  = document.getElementById('camera-view');
  const galleryInput = document.getElementById('gallery-input');

  /* ── Відкрити модалку фото ── */
  function openModal(nodeId) {
    _currentNodeId = nodeId;
    _reset();

    const n = State.getNode(nodeId);
    if (n?.photo) {
      _showPreview(n.photo);
    }

    // Показуємо кнопку Перекадрувати тільки якщо є оригінал
    const recropBtn = document.getElementById('btn-recrop');
    if (recropBtn) recropBtn.hidden = !(n?.originalPhoto);

    Modal.open('modal-photo');
  }

  /* ── Скинути стан модалки ── */
  function _reset() {
    stopCamera();
    actionsEl.hidden  = false;
    cameraEl.hidden   = true;
    previewEl.hidden  = true;
    previewImg.src    = '';
  }

  /* ── Показати прев'ю фото ── */
  function _showPreview(src) {
    actionsEl.hidden  = true;
    cameraEl.hidden   = true;
    previewEl.hidden  = false;
    previewImg.src    = src;
  }

  /* ══════════════════════════════════════
     КАМЕРА
  ══════════════════════════════════════ */

  async function openCamera() {
    try {
      _stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      videoEl.srcObject = _stream;
      actionsEl.hidden  = true;
      cameraEl.hidden   = false;
      previewEl.hidden  = true;
    } catch (err) {
      console.error('[Camera] Помилка доступу до камери:', err);
      alert('Не вдалося отримати доступ до камери. Перевірте дозволи браузера.');
    }
  }

  function stopCamera() {
    if (_stream) {
      _stream.getTracks().forEach(t => t.stop());
      _stream = null;
    }
    videoEl.srcObject = null;
  }

  /* ── Зняти фото з відео ── */
  function capture() {
    if (!_stream) return;

    const w = videoEl.videoWidth;
    const h = videoEl.videoHeight;
    canvasEl.width  = w;
    canvasEl.height = h;

    const ctx = canvasEl.getContext('2d');
    ctx.drawImage(videoEl, 0, 0, w, h);

    const base64 = canvasEl.toDataURL('image/jpeg', 0.92);
    stopCamera();
    _openCrop(base64);
  }

  /* ══════════════════════════════════════
     ГАЛЕРЕЯ
  ══════════════════════════════════════ */

  function openGallery() {
    galleryInput.value = '';
    galleryInput.click();
  }

  function onGallerySelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      _openCrop(ev.target.result);
    };
    reader.readAsDataURL(file);
  }

  /* ══════════════════════════════════════
     ДІЇ З ФОТО
  ══════════════════════════════════════ */

  function replacePhoto() {
    _reset();
  }

  function removePhoto() {
    if (!_currentNodeId) return;
    Nodes.removePhoto(_currentNodeId);
    Modal.close('modal-photo');
  }

  /* ── Зберегти фото до вузла і закрити модалку ── */
  function savePhoto() {
    if (!_currentNodeId || !previewImg.src) return;
    // Передаємо оригінал тільки якщо він був установлений під час кропу
    const orig = _pendingOriginal !== null ? _pendingOriginal : undefined;
    Nodes.setPhoto(_currentNodeId, previewImg.src, orig);
    _pendingOriginal = null;
    Modal.close('modal-photo');
  }

  function recropPhoto() {
    if (!_currentNodeId) return;
    const n = State.getNode(_currentNodeId);
    if (!n?.originalPhoto) return;
    // НЕ закриваємо modal-photo — після applyCrop превʼю покажеться в ньому ж
    _openCrop(n.originalPhoto);
  }

  function openFullPhoto() {
    if (!previewImg.src) return;
    const w = window.open();
    if (w) {
      w.document.write(`<img src="${previewImg.src}" style="max-width:100%;height:auto;display:block;margin:auto;"/>`);
      w.document.title = 'Фото';
    }
  }


  function _openCrop(src) {
    _pendingOriginal = src; // зберігаємо оригінал для повторного кропу
    _cropSrc = src;
    _cropZoom = 1;
    _cropX = 0;
    _cropY = 0;
    const img  = document.getElementById('crop-img');
    const zoom = document.getElementById('crop-zoom');
    const box  = document.getElementById('crop-box');
    if (img) {
      img.onload = () => {
        const bw = box ? box.clientWidth  : 320;
        const bh = box ? box.clientHeight : 320;
        // Розрахунок масштабу щоб зображення повністю покрило рамку
        _cropZoom = Math.max(bw / img.naturalWidth, bh / img.naturalHeight);
        _cropX = 0;
        _cropY = 0;
        if (zoom) {
          zoom.min   = String(_cropZoom);
          zoom.max   = String(_cropZoom * 4);
          zoom.step  = String(_cropZoom * 0.05);
          zoom.value = String(_cropZoom);
        }
        _updateCropTransform();
      };
      img.src = src;
    }
    Modal.open('modal-crop');
    if (box && !box.dataset.bound) {
      box.dataset.bound = '1';
      box.addEventListener('pointerdown', _cropPointerDown);
      document.addEventListener('pointermove', _cropPointerMove);
      document.addEventListener('pointerup', _cropPointerUp);
      document.addEventListener('pointercancel', _cropPointerUp);
    }
  }

  function setCropZoom(v) {
    _cropZoom = Number(v) || 1;
    _updateCropTransform();
  }

  function _cropPointerDown(e) {
    if (!_cropSrc) return;
    e.preventDefault();
    _cropDrag = { sx: e.clientX, sy: e.clientY, x: _cropX, y: _cropY };
  }

  function _cropPointerMove(e) {
    if (!_cropDrag) return;
    _cropX = _cropDrag.x + e.clientX - _cropDrag.sx;
    _cropY = _cropDrag.y + e.clientY - _cropDrag.sy;
    _updateCropTransform();
  }

  function _cropPointerUp() {
    _cropDrag = null;
  }

  function _updateCropTransform() {
    const img = document.getElementById('crop-img');
    // top:50% left:50% в CSS — додаємо -50% щоб центрувати, потім зсув та масштаб
    if (img) img.style.transform = `translate(calc(-50% + ${_cropX}px), calc(-50% + ${_cropY}px)) scale(${_cropZoom})`;
  }

  function cancelCrop() {
    Modal.close('modal-crop');
    _cropSrc = null;
    _cropDrag = null;
  }

  function applyCrop() {
    if (!_cropSrc) return;
    const cropImgEl = document.getElementById('crop-img');
    const box       = document.getElementById('crop-box');
    if (!cropImgEl || !box) return;

    // Розміри DOM без CSS-трансформу (layout-розміри зображення до scale)
    const imgLayoutW = cropImgEl.offsetWidth;
    const imgLayoutH = cropImgEl.offsetHeight;
    const bw         = box.clientWidth;
    const bh         = box.clientHeight;

    const img = new Image();
    img.onload = () => {
      const natW = img.naturalWidth;
      const natH = img.naturalHeight;

      // Співвідношення layout → natural
      const toNatX = natW / imgLayoutW;
      const toNatY = natH / imgLayoutH;

      // Центр зображення (CSS: top:50%+left:50% + translate-offset) в коорд. box
      // після translate(-50%+_cropX, -50%+_cropY) scale(_cropZoom, transform-origin: 50% 50%)
      // Центр зображення в box-коорд: (bw/2 + _cropX, bh/2 + _cropY)
      // Верхній лівий кут зображення: center_x - scaled_w/2
      const dispImgLeft = bw/2 + _cropX - (imgLayoutW * _cropZoom) / 2;
      const dispImgTop  = bh/2 + _cropY - (imgLayoutH * _cropZoom) / 2;

      // Початок рамки (box починається з 0,0) в display-коорд. зображення
      const cropDispX = -dispImgLeft;
      const cropDispY = -dispImgTop;

      // Переведення у layout-коорд (ділимо на _cropZoom)
      const sx_layout = cropDispX / _cropZoom;
      const sy_layout = cropDispY / _cropZoom;
      const sw_layout = bw        / _cropZoom;
      const sh_layout = bh        / _cropZoom;

      // Переведення у natural-пікселі
      let sx = sx_layout * toNatX;
      let sy = sy_layout * toNatY;
      let sw = sw_layout * toNatX;
      let sh = sh_layout * toNatY;

      // Обрізання
      sx = Math.max(0, sx);
      sy = Math.max(0, sy);
      if (sx + sw > natW) sw = natW - sx;
      if (sy + sh > natH) sh = natH - sy;

      const c = document.createElement('canvas');
      c.width = 1200; c.height = 1200;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 1200, 1200);
      Modal.close('modal-crop');
      _showPreview(c.toDataURL('image/jpeg', 0.92));
      _cropSrc = null;
      _cropDrag = null;
    };
    img.src = _cropSrc;
  }

  /* ── Стиснути фото (для оптимізованого експорту) ── */
  function compress(base64, quality = 0.7, maxWidth = 800) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }

        const c   = document.createElement('canvas');
        c.width   = w;
        c.height  = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.src = base64;
    });
  }

  /* ── Закрити камеру при закритті модалки ── */
  document.getElementById('modal-photo')
    .querySelector('.modal-backdrop')
    .addEventListener('click', stopCamera);

  /* ── Публічний API ── */
  return {
    openModal,
    openCamera, stopCamera, capture,
    openGallery, onGallerySelect,
    replacePhoto, removePhoto, savePhoto, openFullPhoto, recropPhoto,
    setCropZoom, cancelCrop, applyCrop,
    compress,
  };

})();
