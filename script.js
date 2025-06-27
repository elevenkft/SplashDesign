// script.js
document.addEventListener('DOMContentLoaded', () => {

/**
 * Visszaadja a vászon belső (pixel) koordinátáit
 * a képernyő-eseményobjektumból.
 */
function getCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();     // a CSS-es mérethez
  const rawX = e.clientX - rect.left;               // egérpozíció a tartományon belül
  const rawY = e.clientY - rect.top;
  const scaleX = canvas.width  / rect.width;        // belső px / CSS px
  const scaleY = canvas.height / rect.height;
  return {
    x: Math.round(rawX * scaleX),                   // belső vászon-px
    y: Math.round(rawY * scaleY)
  };
}

  // === Kategóriák szerinti sidebar felépítése ===
  (function() {
    const productList = document.getElementById('product-list');
    const items = Array.from(productList.querySelectorAll('.product-item'));
    const categories = {};
    items.forEach(item => {
      const cat = item.getAttribute('data-category') || 'Egyéb';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(item);
    });
    productList.innerHTML = '';
    Object.entries(categories).forEach(([cat, elems]) => {
      const details = document.createElement('details');
      details.className = 'product-category';
      details.open = false;
      const summary = document.createElement('summary');
      summary.textContent = cat;
      details.appendChild(summary);
      elems.forEach(el => details.appendChild(el));
      productList.appendChild(details);
    });
  })();

  // ───────────────
  // 0. Globális változók
  // ───────────────
  let clickCount = 0;
  let firstPoint = null;
  let secondPoint = null;
  let img = new Image();
  let imgLoaded = false;
  let pxPerCm = 0;
  let isCalibrated = false;
  const placedItems = [];
  let selectedItemIndex = null;
  let isDraggingItem = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  const canvas = document.getElementById('plan-canvas');
  const ctx = canvas.getContext('2d');
  const pixelDistanceSpan = document.getElementById('pixel-distance');
  const realDistanceInput = document.getElementById('real-distance');
  const computeScaleButton = document.getElementById('compute-scale');
  const pxPerCmSpan = document.getElementById('px-per-cm');
  const productItems = document.querySelectorAll('.product-item');
  const rotateBtn = document.getElementById('rotate-btn');
  const deleteBtn = document.getElementById('delete-btn');
  const exportPdfButton = document.getElementById('export-pdf');

  // 1. FÁJLFELTÖLTÉS + KÉP MEGJELENÍTÉS
const fileInput = document.getElementById('file-input');
fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;

  const type = file.type;
  const reader = new FileReader();

  if (type.startsWith('image/')) {
    // ––– Kép betöltése –––
    reader.onload = evt => {
      img = new window.Image();
      img.crossOrigin = "anonymous"; // <-- FONTOS: cross-origin beállítás
      img.onload = () => {
        imgLoaded = true;
        isCalibrated = false;
        clickCount = 0;
        firstPoint = null;
        secondPoint = null;
        // canvas méretek beállítása
        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;
        // gombok engedélyezése
        rotateBtn.disabled = false;
        deleteBtn.disabled = false;
        redrawAll();
      };
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);

  } else if (type === 'application/pdf') {
    reader.onload = evt => {
      const arrayBuffer = evt.target.result;
      pdfjsLib.getDocument({ data: arrayBuffer }).promise
        .then(pdf => pdf.getPage(1))
        .then(page => {
          const viewport = page.getViewport({ scale: 1 });
          canvas.width  = viewport.width;
          canvas.height = viewport.height;
          return page.render({
            canvasContext: ctx,
            viewport: viewport
          }).promise;
        })
        .then(() => {
          // PDF egyszer kirajzolva a canvasra: most átkonvertáljuk képpé
          const dataURL = canvas.toDataURL('image/png');
          img.onload = () => {
            // innen már az img tartalommal dolgozunk tovább
            imgLoaded = true;
            isCalibrated = false;
            clickCount = 0;
            firstPoint = null;
            secondPoint = null;
            rotateBtn.disabled = false;
            deleteBtn.disabled = false;
            redrawAll();
          };
          img.src = dataURL;
        })
        .catch(err => {
          console.error('PDF betöltési hiba:', err);
          alert('Hiba a PDF betöltésekor');
        });
    };
    reader.readAsArrayBuffer(file);

  } else {
    alert('Csak kép- (PNG/JPG) vagy PDF-fájlokat tölthetsz fel.');
  }
});


  // 2. KALIBRÁCIÓ
  canvas.addEventListener('click', e => {
    if (!imgLoaded || isCalibrated) return;
      const { x, y } = getCanvasCoords(e);
    if (clickCount === 0) {
      firstPoint = { x, y };
      clickCount++;
      redrawAll();
      drawMarker(x, y, 'red');
    } else {
      secondPoint = { x, y };
      clickCount = 0;
      redrawAll();
      drawMarker(firstPoint.x, firstPoint.y, 'red');
      drawMarker(secondPoint.x, secondPoint.y, 'red');
      drawLineBetweenPoints(firstPoint, secondPoint, 'red');
      const dx = secondPoint.x - firstPoint.x;
      const dy = secondPoint.y - firstPoint.y;
      pixelDistanceSpan.textContent = Math.round(Math.hypot(dx, dy));
    }
  });

  computeScaleButton.addEventListener('click', () => {
    if (isCalibrated) return;
    const pixelDistance = parseInt(pixelDistanceSpan.textContent, 10);
    const realCm = parseFloat(realDistanceInput.value);
    if (!pixelDistance || isNaN(realCm) || realCm <= 0) {
      alert('Kérlek, jelölj ki két pontot, és adj meg egy pozitív valós távolságot cm-ben!');
      return;
    }
    pxPerCm = pixelDistance / realCm;
    pxPerCmSpan.textContent = pxPerCm.toFixed(3);
    isCalibrated = true;
    firstPoint = null;
    secondPoint = null;
    pixelDistanceSpan.textContent = '0';
    redrawAll();
  });

  // 3. DRAG & DROP
  productItems.forEach(item => {
    item.addEventListener('dragstart', ev => {
      const payload = JSON.stringify({
        name: item.dataset.name,
        slug: item.dataset.slug,
        widthCm: +item.dataset.widthCm,
        heightCm: +item.dataset.heightCm,
        price: +item.dataset.price
      });
      ev.dataTransfer.setData('application/json', payload);
      ev.dataTransfer.effectAllowed = 'copy';
    });
  });

  canvas.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  canvas.addEventListener('drop', async e => {
    e.preventDefault();
    if (!imgLoaded || !isCalibrated) return;
    const data = e.dataTransfer.getData('application/json');
    if (!data) return;
    const { name, slug, widthCm, heightCm, price } = JSON.parse(data);

    // ÚJ: Variánsok kezelése
    // Megkeressük az eredeti DOM elemet, hogy kiolvassuk a data-variants attribútumot
    const productEl = Array.from(document.querySelectorAll('.product-item')).find(
      el => el.dataset.name === name && el.dataset.slug === slug
    );
    let finalName = name;
    let finalPrice = price;

    if (productEl && productEl.dataset.variants) {
      // Több kivitel van, felugró ablakot mutatunk
      let variants;
      try {
        variants = JSON.parse(productEl.dataset.variants);
      } catch {
        variants = [];
      }
      if (variants.length > 0) {
        // Felugró ablak készítése
        finalPrice = await showVariantDialog(name, variants);
        if (finalPrice === null) return; // Mégsem gomb
        // A névhez hozzáfűzzük a kivitel nevét
        const selectedVariant = variants.find(v => v.price === finalPrice);
        if (selectedVariant) finalName = `${name} (${selectedVariant.label})`;
      }
    }

    const { x: dropX, y: dropY } = getCanvasCoords(e);
    const wPx = Math.round(widthCm * pxPerCm);
    const hPx = Math.round(heightCm * pxPerCm);
    placedItems.push({
      name: finalName,
      slug,
      x: dropX - wPx/2,
      y: dropY - hPx/2,
      origWidthPx: wPx,
      origHeightPx: hPx,
      angle: 0,
      unitPrice: finalPrice,
      image: null,
      imageLoaded: false
    });
    redrawAll();
    updateQuoteTable();
  });

  // ÚJ: Variáns választó felugró ablak
  function showVariantDialog(productName, variants) {
    return new Promise(resolve => {
      // Létrehozunk egy modális ablakot
      const modal = document.createElement('div');
      modal.style.position = 'fixed';
      modal.style.left = 0;
      modal.style.top = 0;
      modal.style.width = '100vw';
      modal.style.height = '100vh';
      modal.style.background = 'rgba(0,0,0,0.3)';
      modal.style.display = 'flex';
      modal.style.alignItems = 'center';
      modal.style.justifyContent = 'center';
      modal.style.zIndex = 9999;

      const box = document.createElement('div');
      box.style.background = '#fff';
      box.style.padding = '2rem';
      box.style.borderRadius = '8px';
      box.style.boxShadow = '0 2px 12px rgba(0,0,0,0.2)';
      box.style.minWidth = '260px';
      box.style.textAlign = 'center';

      const title = document.createElement('h3');
      title.textContent = `${productName} – kivitel választása`;
      title.style.marginTop = '0';
      box.appendChild(title);

      variants.forEach(variant => {
        const btn = document.createElement('button');
        btn.textContent = `${variant.label} – ${variant.price.toLocaleString()} Ft`;
        btn.className = 'button';
        btn.style.margin = '0.5rem 0';
        btn.onclick = () => {
          document.body.removeChild(modal);
          resolve(variant.price);
        };
        box.appendChild(btn);
        box.appendChild(document.createElement('br'));
      });

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Mégsem';
      cancelBtn.className = 'button';
      cancelBtn.style.background = '#aaa';
      cancelBtn.onclick = () => {
        document.body.removeChild(modal);
        resolve(null);
      };
      box.appendChild(cancelBtn);

      modal.appendChild(box);
      document.body.appendChild(modal);
    });
  }

  // 4. KIJELÖLÉS, MOZGATÁS
canvas.addEventListener('mousedown', e => {
  if (!imgLoaded || !isCalibrated) return;
      const { x, y } = getCanvasCoords(e);
    selectedItemIndex = null;
    for (let i = placedItems.length - 1; i >= 0; i--) {
      if (pointInRotatedRect(x, y, placedItems[i])) {
        selectedItemIndex = i;
        const [bw, bh] = getCurrentDims(placedItems[i]);
        dragOffsetX = x - placedItems[i].x;
        dragOffsetY = y - placedItems[i].y;
        isDraggingItem = true;
        break;
      }
    }
    rotateBtn.disabled = selectedItemIndex === null;
    deleteBtn.disabled = selectedItemIndex === null;
    redrawAll();
  });

  canvas.addEventListener('mousemove', e => {
    if (!isDraggingItem || selectedItemIndex === null) return;
    const { x, y } = getCanvasCoords(e);
    const it = placedItems[selectedItemIndex];
    it.x = x - dragOffsetX;
    it.y = y - dragOffsetY;
    redrawAll();
  });

  canvas.addEventListener('mouseup', () => { isDraggingItem = false; });
  canvas.addEventListener('mouseleave', () => { isDraggingItem = false; });

  // 5. FORGATÁS ÉS TÖRLÉS
  rotateBtn.addEventListener('click', () => {
    if (selectedItemIndex === null) return;
    const it = placedItems[selectedItemIndex];
    const [bw, bh] = getCurrentDims(it);
    const cx = it.x + bw/2, cy = it.y + bh/2;
    it.angle = (it.angle + 45) % 360;
    const [newBW, newBH] = getCurrentDims(it);
    it.x = cx - newBW/2;
    it.y = cy - newBH/2;
    redrawAll();
  });

  deleteBtn.addEventListener('click', () => {
    if (selectedItemIndex === null) return;
    placedItems.splice(selectedItemIndex, 1);
    selectedItemIndex = null;
    rotateBtn.disabled = true;
    deleteBtn.disabled = true;
    redrawAll();
    updateQuoteTable();
  });

  // 6. RAJZOLÓ SEGÉDFÜGGVÉNYEK
  function redrawAll() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if (imgLoaded) ctx.drawImage(img, 0,0);
    if (firstPoint) drawMarker(firstPoint.x, firstPoint.y, 'red');
    if (secondPoint) {
      drawMarker(secondPoint.x, secondPoint.y, 'red');
      drawLineBetweenPoints(firstPoint, secondPoint, 'red');
    }
    placedItems.forEach((item, idx) => {
      drawProductImage(item, idx === selectedItemIndex);
    });
  }

  function drawMarker(x, y, color) {
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, 2*Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.closePath();
  }

  function drawLineBetweenPoints(p1, p2, color) {
    ctx.beginPath();
    ctx.moveTo(p1.x,p1.y);
    ctx.lineTo(p2.x,p2.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.closePath();
  }

  function getCurrentDims(item) {
    const a = item.angle % 180;
    if (a === 0) return [item.origWidthPx, item.origHeightPx];
    if (a === 90) return [item.origHeightPx, item.origWidthPx];
    const rad = a * Math.PI/180;
    const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
    const w = item.origWidthPx * cos + item.origHeightPx * sin;
    const h = item.origWidthPx * sin + item.origHeightPx * cos;
    return [w,h];
  }

  function drawProductImage(item, isSelected) {
    // Ha még nincs betöltve a kép, töltsük be
    if (!item.image) {
      item.image = new window.Image();
      item.image.src = `topviews/${item.slug}.png`;
      item.image.onload = () => {
        item.imageLoaded = true;
        redrawAll();
      };
      item.image.onerror = () => {
        item.imageLoaded = false;
      };
    }
    // Ha a kép még nem töltődött be, ne rajzoljunk semmit
    if (!item.imageLoaded) return;

    const [bw, bh] = getCurrentDims(item);
    const cx = item.x + bw/2, cy = item.y + bh/2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(item.angle * Math.PI / 180);
    ctx.drawImage(item.image, -item.origWidthPx/2, -item.origHeightPx/2, item.origWidthPx, item.origHeightPx);
    // Keret, ha kijelölt
    if (isSelected) {
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 3;
      ctx.strokeRect(-item.origWidthPx/2, -item.origHeightPx/2, item.origWidthPx, item.origHeightPx);
    }
    ctx.restore();
  }

  function pointInRotatedRect(px,py,item) {
    const [bw,bh] = getCurrentDims(item);
    const cx = item.x + bw/2, cy = item.y + bh/2;
    const dx = px-cx, dy = py-cy;
    const rad = -item.angle*Math.PI/180;
    const lx = dx*Math.cos(rad) - dy*Math.sin(rad);
    const ly = dx*Math.sin(rad) + dy*Math.cos(rad);
    return lx>=-item.origWidthPx/2 && lx<=item.origWidthPx/2 &&
           ly>=-item.origHeightPx/2 && ly<=item.origHeightPx/2;
  }

  // 7. ÁRAJÁNLAT-FRISSÍTŐ
  function updateQuoteTable() {
    const tbody = document.querySelector('#quote-table tbody');
    tbody.innerHTML = '';
    const summary = {};
    placedItems.forEach(item => {
      if (!summary[item.name]) summary[item.name] = { count:0, unitPrice:item.unitPrice };
      summary[item.name].count++;
    });
    let total = 0;
    for (const [name,data] of Object.entries(summary)) {
      const subtotal = data.count * data.unitPrice;
      total += subtotal;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${name}</td>
        <td style="text-align:center;">${data.count}</td>
        <td style="text-align:right;">${data.unitPrice.toLocaleString()} Ft</td>
        <td style="text-align:right;">${subtotal.toLocaleString()} Ft</td>
      `;
      tbody.appendChild(tr);
    }
    document.getElementById('quote-total').textContent = total.toLocaleString() + ' Ft';
  }

  // 8. PDF EXPORT (html2pdf.js)
exportPdfButton.addEventListener('click', () => {
  if (!imgLoaded || !isCalibrated) {
    alert('Előbb töltsd fel az alaprajzot és kalibráld a képet!');
    return;
  }

  let planDataUrl;
  const prevSelected = selectedItemIndex;
  selectedItemIndex = null;
  redrawAll(); // <-- Itt kell először újrarajzolni kijelölés nélkül

  try {
    planDataUrl = canvas.toDataURL('image/png');
  } catch (e) {
    alert('A PDF exportálás nem lehetséges, mert az alaprajz képét a böngésző biztonsági korlátozásai miatt nem lehet exportálni (tainted canvas). Csak helyi gépről feltöltött képekkel működik, vagy próbáld meg más böngészővel.');
    // Visszaállítás, ha hiba van
    selectedItemIndex = prevSelected;
    redrawAll();
    return;
  }

  const pdfContainer = document.createElement('div');
  pdfContainer.style.padding = '20px';
  pdfContainer.style.fontFamily = "'Noto Sans', sans-serif";

  // ——— 1. Címsor és szöveg ———
  const title = document.createElement('h1');
  title.textContent = 'Eleven Kft. előzetes árajánlat';
  title.className = 'pdf-title';
  pdfContainer.appendChild(title);

  const disclaimer = document.createElement('p');
  disclaimer.textContent = 'Az alábbi árajánlat és elrendezési rajz csak tájékoztató jellegű. Kérjük, vegye fel a kapcsolatot munkatársainkkal a végleges tartalomért.';
  disclaimer.className = 'pdf-disclaimer';
  pdfContainer.appendChild(disclaimer);

  // ——— 2. Alaprajz kép formájában ———
  const planImg = new Image();
  planImg.src = planDataUrl;
  planImg.style.width = '100%';
  planImg.style.display = 'block';
  planImg.style.marginBottom = '1rem';
  pdfContainer.appendChild(planImg);

  // ——— 3. Oldaltörés az árajánlat elé ———
  const pageBreak = document.createElement('div');
  pageBreak.className = 'html2pdf__page-break'; 
  pdfContainer.appendChild(pageBreak);

  // ——— 4. Árajánlat és lábléc egy oldalon ———
  const quoteSection = document.createElement('div');
  const quoteHeading = document.createElement('h2');
  quoteHeading.textContent = 'Árajánlat';
  quoteHeading.style.color = '#72af42';
  quoteHeading.style.textAlign = 'center';
  quoteHeading.style.marginBottom = '0.5rem';
  quoteSection.appendChild(quoteHeading);

  const quoteTable = document.getElementById('quote-table').cloneNode(true);
  quoteTable.style.width = '100%';
  quoteTable.style.borderCollapse = 'collapse';
  quoteSection.appendChild(quoteTable);

  // lábléc
  const footer = document.createElement('p');
  footer.textContent = 'Eleven Kft. | www.aqua-parks.com | info@eleven11.hu | +36 1 436 9113';
  footer.className = 'pdf-footer';

  // quoteSection után jön a footer, mindketten egy oldalon
  pdfContainer.appendChild(quoteSection);
  pdfContainer.appendChild(footer);

  // ——— 5. PDF generálása ———
  const opt = {
    margin:       [10,10,10,10],      
    filename:     'Eleven_Kft_arajanlat.pdf',
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2 },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };
  html2pdf().set(opt).from(pdfContainer).save();

  // Visszaállítás export után
  selectedItemIndex = prevSelected;
  redrawAll();
});

});