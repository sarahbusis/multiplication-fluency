
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  set,
  get,
  child
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const setupScreen = document.getElementById("setupScreen");
const quizScreen = document.getElementById("quizScreen");
const resultScreen = document.getElementById("resultScreen");
const teacherLoginScreen = document.getElementById("teacherLoginScreen");
const teacherScreen = document.getElementById("teacherScreen");

const studentNameInput = document.getElementById("studentName");
const homeroomSelect = document.getElementById("homeroom");
const gradeLevelSelect = document.getElementById("gradeLevel");
const startBtn = document.getElementById("startBtn");
const teacherBtn = document.getElementById("teacherBtn");

const problemGrid = document.getElementById("problemGrid");
const timerEl = document.getElementById("timer");
const answeredCountEl = document.getElementById("answeredCount");
const submitBtn = document.getElementById("submitBtn");

const scoreText = document.getElementById("scoreText");
const timeRemainingText = document.getElementById("timeRemainingText");
const missedList = document.getElementById("missedList");
const historyList = document.getElementById("historyList");
const studentFactGrid = document.getElementById("studentFactGrid");
const playAgainBtn = document.getElementById("playAgainBtn");

const teacherPasswordInput = document.getElementById("teacherPassword");
const teacherLoginBtn = document.getElementById("teacherLoginBtn");
const backToStudentBtn = document.getElementById("backToStudentBtn");
const teacherLogoutBtn = document.getElementById("teacherLogoutBtn");
const refreshTeacherBtn = document.getElementById("refreshTeacherBtn");
const teacherGradeFilter = document.getElementById("teacherGradeFilter");
const teacherHomeroomFilter = document.getElementById("teacherHomeroomFilter");
const teacherStudentList = document.getElementById("teacherStudentList");
const teacherFactGrid = document.getElementById("teacherFactGrid");

let currentProblems = [];
let timer = null;
let timeLeft = 180;

function showOnly(section) {
  [setupScreen, quizScreen, resultScreen, teacherLoginScreen, teacherScreen].forEach(s => s.classList.add("hidden"));
  section.classList.remove("hidden");
}

function saveProfileLocally(profile) {
  localStorage.setItem("multProfile", JSON.stringify(profile));
}

function loadProfileLocally() {
  const raw = localStorage.getItem("multProfile");
  return raw ? JSON.parse(raw) : null;
}

function getStudentKey(profile) {
  return `${profile.name.trim().toLowerCase()}__${profile.homeroom}__${profile.grade}`;
}

function loadSavedProfileIntoForm() {
  const p = loadProfileLocally();
  if (!p) return;
  studentNameInput.value = p.name || "";
  homeroomSelect.value = p.homeroom || "";
  gradeLevelSelect.value = p.grade || "";
}

function generateProblems() {
  const all = [];
  for (let a = 1; a <= 10; a++) {
    for (let b = 1; b <= 10; b++) {
      all.push({ a, b, key: `${a}x${b}`, answer: a * b });
    }
  }

  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }

  return all.slice(0, 50);
}

function renderProblems() {
  problemGrid.innerHTML = "";
  currentProblems.forEach((p, idx) => {
    const div = document.createElement("div");
    div.className = "problemCard";
    div.innerHTML = `
      <label>${idx + 1}. ${p.a} × ${p.b}</label>
      <input type="number" data-index="${idx}" />
    `;
    problemGrid.appendChild(div);
  });

  problemGrid.querySelectorAll("input").forEach(input => {
    input.addEventListener("input", () => {
      const count = [...problemGrid.querySelectorAll("input")].filter(i => i.value !== "").length;
      answeredCountEl.textContent = count;
    });
  });
}

function startTimer() {
  timeLeft = 180;
  updateTimerDisplay();

  timer = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    if (timeLeft <= 0) {
      clearInterval(timer);
      submitQuiz();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  timerEl.textContent = `${minutes}:${String(seconds).padStart(2, "0")}`;
}

async function startQuiz() {
  const profile = {
    name: studentNameInput.value.trim(),
    homeroom: homeroomSelect.value,
    grade: gradeLevelSelect.value
  };

  if (!profile.name || !profile.homeroom || !profile.grade) {
    alert("Please fill in all fields.");
    return;
  }

  saveProfileLocally(profile);

  currentProblems = generateProblems();
  renderProblems();
  answeredCountEl.textContent = "0";
  showOnly(quizScreen);
  startTimer();
}

async function submitQuiz() {
  clearInterval(timer);

  const profile = loadProfileLocally();
  const inputs = [...problemGrid.querySelectorAll("input")];

  let score = 0;
  const wrongFacts = [];
  const factResults = {};

  currentProblems.forEach((p, idx) => {
    const val = Number(inputs[idx].value);
    const correct = val === p.answer;
    factResults[p.key] = correct;
    if (correct) score++;
    else wrongFacts.push(`${p.a} × ${p.b} = ${p.answer}`);
  });

  const secondsRemaining = score === 50 ? timeLeft : 0;

  const attempt = {
    studentKey: getStudentKey(profile),
    name: profile.name,
    homeroom: profile.homeroom,
    grade: Number(profile.grade),
    date: new Date().toISOString(),
    score,
    correctCount: score,
    wrongFacts,
    factResults,
    secondsRemaining
  };

  const newAttemptRef = push(ref(db, "attempts"));
  await set(newAttemptRef, attempt);

  await set(ref(db, `students/${getStudentKey(profile)}`), {
    name: profile.name,
    homeroom: profile.homeroom,
    grade: Number(profile.grade)
  });

  await showStudentResults(attempt);
}

async function showStudentResults(latestAttempt) {
  scoreText.textContent = `Score: ${latestAttempt.score} / 50`;
  timeRemainingText.textContent = latestAttempt.score === 50
    ? `Perfect score with ${latestAttempt.secondsRemaining} seconds left`
    : `Time remaining bonus only appears for 50/50`;

  missedList.innerHTML = latestAttempt.wrongFacts.length
    ? latestAttempt.wrongFacts.map(x => `<div class="historyItem">${x}</div>`).join("")
    : `<div class="historyItem">No missed problems — amazing!</div>`;

  await renderStudentHistory(latestAttempt.studentKey);
  await renderStudentFactGrid(latestAttempt.studentKey);

  showOnly(resultScreen);
}

async function renderStudentHistory(studentKey) {
  const snap = await get(ref(db, "attempts"));
  const attempts = [];
  if (snap.exists()) {
    const data = snap.val();
    Object.values(data).forEach(a => {
      if (a.studentKey === studentKey) attempts.push(a);
    });
  }

  attempts.sort((a, b) => new Date(b.date) - new Date(a.date));

  historyList.innerHTML = "";
  if (!attempts.length) return;

  const scores = attempts.map(a => a.score);
  const max = Math.max(...scores);
  const min = Math.min(...scores);

  attempts.forEach(a => {
    const div = document.createElement("div");
    div.className = "historyItem";

    if (a.score === max) div.style.background = "#bbf7d0";
    else if (a.score === min) div.style.background = "#e5e7eb";
    else div.style.background = "#fef3c7";

    div.textContent = `${new Date(a.date).toLocaleDateString()} — ${a.score}/50`;
    historyList.appendChild(div);
  });
}

async function renderStudentFactGrid(studentKey) {
  const snap = await get(ref(db, "attempts"));
  const factStats = {};
  for (let a = 1; a <= 10; a++) {
    for (let b = 1; b <= 10; b++) {
      factStats[`${a}x${b}`] = { right: 0, total: 0 };
    }
  }

  if (snap.exists()) {
    Object.values(snap.val()).forEach(attempt => {
      if (attempt.studentKey !== studentKey) return;
      for (const key in attempt.factResults) {
        factStats[key].total += 1;
        if (attempt.factResults[key]) factStats[key].right += 1;
      }
    });
  }

  studentFactGrid.innerHTML = `<div class="factGrid"></div>`;
  const grid = studentFactGrid.querySelector(".factGrid");

  for (let a = 1; a <= 10; a++) {
    for (let b = 1; b <= 10; b++) {
      const key = `${a}x${b}`;
      const s = factStats[key];
      const pct = s.total ? Math.round((s.right / s.total) * 100) : 0;
      const cell = document.createElement("div");
      cell.className = "factCell";
      cell.style.background = getHeatColor(pct);
      cell.textContent = `${a}×${b} ${pct}%`;
      grid.appendChild(cell);
    }
  }
}

function getHeatColor(pct) {
  if (pct >= 90) return "#22c55e";
  if (pct >= 75) return "#86efac";
  if (pct >= 50) return "#fde68a";
  if (pct >= 25) return "#fdba74";
  return "#fca5a5";
}

async function loadTeacherDashboard() {
  const snap = await get(ref(db, "attempts"));
  const attempts = snap.exists() ? Object.values(snap.val()) : [];

  const grade = teacherGradeFilter.value;
  const homeroom = teacherHomeroomFilter.value;

  const filtered = attempts.filter(a => {
    const gradeOk = !grade || String(a.grade) === grade;
    const hrOk = !homeroom || a.homeroom === homeroom;
    return gradeOk && hrOk;
  });

  renderTeacherStudentList(filtered);
  renderTeacherFactGrid(filtered);

  showOnly(teacherScreen);
}

function renderTeacherStudentList(attempts) {
  teacherStudentList.innerHTML = "";

  const latestByStudent = {};
  attempts.forEach(a => {
    if (!latestByStudent[a.studentKey] || new Date(a.date) > new Date(latestByStudent[a.studentKey].date)) {
      latestByStudent[a.studentKey] = a;
    }
  });

  Object.values(latestByStudent)
    .sort((a, b) => b.score - a.score)
    .forEach(a => {
      const div = document.createElement("div");
      div.className = "studentRow";
      div.style.background = getHeatColor(Math.round((a.score / 50) * 100));
      div.textContent = `${a.name} | ${a.homeroom} | Grade ${a.grade} | ${a.score}/50`;
      teacherStudentList.appendChild(div);
    });
}

function renderTeacherFactGrid(attempts) {
  const stats = {};
  for (let a = 1; a <= 10; a++) {
    for (let b = 1; b <= 10; b++) {
      stats[`${a}x${b}`] = { right: 0, total: 0 };
    }
  }

  attempts.forEach(attempt => {
    Object.entries(attempt.factResults || {}).forEach(([key, correct]) => {
      stats[key].total += 1;
      if (correct) stats[key].right += 1;
    });
  });

  teacherFactGrid.innerHTML = `<div class="factGrid"></div>`;
  const grid = teacherFactGrid.querySelector(".factGrid");

  for (let a = 1; a <= 10; a++) {
    for (let b = 1; b <= 10; b++) {
      const s = stats[`${a}x${b}`];
      const pct = s.total ? Math.round((s.right / s.total) * 100) : 0;
      const cell = document.createElement("div");
      cell.className = "factCell";
      cell.style.background = getHeatColor(pct);
      cell.textContent = `${a}×${b} ${pct}%`;
      grid.appendChild(cell);
    }
  }
}

startBtn.addEventListener("click", startQuiz);
submitBtn.addEventListener("click", submitQuiz);
playAgainBtn.addEventListener("click", startQuiz);

teacherBtn.addEventListener("click", () => showOnly(teacherLoginScreen));
backToStudentBtn.addEventListener("click", () => showOnly(setupScreen));

teacherLoginBtn.addEventListener("click", async () => {
  if (teacherPasswordInput.value === "2026") {
    await loadTeacherDashboard();
  } else {
    alert("Incorrect password");
  }
});

refreshTeacherBtn.addEventListener("click", loadTeacherDashboard);
teacherLogoutBtn.addEventListener("click", () => showOnly(setupScreen));

loadSavedProfileIntoForm();
showOnly(setupScreen);
