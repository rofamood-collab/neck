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
const neckMessage = document.querySelector("#neckMessage");
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
  growMm: 0.5,
  shrinkMm: 1.2,
  totalClicks: 0,
  users: {},
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
        state = event.data;
        render();
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
