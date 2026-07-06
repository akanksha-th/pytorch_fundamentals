(function () {
  // ---------- small inline icons (paths only, drawn centered at 0,0) ----------
  const ICON_PATHS = {
    aperture: `<circle cx="0" cy="0" r="3.4" /><circle cx="0" cy="0" r="1" fill="currentColor" stroke="none" />`,
    wave: `<path d="M-5,0 L-2.5,-4 L0,4 L2.5,-4 L5,0" />`,
    gear: `<circle cx="0" cy="0" r="2.6" />
      <path d="M0,-5 L0,-3.4 M0,5 L0,3.4 M-5,0 L-3.4,0 M5,0 L3.4,0
               M-3.5,-3.5 L-2.4,-2.4 M3.5,3.5 L2.4,2.4 M-3.5,3.5 L-2.4,2.4 M3.5,-3.5 L2.4,-2.4" />`
  };

  function iconGroup(track, x, y) {
    return `<g class="stop-icon" transform="translate(${x},${y})">${ICON_PATHS[track]}</g>`;
  }

  function legendIconSVG(track) {
    return `<svg viewBox="-8 -8 16 16" xmlns="http://www.w3.org/2000/svg">${ICON_PATHS[track]}</svg>`;
  }

  // ---------- geometry: Catmull-Rom through all stop points, so markers sit exactly on the trail ----------
  function catmullRomPath(points) {
    if (points.length < 2) return "";
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
    }
    return d;
  }

  // 16 hand-placed stops winding left to right, plus one decorative point past the last stop for the chest.
  const STOP_POINTS = [
    { x: 55, y: 190 }, { x: 118, y: 108 }, { x: 182, y: 272 }, { x: 246, y: 138 },
    { x: 308, y: 258 }, { x: 368, y: 118 }, { x: 432, y: 300 }, { x: 496, y: 150 },
    { x: 560, y: 250 }, { x: 624, y: 128 }, { x: 688, y: 292 }, { x: 752, y: 148 },
    { x: 818, y: 260 }, { x: 878, y: 118 }, { x: 930, y: 210 }, { x: 958, y: 190 }
  ];
  const CHEST_POINT = { x: 990, y: 205 };

  const ZONES = [
    { label: "Foothills of Memory", range: "wk 1–4", x0: 18, x1: 278, alt: false, terrain: "hills" },
    { label: "Cache & CUDA Caverns", range: "wk 5–8", x0: 278, x1: 532, alt: true, terrain: "cave" },
    { label: "The Precision Peaks", range: "wk 9–12", x0: 532, x1: 788, alt: false, terrain: "peaks" },
    { label: "The Fusion Coast", range: "wk 13–16", x0: 788, x1: 1000, alt: true, terrain: "coast" }
  ];

  function terrainSVG(zone) {
    const midY = 340;
    switch (zone.terrain) {
      case "hills":
        return `<path d="M${zone.x0},${midY} q30,-30 60,0 t60,0 t60,0 t60,0 v20 h-${zone.x1 - zone.x0} z" fill="var(--map-line-dim)" fill-opacity="0.5"/>`;
      case "cave": {
        const cx = (zone.x0 + zone.x1) / 2;
        return `<path d="M${cx - 70},${midY + 20} A70,70 0 0 1 ${cx + 70},${midY + 20} z" fill="var(--map-line-dim)" fill-opacity="0.45"/>
                <path d="M${cx - 30},60 L${cx - 15},95 L${cx},60 L${cx + 15},95 L${cx + 30},60" fill="var(--map-line-dim)" fill-opacity="0.4"/>`;
      }
      case "peaks":
        return `<path d="M${zone.x0},${midY + 20} L${zone.x0 + 60},${midY - 90} L${zone.x0 + 120},${midY + 20} z" fill="var(--map-line-dim)" fill-opacity="0.45"/>
                <path d="M${zone.x0 + 90},${midY + 20} L${zone.x0 + 155},${midY - 130} L${zone.x0 + 220},${midY + 20} z" fill="var(--map-line-dim)" fill-opacity="0.5"/>
                <path d="M${zone.x0 + 190},${midY + 20} L${zone.x0 + 240},${midY - 70} L${zone.x1 - 5},${midY + 20} z" fill="var(--map-line-dim)" fill-opacity="0.4"/>`;
      case "coast":
        return `<path d="M${zone.x0},${midY + 10} q20,-14 40,0 t40,0 t40,0 t40,0 t40,0 t40,0" stroke="var(--map-line-dim)" stroke-width="2" fill="none"/>`;
      default:
        return "";
    }
  }

  function chestSVG(p) {
    return `
      <g transform="translate(${p.x},${p.y})">
        <line class="chest-x" x1="-10" y1="-10" x2="10" y2="10" />
        <line class="chest-x" x1="10" y1="-10" x2="-10" y2="10" />
        <rect class="chest-body" x="-9" y="14" width="18" height="12" rx="1.5" />
        <path class="chest-body" d="M-9,14 q9,-8 18,0" />
      </g>`;
  }

  function buildMapSVG() {
    const zonesSVG = ZONES.map((z) => `
      <rect x="${z.x0}" y="20" width="${z.x1 - z.x0}" height="330" class="terrain ${z.alt ? "alt" : ""}" />
      ${terrainSVG(z)}
      <text x="${(z.x0 + z.x1) / 2}" y="42" text-anchor="middle" class="zone-label">${z.label}</text>
      <text x="${(z.x0 + z.x1) / 2}" y="55" text-anchor="middle" class="zone-range">${z.range}</text>
    `).join("");

    const trailD = catmullRomPath(STOP_POINTS.concat([CHEST_POINT]));

    const stopsSVG = WEEKS.map((w, i) => {
      const p = STOP_POINTS[i];
      const published = w.published ? "published" : "";
      return `
        <g class="stop ${published}" data-week="${w.n}" tabindex="0" role="button"
           aria-label="Week ${w.n}: ${w.title}" transform="translate(${p.x},${p.y})">
          <circle class="halo" r="16" />
          <circle class="node" r="10" />
          ${iconGroup(w.track, 0, -13)}
          <text class="stop-num" y="4">${w.n}</text>
        </g>`;
    }).join("");

    return `
      ${zonesSVG}
      <path class="trail-path" d="${trailD}" />
      ${stopsSVG}
      ${chestSVG(CHEST_POINT)}
    `;
  }

  // ---------- panel ----------
  function trackLabel(track) {
    return TRACKS[track] ? TRACKS[track].label : track;
  }

  function renderPanelShell(w) {
    const panel = document.getElementById("panel");
    panel.innerHTML = `
      <div class="panel-head">
        <span class="panel-week">W${String(w.n).padStart(2, "0")}</span>
        <h3 class="panel-title">${w.postTitle}</h3>
        <span class="panel-track">${trackLabel(w.track)}</span>
      </div>
      <div class="panel-tech-title">${w.title}</div>
      <dl>
        <dt>Study</dt><dd>${w.clueStudy}</dd>
        <dt>Project</dt><dd>${w.clueProject}</dd>
      </dl>
      ${w.note ? `<div class="panel-note">${w.note}</div>` : ""}
      ${
        w.published
          ? `<button class="dig-btn" id="dig-btn">Dig it up →</button>
             <div class="dig-status" id="dig-status"></div>
             <div class="post-content" id="post-content"></div>`
          : `<button class="dig-btn" disabled>Not written yet</button>
             <div class="dig-status">Check back once Week ${w.n} is written.</div>`
      }
      <div class="panel-footer">
        <a href="${GITHUB_REPO_URL}/tree/main/${WEEKS_FOLDER}/${w.slug}" target="_blank" rel="noopener">View folder on GitHub →</a>
      </div>
    `;
    panel.classList.add("open");

    if (w.published) {
      const btn = document.getElementById("dig-btn");
      btn.addEventListener("click", () => digUp(w, btn));
    }
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function digUp(w, btn) {
    const status = document.getElementById("dig-status");
    const content = document.getElementById("post-content");
    btn.disabled = true;
    btn.textContent = "Digging…";
    status.textContent = "";
    try {
      const res = await fetch(`${WEEKS_FOLDER}/${w.slug}/README.md`);
      if (!res.ok) throw new Error("not found");
      const md = await res.text();
      content.innerHTML = window.marked ? marked.parse(md) : `<pre>${md}</pre>`;
      btn.remove();
      status.textContent = "";
    } catch (e) {
      status.textContent = "Couldn't load the README from that folder yet — check the path in data.js matches the repo.";
      btn.disabled = false;
      btn.textContent = "Dig it up →";
    }
  }

  function selectWeek(n) {
    document.querySelectorAll(".stop").forEach((el) => {
      el.classList.toggle("active", Number(el.dataset.week) === n);
    });
    const w = WEEKS.find((w) => w.n === n);
    renderPanelShell(w);
  }

  // ---------- misc sections ----------
  function renderLegendIcons() {
    document.querySelectorAll(".legend-icon[data-icon]").forEach((el) => {
      el.innerHTML = legendIconSVG(el.dataset.icon);
    });
  }

  function renderPlainList() {
    const ol = document.getElementById("plain-list");
    ol.innerHTML = WEEKS.map((w) => `
      <li><a href="#map" data-week="${w.n}">Week ${w.n} — ${w.title}${w.published ? "" : " (not written yet)"}</a></li>
    `).join("");
    ol.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        selectWeek(Number(a.dataset.week));
      });
    });
  }

  function renderProgress() {
    const done = WEEKS.filter((w) => w.published).length;
    document.getElementById("progress-count").innerHTML = `<strong>${done}</strong> / ${WEEKS.length} dug up`;
  }

  function initV2Toggle() {
    const toggle = document.getElementById("v2-note-toggle");
    const note = document.getElementById("v2-note");
    toggle.addEventListener("click", () => {
      const open = note.style.display !== "none";
      note.style.display = open ? "none" : "block";
      toggle.textContent = open ? "What changed since v1 →" : "Hide changelog";
    });
  }

  function initRepoLink() {
    document.getElementById("repo-link").href = GITHUB_REPO_URL;
  }

  function initMap() {
    const svg = document.getElementById("map-svg");
    svg.innerHTML = buildMapSVG();
    svg.querySelectorAll(".stop").forEach((el) => {
      el.addEventListener("click", () => selectWeek(Number(el.dataset.week)));
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectWeek(Number(el.dataset.week)); }
      });
    });
  }

  function init() {
    initMap();
    renderLegendIcons();
    renderPlainList();
    renderProgress();
    initV2Toggle();
    initRepoLink();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
