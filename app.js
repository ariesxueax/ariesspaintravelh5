(async function () {
  const C = window.ROADBOOK_CONTENT;
  const G = window.ROADBOOK_SPOT_GUIDES || { spots: {} };
  const app = document.getElementById("app");
  const topbar = document.getElementById("topbar");
  const tabbar = document.getElementById("tabbar");
  const sheet = document.getElementById("detailSheet");
  const sheetContent = document.getElementById("sheetContent");
  const mapboxToken = "pk.eyJ1IjoiYXJpZXN4dWVheDAwMSIsImEiOiJjbGgwMWl4c3Iwb3hkM2dxaHdld2EzMWUwIn0.PKltadPPKCz58RJ0epj0cw";
  const translationWorkerOrigin = "https://iberia-voice-translate.aries-xue-ax.workers.dev";
  const voiceTranslationEndpoint = `${translationWorkerOrigin}/voice`;
  const textTranslationEndpoint = `${translationWorkerOrigin}/text`;
  const maxVoiceRecordingMs = 60000;
  const imageAssetKeys = new Set([
    "alhambra", "april-bridge-new", "avenida-liberdade-new", "bacalhau-new", "barcelona", "belem-tower", "belem-tower-new", "cabo-da-roca", "casa-batllo", "casa-mila", "city-arts-sciences", "city-arts-sciences-new", "columbus-monument", "cover", "cover-peniscola", "discoveries-monument-new", "evora", "evora-cathedral", "evora-old-town", "flamenco", "generalife", "granada", "jeronimos-new", "lisbon", "madrid", "mijas", "paella", "palau-nacional", "park-guell", "pasteis-belem-new", "peniscola", "plaza-de-la-virgen", "plaza-espana-seville", "plaza-mayor-madrid", "puente-nuevo", "roman-temple-evora", "ronda", "rossio-new", "royal-palace-madrid", "sagrada-familia", "serranos-towers", "seville", "seville-cathedral", "tarragona", "valencia", "valencia-cathedral", "zaragoza", "zaragoza-city"
  ]);
  const [itinerary, spainHistoryText] = await Promise.all([
    fetch("data/itinerary-extraction.json?v=11.9").then(response => {
      if (!response.ok) throw new Error("行程数据加载失败");
      return response.json();
    }),
    fetch("data/spain-history.txt?v=11.9").then(response => response.ok ? response.text() : "").catch(() => "")
  ]);

  const modeLabels = { inside: "入内", guided: "官导", outside: "外观", distant: "远观", walk: "步行", free_time: "自由活动", shopping: "购物", show: "演出", food: "品尝" };
  const tabItems = [
    ["home", "house", "首页"], ["itinerary", "calendar-days", "行程"], ["map", "map", "地图"], ["cities", "landmark", "城市"], ["checklist", "list-checks", "清单"], ["translation", "languages", "翻译"]
  ];
  const checkSections = {
    "必备清单": [
      { title: "证件类", items: ["护照", "申根签证", "身份证", "旅行行程单", "护照电子版", "身份证电子版"] },
      { title: "支付类", items: ["VISA / MASTER 信用卡", "少量欧元[200-500]", "熟悉信用卡一键冻结功能（防止盗刷）"] },
      { title: "电子类", items: ["欧标 C / F 转换插头", "充电器", "充电线", "充电宝（3C）", "手机取卡针", "U盘", "pocket", "耳机", "其他点子设备"] },
      { title: "防护类", items: ["挎包", "防盗纽扣", "防盗手链"] },
      { title: "衣物类", items: ["步行鞋", "薄外套", "内衣袜子", "湿巾 / 脸巾 / 浴巾 / 卫生巾"] },
      { title: "日用类", items: ["洗护用品", "牙膏牙刷", "剃须刀", "化妆品", "耳塞"] },
      { title: "旅行类", items: ["雨伞", "口罩", "墨镜", "防晒霜", "帽子", "烧水杯", "拖鞋", "零食", "垃圾袋"] },
      { title: "药品类", items: ["泡腾片", "创可贴/碘伏棉签", "过敏药", "止泻药", "退烧药", "止疼片", "晕车药"] },
      { title: "APP类", items: ["GoogleMap", "GoogleTranslate", "Uber / Bolt", "GlobalBule", "Omio"] }
    ],
    "紧急事项": [
      { title: "紧急联络", items: [
        { label: "当地报警", phones: ["112"] },
        { label: "中驻西大使馆", phones: ["+34 915438877", "+34 913206181"] },
        { label: "中驻葡大使馆", phones: ["+351 214024855", "+351 213928430"] },
        { label: "外交部", phones: ["+86 10 12308"] }
      ] }
    ],
    "汇率转换": []
  };
  const state = { view: "home", selectedDay: 2, city: null, checklist: "必备清单", map: null, mapFocus: null, mapCollapsed: false, collapsedDays: new Set(), editingChecklistItemId: null, checklistSaveState: { type: "info", message: "新增、修改与勾选会保存到当前浏览器；刷新页面后仍会保留。" } };
  const savedChecks = readStoredJson("iberia.mobile.checks", {});
  const customChecklistStorageKey = "iberia.mobile.v10.6.custom-checklist-items";
  const priorCustomChecklistStorageKey = "iberia.mobile.custom-checklist-items";
  const legacyCustomPackingStorageKey = "iberia.mobile.custom-packing-items";
  const editableChecklistSections = Object.keys(checkSections).filter(section => section !== "汇率转换");
  let customChecklistItems = readCustomChecklistItems();
  const savedExchangeRate = Number(readStoredValue("iberia.mobile.exchange-rate"));
  let exchangeRate = Number.isFinite(savedExchangeRate) && savedExchangeRate > 0 ? savedExchangeRate : 7.8;
  let exchangeRateRevision = 0;
  const allVisits = itinerary.days.flatMap(day => day.visits.filter(visit => !visit.modes.includes("conditional")).map(visit => ({ ...visit, day: day.day, date: day.date })));
  const cityOrder = itinerary.routeNodes.map(node => node.nameZh).filter((city, index, list) => C.cities[city] && list.indexOf(city) === index);
  const cityVisits = city => allVisits.filter(visit => visit.city === city);
  const cityWeather = Object.create(null);
  let cityWeatherLoadPromise = null;
  let homeAutoScrollCleanup = null;

  function esc(value) {
    return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  }

  function setChecklistSaveState(type, message) {
    state.checklistSaveState = { type, message };
  }

  function readStoredValue(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      setChecklistSaveState("error", "当前浏览器阻止本地保存。请关闭无痕模式或允许本网站使用网站数据后再试。");
      return null;
    }
  }

  function readStoredJson(key, fallback) {
    const value = readStoredValue(key);
    if (!value) return fallback;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function saveStoredJson(key, value, label) {
    const serialized = JSON.stringify(value);
    try {
      localStorage.setItem(key, serialized);
      if (localStorage.getItem(key) !== serialized) throw new Error("Storage verification failed");
      setChecklistSaveState("success", `${label}已保存，刷新页面后仍会保留。`);
      return true;
    } catch {
      setChecklistSaveState("error", "保存失败：当前浏览器阻止本地保存。请关闭无痕模式或允许本网站使用网站数据后再试。");
      return false;
    }
  }

  function saveStoredValue(key, value) {
    try {
      localStorage.setItem(key, value);
      return localStorage.getItem(key) === value;
    } catch {
      return false;
    }
  }

  function refreshChecklistSaveStatus() {
    const status = document.querySelector("[data-checklist-save-status]");
    if (!status) return;
    status.textContent = state.checklistSaveState.message;
    status.dataset.state = state.checklistSaveState.type;
  }

  function normalizeCustomChecklistItems(value) {
    return Array.isArray(value)
      ? value.filter(item => item && typeof item.id === "string" && typeof item.text === "string" && item.text.trim()).map(item => ({ id: item.id, text: item.text.trim() }))
      : [];
  }

  function readCustomChecklistItems() {
    const items = Object.fromEntries(editableChecklistSections.map(section => [section, []]));
    try {
      const stored = readStoredJson(customChecklistStorageKey, null);
      if (stored && typeof stored === "object" && !Array.isArray(stored)) {
        editableChecklistSections.forEach(section => { items[section] = normalizeCustomChecklistItems(stored[section]); });
        return items;
      }
      const prior = readStoredJson(priorCustomChecklistStorageKey, null);
      if (prior && typeof prior === "object" && !Array.isArray(prior)) {
        items["必备清单"] = ["行前", "必备物品", "应用", "必备清单"].flatMap(section => normalizeCustomChecklistItems(prior[section]));
        items["紧急事项"] = ["当地注意", "紧急事项"].flatMap(section => normalizeCustomChecklistItems(prior[section]));
      } else {
        items["必备清单"] = normalizeCustomChecklistItems(readStoredJson(legacyCustomPackingStorageKey, []));
      }
      // 将用户此前自行补充的内容迁入新版分类，避免在合并标签时丢失。
      try { localStorage.setItem(customChecklistStorageKey, JSON.stringify(items)); } catch {}
    } catch {
      // 浏览器禁用本地存储时仍可正常查看默认清单。
    }
    return items;
  }

  function saveCustomChecklistItems() {
    return saveStoredJson(customChecklistStorageKey, customChecklistItems, "补充清单");
  }

  function customChecklistItemId() {
    return `custom-checklist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  const prefetchedImageKeys = new Set();

  function imageKeyFor(name, city) {
    const profile = C.cities[city];
    const preferredKey = C.imageKeys[name] || profile?.image || "cover";
    const cityKey = profile?.image || "cover";
    return imageAssetKeys.has(preferredKey) ? preferredKey : imageAssetKeys.has(cityKey) ? cityKey : "cover";
  }

  function mobileImageForKey(key) {
    return `assets/images/mobile/${imageAssetKeys.has(key) ? key : "cover"}.jpg`;
  }

  function mobileWebpForKey(key) {
    return `assets/images/mobile/${imageAssetKeys.has(key) ? key : "cover"}.webp`;
  }

  function smallImageForKey(key) {
    return `assets/images/small/${imageAssetKeys.has(key) ? key : "cover"}.jpg`;
  }

  function smallWebpForKey(key) {
    return `assets/images/small/${imageAssetKeys.has(key) ? key : "cover"}.webp`;
  }

  function thumbImageForKey(key) {
    return `assets/images/thumb/${imageAssetKeys.has(key) ? key : "cover"}.jpg`;
  }

  function responsiveImage(key, alt, options = {}) {
    const safeKey = imageAssetKeys.has(key) ? key : "cover";
    const loading = options.loading || "lazy";
    const className = options.className ? ` ${options.className}` : "";
    const fetchPriority = options.fetchPriority ? ` fetchpriority="${options.fetchPriority}"` : "";
    const jpegSources = options.sources === "small"
      ? `${smallImageForKey(safeKey)} 480w`
      : `${smallImageForKey(safeKey)} 480w, ${mobileImageForKey(safeKey)} 900w`;
    const webpSources = options.sources === "small"
      ? `${smallWebpForKey(safeKey)} 480w`
      : `${smallWebpForKey(safeKey)} 480w, ${mobileWebpForKey(safeKey)} 900w`;
    const source = options.sources === "small" ? smallImageForKey(safeKey) : mobileImageForKey(safeKey);
    const sizes = options.sizes || "(max-width: 600px) 100vw, 560px";
    const fallback = mobileImageForKey(options.fallbackKey || "cover");
    return `<picture class="responsive-picture"><source type="image/webp" srcset="${webpSources}" sizes="${sizes}"><img class="progressive-image${className}" src="${source}" srcset="${jpegSources}" sizes="${sizes}" alt="${esc(alt)}" loading="${loading}"${fetchPriority} decoding="async" style="--image-placeholder:url('${thumbImageForKey(safeKey)}')" onload="this.classList.add('image-ready')" onerror="this.onerror=null;this.removeAttribute('srcset');this.classList.remove('image-ready');this.src='${fallback}'"></picture>`;
  }

  function canPrefetchImages() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return !connection || (!connection.saveData && !["slow-2g", "2g"].includes(connection.effectiveType));
  }

  function scheduleImagePrefetch(keys) {
    if (!canPrefetchImages()) return;
    const queue = [...new Set(keys.filter(key => imageAssetKeys.has(key) && !prefetchedImageKeys.has(key)))].slice(0, 2);
    if (!queue.length) return;
    queue.forEach(key => prefetchedImageKeys.add(key));
    const warmCache = () => queue.forEach(key => {
      const image = new Image();
      image.decoding = "async";
      image.src = smallImageForKey(key);
    });
    if ("requestIdleCallback" in window) window.requestIdleCallback(warmCache, { timeout: 900 });
    else window.setTimeout(warmCache, 260);
  }

  function prefetchForCurrentView() {
    if (state.view === "home") {
      const day = itinerary.days.find(item => item.day === state.selectedDay) || itinerary.days[1];
      scheduleImagePrefetch(day.visits.filter(visit => !visit.modes.includes("conditional")).slice(2, 4).map(visit => imageKeyFor(visit.nameZh, visit.city)));
      return;
    }
    if (state.view === "cities") {
      scheduleImagePrefetch(cityOrder.slice(3, 5).map(city => imageKeyFor("", city)));
      return;
    }
    if (state.view === "city") {
      scheduleImagePrefetch(cityVisits(state.city).slice(0, 2).map(visit => imageKeyFor(visit.nameZh, visit.city)));
    }
  }

  function stopHomeAutoScroll() {
    if (!homeAutoScrollCleanup) return;
    homeAutoScrollCleanup();
    homeAutoScrollCleanup = null;
  }

  function setupHomeAutoScroll() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const scrollers = [...document.querySelectorAll("[data-home-auto-scroll]")]
      .filter(element => element.scrollWidth > element.clientWidth + 2);
    if (!scrollers.length) return;

    const controllers = scrollers.map(element => ({ element, position: element.scrollLeft, pausedUntil: performance.now() + 1300 }));
    const listeners = [];
    let frameId = 0;
    let lastFrame = performance.now();
    let active = true;

    const listen = (element, type, handler, options) => {
      element.addEventListener(type, handler, options);
      listeners.push(() => element.removeEventListener(type, handler, options));
    };
    const pause = controller => { controller.pausedUntil = Infinity; };
    const resume = (controller, delay = 900) => {
      controller.position = controller.element.scrollLeft;
      controller.pausedUntil = performance.now() + delay;
    };

    controllers.forEach(controller => {
      const { element } = controller;
      element.classList.add("is-auto-scrolling");
      listen(element, "pointerdown", () => pause(controller), { passive: true });
      listen(element, "pointerup", () => resume(controller), { passive: true });
      listen(element, "pointercancel", () => resume(controller), { passive: true });
      listen(element, "mouseenter", () => pause(controller), { passive: true });
      listen(element, "mouseleave", () => resume(controller, 500), { passive: true });
      listen(element, "focusin", () => pause(controller));
      listen(element, "focusout", () => resume(controller, 500));
      listen(element, "wheel", () => resume(controller, 1300), { passive: true });
    });

    const tick = now => {
      if (!active) return;
      const elapsed = Math.min(now - lastFrame, 40);
      lastFrame = now;
      controllers.forEach(controller => {
        const { element } = controller;
        const maxScroll = element.scrollWidth - element.clientWidth;
        if (now < controller.pausedUntil || maxScroll <= 2) return;
        controller.position += elapsed * .018;
        if (controller.position >= maxScroll) {
          controller.position = 0;
          controller.pausedUntil = now + 850;
        }
        element.scrollLeft = controller.position;
      });
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    homeAutoScrollCleanup = () => {
      active = false;
      cancelAnimationFrame(frameId);
      listeners.forEach(remove => remove());
      controllers.forEach(({ element }) => element.classList.remove("is-auto-scrolling"));
    };
  }

  function modeTags(modes = []) {
    return modes.filter(mode => modeLabels[mode]).map(mode => `<span class="mode-tag ${mode}">${modeLabels[mode]}</span>`).join("");
  }

  function localCityName(city) {
    return C.localNames?.cities?.[city] || C.cities[city]?.en || "";
  }

  function localSpotName(name) {
    return C.localNames?.spots?.[name] || "";
  }

  function durationLabel(minutes) {
    if (!minutes) return "";
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    if (!hours) return `${minutes} 分钟`;
    return remainder ? `${hours} 小时 ${remainder} 分钟` : `${hours} 小时`;
  }

  function minimumStayLabel(visit, fallback = "") {
    return visit?.minimumDurationMinutes ? `不少于 ${durationLabel(visit.minimumDurationMinutes)}` : fallback;
  }

  function mapMealTags(day) {
    const meals = day.meals || {};
    return `<div class="route-meals" aria-label="D${day.day} 餐食"><span class="meal-status ${meals.breakfast === "×" ? "excluded" : "included"}">早 · ${esc(meals.breakfast || "×")}</span><span class="meal-status ${meals.lunch === "×" ? "excluded" : "included"}">午 · ${esc(meals.lunch || "×")}</span><span class="meal-status ${meals.dinner === "×" ? "excluded" : meals.dinner === "含" ? "included" : "special"}">晚 · ${esc(meals.dinner || "×")}</span></div>`;
  }

  function foodExperienceStrip() {
    const foods = C.foodExperiences || [];
    if (!foods.length) return "";
    return `<section class="food-experiences"><div class="food-experiences-head"><div><div class="eyebrow">Taste itinerary</div><h2>三种美食体验</h2></div><span>全程含餐</span></div><div class="food-experience-list">${foods.map(food => `<div class="food-experience"><b>${esc(food.name)}</b><i>${esc(food.local)}</i><small>${esc(food.detail)}</small></div>`).join("")}</div></section>`;
  }

  function voiceTranslationMarkup() {
    return `<section class="voice-translation-panel" data-voice-panel aria-labelledby="voice-translation-title"><header class="voice-translation-head"><div><small>Voice translation</small><h2 id="voice-translation-title">语音翻译</h2></div><i data-lucide="languages" aria-hidden="true"></i></header><p>点击一个方向开始录音，再次点击结束；单次录音最长 60 秒。</p><div class="voice-direction-grid"><button type="button" class="voice-direction-button" data-voice-direction="zh-to-es" aria-pressed="false"><i data-lucide="mic" aria-hidden="true"></i><span>说中文<em>→ 西班牙语</em></span></button><button type="button" class="voice-direction-button" data-voice-direction="es-to-zh" aria-pressed="false"><i data-lucide="mic" aria-hidden="true"></i><span>说西班牙语<em>→ 中文</em></span></button></div><div class="voice-translation-result" data-voice-result hidden></div><p class="voice-translation-status" data-voice-status role="status"><i data-lucide="mic" aria-hidden="true"></i>点击开始录音</p></section>`;
  }

  function textTranslationMarkup() {
    return `<section class="text-translation-panel" data-text-panel aria-labelledby="text-translation-title"><header class="text-translation-head"><div><small>Text translation</small><h2 id="text-translation-title">文字翻译</h2></div><i data-lucide="keyboard" aria-hidden="true"></i></header><p>输入中文，即可获得西班牙语表达。</p><label class="text-translation-input"><span>中文</span><textarea data-text-source rows="3" maxlength="100" placeholder="例如：请问洗手间在哪里？" aria-label="输入中文"></textarea></label><button type="button" class="text-translate-button" data-text-translate><i data-lucide="languages" aria-hidden="true"></i>翻译成西班牙语</button><div class="text-translation-result" data-text-result hidden></div><p class="text-translation-status" data-text-status role="status"><i data-lucide="keyboard" aria-hidden="true"></i>最多 100 个汉字</p></section>`;
  }

  function translationView() {
    const scenes = [
      { title: "基础社交", local: "Saludos", icon: "messages-circle", phrases: [["Hola, buenos días.", "[ˈola ˈbwenos ˈdi.as]", "欧拉，布埃诺斯 迪亚斯", "你好，早上好。"], ["Por favor.", "[poɾ faˈβoɾ]", "波尔 法沃尔", "请。"], ["Muchas gracias.", "[ˈmutʃas ˈɣɾa.sjas]", "穆恰斯 格拉西亚斯", "非常感谢。"]] },
      { title: "交通出行", local: "Transporte", icon: "bus-front", phrases: [["¿Dónde está la estación?", "[ˈdonde esˈta la estaˈsjon]", "冬德 埃斯塔 拉 埃斯塔西翁", "车站在哪里？"], ["Quiero ir a...", "[ˈkjeɾo iɾ a]", "基耶罗 伊尔 阿", "我想去……"], ["¿Este autobús va al centro?", "[ˈeste awtoˈβus βa al ˈsentɾo]", "埃斯特 奥托布斯 巴 阿尔 森特罗", "这趟公交去市中心吗？"]] },
      { title: "酒店住宿", local: "Hotel", icon: "bed-double", phrases: [["Tengo una reserva a nombre de...", "[ˈteŋɡo una reˈseɾβa a ˈnombɾe de]", "滕戈 乌纳 雷塞尔巴 阿 农布雷 德", "我有一个……名字预订。"], ["¿A qué hora es el desayuno?", "[a ke ˈoɾa es el desaˈʝuno]", "阿 克 奥拉 埃斯 埃尔 德萨尤诺", "早餐几点开始？"], ["¿Puede guardar mi equipaje?", "[ˈpweðe ɣwaɾˈðaɾ mi ekipaˈxe]", "普埃德 瓜尔达尔 米 埃基帕赫", "可以帮我寄存行李吗？"]] },
      { title: "餐饮美食", local: "Restaurante", icon: "utensils", phrases: [["Una mesa para dos, por favor.", "[ˈuna ˈmesa ˈpaɾa ðos poɾ faˈβoɾ]", "乌纳 梅萨 帕拉 多斯 波尔 法沃尔", "请给两位一张桌子。"], ["¿Qué nos recomienda?", "[ke nos rekomenˈðjenda]", "克 诺斯 雷科门迭恩达", "您推荐什么？"], ["La cuenta, por favor.", "[la ˈkwenta poɾ faˈβoɾ]", "拉 昆塔 波尔 法沃尔", "请结账。"]] },
      { title: "购物消费", local: "Compras", icon: "shopping-bag", phrases: [["¿Cuánto cuesta?", "[ˈkwanto ˈkwesta]", "关托 奎斯塔", "这个多少钱？"], ["¿Puedo pagar con tarjeta?", "[ˈpweðo paˈɣaɾ kon taɾˈxeta]", "普埃多 帕加尔 孔 塔尔赫塔", "可以刷卡吗？"], ["Solo estoy mirando, gracias.", "[ˈsolo esˈtoj miˈɾando ˈɣɾa.sjas]", "索洛 埃斯托伊 米兰多 格拉西亚斯", "我只是看看，谢谢。"]] },
      { title: "观光游览", local: "Visitas", icon: "camera", phrases: [["¿Dónde está la entrada?", "[ˈdonde esˈta la enˈtɾaða]", "冬德 埃斯塔 拉 恩特拉达", "入口在哪里？"], ["¿A qué hora cierra?", "[a ke ˈoɾa ˈsjera]", "阿 克 奥拉 谢拉", "几点关门？"], ["¿Podría sacar una foto, por favor?", "[poˈðɾia sakaɾ una ˈfoto poɾ faˈβoɾ]", "波德里亚 萨卡尔 乌纳 福托 波尔 法沃尔", "可以帮我拍张照片吗？"]] },
      { title: "紧急求助", local: "Emergencia", icon: "siren", phrases: [["¡Ayuda, por favor!", "[aˈʝuða poɾ faˈβoɾ]", "阿尤达 波尔 法沃尔", "请帮帮我！"], ["Necesito un médico.", "[neseˈsito un ˈmeðiko]", "内塞西托 温 梅迪科", "我需要医生。"], ["He perdido mi pasaporte.", "[e peɾˈðiðo mi pasaˈpoɾte]", "埃 佩尔迪多 米 帕萨波尔特", "我的护照丢了。"]] },
      { title: "通讯网络", local: "Conexión", icon: "wifi", phrases: [["¿Hay Wi-Fi gratis?", "[ai wiˈfi ˈɣɾatis]", "艾 维菲 格拉蒂斯", "有免费 Wi-Fi 吗？"], ["¿Cuál es la contraseña?", "[kwal es la kontɾaˈseɲa]", "夸尔 埃斯 拉 孔特拉塞尼亚", "密码是什么？"], ["No tengo señal.", "[no ˈteŋɡo seˈɲal]", "诺 滕戈 塞尼亚尔", "我没有信号。"]] },
      { title: "数字与时间", local: "Números y hora", icon: "clock-3", phrases: [["¿Qué hora es?", "[ke ˈoɾa es]", "克 奥拉 埃斯", "现在几点？"], ["¿A qué hora sale?", "[a ke ˈoɾa ˈsale]", "阿 克 奥拉 萨莱", "几点出发？"], { numbers: [["1", "uno", "[ˈuno]", "乌诺"], ["2", "dos", "[dos]", "多斯"], ["3", "tres", "[tres]", "特雷斯"], ["4", "cuatro", "[ˈkwatɾo]", "夸特罗"], ["5", "cinco", "[ˈθiŋko]", "辛科"], ["6", "seis", "[sejs]", "塞斯"], ["7", "siete", "[ˈsjete]", "谢特"], ["8", "ocho", "[ˈotʃo]", "奥乔"], ["9", "nueve", "[ˈnweβe]", "努埃贝"], ["10", "diez", "[djeθ]", "迭斯"]] }] },
      { title: "沟通兜底", local: "Comunicación", icon: "message-circle-question", phrases: [["No hablo español.", "[no ˈaβlo espaˈɲol]", "诺 阿布洛 埃斯帕尼奥尔", "我不会说西班牙语。"], ["¿Habla más despacio, por favor?", "[ˈaβla mas desˈpasjo poɾ faˈβoɾ]", "阿布拉 马斯 德斯帕西奥 波尔 法沃尔", "请说慢一点，可以吗？"], ["¿Puede escribirlo, por favor?", "[ˈpweðe eskɾiˈβiɾlo poɾ faˈβoɾ]", "普埃德 埃斯克里比尔洛 波尔 法沃尔", "可以写下来吗？"]] }
    ];
    const phraseMarkup = phrase => {
      if (Array.isArray(phrase)) {
        const [spanish, ipa, homophone, chinese] = phrase;
        return `<article class="translation-phrase"><button class="translation-speak" type="button" data-speak="${esc(spanish)}" aria-label="播放西班牙语：${esc(spanish)}" aria-pressed="false" title="播放西班牙语发音"><span lang="es">${esc(spanish)}</span><i data-lucide="volume-2" aria-hidden="true"></i></button><p class="translation-meaning">${esc(chinese)}</p><dl class="translation-detail"><div><dt>西语音标</dt><dd>${esc(ipa)}</dd></div><div><dt>中文谐音</dt><dd>${esc(homophone)}</dd></div></dl></article>`;
      }
      return `<article class="translation-numbers"><div class="translation-numbers-head"><b>1 - 10 数字读音</b><span>点击数字听发音</span></div><div class="translation-number-grid">${phrase.numbers.map(([number, spanish, ipa, homophone]) => `<button class="number-pronunciation" type="button" data-speak="${esc(spanish)}" aria-label="播放数字 ${number} 的西班牙语：${esc(spanish)}" aria-pressed="false" title="播放西班牙语发音"><strong>${esc(number)}</strong><span lang="es">${esc(spanish)}</span><i data-lucide="volume-2" aria-hidden="true"></i><small>${esc(ipa)} · ${esc(homophone)}</small></button>`).join("")}</div></article>`;
    };
    return `<section class="view translation-view">
      <header class="translation-header"><div class="eyebrow">Spanish travel essential</div><h1>常用翻译</h1><p>西班牙旅行 10 个场景，随用随查的必备西语与数字读音。</p><div class="translation-key"><span>西语</span><i>IPA 音标</i><b>中文谐音</b><em>中文意思</em></div></header>
      ${voiceTranslationMarkup()}
      ${textTranslationMarkup()}
      <div class="translation-scene-list">${scenes.map((scene, index) => `<section class="translation-scene"><header class="translation-scene-head"><span>${String(index + 1).padStart(2, "0")}</span><div><small>${esc(scene.local)}</small><h2>${esc(scene.title)}</h2></div><i data-lucide="${scene.icon}"></i></header>${scene.phrases.map(phraseMarkup).join("")}</section>`).join("")}</div>
    </section>`;
  }

  function historyInline(text) {
    return esc(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }

  function historyView() {
    const blocks = spainHistoryText.trim().split(/\n{2,}/).map(block => block.trim()).filter(Boolean);
    if (!blocks.length) {
      return `<section class="view history-view"><header class="history-header"><div class="eyebrow">Spain through time</div><h1>西班牙历史</h1></header><p class="history-unavailable">历史内容暂不可用，请稍后刷新页面。</p></section>`;
    }
    const numberedChapters = blocks.some(block => /^\d{2}\s*[｜|]/.test(block));
    let title;
    let subtitle;
    let introduction;
    if (numberedChapters) {
      title = "西班牙简史";
      subtitle = "";
      introduction = blocks.shift() || "";
    } else {
      const titleBlock = blocks.shift();
      [title, subtitle = ""] = titleBlock.split("：");
      introduction = blocks.shift() || "";
    }
    const article = blocks.map(block => {
      if (block === "---") return `<div class="history-divider" aria-hidden="true"><span></span></div>`;
      if (block.startsWith("## ")) return `<h2 class="history-chapter-title">${historyInline(block.slice(3))}</h2>`;
      if (/^\d{2}\s*[｜|]/.test(block)) return `<h2 class="history-chapter-title">${historyInline(block)}</h2>`;
      const lines = block.split("\n");
      if (lines.every(line => /^\s*·/.test(line))) {
        return `<ul class="history-list">${lines.map(line => `<li>${historyInline(line.replace(/^\s*·\s*/, ""))}</li>`).join("")}</ul>`;
      }
      const isHighlight = /^\*\*[\s\S]+\*\*$/.test(block);
      return `<p class="history-copy ${isHighlight ? "is-highlight" : ""}">${lines.map(historyInline).join("<br>")}</p>`;
    }).join("");
    return `<section class="view history-view"><header class="history-header"><div class="eyebrow">Spain through time</div><h1>${esc(title)}</h1>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</header><article class="history-article"><p class="history-intro">${historyInline(introduction)}</p>${article}<footer class="history-source">内容来源：用户提供</footer></article></section>`;
  }

  function coachText(segment) {
    if (segment.mode !== "coach") return segment.duration || "国际航班";
    const hours = Math.round(segment.distanceKm / 75 * 2) / 2;
    return `${segment.distanceKm} km · 约 ${hours.toFixed(1)} 小时`;
  }

  function coachEstimateText(segment) {
    return `${segment.distanceKm} km · 预计 ${(segment.distanceKm / 75).toFixed(1)} 小时`;
  }

  function cityNameForRoute(day) {
    return day.route.filter(city => city !== "杭州").join(" · ") || "杭州";
  }

  function cityTravelDates(city) {
    return [...new Set(itinerary.days.filter(day => day.route.includes(city)).map(day => day.date))];
  }

  function weatherLabel(code) {
    if (code === 0) return "晴";
    if ([1, 2].includes(code)) return "少云";
    if (code === 3) return "多云";
    if ([45, 48].includes(code)) return "雾";
    if ([51, 53, 55, 56, 57].includes(code)) return "毛毛雨";
    if ([61, 63, 65, 66, 67].includes(code)) return "雨";
    if ([71, 73, 75, 77].includes(code)) return "雪";
    if ([80, 81, 82].includes(code)) return "阵雨";
    if ([85, 86].includes(code)) return "阵雪";
    if ([95, 96, 99].includes(code)) return "雷暴";
    return "天气待定";
  }

  function cityWeatherMarkup(city) {
    const forecast = cityWeather[city];
    let summary = "天气预报加载中";
    let source = "数据：Open-Meteo 天气预报";
    if (forecast === null) {
      summary = "天气预报暂不可用";
      source = "数据源：Open-Meteo";
    } else if (forecast) {
      const entries = cityTravelDates(city).map(date => forecast[date]).filter(Boolean);
      if (entries.length) {
        summary = entries.map(entry => `${entry.date.slice(5).replace("-", "/")} ${weatherLabel(entry.code)} ${Math.round(entry.min)}-${Math.round(entry.max)}°C`).join(" · ");
      } else {
        summary = "行程日期暂无天气预报";
      }
    }
    return `<i data-lucide="cloud-sun" aria-hidden="true"></i><span>${esc(summary)}</span><small>${esc(source)}</small>`;
  }

  async function loadCityWeather() {
    if (cityWeatherLoadPromise) return cityWeatherLoadPromise;
    cityWeatherLoadPromise = Promise.all(cityOrder.map(async city => {
      const coordinates = C.cityCoordinates[city];
      const dates = cityTravelDates(city);
      if (!coordinates || !dates.length) { cityWeather[city] = null; return; }
      const [longitude, latitude] = coordinates;
      const params = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        daily: "weather_code,temperature_2m_max,temperature_2m_min",
        timezone: "auto",
        start_date: dates[0],
        end_date: dates[dates.length - 1]
      });
      try {
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Weather request failed");
        const data = await response.json();
        if (!Array.isArray(data?.daily?.time)) throw new Error("Weather data missing");
        cityWeather[city] = Object.fromEntries(data.daily.time.map((date, index) => [date, {
          date,
          code: data.daily.weather_code?.[index],
          min: data.daily.temperature_2m_min?.[index],
          max: data.daily.temperature_2m_max?.[index]
        }]));
      } catch {
        cityWeather[city] = null;
      }
    })).then(() => {
      if (state.view !== "cities") return;
      document.querySelectorAll("[data-city-weather]").forEach(element => {
        element.innerHTML = cityWeatherMarkup(element.dataset.cityWeather);
      });
      refreshIcons();
    });
    return cityWeatherLoadPromise;
  }

  function topbarMarkup() {
    const historyButton = `<button class="top-action history-action" data-view="history" aria-label="查看西班牙历史" title="查看西班牙历史"><i data-lucide="scroll-text" aria-hidden="true"></i><span>历史</span></button>`;
    if (state.view === "city") {
      return `<button class="city-back" data-action="back-cities" aria-label="返回城市"><i data-lucide="arrow-left"></i></button><button class="brand-button" data-view="home"><b>${esc(state.city)}</b><span>城市导览</span></button>${historyButton}`;
    }
    return `<button class="brand-button" data-view="home"><b>伊比利亚光影纪行</b><span>西班牙 · 葡萄牙 11 天</span></button>${historyButton}`;
  }

  function tabbarMarkup() {
    return tabItems.map(([view, icon, label]) => `<button class="tab-button ${state.view === view ? "active" : ""}" data-view="${view}" aria-label="${label}"><i data-lucide="${icon}"></i><span>${label}</span></button>`).join("");
  }

  function homeView() {
    const day = itinerary.days.find(item => item.day === state.selectedDay) || itinerary.days[1];
    const dayVisits = day.visits.filter(visit => !visit.modes.includes("conditional"));
    const routeStops = itinerary.routeNodes.filter(node => node.nameZh !== "杭州").slice(0, 8);
    const coachSegments = day.segments.filter(segment => segment.mode === "coach");
    const coachDistance = coachSegments.reduce((sum, segment) => sum + segment.distanceKm, 0);
    const transportSummary = day.segments.length
      ? day.segments.map(segment => `<span><i data-lucide="${segment.mode === "flight" ? "plane" : "bus"}"></i>${esc(segment.from)} → ${esc(segment.to)} · ${coachText(segment)}</span>`).join("")
      : `<span><i data-lucide="${day.transport.includes("flight") ? "plane" : "hotel"}"></i>${esc(day.notes?.[0] || "市内游览与休整")}</span>`;
    return `<section class="view home-view">
      <section class="hero">
        ${responsiveImage("cover", "西班牙葡萄牙旅行风景", { className: "hero-image", loading: "eager", fetchPriority: "high", sizes: "(max-width: 600px) 100vw, 560px" })}
        <div class="hero-content">
          <div class="eyebrow">29 SEP — 09 OCT 2026</div>
          <h1>伊比利亚<br>光影纪行</h1>
          <p>从马德里的王室尺度，穿过高迪的曲线与安达卢西亚白墙，抵达大西洋尽头。</p>
          <div class="hero-actions"><button class="primary-button" data-view="itinerary"><i data-lucide="calendar-days"></i>查看全程</button><button class="secondary-button" data-view="map"><i data-lucide="map"></i>路线地图</button><button class="secondary-button hero-translation-button" data-view="translation"><i data-lucide="languages"></i>常用翻译</button></div>
        </div>
      </section>
      <div class="trip-strip"><div><strong>11</strong><span>旅行天数</span></div><div><strong>12</strong><span>途经城市</span></div><div><strong>2</strong><span>目的国家</span></div></div>
      <div class="journey-intro"><b>一条从王宫走向大西洋的环线</b><p>高迪建筑巡礼、世界遗产宫城、安达卢西亚白色小镇与葡萄牙大航海记忆，均已按日程放入可点开的移动卡片。</p></div>
      ${foodExperienceStrip()}
      <div class="section-head page-pad"><h2>选择行程日</h2><button class="text-button" data-view="itinerary">全部行程 <i data-lucide="arrow-right"></i></button></div>
      <div class="day-scroller">${itinerary.days.map(item => `<button class="day-pill ${item.day === day.day ? "active" : ""}" data-select-day="${item.day}"><b>D${item.day}</b><span>${item.date.slice(5).replace("-", "/")}</span></button>`).join("")}</div>
      <section class="day-journey"><div class="day-journey-head"><div><span>D${day.day} · ${day.weekday}</span><b>${esc(cityNameForRoute(day))}</b></div><em>${coachDistance ? `${coachDistance} km` : day.transport.includes("flight") ? "飞行日" : "市内游览"}</em></div><div class="day-route-string">${day.route.map(stop => `<strong>${esc(stop)}</strong>`).join(`<i data-lucide="chevron-right"></i>`)}</div><div class="transport-summary">${transportSummary}</div></section>
      <section class="day-attractions"><div class="section-head"><div><div class="eyebrow">Today stops</div><h2>${dayVisits.length ? "今日景点" : "今日安排"}</h2></div><span class="attraction-count">${dayVisits.length ? `${dayVisits.length} 个节点` : "抵达日"}</span></div>${dayVisits.length ? `<div class="attraction-scroller" data-home-auto-scroll="attractions">${dayVisits.map((visit, index) => attractionCard(visit, index + 1)).join("")}</div>` : `<div class="transit-card"><i data-lucide="plane"></i><div><b>${esc(day.notes?.[0] || "行程转场")}</b><span>留出充足时间办理值机与休整，详细提醒见旅行清单。</span></div></div>`}</section>
      <section class="mini-route"><div class="eyebrow">Route line</div><div class="route-rail" data-home-auto-scroll="route">${routeStops.map(stop => `<div class="route-stop"><i></i><strong>${esc(stop.nameZh)}</strong></div>`).join("")}</div></section>
    </section>`;
  }

  function attractionCard(visit, index) {
    const imageKey = imageKeyFor(visit.nameZh, visit.city);
    const duration = minimumStayLabel(visit, visit.modes.includes("food") ? "特色品尝" : "团队安排");
    const eager = index <= 2;
    return `<button class="attraction-card" data-spot="${esc(visit.nameZh)}" data-city="${esc(visit.city)}">${responsiveImage(imageKey, visit.nameZh, { loading: eager ? "eager" : "lazy", fetchPriority: index === 1 ? "high" : "", sources: "small", sizes: "228px" })}<span class="attraction-index">${String(index).padStart(2, "0")}</span><div class="attraction-body"><small>${esc(visit.city)} · ${duration}</small><b>${esc(visit.nameZh)}</b><div class="mode-row">${modeTags(visit.modes)}</div></div></button>`;
  }

  function itineraryView() {
    return `<section class="view itinerary-view"><header class="itinerary-header"><div class="eyebrow">Day by day</div><h1>每日行程</h1><p>把每天的移动、停留和城市节奏，放在一条连续路线里阅读。</p><div class="itinerary-stats"><span>11 天</span><span>12 城</span><span>45 个节点</span></div></header><div class="itinerary-flow">${itinerary.days.map(day => dayCard(day)).join("")}</div></section>`;
  }

  function dayCard(day) {
    const visits = day.visits.filter(visit => !visit.modes.includes("conditional"));
    const coachSegments = day.segments.filter(segment => segment.mode === "coach");
    const distance = coachSegments.reduce((sum, segment) => sum + segment.distanceKm, 0);
    const segmentMarkup = day.segments.map(segment => `<div class="flow-travel"><i data-lucide="${segment.mode === "flight" ? "plane" : "bus"}"></i><span>${esc(segment.from)} → ${esc(segment.to)}</span><b>${coachText(segment)}</b></div>`).join("");
    const metrics = distance ? `${distance} km` : day.transport.includes("flight") ? "飞行日" : visits.length ? `${visits.length} 个停留` : "抵达日";
    const collapsed = state.collapsedDays.has(day.day);
    const action = collapsed ? "展开" : "收起";
    return `<section class="day-flow ${collapsed ? "is-collapsed" : ""}" data-day-flow="${day.day}"><header class="day-flow-head"><span class="flow-day">D${String(day.day).padStart(2, "0")}</span><div><small>${day.date} · ${day.weekday}</small><b>${esc(cityNameForRoute(day))}</b></div><em>${metrics}</em><button class="day-toggle" data-toggle-day="${day.day}" aria-expanded="${String(!collapsed)}" aria-label="${action}第 ${day.day} 天行程" title="${action}"><i data-lucide="${collapsed ? "chevron-down" : "chevron-up"}"></i></button></header><div class="day-flow-body" ${collapsed ? "hidden" : ""}>${segmentMarkup}${visits.length ? `<div class="flow-stops">${visits.map((visit, index) => flowStop(visit, index + 1)).join("")}</div>` : `<div class="flow-note"><i data-lucide="${day.transport.includes("flight") ? "plane" : "bed-double"}"></i><span>${esc(day.notes?.[0] || "酒店休整与行前准备")}</span></div>`}</div></section>`;
  }

  function flowStop(visit, index) {
    const duration = minimumStayLabel(visit, visit.modes.includes("food") ? "特色品尝" : "团队安排");
    return `<button class="flow-stop" data-spot="${esc(visit.nameZh)}" data-city="${esc(visit.city)}"><span class="flow-stop-number">${String(index).padStart(2, "0")}</span><span class="flow-stop-content"><small>${esc(visit.city)} · ${duration}</small><b>${esc(visit.nameZh)}</b><span class="mode-row">${modeTags(visit.modes)}</span></span><i data-lucide="chevron-right"></i></button>`;
  }

  function mapView() {
    const mapAction = state.mapCollapsed ? "展开地图" : "收起地图";
    const mapIcon = state.mapCollapsed ? "chevron-down" : "chevron-up";
    return `<section class="view map-view"><header class="map-title"><div class="eyebrow">Interactive route</div><h1>路线地图</h1><button class="map-collapse-toggle" data-toggle-map aria-expanded="${String(!state.mapCollapsed)}" aria-label="${mapAction}" title="${mapAction}"><i data-lucide="${mapIcon}" aria-hidden="true"></i><span>${mapAction}</span></button></header><section class="map-canvas-panel" data-map-panel ${state.mapCollapsed ? "hidden" : ""}><div id="mobileMap" aria-label="西班牙葡萄牙行程地图"></div><div class="map-legend"><span><i style="background:#c85b4d"></i>途经城市</span><span><i style="background:#c85b4d"></i>入住酒店</span><span><i style="background:#2d6f91"></i>行程景点</span><span><i style="background:#368f6a"></i>城市代表景点</span></div></section><section class="map-stay-section" aria-label="每日住宿信息"><div class="map-stay-heading"><div><div class="eyebrow">Hotel stays</div><h2>每日住宿信息</h2></div><span>点击酒店查看详情</span></div><div class="map-route-list">${itinerary.days.map(day => `<div class="route-day-line"><b>D${day.day}</b><div><span>${esc(day.route.join(" → "))}</span><small>${day.segments.filter(segment => segment.mode === "coach").map(coachEstimateText).join(" · ") || (day.transport.includes("flight") ? "航班日" : day.visits.length ? "市内游览" : "抵达日")}</small>${hotelsForDay(day.day).map(hotelRouteLink).join("")}${mapMealTags(day)}</div></div>`).join("")}</div></section></section>`;
  }

  function toggleMapPanel() {
    state.mapCollapsed = !state.mapCollapsed;
    const panel = document.querySelector("[data-map-panel]");
    const button = document.querySelector("[data-toggle-map]");
    if (!panel || !button) return;
    panel.hidden = state.mapCollapsed;
    const action = state.mapCollapsed ? "展开地图" : "收起地图";
    button.setAttribute("aria-expanded", String(!state.mapCollapsed));
    button.setAttribute("aria-label", action);
    button.setAttribute("title", action);
    button.innerHTML = `<i data-lucide="${state.mapCollapsed ? "chevron-down" : "chevron-up"}" aria-hidden="true"></i><span>${action}</span>`;
    if (!state.mapCollapsed) window.setTimeout(() => state.map?.resize(), 0);
    refreshIcons();
  }

  function hotelsForDay(day) {
    return (C.hotels || []).filter(hotel => hotel.days?.includes(day));
  }

  function hotelRouteLink(hotel) {
    return `<button class="route-hotel-link" data-hotel="${esc(hotel.name)}" aria-label="查看 ${esc(hotel.name)} 的住宿信息"><i data-lucide="bed-double" aria-hidden="true"></i><span><small>入住</small><b>${esc(hotel.name)}</b></span><i data-lucide="chevron-right" aria-hidden="true"></i></button>`;
  }

  function citiesView() {
    return `<section class="view cities-view"><header class="cities-header"><div class="eyebrow">City guide</div><h1>城市导览</h1><p>从城市文化入门，再进入当天路线、美食与周边建议。</p></header><div class="city-stack">${cityOrder.map((city, index) => cityCard(city, index)).join("")}</div></section>`;
  }

  function cityCard(city, index) {
    const profile = C.cities[city];
    const highlights = C.cityGuideHighlights?.[city] || { style: "城市建筑脉络", makers: "塑造这座城市的人" };
    const eager = index === 0;
    return `<button class="city-card" data-city-page="${esc(city)}">${responsiveImage(imageKeyFor("", city), city, { loading: eager ? "eager" : "lazy", fetchPriority: eager ? "high" : "", sources: "small", sizes: "(max-width: 600px) calc(100vw - 36px), 524px" })}<span class="city-arrow"><i data-lucide="arrow-up-right"></i></span><div class="city-card-body"><small>${esc(profile.days)} · ${esc(profile.country)}</small><h2>${esc(city)}<span class="city-local-name">${esc(localCityName(city))}</span></h2><div class="city-highlights"><span class="city-highlight"><b>建筑风格</b><i>${esc(highlights.style)}</i></span><span class="city-highlight"><b>关键影响人</b><i>${esc(highlights.makers)}</i></span></div><div class="city-weather" data-city-weather="${esc(city)}">${cityWeatherMarkup(city)}</div></div></button>`;
  }

  function cityView(city) {
    const profile = C.cities[city];
    const visits = cityVisits(city);
    const architecture = profile.architecture || { style: profile.culture, makers: "这座城市的风貌来自不同时代的建造者与日常生活的共同塑造。" };
    return `<section class="view city-detail"><section class="city-hero">${responsiveImage(imageKeyFor("", city), city, { loading: "eager", fetchPriority: "high", sizes: "(max-width: 600px) 100vw, 560px" })}<div class="city-hero-content"><div class="eyebrow">${esc(profile.en)} · ${esc(profile.country)}</div><h1>${esc(city)}<span class="city-hero-local-name">${esc(localCityName(city))}</span></h1><p>${esc(profile.culture)}</p><div class="city-meta"><span>${esc(profile.days)}</span><span>${C.climate[city] || "十月舒适"}</span><span>${visits.length} 个行程节点</span></div></div></section><section class="city-section"><section class="architecture-panel"><div class="architecture-label">建筑与塑城者</div><p class="culture-copy">${esc(architecture.style)}</p><div class="maker-copy"><b>关键影响人</b><p>${esc(architecture.makers)}</p></div></section><div class="section-head"><h2>本城景点</h2><span class="eyebrow">${visits.length} stops</span></div><div class="spot-list">${visits.map((visit, index) => `<button class="spot-button" data-spot="${esc(visit.nameZh)}" data-city="${esc(city)}"><span class="spot-number">${String(index + 1).padStart(2, "0")}</span><span class="spot-name"><b>${esc(visit.nameZh)}</b><i class="spot-local-name">${esc(localSpotName(visit.nameZh))}</i>${visit.minimumDurationMinutes ? `<span class="spot-stay">游览${minimumStayLabel(visit)}</span>` : ""}<span class="mode-row">${modeTags(visit.modes)}</span></span><i data-lucide="chevron-right"></i></button>`).join("")}</div><div class="section-head"><h2>逛吃推荐</h2></div><div class="food-list">${profile.nearby.map(([name, desc]) => foodCard(name, desc, city)).join("")}</div></section></section>`;
  }

  function foodCard(name, desc, city) {
    const icon = /市场|市集|街|区/.test(name) ? "store" : /伴手礼|糖|巧克力|瓷|香水|软木|陶|橄榄油|罐头|花砖/.test(name) ? "shopping-bag" : "utensils";
    const mapUrl = googleMapsPlaceUrl(`${name} ${localCityName(city) || city}`);
    return `<article class="food-card"><span class="food-kind"><i data-lucide="${icon}"></i></span><div class="food-copy"><b>${esc(name)}</b><span>${esc(desc)}</span><a class="food-map-link" href="${esc(mapUrl)}" target="_blank" rel="noopener"><i data-lucide="map-pin"></i>在 Google Maps 中查看</a></div></article>`;
  }

  function checklistView() {
    const active = state.checklist;
    const subtitle = active === "汇率转换" ? "自动读取 EUR/CNY 日参考汇率，也可手动修改。" : "勾选会保留在当前设备，出发前可随时核对。";
    const content = active === "汇率转换" ? exchangeTool() : `${active === "必备清单" ? flightInformationMarkup() : ""}${defaultChecklistMarkup(active)}${customChecklistMarkup(active)}`;
    return `<section class="view checklist-view"><header class="checklist-header"><div class="eyebrow">Ready to go</div><h1>旅行清单</h1><p>${subtitle}</p></header><div class="checklist-tabs">${Object.keys(checkSections).map(name => `<button class="check-tab ${active === name ? "active" : ""}" data-check-section="${name}">${name}</button>`).join("")}</div><div class="check-panel">${content}</div></section>`;
  }

  function flightInformationMarkup() {
    return `<section class="check-group checklist-flight-group"><h3>航班信息</h3><div class="flight-card"><span class="flight-airline">首都航空 · Beijing Capital Airlines</span><strong>JD605 杭州 → 马德里</strong><span>09/30 00:35 起飞 · 08:35 抵达（当地时间）</span><em>计划航程约 14.0 小时</em><strong>JD622 里斯本 → 杭州</strong><span>10/08 11:55 起飞 · 10/09 08:10 抵达（当地时间）</span><em>计划航程约 13.3 小时</em><small>来源：行程单；航程按当地起降时间及夏令时换算。</small></div></section>`;
  }

  function defaultChecklistMarkup(section) {
    const groups = checkSections[section].map((group, groupIndex) => {
      const rows = group.items.map((item, itemIndex) => checklistRowMarkup(section, groupIndex, itemIndex, item)).join("");
      return `<section class="check-group"><h3>${esc(group.title)}</h3>${rows}</section>`;
    }).join("");
    return `${groups}<p class="checklist-source">来源：用户提供清单（2026-09-28）。</p>`;
  }

  function checklistRowMarkup(section, groupIndex, itemIndex, item) {
    const id = `${section}-${groupIndex}-${itemIndex}`;
    const done = savedChecks[id] ? "done" : "";
    const phones = typeof item === "object" ? item.phones || [] : [];
    const label = typeof item === "object" ? item.label : item;
    const phoneLinks = phones.length ? `：<span class="check-phone-links">${phones.map(phone => `<a class="check-phone" href="tel:${esc(String(phone).replace(/[^+\d]/g, ""))}">${esc(phone)}</a>`).join("、")}</span>` : "";
    return `<label class="check-row ${done}"><input type="checkbox" data-check="${esc(id)}" ${savedChecks[id] ? "checked" : ""}><span>${esc(label)}${phoneLinks}</span></label>`;
  }

  function customChecklistMarkup(section) {
    const items = customChecklistItems[section] || [];
    const rows = items.map(item => {
      const checkId = `${section}-custom-${item.id}`;
      if (state.editingChecklistItemId === item.id) {
        return `<div class="check-row custom-check-row custom-check-row-editing"><input class="packing-text-input" data-edit-checklist-input="${esc(item.id)}" type="text" maxlength="60" value="${esc(item.text)}" aria-label="修改个人${esc(section)}补充"><span class="packing-edit-actions"><button class="packing-edit-button" data-save-checklist-item="${esc(item.id)}" data-checklist-section="${esc(section)}" aria-label="保存" title="保存"><i data-lucide="check"></i></button><button class="packing-edit-button" data-cancel-checklist-edit aria-label="取消" title="取消"><i data-lucide="x"></i></button></span></div>`;
      }
      return `<div class="check-row custom-check-row ${savedChecks[checkId] ? "done" : ""}"><input type="checkbox" data-check="${esc(checkId)}" ${savedChecks[checkId] ? "checked" : ""}><span>${esc(item.text)}</span><button class="packing-edit-button" data-edit-checklist-item="${esc(item.id)}" data-checklist-section="${esc(section)}" aria-label="修改 ${esc(item.text)}" title="修改"><i data-lucide="pencil"></i></button></div>`;
    }).join("");
    return `<section class="custom-packing-group" aria-label="我的${esc(section)}补充"><div class="custom-packing-heading"><div><span class="eyebrow">Personal list</span><h3>我的补充</h3></div><p>原有清单保持不变</p></div><p class="checklist-save-status" data-checklist-save-status data-state="${esc(state.checklistSaveState.type)}">${esc(state.checklistSaveState.message)}</p><div class="packing-add-row"><input data-new-checklist-item type="text" maxlength="60" placeholder="添加${esc(section)}补充项目" aria-label="添加${esc(section)}补充项目"><button class="packing-add-button" data-add-checklist-item data-checklist-section="${esc(section)}"><i data-lucide="plus"></i><span>新增</span></button></div>${rows ? `<div class="custom-packing-list">${rows}</div>` : `<p class="custom-packing-empty">还没有补充项目</p>`}</section>`;
  }

  function addCustomChecklistItem(section) {
    const input = document.querySelector("[data-new-checklist-item]");
    const text = input?.value.trim();
    if (!text || !editableChecklistSections.includes(section)) {
      input?.focus();
      return;
    }
    const item = { id: customChecklistItemId(), text };
    customChecklistItems[section].push(item);
    if (!saveCustomChecklistItems()) customChecklistItems[section] = customChecklistItems[section].filter(entry => entry.id !== item.id);
    render();
    document.querySelector("[data-new-checklist-item]")?.focus();
  }

  function editCustomChecklistItem(section, id) {
    if (!customChecklistItems[section]?.some(item => item.id === id)) return;
    state.editingChecklistItemId = id;
    render();
    const input = document.querySelector("[data-edit-checklist-input]");
    input?.focus();
    input?.select();
  }

  function saveCustomChecklistItem(section, id) {
    const item = customChecklistItems[section]?.find(entry => entry.id === id);
    const input = document.querySelector(`[data-edit-checklist-input="${CSS.escape(id)}"]`);
    const text = input?.value.trim();
    if (!item || !text) {
      input?.focus();
      return;
    }
    const previousText = item.text;
    item.text = text;
    if (!saveCustomChecklistItems()) item.text = previousText;
    state.editingChecklistItemId = null;
    render();
  }

  function exchangeTool() {
    const eurAmount = 100;
    const cnyAmount = eurAmount * exchangeRate;
    return `<section class="exchange-tool" aria-label="欧元人民币汇率转换"><div class="exchange-rate"><span>参考汇率</span><label>1 EUR = <input data-exchange-rate type="number" inputmode="decimal" min="0.01" step="0.0001" value="${formatExchangeRate(exchangeRate)}"> CNY</label></div><p class="exchange-source"><i data-lucide="refresh-cw"></i><span data-exchange-status aria-live="polite">正在更新 ECB 日参考汇率...</span></p><div class="exchange-fields"><label class="exchange-field"><span>欧元<small>EUR</small></span><input data-currency-input="eur" type="number" inputmode="decimal" min="0" step="0.01" value="${formatCurrencyAmount(eurAmount)}"></label><span class="exchange-direction" aria-hidden="true"><i data-lucide="arrow-down-up"></i></span><label class="exchange-field"><span>人民币<small>CNY</small></span><input data-currency-input="cny" type="number" inputmode="decimal" min="0" step="0.01" value="${formatCurrencyAmount(cnyAmount)}"></label></div><p class="exchange-note">实时数据由 Frankfurter 提供，基于欧洲央行日参考汇率；实际以银行、信用卡或换汇点的最终结算汇率为准。</p></section>`;
  }

  function formatCurrencyAmount(value) {
    return Number(Math.max(0, value).toFixed(2)).toString();
  }

  function formatExchangeRate(value) {
    return Number(value.toFixed(4)).toString();
  }

  function syncCurrencyConverter(sourceCurrency) {
    const source = document.querySelector(`[data-currency-input="${sourceCurrency}"]`);
    const targetCurrency = sourceCurrency === "eur" ? "cny" : "eur";
    const target = document.querySelector(`[data-currency-input="${targetCurrency}"]`);
    const value = Number(source?.value);
    if (!target) return;
    if (!Number.isFinite(value) || source?.value === "") {
      target.value = "";
      return;
    }
    target.value = formatCurrencyAmount(sourceCurrency === "eur" ? value * exchangeRate : value / exchangeRate);
  }

  async function refreshExchangeRate() {
    const status = document.querySelector("[data-exchange-status]");
    if (!status) return;
    const requestRevision = exchangeRateRevision;
    try {
      const response = await fetch("https://api.frankfurter.dev/v1/latest?from=EUR&to=CNY");
      if (!response.ok) throw new Error("汇率服务不可用");
      const data = await response.json();
      const nextRate = Number(data.rates?.CNY);
      if (!Number.isFinite(nextRate) || nextRate <= 0) throw new Error("汇率数据无效");
      if (requestRevision !== exchangeRateRevision) {
        status.textContent = "已保留手动输入的参考汇率";
        return;
      }
      exchangeRate = nextRate;
      saveStoredValue("iberia.mobile.exchange-rate", exchangeRate.toString());
      const rateInput = document.querySelector("[data-exchange-rate]");
      if (rateInput) rateInput.value = formatExchangeRate(exchangeRate);
      syncCurrencyConverter("eur");
      status.textContent = `ECB 日参考 · ${data.date}`;
    } catch {
      status.textContent = "暂未获取实时汇率，正在使用本地参考值";
    }
  }

  function spotCategory(kind) {
    const categories = {
      interior: { hours: "按预约或官方当日开放时段入场，时段与安检规则会随季节、礼仪活动调整。", tickets: "建议提前预约；团队票、登塔或特展常与常规参观分时管理。", facilities: "洗手间、休息座椅和无障碍入口通常集中在检票区或出口附近，以现场导览图为准。", safety: "进出狭窄展厅时不要逆行；石阶、木地板和人流交汇处放慢脚步。", protection: "不触摸壁画、织物、石雕和宗教陈设；馆内拍摄、闪光灯与自拍杆以现场规则为准。" },
      sacred: { hours: "礼拜、弥撒与参观常分开安排；开放时间和着装要求以门口当天公告为准。", tickets: "外观通常无需预约；登塔、博物馆或特别区域可能单独售票或限流。", facilities: "洗手间多在附属博物馆、游客服务点或广场周边；无障碍入口请按标识寻找。", safety: "礼拜开始前后人流会集中，进入时降低音量，石阶和地面在雨后易滑。", protection: "尊重祈祷区，不跨越围栏；避免露肩、过短下装与闪光灯拍摄。" },
      food: { hours: "按餐厅当天营业时段与团队桌次执行，午晚餐高峰常需排队。", tickets: "无需门票；过敏原、素食和忌口请在落座前告知领队或服务人员。", facilities: "洗手间在店内，行李不要堵住通道；座位与饮水服务以场馆安排为准。", safety: "热盘、热汤和拥挤通道注意烫伤与碰撞；个人药物与过敏信息随身保留。", protection: "尊重餐厅节奏，减少一次性浪费；对传统食材保持开放，但不勉强食用。" },
      shopping: { hours: "通常按零售日间时段开放，节假日、促销日和集合安排可能改变实际停留节奏。", tickets: "无需门票；先确认集合时间，再决定购物、咖啡或替代散步路线。", facilities: "洗手间与休息区多在服务台、餐饮区或商场公共区；无障碍路线按现场标识。", safety: "保管护照、手机和购物袋，不在收银区外展示现金；离开前再次核对集合点。", protection: "尊重店铺拍摄规定，不把公共通道当作拍摄布景。" },
      performance: { hours: "以当日开演、入场与散场时间为准，通常需提前入座。", tickets: "本行程按包含项目与当天场馆安排执行，座位、饮品和入场规则听从领队通知。", facilities: "洗手间通常在入场前厅或中场休息区；演出开始后尽量不离座。", safety: "灯光转暗后注意台阶和桌椅，手机调至静音。", protection: "关闭闪光灯和提示音，不干扰演者与其他观众。" },
      nature: { hours: "户外区域通常全天可看，但停车、游客中心和天气预警以当天公告为准。", tickets: "多数外观无需门票；恶劣天气、封路或强风时应接受临时调整。", facilities: "洗手间、休息处与饮水补给集中在停车区或游客中心，进入步道前先使用。", safety: "严格留在护栏与标示步道内，强风、湿滑和崖边是首要风险。", protection: "不翻越围栏、不采摘植物、不向海崖或水体抛掷物品。" },
      outdoor: { hours: "公共外观区域通常可自由步行；活动、施工或节庆时以现场管理为准。", tickets: "外观无需预约；如临时入馆或登塔，按官方当日售票与限流规则处理。", facilities: "洗手间多在游客中心、博物馆、咖啡馆或广场外缘，提前留意位置。", safety: "石板路、台阶和车行道交界处慢行；人流密集区看管好随身物品。", protection: "不攀爬雕像、喷泉、城墙或遗址，不在文物表面刻画、张贴。" }
    };
    return categories[kind] || categories.outdoor;
  }

  function classifySpot(visit) {
    const modes = visit?.modes || [];
    if (modes.includes("food")) return "food";
    if (modes.includes("shopping")) return "shopping";
    if (modes.includes("show")) return "performance";
    if (modes.includes("inside")) return "interior";
    return "outdoor";
  }

  function googleMapsSearchUrl(query, coordinates) {
    const [longitude, latitude] = coordinates || [-3.7038, 40.4168];
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${query} near ${latitude},${longitude}`)}`;
  }

  function googleMapsPlaceUrl(name) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
  }

  function guideSection(index, title, body, open = false) {
    return `<details class="spot-guide-section"${open ? " open" : ""}><summary><span>${String(index).padStart(2, "0")}</span><b>${esc(title)}</b><i data-lucide="chevron-down" aria-hidden="true"></i></summary><div class="spot-guide-copy">${body}</div></details>`;
  }

  function googleServiceLinks(name, city, coordinates) {
    const local = localSpotName(name) || name;
    const locale = localCityName(city) || city;
    const localDining = googleMapsSearchUrl(`top rated local restaurant within 1 km of ${local}`, coordinates);
    const casualDining = googleMapsSearchUrl(`top rated cafe or casual restaurant within 1 km of ${local}`, coordinates);
    const supermarket = googleMapsSearchUrl(`nearest supermarket within 1 km of ${local}`, coordinates);
    return `<section class="spot-services"><div class="spot-services-head"><b>附近 1km 服务</b><span>Google Maps 实时排序</span></div><p>评分、营业状态和距离会实时变化，打开后请确认筛选范围为“距离”和“评分最高”。</p><div class="spot-service-links"><a href="${esc(localDining)}" target="_blank" rel="noopener"><i data-lucide="utensils"></i><span>高分本地餐厅</span><small>${esc(locale)}</small></a><a href="${esc(casualDining)}" target="_blank" rel="noopener"><i data-lucide="coffee"></i><span>高分轻食 / 咖啡</span><small>${esc(locale)}</small></a><a href="${esc(supermarket)}" target="_blank" rel="noopener"><i data-lucide="shopping-basket"></i><span>最近商超</span><small>${esc(locale)}</small></a></div></section>`;
  }

  function openHotel(name) {
    const hotel = (C.hotels || []).find(item => item.name === name);
    if (!hotel) return;
    const maps = googleMapsPlaceUrl(hotel.name);
    const dining = googleMapsSearchUrl(`top rated restaurant within 1 km of ${hotel.name}`, hotel.coordinates);
    const shopping = googleMapsSearchUrl(`shopping mall or supermarket within 1 km of ${hotel.name}`, hotel.coordinates);
    const nearby = googleMapsSearchUrl(`things to do within 1 km of ${hotel.name}`, hotel.coordinates);
    sheetContent.innerHTML = `<section class="hotel-sheet"><header class="hotel-sheet-header"><div class="eyebrow">Hotel stay</div><h2>${esc(hotel.name)}</h2><p>${esc(hotel.stay)} · ${esc(hotel.city)}</p></header><section class="hotel-sheet-body"><div class="hotel-facts"><div><b>${esc(hotel.city)}</b><span>住宿区域</span></div><div><b>${esc(hotel.stay)}</b><span>行程住宿</span></div></div><section class="hotel-intro"><h3>酒店简介</h3><p>${esc(hotel.intro)}</p><p class="hotel-address"><i data-lucide="map-pin"></i><span>${esc(hotel.address)}</span></p></section><section class="hotel-live"><div class="hotel-live-head"><h3>实时评价</h3><span>Google Maps</span></div><p>评分、旅客评价、营业状态会变化，点击后查看当前信息。</p><a class="hotel-map-button" href="${esc(maps)}" target="_blank" rel="noopener"><i data-lucide="star"></i>查看酒店评分与评价</a></section><section class="hotel-live"><div class="hotel-live-head"><h3>酒店 1km 内</h3><span>实时推荐</span></div><p>以下入口以酒店定位为中心打开 Google Maps；请优先按“距离”和“评分最高”筛选。</p><div class="hotel-nearby-links"><a href="${esc(dining)}" target="_blank" rel="noopener"><i data-lucide="utensils"></i><span>高分饭店</span></a><a href="${esc(shopping)}" target="_blank" rel="noopener"><i data-lucide="shopping-bag"></i><span>购物中心 / 商超</span></a><a href="${esc(nearby)}" target="_blank" rel="noopener"><i data-lucide="map"></i><span>附近可逛</span></a></div></section><p class="hotel-source">来源：${esc(hotel.source)}；评分、评价及周边推荐：Google Maps 实时查询。</p></section></section>`;
    sheet.showModal();
    refreshIcons();
  }

  function openSpotAnalysis(name, city) {
    const analysis = C.architecturalAnalyses?.[name];
    const localName = localSpotName(name);
    const body = analysis
      ? `<figure class="analysis-figure"><img src="${esc(analysis.image)}" alt="${esc(`${name}建筑剖析图`)}" loading="eager" decoding="async"><figcaption>图源：${esc(analysis.source)}</figcaption></figure>`
      : `<section class="analysis-empty"><i data-lucide="ruler"></i><b>剖析图待补充</b><p>该景点的建筑剖析图将在收到图片后显示在这里。</p></section>`;
    sheetContent.innerHTML = `<section class="analysis-sheet"><header class="analysis-header"><div><span>Architectural analysis</span><h2>${esc(name)}${localName ? `<small>${esc(localName)}</small>` : ""}</h2></div><button class="analysis-back" data-return-spot="${esc(name)}" data-city="${esc(city)}"><i data-lucide="arrow-left"></i>返回详情</button></header>${body}</section>`;
    refreshIcons();
  }

  function openSpot(name, city) {
    const visit = cityVisits(city).find(item => item.nameZh === name) || allVisits.find(item => item.nameZh === name);
    const profile = C.cities[city] || {};
    const guide = G.spots[name] || {};
    const kind = guide.kind || classifySpot(visit);
    const category = spotCategory(kind);
    const photoKey = imageKeyFor(name, city);
    const duration = minimumStayLabel(visit, visit?.modes.includes("food") ? "特色品尝" : "行程未标注");
    const coordinates = C.poiCoordinates?.[name] || C.cityCoordinates?.[city];
    const notice = C.spotNotices?.[name];
    const cityGuide = profile.guide || {};
    const overview = guide.position || `${city}行程节点，位于团队当天步行或车行路线内。`;
    const story = guide.story || cityGuide.history || `${name}是${city}历史层次的重要观察点。`;
    const people = guide.people || profile.architecture?.makers || "不同年代的建造者、居民与使用者共同塑造了这里。";
    const culture = guide.culture || profile.architecture?.style || profile.culture || "从空间、材料和日常使用中理解它的地方性。";
    const focus = guide.focus || cityGuide.photo || "先看整体尺度，再寻找材质、纹样与光线变化。";
    const route = guide.route || cityGuide.route || "按团队集合点进入，沿主要视线完成停留后回到指定出口。";
    const honor = guide.honor || "本行程的重要文化与景观节点。";
    const religion = kind === "sacred" ? "这里同时是参观地与仍在使用的宗教空间，礼拜、节庆和日常祈祷优先于旅游动线。" : kind === "food" ? "饮食习俗是地方文化的一部分，理解食材与餐桌礼节比只拍成品更有意思。" : kind === "performance" ? "表演传统来自持续的社区实践，现场即兴与观众礼仪同样构成文化的一部分。" : "它的文化意义不仅在外形，也在它如何被城市居民反复使用、纪念和保护。";
    const seasonal = kind === "nature" ? "晴天视野远、风也更强；阴天和雾天请把安全放在照片之前。" : kind === "outdoor" || kind === "shopping" ? "清晨人流较少，傍晚光线更柔；雨后石板与金属栏杆会更滑。" : "开门初段与午后交接的人流通常较缓，室内光线和拍摄规则以现场为准。";
    const nearby = guide.nearby || cityGuide.nearby || "时间充裕可按城市页的推荐继续串联附近街区与公共空间。";
    const foodHint = profile.nearby?.slice(0, 2).map(([place]) => place).join("、") || "城市页“逛吃推荐”中的推荐";
    const giftHint = profile.nearby?.[2]?.[0] || "当地工艺、食材与博物馆商店";
    const detailSections = [
      guideSection(1, "先把它看明白", `<p class="spot-guide-opening">站在这里，先别急着按快门。${esc(overview)}</p><p class="spot-name-card">“${esc(guide.card || `${name}，是理解${city}的一扇现场窗口。`)}”</p><p><b>到场前知道：</b>${esc(category.hours)}</p>`, true),
      guideSection(2, "翻开它的旧账簿", `<p>${esc(story)}</p><p><b>把视线转向人：</b>${esc(people)}</p>`),
      guideSection(3, "不只好看，它在说什么", `<p><b>听建筑自己说话：</b>${esc(culture)}</p><p><b>这里仍在遵循的日常：</b>${esc(religion)}</p><p><b>今天为什么值得被守护：</b>${esc(honor)}</p>`),
      guideSection(4, "别只拍正面", `<p><b>把镜头先放到这里：</b>${esc(focus)}</p><p><b>光线会替它换表情：</b>${esc(seasonal)}</p>`),
      guideSection(5, "跟着脚步这样逛", `<p><b>走法已经替你排好：</b>${esc(route)}</p><p><b>把时间花在刀刃上：</b>行程停留${esc(duration)}，先完成主视角与核心细节，再决定是否延伸到周边。</p><p><b>想休息时往哪找：</b>${esc(category.facilities)}</p><p><b>排队少一点的关键：</b>${esc(category.tickets)}</p>`),
      guideSection(6, "把分寸留在身上", `<p><b>让这段路走得稳些：</b>${esc(category.safety)}</p><p><b>给文物留一点距离：</b>${esc(category.protection)}</p><p><b>别让集合变成寻找：</b>集合点、返程时间和领队电话以当天群通知为准；紧急情况可拨打西班牙、葡萄牙通用紧急电话 112。</p>`),
      guideSection(7, "胃口与下一站", `<p><b>附近先尝什么：</b>${esc(foodHint)}；下方入口会按当前位置打开 Google Maps 的实时高分结果。</p><p><b>离开时带什么：</b>${esc(giftHint)}；优先选择有产地、成分和价格标识的店铺，避开无来源的“手作”标签。</p><p><b>时间还够，就接着走：</b>${esc(nearby)}</p>${googleServiceLinks(name, city, coordinates)}`, true)
    ].join("");
    sheetContent.innerHTML = `<section class="sheet-hero">${responsiveImage(photoKey, name, { loading: "eager", fetchPriority: "high", sizes: "(max-width: 600px) 100vw, 560px", fallbackKey: imageKeyFor("", city) })}<h2>${esc(name)}<span class="sheet-local-name">${esc(localSpotName(name))}</span></h2></section><section class="sheet-body spot-guide-body"><div class="tag-row">${modeTags(visit?.modes || [])}</div><div class="spot-facts"><div><b>${esc(city)}</b><span>所在城市</span></div><div><b>${esc(duration)}</b><span>行程停留</span></div><div><b>${esc(visit?.modes.includes("inside") ? "预约 / 入内" : "按行程外观")}</b><span>参观方式</span></div></div>${detailSections}${notice ? `<section class="spot-notice"><h3>${esc(notice.title)}</h3><p>${esc(notice.text)}</p></section>` : ""}<button class="sheet-analysis-link" data-spot-analysis="${esc(name)}" data-city="${esc(city)}"><i data-lucide="ruler"></i>查看建筑剖析图</button><button class="sheet-map-link" data-map-spot="${esc(name)}" data-city="${esc(city)}"><i data-lucide="map-pin"></i>在路书地图中查看景点</button></section>`;
    sheet.showModal();
    refreshIcons();
    const citySpots = cityVisits(city);
    const currentIndex = citySpots.findIndex(item => item.nameZh === name);
    scheduleImagePrefetch(citySpots.slice(currentIndex + 1, currentIndex + 3).map(item => imageKeyFor(item.nameZh, item.city)));
  }

  function initializeMap() {
    const mapContainer = document.getElementById("mobileMap");
    if (!mapContainer || !window.mapboxgl || state.map) return;
    window.mapboxgl.accessToken = mapboxToken;
    const cityNames = itinerary.routeNodes.map(node => node.nameZh).filter((name, index, list) => C.cityCoordinates[name] && list.indexOf(name) === index);
    const coordinates = cityNames.map(name => C.cityCoordinates[name]);
    state.map = new mapboxgl.Map({ container: "mobileMap", style: "mapbox://styles/mapbox/light-v11", center: [-4.5, 39.3], zoom: 4.35, attributionControl: false });
    state.map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    state.map.on("load", () => {
      state.map.addSource("mobile-route", { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates } } });
      state.map.addLayer({ id: "mobile-route-line", type: "line", source: "mobile-route", paint: { "line-color": "#c85b4d", "line-width": 3, "line-opacity": .85 } });
      cityNames.forEach(name => marker(name, C.cityCoordinates[name], "city-marker", name));
      allVisits.filter(visit => C.poiCoordinates[visit.nameZh]).forEach(visit => marker(visit.nameZh, C.poiCoordinates[visit.nameZh], "poi-marker", visit.city));
      const visitedNames = new Set(allVisits.map(visit => visit.nameZh));
      cityNames.forEach(city => (C.cityLandmarks?.[city] || []).filter(landmark => !visitedNames.has(landmark.name)).forEach(landmark => marker(landmark.name, landmark.coordinates, "highlight-marker", `${city} · ${landmark.local}`)));
      (C.hotels || []).forEach(hotel => marker(hotel.name, hotel.coordinates, "hotel-marker", `${hotel.stay} · ${hotel.city}`, { address: hotel.address, source: hotel.source }));
      refreshIcons();
      const bounds = coordinates.reduce((value, coordinate) => value.extend(coordinate), new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));
      state.map.fitBounds(bounds, { padding: 38, duration: 0 });
      const updatePlaceLabelVisibility = () => mapContainer.classList.toggle("show-place-labels", state.map.getZoom() >= 7.5);
      updatePlaceLabelVisibility();
      state.map.on("zoomend", updatePlaceLabelVisibility);
      if (state.mapFocus) state.map.flyTo({ center: state.mapFocus, zoom: 14, duration: 700 });
    });
  }

  function marker(name, coordinates, className, subtitle, details = {}) {
    const element = document.createElement("button");
    element.className = className;
    element.setAttribute("aria-label", name);
    if (["city-marker", "poi-marker", "highlight-marker"].includes(className)) element.innerHTML = `<span class="map-marker-label">${esc(name)}</span>`;
    if (className === "hotel-marker") element.innerHTML = '<i data-lucide="bed-double" aria-hidden="true"></i>';
    const color = ["city-marker", "hotel-marker"].includes(className) ? "#c85b4d" : className === "highlight-marker" ? "#368f6a" : "#2d6f91";
    const size = className === "hotel-marker" ? 18 : className === "city-marker" ? 14 : 10;
    element.style.cssText = `display:grid;place-items:center;width:${size}px;height:${size}px;border:2px solid #fff;border-radius:50%;background:${color};box-shadow:0 1px 5px rgba(0,0,0,.28);padding:0;`;
    const address = details.address ? `<small>${esc(details.address)}</small>` : "";
    const source = details.source ? `<small class="map-popup-source">来源：${esc(details.source)}</small>` : "";
    new mapboxgl.Marker({ element }).setLngLat(coordinates).setPopup(new mapboxgl.Popup({ offset: 14 }).setHTML(`<b>${esc(name)}</b><span>${esc(subtitle)}</span>${address}${source}`)).addTo(state.map);
  }

  function render() {
    stopHomeAutoScroll();
    if (state.map && state.view !== "map") { state.map.remove(); state.map = null; }
    topbar.innerHTML = topbarMarkup();
    tabbar.innerHTML = tabbarMarkup();
    app.innerHTML = state.view === "home" ? homeView() : state.view === "itinerary" ? itineraryView() : state.view === "map" ? mapView() : state.view === "cities" ? citiesView() : state.view === "city" ? cityView(state.city) : state.view === "translation" ? translationView() : state.view === "history" ? historyView() : checklistView();
    refreshIcons();
    window.scrollTo({ top: 0, behavior: "instant" });
    if (state.view === "map") window.setTimeout(initializeMap, 0);
    if (state.view === "cities") window.setTimeout(loadCityWeather, 0);
    if (state.view === "checklist" && state.checklist === "汇率转换") window.setTimeout(refreshExchangeRate, 0);
    if (state.view === "home") setupHomeAutoScroll();
    prefetchForCurrentView();
  }

  function refreshIcons() {
    if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
  }

  let activeSpeechButton = null;
  let voiceRecorder = null;
  let voiceStream = null;
  let voiceRecordingTimer = null;
  let voiceRequestInFlight = false;
  let textRequestInFlight = false;

  function voiceDirectionLabels(direction, recording = false) {
    if (recording) return { primary: "结束录音", secondary: "再次点击完成" };
    return direction === "zh-to-es" ? { primary: "说中文", secondary: "→ 西班牙语" } : { primary: "说西班牙语", secondary: "→ 中文" };
  }

  function voicePanel() {
    return document.querySelector("[data-voice-panel]");
  }

  function textPanel() {
    return document.querySelector("[data-text-panel]");
  }

  function setVoiceStatus(message, tone = "ready") {
    const status = voicePanel()?.querySelector("[data-voice-status]");
    if (!status) return;
    status.dataset.tone = tone;
    status.innerHTML = `<i data-lucide="${tone === "error" ? "circle-alert" : tone === "recording" ? "radio" : tone === "processing" ? "loader-circle" : "mic"}" aria-hidden="true"></i>${esc(message)}`;
    refreshIcons();
  }

  function setVoiceButtons(activeDirection = null, busy = false) {
    voicePanel()?.querySelectorAll("[data-voice-direction]").forEach(button => {
      const direction = button.dataset.voiceDirection;
      const recording = activeDirection === direction;
      const labels = voiceDirectionLabels(direction, recording);
      button.disabled = busy || Boolean(activeDirection && !recording);
      button.classList.toggle("is-recording", recording);
      button.setAttribute("aria-pressed", String(recording));
      button.querySelector("span").innerHTML = `${esc(labels.primary)}<em>${esc(labels.secondary)}</em>`;
    });
  }

  function releaseVoiceStream() {
    if (voiceRecordingTimer) window.clearTimeout(voiceRecordingTimer);
    voiceRecordingTimer = null;
    voiceStream?.getTracks().forEach(track => track.stop());
    voiceStream = null;
  }

  function renderVoiceResult(sourceText, translatedText, direction) {
    const result = voicePanel()?.querySelector("[data-voice-result]");
    if (!result) return;
    const sourceLanguage = direction === "zh-to-es" ? "中文原文" : "西班牙语原文";
    const targetLanguage = direction === "zh-to-es" ? "西班牙语翻译" : "中文翻译";
    result.hidden = false;
    result.innerHTML = `<div><small>${sourceLanguage}</small><p lang="${direction === "zh-to-es" ? "zh-CN" : "es"}">${esc(sourceText)}</p></div><div><small>${targetLanguage}</small><p lang="${direction === "zh-to-es" ? "es" : "zh-CN"}">${esc(translatedText)}</p></div>`;
  }

  function setTextStatus(message, tone = "ready") {
    const status = textPanel()?.querySelector("[data-text-status]");
    if (!status) return;
    status.dataset.tone = tone;
    status.innerHTML = `<i data-lucide="${tone === "error" ? "circle-alert" : tone === "processing" ? "loader-circle" : tone === "success" ? "circle-check" : "keyboard"}" aria-hidden="true"></i>${esc(message)}`;
    refreshIcons();
  }

  function renderTextResult(translation) {
    const result = textPanel()?.querySelector("[data-text-result]");
    if (!result) return;
    result.hidden = false;
    result.innerHTML = `<small>西班牙语</small><p lang="es">${esc(translation)}</p>`;
  }

  async function submitTextTranslation() {
    if (textRequestInFlight) return;
    const panel = textPanel();
    const input = panel?.querySelector("[data-text-source]");
    const button = panel?.querySelector("[data-text-translate]");
    const text = input?.value.trim();
    if (!text) {
      setTextStatus("请先输入中文内容。", "error");
      input?.focus();
      return;
    }
    textRequestInFlight = true;
    button.disabled = true;
    setTextStatus("正在翻译…", "processing");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(textTranslationEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.translation) throw new Error(payload.error || "翻译服务暂时不可用，请稍后重试。");
      renderTextResult(payload.translation);
      setTextStatus("翻译完成", "success");
    } catch (error) {
      const message = error?.name === "AbortError" ? "请求超时，请稍后重试。" : error?.message || "翻译服务暂时不可用，请稍后重试。";
      setTextStatus(message, "error");
    } finally {
      window.clearTimeout(timeout);
      textRequestInFlight = false;
      button.disabled = false;
    }
  }

  async function submitVoiceTranslation(audio, direction) {
    voiceRequestInFlight = true;
    setVoiceButtons(null, true);
    setVoiceStatus("正在识别并翻译…", "processing");
    const form = new FormData();
    form.append("audio", audio, "travel-voice.webm");
    form.append("direction", direction);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(voiceTranslationEndpoint, { method: "POST", body: form, signal: controller.signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.translation || !payload.transcript) throw new Error(payload.error || "语音服务暂时不可用，请稍后重试。");
      renderVoiceResult(payload.transcript, payload.translation, direction);
      setVoiceStatus("识别与翻译完成", "success");
    } catch (error) {
      const message = error?.name === "AbortError" ? "请求超时，请缩短录音后重试。" : error?.message || "语音服务暂时不可用，请稍后重试。";
      setVoiceStatus(message, "error");
    } finally {
      window.clearTimeout(timeout);
      voiceRequestInFlight = false;
      setVoiceButtons();
    }
  }

  async function toggleVoiceRecording(button) {
    const direction = button.dataset.voiceDirection;
    if (voiceRequestInFlight) return;
    if (voiceRecorder) {
      if (voiceRecorder.direction === direction && voiceRecorder.state !== "inactive") voiceRecorder.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setVoiceStatus("当前浏览器不支持录音，请使用最新版 Safari、Chrome 或微信浏览器。", "error");
      return;
    }
    try {
      voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredType = ["audio/webm;codecs=opus", "audio/webm"].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(voiceStream, preferredType ? { mimeType: preferredType } : undefined);
      const chunks = [];
      recorder.direction = direction;
      recorder.addEventListener("dataavailable", event => { if (event.data.size) chunks.push(event.data); });
      recorder.addEventListener("error", () => setVoiceStatus("录音未完成，请重新开始。", "error"));
      recorder.addEventListener("stop", async () => {
        const audio = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        voiceRecorder = null;
        releaseVoiceStream();
        if (!audio.size) {
          setVoiceButtons();
          setVoiceStatus("没有收到录音，请再试一次。", "error");
          return;
        }
        await submitVoiceTranslation(audio, direction);
      });
      voiceRecorder = recorder;
      recorder.start();
      voiceRecordingTimer = window.setTimeout(() => {
        if (voiceRecorder === recorder && recorder.state !== "inactive") {
          setVoiceStatus("已录满 60 秒，正在结束录音…", "processing");
          recorder.stop();
        }
      }, maxVoiceRecordingMs);
      setVoiceButtons(direction);
      setVoiceStatus("正在录音，再次点击同一按钮结束；最长 60 秒。", "recording");
    } catch {
      releaseVoiceStream();
      setVoiceButtons();
      setVoiceStatus("未取得麦克风权限。请在浏览器设置中允许此网站使用麦克风后重试。", "error");
    }
  }

  function clearSpanishSpeech() {
    if (!activeSpeechButton) return;
    activeSpeechButton.classList.remove("is-speaking");
    activeSpeechButton.setAttribute("aria-pressed", "false");
    activeSpeechButton = null;
  }

  function speakSpanish(text, button) {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      button.classList.add("speech-unavailable");
      window.setTimeout(() => button.classList.remove("speech-unavailable"), 900);
      return;
    }
    const synth = window.speechSynthesis;
    if (activeSpeechButton === button && (synth.speaking || synth.pending)) {
      synth.cancel();
      clearSpanishSpeech();
      return;
    }
    synth.cancel();
    clearSpanishSpeech();
    const utterance = new window.SpeechSynthesisUtterance(text);
    const voices = synth.getVoices();
    const voice = voices.find(item => item.lang.toLowerCase() === "es-es") || voices.find(item => item.lang.toLowerCase().startsWith("es-")) || voices.find(item => item.lang.toLowerCase().startsWith("es"));
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || "es-ES";
    utterance.rate = .82;
    utterance.pitch = 1;
    utterance.onstart = () => {
      activeSpeechButton = button;
      button.classList.add("is-speaking");
      button.setAttribute("aria-pressed", "true");
    };
    const finishSpeech = () => {
      if (activeSpeechButton === button) clearSpanishSpeech();
    };
    utterance.onend = finishSpeech;
    utterance.onerror = finishSpeech;
    activeSpeechButton = button;
    button.classList.add("is-speaking");
    button.setAttribute("aria-pressed", "true");
    synth.speak(utterance);
  }

  document.addEventListener("click", event => {
    const textTranslateButton = event.target.closest("[data-text-translate]");
    if (textTranslateButton) { submitTextTranslation(); return; }
    const voiceDirectionButton = event.target.closest("[data-voice-direction]");
    if (voiceDirectionButton) { toggleVoiceRecording(voiceDirectionButton); return; }
    const speechButton = event.target.closest("[data-speak]");
    if (speechButton) { speakSpanish(speechButton.dataset.speak, speechButton); return; }
    const viewButton = event.target.closest("[data-view]");
    if (viewButton) { state.view = viewButton.dataset.view; state.city = null; state.mapFocus = null; render(); return; }
    const dayButton = event.target.closest("[data-select-day]");
    if (dayButton) { state.selectedDay = Number(dayButton.dataset.selectDay); render(); return; }
    if (event.target.closest("[data-toggle-map]")) { toggleMapPanel(); return; }
    const dayToggleButton = event.target.closest("[data-toggle-day]");
    if (dayToggleButton) {
      const day = Number(dayToggleButton.dataset.toggleDay);
      if (state.collapsedDays.has(day)) state.collapsedDays.delete(day); else state.collapsedDays.add(day);
      const flow = dayToggleButton.closest("[data-day-flow]");
      const body = flow?.querySelector(".day-flow-body");
      const collapsed = state.collapsedDays.has(day);
      flow?.classList.toggle("is-collapsed", collapsed);
      if (body) body.hidden = collapsed;
      dayToggleButton.setAttribute("aria-expanded", String(!collapsed));
      dayToggleButton.setAttribute("aria-label", `${collapsed ? "展开" : "收起"}第 ${day} 天行程`);
      dayToggleButton.title = collapsed ? "展开" : "收起";
      dayToggleButton.innerHTML = `<i data-lucide="${collapsed ? "chevron-down" : "chevron-up"}"></i>`;
      refreshIcons();
      return;
    }
    const cityButton = event.target.closest("[data-city-page]");
    if (cityButton) { state.city = cityButton.dataset.cityPage; state.view = "city"; render(); return; }
    const spotButton = event.target.closest("[data-spot]");
    if (spotButton) { openSpot(spotButton.dataset.spot, spotButton.dataset.city); return; }
    const hotelButton = event.target.closest("[data-hotel]");
    if (hotelButton) { openHotel(hotelButton.dataset.hotel); return; }
    const analysisButton = event.target.closest("[data-spot-analysis]");
    if (analysisButton) { openSpotAnalysis(analysisButton.dataset.spotAnalysis, analysisButton.dataset.city); return; }
    const returnSpotButton = event.target.closest("[data-return-spot]");
    if (returnSpotButton) { openSpot(returnSpotButton.dataset.returnSpot, returnSpotButton.dataset.city); return; }
    const sectionButton = event.target.closest("[data-check-section]");
    if (sectionButton) { state.checklist = sectionButton.dataset.checkSection; state.editingChecklistItemId = null; render(); return; }
    const addChecklistButton = event.target.closest("[data-add-checklist-item]");
    if (addChecklistButton) { addCustomChecklistItem(addChecklistButton.dataset.checklistSection); return; }
    const editChecklistButton = event.target.closest("[data-edit-checklist-item]");
    if (editChecklistButton) { editCustomChecklistItem(editChecklistButton.dataset.checklistSection, editChecklistButton.dataset.editChecklistItem); return; }
    const saveChecklistButton = event.target.closest("[data-save-checklist-item]");
    if (saveChecklistButton) { saveCustomChecklistItem(saveChecklistButton.dataset.checklistSection, saveChecklistButton.dataset.saveChecklistItem); return; }
    if (event.target.closest("[data-cancel-checklist-edit]")) { state.editingChecklistItemId = null; render(); return; }
    if (event.target.closest("[data-action='back-cities']")) { state.view = "cities"; state.city = null; render(); return; }
    if (event.target.closest("[data-close-sheet]")) { sheet.close(); return; }
    const mapSpot = event.target.closest("[data-map-spot]");
    if (mapSpot) { sheet.close(); state.mapFocus = C.poiCoordinates[mapSpot.dataset.mapSpot] || C.cityCoordinates[mapSpot.dataset.city]; state.view = "map"; render(); }
  });

  document.addEventListener("change", event => {
    const checkbox = event.target.closest("[data-check]");
    if (!checkbox) return;
    savedChecks[checkbox.dataset.check] = checkbox.checked;
    const previousValue = !checkbox.checked;
    if (!saveStoredJson("iberia.mobile.checks", savedChecks, "勾选状态")) {
      savedChecks[checkbox.dataset.check] = previousValue;
      checkbox.checked = previousValue;
    }
    checkbox.closest(".check-row")?.classList.toggle("done", checkbox.checked);
    refreshChecklistSaveStatus();
  });

  document.addEventListener("input", event => {
    const rateInput = event.target.closest("[data-exchange-rate]");
    if (rateInput) {
      const nextRate = Number(rateInput.value);
      if (!Number.isFinite(nextRate) || nextRate <= 0) return;
      exchangeRate = nextRate;
      exchangeRateRevision += 1;
      saveStoredValue("iberia.mobile.exchange-rate", exchangeRate.toString());
      const status = document.querySelector("[data-exchange-status]");
      if (status) status.textContent = "已使用手动输入的参考汇率";
      syncCurrencyConverter("eur");
      return;
    }
    const currencyInput = event.target.closest("[data-currency-input]");
    if (currencyInput) syncCurrencyConverter(currencyInput.dataset.currencyInput);
  });

  document.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    if (event.target.matches("[data-new-checklist-item]")) { event.preventDefault(); addCustomChecklistItem(state.checklist); }
    const editInput = event.target.closest("[data-edit-checklist-input]");
    if (editInput) { event.preventDefault(); saveCustomChecklistItem(state.checklist, editInput.dataset.editChecklistInput); }
  });

  render();
})();
