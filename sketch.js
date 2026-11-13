// 테트리스 (p5.js) - 게임 로직과 화면 렌더링

const COLS = 10;
const ROWS = 20;
const WALL = 1;                 // 벽 두께(칸 단위)
const NORMAL_INTERVAL = 600;    // 기본 낙하 간격(ms)
const FAST_INTERVAL = 50;       // 낙하 버튼을 누르는 동안의 간격(ms)

// 각 블록: 칸 좌표(박스 기준), 회전 중심(pivot, 고정), 색상
// I는 4x4 박스(중심 1.5,1.5), O는 회전하지 않음, 나머지는 3x3 박스(중심 1,1)
const SHAPES = {
  I: { cells: [[0, 1], [1, 1], [2, 1], [3, 1]], pivot: [1.5, 1.5], color: '#00d8ff' },
  O: { cells: [[1, 0], [2, 0], [1, 1], [2, 1]], pivot: null,       color: '#ffd800' },
  L: { cells: [[0, 1], [1, 1], [2, 1], [2, 0]], pivot: [1, 1],     color: '#ff9100' }, // ㄱ자 계열
  J: { cells: [[0, 0], [0, 1], [1, 1], [2, 1]], pivot: [1, 1],     color: '#2f6bff' }, // 좌우대칭
  S: { cells: [[1, 0], [2, 0], [0, 1], [1, 1]], pivot: [1, 1],     color: '#2ecc40' },
  Z: { cells: [[0, 0], [1, 0], [1, 1], [2, 1]], pivot: [1, 1],     color: '#ff3b3b' },
  T: { cells: [[1, 0], [0, 1], [1, 1], [2, 1]], pivot: [1, 1],     color: '#b84dff' },
};
const TYPES = Object.keys(SHAPES);

let cell = 30;                  // 한 칸의 픽셀 크기
let grid;                       // grid[y][x] = 색상 문자열 또는 null
let cur;                        // 현재 블록 {type, cells, pivot, color, ox, oy}
let bag = [];
let lastStep = 0;
let gameOver = false;
let placedBlocks = 0;
let clearedLines = 0;
let softDropBtn = false;        // 가운데 버튼을 누르고 있는지

// ---------- p5 기본 함수 ----------
function setup() {
  computeCellSize();
  const c = createCanvas((COLS + WALL * 2) * cell, (ROWS + WALL * 2) * cell);
  c.parent('canvas-holder');
  noSmooth();
  bindButtons();
  startGame();
}

function windowResized() {
  computeCellSize();
  resizeCanvas((COLS + WALL * 2) * cell, (ROWS + WALL * 2) * cell);
}

function draw() {
  background('#1b1b27');
  drawWalls();
  drawGrid();
  if (cur) drawPiece();

  if (gameOver) return;
  const interval = isSoftDrop() ? FAST_INTERVAL : NORMAL_INTERVAL;
  if (millis() - lastStep >= interval) {
    stepDown();
    lastStep = millis();
  }
}

// ---------- 게임 흐름 ----------
function startGame() {
  grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  placedBlocks = 0;
  clearedLines = 0;
  gameOver = false;
  bag = [];
  document.getElementById('gameover').classList.add('hidden');
  spawn();
  lastStep = millis();
}

function nextType() {
  if (bag.length === 0) {
    bag = TYPES.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = floor(random(i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  return bag.pop();
}

function spawn() {
  const type = nextType();
  const s = SHAPES[type];
  cur = {
    type,
    cells: s.cells.map(c => c.slice()),
    pivot: s.pivot,
    color: s.color,
    ox: 3,   // 상단 중앙
    oy: 0,
  };
  if (!isValid(cur.cells, cur.ox, cur.oy)) endGame();
}

function stepDown() {
  if (isValid(cur.cells, cur.ox, cur.oy + 1)) {
    cur.oy++;
  } else {
    lockPiece();
  }
}

function lockPiece() {
  for (const [x, y] of cur.cells) grid[cur.oy + y][cur.ox + x] = cur.color;
  placedBlocks++;
  clearLines();

  // 최상단 행에 블록이 남아 있으면 게임 오버
  if (grid[0].some(v => v !== null)) {
    cur = null;
    endGame();
    return;
  }
  spawn();
}

function clearLines() {
  // 가득 찬 줄을 모두 제거하고, 남은 줄을 아래로 내린다(제거된 줄 수만큼)
  const remaining = grid.filter(row => row.some(v => v === null));
  const removed = ROWS - remaining.length;
  if (removed > 0) {
    const empty = Array.from({ length: removed }, () => Array(COLS).fill(null));
    grid = empty.concat(remaining);
    clearedLines += removed;
  }
}

function endGame() {
  gameOver = true;
  softDropBtn = false;
  document.getElementById('go-blocks').textContent = placedBlocks;
  document.getElementById('go-lines').textContent = clearedLines;
  document.getElementById('gameover').classList.remove('hidden');
}

// ---------- 이동 / 회전 ----------
function isValid(cells, ox, oy) {
  for (const [cx, cy] of cells) {
    const x = ox + cx, y = oy + cy;
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false;
    if (grid[y][x] !== null) return false;
  }
  return true;
}

function moveSide(dx) {
  if (gameOver || !cur) return;
  if (isValid(cur.cells, cur.ox + dx, cur.oy)) cur.ox += dx;
}

// dir: 1 = 시계방향, -1 = 반시계방향 (화면 좌표계: y가 아래로 증가)
function rotatePiece(dir) {
  if (gameOver || !cur || !cur.pivot) return;
  const [px, py] = cur.pivot;
  const rotated = cur.cells.map(([x, y]) => {
    const dx = x - px, dy = y - py;
    return dir > 0 ? [px - dy, py + dx] : [px + dy, py - dx];
  });
  // 겹치거나 좌우 경계를 벗어나면 좌우로 한 칸씩 이동하며 탐색
  // 상하 경계를 벗어나는 회전은 isValid에서 거부된다.
  for (const off of [0, -1, 1, -2, 2]) {
    if (isValid(rotated, cur.ox + off, cur.oy)) {
      cur.cells = rotated;
      cur.ox += off;
      return;
    }
  }
  // 위치를 찾지 못하면 기존 상태 유지
}

function isSoftDrop() {
  return softDropBtn || keyIsDown(DOWN_ARROW);
}

// ---------- 렌더링 ----------
function drawCell(px, py, color) {
  fill(color);
  stroke(0, 160);
  strokeWeight(max(1, cell * 0.06));
  rect(px, py, cell, cell);
  // 약한 하이라이트로 칸 구분을 돕는다
  noStroke();
  fill(255, 60);
  rect(px + cell * 0.12, py + cell * 0.12, cell * 0.76, cell * 0.14);
}

function drawWalls() {
  noStroke();
  fill('#6b6b80');
  const w = width, h = height, t = WALL * cell;
  rect(0, 0, w, t);              // 상
  rect(0, h - t, w, t);          // 하
  rect(0, 0, t, h);              // 좌
  rect(w - t, 0, t, h);          // 우
  stroke('#4a4a5c');
  strokeWeight(1);
  noFill();
  rect(t, t, COLS * cell, ROWS * cell);
}

function drawGrid() {
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (grid[y][x]) drawCell((x + WALL) * cell, (y + WALL) * cell, grid[y][x]);
    }
  }
}

function drawPiece() {
  for (const [x, y] of cur.cells) {
    drawCell((cur.ox + x + WALL) * cell, (cur.oy + y + WALL) * cell, cur.color);
  }
}

function computeCellSize() {
  const controlsH = 52 + 8 + 16;
  const byW = (windowWidth - 16) / (COLS + WALL * 2);
  const byH = (windowHeight - controlsH - 16) / (ROWS + WALL * 2);
  cell = floor(constrain(min(byW, byH), 14, 40));
  const w = (COLS + WALL * 2) * cell;
  document.getElementById('controls').style.width = w + 'px';
}

// ---------- 입력 ----------
function bindButtons() {
  const press = (id, fn) => {
    document.getElementById(id).addEventListener('pointerdown', e => {
      e.preventDefault();
      fn();
    });
  };
  press('btn-ccw', () => rotatePiece(-1));
  press('btn-cw', () => rotatePiece(1));
  press('btn-left', () => moveSide(-1));
  press('btn-right', () => moveSide(1));

  // 가운데 버튼: 누르고 있는 동안에만 낙하 속도 증가
  const down = document.getElementById('btn-down');
  const release = () => { softDropBtn = false; down.classList.remove('pressed'); };
  down.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (gameOver) return;
    softDropBtn = true;
    down.classList.add('pressed');
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => down.addEventListener(t, release));
  window.addEventListener('blur', release);

  document.getElementById('restart').addEventListener('click', startGame);
}

function keyPressed() {
  if (keyCode === LEFT_ARROW) moveSide(-1);
  else if (keyCode === RIGHT_ARROW) moveSide(1);
  else if (keyCode === UP_ARROW || key === 'x' || key === 'X') rotatePiece(1);
  else if (key === 'z' || key === 'Z') rotatePiece(-1);
  else return true;
  return false;
}
