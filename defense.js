/* ==========================================================================
   Komara Défense — moteur
   Vue satellite de la ville, défense contre les vagues d'invasion.
   ========================================================================== */
(function () {
  "use strict";

  /* ------------------------------- constantes ------------------------------ */
  const W = 1600;
  const H = 900;
  const CLE = "komara-defense-v1";

  const TOURELLES = {
    mitrailleuse: {
      nom: "Mitrailleuse", ico: "🔫", cout: 60, pv: 150,
      degats: 5, cadence: 0.12, portee: 132, sol: true, air: true, couleur: "#c9d3c4",
    },
    canon: {
      nom: "Canon", ico: "💥", cout: 120, pv: 190,
      degats: 42, cadence: 1.45, portee: 168, sol: true, air: false, couleur: "#b9a06a",
    },
    missile: {
      nom: "Missile", ico: "🚀", cout: 150, pv: 170,
      degats: 58, cadence: 1.9, portee: 215, sol: false, air: true, couleur: "#9fb8c9",
    },
    mortier: {
      nom: "Mortier", ico: "💣", cout: 140, pv: 140,
      degats: 38, cadence: 2.2, portee: 235, sol: true, air: false, zone: 62, couleur: "#a8a08e",
    },
  };

  const ENNEMIS = {
    eclaireur: { nom: "Éclaireur", pv: 42, vit: 76, recompense: 8, taille: 9, degatsVille: 1, air: false, couleur: "#8a6b3f" },
    soldat: { nom: "Soldat", pv: 76, vit: 50, recompense: 10, taille: 10, degatsVille: 2, air: false, couleur: "#6d5b45",
      tir: { portee: 118, degats: 9, cadence: 1.25 } },
    blinde: { nom: "Blindé", pv: 240, vit: 34, recompense: 28, taille: 15, degatsVille: 2, air: false, couleur: "#4a5240", blindage: 0.55,
      tir: { portee: 142, degats: 21, cadence: 2.1 } },
    helico: { nom: "Hélico", pv: 96, vit: 64, recompense: 24, taille: 12, degatsVille: 3, air: true, couleur: "#3e4a3a",
      tir: { portee: 112, degats: 11, cadence: 1.5 } },
    boss: { nom: "Convoi lourd", pv: 1200, vit: 22, recompense: 220, taille: 22, degatsVille: 10, air: false, couleur: "#3c332a", blindage: 0.4,
      tir: { portee: 182, degats: 36, cadence: 1.9 } },
  };

  const VAGUES = [
    { liste: [["eclaireur", 6]], pause: 2 },
    { liste: [["eclaireur", 8], ["soldat", 3]], pause: 2 },
    { liste: [["soldat", 8], ["eclaireur", 6]], pause: 2 },
    { liste: [["blinde", 2], ["soldat", 8]], pause: 2 },
    { liste: [["helico", 4], ["eclaireur", 10]], pause: 2 },
    { liste: [["blinde", 4], ["soldat", 10]], pause: 2 },
    { liste: [["helico", 6], ["blinde", 4]], pause: 2 },
    { liste: [["soldat", 16], ["blinde", 5]], pause: 2 },
    { liste: [["helico", 8], ["blinde", 6], ["eclaireur", 12]], pause: 2 },
    { liste: [["boss", 1], ["blinde", 6], ["helico", 6]], pause: 2 },
  ];

  /* --------------------------------- outils -------------------------------- */
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const rnd = (a, b) => a + Math.random() * (b - a);

  function prng(semence) {
    let s = semence >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ------------------------------- sauvegarde ------------------------------ */
  const DEFAUT = { vague: 0, kills: 0, villes: 0, son: true };

  function chargerSauvegarde() {
    try {
      const brut = JSON.parse(localStorage.getItem(CLE) || "null");
      return brut ? Object.assign({}, DEFAUT, brut) : Object.assign({}, DEFAUT);
    } catch (e) {
      return Object.assign({}, DEFAUT);
    }
  }

  let sauvegarde = chargerSauvegarde();

  function enregistrer() {
    try { localStorage.setItem(CLE, JSON.stringify(sauvegarde)); } catch (e) {}
  }

  /* --------------------------------- audio -------------------------------- */
  let audio = null;

  function audioInit() {
    if (audio || !sauvegarde.son) return;
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      audio = new C();
    } catch (e) {
      audio = null;
    }
  }

  function son(freq, duree, type, vol) {
    if (!sauvegarde.son) return;
    audioInit();
    if (!audio) return;
    try {
      if (audio.state === "suspended") audio.resume();
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = type || "sine";
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol == null ? 0.1 : vol, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duree);
      o.connect(g);
      g.connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + duree);
    } catch (e) {}
  }

  /* ------------------------------ géographie ------------------------------ */
  // Cinq routes d'invasion convergent vers la mairie.
  const MAIRIE = { x: 800, y: 470 };

  const CHEMINS = [
    [{ x: 800, y: -60 }, { x: 800, y: 180 }, { x: 960, y: 180 }, { x: 960, y: 470 }, { x: 800, y: 470 }],
    [{ x: -60, y: 470 }, { x: 300, y: 470 }, { x: 300, y: 330 }, { x: 620, y: 330 }, { x: 620, y: 470 }, { x: 800, y: 470 }],
    [{ x: 1660, y: 300 }, { x: 1240, y: 300 }, { x: 1240, y: 600 }, { x: 1000, y: 600 }, { x: 1000, y: 470 }, { x: 800, y: 470 }],
    [{ x: 1500, y: -60 }, { x: 1500, y: 150 }, { x: 1150, y: 150 }, { x: 1150, y: 380 }, { x: 900, y: 380 }, { x: 800, y: 470 }],
    [{ x: 500, y: 960 }, { x: 500, y: 720 }, { x: 700, y: 720 }, { x: 700, y: 470 }, { x: 800, y: 470 }],
  ];

  const EMPLACEMENTS = [
    { x: 862, y: 262 }, { x: 736, y: 330 }, { x: 1030, y: 250 }, { x: 1030, y: 400 },
    { x: 380, y: 262 }, { x: 516, y: 258 }, { x: 380, y: 400 }, { x: 540, y: 560 },
    { x: 1350, y: 224 }, { x: 1520, y: 224 }, { x: 1320, y: 452 }, { x: 1090, y: 676 },
    { x: 1216, y: 676 }, { x: 1252, y: 82 }, { x: 1404, y: 84 }, { x: 1064, y: 226 },
    { x: 424, y: 822 }, { x: 610, y: 828 }, { x: 622, y: 604 }, { x: 782, y: 596 },
  ];

  // segments de chaque chemin, pour mesurer la progression
  const SEGS = CHEMINS.map(function (pts) {
    const segs = [];
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      segs.push({ a, b, l, debut: total });
      total += l;
    }
    segs.total = total;
    return segs;
  });

  function pointSurChemin(ci, d) {
    const segs = SEGS[ci];
    d = clamp(d, 0, segs.total);
    for (const s of segs) {
      if (d <= s.debut + s.l) {
        const t = (d - s.debut) / s.l;
        return { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t };
      }
    }
    const fin = CHEMINS[ci][CHEMINS[ci].length - 1];
    return { x: fin.x, y: fin.y };
  }

  function distanceAuChemin(p) {
    let mini = 1e9;
    for (const segs of SEGS) {
      for (const s of segs) {
        const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
        const t = clamp(((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / (s.l * s.l), 0, 1);
        const px = s.a.x + dx * t, py = s.a.y + dy * t;
        mini = Math.min(mini, Math.hypot(p.x - px, p.y - py));
      }
    }
    return mini;
  }

  /* ---------------------------- carte satellite ---------------------------- */
  let CARTE = null;
  let CARTE_ECHELLE = 2;
  let forcerPortrait = false;

  // la ville est entierement dessinee par le moteur

  function genererCarte() {
    const c = document.createElement("canvas");
    c.width = W * CARTE_ECHELLE;
    c.height = H * CARTE_ECHELLE;
    const g = c.getContext("2d");
    g.scale(CARTE_ECHELLE, CARTE_ECHELLE);
    const r = prng(20261109);

    /* --- sol --- */
    const sol = g.createLinearGradient(0, 0, W, H);
    sol.addColorStop(0, "#39402f");
    sol.addColorStop(0.5, "#414736");
    sol.addColorStop(1, "#333a2b");
    g.fillStyle = sol;
    g.fillRect(0, 0, W, H);

    for (let i = 0; i < 300; i++) {
      const x = r() * W, y = r() * H, rad = 18 + r() * 95;
      g.fillStyle = "rgba(" + ((52 + r() * 26) | 0) + "," + ((62 + r() * 26) | 0) + "," + ((44 + r() * 18) | 0) + ",0.13)";
      g.beginPath();
      g.arc(x, y, rad, 0, 6.283);
      g.fill();
    }

    /* --- rues secondaires : la trame de la ville --- */
    g.strokeStyle = "#5c5c52";
    g.lineWidth = 13;
    g.lineCap = "butt";
    for (let y = 90; y < H; y += 90) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    }
    for (let x = 100; x < W; x += 100) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
    }
    g.strokeStyle = "rgba(190,186,160,0.16)";
    g.lineWidth = 1.4;
    g.setLineDash([9, 14]);
    for (let y = 90; y < H; y += 90) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    }
    g.setLineDash([]);

    /* --- parcs et places --- */
    const parc = (x, y, w, h) => {
      g.fillStyle = "#2f4a2c";
      g.fillRect(x, y, w, h);
      g.fillStyle = "rgba(140,190,110,0.10)";
      g.fillRect(x + 3, y + 3, w - 6, h - 6);
      for (let i = 0; i < 16; i++) {
        const ax = x + 6 + r() * (w - 12), ay = y + 6 + r() * (h - 12);
        g.fillStyle = "rgba(18,26,16,0.55)";
        g.beginPath(); g.arc(ax + 3, ay + 3, 6 + r() * 5, 0, 6.283); g.fill();
        g.fillStyle = "#3f6b34";
        g.beginPath(); g.arc(ax, ay, 5 + r() * 5, 0, 6.283); g.fill();
      }
    };
    parc(106, 558, 184, 78);
    parc(706, 96, 190, 72);
    parc(1306, 646, 190, 168);
    parc(206, 102, 84, 72);

    /* --- batiments --- */
    const TEINTES = ["#6d6a5e", "#7a7263", "#5f6156", "#847a68", "#69665c", "#727c78"];
    const TOITS = ["#8b8172", "#7d7466", "#948b7a", "#6f6a60", "#82796a"];

    const batiment = (x, y, w, h, teinte, toit) => {
      g.fillStyle = "rgba(0,0,0,0.32)";
      g.fillRect(x + 4, y + 5, w, h);
      g.fillStyle = teinte;
      g.fillRect(x, y, w, h);
      g.fillStyle = toit;
      g.fillRect(x, y, w, Math.max(4, h * 0.34));
      g.strokeStyle = "rgba(0,0,0,0.30)";
      g.lineWidth = 1;
      g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      if (w > 20 && h > 20) {
        g.fillStyle = "rgba(255,236,180,0.20)";
        const cols = Math.max(2, Math.floor(w / 12)), rows = Math.max(2, Math.floor(h / 12));
        for (let i = 0; i < cols; i++) {
          for (let j = 0; j < rows; j++) {
            if (r() < 0.55) continue;
            g.fillRect(x + 4 + i * ((w - 8) / cols), y + h * 0.44 + j * ((h * 0.5) / rows), 3, 2.4);
          }
        }
      }
    };

    const pasX = 100, pasY = 90, marge = 15;
    for (let gx = 0; gx < W; gx += pasX) {
      for (let gy = 0; gy < H; gy += pasY) {
        const x0 = gx + marge, y0 = gy + marge, x1 = gx + pasX - marge, y1 = gy + pasY - marge;
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        if (Math.hypot(cx - MAIRIE.x, cy - MAIRIE.y) < 96) continue;
        if (distanceAuChemin({ x: cx, y: cy }) < 34) continue;

        const colonnes = 1 + ((r() < 0.45) ? 1 : 0);
        const rangees = 1 + ((r() < 0.5) ? 1 : 0);
        const bw = (x1 - x0 - (colonnes - 1) * 7) / colonnes;
        const bh = (y1 - y0 - (rangees - 1) * 7) / rangees;

        for (let i = 0; i < colonnes; i++) {
          for (let j = 0; j < rangees; j++) {
            const bx = x0 + i * (bw + 7), by = y0 + j * (bh + 7);
            if (r() < 0.12) continue;
            batiment(bx, by, bw, bh,
              TEINTES[(r() * TEINTES.length) | 0],
              TOITS[(r() * TOITS.length) | 0]);
          }
        }
      }
    }

    /* --- batiments signature aux couleurs Komara --- */
    const signature = (x, y, w, h, teinte, toit) => {
      g.fillStyle = "rgba(0,0,0,0.34)";
      g.fillRect(x + 4, y + 5, w, h);
      g.fillStyle = teinte;
      g.fillRect(x, y, w, h);
      g.fillStyle = toit;
      g.fillRect(x, y, w, Math.max(5, h * 0.30));
    };
    signature(352, 186, 76, 54, "#5a5548", "#c8302f");
    signature(1218, 366, 74, 56, "#5a5548", "#e8c327");
    signature(1040, 728, 78, 54, "#5a5548", "#1f9c55");
    signature(228, 742, 72, 56, "#5a5548", "#c8302f");

    /* --- place de la mairie --- */
    g.fillStyle = "#5a564a";
    g.beginPath();
    g.arc(MAIRIE.x, MAIRIE.y, 92, 0, 6.283);
    g.fill();
    g.fillStyle = "rgba(210,200,170,0.13)";
    g.beginPath();
    g.arc(MAIRIE.x, MAIRIE.y, 84, 0, 6.283);
    g.fill();
    g.strokeStyle = "rgba(245,207,27,0.22)";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(MAIRIE.x, MAIRIE.y, 92, 0, 6.283);
    g.stroke();

    /* --- arbres epars --- */
    for (let i = 0; i < 150; i++) {
      const x = r() * W, y = r() * H;
      if (distanceAuChemin({ x, y }) < 40) continue;
      if (Math.hypot(x - MAIRIE.x, y - MAIRIE.y) < 100) continue;
      g.fillStyle = "rgba(0,0,0,0.28)";
      g.beginPath(); g.arc(x + 3, y + 3, 7 + r() * 4, 0, 6.283); g.fill();
      g.fillStyle = "#3a6330";
      g.beginPath(); g.arc(x, y, 6 + r() * 4, 0, 6.283); g.fill();
    }

    /* --- asphalte des cinq routes d'invasion --- */
    const trace = (pts, largeur, couleur) => {
      g.lineCap = "round";
      g.lineJoin = "round";
      g.strokeStyle = "rgba(22,20,16,0.40)";
      g.lineWidth = largeur + 8;
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.stroke();
      g.strokeStyle = couleur;
      g.lineWidth = largeur;
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.stroke();
      g.strokeStyle = "rgba(210,200,175,0.10)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.stroke();
    };
    for (const pts of CHEMINS) trace(pts, 30, "#57544b");

    /* --- vignette --- */
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.38)");
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);

    return c;
  }

  /* --------------------------------- état --------------------------------- */
  const AUTO = (function () {
    try { return new URLSearchParams(location.search).get("auto") === "1"; } catch (e) { return false; }
  })();


  const etat = {
    ecran: "accueil",
    credit: 220,
    vague: 0,
    pvVille: 20,
    pvMax: 20,
    ennemis: [],
    prochaineRoute: 0,
    tirsEnnemis: [],
    tourelles: [],
    tirs: [],
    effets: [],
    cratere: null,
    choix: "mitrailleuse",
    selection: null,
    temps: 0,
    entreVagues: 2,
    fileVague: [],
    prochainSpawn: 0,
    enPause: false,
    fini: false,
    vitesse: 1,
    kills: 0,
    fuites: 0,
    cadenceMsg: 0,
  };

  /* -------------------------------- canvas -------------------------------- */
  const canvas = $("#scene");
  const ctx = canvas.getContext("2d");
  let L = 0, Hc = 0, echelle = 1, echelleBase = 1, ox = 0, oy = 0;
  const camC = { x: W / 2, y: H / 2, z: 1 };
  const camV = { x: W / 2, y: H / 2, z: 1 };

  function bornerCam() {
    const e = echelleBase * camC.z;
    const demiL = (L / 2) / e;
    const demiH = (Hc / 2) / e;
    if (demiL * 2 >= W - 1) camC.x = W / 2; else camC.x = clamp(camC.x, demiL, W - demiL);
    if (demiH * 2 >= H - 1) camC.y = H / 2; else camC.y = clamp(camC.y, demiH, H - demiH);
  }

  function appliquerCamera() {
    echelle = echelleBase * camV.z;
    ox = L / 2 - camV.x * echelle;
    oy = Hc / 2 - camV.y * echelle;
  }

  function centrerSur(p, z) {
    camC.x = p.x;
    camC.y = p.y;
    if (z) camC.z = z;
    bornerCam();
  }
  let lumiere = null;

  function redimensionner() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    L = canvas.clientWidth || window.innerWidth;
    Hc = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(L * dpr);
    canvas.height = Math.round(Hc * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    echelleBase = Math.min(L / W, Hc / H);
    bornerCam();
    camV.x = camC.x; camV.y = camC.y; camV.z = camC.z;
    appliquerCamera();

    lumiere = null;
  }

  function preparerLumiere() {
    if (lumiere) return;
    const g = ctx.createRadialGradient(L / 2, Hc / 2, Math.min(L, Hc) * 0.32, L / 2, Hc / 2, Math.max(L, Hc) * 0.78);
    g.addColorStop(0, "rgba(255,236,190,0.05)");
    g.addColorStop(0.6, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(10,8,4,0.5)");
    lumiere = g;
  }

  /* ------------------------------- placement ------------------------------- */
  function emplacementLibre(i) {
    return !etat.tourelles.some((t) => t.slot === i);
  }

  function placerTourelle(slot) {
    const modele = TOURELLES[etat.choix];
    if (!modele) return;
    if (!emplacementLibre(slot)) {
      const t = etat.tourelles.find((x) => x.slot === slot);
      ouvrirPanneau(t);
      return;
    }
    if (etat.credit < modele.cout) {
      bulle("Il te manque " + Math.ceil(modele.cout - etat.credit) + " crédits");
      son(180, 0.12, "square", 0.06);
      return;
    }
    const p = EMPLACEMENTS[slot];
    etat.credit -= modele.cout;
    etat.tourelles.push({
      slot, x: p.x, y: p.y, cle: etat.choix, niveau: 1,
      angle: -Math.PI / 2, recharge: 0, total: modele.cout,
      pv: modele.pv, pvMax: modele.pv,
    });
    son(520, 0.1, "triangle", 0.08);
    majHud();
  }

  function ouvrirPanneau(t) {
    etat.selection = t;
    const m = TOURELLES[t.cle];
    const cout = coutAmelioration(t);
    $("#p-titre").textContent = m.nom + " · niveau " + t.niveau;
    $("#p-desc").textContent =
      t.niveau >= 3
        ? "Niveau maximum. Dégâts " + Math.round(degatsDe(t)) + ", portée " + Math.round(porteeDe(t)) + " m."
        : "Dégâts " + Math.round(degatsDe(t)) + " · portée " + Math.round(porteeDe(t)) + " m. L'amélioration augmente les deux.";
    $("#p-cout").textContent = t.niveau >= 3 ? "" : cout + " ⚡";
    $("#p-desc").textContent += " État " + Math.max(0, Math.round(t.pv)) + "/" + Math.round(t.pvMax) + " PV."
      + (t.niveau < 3 ? " L'amélioration répare et renforce." : "");
    $("#p-ameliorer").disabled = t.niveau >= 3 || etat.credit < cout;
    $("#p-ameliorer").style.display = t.niveau >= 3 ? "none" : "block";
    $("#p-rendu").textContent = Math.round(t.total * 0.6) + " ⚡";
    $("#panneau").classList.remove("cache");
  }

  function fermerPanneau() {
    etat.selection = null;
    $("#panneau").classList.add("cache");
  }

  function coutAmelioration(t) {
    return Math.round(TOURELLES[t.cle].cout * 0.8 * t.niveau);
  }

  function degatsDe(t) {
    return TOURELLES[t.cle].degats * (1 + (t.niveau - 1) * 0.6);
  }

  function porteeDe(t) {
    return TOURELLES[t.cle].portee * (1 + (t.niveau - 1) * 0.1);
  }

  /* --------------------------------- vagues --------------------------------- */
  function demarrerVague() {
    etat.vague += 1;
    if (etat.vague > VAGUES.length) {
      return;
    }
    const v = VAGUES[etat.vague - 1];
    etat.fileVague = [];
    for (const [cle, nombre] of v.liste) {
      for (let i = 0; i < nombre; i++) etat.fileVague.push(cle);
    }
    // mélange pour éviter les blocs
    for (let i = etat.fileVague.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [etat.fileVague[i], etat.fileVague[j]] = [etat.fileVague[j], etat.fileVague[i]];
    }
    etat.prochainSpawn = 0;
    son(300, 0.25, "sawtooth", 0.07);
    bulle("Vague " + etat.vague + " · " + etat.fileVague.length + " hostiles");
    majHud();
  }

  function spawn(cle) {
    const m = ENNEMIS[cle];
    const ci = etat.prochaineRoute % CHEMINS.length;
    etat.prochaineRoute += 1;
    const depart = pointSurChemin(ci, 0);
    const suiv = pointSurChemin(ci, 8);
    etat.ennemis.push({
      cle, ci, x: depart.x + rnd(-6, 6), y: depart.y + rnd(-6, 6),
      pv: m.pv * (1 + (etat.vague - 1) * 0.09),
      pvMax: m.pv * (1 + (etat.vague - 1) * 0.09),
      d: 0, air: !!m.air, angle: Math.atan2(suiv.y - depart.y, suiv.x - depart.x),
      flash: 0, phase: rnd(0, 6.28),
      rechargeTir: rnd(0.4, 1.5), engagement: false,
    });
  }

  /* -------------------------------- combat -------------------------------- */
  function cibler(t) {
    let best = null;
    let bestD = porteeDe(t);
    for (const e of etat.ennemis) {
      if (e.pv <= 0) continue;
      const m = ENNEMIS[e.cle];
      if (m.air && !TOURELLES[t.cle].air) continue;
      if (!m.air && !TOURELLES[t.cle].sol) continue;
      const d = dist(t, e);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  function tirer(t, cible) {
    const m = TOURELLES[t.cle];
    t.angle = Math.atan2(cible.y - t.y, cible.x - t.x);
    etat.tirs.push({
      x: t.x + Math.cos(t.angle) * 16,
      y: t.y + Math.sin(t.angle) * 16,
      cible, vitesse: t.cle === "mortier" ? 210 : 620,
      degats: degatsDe(t), zone: m.zone || 0, cle: t.cle,
      type: t.cle === "mortier" ? "obus" : t.cle === "missile" ? "missile" : "balle",
      angle: t.angle,
    });
    son(t.cle === "mitrailleuse" ? 720 : 300, t.cle === "mitrailleuse" ? 0.03 : 0.12, "square", 0.035);
  }

  function toucher(tir) {
    const cible = tir.cible;
    if (!cible || cible.pv <= 0) return;
    let d = tir.degats;
    const m = ENNEMIS[cible.cle];
    if (m.blindage) d *= 1 - m.blindage * (tir.cle === "canon" ? 0.3 : 1);
    cible.pv -= d;
    cible.flash = 0.12;
    etat.effets.push({ type: "impact", x: cible.x, y: cible.y, t: 0, taille: tir.zone ? 1.6 : 0.7 });
    if (tir.zone) {
      for (const e of etat.ennemis) {
        if (e === cible || e.pv <= 0) continue;
        if (dist(e, cible) < tir.zone) { e.pv -= tir.degats * 0.45; e.flash = 0.1; }
      }
    }
    if (cible.pv <= 0) tuer(cible);
  }

  function detruireTourelle(t) {
    etat.tourelles = etat.tourelles.filter((x) => x !== t);
    etat.effets.push({ type: "explosion", x: t.x, y: t.y, t: 0, taille: 1.3 });
    if (etat.selection === t) fermerPanneau();
    bulle("Tourelle détruite !");
    son(90, 0.3, "sawtooth", 0.07);
  }

  function tuer(e) {
    const m = ENNEMIS[e.cle];
    etat.credit += m.recompense;
    etat.kills += 1;
    etat.effets.push({ type: "explosion", x: e.x, y: e.y, t: 0, taille: m.taille / 10 });
    son(110, 0.2, "sawtooth", 0.06);
    if (etat.cratere) {
      const g = etat.cratere.getContext("2d");
      g.fillStyle = "rgba(30,24,16,0.35)";
      g.beginPath();
      g.arc(e.x, e.y, m.taille * 0.9, 0, 6.283);
      g.fill();
    }
  }

  /* --------------------------------- boucle -------------------------------- */
  /* --------------------------- pilote de demo --------------------------- */
  let autoTimer = 0;
  function piloter(dt) {
    autoTimer -= dt;
    if (autoTimer > 0) return;
    autoTimer = 1.2;

    if (etat.tourelles.length >= 4 && Math.random() < 0.4) {
      const t = etat.tourelles.filter((x) => x.niveau < 3).sort((a, b) => a.niveau - b.niveau)[0];
      if (t) {
        const cout = coutAmelioration(t);
        if (etat.credit >= cout) {
          etat.credit -= cout;
          t.niveau += 1;
          son(700, 0.1, "triangle", 0.06);
          majHud();
          return;
        }
      }
    }

    const ordre = ["mitrailleuse", "canon", "mitrailleuse", "mortier", "missile", "canon"];
    const cle = ordre[etat.tourelles.length % ordre.length];
    if (etat.credit < TOURELLES[cle].cout) return;

    let meilleur = -1, meilleurD = 1e9;
    for (let i = 0; i < EMPLACEMENTS.length; i++) {
      if (!emplacementLibre(i)) continue;
      const d = distanceAuChemin(EMPLACEMENTS[i]) + Math.random() * 30;
      if (d < meilleurD) { meilleurD = d; meilleur = i; }
    }
    if (meilleur >= 0) {
      etat.choix = cle;
      placerTourelle(meilleur);
    }
  }

  function mettreAJour(dt) {
    if (etat.ecran !== "jeu" || etat.enPause || etat.fini) return;

    const pas = dt * etat.vitesse;
    etat.temps += pas;
    etat.credit = Math.min(9999, etat.credit + 9 * pas);
    etat.cadenceMsg = Math.max(0, etat.cadenceMsg - pas);
    if (AUTO) piloter(pas);

    // vagues
    if (etat.fileVague.length === 0 && etat.ennemis.length === 0) {
      if (etat.vague >= VAGUES.length) {
        if (!etat.fini) victoire();
        return;
      }
      etat.entreVagues -= pas;
      if (etat.entreVagues <= 0) {
        etat.entreVagues = 2;
        demarrerVague();
      }
    } else if (etat.fileVague.length > 0) {
      etat.prochainSpawn -= pas;
      if (etat.prochainSpawn <= 0) {
        spawn(etat.fileVague.shift());
        etat.prochainSpawn = 0.6;
      }
    }

    // ennemis
    for (const e of etat.ennemis) {
      if (e.pv <= 0) continue;
      const m = ENNEMIS[e.cle];
      e.flash = Math.max(0, e.flash - pas);
      e.phase += pas * 3;

      // riposte : l'ennemi vise les tourelles qui le prennent pour cible
      if (m.tir) {
        let cibleT = null, meilleur = m.tir.portee;
        for (const t of etat.tourelles) {
          const dt2 = Math.hypot(t.x - e.x, t.y - e.y);
          if (dt2 < meilleur) { meilleur = dt2; cibleT = t; }
        }
        if (cibleT) {
          e.engagement = true;
          e.rechargeTir -= pas;
          const at = Math.atan2(cibleT.y - e.y, cibleT.x - e.x);
          if (!e.air) e.angle = at;
          if (e.rechargeTir <= 0) {
            e.rechargeTir = m.tir.cadence;
            etat.tirsEnnemis.push({
              x: e.x + Math.cos(at) * 10, y: e.y + Math.sin(at) * 10,
              cible: cibleT, angle: at, vitesse: 300, degats: m.tir.degats, mort: false,
            });
            son(210, 0.05, "square", 0.022);
          }
          if (!e.air) continue;
        } else {
          e.engagement = false;
        }
      }

      if (e.air) {
        // les hélicos coupent droit vers la mairie
        const a = Math.atan2(MAIRIE.y - e.y, MAIRIE.x - e.x);
        e.angle = a;
        e.x += Math.cos(a) * m.vit * pas;
        e.y += Math.sin(a) * m.vit * pas;
        if (dist(e, MAIRIE) < 30) arriver(e);
      } else {
        e.d += m.vit * pas;
        const p = pointSurChemin(e.ci, e.d);
        e.x = p.x;
        e.y = p.y;
        const p2 = pointSurChemin(e.ci, e.d + 6);
        e.angle = Math.atan2(p2.y - p.y, p2.x - p.x);
        if (e.d >= SEGS[e.ci].total) arriver(e);
      }
    }

    // tourelles
    for (const t of etat.tourelles) {
      t.recharge -= pas;
      const c = cibler(t);
      if (c) {
        const a = Math.atan2(c.y - t.y, c.x - t.x);
        let diff = a - t.angle;
        while (diff > Math.PI) diff -= 6.283;
        while (diff < -Math.PI) diff += 6.283;
        t.angle += clamp(diff, -7 * pas, 7 * pas);
        if (t.recharge <= 0) {
          tirer(t, c);
          t.recharge = TOURELLES[t.cle].cadence;
        }
      }
    }

    // projectiles
    for (const tir of etat.tirs) {
      const c = tir.cible;
      if (!c || c.pv <= 0) { tir.mort = true; continue; }
      const a = Math.atan2(c.y - tir.y, c.x - tir.x);
      const d = dist(tir, c);
      const pasTir = tir.vitesse * pas;
      if (d <= pasTir) {
        toucher(tir);
        tir.mort = true;
      } else {
        tir.x += Math.cos(a) * pasTir;
        tir.y += Math.sin(a) * pasTir;
        tir.angle = a;
      }
    }

    // projectiles ennemis : ils visent les tourelles
    for (const tir of etat.tirsEnnemis) {
      const c = tir.cible;
      if (!c || c.pv <= 0 || etat.tourelles.indexOf(c) < 0) { tir.mort = true; continue; }
      const a = Math.atan2(c.y - tir.y, c.x - tir.x);
      const d = Math.hypot(c.x - tir.x, c.y - tir.y);
      const pasTir = tir.vitesse * pas;
      if (d <= pasTir) {
        c.pv -= tir.degats;
        c.flash = 0.16;
        etat.effets.push({ type: "impact", x: c.x, y: c.y, t: 0, taille: 0.7 });
        if (c.pv <= 0) detruireTourelle(c);
        tir.mort = true;
      } else {
        tir.x += Math.cos(a) * pasTir;
        tir.y += Math.sin(a) * pasTir;
        tir.angle = a;
      }
    }

    // effets
    for (const ef of etat.effets) ef.t += pas;

    // nettoyage
    etat.ennemis = etat.ennemis.filter((e) => e.pv > 0);
    etat.tirs = etat.tirs.filter((t) => !t.mort);
    etat.tirsEnnemis = etat.tirsEnnemis.filter((t) => !t.mort);
    etat.effets = etat.effets.filter((e) => e.t < (e.type === "explosion" ? 0.9 : 0.45));

    if (etat.pvVille <= 0 && !etat.fini) defaite();
    majHud();
  }

  function arriver(e) {
    const m = ENNEMIS[e.cle];
    e.pv = 0;
    etat.pvVille -= m.degatsVille;
    etat.fuites += 1;
    etat.effets.push({ type: "explosion", x: MAIRIE.x, y: MAIRIE.y, t: 0, taille: 1.4 });
    son(70, 0.35, "sawtooth", 0.1);
    if (etat.pvVille <= 0) { etat.pvVille = 0; }
  }

  /* --------------------------------- rendu --------------------------------- */
  function dessiner(dt) {
    ctx.clearRect(0, 0, L, Hc);

    // fond hors cadre : degrade sobre aux couleurs de la ville
    const fond = ctx.createLinearGradient(0, 0, 0, Hc);
    fond.addColorStop(0, "#111a13");
    fond.addColorStop(1, "#0a0f0b");
    ctx.fillStyle = fond;
    ctx.fillRect(0, 0, L, Hc);

    // liseres sur les bords de la carte
    ctx.strokeStyle = "rgba(245,207,27,0.20)";
    ctx.lineWidth = 2;
    ctx.strokeRect(ox, oy, W * echelle, H * echelle);

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(echelle, echelle);

    if (CARTE) ctx.drawImage(CARTE, 0, 0, W, H);

    // pointilles animes sur les cinq axes
    ctx.setLineDash([10, 22]);
    ctx.lineDashOffset = -etat.temps * 26;
    ctx.strokeStyle = "rgba(240,220,150,0.30)";
    ctx.lineWidth = 2.4;
    for (const pts of CHEMINS) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;

    // entrees : une par route
    for (let ci = 0; ci < CHEMINS.length; ci++) {
      const dep = CHEMINS[ci][0];
      const sui = CHEMINS[ci][1];
      if (dep.x < -10 || dep.y < -10 || dep.x > W + 10 || dep.y > H + 10) continue;
      const puls2 = 0.5 + Math.sin(etat.temps * 3.2 + ci * 1.2) * 0.5;
      ctx.fillStyle = "rgba(200,16,46," + (0.10 + puls2 * 0.15).toFixed(2) + ")";
      ctx.beginPath();
      ctx.arc(dep.x, dep.y, 46 + puls2 * 9, 0, 6.283);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,72,96," + (0.5 + puls2 * 0.4).toFixed(2) + ")";
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(dep.x, dep.y, 30, 0, 6.283);
      ctx.stroke();
      const ang = Math.atan2(sui.y - dep.y, sui.x - dep.x);
      ctx.save();
      ctx.translate(dep.x, dep.y);
      ctx.rotate(ang);
      ctx.fillStyle = "rgba(255,86,106," + (0.65 + puls2 * 0.35).toFixed(2) + ")";
      ctx.beginPath();
      ctx.moveTo(-4, -11); ctx.lineTo(18, 0); ctx.lineTo(-4, 11); ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    if (etat.cratere) ctx.drawImage(etat.cratere, 0, 0, W, H);

    // mairie : halo de protection
    const puls = 0.5 + Math.sin(etat.temps * 2) * 0.2;
    ctx.strokeStyle = "rgba(245,207,27," + (0.18 + puls * 0.14).toFixed(2) + ")";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(MAIRIE.x, MAIRIE.y, 42, 0, 6.283);
    ctx.stroke();

    // emplacements
    for (let i = 0; i < EMPLACEMENTS.length; i++) {
      if (!emplacementLibre(i)) continue;
      const p = EMPLACEMENTS[i];
      const proche = etat.selection === null;
      ctx.strokeStyle = proche ? "rgba(245,207,27,0.45)" : "rgba(255,255,255,0.22)";
      ctx.lineWidth = 1.6;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 17, 0, 6.283);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(245,207,27,0.12)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 17, 0, 6.283);
      ctx.fill();
    }

    // tourelles
    for (const t of etat.tourelles) dessinerTourelle(t);

    // ennemis
    for (const e of etat.ennemis) dessinerEnnemi(e);

    // projectiles
    for (const tir of etat.tirs) dessinerTir(tir);
    for (const tir of etat.tirsEnnemis) dessinerTirEnnemi(tir);

    // effets
    for (const ef of etat.effets) dessinerEffet(ef);

    ctx.restore();

    preparerLumiere();
    ctx.fillStyle = lumiere;
    ctx.fillRect(0, 0, L, Hc);
  }

  function dessinerTourelle(t) {
    const m = TOURELLES[t.cle];
    ctx.save();
    ctx.translate(t.x, t.y);

    // ombre
    ctx.fillStyle = "rgba(10,8,4,0.38)";
    ctx.beginPath();
    ctx.ellipse(4, 5, 17, 15, 0, 0, 6.283);
    ctx.fill();

    // base
    ctx.fillStyle = "#4a4a42";
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, 6.283);
    ctx.fill();
    ctx.fillStyle = "#5f5f55";
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, 6.283);
    ctx.fill();

    // canon
    ctx.rotate(t.angle);
    ctx.fillStyle = m.couleur;
    const long = t.cle === "canon" || t.cle === "mortier" ? 20 : 15;
    ctx.fillRect(4, -2.6, long, 5.2);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(4, -2.6, long, 1.6);

    // tourelle
    ctx.beginPath();
    ctx.arc(0, 0, 6.5, 0, 6.283);
    ctx.fillStyle = m.couleur;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();

    // etat de la tourelle
    if (t.pv < t.pvMax) {
      const larg = 26, haut = 3.6;
      const ratio = Math.max(0, t.pv / t.pvMax);
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(t.x - larg / 2, t.y - 26, larg, haut);
      ctx.fillStyle = ratio > 0.5 ? "#4ade80" : ratio > 0.25 ? "#f5cf1b" : "#e5484d";
      ctx.fillRect(t.x - larg / 2, t.y - 26, larg * ratio, haut);
    }

    // niveau
    if (t.niveau > 1) {
      ctx.fillStyle = "#f5cf1b";
      ctx.font = "bold 9px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("★".repeat(t.niveau - 1), t.x, t.y - 18);
    }
  }

  function dessinerTirEnnemi(tir) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,120,70,0.95)";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(tir.x, tir.y);
    ctx.lineTo(tir.x - Math.cos(tir.angle) * 12, tir.y - Math.sin(tir.angle) * 12);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,90,40,0.9)";
    ctx.beginPath();
    ctx.arc(tir.x, tir.y, 2.2, 0, 6.283);
    ctx.fill();
    ctx.restore();
  }

  function dessinerEnnemi(e) {
    const m = ENNEMIS[e.cle];
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.angle);

    ctx.fillStyle = "rgba(8,8,4,0.35)";
    ctx.beginPath();
    ctx.ellipse(3, 4, m.taille * 1.05, m.taille * 0.8, 0, 0, 6.283);
    ctx.fill();

    const coul = e.flash > 0 ? "#ff8a6a" : m.couleur;

    if (m.air) {
      // hélicoptère : corps + rotor
      ctx.fillStyle = coul;
      ctx.beginPath();
      ctx.ellipse(0, 0, m.taille * 1.3, m.taille * 0.55, 0, 0, 6.283);
      ctx.fill();
      ctx.fillStyle = "rgba(20,20,16,0.55)";
      ctx.beginPath();
      ctx.ellipse(-m.taille * 0.5, 0, m.taille * 0.7, m.taille * 0.28, 0, 0, 6.283);
      ctx.fill();
      const rot = (e.phase * 6) % 6.283;
      ctx.strokeStyle = "rgba(230,230,220,0.5)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(Math.cos(rot) * m.taille * 1.9, Math.sin(rot) * m.taille * 1.9);
      ctx.lineTo(-Math.cos(rot) * m.taille * 1.9, -Math.sin(rot) * m.taille * 1.9);
      ctx.stroke();
    } else if (e.cle === "blinde" || e.cle === "boss") {
      // véhicule blindé vu du dessus
      ctx.fillStyle = coul;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-m.taille, -m.taille * 0.62, m.taille * 2, m.taille * 1.24, 3);
      else ctx.rect(-m.taille, -m.taille * 0.62, m.taille * 2, m.taille * 1.24);
      ctx.fill();
      // tourelle
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.arc(-1, 0, m.taille * 0.42, 0, 6.283);
      ctx.fill();
      ctx.fillStyle = "rgba(30,30,24,0.75)";
      ctx.fillRect(m.taille * 0.3, -m.taille * 0.12, m.taille * 1.1, m.taille * 0.24);
      // chenilles
      ctx.fillStyle = "rgba(18,18,14,0.65)";
      ctx.fillRect(-m.taille * 0.9, -m.taille * 0.66, m.taille * 1.8, m.taille * 0.2);
      ctx.fillRect(-m.taille * 0.9, m.taille * 0.46, m.taille * 1.8, m.taille * 0.2);
    } else {
      // fantassin
      ctx.fillStyle = coul;
      ctx.beginPath();
      ctx.arc(0, 0, m.taille * 0.62, 0, 6.283);
      ctx.fill();
      ctx.fillStyle = "rgba(30,34,26,0.85)";
      ctx.beginPath();
      ctx.arc(-m.taille * 0.18, 0, m.taille * 0.32, 0, 6.283);
      ctx.fill();
      ctx.fillStyle = "rgba(20,20,16,0.8)";
      ctx.fillRect(m.taille * 0.3, -1.2, m.taille * 0.9, 2.4);
    }

    ctx.restore();

    // barre de vie
    if (e.pv < e.pvMax) {
      const w = Math.max(16, m.taille * 2);
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(e.x - w / 2, e.y - m.taille - 9, w, 3.4);
      ctx.fillStyle = e.pv / e.pvMax > 0.5 ? "#7bd44a" : e.pv / e.pvMax > 0.25 ? "#f5cf1b" : "#e04b3a";
      ctx.fillRect(e.x - w / 2, e.y - m.taille - 9, w * clamp(e.pv / e.pvMax, 0, 1), 3.4);
    }
  }

  function dessinerTir(tir) {
    ctx.save();
    if (tir.type === "balle") {
      ctx.strokeStyle = "rgba(255,236,160,0.95)";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(tir.x, tir.y);
      ctx.lineTo(tir.x - Math.cos(tir.angle) * 9, tir.y - Math.sin(tir.angle) * 9);
      ctx.stroke();
    } else if (tir.type === "obus") {
      ctx.fillStyle = "#2e2a20";
      ctx.beginPath();
      ctx.arc(tir.x, tir.y, 3.4, 0, 6.283);
      ctx.fill();
      ctx.fillStyle = "rgba(255,170,80,0.5)";
      ctx.beginPath();
      ctx.arc(tir.x, tir.y, 1.6, 0, 6.283);
      ctx.fill();
    } else {
      ctx.fillStyle = "#d8d8cc";
      ctx.beginPath();
      ctx.arc(tir.x, tir.y, 2.6, 0, 6.283);
      ctx.fill();
      ctx.strokeStyle = "rgba(220,220,210,0.35)";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(tir.x, tir.y);
      ctx.lineTo(tir.x - Math.cos(tir.angle) * 16, tir.y - Math.sin(tir.angle) * 16);
      ctx.stroke();
    }
    ctx.restore();
  }

  function dessinerEffet(ef) {
    const k = ef.t / (ef.type === "explosion" ? 0.9 : 0.45);
    if (ef.type === "explosion") {
      const rr = 10 + k * 34 * ef.taille;
      ctx.fillStyle = "rgba(255,150,60," + (0.55 * (1 - k)).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(ef.x, ef.y, rr, 0, 6.283);
      ctx.fill();
      ctx.fillStyle = "rgba(255,240,190," + (0.5 * (1 - k)).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(ef.x, ef.y, rr * 0.45, 0, 6.283);
      ctx.fill();
      ctx.strokeStyle = "rgba(60,50,40," + (0.3 * (1 - k)).toFixed(3) + ")";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ef.x, ef.y, rr * 1.35, 0, 6.283);
      ctx.stroke();
    } else {
      ctx.fillStyle = "rgba(255,225,150," + (0.7 * (1 - k)).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(ef.x, ef.y, 4 + k * 10 * ef.taille, 0, 6.283);
      ctx.fill();
    }
  }

  /* ----------------------------------- HUD ---------------------------------- */
  const hud = {
    pv: $("#hud-pv"), bar: $("#bar-pv"), vague: $("#hud-vague"),
    info: $("#hud-vague-info"), credit: $("#hud-credit"),
  };

  function majHud() {
    if (!hud.pv) return;
    hud.pv.textContent = Math.max(0, Math.ceil(etat.pvVille));
    hud.bar.style.width = Math.max(0, (etat.pvVille / etat.pvMax) * 100) + "%";
    hud.bar.style.background = etat.pvVille / etat.pvMax > 0.5
      ? "linear-gradient(90deg,#2ecc71,#a4e34a)"
      : etat.pvVille / etat.pvMax > 0.25
        ? "linear-gradient(90deg,#f5cf1b,#ffe066)"
        : "linear-gradient(90deg,#d11231,#ff6b5a)";
    hud.vague.textContent = "VAGUE " + Math.min(etat.vague || 1, VAGUES.length) + " / " + VAGUES.length;
    hud.info.textContent = etat.ennemis.length + " sur le terrain";
    hud.credit.textContent = Math.floor(etat.credit);
  }

  let bulleTimer = null;
  function bulle(txt) {
    const b = $("#bulle");
    if (!b) return;
    b.textContent = txt;
    b.classList.remove("cache");
    clearTimeout(bulleTimer);
    bulleTimer = setTimeout(() => b.classList.add("cache"), 2200);
  }

  /* --------------------------------- cartes --------------------------------- */
  function construireCartes() {
    const zone = $("#cartes");
    zone.innerHTML = "";
    Object.keys(TOURELLES).forEach((cle) => {
      const m = TOURELLES[cle];
      const b = document.createElement("button");
      b.className = "carte" + (cle === etat.choix ? " choisie" : "");
      b.dataset.cle = cle;
      b.innerHTML = '<span class="ico">' + m.ico + '</span><span class="nom">' + m.nom +
        '</span><span class="cout">' + m.cout + " ⚡</span>";
      b.addEventListener("click", () => {
        etat.choix = cle;
        fermerPanneau();
        construireCartes();
        majCartes();
        son(440, 0.05, "triangle", 0.05);
      });
      zone.appendChild(b);
    });
  }

  function majCartes() {
    document.querySelectorAll(".carte").forEach((c) => {
      const m = TOURELLES[c.dataset.cle];
      c.classList.toggle("pauvre", etat.credit < m.cout);
      c.classList.toggle("choisie", c.dataset.cle === etat.choix);
    });
  }

  /* --------------------------------- écrans --------------------------------- */
  function afficher(nom) {
    etat.ecran = nom;
    document.querySelectorAll(".ecran").forEach((e) => e.classList.remove("actif"));
    const el = document.getElementById(nom);
    if (el) el.classList.add("actif");
    if (nom === "jeu") setTimeout(redimensionner, 30);
  }

  function dessinerAccueil() {
    $("#acc-vague").textContent = sauvegarde.vague || 0;
    $("#acc-kills").textContent = sauvegarde.kills || 0;
    $("#acc-villes").textContent = sauvegarde.villes || 0;
  }

  function demarrer() {
    etat.credit = 220;
    etat.vague = 0;
    etat.pvVille = 20;
    etat.pvMax = 20;
    etat.ennemis = [];
    etat.tourelles = [];
    etat.tirs = [];
    etat.tirsEnnemis = [];
    etat.effets = [];
    etat.fileVague = [];
    etat.entreVagues = 4;
    etat.temps = 0;
    etat.fini = false;
    etat.enPause = false;
    etat.choix = "mitrailleuse";
    etat.kills = 0;
    etat.fuites = 0;
    etat.selection = null;

    etat.cratere = document.createElement("canvas");
    etat.cratere.width = W;
    etat.cratere.height = H;

    $("#voile").classList.add("cache");
    fermerPanneau();
    construireCartes();
    majCartes();
    afficher("jeu");
    majRotation();
    redimensionner();
    majHud();
    bulle("Place tes défenses avant la première vague");
    if (etat.auto) autoPlacer();
  }

  function victoire() {
    etat.fini = true;
    sauvegarde.villes = (sauvegarde.villes || 0) + 1;
    sauvegarde.vague = Math.max(sauvegarde.vague || 0, VAGUES.length);
    sauvegarde.kills = (sauvegarde.kills || 0) + etat.kills;
    enregistrer();
    $("#v-titre").textContent = "Ville sauvée";
    $("#v-texte").textContent = "Les dix vagues sont brisées. La ville tient, et la mairie aussi.";
    $("#v-stats").innerHTML =
      "<div><b>" + etat.kills + "</b>Neutralisés</div>" +
      "<div><b>" + etat.fuites + "</b>Passés</div>" +
      "<div><b>" + etat.tourelles.length + "</b>Tourelles</div>";
    $("#voile").classList.remove("cache");
    son(660, 0.3, "sine", 0.12);
    setTimeout(() => son(880, 0.4, "sine", 0.12), 220);
  }

  function defaite() {
    etat.fini = true;
    sauvegarde.vague = Math.max(sauvegarde.vague || 0, etat.vague);
    sauvegarde.kills = (sauvegarde.kills || 0) + etat.kills;
    enregistrer();
    $("#v-titre").textContent = "La ville est tombée";
    $("#v-texte").textContent = "Les envahisseurs ont atteint la mairie à la vague " + etat.vague +
      ". Reprends la carte et couvre mieux les virages.";
    $("#v-stats").innerHTML =
      "<div><b>" + etat.kills + "</b>Neutralisés</div>" +
      "<div><b>" + Math.max(0, etat.vague) + "</b>Vague atteinte</div>" +
      "<div><b>" + etat.tourelles.length + "</b>Tourelles</div>";
    $("#voile").classList.remove("cache");
    son(140, 0.6, "sawtooth", 0.12);
  }

  /* -------------------------------- pilotage -------------------------------- */
  etat.auto = /auto/.test(location.search);

  function autoPlacer() {
    const ordre = ["mitrailleuse", "canon", "mortier", "mitrailleuse", "missile"];
    let k = 0;
    for (let i = 0; i < EMPLACEMENTS.length && k < ordre.length; i++) {
      etat.choix = ordre[k];
      const m = TOURELLES[etat.choix];
      if (etat.credit >= m.cout) {
        placerTourelle(i);
        k++;
      }
    }
    etat.choix = "mitrailleuse";
    construireCartes();
    majCartes();
  }

  /* --------------------------------- entrées -------------------------------- */
  function pointEcran(ev) {
    const r = canvas.getBoundingClientRect();
    const cx = (ev.clientX != null ? ev.clientX : ev.touches[0].clientX) - r.left;
    const cy = (ev.clientY != null ? ev.clientY : ev.touches[0].clientY) - r.top;
    return { x: (cx - ox) / echelle, y: (cy - oy) / echelle };
  }

  let geste = null;

  canvas.addEventListener("pointerdown", (ev) => {
    if (etat.ecran !== "jeu") return;
    geste = { x: ev.clientX, y: ev.clientY, camX: camC.x, camY: camC.y, bouge: false, id: ev.pointerId, t: performance.now() };
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
  });

  canvas.addEventListener("pointermove", (ev) => {
    if (!geste || geste.id !== ev.pointerId) return;
    const dx = ev.clientX - geste.x, dy = ev.clientY - geste.y;
    if (!geste.bouge && Math.hypot(dx, dy) > 10) geste.bouge = true;
    if (!geste.bouge) return;
    const e = echelleBase * camV.z;
    camC.x = geste.camX - dx / e;
    camC.y = geste.camY - dy / e;
    bornerCam();
    camV.x = camC.x;
    camV.y = camC.y;
    appliquerCamera();
  });

  canvas.addEventListener("pointerup", (ev) => {
    if (!geste || geste.id !== ev.pointerId) return;
    const g = geste;
    geste = null;
    if (g.bouge) return;
    if (etat.enPause || etat.fini) return;
    poserAuDoigt({ clientX: ev.clientX, clientY: ev.clientY });
  });

  canvas.addEventListener("pointercancel", () => { geste = null; });

  // pincement a deux doigts
  let pince = null;
  canvas.addEventListener("touchstart", (ev) => {
    if (ev.touches.length === 2) {
      const [a, b] = ev.touches;
      pince = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), z: camC.z };
      geste = null;
    }
  }, { passive: true });
  canvas.addEventListener("touchmove", (ev) => {
    if (!pince || ev.touches.length !== 2) return;
    const [a, b] = ev.touches;
    const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    camC.z = clamp(pince.z * (d / pince.d), 1, 3.2);
    bornerCam();
    appliquerCamera();
    ev.preventDefault();
  }, { passive: false });
  canvas.addEventListener("touchend", () => { pince = null; }, { passive: true });

  function poserAuDoigt(ev) {
    const p = pointEcran(ev);

    // tourelle existante ?
    for (const t of etat.tourelles) {
      if (dist(p, t) * echelle < 34) {
        ouvrirPanneau(t);
        return;
      }
    }

    // emplacement libre ?
    for (let i = 0; i < EMPLACEMENTS.length; i++) {
      const e = EMPLACEMENTS[i];
      if (dist(p, e) * echelle < 44) {
        if (emplacementLibre(i)) placerTourelle(i);
        else ouvrirPanneau(etat.tourelles.find((t) => t.slot === i));
        return;
      }
    }
    fermerPanneau();
  }

  $("#p-ameliorer").addEventListener("click", () => {
    const t = etat.selection;
    if (!t || t.niveau >= 3) return;
    const cout = coutAmelioration(t);
    if (etat.credit < cout) return;
    etat.credit -= cout;
    t.niveau += 1;
    t.total += cout;
    t.pvMax = Math.round(t.pvMax * 1.35);
    t.pv = t.pvMax;
    son(700, 0.12, "triangle", 0.08);
    ouvrirPanneau(t);
    majHud();
  });

  $("#p-vendre").addEventListener("click", () => {
    const t = etat.selection;
    if (!t) return;
    etat.credit += Math.round(t.total * 0.6);
    etat.tourelles = etat.tourelles.filter((x) => x !== t);
    fermerPanneau();
    majHud();
  });

  $("#p-fermer").addEventListener("click", fermerPanneau);

  $("#btn-zoom-plus").addEventListener("click", () => {
    camC.z = clamp(camC.z * 1.35, 1, 3.2);
    bornerCam();
  });
  $("#btn-zoom-moins").addEventListener("click", () => {
    camC.z = clamp(camC.z / 1.35, 1, 3.2);
    bornerCam();
  });
  $("#btn-vue").addEventListener("click", () => {
    if (camC.z > 1.1) { camC.z = 1; camC.x = W / 2; camC.y = H / 2; }
    else { camC.z = 1.9; }
    bornerCam();
  });

  $("#btn-pause").addEventListener("click", () => {
    etat.enPause = !etat.enPause;
    $("#btn-pause").textContent = etat.enPause ? "▶" : "⏸";
    bulle(etat.enPause ? "Pause" : "Reprise");
  });

  $("#btn-vitesse").addEventListener("click", () => {
    etat.vitesse = etat.vitesse === 1 ? 2 : 1;
    $("#btn-vitesse").classList.toggle("actif", etat.vitesse === 2);
  });

  $("#btn-son").addEventListener("click", () => {
    sauvegarde.son = !sauvegarde.son;
    enregistrer();
    $("#btn-son").textContent = sauvegarde.son ? "🔊" : "🔇";
    if (sauvegarde.son) son(520, 0.08, "sine", 0.08);
  });

  $("#btn-jouer").addEventListener("click", () => { audioInit(); demarrer(); });

  $("#v-menu").addEventListener("click", () => { dessinerAccueil(); afficher("accueil"); });
  $("#v-rejouer").addEventListener("click", demarrer);

  $("#btn-reset").addEventListener("click", () => {
    sauvegarde = Object.assign({}, DEFAUT);
    enregistrer();
    dessinerAccueil();
    bulle("Progression effacée");
  });

  function majRotation() {
    const portrait = window.matchMedia("(orientation: portrait)").matches &&
      Math.min(window.innerWidth, window.innerHeight) < 900;
    const el = $("#rotation");
    if (!el) return;
    const actif = portrait && !forcerPortrait && etat.ecran === "jeu";
    el.classList.toggle("actif", actif);
    etat.enPause = actif;
  }

  $("#rot-continuer").addEventListener("click", () => {
    forcerPortrait = true;
    majRotation();
    redimensionner();
    etat.enPause = false;
  });

  window.addEventListener("resize", () => { redimensionner(); majRotation(); });
  window.addEventListener("orientationchange", () => setTimeout(() => { redimensionner(); majRotation(); }, 250));

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) etat.enPause = true;
  });

  /* ---------------------------------- boucle -------------------------------- */
  let dernier = 0;

  function boucle(t) {
    const dt = Math.min(0.05, (t - dernier) / 1000 || 0.016);
    dernier = t;
    const liss = Math.min(1, dt * 11);
    camV.x += (camC.x - camV.x) * liss;
    camV.y += (camC.y - camV.y) * liss;
    camV.z += (camC.z - camV.z) * liss;
    appliquerCamera();

    if (etat.ecran === "jeu") {
      mettreAJour(dt);
      dessiner(dt);
    }
    requestAnimationFrame(boucle);
  }

  /* ---------------------------------- départ -------------------------------- */
  function init() {
    window.__komara = etat;
    CARTE = genererCarte();
    redimensionner();
    dessinerAccueil();
    $("#btn-son").textContent = sauvegarde.son ? "🔊" : "🔇";
    construireCartes();
    majHud();
    majRotation();
    requestAnimationFrame(boucle);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
