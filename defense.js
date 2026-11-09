/* ==========================================================================
   Komara Défense — moteur
   Vue satellite de la ville, défense contre les vagues d'invasion.
   ========================================================================== */
(function () {
  "use strict";

  /* ------------------------------- constantes ------------------------------ */
  const W = 1280;
  const H = 720;
  const CLE = "komara-defense-v1";

  const TOURELLES = {
    mitrailleuse: {
      nom: "Mitrailleuse", ico: "🔫", cout: 60,
      degats: 5, cadence: 0.12, portee: 132, sol: true, air: true, couleur: "#c9d3c4",
    },
    canon: {
      nom: "Canon", ico: "💥", cout: 120,
      degats: 42, cadence: 1.45, portee: 168, sol: true, air: false, couleur: "#b9a06a",
    },
    missile: {
      nom: "Missile", ico: "🚀", cout: 150,
      degats: 58, cadence: 1.9, portee: 215, sol: false, air: true, couleur: "#9fb8c9",
    },
    mortier: {
      nom: "Mortier", ico: "💣", cout: 140,
      degats: 38, cadence: 2.2, portee: 235, sol: true, air: false, zone: 62, couleur: "#a8a08e",
    },
  };

  const ENNEMIS = {
    eclaireur: { nom: "Éclaireur", pv: 42, vit: 76, recompense: 8, taille: 9, degatsVille: 1, air: false, couleur: "#8a6b3f" },
    soldat: { nom: "Soldat", pv: 76, vit: 50, recompense: 10, taille: 10, degatsVille: 2, air: false, couleur: "#6d5b45" },
    blinde: { nom: "Blindé", pv: 240, vit: 34, recompense: 28, taille: 15, degatsVille: 2, air: false, couleur: "#4a5240", blindage: 0.55 },
    helico: { nom: "Hélico", pv: 96, vit: 64, recompense: 24, taille: 12, degatsVille: 3, air: true, couleur: "#3e4a3a" },
    boss: { nom: "Convoi lourd", pv: 1200, vit: 22, recompense: 220, taille: 22, degatsVille: 10, air: false, couleur: "#3c332a", blindage: 0.4 },
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
  // Axe d'invasion : la route vient de l'est et serpente jusqu'à la mairie.
  const CHEMIN = [
    { x: 1244, y: 476 }, { x: 1052, y: 476 }, { x: 1052, y: 292 },
    { x: 782, y: 292 }, { x: 782, y: 512 }, { x: 482, y: 512 },
    { x: 482, y: 314 }, { x: 372, y: 314 },
  ];

  const MAIRIE = { x: 328, y: 314 };

  const EMPLACEMENTS = [
    { x: 1160, y: 550 }, { x: 1150, y: 402 }, { x: 1150, y: 198 },
    { x: 952, y: 210 }, { x: 902, y: 362 }, { x: 700, y: 378 },
    { x: 690, y: 210 }, { x: 620, y: 578 }, { x: 884, y: 600 },
    { x: 552, y: 438 }, { x: 390, y: 578 }, { x: 366, y: 228 },
    { x: 392, y: 432 }, { x: 604, y: 228 },
  ];

  // segments du chemin, pour mesurer la progression
  const SEGMENTS = [];
  (function () {
    let total = 0;
    for (let i = 0; i < CHEMIN.length - 1; i++) {
      const a = CHEMIN[i], b = CHEMIN[i + 1];
      const l = dist(a, b);
      SEGMENTS.push({ a, b, l, debut: total });
      total += l;
    }
    SEGMENTS.total = total;
  })();

  function pointSurChemin(d) {
    d = clamp(d, 0, SEGMENTS.total);
    for (const s of SEGMENTS) {
      if (d <= s.debut + s.l) {
        const t = (d - s.debut) / s.l;
        return { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t };
      }
    }
    const fin = CHEMIN[CHEMIN.length - 1];
    return { x: fin.x, y: fin.y };
  }

  function distanceAuChemin(p) {
    let mini = 1e9;
    for (const s of SEGMENTS) {
      const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
      const t = clamp(((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / (s.l * s.l), 0, 1);
      const px = s.a.x + dx * t, py = s.a.y + dy * t;
      mini = Math.min(mini, Math.hypot(p.x - px, p.y - py));
    }
    return mini;
  }

  /* ---------------------------- carte satellite ---------------------------- */
  let CARTE = null;
  let CARTE_ECHELLE = 2;
  let forcerPortrait = false;

  // fond satellite photographique (repli : carte dessinee)
  const IMG = new Image();
  IMG.decoding = "async";
  IMG.onload = function () { CARTE = genererCarte(); };
  IMG.src = "assets/carte-satellite.jpg";

  function genererCarte() {
    const c = document.createElement("canvas");
    c.width = W * CARTE_ECHELLE;
    c.height = H * CARTE_ECHELLE;
    const g = c.getContext("2d");
    g.scale(CARTE_ECHELLE, CARTE_ECHELLE);
    const r = prng(20261109);

    /* --- terre --- */
    const sol = g.createLinearGradient(0, 0, W, H);
    sol.addColorStop(0, "#8f7d55");
    sol.addColorStop(0.45, "#9c8a60");
    sol.addColorStop(1, "#8a7952");
    g.fillStyle = sol;
    g.fillRect(0, 0, W, H);

    // taches de terre, zones sèches et humides
    for (let i = 0; i < 420; i++) {
      const x = r() * W, y = r() * H;
      const rx = 20 + r() * 110, ry = 14 + r() * 80;
      g.fillStyle = r() > 0.5
        ? "rgba(160,140,95," + (0.05 + r() * 0.09).toFixed(3) + ")"
        : "rgba(110,95,62," + (0.05 + r() * 0.09).toFixed(3) + ")";
      g.beginPath();
      g.ellipse(x, y, rx, ry, r() * 3.14, 0, 6.283);
      g.fill();
    }

    /* --- mer à l'ouest + plage --- */
    const mer = g.createLinearGradient(0, 0, 210, 0);
    mer.addColorStop(0, "#12505e");
    mer.addColorStop(0.55, "#1b6b74");
    mer.addColorStop(1, "#2a8b8a");
    g.fillStyle = mer;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(150, 0);
    for (let y = 0; y <= H; y += 30) {
      g.lineTo(150 + Math.sin(y * 0.02) * 14 + r() * 10, y);
    }
    g.lineTo(0, H);
    g.closePath();
    g.fill();

    // écume et vagues
    g.strokeStyle = "rgba(255,255,255,0.28)";
    for (let i = 0; i < 90; i++) {
      const x = r() * 150, y = r() * H;
      g.lineWidth = 0.8 + r() * 1.4;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 12, y - 4, x + 26, y);
      g.stroke();
    }
    // plage
    g.fillStyle = "#cbb98d";
    g.beginPath();
    g.moveTo(150, 0);
    for (let y = 0; y <= H; y += 30) g.lineTo(150 + Math.sin(y * 0.02) * 14, y);
    g.lineTo(196, H);
    g.lineTo(196, 0);
    g.closePath();
    g.fill();

    /* --- quartiers de bâtiments --- */
    const quartiers = [
      { x: 250, y: 60, w: 330, h: 210, dens: 26 },
      { x: 600, y: 470, w: 250, h: 220, dens: 22 },
      { x: 880, y: 60, w: 320, h: 210, dens: 24 },
      { x: 250, y: 470, w: 190, h: 200, dens: 16 },
      { x: 600, y: 60, w: 220, h: 200, dens: 18 },
      { x: 900, y: 470, w: 300, h: 210, dens: 20 },
      { x: 1080, y: 250, w: 150, h: 110, dens: 10 },
    ];

    const ombreBati = (x, y, w, h, rayon) => {
      g.fillStyle = "rgba(24,18,10,0.32)";
      g.beginPath();
      if (g.roundRect) g.roundRect(x + 9, y + 11, w, h, rayon);
      else g.rect(x + 9, y + 11, w, h);
      g.fill();
    };

    const toits = ["#7d5b40", "#8a6a4a", "#6f6050", "#946d47", "#7a6a5a", "#5f6b5c", "#8b7a63"];

    for (const q of quartiers) {
      for (let i = 0; i < q.dens; i++) {
        const bw = 22 + r() * 30;
        const bh = 22 + r() * 30;
        const x = q.x + r() * (q.w - bw);
        const y = q.y + r() * (q.h - bh);
        const p = { x: x + bw / 2, y: y + bh / 2 };
        if (distanceAuChemin(p) < 52) continue;

        ombreBati(x, y, bw, bh, 2.5);

        // toit
        const teinte = toits[Math.floor(r() * toits.length)];
        g.fillStyle = teinte;
        g.beginPath();
        if (g.roundRect) g.roundRect(x, y, bw, bh, 2.5);
        else g.rect(x, y, bw, bh);
        g.fill();

        // texture du toit : tôle, tuiles
        g.strokeStyle = "rgba(0,0,0,0.16)";
        g.lineWidth = 0.7;
        const lignes = Math.max(2, Math.round(bh / 7));
        for (let k = 1; k < lignes; k++) {
          g.beginPath();
          g.moveTo(x + 1, y + (bh / lignes) * k);
          g.lineTo(x + bw - 1, y + (bh / lignes) * k);
          g.stroke();
        }
        // reflet de toit
        g.fillStyle = "rgba(255,255,255,0.07)";
        g.fillRect(x + 1.5, y + 1.5, bw - 3, Math.max(2, bh * 0.3));

        // cour / détail
        if (r() < 0.3) {
          g.fillStyle = "rgba(70,60,42,0.35)";
          g.fillRect(x + 2, y + bh + 3, bw * 0.5, 4);
        }
      }
    }

    /* --- végétation --- */
    const arbre = (x, y, taille) => {
      g.fillStyle = "rgba(20,28,14,0.35)";
      g.beginPath();
      g.ellipse(x + taille * 0.35, y + taille * 0.4, taille, taille * 0.85, 0, 0, 6.283);
      g.fill();
      g.fillStyle = "#3f5c2f";
      g.beginPath();
      g.arc(x, y, taille, 0, 6.283);
      g.fill();
      g.fillStyle = "#4f7139";
      g.beginPath();
      g.arc(x - taille * 0.22, y - taille * 0.22, taille * 0.62, 0, 6.283);
      g.fill();
    };

    for (let i = 0; i < 240; i++) {
      const x = 205 + r() * (W - 215), y = 20 + r() * (H - 40);
      if (distanceAuChemin({ x, y }) < 44) continue;
      const t = 5 + r() * 8;
      arbre(x, y, t);
    }

    // bosquets denses
    for (const bosquet of [{ x: 60, y: 120 }, { x: 1230, y: 640 }, { x: 520, y: 250 }]) {
      for (let i = 0; i < 26; i++) {
        const x = bosquet.x + (r() - 0.5) * 130;
        const y = bosquet.y + (r() - 0.5) * 130;
        if (x < 205 || x > W - 10) continue;
        if (distanceAuChemin({ x, y }) < 46) continue;
        arbre(x, y, 6 + r() * 9);
      }
    }

    /* --- fond satellite : il remplace tout le decor dessine --- */
    if (IMG && IMG.complete && IMG.naturalWidth > 0) {
      g.drawImage(IMG, 0, 0, W, H);
    }

    /* --- routes --- */
    const traceRoute = (pts, largeur, couleur) => {
      g.lineCap = "round";
      g.lineJoin = "round";
      g.strokeStyle = "rgba(30,26,18,0.35)";
      g.lineWidth = largeur + 6;
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
    };

    // routes secondaires
    traceRoute([{ x: 340, y: 0 }, { x: 340, y: 560 }, { x: 900, y: 560 }], 16, "#4a463c");
    traceRoute([{ x: 560, y: 720 }, { x: 560, y: 250 }, { x: 1180, y: 250 }], 15, "#4a463c");
    traceRoute([{ x: 1000, y: 720 }, { x: 1000, y: 120 }], 14, "#4a463c");

    // route principale d'invasion
    traceRoute(CHEMIN, 30, "rgba(52,48,41,0.9)");

    // marquage central
    g.setLineDash([10, 22]);
    g.strokeStyle = "rgba(226,214,170,0.22)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(CHEMIN[0].x, CHEMIN[0].y);
    for (let i = 1; i < CHEMIN.length; i++) g.lineTo(CHEMIN[i].x, CHEMIN[i].y);
    g.stroke();
    g.setLineDash([]);

    // point de depart des ennemis : bien visible et clignotant
    {
      const dep = CHEMIN[0];
      const sui = CHEMIN[1];
      const puls2 = 0.5 + Math.sin(etat.temps * 3.4) * 0.5;
      g.fillStyle = "rgba(200,16,46," + (0.10 + puls2 * 0.16).toFixed(2) + ")";
      g.beginPath();
      g.arc(dep.x, dep.y, 62 + puls2 * 12, 0, 6.283);
      g.fill();
      g.strokeStyle = "rgba(255,70,95," + (0.55 + puls2 * 0.4).toFixed(2) + ")";
      g.lineWidth = 3;
      g.beginPath();
      g.arc(dep.x, dep.y, 40, 0, 6.283);
      g.stroke();
      // fleche vers la ville
      const ang = Math.atan2(sui.y - dep.y, sui.x - dep.x);
      g.save();
      g.translate(dep.x, dep.y);
      g.rotate(ang);
      g.fillStyle = "rgba(255,80,100," + (0.65 + puls2 * 0.35).toFixed(2) + ")";
      g.beginPath();
      g.moveTo(-6, -17); g.lineTo(26, 0); g.lineTo(-6, 17); g.closePath();
      g.fill();
      g.restore();
      g.fillStyle = "rgba(255,235,235,0.92)";
      g.font = "bold 15px system-ui, sans-serif";
      g.textAlign = "center";
      g.fillText("ENTREE", dep.x, dep.y - 52);
    }

    // poussière et traces sur la route
    for (let i = 0; i < 220; i++) {
      const d = r() * SEGMENTS.total;
      const p = pointSurChemin(d);
      g.fillStyle = "rgba(180,165,130," + (0.03 + r() * 0.07).toFixed(3) + ")";
      g.beginPath();
      g.arc(p.x + (r() - 0.5) * 30, p.y + (r() - 0.5) * 30, 2 + r() * 7, 0, 6.283);
      g.fill();
    }

    /* --- mairie (objectif) --- */
    g.fillStyle = "rgba(20,14,8,0.4)";
    g.beginPath();
    g.ellipse(MAIRIE.x + 12, MAIRIE.y + 14, 34, 28, 0, 0, 6.283);
    g.fill();
    g.fillStyle = "#b8a888";
    g.beginPath();
    g.arc(MAIRIE.x, MAIRIE.y, 26, 0, 6.283);
    g.fill();
    g.fillStyle = "#8d7f63";
    g.beginPath();
    g.arc(MAIRIE.x, MAIRIE.y, 18, 0, 6.283);
    g.fill();
    g.fillStyle = "#c9b98f";
    g.beginPath();
    g.arc(MAIRIE.x, MAIRIE.y, 9, 0, 6.283);
    g.fill();

    /* --- véhicules garés (uniquement en carte dessinee) --- */
    if (!(IMG && IMG.complete && IMG.naturalWidth > 0))
    for (let i = 0; i < 40; i++) {
      const x = 220 + r() * (W - 240), y = 30 + r() * (H - 60);
      if (distanceAuChemin({ x, y }) < 40) continue;
      const horiz = r() > 0.5;
      const l = 9 + r() * 5;
      g.fillStyle = "rgba(20,18,12,0.3)";
      g.fillRect(x + 2, y + 2, horiz ? l : 5, horiz ? 5 : l);
      g.fillStyle = ["#8a8f96", "#6f7780", "#9d8a6a", "#7a6a55"][Math.floor(r() * 4)];
      g.fillRect(x, y, horiz ? l : 5, horiz ? 5 : l);
    }

    /* --- cimetière de containers / dépôt --- */
    if (!(IMG && IMG.complete && IMG.naturalWidth > 0))
    for (let i = 0; i < 14; i++) {
      const x = 1100 + r() * 140, y = 500 + r() * 180;
      if (distanceAuChemin({ x, y }) < 42) continue;
      g.fillStyle = "rgba(15,14,10,0.3)";
      g.fillRect(x + 3, y + 4, 30, 14);
      g.fillStyle = ["#8f5b3e", "#4e6a72", "#7d7a4a", "#6a4f4a"][Math.floor(r() * 4)];
      g.fillRect(x, y, 30, 14);
      g.strokeStyle = "rgba(0,0,0,0.25)";
      g.lineWidth = 1;
      g.strokeRect(x + 0.5, y + 0.5, 29, 13);
    }

    /* --- grain photographique + ombre générale --- */
    const grain = document.createElement("canvas");
    grain.width = 160;
    grain.height = 160;
    const gg = grain.getContext("2d");
    const img = gg.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 120 + Math.random() * 40;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 16;
    }
    gg.putImageData(img, 0, 0);
    const motif = g.createPattern(grain, "repeat");
    g.fillStyle = motif;
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
  let L = 0, Hc = 0, echelle = 1, ox = 0, oy = 0;
  let lumiere = null;

  function redimensionner() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    L = canvas.clientWidth || window.innerWidth;
    Hc = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(L * dpr);
    canvas.height = Math.round(Hc * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const portraitForce = forcerPortrait && Hc > L;
    echelle = Math.min(L / W, Hc / H);
    ox = (L - W * echelle) / 2;
    oy = (Hc - H * echelle) / 2;

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
    const depart = pointSurChemin(0);
    etat.ennemis.push({
      cle, x: depart.x + rnd(-10, 10), y: depart.y + rnd(-10, 10),
      pv: m.pv * (1 + (etat.vague - 1) * 0.09),
      pvMax: m.pv * (1 + (etat.vague - 1) * 0.09),
      d: 0, air: !!m.air, angle: Math.PI, flash: 0, phase: rnd(0, 6.28),
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

      if (e.air) {
        // les hélicos coupent droit vers la mairie
        const a = Math.atan2(MAIRIE.y - e.y, MAIRIE.x - e.x);
        e.angle = a;
        e.x += Math.cos(a) * m.vit * pas;
        e.y += Math.sin(a) * m.vit * pas;
        if (dist(e, MAIRIE) < 30) arriver(e);
      } else {
        e.d += m.vit * pas;
        const p = pointSurChemin(e.d);
        e.x = p.x;
        e.y = p.y;
        const p2 = pointSurChemin(e.d + 6);
        e.angle = Math.atan2(p2.y - p.y, p2.x - p.x);
        if (e.d >= SEGMENTS.total) arriver(e);
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

    // effets
    for (const ef of etat.effets) ef.t += pas;

    // nettoyage
    etat.ennemis = etat.ennemis.filter((e) => e.pv > 0);
    etat.tirs = etat.tirs.filter((t) => !t.mort);
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

    // fond hors cadre : la carte floutee et assombrie, pour ne jamais voir de vide
    ctx.fillStyle = "#0a0d0b";
    ctx.fillRect(0, 0, L, Hc);
    if (IMG && IMG.complete && IMG.naturalWidth > 0) {
      const sc = Math.max(L / W, Hc / H) * 1.06;
      const bw = W * sc, bh = H * sc;
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.drawImage(IMG, (L - bw) / 2, (Hc - bh) / 2, bw, bh);
      ctx.restore();
      ctx.fillStyle = "rgba(8,11,9,0.38)";
      ctx.fillRect(0, 0, L, Hc);
    }

    // liseres sur les bords de la carte
    ctx.strokeStyle = "rgba(245,207,27,0.20)";
    ctx.lineWidth = 2;
    ctx.strokeRect(ox, oy, W * echelle, H * echelle);

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(echelle, echelle);

    if (CARTE) ctx.drawImage(CARTE, 0, 0, W, H);
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

    // niveau
    if (t.niveau > 1) {
      ctx.fillStyle = "#f5cf1b";
      ctx.font = "bold 9px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("★".repeat(t.niveau - 1), t.x, t.y - 18);
    }
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

  canvas.addEventListener("pointerdown", (ev) => {
    if (etat.ecran !== "jeu" || etat.enPause || etat.fini) return;
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
  });

  $("#p-ameliorer").addEventListener("click", () => {
    const t = etat.selection;
    if (!t || t.niveau >= 3) return;
    const cout = coutAmelioration(t);
    if (etat.credit < cout) return;
    etat.credit -= cout;
    t.niveau += 1;
    t.total += cout;
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
    if (etat.ecran === "jeu") {
      mettreAJour(dt);
      dessiner(dt);
    }
    requestAnimationFrame(boucle);
  }

  /* ---------------------------------- départ -------------------------------- */
  function init() {
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
