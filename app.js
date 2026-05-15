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
const nicknameInput = document.querySelector("#nicknameInput");
const passwordInput = document.querySelector("#passwordInput");
const mainClick = document.querySelector("#mainClick");
const clickVerb = document.querySelector("#clickVerb");
const playerLabel = document.querySelector("#playerLabel");
const syncNote = document.querySelector("#syncNote");
const neckColumn = document.querySelector("#neckColumn");
const stretchStack = document.querySelector("#stretchStack");
const neckMm = document.querySelector("#neckMm");
const rulerValue = document.querySelector("#rulerValue");
const totalClicks = document.querySelector("#totalClicks");
const topPlayer = document.querySelector("#topPlayer");
const statsList = document.querySelector("#statsList");

let selectedRole = "viewer";
let currentUser = null;
let mode = "local";
let remoteDb = null;
let remoteRef = null;
let hostPassword = "bureokjam";

const defaultState = {
  neckMm: 0,
  growMm: 10,
  shrinkMm: 24,
  totalClicks: 0,
  users: {},
  updatedAt: Date.now()
};

let state = readLocalState();

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
  localStorage.setItem(LOCAL_KEY, JSON.stringify(nextState));
  channel.postMessage(nextState);
}

const channel = new BroadcastChannel("bureokjam-neck");
channel.onmessage = event => {
  if (mode === "local") {
    state = event.data;
    render();
  }
};

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
      state = { ...defaultState, ...(snapshot.val() || {}) };
      syncNote.textContent = "실시간 공유 중";
      render();
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
  event.preventDefault();

  if (selectedRole === "host") {
    if (passwordInput.value.trim() !== hostPassword) {
      shake(loginForm);
      return;
    }
    currentUser = { role: "host", name: HOST_NAME };
  } else {
    currentUser = { role: "viewer", name: cleanName(nicknameInput.value) };
    localStorage.setItem("bureokjam-nickname", currentUser.name);
  }

  appRoot.dataset.screen = "play";
  mainClick.disabled = false;
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
        const base = { ...defaultState, ...(current || {}) };
        return mutator(base);
      })
      .catch(error => {
        syncNote.textContent = "클릭 저장 실패: 새로고침 후 다시 시도";
        console.warn(error);
      });
    return;
  }

  state = mutator({ ...state, users: { ...(state.users || {}) } });
  writeLocalState(state);
  render(true);
}

function clickNeck() {
  if (!currentUser) return;

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
    current.totalClicks = Number(current.totalClicks || 0) + 1;
    current.updatedAt = Date.now();
    return current;
  });

  popStack();
}

function render() {
  const mm = Math.max(0, Math.round(Number(state.neckMm || 0)));
  const height = Math.min(1500, mm * 1.9);
  neckColumn.style.height = `${height}px`;
  neckMm.textContent = mm.toLocaleString("ko-KR");
  rulerValue.textContent = `${mm.toLocaleString("ko-KR")}mm`;

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
  void stretchStack.offsetWidth;
  stretchStack.classList.add("pop");
  setTimeout(() => stretchStack.classList.remove("pop"), 220);
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
mainClick.addEventListener("click", clickNeck);
statsButton.addEventListener("click", () => statsModal.showModal());
closeStats.addEventListener("click", () => statsModal.close());
statsModal.addEventListener("click", event => {
  if (event.target === statsModal) {
    statsModal.close();
  }
});

nicknameInput.value = localStorage.getItem("bureokjam-nickname") || "";
render();
connectFirebase();
