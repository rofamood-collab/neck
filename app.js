const HOST_NAME = "부레옼잠";
const LOCAL_KEY = "bureokjam-neck-state";

const appRoot = document.querySelector(".phone-app");
const statsButton = document.querySelector("#statsButton");
const closeStats = document.querySelector("#closeStats");
const statsModal = document.querySelector("#statsModal");
const viewerRole = document.querySelector("#viewerRole");
const hostRole = document.querySelector("#hostRole");
const nameField = document.querySelector("#nameField");
const passwordField = document.querySelector("#passwordField");
const loginForm = document.querySelector("#loginForm");
const enterButton = document.querySelector("#enterButton");
const nicknameInput = document.querySelector("#nicknameInput");
const passwordInput = document.querySelector("#passwordInput");
const mainClick = document.querySelector("#mainClick");
const resetButton = document.querySelector("#resetButton");
const clickVerb = document.querySelector("#clickVerb");
const playerLabel = document.querySelector("#playerLabel");
const syncNote = document.querySelector("#syncNote");
const stage = document.querySelector("#stage");
const neckColumn = document.querySelector("#neckColumn");
const stretchStack = document.querySelector("#stretchStack");
const neckMessage = document.querySelector("#neckMessage");
const rulerValue = document.querySelector("#rulerValue");
const totalClicks = document.querySelector("#totalClicks");
const topPlayer = document.querySelector("#topPlayer");
const statsList = document.querySelector("#statsList");
let audioContext = null;
const clientId = createId();
let lastSoundEventId = null;

let selectedRole = "viewer";
let currentUser = null;
let mode = "local";
let remoteDb = null;
let remoteRef = null;
let hostPassword = "bureokjam";

const defaultState = {
  neckMm: 0,
  growMm: 300,
  shrinkMm: 720,
  totalClicks: 0,
  users: {},
  lastEvent: null,
  updatedAt: Date.now()
};

let state = readLocalState();
const channel = createChannel();

function cleanName(value) {
  return String(value || "").trim().slice(0, 16) || "익명의 시청자";
}

function readLocalState() {
  try {
    return { ...defaultState, ...JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}") };
  } catch {
    return { ...defaultState };
  }
}

function writeLocalState(nextState) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(nextState));
  } catch {
    // Private or file preview modes can block localStorage.
  }
  channel?.postMessage(nextState);
}

function createChannel() {
  try {
    const nextChannel = new BroadcastChannel("bureokjam-neck");
    nextChannel.onmessage = event => {
      if (mode === "local") {
        receiveState(event.data);
      }
    };
    return nextChannel;
  } catch {
    return null;
  }
}

async function connectFirebase() {
  const config = window.BUREOKJAM_FIREBASE_CONFIG;
  hostPassword = config?.hostPassword || hostPassword;

  if (!config || config.enabled !== true) {
    syncNote.textContent = "Firebase 설정 전: 이 기기에서만 테스트";
    return;
  }

  try {
    const [{ initializeApp }, { getDatabase, ref, onValue, runTransaction, set }] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js")
    ]);

    const firebaseApp = initializeApp(config.firebase);
    remoteDb = {
      ref,
      onValue,
      runTransaction,
      set
    };
    remoteRef = ref(getDatabase(firebaseApp), config.room || "bureokjam-neck/main");
    mode = "firebase";
    syncNote.textContent = "실시간 연결 중...";

    onValue(remoteRef, snapshot => {
      receiveState({ ...defaultState, ...(snapshot.val() || {}) });
      syncNote.textContent = "실시간 공유 중";
    });
  } catch (error) {
    syncNote.textContent = "Firebase 연결 실패: 설정 확인 필요";
    console.warn(error);
  }
}

function switchRole(role) {
  selectedRole = role;
  viewerRole.classList.toggle("active", role === "viewer");
  hostRole.classList.toggle("active", role === "host");
  nameField.classList.toggle("hidden", role === "host");
  passwordField.classList.toggle("hidden", role === "viewer");
}

function enterApp(event) {
  event?.preventDefault();
  unlockAudio();

  if (selectedRole === "host") {
    if (passwordInput.value.trim() !== hostPassword) {
      shake(loginForm);
      return;
    }
    currentUser = { role: "host", name: HOST_NAME };
  } else {
    currentUser = { role: "viewer", name: cleanName(nicknameInput.value) };
    try {
      localStorage.setItem("bureokjam-nickname", currentUser.name);
    } catch {
      // The name still works for this session.
    }
  }

  appRoot.dataset.screen = "play";
  mainClick.disabled = false;
  resetButton.classList.toggle("hidden", currentUser.role !== "host");
  clickVerb.textContent = currentUser.role === "host" ? "목 줄이기" : "목 늘리기";
  playerLabel.textContent =
    currentUser.role === "host"
      ? "부레옼잠 모드: 클릭하면 목이 줄어들어요"
      : `${currentUser.name}님: 클릭하면 목이 늘어나요`;
}

function mutateState(mutator) {
  if (mode === "firebase" && remoteDb && remoteRef) {
    remoteDb
      .runTransaction(remoteRef, current => {
        const base = normalizeGameState({ ...defaultState, ...(current || {}) });
        return mutator(base);
      })
      .catch(error => {
        syncNote.textContent = "클릭 저장 실패: 새로고침 후 다시 시도";
        console.warn(error);
      });
    return;
  }

  state = mutator(normalizeGameState({ ...state, users: { ...(state.users || {}) } }));
  writeLocalState(state);
  render(true);
}

function normalizeGameState(current) {
  if (Number(current.growMm || 0) !== defaultState.growMm) {
    current.growMm = defaultState.growMm;
  }
  if (Number(current.shrinkMm || 0) !== defaultState.shrinkMm) {
    current.shrinkMm = defaultState.shrinkMm;
  }
  return current;
}

function clickNeck() {
  if (!currentUser) return;
  playClickSound(currentUser.role);
  const clickEvent = {
    id: createId(),
    role: currentUser.role,
    clientId,
    at: Date.now()
  };

  mutateState(current => {
    const users = { ...(current.users || {}) };
    const key = currentUser.role === "host" ? HOST_NAME : currentUser.name;
    const user = users[key] || { clicks: 0, growMm: 0, shrinkMm: 0 };

    if (currentUser.role === "host") {
      current.neckMm = Math.max(0, Number(current.neckMm || 0) - Number(current.shrinkMm || 0));
      user.clicks += 1;
      user.shrinkMm += Number(current.shrinkMm || 0);
    } else {
      current.neckMm = Number(current.neckMm || 0) + Number(current.growMm || 0);
      user.clicks += 1;
      user.growMm += Number(current.growMm || 0);
    }

    users[key] = user;
    current.users = users;
    current.lastEvent = { ...clickEvent, name: key };
    current.totalClicks = Number(current.totalClicks || 0) + 1;
    current.updatedAt = Date.now();
    return current;
  });

  popStack();
}

function resetGame() {
  if (currentUser?.role !== "host") {
    return;
  }

  const ok = window.confirm("목 길이와 클릭 통계를 처음으로 돌릴까요?");
  if (!ok) {
    return;
  }

  playClickSound("host");
  mutateState(current => {
    return {
      ...defaultState,
      growMm: current.growMm || defaultState.growMm,
      shrinkMm: current.shrinkMm || defaultState.shrinkMm,
      lastEvent: {
        id: createId(),
        role: "host",
        type: "reset",
        name: HOST_NAME,
        clientId,
        at: Date.now()
      },
      updatedAt: Date.now()
    };
  });
}

function receiveState(nextState) {
  const next = normalizeGameState({ ...defaultState, ...(nextState || {}) });
  const event = next.lastEvent;

  if (event?.id && event.id !== lastSoundEventId) {
    const shouldPlayRemoteSound = Boolean(currentUser && lastSoundEventId && event.clientId !== clientId);
    lastSoundEventId = event.id;

    if (shouldPlayRemoteSound) {
      playClickSound(event.role === "host" ? "host" : "viewer");
    }
  }

  state = next;
  render();
}

function render() {
  state = normalizeGameState(state);

  const mm = Math.max(0, Number(state.neckMm || 0));
  const displayMm = Math.round(mm * 10) / 10;
  const height = visualNeckHeight(mm);
  const altitude = altitudeProgress(mm);
  const background = backgroundProgress(mm);
  const lengthLabel = formatLength(mm);
  neckColumn.style.height = `${height}px`;
  neckColumn.style.setProperty("--neck-flow", `${-Math.round((mm / 1000) * 18)}px`);
  stretchStack.style.setProperty("--zoom", visualZoom(height).toFixed(3));
  appRoot.style.setProperty("--altitude", altitude.toFixed(3));
  appRoot.style.setProperty("--ground-alpha", background.ground.toFixed(3));
  appRoot.style.setProperty("--cloud-alpha", background.cloud.toFixed(3));
  appRoot.style.setProperty("--sky-alpha", background.sky.toFixed(3));
  appRoot.style.setProperty("--high-sky-alpha", background.highSky.toFixed(3));
  appRoot.style.setProperty("--space-alpha", background.space.toFixed(3));
  appRoot.style.setProperty("--star-alpha", background.star.toFixed(3));
  appRoot.style.setProperty("--cloud-shift", `${background.cloudShift}px`);
  neckMessage.textContent = `부레옼잠의 목이 ${lengthLabel} 늘어났다!`;
  rulerValue.textContent = lengthLabel;

  const users = Object.entries(state.users || {}).sort((a, b) => {
    return Number(b[1].clicks || 0) - Number(a[1].clicks || 0);
  });

  totalClicks.textContent = Number(state.totalClicks || 0).toLocaleString("ko-KR");
  topPlayer.textContent = users[0]?.[0] || "-";
  statsList.innerHTML = "";

  for (const [name, data] of users) {
    const item = document.createElement("li");
    item.innerHTML = `
      <span class="stat-name">${escapeHtml(name)}</span>
      <span class="stat-clicks">${Number(data.clicks || 0).toLocaleString("ko-KR")}회</span>
      <span class="stat-mm">+${Number(data.growMm || 0).toLocaleString("ko-KR")} / -${Number(data.shrinkMm || 0).toLocaleString("ko-KR")}mm</span>
    `;
    statsList.appendChild(item);
  }

  if (users.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "아직 클릭한 사람이 없어요.";
    statsList.appendChild(empty);
  }
}

function altitudeProgress(mm) {
  const meters = mm / 1000;
  const bands = [
    [0, 12000, 0, 0.26],
    [12000, 50000, 0.26, 0.52],
    [50000, 85000, 0.52, 0.7],
    [85000, 100000, 0.7, 0.82],
    [100000, 1_000_000, 0.82, 1]
  ];

  for (const [start, end, from, to] of bands) {
    if (meters <= end) {
      const t = Math.max(0, Math.min(1, (meters - start) / (end - start)));
      return from + (to - from) * t;
    }
  }

  return 1;
}

function backgroundProgress(mm) {
  const meters = mm / 1000;
  const ground = 1 - clamp01(meters / 3000);
  const cloud = 1 - clamp01((meters - 1500) / 10500);
  const sky = 1 - clamp01((meters - 50000) / 50000);
  const highSky = clamp01((meters - 12000) / 38000) * (1 - clamp01((meters - 85000) / 30000));
  const space = clamp01((meters - 50000) / 50000);
  const star = clamp01((meters - 70000) / 30000);

  return {
    ground,
    cloud,
    sky,
    highSky,
    space,
    star,
    cloudShift: Math.round(Math.min(1800, meters * 0.32))
  };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function visualNeckHeight(mm) {
  if (mm <= 0) {
    return 0;
  }

  const meters = mm / 1000;
  const closeRange = 230 * (1 - Math.exp(-meters / 4.4));
  const farRange = Math.max(0, Math.log10(Math.max(1, meters / 18))) * 32;
  return Math.min(390, closeRange + farRange);
}

function visualZoom(height) {
  return 1 - clamp01((height - 170) / 210) * 0.08;
}

function formatLength(mm) {
  if (mm >= 1_000_000) {
    return `${formatNumber(mm / 1_000_000)}킬로미터`;
  }
  return `${formatNumber(mm / 1000)}미터`;
}

function formatNumber(value) {
  const rounded = value >= 1000 ? Math.round(value) : value >= 10 ? Math.round(value * 10) / 10 : Math.round(value * 100) / 100;
  return rounded.toLocaleString("ko-KR", {
    maximumFractionDigits: 2
  });
}

function playClickSound(role) {
  try {
    unlockAudio();
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(role === "host" ? 220 : 660, now);
    oscillator.frequency.exponentialRampToValueAtTime(role === "host" ? 120 : 990, now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.12);
  } catch {
    // Audio is optional; browsers may block it in some preview modes.
  }
}

function unlockAudio() {
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
}

function createId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char];
  });
}

function popStack() {
  stretchStack.classList.remove("pop");
  stage.classList.remove("speed-lines");
  void stretchStack.offsetWidth;
  stretchStack.classList.add("pop");
  stage.classList.add("speed-lines");
  setTimeout(() => stretchStack.classList.remove("pop"), 220);
  setTimeout(() => stage.classList.remove("speed-lines"), 280);
}

function shake(element) {
  element.classList.remove("shake");
  void element.offsetWidth;
  element.classList.add("shake");
  setTimeout(() => element.classList.remove("shake"), 260);
}

viewerRole.addEventListener("click", () => switchRole("viewer"));
hostRole.addEventListener("click", () => switchRole("host"));
loginForm.addEventListener("submit", enterApp);
enterButton.addEventListener("click", enterApp);
document.addEventListener("click", event => {
  const target = event.target;
  if (target?.id === "viewerRole") {
    switchRole("viewer");
  }
  if (target?.id === "hostRole") {
    switchRole("host");
  }
  if (target?.id === "enterButton") {
    enterApp(event);
  }
});
mainClick.addEventListener("click", clickNeck);
resetButton.addEventListener("click", resetGame);
statsButton.addEventListener("click", () => statsModal.showModal());
closeStats.addEventListener("click", () => statsModal.close());
statsModal.addEventListener("click", event => {
  if (event.target === statsModal) {
    statsModal.close();
  }
});

try {
  nicknameInput.value = localStorage.getItem("bureokjam-nickname") || "";
} catch {
  nicknameInput.value = "";
}
render();
connectFirebase();
