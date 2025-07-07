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

// === Kategóriák szerinti sidebar felépítése (csak egyszer, nem nyelvfüggő!) ===
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
    summary.setAttribute('data-category', cat); // fontos a későbbi fordításhoz
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

  // ──────────────────────────────────────────────
  // 0. NYELV ÉS JELSZÓ MODAL + FORDÍTÁSOK
  // ──────────────────────────────────────────────
  const translations = {
    hu: {
      modal_title: "A program használatához kérlek, add meg a jelszót!",
      modal_hu_btn: "Magyar",
      modal_en_btn: "Angol",
      modal_ok_btn: "Ok",
      wrong_password: "Hibás jelszó!",
      main_title: "SplashDesign",
      main_subtitle: "Az Eleven Kft. elrendezési rajz és árajánlat készítő szoftvere",
      guide_toggle: "Beállítási útmutató megjelenítése/elrejtése",
      guide_usage: "A program használata:",
      guide_step1: "Kattints a \"Alaprajz feltöltése\" gombra, és válassz ki egy JPG, JPEG, PNG vagy PDF formátumú alaprajzot.",
      guide_step2: "Miután megjelent az alaprajz a lentebbi fehér területen, kattints egymás után két olyan pontra rajta, amelyek között ismered a valós távolságot (pl. méretarányt jelölő sáv vagy a medence két pontja). Két piros pont jelenik majd meg, melyeket egy vonal köt össze.",
      guide_step3: "Add meg, hogy a két pont valóságban hány cm távolságot jelent, és kattints a \"Méretarány kiszámítása\" gombra.",
      guide_step4: "Az oldalsó lenyíló menüből húzz át az alaprajzra termékeket.",
      guide_step5: "Kattints egy termékre, majd húzd át az áthelyezéshez, forgasd el a \"Forgatás 45°\" gombra kattintva vagy távolítsd el a \"Törlés\" gombra kattintva.",
      guide_step6: "Az elrendezési rajz elkészítése közben az oldal alján egy árajánlat is készül. Az árajánlatot és az elrendezési rajzot a \"PDF exportálása\" gombra kattintva mentheded el.",
      guide_step7: "Kattints a \"Beállítási útmutató megjelenítése/elrejtése\" sávra az útmutató összecsukásához.",
      upload_btn: "Alaprajz feltöltése",
      upload_hint: "PNG/JPG/JPEG vagy PDF",
      pixel_distance: "Pixel távolság:",
      scale_computed: "Számított méretarány:",
      real_distance_label: "Valós távolság (cm):",
      scale_btn: "Méretarány kiszámítása",
      rotate_btn: "Forgatás 45°",
      delete_btn: "Törlés",
      quote_title: "Árajánlat",
      quote_product: "Termék neve",
      quote_qty: "Darab",
      quote_unitprice: "Egységár (Ft)",
      quote_subtotal: "Részösszeg (Ft)",
      quote_total: "Végösszeg (Ft):",
      pdf_export_btn: "PDF exportálása",
      // Product names/sizes/prices
      prod_elefant: "Elefánt mérleghinta",
      prod_elefant_size: "5,5 m × 2,5 m",
      prod_kaloz: "Kalózhajó vízágyú",
      prod_kaloz_size: "4 m × 3,45 m",
      prod_madar: "Madár vízágyú",
      prod_madar_size: "3,4 m × 3,32 m",
      // PDF
      pdf_title: "Eleven Kft. előzetes árajánlat",
      pdf_disclaimer: "Az alábbi árajánlat és elrendezési rajz csak tájékoztató jellegű. Kérjük, vegye fel a kapcsolatot munkatársainkkal a végleges tartalomért.",
      pdf_footer: "Eleven Kft. | www.aqua-parks.com | info@eleven11.hu | +36 1 436 9113",
      // Variants
      variant_choose: (name) => `${name} – kivitel választása`,
      variant_cancel: "Mégsem",
      variant_labels: {
        "Kézikaros": "Kézikaros",
        "Nyomógombos": "Nyomógombos"
      },
      currency: "Ft",
      currency_suffix: " Ft",
      category_merleghinta: "Mérleghinták",
      category_vizagyuk: "Vízágyúk",
      category_egyeb: "Egyéb",
      pdf_export_filename: "Előzetes árajánlat - Eleven Kft.",
    },
    en: {
      modal_title: "To use this software, please enter the password!",
      modal_hu_btn: "Hungarian",
      modal_en_btn: "English",
      modal_ok_btn: "Ok",
      wrong_password: "Wrong password!",
      main_title: "SplashDesign",
      main_subtitle: "Layout and quotation creator software by Eleven Ltd.",
      guide_toggle: "Show/hide usage guide",
      guide_usage: "How to use:",
      guide_step1: "Click the \"Upload plan\" button and select a JPG, JPEG, PNG or PDF file.",
      guide_step2: "After the plan appears below, click two points on it whose real-world distance you know (e.g. a scale bar or pool edge). Two red dots and a connecting line will appear.",
      guide_step3: "Enter the real distance in cm and click \"Compute scale\".",
      guide_step4: "Drag products from the left menu onto the plan.",
      guide_step5: "Click a product to move it, rotate with \"Rotate 45°\" or remove with \"Delete\".",
      guide_step6: "A quotation is generated at the bottom. Save the plan and quote as PDF with \"Export PDF\".",
      guide_step7: "Click the \"Show/hide usage guide\" bar to collapse the guide.",
      upload_btn: "Upload plan",
      upload_hint: "PNG/JPG/JPEG or PDF",
      pixel_distance: "Pixel distance:",
      scale_computed: "Computed scale:",
      real_distance_label: "Real distance (cm):",
      scale_btn: "Compute scale",
      rotate_btn: "Rotate 45°",
      delete_btn: "Delete",
      quote_title: "Quotation",
      quote_product: "Product name",
      quote_qty: "Qty",
      quote_unitprice: "Unit price (Ft)",
      quote_subtotal: "Subtotal (Ft)",
      quote_total: "Total (eur):",
      pdf_export_btn: "Export PDF",
      // Product names/sizes/prices
      prod_elefant: "Elephant seesaw",
      prod_elefant_size: "5.5 m × 2.5 m",
      prod_kaloz: "Pirate ship water cannon",
      prod_kaloz_size: "4 m × 3.45 m",
      prod_madar: "Bird water cannon",
      prod_madar_size: "3.4 m × 3.32 m",
      // PDF
      pdf_title: "Eleven Ltd. preliminary quotation",
      pdf_disclaimer: "The following quotation and layout are for information only. Please contact our staff for final details.",
      pdf_footer: "Eleven Ltd. | www.aqua-parks.com | info@eleven11.hu | +36 1 436 9113",
      // Variants
      variant_choose: (name) => `${name} – choose variant`,
      variant_cancel: "Cancel",
      variant_labels: {
        "Kézikaros": "Manual lever",
        "Nyomógombos": "Push button"
      },
      currency: "EUR",
      currency_suffix: " EUR",
      category_merleghinta: "Seesaws",
      category_vizagyuk: "Water cannons",
      category_egyeb: "Other",
      pdf_export_filename: "Preliminary Quote - Eleven Ltd.",
    }
  };

  let currentLang = "hu";

  // Fordítás alkalmazása minden data-i18n elemre
  function applyTranslations(lang) {
    document.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.getAttribute("data-i18n");
      let val = translations[lang][key];
      if (typeof val === "function") return; // skip functions
      if (val !== undefined) el.textContent = val;
    });
  }

  // MODAL logika
  (function setupLangPassModal() {
    const modal = document.getElementById("langpass-modal");
    const appDiv = document.getElementById("app");
    const passInput = document.getElementById("modal-password");
    const okBtn = document.getElementById("modal-ok");
    const langBtns = [document.getElementById("lang-hu"), document.getElementById("lang-en")];

    let selectedLang = "hu";
    langBtns.forEach(btn => {
      btn.onclick = () => {
        langBtns.forEach(b => {
          b.style.background = "#72af42";
          b.setAttribute("data-selected", "false");
        });
        btn.style.background = "#3d4542";
        btn.setAttribute("data-selected", "true");
        selectedLang = btn.id === "lang-hu" ? "hu" : "en";
        currentLang = selectedLang;
        applyTranslations(currentLang);
      };
    });
    // Alapértelmezett magyar
    langBtns[0].style.background = "#3d4542";
    langBtns[0].setAttribute("data-selected", "true");

    okBtn.onclick = () => {
      if (passInput.value === "eleven11") {
        modal.style.display = "none";
        appDiv.style.display = "";
        currentLang = selectedLang;
        applyTranslations(currentLang);
      } else {
        alert(translations[selectedLang].wrong_password);
        passInput.value = "";
        passInput.focus();
      }
    };
    // Enterrel is működjön
    passInput.addEventListener("keydown", e => {
      if (e.key === "Enter") okBtn.click();
    });
    // Fordítás első betöltéskor
    applyTranslations(currentLang);
  })();

  // Nyelv váltás után is frissítsuk a dinamikus tartalmakat
  function updateDynamicTexts() {
    // Árajánlat tábla újragenerálása
    updateQuoteTable();
    // Gombok, stb.
    document.getElementById("rotate-btn").textContent = translations[currentLang].rotate_btn;
    document.getElementById("delete-btn").textContent = translations[currentLang].delete_btn;
    document.getElementById("export-pdf").textContent = translations[currentLang].pdf_export_btn;

    // Sidebar kategória és árak frissítése (csak szöveg, nem DOM csere!)
    const productList = document.getElementById('product-list');
    productList.querySelectorAll('.product-category').forEach(details => {
      const summary = details.querySelector('summary');
      if (summary) {
        const cat = summary.getAttribute('data-category');
        let catKey = "category_egyeb";
        if (cat === "Mérleghinták") catKey = "category_merleghinta";
        else if (cat === "Vízágyúk") catKey = "category_vizagyuk";
        summary.textContent = translations[currentLang][catKey] || cat;
      }
      details.querySelectorAll('.product-item').forEach(el => {
        const info = el.querySelector('.product-info');
        if (info) {
          const priceSpan = info.querySelector('.product-price');
          if (priceSpan) {
            // Egységes ár logika: magyarul Ft, angolul EUR ha van, különben Ft
            if (el.dataset.variants) {
              let parsedVariants = [];
              try {
                parsedVariants = JSON.parse(el.dataset.variants);
              } catch {}
              if (parsedVariants.length > 0) {
                let prices, suffix;
                if (currentLang === "en" && parsedVariants[0].eur) {
                  prices = parsedVariants.map(v => v.eur);
                  suffix = " EUR";
                } else {
                  prices = parsedVariants.map(v => v.price);
                  suffix = " Ft";
                }
                const min = Math.min(...prices);
                const max = Math.max(...prices);
                if (min === max) {
                  priceSpan.textContent = `${min.toLocaleString()}${suffix}`;
                } else {
                  priceSpan.textContent = `${min.toLocaleString()} – ${max.toLocaleString()}${suffix}`;
                }
              } else {
                priceSpan.textContent = "";
              }
            } else if (el.dataset.price) {
              if (currentLang === "en" && el.dataset.eur) {
                priceSpan.textContent = `${Number(el.dataset.eur).toLocaleString()} EUR`;
              } else {
                priceSpan.textContent = `${Number(el.dataset.price).toLocaleString()} Ft`;
              }
            }
          }
        }
      });
    });
  }

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

  // ───────────────
  // SEGÉDFÜGGVÉNYEK
  // ───────────────

  // Segédfüggvény: terméknév fordítása slug alapján
  function getTranslatedProductName(slug) {
    if (slug === "elefant_merleghinta") return translations[currentLang].prod_elefant;
    if (slug === "kalozhajo_vizagyu") return translations[currentLang].prod_kaloz;
    if (slug === "madar_vizagyu") return translations[currentLang].prod_madar;
    return slug;
  }

  // 3. DRAG & DROP
  productItems.forEach(item => {
    item.addEventListener('dragstart', ev => {
      const payload = JSON.stringify({
        name: item.dataset.name,
        slug: item.dataset.slug,
        widthCm: +item.dataset.widthCm,
        heightCm: +item.dataset.heightCm,
        price: +item.dataset.price,
        eur: item.dataset.eur ? +item.dataset.eur : null,
        variants: item.dataset.variants ? item.dataset.variants : null
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
    const { name, slug, widthCm, heightCm, price, eur, variants } = JSON.parse(data);

    let finalName = getTranslatedProductName(slug);
    let finalPrice = currentLang === "en" && eur ? eur : price;

    // Variánsok kezelése
    let finalVariantLabel = "";
    if (variants) {
      let parsedVariants = [];
      try {
        parsedVariants = JSON.parse(variants);
      } catch {}
      if (parsedVariants.length > 0) {
        // Fordított variánsok
        const translatedVariants = parsedVariants.map(v => ({
          ...v,
          label: translations[currentLang].variant_labels[v.label] || v.label,
          price: currentLang === "en" && v.eur ? v.eur : v.price
        }));
        // Felugró ablak készítése
        const selectedPrice = await showVariantDialog(getTranslatedProductName(slug), translatedVariants);
        if (selectedPrice === null) return;
        const selectedVariant = translatedVariants.find(v => v.price === selectedPrice);
        finalVariantLabel = selectedVariant ? selectedVariant.label : "";
        finalPrice = selectedPrice;
        if (finalVariantLabel) finalName = `${getTranslatedProductName(slug)} (${finalVariantLabel})`;
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

  // Variáns választó felugró ablak (nyelvfüggő, mindig frissül)
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
      let chooseText = translations[currentLang].variant_choose;
      title.textContent = typeof chooseText === "function" ? chooseText(productName) : productName;
      title.style.marginTop = '0';
      box.appendChild(title);

      variants.forEach(variant => {
        const btn = document.createElement('button');
        let priceStr = `${variant.price.toLocaleString()}${translations[currentLang].currency_suffix}`;
        btn.textContent = `${variant.label} – ${priceStr}`;
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
      cancelBtn.textContent = translations[currentLang].variant_cancel;
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
      let priceStr = `${data.unitPrice.toLocaleString()}${translations[currentLang].currency_suffix}`;
      let subtotalStr = `${subtotal.toLocaleString()}${translations[currentLang].currency_suffix}`;
      tr.innerHTML = `
        <td>${name}</td>
        <td style="text-align:center;">${data.count}</td>
        <td style="text-align:right;">${priceStr}</td>
        <td style="text-align:right;">${subtotalStr}</td>
      `;
      tbody.appendChild(tr);
    }
    let totalStr = total.toLocaleString() + translations[currentLang].currency_suffix;
    document.getElementById('quote-total').textContent = totalStr;
    // Fordítás a táblázat fejlécén
    document.querySelector('[data-i18n="quote_product"]').textContent = translations[currentLang].quote_product;
    document.querySelector('[data-i18n="quote_qty"]').textContent = translations[currentLang].quote_qty;
    document.querySelector('[data-i18n="quote_unitprice"]').textContent = translations[currentLang].quote_unitprice;
    document.querySelector('[data-i18n="quote_subtotal"]').textContent = translations[currentLang].quote_subtotal;
    document.querySelector('[data-i18n="quote_total"]').textContent = translations[currentLang].quote_total;
    document.querySelector('[data-i18n="quote_title"]').textContent = translations[currentLang].quote_title;
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
  redrawAll();

  try {
    planDataUrl = canvas.toDataURL('image/png');
  } catch (e) {
    alert('A PDF exportálás nem lehetséges, mert az alaprajz képét a böngésző biztonsági korlátozásai miatt nem lehet exportálni (tainted canvas). Csak helyi gépről feltöltött képekkel működik, vagy próbáld meg más böngészővel.');
    selectedItemIndex = prevSelected;
    redrawAll();
    return;
  }

  const pdfContainer = document.createElement('div');
  pdfContainer.style.padding = '20px';
  pdfContainer.style.fontFamily = "'Noto Sans', sans-serif";

  // ——— 1. Címsor és szöveg ———
  const title = document.createElement('h1');
  title.textContent = translations[currentLang].pdf_title;
  title.className = 'pdf-title';
  pdfContainer.appendChild(title);

  const disclaimer = document.createElement('p');
  disclaimer.textContent = translations[currentLang].pdf_disclaimer;
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
  quoteHeading.textContent = translations[currentLang].quote_title;
  quoteHeading.style.color = '#72af42';
  quoteHeading.style.textAlign = 'center';
  quoteHeading.style.marginBottom = '0.5rem';
  quoteSection.appendChild(quoteHeading);

  const quoteTable = document.getElementById('quote-table').cloneNode(true);
  quoteTable.style.width = '100%';
  quoteTable.style.borderCollapse = 'collapse';
  // Fordítás a PDF táblázat fejlécén
  const ths = quoteTable.querySelectorAll('th');
  ths[0].textContent = translations[currentLang].quote_product;
  ths[1].textContent = translations[currentLang].quote_qty;
  ths[2].textContent = translations[currentLang].quote_unitprice;
  ths[3].textContent = translations[currentLang].quote_subtotal;
  quoteTable.querySelector('tfoot strong').textContent = translations[currentLang].quote_total;
  quoteSection.appendChild(quoteTable);

  // lábléc
  const footer = document.createElement('p');
  footer.textContent = translations[currentLang].pdf_footer;
  footer.className = 'pdf-footer';

  pdfContainer.appendChild(quoteSection);
  pdfContainer.appendChild(footer);

  // Árak átírása PDF-ben is
  const rows = quoteTable.querySelectorAll('tbody tr');
  rows.forEach(row => {
    const tds = row.querySelectorAll('td');
    if (tds.length >= 4) {
      let price = tds[2].textContent.replace(/[^\d]/g, '');
      let subtotal = tds[3].textContent.replace(/[^\d]/g, '');
      tds[2].textContent = price ? `${Number(price).toLocaleString()}${translations[currentLang].currency_suffix}` : '';
      tds[3].textContent = subtotal ? `${Number(subtotal).toLocaleString()}${translations[currentLang].currency_suffix}` : '';
    }
  });
  // Végösszeg
  const totalCell = quoteTable.querySelector('#quote-total');
  if (totalCell) {
    let totalVal = totalCell.textContent.replace(/[^\d]/g, '');
    totalCell.textContent = totalVal ? `${Number(totalVal).toLocaleString()}${translations[currentLang].currency_suffix}` : '';
  }

  // ——— 5. PDF generálása ———
  const opt = {
    margin:       [10,10,10,10],      
    filename:     translations[currentLang].pdf_export_filename + '.pdf',
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2 },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };
  html2pdf().set(opt).from(pdfContainer).save();

  selectedItemIndex = prevSelected;
  redrawAll();
});

// Nyelv váltás után dinamikus tartalmak frissítése
const modal = document.getElementById("langpass-modal");
const observer = new MutationObserver(() => {
  if (modal.style.display === "none") {
    applyTranslations(currentLang);
    updateDynamicTexts();
  }
});
observer.observe(modal, { attributes: true, attributeFilter: ["style"] });
});