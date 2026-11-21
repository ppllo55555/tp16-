// ============================================================
// BUG JUMP - IPET 249 | Laboratorio de Programación - TP 16
// JavaScript Vanilla + HTML5 Canvas
// ============================================================

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const W = canvas.width;   // 400
const H = canvas.height;  // 640

// Paleta institucional
const BORDO = "#6d0f1f", BORDO_OSC = "#3e0610";
const AMARILLO = "#ffd400", ROJO = "#e53935", BLANCO = "#ffffff";

// Escudo (poner el archivo en assets/escudo.png). Si no carga, se dibuja uno de respaldo.
const escudo = new Image();
let escudoOK = false;
escudo.onload = () => (escudoOK = true);
escudo.src = "assets/escudo.png";

// ---------- Constantes de física ----------
const GRAVEDAD = 0.45;      // aceleración hacia abajo por frame
const SALTO = -12;          // impulso (vy) al rebotar en una plataforma
const VEL_LATERAL = 5;      // velocidad horizontal máxima

// ---------- Estado del juego ----------
// Tres pantallas lógicas: "menu", "playing", "gameover"
let estado = "menu";
let player, plataformas, monedas, enemigos;
let camY, alturaMax, puntaje, monedasJuntas, ultimaPlataformaY, bonus;
// Screamer al perder
const SCREAMER_MS = 1100;
let screamerInicio = -99999;
const screamerActivo = () => performance.now() - screamerInicio < SCREAMER_MS;

let record = Number(localStorage.getItem("bugjump_record")) || 0;

// ---------- Controles ----------
const teclas = { izq: false, der: false };
let toqueDir = 0; // -1 izquierda, 1 derecha, 0 nada

window.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") teclas.izq = true;
  if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") teclas.der = true;
  if ((e.key === " " || e.key === "Enter") && estado !== "playing") {
    if (screamerActivo()) return;
    e.preventDefault();
    iniciarPartida();
  }
});
window.addEventListener("keyup", (e) => {
  if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") teclas.izq = false;
  if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") teclas.der = false;
});

canvas.addEventListener("pointerdown", (e) => {
  if (estado !== "playing") { if (!screamerActivo()) iniciarPartida(); return; }
  actualizarToque(e);
});
canvas.addEventListener("pointermove", (e) => { if (e.buttons) actualizarToque(e); });
window.addEventListener("pointerup", () => (toqueDir = 0));

function actualizarToque(e) {
  const r = canvas.getBoundingClientRect();
  toqueDir = e.clientX - r.left < r.width / 2 ? -1 : 1;
}

// ---------- Sonido simple (WebAudio, sin archivos) ----------
let audioCtx = null;
function beep(freq, dur, tipo = "square", vol = 0.05) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = tipo; o.frequency.value = freq; g.gain.value = vol;
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
  } catch (_) { /* si el navegador bloquea el audio, el juego sigue */ }
}

// ---------- Colisión AABB ----------
// Dos rectángulos se superponen si se solapan en el eje X Y en el eje Y.
function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

// ---------- Inicio / reinicio ----------
function iniciarPartida() {
  player = { x: W / 2 - 20, y: H - 120, w: 40, h: 40, vx: 0, vy: SALTO, mira: 1 };
  plataformas = [];
  monedas = [];
  enemigos = [];
  camY = 0;
  alturaMax = player.y;
  puntaje = 0;
  monedasJuntas = 0;
  bonus = 0;
  // plataforma base grande para empezar seguro
  plataformas.push({ x: W / 2 - 50, y: H - 70, w: 100, h: 14, tipo: "normal", dx: 0 });
  ultimaPlataformaY = H - 70;
  generarMundo();
  estado = "playing";
  beep(660, 0.1);
}

// ---------- Generación procedural ----------
// Crea plataformas, monedas y enemigos hacia arriba, fuera de la pantalla.
function generarMundo() {
  while (ultimaPlataformaY > camY - 120) {
    const dificultad = Math.min(puntaje / 1500, 1);       // 0 → 1
    const hueco = 55 + Math.random() * (45 + dificultad * 40); // máx ~140 < altura de salto (~160)
    ultimaPlataformaY -= hueco;

    const w = 70 - dificultad * 20;
    const x = Math.random() * (W - w);
    let tipo = "normal", dx = 0;
    const r = Math.random();
    if (r < 0.2 + dificultad * 0.15) { tipo = "mov"; dx = (Math.random() < 0.5 ? -1 : 1) * (1 + dificultad * 1.5); }
    else if (r < 0.3 + dificultad * 0.25) tipo = "fragil";

    plataformas.push({ x, y: ultimaPlataformaY, w, h: 14, tipo, dx });

    // Moneda sobre la plataforma (45% de probabilidad)
    if (Math.random() < 0.45) {
      monedas.push({ x: x + w / 2 - 10, y: ultimaPlataformaY - 36, w: 20, h: 20 });
    }
    // Moneda flotando sola a veces (invita a arriesgarse)
    if (Math.random() < 0.12) {
      monedas.push({ x: 20 + Math.random() * (W - 60), y: ultimaPlataformaY - hueco / 2, w: 20, h: 20 });
    }
    // Enemigo "pantalla azul" a partir de cierta altura
    if (puntaje > 250 && Math.random() < 0.06 + dificultad * 0.08) {
      enemigos.push({ x: Math.random() * (W - 46), y: ultimaPlataformaY - hueco / 2 - 15,
                      w: 46, h: 32, dx: (Math.random() < 0.5 ? -1 : 1) * 1.2 });
    }
  }
}

// ---------- Actualización (lógica) ----------
function actualizar(dt) {
  if (estado !== "playing") return;

  // Movimiento horizontal
  let dir = (teclas.der ? 1 : 0) - (teclas.izq ? 1 : 0);
  if (dir === 0) dir = toqueDir;
  const objetivo = dir * VEL_LATERAL;
  player.vx += (objetivo - player.vx) * 0.25 * dt; // suavizado (inercia)
  if (dir !== 0) player.mira = dir;

  // Física vertical
  const yPrevPies = player.y + player.h;
  player.vy += GRAVEDAD * dt;
  player.x += player.vx * dt;
  player.y += player.vy * dt;

  // Pantalla "envolvente": sale por un lado y entra por el otro
  if (player.x + player.w < 0) player.x = W;
  if (player.x > W) player.x = -player.w;

  // Plataformas móviles
  for (const p of plataformas) {
    if (p.tipo === "mov") {
      p.x += p.dx * dt;
      if (p.x < 0 || p.x + p.w > W) p.dx *= -1;
    }
  }

  // Rebote: solo si el jugador CAE y sus pies cruzan la parte superior de la plataforma
  if (player.vy > 0) {
    for (let i = plataformas.length - 1; i >= 0; i--) {
      const p = plataformas[i];
      const piesAhora = player.y + player.h;
      if (aabb(player, p) && yPrevPies <= p.y + 4 && piesAhora >= p.y) {
        player.vy = SALTO;
        player.y = p.y - player.h;
        beep(520, 0.07);
        if (p.tipo === "fragil") plataformas.splice(i, 1); // se rompe después del rebote
        break;
      }
    }
  }

  // Monedas
  for (let i = monedas.length - 1; i >= 0; i--) {
    if (aabb(player, monedas[i])) {
      monedas.splice(i, 1);
      monedasJuntas++;
      beep(988, 0.08, "triangle", 0.07);
    }
  }

  // Enemigos
  for (let i = enemigos.length - 1; i >= 0; i--) {
    const en = enemigos[i];
    en.x += en.dx * dt;
    if (en.x < 0 || en.x + en.w > W) en.dx *= -1;
    if (aabb(player, en)) {
      if (player.vy > 0 && yPrevPies <= en.y + 10) {  // lo pisaste desde arriba
        enemigos.splice(i, 1);
        player.vy = SALTO;
        bonus += 50;
        beep(300, 0.12, "sawtooth");
      } else {
        terminarPartida();
        return;
      }
    }
  }

  // Cámara: sigue al jugador solo hacia arriba
  const limite = camY + H * 0.4;
  if (player.y < limite) camY = player.y - H * 0.4;

  // Puntaje = altura alcanzada + monedas
  if (player.y < alturaMax) alturaMax = player.y;
  puntaje = Math.floor((H - 120 - alturaMax) / 10) + monedasJuntas * 10 + bonus;
  puntaje = Math.max(puntaje, 0);

  generarMundo();

  // Limpiar objetos que quedaron debajo de la pantalla
  const corte = camY + H + 60;
  plataformas = plataformas.filter((p) => p.y < corte);
  monedas = monedas.filter((m) => m.y < corte);
  enemigos = enemigos.filter((e) => e.y < corte);

  // Si cae por debajo de la pantalla, pierde
  if (player.y > camY + H) terminarPartida();
}

function terminarPartida() {
  estado = "gameover";
  if (puntaje > record) {
    record = puntaje;
    localStorage.setItem("bugjump_record", String(record));
  }
  screamerInicio = performance.now();
  gritoScreamer();
}


// ---------- Screamer ----------
// Sonido: ruido + chillido que sube de tono (volumen moderado)
function gritoScreamer() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime, dur = 0.9;
    const master = audioCtx.createGain();
    master.gain.setValueAtTime(0.18, t);
    master.gain.linearRampToValueAtTime(0, t + dur);
    master.connect(audioCtx.destination);
    for (const f0 of [380, 570]) {
      const o = audioCtx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 3, t + dur * 0.8);
      o.connect(master); o.start(t); o.stop(t + dur);
    }
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
    const datos = buf.getChannelData(0);
    for (let i = 0; i < datos.length; i++) datos[i] = Math.random() * 2 - 1;
    const ruido = audioCtx.createBufferSource();
    ruido.buffer = buf; ruido.connect(master); ruido.start(t);
  } catch (_) { /* sin audio, el juego sigue igual */ }
}

// Imagen: cara del bug agrandándose y temblando, con un solo destello rojo inicial
function dibujarScreamer() {
  const ms = performance.now() - screamerInicio;
  const p = ms / SCREAMER_MS;
  ctx.fillStyle = ms < 90 ? ROJO : "#000";
  ctx.fillRect(0, 0, W, H);
  const tiembla = (1 - p * 0.5) * 18;
  ctx.save();
  ctx.translate(W / 2 + (Math.random() - 0.5) * tiembla, H / 2 + (Math.random() - 0.5) * tiembla);
  const esc = 1.4 + p * 1.6;
  ctx.scale(esc, esc);
  // cabeza
  ctx.fillStyle = "#8b0000";
  ctx.beginPath(); ctx.roundRect(-90, -100, 180, 200, 40); ctx.fill();
  // ojos
  for (const sx of [-1, 1]) {
    ctx.fillStyle = BLANCO;
    ctx.beginPath(); ctx.ellipse(sx * 42, -35, 30, 38, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = ROJO; ctx.lineWidth = 2;
    for (let k = 0; k < 5; k++) {
      ctx.beginPath(); ctx.moveTo(sx * 42 + sx * 28, -35 + k * 8 - 16); ctx.lineTo(sx * 42 + sx * 8, -35 + k * 3 - 6); ctx.stroke();
    }
    ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.arc(sx * 42, -35, 6, 0, Math.PI * 2); ctx.fill();
  }
  // boca abierta con dientes
  ctx.fillStyle = "#000";
  ctx.beginPath(); ctx.ellipse(0, 50, 55, 38 + Math.sin(ms / 40) * 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = BLANCO;
  for (let k = -4; k <= 4; k++) {
    ctx.beginPath(); ctx.moveTo(k * 11 - 5, 22); ctx.lineTo(k * 11 + 5, 22); ctx.lineTo(k * 11, 40); ctx.fill();
    ctx.beginPath(); ctx.moveTo(k * 11 - 5, 80); ctx.lineTo(k * 11 + 5, 80); ctx.lineTo(k * 11, 62); ctx.fill();
  }
  ctx.restore();
}

// ---------- Dibujo ----------
function dibujarEscudo(x, y, tam) {
  if (escudoOK) {
    const ratio = escudo.width / escudo.height;
    ctx.drawImage(escudo, x, y, tam * ratio, tam);
    return tam * ratio;
  }
  // Escudo de respaldo (si falta assets/escudo.png)
  ctx.fillStyle = AMARILLO;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + tam, y);
  ctx.lineTo(x + tam, y + tam * 0.6);
  ctx.quadraticCurveTo(x + tam, y + tam, x + tam / 2, y + tam * 1.1);
  ctx.quadraticCurveTo(x, y + tam, x, y + tam * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = BORDO;
  ctx.font = `bold ${tam * 0.35}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("249", x + tam / 2, y + tam * 0.62);
  return tam;
}

function dibujarFondo() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, BORDO_OSC);
  g.addColorStop(1, BORDO);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Pistas de circuito con parallax (se mueven más lento que el mundo)
  ctx.strokeStyle = "rgba(255,212,0,0.10)";
  ctx.lineWidth = 2;
  const sep = 80;
  const off = (camY * 0.4) % sep;
  for (let y = -sep; y < H + sep; y += sep) {
    const yy = y - off + sep;
    ctx.beginPath();
    ctx.moveTo(0, yy);
    ctx.lineTo(70, yy);
    ctx.lineTo(100, yy + 30);
    ctx.lineTo(W, yy + 30);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,212,0,0.14)";
    ctx.beginPath(); ctx.arc(100, yy + 30, 4, 0, 7); ctx.fill();
  }
}

function dibujarPlataforma(p) {
  const y = p.y - camY;
  ctx.fillStyle = p.tipo === "mov" ? ROJO : p.tipo === "fragil" ? "rgba(255,255,255,0.75)" : AMARILLO;
  ctx.fillRect(p.x, y, p.w, p.h);
  // "patitas" de chip
  ctx.fillStyle = BORDO_OSC;
  for (let px = p.x + 6; px < p.x + p.w - 4; px += 10) ctx.fillRect(px, y + p.h - 4, 4, 4);
  if (p.tipo === "fragil") {
    ctx.strokeStyle = BORDO;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x + p.w * 0.5, y);
    ctx.lineTo(p.x + p.w * 0.45, y + p.h * 0.5);
    ctx.lineTo(p.x + p.w * 0.55, y + p.h);
    ctx.stroke();
  }
}

function dibujarMoneda(m) {
  const y = m.y - camY + 10;
  const giro = Math.abs(Math.sin(performance.now() / 250 + m.x)); // efecto de giro
  ctx.fillStyle = AMARILLO;
  ctx.beginPath();
  ctx.ellipse(m.x + 10, y, 10 * (0.35 + giro * 0.65), 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = BORDO_OSC;
  ctx.lineWidth = 2;
  ctx.stroke();
  if (giro > 0.5) {
    ctx.fillStyle = BORDO_OSC;
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "center";
    ctx.fillText("1", m.x + 10, y + 4);
  }
}

function dibujarEnemigo(e) {
  const y = e.y - camY;
  ctx.fillStyle = "#1565c0"; // pantalla azul de error
  ctx.fillRect(e.x, y, e.w, e.h);
  ctx.strokeStyle = BLANCO;
  ctx.lineWidth = 2;
  ctx.strokeRect(e.x + 2, y + 2, e.w - 4, e.h - 4);
  ctx.fillStyle = BLANCO;
  ctx.font = "bold 16px monospace";
  ctx.textAlign = "center";
  ctx.fillText(":(", e.x + e.w / 2, y + e.h / 2 + 6);
}

// Personaje: un "bug" con antenas (se dibuja con formas, sin imagen)
function dibujarJugador() {
  const x = player.x, y = player.y - camY, w = player.w, h = player.h;
  const estira = Math.min(Math.abs(player.vy) * 0.6, 6); // squash & stretch
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  // patas
  ctx.strokeStyle = AMARILLO;
  for (const s of [-1, 1]) {
    for (const py of [-4, 6, 14]) {
      ctx.beginPath(); ctx.moveTo(s * w / 2 - s * 4, py); ctx.lineTo(s * (w / 2 + 6), py + 5); ctx.stroke();
    }
  }
  // cuerpo (chip)
  ctx.fillStyle = AMARILLO;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = BORDO_OSC;
  ctx.lineWidth = 2;
  ctx.stroke();
  // ojos
  ctx.fillStyle = BLANCO;
  ctx.beginPath(); ctx.arc(-8, -4, 7, 0, 7); ctx.arc(8, -4, 7, 0, 7); ctx.fill();
  ctx.fillStyle = BORDO_OSC;
  ctx.beginPath(); ctx.arc(-8 + player.mira * 2, -4, 3, 0, 7); ctx.arc(8 + player.mira * 2, -4, 3, 0, 7); ctx.fill();
  // boca
  ctx.strokeStyle = BORDO_OSC;
  ctx.beginPath(); ctx.arc(0, 6, 6, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
  // sombrero mexicano (ala ancha + copa + cinta)
  const hy = -h / 2 + 3;
  ctx.fillStyle = "#d9a441";
  ctx.beginPath(); ctx.ellipse(0, hy, 32, 7, 0, 0, Math.PI * 2); ctx.fill();   // ala
  ctx.beginPath();                                                              // copa
  ctx.moveTo(-13, hy - 1); ctx.lineTo(-9, hy - 20 - estira / 2);
  ctx.quadraticCurveTo(0, hy - 26 - estira / 2, 9, hy - 20 - estira / 2);
  ctx.lineTo(13, hy - 1); ctx.closePath(); ctx.fill();
  ctx.fillStyle = ROJO;                                                         // cinta
  ctx.fillRect(-12, hy - 9, 24, 5);
  ctx.strokeStyle = BORDO_OSC; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(0, hy, 32, 7, 0, 0, Math.PI * 2); ctx.stroke();
  // bandera (blanca con franjas azules y estrella de David)
  const fx = 24, fy = -h / 2 - 20;
  ctx.strokeStyle = "#cccccc"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(fx, 14); ctx.lineTo(fx, fy); ctx.stroke();
  ctx.fillStyle = BLANCO; ctx.fillRect(fx, fy, 26, 18);
  ctx.fillStyle = "#0038b8";
  ctx.fillRect(fx, fy + 2, 26, 3); ctx.fillRect(fx, fy + 13, 26, 3);
  const sx = fx + 13, sy = fy + 9, sr = 4.5;
  ctx.strokeStyle = "#0038b8"; ctx.lineWidth = 1;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const ang = (k * 2 * Math.PI) / 3 - Math.PI / 2 * dir;
      const px = sx + sr * Math.cos(ang), py = sy + sr * Math.sin(ang);
      k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.stroke();
  }
  ctx.restore();
}

function dibujarHUD() {
  ctx.fillStyle = "rgba(62,6,16,0.8)";
  ctx.fillRect(0, 0, W, 48);
  dibujarEscudo(8, 5, 38);
  ctx.textAlign = "left";
  ctx.fillStyle = BLANCO;
  ctx.font = "bold 20px 'Trebuchet MS', sans-serif";
  ctx.fillText(`${puntaje} m`, 62, 24);
  ctx.fillStyle = AMARILLO;
  ctx.font = "13px 'Trebuchet MS', sans-serif";
  ctx.fillText(`Récord: ${record}`, 62, 41);
  ctx.textAlign = "right";
  ctx.font = "bold 20px 'Trebuchet MS', sans-serif";
  ctx.fillText(`● ${monedasJuntas}`, W - 12, 30);
}

function panel(titulo, lineas, boton) {
  ctx.fillStyle = "rgba(62,6,16,0.88)";
  ctx.fillRect(0, 0, W, H);
  const ancho = dibujarEscudo(W / 2 - 55, 70, 110);
  ctx.textAlign = "center";
  ctx.fillStyle = AMARILLO;
  ctx.font = "bold 40px 'Trebuchet MS', sans-serif";
  ctx.fillText(titulo, W / 2, 245);
  ctx.fillStyle = BLANCO;
  ctx.font = "18px 'Trebuchet MS', sans-serif";
  lineas.forEach((t, i) => ctx.fillText(t, W / 2, 295 + i * 30));
  // botón
  ctx.fillStyle = ROJO;
  ctx.beginPath(); ctx.roundRect(W / 2 - 110, 440, 220, 54, 12); ctx.fill();
  ctx.strokeStyle = AMARILLO; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = BLANCO;
  ctx.font = "bold 20px 'Trebuchet MS', sans-serif";
  ctx.fillText(boton, W / 2, 474);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = "13px 'Trebuchet MS', sans-serif";
  ctx.fillText("IPET 249 · Nicolás Copérnico · Informática", W / 2, H - 24);
}

function dibujar() {
  if (estado === "menu") {
    camY = performance.now() * -0.02; // fondo animado en el menú
    dibujarFondo();
    panel("BUG JUMP", ["Saltá de chip en chip,", "juntá monedas y evitá las", "pantallas azules."], "JUGAR (espacio / toque)");
    ctx.fillStyle = AMARILLO;
    ctx.font = "16px 'Trebuchet MS', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`Récord: ${record}`, W / 2, 530);
    return;
  }
  dibujarFondo();
  plataformas.forEach(dibujarPlataforma);
  monedas.forEach(dibujarMoneda);
  enemigos.forEach(dibujarEnemigo);
  dibujarJugador();
  dibujarHUD();
  if (estado === "gameover") {
    if (screamerActivo()) { dibujarScreamer(); return; }
    panel("GAME OVER", [`Puntaje: ${puntaje}`, `Récord máximo: ${record}`, `Monedas: ${monedasJuntas}`], "REINTENTAR");
  }
}

// ---------- Game loop ----------
let ultimo = performance.now();
function bucle(ahora) {
  // dt = 1 equivale a un frame a 60 FPS; así la velocidad es igual en pantallas de 60/120/144 Hz
  const dt = Math.min((ahora - ultimo) / 16.667, 2.5);
  ultimo = ahora;
  actualizar(dt);
  dibujar();
  requestAnimationFrame(bucle);
}
requestAnimationFrame(bucle);
