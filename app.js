(async function () {
  const C = window.ROADBOOK_CONTENT;
  const app = document.getElementById("app");
  const topbar = document.getElementById("topbar");
  const tabbar = document.getElementById("tabbar");
  const sheet = document.getElementById("detailSheet");
  const sheetContent = document.getElementById("sheetContent");
  const mapboxToken = "pk.eyJ1IjoiYXJpZXN4dWVheDAwMSIsImEiOiJjbGgwMWl4c3Iwb3hkM2dxaHdld2EzMWUwIn0.PKltadPPKCz58RJ0epj0cw";
  const imageAssetKeys = new Set([
    "alhambra", "april-bridge-new", "avenida-liberdade-new", "bacalhau-new", "barcelona", "belem-tower", "belem-tower-new", "cabo-da-roca", "casa-batllo", "casa-mila", "city-arts-sciences", "city-arts-sciences-new", "columbus-monument", "cover", "cover-peniscola", "discoveries-monument-new", "evora", "evora-cathedral", "evora-old-town", "flamenco", "generalife", "granada", "jeronimos-new", "lisbon", "madrid", "mijas", "paella", "palau-nacional", "park-guell", "pasteis-belem-new", "peniscola", "plaza-de-la-virgen", "plaza-espana-seville", "plaza-mayor-madrid", "puente-nuevo", "roman-temple-evora", "ronda", "rossio-new", "royal-palace-madrid", "sagrada-familia", "serranos-towers", "seville", "seville-cathedral", "tarragona", "valencia", "valencia-cathedral", "zaragoza", "zaragoza-city"
  ]);
  const itinerary = await fetch("data/itinerary-extraction.json").then(response => {
    if (!response.ok) throw new Error("行程数据加载失败");
    return response.json();
  });

  const modeLabels = { inside: "入内", guided: "官导", outside: "外观", distant: "远观", walk: "步行", free_time: "自由活动", shopping: "购物", show: "演出", food: "品尝" };
  const tabItems = [
    ["home", "house", "首页"], ["itinerary", "calendar-days", "行程"], ["map", "map", "地图"], ["cities", "landmark", "城市"], ["checklist", "list-checks", "清单"]
  ];
  const checkSections = {
    "行前": ["护照、身份证与签证材料分开放置", "国际段建议提前 3 小时抵达机场", "移动电源与备用锂电池必须随身携带", "随团 WiFi：2 人 1 台，行程结束统一回收", "返程跨日抵达杭州，预留次日休整时间"],
    "必备物品": ["内衣、内裤、袜子 ×7", "睡衣 1 套、拖鞋", "钱包、零钱袋、锁封袋", "烧水杯、泡腾片、转换插头", "垃圾袋、雨衣或雨伞", "过敏药、止泻药、退烧药、晕车药", "湿纸巾、洗脸巾、化妆棉、卫生巾", "洗护用品、防晒、帽子", "U 盘、3C 认证充电宝、数据线", "充电头、Pocket、耳机", "墨镜、零食、现金"],
    "应用": ["Google Maps：步行、餐厅与公交查询", "Google Translate：离线下载西班牙语、葡萄牙语", "WhatsApp：酒店与当地联络", "Uber / Bolt：城市内叫车备用", "XE Currency：欧元汇率与消费换算"],
    "当地注意": ["餐厅晚餐时间普遍较晚，热门地点建议提前订位", "教堂与宫殿依现场规定着装，避免露肩与过短下装", "热门景区与地铁站留意随身包，不在街边外露证件", "西葡插座常见 C / F 型，准备欧标转换头", "水和公厕不一定随处免费，备少量硬币更方便"],
    "汇率转换": []
  };
  const state = { view: "home", selectedDay: 2, city: null, checklist: "行前", map: null, mapFocus: null };
  const savedChecks = JSON.parse(localStorage.getItem("iberia.mobile.checks") || "{}");
  const savedExchangeRate = Number(localStorage.getItem("iberia.mobile.exchange-rate"));
  let exchangeRate = Number.isFinite(savedExchangeRate) && savedExchangeRate > 0 ? savedExchangeRate : 7.8;
  let exchangeRateRevision = 0;
  const allVisits = itinerary.days.flatMap(day => day.visits.filter(visit => !visit.modes.includes("conditional")).map(visit => ({ ...visit, day: day.day, date: day.date })));
  const cityOrder = itinerary.routeNodes.map(node => node.nameZh).filter((city, index, list) => C.cities[city] && list.indexOf(city) === index);
  const cityVisits = city => allVisits.filter(visit => visit.city === city);

  function esc(value) {
    return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  }

  function imageFor(name, city) {
    const profile = C.cities[city];
    const preferredKey = C.imageKeys[name] || profile?.image || "cover";
    const cityKey = profile?.image || "cover";
    const key = imageAssetKeys.has(preferredKey) ? preferredKey : imageAssetKeys.has(cityKey) ? cityKey : "cover";
    return mobileImageForKey(key);
  }

  function mobileImageForKey(key) {
    return `assets/images/mobile/${imageAssetKeys.has(key) ? key : "cover"}.jpg`;
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

  function topbarMarkup() {
    if (state.view === "city") {
      return `<button class="city-back" data-action="back-cities" aria-label="返回城市"><i data-lucide="arrow-left"></i></button><button class="brand-button" data-view="home"><b>${esc(state.city)}</b><span>城市导览</span></button><button class="top-action" data-view="map" aria-label="打开地图"><i data-lucide="map"></i></button>`;
    }
    return `<button class="brand-button" data-view="home"><b>伊比利亚光影纪行</b><span>西班牙 · 葡萄牙 11 天</span></button><button class="top-action" data-view="checklist" aria-label="打开旅行清单"><i data-lucide="list-checks"></i></button>`;
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
        <img class="hero-image" src="${mobileImageForKey("cover")}" alt="西班牙葡萄牙旅行风景" fetchpriority="high" decoding="async">
        <div class="hero-content">
          <div class="eyebrow">29 SEP — 09 OCT 2026</div>
          <h1>伊比利亚<br>光影纪行</h1>
          <p>从马德里的王室尺度，穿过高迪的曲线与安达卢西亚白墙，抵达大西洋尽头。</p>
          <div class="hero-actions"><button class="primary-button" data-view="itinerary"><i data-lucide="calendar-days"></i>查看全程</button><button class="secondary-button" data-view="map"><i data-lucide="map"></i>路线地图</button></div>
        </div>
      </section>
      <div class="trip-strip"><div><strong>11</strong><span>旅行天数</span></div><div><strong>12</strong><span>途经城市</span></div><div><strong>2</strong><span>目的国家</span></div></div>
      <div class="journey-intro"><b>一条从王宫走向大西洋的环线</b><p>高迪建筑巡礼、世界遗产宫城、安达卢西亚白色小镇与葡萄牙大航海记忆，均已按日程放入可点开的移动卡片。</p></div>
      ${foodExperienceStrip()}
      <div class="section-head page-pad"><h2>选择行程日</h2><button class="text-button" data-view="itinerary">全部行程 <i data-lucide="arrow-right"></i></button></div>
      <div class="day-scroller">${itinerary.days.map(item => `<button class="day-pill ${item.day === day.day ? "active" : ""}" data-select-day="${item.day}"><b>D${item.day}</b><span>${item.date.slice(5).replace("-", "/")}</span></button>`).join("")}</div>
      <section class="day-journey"><div class="day-journey-head"><div><span>D${day.day} · ${day.weekday}</span><b>${esc(cityNameForRoute(day))}</b></div><em>${coachDistance ? `${coachDistance} km` : day.transport.includes("flight") ? "飞行日" : "市内游览"}</em></div><div class="day-route-string">${day.route.map(stop => `<strong>${esc(stop)}</strong>`).join(`<i data-lucide="chevron-right"></i>`)}</div><div class="transport-summary">${transportSummary}</div></section>
      <section class="day-attractions"><div class="section-head"><div><div class="eyebrow">Today stops</div><h2>${dayVisits.length ? "今日景点" : "今日安排"}</h2></div><span class="attraction-count">${dayVisits.length ? `${dayVisits.length} 个节点` : "抵达日"}</span></div>${dayVisits.length ? `<div class="attraction-scroller">${dayVisits.map((visit, index) => attractionCard(visit, index + 1)).join("")}</div>` : `<div class="transit-card"><i data-lucide="plane"></i><div><b>${esc(day.notes?.[0] || "行程转场")}</b><span>留出充足时间办理值机与休整，详细提醒见旅行清单。</span></div></div>`}</section>
      <section class="mini-route"><div class="eyebrow">Route line</div><div class="route-rail">${routeStops.map(stop => `<div class="route-stop"><i></i><strong>${esc(stop.nameZh)}</strong></div>`).join("")}</div></section>
    </section>`;
  }

  function attractionCard(visit, index) {
    const image = imageFor(visit.nameZh, visit.city);
    const duration = minimumStayLabel(visit, visit.modes.includes("food") ? "特色品尝" : "团队安排");
    const eager = index <= 2;
    return `<button class="attraction-card" data-spot="${esc(visit.nameZh)}" data-city="${esc(visit.city)}"><img src="${image}" alt="${esc(visit.nameZh)}" loading="${eager ? "eager" : "lazy"}" ${index === 1 ? "fetchpriority=\"high\"" : ""} decoding="async" onerror="this.onerror=null;this.src='${mobileImageForKey("cover")}'"><span class="attraction-index">${String(index).padStart(2, "0")}</span><div class="attraction-body"><small>${esc(visit.city)} · ${duration}</small><b>${esc(visit.nameZh)}</b><div class="mode-row">${modeTags(visit.modes)}</div></div></button>`;
  }

  function itineraryView() {
    return `<section class="view itinerary-view"><header class="itinerary-header"><div class="eyebrow">Day by day</div><h1>每日行程</h1><p>把每天的移动、停留和城市节奏，放在一条连续路线里阅读。</p><div class="itinerary-stats"><span>11 天</span><span>12 城</span><span>44 个节点</span></div></header><div class="itinerary-flow">${itinerary.days.map(day => dayCard(day)).join("")}</div></section>`;
  }

  function dayCard(day) {
    const visits = day.visits.filter(visit => !visit.modes.includes("conditional"));
    const coachSegments = day.segments.filter(segment => segment.mode === "coach");
    const distance = coachSegments.reduce((sum, segment) => sum + segment.distanceKm, 0);
    const segmentMarkup = day.segments.map(segment => `<div class="flow-travel"><i data-lucide="${segment.mode === "flight" ? "plane" : "bus"}"></i><span>${esc(segment.from)} → ${esc(segment.to)}</span><b>${coachText(segment)}</b></div>`).join("");
    const metrics = distance ? `${distance} km` : day.transport.includes("flight") ? "飞行日" : visits.length ? `${visits.length} 个停留` : "抵达日";
    return `<section class="day-flow"><header class="day-flow-head"><span class="flow-day">D${String(day.day).padStart(2, "0")}</span><div><small>${day.date} · ${day.weekday}</small><b>${esc(cityNameForRoute(day))}</b></div><em>${metrics}</em></header><div class="day-flow-body">${segmentMarkup}${visits.length ? `<div class="flow-stops">${visits.map((visit, index) => flowStop(visit, index + 1)).join("")}</div>` : `<div class="flow-note"><i data-lucide="${day.transport.includes("flight") ? "plane" : "bed-double"}"></i><span>${esc(day.notes?.[0] || "酒店休整与行前准备")}</span></div>`}</div></section>`;
  }

  function flowStop(visit, index) {
    const duration = minimumStayLabel(visit, visit.modes.includes("food") ? "特色品尝" : "团队安排");
    return `<button class="flow-stop" data-spot="${esc(visit.nameZh)}" data-city="${esc(visit.city)}"><span class="flow-stop-number">${String(index).padStart(2, "0")}</span><span class="flow-stop-content"><small>${esc(visit.city)} · ${duration}</small><b>${esc(visit.nameZh)}</b><span class="mode-row">${modeTags(visit.modes)}</span></span><i data-lucide="chevron-right"></i></button>`;
  }

  function mapView() {
    return `<section class="view map-view"><header class="map-title"><div class="eyebrow">Interactive route</div><h1>路线地图</h1><p>红点为途经城市，蓝点为景点，黄点为吃与带走；每日行程标注早、午、晚餐。</p></header><div id="mobileMap" aria-label="西班牙葡萄牙行程地图"></div><div class="map-legend"><span><i style="background:#c85b4d"></i>途经城市</span><span><i style="background:#2d6f91"></i>行程景点</span><span><i style="background:#e6ae2d"></i>吃与带走</span></div><div class="map-route-list">${itinerary.days.map(day => `<div class="route-day-line"><b>D${day.day}</b><div><span>${esc(day.route.join(" → "))}</span><small>${day.segments.filter(segment => segment.mode === "coach").map(coachEstimateText).join(" · ") || (day.transport.includes("flight") ? "航班日" : day.visits.length ? "市内游览" : "抵达日")}</small>${mapMealTags(day)}</div></div>`).join("")}</div></section>`;
  }

  function citiesView() {
    return `<section class="view cities-view"><header class="cities-header"><div class="eyebrow">City guide</div><h1>城市导览</h1><p>从城市文化入门，再进入当天路线、美食与周边建议。</p></header><div class="city-stack">${cityOrder.map((city, index) => cityCard(city, index)).join("")}</div></section>`;
  }

  function cityCard(city, index) {
    const profile = C.cities[city];
    const highlights = C.cityGuideHighlights?.[city] || { style: "城市建筑脉络", makers: "塑造这座城市的人" };
    const eager = index < 3;
    return `<button class="city-card" data-city-page="${esc(city)}"><img src="${imageFor("", city)}" alt="${esc(city)}" loading="${eager ? "eager" : "lazy"}" ${index === 0 ? "fetchpriority=\"high\"" : ""} decoding="async" onerror="this.onerror=null;this.src='${mobileImageForKey("cover")}'"><span class="city-arrow"><i data-lucide="arrow-up-right"></i></span><div class="city-card-body"><small>${esc(profile.days)} · ${esc(profile.country)}</small><h2>${esc(city)}<span class="city-local-name">${esc(localCityName(city))}</span></h2><div class="city-highlights"><span class="city-highlight"><b>建筑风格</b><i>${esc(highlights.style)}</i></span><span class="city-highlight"><b>关键影响人</b><i>${esc(highlights.makers)}</i></span></div></div></button>`;
  }

  function cityView(city) {
    const profile = C.cities[city];
    const visits = cityVisits(city);
    const architecture = profile.architecture || { style: profile.culture, makers: "这座城市的风貌来自不同时代的建造者与日常生活的共同塑造。" };
    return `<section class="view city-detail"><section class="city-hero"><img src="${imageFor("", city)}" alt="${esc(city)}" fetchpriority="high" decoding="async" onerror="this.onerror=null;this.src='${mobileImageForKey("cover")}'"><div class="city-hero-content"><div class="eyebrow">${esc(profile.en)} · ${esc(profile.country)}</div><h1>${esc(city)}<span class="city-hero-local-name">${esc(localCityName(city))}</span></h1><p>${esc(profile.culture)}</p><div class="city-meta"><span>${esc(profile.days)}</span><span>${C.climate[city] || "十月舒适"}</span><span>${visits.length} 个行程节点</span></div></div></section><section class="city-section"><section class="architecture-panel"><div class="architecture-label">建筑与塑城者</div><p class="culture-copy">${esc(architecture.style)}</p><div class="maker-copy"><b>关键影响人</b><p>${esc(architecture.makers)}</p></div></section><div class="guide-card"><h3>${esc(profile.guide.title)}</h3><p><b>这样走：</b>${esc(profile.guide.route)}</p><p><b>怎么拍：</b>${esc(profile.guide.photo)}</p><p><b>时间有限：</b>${esc(profile.guide.quick)}</p></div><div class="section-head"><h2>本城景点</h2><span class="eyebrow">${visits.length} stops</span></div><div class="spot-list">${visits.map((visit, index) => `<button class="spot-button" data-spot="${esc(visit.nameZh)}" data-city="${esc(city)}"><span class="spot-number">${String(index + 1).padStart(2, "0")}</span><span class="spot-name"><b>${esc(visit.nameZh)}</b><i class="spot-local-name">${esc(localSpotName(visit.nameZh))}</i>${visit.minimumDurationMinutes ? `<span class="spot-stay">游览${minimumStayLabel(visit)}</span>` : ""}<span class="mode-row">${modeTags(visit.modes)}</span></span><i data-lucide="chevron-right"></i></button>`).join("")}</div><div class="section-head"><h2>吃与带走</h2></div><div class="food-list">${profile.nearby.map(([name, desc]) => foodCard(name, desc, city)).join("")}</div></section></section>`;
  }

  function foodCard(name, desc, city) {
    const icon = /市场|市集|街|区/.test(name) ? "store" : /伴手礼|糖|巧克力|瓷|香水|软木|陶|橄榄油|罐头|花砖/.test(name) ? "shopping-bag" : "utensils";
    return `<article class="food-card"><span class="food-kind"><i data-lucide="${icon}"></i></span><div class="food-copy"><b>${esc(name)}</b><span>${esc(desc)}</span><button class="food-map-link" data-map-food="${esc(name)}" data-city="${esc(city)}"><i data-lucide="map-pin"></i>在地图中查看位置</button></div></article>`;
  }

  function checklistView() {
    const active = state.checklist;
    const rows = checkSections[active].map((item, index) => {
      const id = `${active}-${index}`;
      return `<label class="check-row ${savedChecks[id] ? "done" : ""}"><input type="checkbox" data-check="${esc(id)}" ${savedChecks[id] ? "checked" : ""}><span>${esc(item)}</span></label>`;
    }).join("");
    const subtitle = active === "汇率转换" ? "自动读取 EUR/CNY 日参考汇率，也可手动修改。" : "勾选会保留在当前设备，出发前可随时核对。";
    const content = active === "汇率转换" ? exchangeTool() : `${active === "行前" ? `<div class="flight-card"><strong>JD605 杭州 → 马德里</strong><span>09/29 00:30 起飞 · 国际段建议提前 3 小时抵达。移动电源、备用锂电池必须随身携带。</span><br><strong>JD622 里斯本 → 杭州</strong><span>10/08 11:55 起飞 · 返程跨日抵达杭州。</span></div>` : ""}<div class="check-group"><h3>${active}</h3>${rows}</div>`;
    return `<section class="view checklist-view"><header class="checklist-header"><div class="eyebrow">Ready to go</div><h1>旅行清单</h1><p>${subtitle}</p></header><div class="checklist-tabs">${Object.keys(checkSections).map(name => `<button class="check-tab ${active === name ? "active" : ""}" data-check-section="${name}">${name}</button>`).join("")}</div><div class="check-panel">${content}</div></section>`;
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
      localStorage.setItem("iberia.mobile.exchange-rate", exchangeRate.toString());
      const rateInput = document.querySelector("[data-exchange-rate]");
      if (rateInput) rateInput.value = formatExchangeRate(exchangeRate);
      syncCurrencyConverter("eur");
      status.textContent = `ECB 日参考 · ${data.date}`;
    } catch {
      status.textContent = "暂未获取实时汇率，正在使用本地参考值";
    }
  }

  function openSpot(name, city) {
    const visit = cityVisits(city).find(item => item.nameZh === name) || allVisits.find(item => item.nameZh === name);
    const profile = C.cities[city];
    const photo = imageFor(name, city);
    const duration = minimumStayLabel(visit, visit?.modes.includes("food") ? "特色品尝" : "行程未标注");
    const notice = C.spotNotices?.[name];
    sheetContent.innerHTML = `<section class="sheet-hero"><img src="${photo}" alt="${esc(name)}" fetchpriority="high" decoding="async" onerror="this.onerror=null;this.src='${mobileImageForKey(profile?.image || "cover")}'"><h2>${esc(name)}<span class="sheet-local-name">${esc(localSpotName(name))}</span></h2></section><section class="sheet-body"><div class="tag-row">${modeTags(visit?.modes || [])}</div><div class="spot-facts"><div><b>${esc(city)}</b><span>所在城市</span></div><div><b>${esc(duration)}</b><span>游览时长</span></div><div><b>${visit?.modes.includes("inside") ? "含门票" : "按行程"}</b><span>参观方式</span></div></div>${notice ? `<section class="spot-notice"><h3>${esc(notice.title)}</h3><p>${esc(notice.text)}</p></section>` : ""}<h3>30 秒速览</h3><p>${esc(profile?.guide?.history || `${name}是本行程的重要停留节点。`)}</p><h3>在现场这样看</h3><p>${esc(profile?.guide?.route || "先观察整体空间，再把注意力放在建筑的材质、光线与人流交汇处。")}</p><h3>拍照与节奏</h3><p>${esc(profile?.guide?.photo || "避开正门人流，选择侧面光线与更低的机位，先看十秒再按快门。")}</p><button class="sheet-map-link" data-map-spot="${esc(name)}" data-city="${esc(city)}"><i data-lucide="map-pin"></i>在地图中查看位置</button></section>`;
    sheet.showModal();
    refreshIcons();
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
      Object.entries(C.foodCoordinates || {}).forEach(([name, place]) => marker(name, place.coordinates, "food-marker", place.city));
      const bounds = coordinates.reduce((value, coordinate) => value.extend(coordinate), new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));
      state.map.fitBounds(bounds, { padding: 38, duration: 0 });
      if (state.mapFocus) state.map.flyTo({ center: state.mapFocus, zoom: 14, duration: 700 });
    });
  }

  function marker(name, coordinates, className, subtitle) {
    const element = document.createElement("button");
    element.className = className;
    element.setAttribute("aria-label", name);
    if (className === "city-marker") element.innerHTML = `<span>${esc(name)}</span>`;
    const color = className === "city-marker" ? "#c85b4d" : className === "food-marker" ? "#e6ae2d" : "#2d6f91";
    element.style.cssText = `width:${className === "city-marker" ? 14 : 10}px;height:${className === "city-marker" ? 14 : 10}px;border:2px solid #fff;border-radius:50%;background:${color};box-shadow:0 1px 5px rgba(0,0,0,.28);padding:0;`;
    new mapboxgl.Marker({ element }).setLngLat(coordinates).setPopup(new mapboxgl.Popup({ offset: 14 }).setHTML(`<b>${esc(name)}</b><span>${esc(subtitle)}</span>`)).addTo(state.map);
  }

  function render() {
    if (state.map && state.view !== "map") { state.map.remove(); state.map = null; }
    topbar.innerHTML = topbarMarkup();
    tabbar.innerHTML = tabbarMarkup();
    app.innerHTML = state.view === "home" ? homeView() : state.view === "itinerary" ? itineraryView() : state.view === "map" ? mapView() : state.view === "cities" ? citiesView() : state.view === "city" ? cityView(state.city) : checklistView();
    refreshIcons();
    window.scrollTo({ top: 0, behavior: "instant" });
    if (state.view === "map") window.setTimeout(initializeMap, 0);
    if (state.view === "checklist" && state.checklist === "汇率转换") window.setTimeout(refreshExchangeRate, 0);
  }

  function refreshIcons() {
    if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
  }

  document.addEventListener("click", event => {
    const viewButton = event.target.closest("[data-view]");
    if (viewButton) { state.view = viewButton.dataset.view; state.city = null; state.mapFocus = null; render(); return; }
    const dayButton = event.target.closest("[data-select-day]");
    if (dayButton) { state.selectedDay = Number(dayButton.dataset.selectDay); render(); return; }
    const cityButton = event.target.closest("[data-city-page]");
    if (cityButton) { state.city = cityButton.dataset.cityPage; state.view = "city"; render(); return; }
    const spotButton = event.target.closest("[data-spot]");
    if (spotButton) { openSpot(spotButton.dataset.spot, spotButton.dataset.city); return; }
    const sectionButton = event.target.closest("[data-check-section]");
    if (sectionButton) { state.checklist = sectionButton.dataset.checkSection; render(); return; }
    if (event.target.closest("[data-action='back-cities']")) { state.view = "cities"; state.city = null; render(); return; }
    if (event.target.closest("[data-close-sheet]")) { sheet.close(); return; }
    const mapFood = event.target.closest("[data-map-food]");
    if (mapFood) { const place = C.foodCoordinates?.[mapFood.dataset.mapFood]; state.mapFocus = place?.coordinates || C.cityCoordinates[mapFood.dataset.city]; state.view = "map"; state.city = null; render(); return; }
    const mapSpot = event.target.closest("[data-map-spot]");
    if (mapSpot) { sheet.close(); state.mapFocus = C.poiCoordinates[mapSpot.dataset.mapSpot] || C.cityCoordinates[mapSpot.dataset.city]; state.view = "map"; render(); }
  });

  document.addEventListener("change", event => {
    const checkbox = event.target.closest("[data-check]");
    if (!checkbox) return;
    savedChecks[checkbox.dataset.check] = checkbox.checked;
    localStorage.setItem("iberia.mobile.checks", JSON.stringify(savedChecks));
    checkbox.closest("label").classList.toggle("done", checkbox.checked);
  });

  document.addEventListener("input", event => {
    const rateInput = event.target.closest("[data-exchange-rate]");
    if (rateInput) {
      const nextRate = Number(rateInput.value);
      if (!Number.isFinite(nextRate) || nextRate <= 0) return;
      exchangeRate = nextRate;
      exchangeRateRevision += 1;
      localStorage.setItem("iberia.mobile.exchange-rate", exchangeRate.toString());
      const status = document.querySelector("[data-exchange-status]");
      if (status) status.textContent = "已使用手动输入的参考汇率";
      syncCurrencyConverter("eur");
      return;
    }
    const currencyInput = event.target.closest("[data-currency-input]");
    if (currencyInput) syncCurrencyConverter(currencyInput.dataset.currencyInput);
  });

  render();
})();
