const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const $ = (id) => document.getElementById(id);
const overlay = $("overlay");
const overlayTitle = $("overlayTitle");
const overlayText = $("overlayText");
const startBtn = $("startBtn");
const scoreEl = $("score");
const bestEl = $("best");
const speedEl = $("speed");
const speedFill = $("speedFill");
const fuelNum = $("fuelNum");
const fuelFill = $("fuelFill");
const statusEl = $("status");
const connectionEl = $("connection");
const soundBtn = $("soundBtn");

const W = canvas.width,
  H = canvas.height;
const ROAD = { x: 92, w: 296, lanes: 3 };
const laneW = ROAD.w / ROAD.lanes;
const COLORS = {
  grass: "#71d526",
  grassDark: "#258c28",
  grassLight: "#b2ff42",
  road: "#626a69",
  roadShade: "#515957",
  edge: "#c7ff3d",
  line: "#d8ded7",
  cyan: "#20cce9",
  red: "#ff3b36",
};

// --- Difficulty tuning: change these numbers to rebalance the game ---
const TIER_SCORE = 250; // score needed to reach the next level
const START_SPEED = 80; // km/h at level 0
const SPEED_STEP = 8; // km/h added per level
const MAX_BASE_SPEED = 225; // cap on normal (non-boost) speed
const START_GAP = 170; // px between cars at level 0
const GAP_STEP = 5; // px removed from the gap per level
const MIN_GAP = 120; // the gap never gets smaller than this

// --- Fuel pickups ---
const PICKUP_FIRST_LEVEL = 13; // first level (as shown in the status box) that can offer fuel
const PICKUP_EVERY = 3; // then every 3 levels: 13, 16, 19, ...
const PICKUP_FUEL_LIMIT = 50; // TEST VALUE (real value: 50): offered when fuel is at or below this
const PICKUP_REFILL_TO = 100; // collecting refills the tank to this level

let state = "ready",
  lastTime = 0,
  score = 0,
  level = 0,
  best = loadBest();
let fuel = 100,
  speed = 0,
  roadOffset = 0,
  grassOffset = 0,
  spawnDistance = 0,
  nextGap = START_GAP,
  cars = [],
  pickups = [],
  pickupQueued = false,
  pickupRetryIn = 0,
  pickupRetryUsed = false,
  particles = [];
let player = {
  lane: 1,
  x: ROAD.x + laneW * 1.5,
  y: H - 150,
  targetX: ROAD.x + laneW * 1.5,
};
let soundOn = true,
  audioCtx = null;

let restartLockUntil = 0;

bestEl.textContent = formatScore(best);
function loadBest() {
  try {
    return Number(localStorage.getItem("pixelRacerBest")) || 0;
  } catch {
    return 0;
  }
}
function saveBest(v) {
  try {
    localStorage.setItem("pixelRacerBest", String(v));
  } catch {}
}

function formatScore(n) {
  return Math.max(0, Math.floor(n)).toString().padStart(6, "0").slice(-6);
}
function rand(min, max) {
  return Math.random() * (max - min) + min;
}
function laneX(lane) {
  return ROAD.x + laneW * (lane + 0.5);
}

function baseSpeedFor(lvl) {
  return Math.min(MAX_BASE_SPEED, START_SPEED + lvl * SPEED_STEP);
}

function isPickupLevel(shownLevel) {
  return (
    shownLevel >= PICKUP_FIRST_LEVEL &&
    (shownLevel - PICKUP_FIRST_LEVEL) % PICKUP_EVERY === 0
  );
}

function gapFor(lvl) {
  return Math.max(MIN_GAP, START_GAP - lvl * GAP_STEP);
}
function showRacingStatus() {
  statusEl.textContent = `LEVEL ${level + 1}`;
}

function beep(freq = 440, duration = 0.07, type = "square", volume = 0.035) {
  if (!soundOn) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const osc = audioCtx.createOscillator(),
      gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = volume;
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      audioCtx.currentTime + duration,
    );
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch {}
}

function drawCar(cx, cy, color, scale = 1, playerCar = false) {
  ctx.save();
  ctx.translate(Math.round(cx), Math.round(cy));
  ctx.scale(scale, scale);
  // Pixel shadow and tires
  ctx.fillStyle = "#171b19";
  ctx.fillRect(-13, -22, 29, 47);
  ctx.fillStyle = "#080a0a";
  ctx.fillRect(-13, -15, 5, 12);
  ctx.fillRect(8, -15, 5, 12);
  ctx.fillRect(-13, 11, 5, 11);
  ctx.fillRect(8, 11, 5, 11);
  // Body silhouette
  ctx.fillStyle = "#050707";
  ctx.fillRect(-10, -24, 20, 5);
  ctx.fillRect(-14, -18, 28, 31);
  ctx.fillRect(-11, 13, 22, 8);
  ctx.fillRect(-8, 21, 16, 3);
  ctx.fillStyle = color;
  ctx.fillRect(-8, -21, 16, 7);
  ctx.fillRect(-11, -14, 22, 24);
  ctx.fillRect(-8, 10, 16, 9);
  ctx.fillStyle = playerCar ? "#ff8d59" : "#82f5ff";
  ctx.fillRect(-7, -11, 14, 5);
  ctx.fillStyle = "#14272b";
  ctx.fillRect(-7, -5, 14, 10);
  ctx.fillRect(-5, -9, 10, 3);
  ctx.fillStyle = playerCar ? "#ffb84d" : "#e8ffff";
  ctx.fillRect(-9, 12, 5, 3);
  ctx.fillRect(4, 12, 5, 3);
  ctx.fillStyle = playerCar ? "#ffdad1" : "#0d5361";
  ctx.fillRect(-5, 2, 10, 4);
  if (playerCar) {
    ctx.fillStyle = "#fff0b0";
    ctx.fillRect(-9, -19, 4, 3);
    ctx.fillRect(5, -19, 4, 3);
    ctx.fillStyle = "#b31326";
    ctx.fillRect(-5, 16, 10, 3);
  }
  ctx.restore();
}

function drawPickup(cx, cy) {
  ctx.save();
  ctx.translate(Math.round(cx), Math.round(cy));
  // blinking outline so it catches the eye
  ctx.fillStyle =
    Math.floor(performance.now() / 180) % 2 ? "#f2f5ec" : "#050707";
  ctx.fillRect(-12, -15, 24, 30);
  ctx.fillStyle = "#ffca3a"; // can body
  ctx.fillRect(-10, -13, 20, 26);
  ctx.fillStyle = "#050707"; // cap
  ctx.fillRect(-9, -19, 9, 6);
  ctx.fillStyle = "#ff3b36";
  ctx.fillRect(-7, -18, 5, 4);
  ctx.fillStyle = "#14272b"; // label
  ctx.fillRect(-6, -5, 12, 12);
  ctx.fillStyle = "#ffca3a"; // the letter F
  ctx.fillRect(-3, -3, 2, 8);
  ctx.fillRect(-3, -3, 6, 2);
  ctx.fillRect(-3, 0, 4, 2);
  ctx.restore();
}

function drawGrass() {
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(0, 0, W, H);
  // Repeating chunky foliage tiles
  const tileH = 34,
    offset = grassOffset % tileH;
  for (let y = -tileH; y < H + tileH; y += tileH) {
    for (let side = 0; side < 2; side++) {
      const x0 = side === 0 ? 8 : ROAD.x + ROAD.w + 8;
      for (let x = x0; x < (side === 0 ? ROAD.x - 7 : W - 6); x += 22) {
        const seed =
          Math.floor((y + offset) / tileH) * 13 +
          Math.floor(x / 22) * 7 +
          side * 3;
        ctx.fillStyle = seed % 4 === 0 ? COLORS.grassLight : COLORS.grassDark;
        const xx = x + (seed % 3) * 2,
          yy = y + offset + (seed % 5) * 2;
        ctx.fillRect(xx, yy, 7, 5);
        ctx.fillRect(xx + 3, yy - 4, 5, 5);
        ctx.fillStyle = "#319f27";
        ctx.fillRect(xx + 8, yy + 5, 4, 4);
        if (seed % 3 === 0) {
          ctx.fillStyle = "#e2ff84";
          ctx.fillRect(xx - 3, yy + 9, 3, 3);
        }
      }
    }
  }
}
function drawRoad() {
  ctx.fillStyle = "#242a28";
  ctx.fillRect(ROAD.x - 8, 0, ROAD.w + 16, H);
  ctx.fillStyle = COLORS.road;
  ctx.fillRect(ROAD.x, 0, ROAD.w, H);

  ctx.fillStyle = COLORS.edge;
  ctx.fillRect(ROAD.x - 3, 0, 4, H);
  ctx.fillRect(ROAD.x + ROAD.w - 1, 0, 4, H);
  for (let y = (roadOffset % 50) - 50; y < H; y += 50) {
    ctx.fillStyle = "#3d522d";
    ctx.fillRect(ROAD.x - 3, y + 18, 4, 20);
    ctx.fillRect(ROAD.x + ROAD.w - 1, y + 18, 4, 20);
  }
  for (let y = (roadOffset % 86) - 86; y < H; y += 86) {
    ctx.fillStyle = COLORS.line;
    ctx.fillRect(ROAD.x + ROAD.w / 2 - 3, y, 6, 34);
  }
}
function drawScenery() {
  // tiny roadside flag on left
  ctx.fillStyle = "#dce5dc";
  ctx.fillRect(20, 100, 3, 52);
  ctx.fillStyle = "#27d7f5";
  ctx.fillRect(23, 103, 23, 13);
  ctx.fillRect(23, 116, 15, 5);
  // side rails
  ctx.fillStyle = "#bfc9c1";
  ctx.fillRect(2, 0, 4, H);
  ctx.fillStyle = "#414a44";
  ctx.fillRect(7, 0, 3, H);
  ctx.fillStyle = "#202720";
  ctx.fillRect(W - 5, 0, 5, H);
}
function draw() {
  ctx.clearRect(0, 0, W, H);
  drawGrass();
  drawRoad();
  drawScenery();
  cars.forEach((car) => drawCar(car.x, car.y, car.color, 1, false));
  pickups.forEach((p) => drawPickup(p.x, p.y));

  drawCar(player.x, player.y, COLORS.red, 1.08, true);
  particles.forEach((p) => {
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  });
  if (state === "ready") {
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.fillRect(ROAD.x + 22, 88, ROAD.w - 44, 54);
    ctx.strokeStyle = "#f2f5ec";
    ctx.lineWidth = 3;
    ctx.strokeRect(ROAD.x + 55, 98, ROAD.w - 110, 34);
    ctx.fillStyle = "#f2f5ec";
    ctx.font = "22px monospace";
    ctx.textAlign = "center";
    ctx.fillText("START", W / 2, 122);
  }
  if (state === "paused") {
    ctx.fillStyle = "rgba(0,0,0,.6)";
    ctx.fillRect(ROAD.x, 0, ROAD.w, H);
    ctx.fillStyle = "#a8ff25";
    ctx.font = "bold 24px monospace";
    ctx.textAlign = "center";
    ctx.fillText("PAUSED", W / 2, H / 2);
  }
}
function updateHUD() {
  scoreEl.textContent = formatScore(score);
  bestEl.textContent = formatScore(best);
  speedEl.textContent = String(Math.round(speed)).padStart(3, "0");
  speedFill.style.width = `${Math.min(100, speed / 2.4)}%`;
  fuelNum.textContent = Math.ceil(fuel);
  fuelFill.style.width = `${Math.max(0, fuel)}%`;
  fuelFill.style.background = fuel < 25 ? "#ff3333" : "#ff4545";
}
function resetGame() {
  score = 0;
  level = 0;
  fuel = 100;
  speed = START_SPEED;
  roadOffset = 0;
  grassOffset = 0;
  spawnDistance = 0;
  nextGap = START_GAP * 0.5; // first car arrives a little sooner
  cars = [];
  pickups = [];
  pickupQueued = false;
  pickupRetryIn = 0;
  pickupRetryUsed = false;
  particles = [];
  player.lane = 1;
  player.x = laneX(1);
  player.targetX = player.x;
  updateHUD();
  showRacingStatus();
}

function startGame() {
  if (state === "over" && performance.now() < restartLockUntil) return;
  resetGame();
  state = "playing";
  overlay.classList.add("hidden");
  beep(660, 0.1);
  requestAnimationFrame(loop);
}
function endGame(reason = "CRASHED") {
  if (state !== "playing") return;
  restartLockUntil = performance.now() + 700;
  state = "over";
  statusEl.textContent = reason;
  if (score > best) {
    best = score;
    saveBest(best);
    bestEl.textContent = formatScore(best);
    beep(880, 0.12);
    setTimeout(() => beep(1175, 0.2), 120);
  } else beep(140, 0.3, "sawtooth");
  overlayTitle.textContent = score >= best ? "GAME OVER" : "RACE OVER";
  overlayText.textContent = `${reason === "EMPTY FUEL" ? "Out of fuel!" : "Traffic collision!"}\nBest: ${formatScore(best)}\nScore: ${formatScore(score)}\nLevel: ${level + 1}`;
  startBtn.textContent = "↻ RACE AGAIN";
  overlay.classList.remove("hidden");
  updateHUD();
}
function movePlayer(dir) {
  if (state === "ready" || state === "over") {
    startGame();
    return;
  }
  if (state !== "playing") return;
  const next = Math.max(0, Math.min(2, player.lane + dir));
  if (next !== player.lane) {
    player.lane = next;
    player.targetX = laneX(next);
    beep(260, 0.035, "square", 0.015);
  }
}

function spawnCar() {
  const open = [0, 1, 2].filter(
    (l) =>
      !cars.some((c) => c.lane === l && c.y < 145) &&
      !pickups.some((p) => p.lane === l && p.y < 145),
  );
  if (!open.length) return false;
  const lane = open[Math.floor(Math.random() * open.length)];
  const palette = ["#25cfea", "#ffca3a", "#c77dff", "#72f05c", "#f1f1e8"];
  cars.push({
    lane,
    x: laneX(lane),
    y: -38,
    color: palette[Math.floor(Math.random() * palette.length)],
    passed: false,
    offset: rand(-3, 3),
  });
  return true;
}

function spawnPickup() {
  const open = [0, 1, 2].filter(
    (l) => !cars.some((c) => c.lane === l && c.y < 145),
  );
  if (!open.length) return false;
  const lane = open[Math.floor(Math.random() * open.length)];
  pickups.push({ lane, x: laneX(lane), y: -38 });
  beep(988, 0.05);
  setTimeout(() => beep(1319, 0.07), 60);
  return true;
}

function loop(now) {
  if (state !== "playing") {
    draw();
    return;
  }
  const dt = Math.min((now - lastTime) / 1000 || 0, 0.04);
  lastTime = now;

  // Ease toward this level's normal speed, so a level-up feels like a push
  speed += (baseSpeedFor(level) - speed) * Math.min(1, dt * 3);
  roadOffset += speed * dt * 1.15;
  grassOffset = (grassOffset + speed * dt * 0.9) % 34;
  fuel = Math.max(0, fuel - dt * (0.48 + speed / 900));
  score += dt * (9 + speed * 0.035);
  player.x += (player.targetX - player.x) * Math.min(1, dt * 16);

  // Level up every TIER_SCORE points
  const newLevel = Math.floor(score / TIER_SCORE);
  if (newLevel > level) {
    level = newLevel;
    showRacingStatus();
    beep(784, 0.07);
    setTimeout(() => beep(1047, 0.1), 80);
    if (isPickupLevel(level + 1) && fuel <= PICKUP_FUEL_LIMIT) {
      pickupQueued = true;
      pickupRetryUsed = false;
    }
  }

  // Spawn by distance travelled, not by time
  const dy = speed * dt * 1.55;
  spawnDistance += dy;
  if (spawnDistance >= nextGap && spawnCar()) {
    spawnDistance = 0;
    nextGap = gapFor(level) * rand(1, 1.3);
  }

  cars.forEach((car) => {
    car.y += dy;
    if (!car.passed && car.y > player.y + 12) {
      car.passed = true;
      score += 25;
      beep(720, 0.025, "square", 0.012);
    }
    if (Math.abs(car.x - player.x) < 23 && Math.abs(car.y - player.y) < 34) {
      endGame("CRASHED");
    }
  });

  // Fuel pickups
  if (pickupQueued && spawnPickup()) pickupQueued = false;
  if (pickupRetryIn > 0) {
    pickupRetryIn -= dt;
    if (pickupRetryIn <= 0) {
      pickupRetryIn = 0;
      if (fuel <= PICKUP_FUEL_LIMIT) pickupQueued = true;
    }
  }
  pickups.forEach((p) => {
    p.y += dy;
    if (
      !p.done &&
      Math.abs(p.x - player.x) < 26 &&
      Math.abs(p.y - player.y) < 36
    ) {
      p.done = true;
      fuel = PICKUP_REFILL_TO;
      beep(660, 0.06);
      setTimeout(() => beep(880, 0.06), 60);
      setTimeout(() => beep(1319, 0.12), 120);
    }
    if (!p.done && p.y > H + 40) {
      p.done = true; // missed: offer one retry if still low on fuel
      if (!pickupRetryUsed && fuel <= PICKUP_FUEL_LIMIT) {
        pickupRetryUsed = true;
        pickupRetryIn = 3;
      }
    }
  });
  pickups = pickups.filter((p) => !p.done);

  cars = cars.filter((c) => c.y < H + 50);
  if (fuel <= 0) {
    fuel = 0;
    endGame("EMPTY FUEL");
  }
  updateHUD();
  draw();
  if (state === "playing") requestAnimationFrame(loop);
}

function pauseToggle() {
  if (state === "playing") {
    state = "paused";
    statusEl.textContent = "PAUSED";
    $("pauseBtn").textContent = "▶ RESUME";
    draw();
  } else if (state === "paused") {
    state = "playing";
    showRacingStatus();
    $("pauseBtn").textContent = "Ⅱ PAUSE";
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }
}
startBtn.addEventListener("click", () => {
  if (state === "paused") pauseToggle();
  else startGame();
});

$("leftBtn").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  movePlayer(-1);
});
$("rightBtn").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  movePlayer(1);
});

$("pauseBtn").addEventListener("click", pauseToggle);
soundBtn.addEventListener("click", () => {
  soundOn = !soundOn;
  soundBtn.textContent = `SOUND: ${soundOn ? "ON" : "OFF"}`;
  if (soundOn) beep(500, 0.06);
});
window.addEventListener("keydown", (e) => {
  if (["ArrowLeft", "ArrowRight", " ", "a", "A", "d", "D"].includes(e.key))
    e.preventDefault();
  if (e.repeat) return;
  if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") movePlayer(-1);
  if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") movePlayer(1);
  if (e.key === " ") {
    if (state === "ready" || state === "over") startGame();
    else pauseToggle(); // playing -> paused, paused -> resumed
  }
  if (e.key === "Enter") {
    if (state === "paused") pauseToggle();
    else if (state !== "playing") startGame();
  }
  if (e.key === "Escape") pauseToggle();
});

window.addEventListener("keyup", (e) => {
  if (e.key === " ") e.preventDefault();
});

window.addEventListener("online", () => {
  connectionEl.textContent = "● ONLINE";
});
window.addEventListener("offline", () => {
  connectionEl.textContent = "● OFFLINE";
});
connectionEl.textContent = navigator.onLine ? "● READY" : "● OFFLINE";
if ("serviceWorker" in navigator && location.protocol.startsWith("http"))
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("./sw.js").catch(() => {}),
  );
bestEl.textContent = formatScore(best);
updateHUD();
draw();
