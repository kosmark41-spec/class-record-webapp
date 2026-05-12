const PASSING_GRADE = 75;
const PASSWORD_RULE_MESSAGE = "Password must be exactly 10 characters and include at least one lowercase letter, one uppercase letter, and one number.";
const QUARTER_ORDER = ["first", "second", "third", "fourth"];
const QUARTER_LABELS = {
  first: "First Quarter",
  second: "Second Quarter",
  third: "Third Quarter",
  fourth: "Fourth Quarter"
};
const QUARTER_BUTTON_LABELS = {
  first: "1st Quarter",
  second: "2nd Quarter",
  third: "3rd Quarter",
  fourth: "4th Quarter"
};
const app = document.getElementById("app");

const state = {
  loading: true,
  currentUser: null,
  dashboard: null,
  notice: null,
  teacherFilter: "",
  adminAccountSearch: "",
  adminTeacherSearch: "",
  adminStudentSearch: "",
  teacherQuarterlySearch: "",
  teacherGradeSearch: "",
  teacherAttendanceSearch: "",
  teacherAttendanceDate: new Date().toISOString().slice(0, 10),
  teacherQuarter: "first",
  teacherQuarterTransitionDirection: "",
  studentPrintQuarter: "all",
  systemStatus: {
    hasUsers: false,
    hasAdmin: false
  }
};

let cachedStudentReportStylesheet = "";

const STUDENT_REPORT_DOWNLOAD_FALLBACK_STYLES = `
:root {
  color-scheme: light;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 24px;
  font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
  background: #f6efe6;
  color: #2f241b;
}

.report-download-frame {
  width: min(980px, 100%);
  margin: 0 auto;
}

.student-print-main {
  display: grid;
  gap: 1rem;
  padding: 1.25rem;
  border-radius: 24px;
  border: 1px solid rgba(109, 81, 58, 0.14);
  background: #fff;
}

.student-report-head,
.student-quarter-header,
.subject-report-top,
.subject-report-footer {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: start;
  flex-wrap: wrap;
}

.student-report-meta,
.student-quarter-section,
.subject-report-list,
.subject-report-card-item,
.subject-score-grid,
.subject-report-notes {
  display: grid;
  gap: 0.85rem;
}

.subject-score-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.subject-report-notes {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.subject-score-box,
.student-report-meta,
.subject-report-card-item {
  padding: 0.85rem;
  border-radius: 18px;
  border: 1px solid rgba(109, 81, 58, 0.12);
  background: #fff;
}

.student-quarter-meta,
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  font-weight: 700;
}

.badge.good {
  background: rgba(110, 143, 113, 0.16);
  color: #37523a;
}

.badge.warn {
  background: rgba(189, 120, 77, 0.16);
  color: #8b4b2a;
}

.muted,
.subject-report-label,
.subject-score-box span,
.student-report-meta span,
.subject-report-notes span,
.subject-report-updated span,
.subject-report-result small {
  color: #6e6258;
}

.subject-report-top h4,
.student-quarter-header h4,
.student-report-head h3 {
  margin: 0.2rem 0;
}

.subject-report-heading h4,
.subject-report-heading .muted {
  overflow-wrap: anywhere;
  word-break: break-word;
}

.student-print-actions {
  display: none !important;
}

@media print {
  body {
    padding: 0;
    background: #fff;
  }

  .report-download-frame {
    width: 100%;
    max-width: none;
  }
}
`;

function getStoredUser() {
  const raw = sessionStorage.getItem("classRecordCurrentUser");
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (error) {
    sessionStorage.removeItem("classRecordCurrentUser");
    return null;
  }
}

function setStoredUser(user) {
  if (user) {
    sessionStorage.setItem("classRecordCurrentUser", JSON.stringify(user));
  } else {
    sessionStorage.removeItem("classRecordCurrentUser");
  }
}

async function api(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const requestPath = method === "GET"
    ? `${path}${String(path).includes("?") ? "&" : "?"}_=${Date.now()}`
    : path;

  const response = await fetch(requestPath, {
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || "Request failed.");
  }
  return payload;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(isoValue) {
  if (!isoValue) return "Not yet saved";
  return new Date(isoValue).toLocaleString();
}

function formatCompactDateTime(isoValue) {
  if (!isoValue) return "Pending";

  return new Date(isoValue).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatScore(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue.toFixed(2) : "--";
}

function normalizeQuarter(value) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  return QUARTER_ORDER.includes(normalizedValue) ? normalizedValue : "first";
}

function getQuarterLabel(quarter) {
  return QUARTER_LABELS[normalizeQuarter(quarter)];
}

function getQuarterButtonLabel(quarter) {
  return QUARTER_BUTTON_LABELS[normalizeQuarter(quarter)];
}

function getQuarterTransitionDirection(fromQuarter, toQuarter) {
  const fromIndex = QUARTER_ORDER.indexOf(normalizeQuarter(fromQuarter));
  const toIndex = QUARTER_ORDER.indexOf(normalizeQuarter(toQuarter));
  return toIndex > fromIndex ? "forward" : "backward";
}

function normalizeStudentPrintQuarter(value) {
  return value === "all" ? "all" : normalizeQuarter(value);
}

function getStudentPrintScopeLabel(value) {
  const scope = normalizeStudentPrintQuarter(value);
  return scope === "all" ? "All Quarters" : getQuarterLabel(scope);
}

function sanitizeFileNamePart(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "report";
}

function sortQuarterItems(items) {
  return [...items].sort((left, right) => {
    const quarterDifference = QUARTER_ORDER.indexOf(normalizeQuarter(left.quarter)) - QUARTER_ORDER.indexOf(normalizeQuarter(right.quarter));
    if (quarterDifference !== 0) {
      return quarterDifference;
    }

    return String(left.name || left.subjectName || "").localeCompare(String(right.name || right.subjectName || ""));
  });
}

function groupItemsByQuarter(items) {
  const groups = QUARTER_ORDER.reduce((result, quarter) => {
    result[quarter] = [];
    return result;
  }, {});

  items.forEach((item) => {
    const quarter = normalizeQuarter(item.quarter);
    groups[quarter].push({
      ...item,
      quarter,
      quarterLabel: getQuarterLabel(quarter)
    });
  });

  return groups;
}

function computeGrade(quiz, exam, assignmentScore = null) {
  const scores = [assignmentScore, quiz, exam]
    .map((value) => {
      if (value === "" || value === null || value === undefined) {
        return null;
      }

      const numericValue = Number(value);
      return Number.isFinite(numericValue) ? numericValue : null;
    })
    .filter((value) => value !== null);

  if (!scores.length) return 0;
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

function transmuteGrade(initialGrade) {
  const numericGrade = Number(initialGrade);
  if (!Number.isFinite(numericGrade)) return 60;

  const roundedGrade = Math.min(100, Math.max(0, Number(numericGrade.toFixed(2))));
  const gradeTable = [
    [99.5, 100],
    [97.5, 99],
    [96, 98],
    [95, 97],
    [94, 96],
    [93, 95],
    [92, 94],
    [91, 93],
    [90, 92],
    [89, 91],
    [88, 90],
    [87, 89],
    [86, 88],
    [85, 87],
    [84, 86],
    [83, 85],
    [82, 84],
    [81, 83],
    [80, 82],
    [79, 81],
    [78, 80],
    [77, 79],
    [76, 78],
    [75, 77],
    [73, 76],
    [70, 75],
    [68, 74],
    [66, 73],
    [64, 72],
    [62, 71],
    [60, 70],
    [58, 69],
    [56, 68],
    [54, 67],
    [52, 66],
    [50, 65],
    [48, 64],
    [46, 63],
    [43, 62],
    [40, 61]
  ];

  const match = gradeTable.find(([minimumGrade]) => roundedGrade >= minimumGrade);
  return match ? match[1] : 60;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getRemarks(grade) {
  return grade >= PASSING_GRADE ? "Passed" : "Needs Improvement";
}

function getGradeDescriptor(grade) {
  if (grade === "" || grade === null || grade === undefined) {
    return {
      letter: "",
      label: "Pending",
      localLabel: "",
      text: "Pending"
    };
  }

  const numericGrade = Number(grade);
  if (!Number.isFinite(numericGrade)) {
    return {
      letter: "",
      label: "Pending",
      localLabel: "",
      text: "Pending"
    };
  }

  if (numericGrade >= 90) {
    return {
      letter: "A",
      label: "Advancing",
      localLabel: "Namumukod-tangi",
      text: "A - Advancing"
    };
  }

  if (numericGrade >= 80) {
    return {
      letter: "B",
      label: "Benchmarking",
      localLabel: "Napamamalas",
      text: "B - Benchmarking"
    };
  }

  if (numericGrade >= 75) {
    return {
      letter: "C",
      label: "Connecting",
      localLabel: "Natututo",
      text: "C - Connecting"
    };
  }

  if (numericGrade >= 65) {
    return {
      letter: "D",
      label: "Developing",
      localLabel: "Napaunlad",
      text: "D - Developing"
    };
  }

  return {
    letter: "E",
    label: "Emerging",
    localLabel: "Nasisimula",
    text: "E - Emerging"
  };
}

function buildTeacherQuarterlyGradeSummary(student, subjects, gradeLookup) {
  const studentGrades = subjects
    .map((subject) => gradeLookup.get(`${student.id}|${subject.id}`))
    .filter(Boolean);
  const subjectAverages = studentGrades.map((grade) => computeGrade(grade.quiz, grade.exam, grade.assignmentScore));
  const subjectCount = subjects.length;
  const gradedSubjectCount = studentGrades.length;
  const remainingSubjectCount = Math.max(subjectCount - gradedSubjectCount, 0);
  const latestUpdatedAt = studentGrades.reduce((latest, grade) => {
    if (!grade.updatedAt) {
      return latest;
    }

    return !latest || grade.updatedAt > latest ? grade.updatedAt : latest;
  }, "");
  const quarterlyAverage = subjectCount > 0 && gradedSubjectCount === subjectCount
    ? Number(average(subjectAverages).toFixed(2))
    : null;
  const transmutedQuarterlyGrade = quarterlyAverage !== null ? transmuteGrade(quarterlyAverage) : null;
  const descriptor = transmutedQuarterlyGrade !== null ? getGradeDescriptor(transmutedQuarterlyGrade) : getGradeDescriptor(null);

  let progressLabel = "No grades saved yet.";
  if (gradedSubjectCount && remainingSubjectCount) {
    progressLabel = `${gradedSubjectCount} of ${subjectCount} subject(s) graded.`;
  } else if (gradedSubjectCount && !remainingSubjectCount) {
    progressLabel = `All ${subjectCount} subject(s) graded.`;
  }

  return {
    subjectCount,
    gradedSubjectCount,
    remainingSubjectCount,
    latestUpdatedAt,
    quarterlyAverage,
    transmutedQuarterlyGrade,
    descriptor,
    remarks: transmutedQuarterlyGrade !== null ? getRemarks(transmutedQuarterlyGrade) : "Pending",
    progressLabel,
    statusLabel: quarterlyAverage !== null
      ? "Quarterly average is based on all saved subject grades and the transmuted grade follows the grading table."
      : remainingSubjectCount
        ? `Waiting for ${remainingSubjectCount} more subject(s) before the quarterly grade is final.`
        : "No quarter subjects available yet."
  };
}

function roleTitle(role) {
  return role === "admin" ? "Admin Console" : role === "teacher" ? "Teacher Panel" : "Student Portal";
}

function roleSummary(role) {
  return role === "admin"
    ? "Create and supervise accounts"
    : role === "teacher"
      ? "Manage your class records"
      : "View your academic report";
}

function formatRoleLabel(role) {
  return String(role || "").charAt(0).toUpperCase() + String(role || "").slice(1);
}

function getAccountAccessDetails(account) {
  if (account.role === "teacher") {
    return `${account.studentCount} student(s), ${account.subjectCount} subject(s)`;
  }

  if (account.role === "student") {
    return `Teacher: ${account.teacherName || "Unassigned"}`;
  }

  return "Administrator account";
}

function matchesAccountSearch(account, query) {
  const searchValue = String(query || "").trim().toLowerCase();
  if (!searchValue) return true;

  const values = [
    account.name,
    account.email,
    formatRoleLabel(account.role),
    getAccountAccessDetails(account)
  ];

  return values.some((value) => String(value || "").toLowerCase().includes(searchValue));
}

function getAccountSearchText(account) {
  return [
    account.name,
    account.email,
    account.role,
    formatRoleLabel(account.role),
    getAccountAccessDetails(account),
    account.teacherName,
    account.id
  ].join(" ").toLowerCase();
}

function getAdminUserSearchText(user, extraDetails = "") {
  return [
    user.name,
    user.email,
    user.role,
    formatRoleLabel(user.role),
    extraDetails,
    user.id
  ].join(" ").toLowerCase();
}

function applyListSearchFilter(options) {
  const searchInput = document.getElementById(options.inputId);
  const emptyState = document.getElementById(options.emptyId);
  const items = Array.from(document.querySelectorAll(options.itemSelector));

  if (!searchInput || !emptyState) {
    return;
  }

  const searchValue = String(searchInput.value || "").trim().toLowerCase();
  state[options.stateKey] = searchValue;

  let matchCount = 0;

  items.forEach((item) => {
    const searchText = String(item.getAttribute("data-search-text") || "").toLowerCase();
    const isMatch = !searchValue || searchText.includes(searchValue);
    item.style.display = isMatch ? "" : "none";
    if (isMatch) {
      matchCount += 1;
    }
  });

  emptyState.style.display = searchValue && matchCount === 0 ? "block" : "none";
}

function handleListSearch(event, options) {
  event.preventDefault();
  applyListSearchFilter(options);
}

function handleListSearchClear(options) {
  const searchInput = document.getElementById(options.inputId);
  if (!searchInput) {
    return;
  }

  searchInput.value = "";
  state[options.stateKey] = "";
  applyListSearchFilter(options);
  searchInput.focus();
}

function applyAccountSearchFilter() {
  applyListSearchFilter({
    inputId: "account-search",
    emptyId: "account-search-empty",
    itemSelector: "[data-account-item]",
    stateKey: "adminAccountSearch"
  });
}

function handleAccountSearch(event) {
  handleListSearch(event, {
    inputId: "account-search",
    emptyId: "account-search-empty",
    itemSelector: "[data-account-item]",
    stateKey: "adminAccountSearch"
  });
}

function handleAccountSearchClear() {
  handleListSearchClear({
    inputId: "account-search",
    emptyId: "account-search-empty",
    itemSelector: "[data-account-item]",
    stateKey: "adminAccountSearch"
  });
}

function applyTeacherSearchFilter() {
  applyListSearchFilter({
    inputId: "teacher-search",
    emptyId: "teacher-search-empty",
    itemSelector: "[data-teacher-item]",
    stateKey: "adminTeacherSearch"
  });
}

function handleTeacherSearch(event) {
  handleListSearch(event, {
    inputId: "teacher-search",
    emptyId: "teacher-search-empty",
    itemSelector: "[data-teacher-item]",
    stateKey: "adminTeacherSearch"
  });
}

function handleTeacherSearchClear() {
  handleListSearchClear({
    inputId: "teacher-search",
    emptyId: "teacher-search-empty",
    itemSelector: "[data-teacher-item]",
    stateKey: "adminTeacherSearch"
  });
}

function applyStudentSearchFilter() {
  applyListSearchFilter({
    inputId: "student-search",
    emptyId: "student-search-empty",
    itemSelector: "[data-student-item]",
    stateKey: "adminStudentSearch"
  });
}

function handleStudentSearch(event) {
  handleListSearch(event, {
    inputId: "student-search",
    emptyId: "student-search-empty",
    itemSelector: "[data-student-item]",
    stateKey: "adminStudentSearch"
  });
}

function handleStudentSearchClear() {
  handleListSearchClear({
    inputId: "student-search",
    emptyId: "student-search-empty",
    itemSelector: "[data-student-item]",
    stateKey: "adminStudentSearch"
  });
}

function applyGradeSearchFilter() {
  applyListSearchFilter({
    inputId: "grade-search",
    emptyId: "grade-search-empty",
    itemSelector: "[data-grade-row]",
    stateKey: "teacherGradeSearch"
  });
}

function applyQuarterlySearchFilter() {
  applyListSearchFilter({
    inputId: "quarterly-search",
    emptyId: "quarterly-search-empty",
    itemSelector: "[data-quarterly-card]",
    stateKey: "teacherQuarterlySearch"
  });
}

function handleQuarterlySearch(event) {
  handleListSearch(event, {
    inputId: "quarterly-search",
    emptyId: "quarterly-search-empty",
    itemSelector: "[data-quarterly-card]",
    stateKey: "teacherQuarterlySearch"
  });
}

function handleQuarterlySearchClear() {
  handleListSearchClear({
    inputId: "quarterly-search",
    emptyId: "quarterly-search-empty",
    itemSelector: "[data-quarterly-card]",
    stateKey: "teacherQuarterlySearch"
  });
}

function handleGradeSearch(event) {
  handleListSearch(event, {
    inputId: "grade-search",
    emptyId: "grade-search-empty",
    itemSelector: "[data-grade-row]",
    stateKey: "teacherGradeSearch"
  });
}

function handleGradeSearchClear() {
  handleListSearchClear({
    inputId: "grade-search",
    emptyId: "grade-search-empty",
    itemSelector: "[data-grade-row]",
    stateKey: "teacherGradeSearch"
  });
}

function applyAttendanceSearchFilter() {
  applyListSearchFilter({
    inputId: "attendance-search",
    emptyId: "attendance-search-empty",
    itemSelector: "[data-attendance-row]",
    stateKey: "teacherAttendanceSearch"
  });
}

function handleAttendanceSearch(event) {
  handleListSearch(event, {
    inputId: "attendance-search",
    emptyId: "attendance-search-empty",
    itemSelector: "[data-attendance-row]",
    stateKey: "teacherAttendanceSearch"
  });
}

function handleAttendanceSearchClear() {
  handleListSearchClear({
    inputId: "attendance-search",
    emptyId: "attendance-search-empty",
    itemSelector: "[data-attendance-row]",
    stateKey: "teacherAttendanceSearch"
  });
}

function heroTitle(role) {
  return role === "admin"
    ? "School account and record management"
    : role === "teacher"
      ? "Encode grades and monitor class performance"
      : "Track your grades and print your report";
}

function heroDescription(role) {
  return role === "admin"
    ? "Organize accounts, oversee sections, and keep the whole school record system in sync."
    : role === "teacher"
      ? "Encode scores, monitor missed work, and keep each section updated from one focused workspace."
      : "Review your scores, attendance, and class progress in a cleaner student snapshot.";
}

const ADMIN_QUICK_LINKS = [
  {
    id: "admin-add-teacher",
    title: "Add Teacher",
    description: "Create teacher accounts",
    icon: "teacherAdd"
  },
  {
    id: "admin-add-student",
    title: "Add Students",
    description: "Enroll new student records",
    icon: "studentAdd"
  },
  {
    id: "admin-search-teacher",
    title: "Search Teacher",
    description: "Find and manage teachers",
    icon: "teacherSearch"
  },
  {
    id: "admin-search-student",
    title: "Search Student",
    description: "Find and manage students",
    icon: "studentSearch"
  },
  {
    id: "admin-all-accounts",
    title: "All Accounts",
    description: "Review every account",
    icon: "allAccounts"
  }
];

const TEACHER_QUICK_LINKS = [
  {
    id: "teacher-add-student",
    title: "Add Student",
    description: "Enroll a new learner",
    icon: "studentAdd"
  },
  {
    id: "teacher-add-subject",
    title: "Add Subject",
    description: "Create a subject slot",
    icon: "subjectAdd"
  },
  {
    id: "teacher-class-record",
    title: "Class Record",
    description: "Encode and review grades",
    icon: "classRecord"
  },
  {
    id: "teacher-attendance",
    title: "Attendance",
    description: "Track daily attendance",
    icon: "attendance"
  }
];

const QUICK_NAV_CONFIG = {
  admin: {
    label: "Navigation",
    title: "Admin Shortcuts",
    links: ADMIN_QUICK_LINKS
  },
  teacher: {
    label: "Navigation",
    title: "Teacher Shortcuts",
    links: TEACHER_QUICK_LINKS
  }
};

function renderAdminNavIcon(icon) {
  const icons = {
    teacherAdd: `
      <circle cx="8.25" cy="7.25" r="2.75"></circle>
      <path d="M3.5 18a4.75 4.75 0 0 1 9.5 0"></path>
      <path d="M17.25 5.5v7"></path>
      <path d="M13.75 9h7"></path>
    `,
    studentAdd: `
      <circle cx="7.5" cy="8" r="2.75"></circle>
      <path d="M3.5 18a4.5 4.5 0 0 1 8.5 0"></path>
      <circle cx="15.75" cy="9" r="2.25"></circle>
      <path d="M19 13.75v5"></path>
      <path d="M16.5 16.25h5"></path>
    `,
    teacherSearch: `
      <circle cx="8.25" cy="7.25" r="2.75"></circle>
      <path d="M3.5 18a4.75 4.75 0 0 1 7-4.15"></path>
      <circle cx="17" cy="16.5" r="3"></circle>
      <path d="m19.2 18.7 2.2 2.2"></path>
    `,
    studentSearch: `
      <circle cx="7.25" cy="8" r="2.6"></circle>
      <circle cx="13.25" cy="7" r="2.1"></circle>
      <path d="M3.5 17.75a4.4 4.4 0 0 1 6.2-3.95"></path>
      <path d="M11.9 13.5a3.5 3.5 0 0 1 3.6.4"></path>
      <circle cx="18" cy="17.25" r="2.75"></circle>
      <path d="m20 19.25 1.5 1.5"></path>
    `,
    allAccounts: `
      <circle cx="6.5" cy="7.5" r="2.2"></circle>
      <circle cx="12" cy="6.25" r="2.4"></circle>
      <circle cx="17.5" cy="7.5" r="2.2"></circle>
      <path d="M2.75 17.75a3.9 3.9 0 0 1 7.5 0"></path>
      <path d="M7.9 18.25a4.7 4.7 0 0 1 8.2 0"></path>
      <path d="M13.75 17.75a3.9 3.9 0 0 1 7.5 0"></path>
    `,
    subjectAdd: `
      <path d="M6 5.25h8.5a2.25 2.25 0 0 1 2.25 2.25v10.75a1.5 1.5 0 0 0-1.5-1.5H6a2.25 2.25 0 0 0-2.25 2.25V7.5A2.25 2.25 0 0 1 6 5.25z"></path>
      <path d="M8 9h4.5"></path>
      <path d="M8 12h3"></path>
      <path d="M18.25 8v6"></path>
      <path d="M15.25 11h6"></path>
    `,
    classRecord: `
      <rect x="4.25" y="4.75" width="15.5" height="14.5" rx="2.5"></rect>
      <path d="M8 9h8"></path>
      <path d="M8 12h4.5"></path>
      <path d="M8 15h3.5"></path>
      <path d="M15.75 13.75l1.5 1.5 2.5-3"></path>
    `,
    attendance: `
      <rect x="4.25" y="5.25" width="15.5" height="13.5" rx="2.5"></rect>
      <path d="M8 3.75v3"></path>
      <path d="M16 3.75v3"></path>
      <path d="M4.25 9.25h15.5"></path>
      <path d="m9 14 2 2 4-4"></path>
    `
  };

  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      ${icons[icon] || ""}
    </svg>
  `;
}

function renderRoleQuickNav(role) {
  const config = QUICK_NAV_CONFIG[role];
  if (!config) {
    return "";
  }

  return `
    <nav class="admin-quick-nav" aria-label="Sidebar navigation">
      <div class="admin-quick-nav-head">
        <small>${escapeHtml(config.label)}</small>
        <strong>${escapeHtml(config.title)}</strong>
      </div>
      <div class="admin-quick-nav-links">
        ${config.links.map((item, index) => `
          <a class="admin-nav-link${index === 0 ? " is-active" : ""}" href="#${item.id}" data-admin-nav-link="${item.id}">
            <span class="admin-nav-icon">${renderAdminNavIcon(item.icon)}</span>
            <span class="admin-nav-copy">
              <strong>${escapeHtml(item.title)}</strong>
              <small>${escapeHtml(item.description)}</small>
            </span>
          </a>
        `).join("")}
      </div>
    </nav>
  `;
}

function renderTeacherQuarterSwitcher() {
  const activeQuarter = normalizeQuarter(state.teacherQuarter);
  const dashboard = state.dashboard || { subjects: [], grades: [] };
  const groupedSubjects = groupItemsByQuarter(sortQuarterItems(Array.isArray(dashboard.subjects) ? dashboard.subjects : []));
  const activeSubjects = groupedSubjects[activeQuarter] || [];
  const activeGrades = Array.isArray(dashboard.grades)
    ? dashboard.grades.filter((grade) => normalizeQuarter(grade.quarter) === activeQuarter)
    : [];
  const quarterTransitionAttributes = state.teacherQuarterTransitionDirection
    ? ` data-quarter-transition="${state.teacherQuarterTransitionDirection}"`
    : "";

  return `
    <section class="sidebar-meta teacher-quarter-panel"${quarterTransitionAttributes} aria-label="Quarter switcher">
      <small>Quarterly View</small>
      <strong>${escapeHtml(getQuarterLabel(activeQuarter))}</strong>
      <p class="teacher-quarter-caption">Switch the subjects and class record you are viewing.</p>
      <div class="teacher-quarter-grid" role="group" aria-label="Select active quarter">
        ${QUARTER_ORDER.map((quarter) => `
          <button
            class="teacher-quarter-btn${quarter === activeQuarter ? " is-active" : ""}"
            type="button"
            data-teacher-quarter="${quarter}"
            aria-pressed="${quarter === activeQuarter ? "true" : "false"}"
          >
            <span>${escapeHtml(getQuarterButtonLabel(quarter))}</span>
          </button>
        `).join("")}
      </div>
      <div class="teacher-quarter-summary">
        <span>${activeSubjects.length} subject(s)</span>
        <span>${activeGrades.length} saved grade(s)</span>
      </div>
    </section>
  `;
}

function initializeQuickNav() {
  const navLinks = Array.from(document.querySelectorAll("[data-admin-nav-link]"));
  if (!navLinks.length) {
    return;
  }

  const sections = navLinks
    .map((link) => document.getElementById(link.getAttribute("data-admin-nav-link")))
    .filter(Boolean);

  if (!sections.length) {
    return;
  }

  const setActiveLink = (sectionId) => {
    navLinks.forEach((link) => {
      link.classList.toggle("is-active", link.getAttribute("data-admin-nav-link") === sectionId);
    });
  };

  const initialSectionId = sections.some((section) => section.id === window.location.hash.slice(1))
    ? window.location.hash.slice(1)
    : sections[0].id;

  setActiveLink(initialSectionId);

  navLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const targetId = link.getAttribute("data-admin-nav-link");
      const targetSection = document.getElementById(targetId);

      if (!targetSection) {
        return;
      }

      event.preventDefault();
      setActiveLink(targetId);
      window.history.replaceState(null, "", `#${targetId}`);
      targetSection.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  if (!("IntersectionObserver" in window)) {
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    const activeEntry = entries
      .filter((entry) => entry.isIntersecting)
      .sort((first, second) => second.intersectionRatio - first.intersectionRatio)[0];

    if (activeEntry) {
      setActiveLink(activeEntry.target.id);
    }
  }, {
    threshold: [0.2, 0.4, 0.65],
    rootMargin: "-16% 0px -55% 0px"
  });

  sections.forEach((section) => observer.observe(section));
}

function todayStamp() {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

async function getStudentReportStylesheetText() {
  if (cachedStudentReportStylesheet) {
    return cachedStudentReportStylesheet;
  }

  try {
    const response = await fetch("styles.css", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Unable to load report styles.");
    }

    cachedStudentReportStylesheet = await response.text();
    return cachedStudentReportStylesheet;
  } catch (error) {
    cachedStudentReportStylesheet = STUDENT_REPORT_DOWNLOAD_FALLBACK_STYLES;
    return cachedStudentReportStylesheet;
  }
}

function buildStudentReportDownloadHtml(reportMarkup, scope, stylesheetText) {
  const printScope = normalizeStudentPrintQuarter(scope);
  const scopeLabel = getStudentPrintScopeLabel(printScope);
  const title = `${state.currentUser?.name || "Student"} - ${scopeLabel} Grade Report`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${stylesheetText}</style>
  <style>
    body {
      min-height: 100vh;
      padding: 24px;
      background:
        radial-gradient(circle at top right, rgba(102, 127, 109, 0.08), transparent 24%),
        linear-gradient(180deg, #fbf7f1, #f1e8dc);
    }

    .report-download-frame {
      width: min(980px, 100%);
      margin: 0 auto;
    }

    .student-print-actions {
      display: none !important;
    }

    @media print {
      body {
        padding: 0;
        background: #fff;
      }

      .report-download-frame {
        width: 100%;
        max-width: none;
      }
    }
  </style>
</head>
<body>
  <div id="app" data-student-print-quarter="${escapeHtml(printScope)}">
    <main class="report-download-frame">
      ${reportMarkup}
    </main>
  </div>
</body>
</html>`;
}

function formatAttendanceStatus(status) {
  return status === "present" ? "Present" : status === "absent" ? "Absent" : "Not Set";
}

function notify(message, type = "success") {
  state.notice = { message, type };
  render();
  window.clearTimeout(notify.timer);
  notify.timer = window.setTimeout(() => {
    state.notice = null;
    render();
  }, 2800);
}

function clearNotice() {
  window.clearTimeout(notify.timer);
  state.notice = null;
}

function isValidPassword(password) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10}$/.test(String(password || ""));
}

function getRandomIndex(max) {
  if (window.crypto && typeof window.crypto.getRandomValues === "function") {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return values[0] % max;
  }

  return Math.floor(Math.random() * max);
}

function shuffleCharacters(characters) {
  const shuffled = [...characters];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = getRandomIndex(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function generatePassword(length = 10) {
  const lowercase = "abcdefghjkmnpqrstuvwxyz";
  const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const allCharacters = `${lowercase}${uppercase}${digits}`;
  const characters = [
    lowercase[getRandomIndex(lowercase.length)],
    uppercase[getRandomIndex(uppercase.length)],
    digits[getRandomIndex(digits.length)]
  ];

  while (characters.length < length) {
    characters.push(allCharacters[getRandomIndex(allCharacters.length)]);
  }

  return shuffleCharacters(characters).join("");
}

function setupPasswordGenerators() {
  document.querySelectorAll("[data-generate-password-for]").forEach((button) => {
    button.addEventListener("click", () => {
      const inputId = button.getAttribute("data-generate-password-for");
      const passwordInput = inputId ? document.getElementById(inputId) : null;

      if (!passwordInput) {
        return;
      }

      passwordInput.value = generatePassword();
      passwordInput.setCustomValidity("");
      passwordInput.focus();
      passwordInput.select();
    });
  });
}

function getDashboardEndpoint() {
  if (!state.currentUser) return "";
  if (state.currentUser.role === "admin") return `/api/admin/dashboard?userId=${encodeURIComponent(state.currentUser.id)}`;
  if (state.currentUser.role === "teacher") return `/api/teacher/dashboard?teacherId=${encodeURIComponent(state.currentUser.id)}`;
  return `/api/student/dashboard?studentId=${encodeURIComponent(state.currentUser.id)}`;
}

async function refreshDashboard(preserveNotice = true) {
  if (!state.currentUser) return;

  if (!preserveNotice) {
    clearNotice();
  }

  state.loading = true;
  render();

  try {
    const payload = await api(getDashboardEndpoint());
    state.currentUser = payload.user;
    state.dashboard = payload.dashboard;
    state.systemStatus = {
      hasUsers: true,
      hasAdmin: true
    };
    setStoredUser(payload.user);

    if (state.currentUser.role === "teacher") {
      state.teacherQuarter = normalizeQuarter(state.teacherQuarter);
      const subjectStillExists = state.dashboard.subjects.some((subject) => subject.id === state.teacherFilter);
      if (!subjectStillExists) {
        state.teacherFilter = "";
      }
    }
  } finally {
    state.loading = false;
  }

  render();
}

async function loadPublicStatus() {
  const payload = await api("/api/public/status");
  state.systemStatus = payload;
}

async function boot() {
  state.loading = true;
  render();

  await loadPublicStatus();

  const storedUser = getStoredUser();
  if (!storedUser) {
    state.currentUser = null;
    state.dashboard = null;
    state.loading = false;
    render();
    return;
  }

  try {
    const payload = await api(`/api/users/${encodeURIComponent(storedUser.id)}`);
    state.currentUser = payload.user;
    await refreshDashboard();
  } catch (error) {
    setStoredUser(null);
    state.currentUser = null;
    state.dashboard = null;
    await loadPublicStatus();
    state.loading = false;
    render();
  }
}

function renderNotice() {
  if (!state.notice) {
    return `<div class="notice"></div>`;
  }

  return `<div class="notice show ${state.notice.type}">${escapeHtml(state.notice.message)}</div>`;
}

function renderLoading() {
  app.innerHTML = `
    <div class="loading-shell">
      <div class="loading-card card">
        <div class="brand-mark">CR</div>
        <small class="eyebrow">Class Record</small>
        <h2>Loading application...</h2>
        <p>Preparing your dashboard, records, and class tools.</p>
      </div>
    </div>
  `;
}

function renderLogin() {
  const isSetupMode = !state.systemStatus.hasAdmin;

  app.innerHTML = `
    <div class="login-shell">
      <div class="login-card">
        <section class="login-form">
          <div class="login-form-head">
            <div class="brand-mark">CR</div>
            <small class="eyebrow">${isSetupMode ? "First-Time Setup" : "Welcome Back"}</small>
            <h2>${isSetupMode ? "Create Admin" : "Sign In"}</h2>
            <p>${isSetupMode ? "Set up the first administrator account to unlock the system." : "Use your school account to continue to your dashboard."}</p>
          </div>
          ${renderNotice()}
          ${isSetupMode ? `
            <form id="setup-form" class="stack">
              <div class="field">
                <label for="setup-name">Admin Name</label>
                <input id="setup-name" name="name" placeholder="Enter full name" required>
              </div>
              <div class="field">
                <label for="setup-email">Email</label>
                <input id="setup-email" name="email" type="email" placeholder="Enter email" required>
              </div>
              <div class="field">
                <label for="setup-password">Password</label>
                <input id="setup-password" name="password" type="password" placeholder="Enter password" required minlength="10" maxlength="10" title="${PASSWORD_RULE_MESSAGE}">
              </div>
              <button class="primary-btn" type="submit">Create Admin Account</button>
            </form>
          ` : `
            <form id="login-form" class="stack">
              <div class="field">
                <label for="login-email">Email</label>
                <input id="login-email" name="email" type="email" placeholder="Enter email" required>
              </div>
              <div class="field">
                <label for="login-password">Password</label>
                <input id="login-password" name="password" type="password" placeholder="Enter password" required>
              </div>
              <button class="primary-btn" type="submit">Login</button>
            </form>
          `}
        </section>
      </div>
    </div>
  `;

  if (isSetupMode) {
    document.getElementById("setup-form").addEventListener("submit", handleSetupAdmin);
  } else {
    document.getElementById("login-form").addEventListener("submit", handleLogin);
  }
}

function renderShell(content) {
  app.innerHTML = `
    <div class="app-shell role-${escapeHtml(state.currentUser.role)}">
      <aside class="sidebar">
        <div class="sidebar-top">
          <div class="sidebar-brand">
            <div class="brand-mark">CR</div>
            <div>
              <small>Class Record</small>
              <strong>Academic Workspace</strong>
            </div>
          </div>

          <div class="sidebar-simple">
            <div class="role-pill">${escapeHtml(roleSummary(state.currentUser.role))}</div>
            <h1>${escapeHtml(roleTitle(state.currentUser.role))}</h1>
            <div class="sidebar-user">
              <strong>${escapeHtml(state.currentUser.name)}</strong>
              <p>${escapeHtml(state.currentUser.email)}</p>
            </div>
          </div>

          ${["admin", "teacher"].includes(state.currentUser.role) ? renderRoleQuickNav(state.currentUser.role) : ""}
          ${state.currentUser.role === "teacher" ? renderTeacherQuarterSwitcher() : ""}
        </div>

        <div class="sidebar-footer">
          <button class="secondary-btn" id="logout-btn">Logout</button>
        </div>
      </aside>

      <main class="content">
        <div class="content-inner">
          <section class="hero-panel">
            <div class="hero-copy">
              <small class="eyebrow">${escapeHtml(todayStamp())}</small>
              <h2>${escapeHtml(heroTitle(state.currentUser.role))}</h2>
              <p>${escapeHtml(heroDescription(state.currentUser.role))}</p>
            </div>
            <div class="hero-side">
              <div class="hero-note">${escapeHtml(roleSummary(state.currentUser.role))}</div>
              <div class="actions">
                <button class="secondary-btn" id="print-btn" data-print-hide="true">Print</button>
              </div>
            </div>
          </section>

          ${renderNotice()}
          <div class="content-stack">
            ${content}
          </div>
        </div>
      </main>
    </div>
  `;

  app.setAttribute("data-student-print-quarter", normalizeStudentPrintQuarter(state.studentPrintQuarter));
  document.getElementById("logout-btn").addEventListener("click", logout);
  document.getElementById("print-btn").addEventListener("click", handlePrintAction);
  document.querySelectorAll("[data-teacher-quarter]").forEach((button) => {
    button.addEventListener("click", handleTeacherQuarterChange);
  });
}

function renderAdminView() {
  const dashboard = state.dashboard;
  const accounts = Array.isArray(dashboard.accounts) ? dashboard.accounts : [];

  renderShell(`
    <section class="stats">
      <div class="stat-card"><small>Total Teachers</small><strong>${dashboard.metrics.teacherCount}</strong></div>
      <div class="stat-card"><small>Total Students</small><strong>${dashboard.metrics.studentCount}</strong></div>
      <div class="stat-card"><small>Total Subjects</small><strong>${dashboard.metrics.subjectCount}</strong></div>
      <div class="stat-card"><small>School Average</small><strong>${dashboard.metrics.schoolAverage.toFixed(2)}</strong></div>
    </section>

    <section class="grid">
      <article class="card span-6 admin-section" id="admin-add-teacher">
        <h3>Add Teacher</h3>
        <form id="add-teacher-form" class="form-grid">
          <div class="field"><label for="teacher-name">Full Name</label><input id="teacher-name" name="name" required></div>
          <div class="field"><label for="teacher-email">Email</label><input id="teacher-email" name="email" type="email" required></div>
          <div class="field full">
            <label for="teacher-password">Password</label>
            <div class="password-field">
              <input id="teacher-password" name="password" type="text" required minlength="10" maxlength="10" title="${PASSWORD_RULE_MESSAGE}">
              <button class="secondary-btn password-generate-btn" type="button" data-generate-password-for="teacher-password">Randomize</button>
            </div>
            <div class="muted password-help">Generate a ready-to-use password that matches the required format.</div>
          </div>
          <div class="field full"><button class="primary-btn" type="submit">Add Teacher</button></div>
        </form>
      </article>

      <article class="card span-6 admin-section" id="admin-add-student">
        <h3>Add Students</h3>
        <form id="add-student-form" class="form-grid">
          <div class="field"><label for="student-name">Full Name</label><input id="student-name" name="name" required></div>
          <div class="field"><label for="student-email">Email</label><input id="student-email" name="email" type="email" required></div>
          <div class="field">
            <label for="student-password">Password</label>
            <div class="password-field">
              <input id="student-password" name="password" type="text" required minlength="10" maxlength="10" title="${PASSWORD_RULE_MESSAGE}">
              <button class="secondary-btn password-generate-btn" type="button" data-generate-password-for="student-password">Randomize</button>
            </div>
            <div class="muted password-help">Generate a ready-to-use password that matches the required format.</div>
          </div>
          <div class="field">
            <label for="assigned-teacher">Assigned Teacher</label>
            <select id="assigned-teacher" name="teacherId">
              <option value="">Unassigned</option>
              ${dashboard.teachers.map((teacher) => `<option value="${teacher.id}">${escapeHtml(teacher.name)}</option>`).join("")}
            </select>
          </div>
          <div class="field full"><button class="primary-btn" type="submit">Add Student</button></div>
        </form>
      </article>

      <article class="card span-6 admin-section" id="admin-search-teacher">
        <div class="toolbar">
          <div>
            <h3>Search Teacher</h3>
          </div>
          <form class="toolbar-search" id="teacher-search-form">
            <label for="teacher-search">Search Teachers</label>
            <div class="search-controls">
              <input id="teacher-search" type="search" placeholder="Search teacher name or email" value="${escapeHtml(state.adminTeacherSearch)}">
              <button class="primary-btn" type="submit">Search</button>
              <button class="secondary-btn" type="button" id="teacher-search-clear">Clear</button>
            </div>
          </form>
        </div>
        <div class="stack teacher-list">
          ${dashboard.teachers.length ? dashboard.teachers.map((teacher) => `
            <div class="list-row" data-teacher-item data-search-text="${escapeHtml(getAdminUserSearchText(teacher, `${teacher.studentCount} student(s) ${teacher.subjectCount} subject(s)`))}">
              <div>
                <strong>${escapeHtml(teacher.name)}</strong>
                <div class="muted">${escapeHtml(teacher.email)}</div>
                <div class="muted">${teacher.studentCount} student(s), ${teacher.subjectCount} subject(s)</div>
              </div>
              <div class="inline-actions">
                <button class="danger-btn" type="button" data-delete-user="${teacher.id}">Delete</button>
              </div>
            </div>
          `).join("") : `<div class="empty-state">No teachers yet.</div>`}
          <div class="empty-state" id="teacher-search-empty" style="display:none;">No teachers match your search.</div>
        </div>
      </article>

      <article class="card span-6 admin-section" id="admin-search-student">
        <div class="toolbar">
          <div>
            <h3>Search Student</h3>
          </div>
          <form class="toolbar-search" id="student-search-form">
            <label for="student-search">Search Students</label>
            <div class="search-controls">
              <input id="student-search" type="search" placeholder="Search student name, email, or teacher" value="${escapeHtml(state.adminStudentSearch)}">
              <button class="primary-btn" type="submit">Search</button>
              <button class="secondary-btn" type="button" id="student-search-clear">Clear</button>
            </div>
          </form>
        </div>
        <div class="stack student-list">
          ${dashboard.students.length ? dashboard.students.map((student) => `
            <div class="list-row" data-student-item data-search-text="${escapeHtml(getAdminUserSearchText(student, `Teacher ${student.teacherName}`))}">
              <div>
                <strong>${escapeHtml(student.name)}</strong>
                <div class="muted">${escapeHtml(student.email)}</div>
                <div class="muted">Teacher: ${escapeHtml(student.teacherName)}</div>
              </div>
              <div class="inline-actions">
                <button class="danger-btn" type="button" data-delete-user="${student.id}">Delete</button>
              </div>
            </div>
          `).join("") : `<div class="empty-state">No students yet.</div>`}
          <div class="empty-state" id="student-search-empty" style="display:none;">No students match your search.</div>
        </div>
      </article>

      <article class="card span-12 admin-section" id="admin-all-accounts">
        <div class="toolbar">
          <div>
            <h3>All Accounts</h3>
            <p class="muted">${accounts.length ? "Admins can view and update the email and password of every account here." : "Account editing becomes available after the server is restarted with the latest code."}</p>
          </div>
          <form class="toolbar-search" id="account-search-form">
            <label for="account-search">Search Accounts</label>
            <div class="search-controls">
              <input id="account-search" type="search" placeholder="Search name, email, role, or details" value="${escapeHtml(state.adminAccountSearch)}">
              <button class="primary-btn" type="submit">Search</button>
              <button class="secondary-btn" type="button" id="account-search-clear">Clear</button>
            </div>
          </form>
        </div>
        <div class="stack account-list">
          ${accounts.length ? accounts.map((account) => `
            <div class="account-item" data-account-item data-search-text="${escapeHtml(getAccountSearchText(account))}">
              <form class="form-grid" data-account-form="${account.id}">
                <div class="field">
                  <label for="account-name-${account.id}">Name</label>
                  <input id="account-name-${account.id}" value="${escapeHtml(account.name)}" disabled>
                </div>
                <div class="field">
                  <label for="account-role-${account.id}">Role</label>
                  <input id="account-role-${account.id}" value="${escapeHtml(formatRoleLabel(account.role))}" disabled>
                </div>
                <div class="field">
                  <label for="account-details-${account.id}">Details</label>
                  <input id="account-details-${account.id}" value="${escapeHtml(getAccountAccessDetails(account))}" disabled>
                </div>
                <div class="field full">
                  <label for="account-email-${account.id}">Email</label>
                  <input id="account-email-${account.id}" name="email" type="email" value="${escapeHtml(account.email)}" required>
                </div>
                <div class="field">
                  <label for="account-password-${account.id}">Password</label>
                  <input id="account-password-${account.id}" name="password" type="text" value="${escapeHtml(account.password)}" required minlength="10" maxlength="10" title="${PASSWORD_RULE_MESSAGE}">
                </div>
                <div class="field full">
                  <button class="primary-btn" type="submit">Save Email and Password</button>
                </div>
              </form>
            </div>
          `).join("") : `<div class="empty-state">No accounts found yet in this server response.</div>`}
          <div class="empty-state" id="account-search-empty" style="display:none;">No accounts match your search.</div>
        </div>
      </article>
    </section>
  `);

  initializeQuickNav();
  document.getElementById("add-teacher-form").addEventListener("submit", handleAddTeacher);
  document.getElementById("add-student-form").addEventListener("submit", handleAddStudentAsAdmin);
  document.getElementById("teacher-search-form").addEventListener("submit", handleTeacherSearch);
  document.getElementById("teacher-search").addEventListener("input", applyTeacherSearchFilter);
  document.getElementById("teacher-search-clear").addEventListener("click", handleTeacherSearchClear);
  document.getElementById("student-search-form").addEventListener("submit", handleStudentSearch);
  document.getElementById("student-search").addEventListener("input", applyStudentSearchFilter);
  document.getElementById("student-search-clear").addEventListener("click", handleStudentSearchClear);
  document.getElementById("account-search-form").addEventListener("submit", handleAccountSearch);
  document.getElementById("account-search").addEventListener("input", applyAccountSearchFilter);
  document.getElementById("account-search-clear").addEventListener("click", handleAccountSearchClear);
  document.querySelectorAll("[data-account-form]").forEach((form) => {
    form.addEventListener("submit", handleUpdateUserCredentials);
  });
  setupPasswordGenerators();
  document.querySelectorAll("[data-delete-user]").forEach((button) => {
    button.addEventListener("click", handleDeleteUser);
  });
  applyTeacherSearchFilter();
  applyStudentSearchFilter();
  applyAccountSearchFilter();
}

function renderTeacherView() {
  const dashboard = state.dashboard;
  const selectedAttendanceDate = state.teacherAttendanceDate || new Date().toISOString().slice(0, 10);
  const selectedAttendanceRecords = dashboard.attendance.filter((record) => record.date === selectedAttendanceDate);
  const selectedAttendanceLookup = new Map(selectedAttendanceRecords.map((record) => [record.studentId, record]));
  const selectedAttendanceSummary = dashboard.students.reduce((summary, student) => {
    const currentAttendance = selectedAttendanceLookup.get(student.id);
    const status = currentAttendance ? currentAttendance.status : "present";
    if (status === "absent") {
      summary.absent += 1;
    } else {
      summary.present += 1;
    }
    return summary;
  }, { present: 0, absent: 0 });
  const activeQuarter = normalizeQuarter(state.teacherQuarter);
  const activeQuarterLabel = getQuarterLabel(activeQuarter);
  const groupedSubjects = groupItemsByQuarter(sortQuarterItems(dashboard.subjects));
  const activeSubjects = groupedSubjects[activeQuarter] || [];
  const gradeLookup = new Map(dashboard.grades.map((grade) => [`${grade.studentId}|${grade.subjectId}`, grade]));
  const quarterlyGradeSummaryLookup = new Map(
    dashboard.students.map((student) => [student.id, buildTeacherQuarterlyGradeSummary(student, activeSubjects, gradeLookup)])
  );
  const quarterlyStudentSummaries = dashboard.students.map((student) => ({
    student,
    summary: quarterlyGradeSummaryLookup.get(student.id)
  }));
  const quarterTransitionDirection = state.teacherQuarterTransitionDirection;
  const quarterTransitionPrimary = quarterTransitionDirection
    ? ` data-quarter-transition="${quarterTransitionDirection}" style="--teacher-quarter-delay: 0ms;"`
    : "";
  const quarterTransitionSecondary = quarterTransitionDirection
    ? ` data-quarter-transition="${quarterTransitionDirection}" style="--teacher-quarter-delay: 45ms;"`
    : "";
  const quarterTransitionTertiary = quarterTransitionDirection
    ? ` data-quarter-transition="${quarterTransitionDirection}" style="--teacher-quarter-delay: 90ms;"`
    : "";
  const quarterTransitionQuaternary = quarterTransitionDirection
    ? ` data-quarter-transition="${quarterTransitionDirection}" style="--teacher-quarter-delay: 135ms;"`
    : "";

  renderShell(`
    <section class="stats">
      <div class="stat-card"><small>My Students</small><strong>${dashboard.metrics.studentCount}</strong></div>
      <div class="stat-card"><small>My Subjects</small><strong>${dashboard.metrics.subjectCount}</strong></div>
      <div class="stat-card"><small>Assignment Scores</small><strong>${dashboard.metrics.assignmentScoreCount}</strong></div>
      <div class="stat-card"><small>Encoded Grades</small><strong>${dashboard.metrics.encodedGradeCount}</strong></div>
      <div class="stat-card"><small>Average Score</small><strong>${dashboard.metrics.averageScore.toFixed(2)}</strong></div>
      <div class="stat-card"><small>Attendance Entries</small><strong>${dashboard.metrics.attendanceCount}</strong></div>
    </section>

    <section class="grid">
      <article class="card span-4 admin-section" id="teacher-add-student">
        <h3>Add Student</h3>
        <form id="teacher-add-student-form" class="stack">
          <div class="field"><label for="teacher-student-name">Full Name</label><input id="teacher-student-name" name="name" required></div>
          <div class="field"><label for="teacher-student-email">Email</label><input id="teacher-student-email" name="email" type="email" required></div>
          <div class="field">
            <label for="teacher-student-password">Password</label>
            <div class="password-field">
              <input id="teacher-student-password" name="password" type="text" required minlength="10" maxlength="10" title="${PASSWORD_RULE_MESSAGE}">
              <button class="secondary-btn password-generate-btn" type="button" data-generate-password-for="teacher-student-password">Randomize</button>
            </div>
            <div class="muted password-help">Generate a ready-to-use password that matches the required format.</div>
          </div>
          <button class="primary-btn" type="submit">Add Student</button>
        </form>
      </article>

      <article class="card span-4 admin-section teacher-quarter-frame" id="teacher-add-subject"${quarterTransitionPrimary}>
        <h3>Add Subject</h3>
        <p class="muted">New subjects will be added to ${escapeHtml(activeQuarterLabel)}.</p>
        <form id="add-subject-form" class="stack">
          <input type="hidden" name="quarter" value="${activeQuarter}">
          <div class="field">
            <label for="subject-quarter-display">Quarter</label>
            <input id="subject-quarter-display" value="${escapeHtml(activeQuarterLabel)}" disabled>
          </div>
          <div class="field"><label for="subject-name">Subject Name</label><input id="subject-name" name="name" placeholder="Example: Science" required></div>
          <button class="primary-btn" type="submit">Add Subject</button>
        </form>
      </article>

      <article class="card span-4 teacher-quarter-frame"${quarterTransitionSecondary}>
        <h3>Quarterly Subjects</h3>
        <p class="muted">Showing the subjects for ${escapeHtml(activeQuarterLabel)}.</p>
        <div class="subject-list">
          <section class="quarter-subject-group">
            <div class="quarter-subject-title">
              <strong>${escapeHtml(activeQuarterLabel)}</strong>
              <span>${activeSubjects.length} subject(s)</span>
            </div>
            ${activeSubjects.length ? activeSubjects.map((subject) => `
              <div class="subject-chip">
                <strong>${escapeHtml(subject.name)}</strong>
                <div class="muted">${dashboard.students.length} assigned student(s)</div>
                <div class="inline-actions subject-actions">
                  <button class="danger-btn" type="button" data-delete-subject="${subject.id}">Delete</button>
                </div>
              </div>
            `).join("") : `<div class="empty-state">No subjects for ${escapeHtml(activeQuarterLabel)} yet.</div>`}
          </section>
        </div>
      </article>

      <article class="card span-12 admin-section teacher-quarter-frame" id="teacher-quarterly-overview"${quarterTransitionTertiary}>
        <div class="toolbar">
          <div>
            <h3>Quarterly Grades</h3>
            <p class="muted">A separate summary view for every student in ${escapeHtml(activeQuarterLabel)}.</p>
          </div>
          <div class="toolbar-tools">
            <div class="quarter-record-meta">
              <span>${dashboard.students.length} student(s)</span>
              <span>${activeSubjects.length} subject(s)</span>
            </div>
            <form class="toolbar-search" id="quarterly-search-form">
              <label for="quarterly-search">Search Quarterly Grades</label>
              <div class="search-controls">
                <input id="quarterly-search" type="search" placeholder="Search student in ${escapeHtml(activeQuarterLabel)}" value="${escapeHtml(state.teacherQuarterlySearch)}">
                <button class="primary-btn" type="submit">Search</button>
                <button class="secondary-btn" type="button" id="quarterly-search-clear">Clear</button>
              </div>
            </form>
          </div>
        </div>

        ${activeSubjects.length ? dashboard.students.length ? `
          <div class="teacher-quarterly-scroll">
          <div class="teacher-quarterly-grid">
            ${quarterlyStudentSummaries.map(({ student, summary }) => `
              <article class="teacher-quarterly-student-card" data-quarterly-card data-search-text="${escapeHtml(`${student.name} ${student.id} ${activeQuarterLabel} ${summary.remarks} ${summary.progressLabel} ${summary.transmutedQuarterlyGrade ?? ""} ${summary.descriptor.text}`)}">
                <div class="teacher-quarterly-card-head">
                  <div class="teacher-quarterly-student-copy">
                    <h4>${escapeHtml(student.name)}</h4>
                    <p class="muted teacher-quarterly-card-subtitle">${escapeHtml(summary.progressLabel)}</p>
                  </div>
                  <div class="teacher-quarterly-score-grid">
                    <div class="teacher-quarterly-score">
                      <span>Raw Grade</span>
                      <strong>${summary.quarterlyAverage !== null ? summary.quarterlyAverage.toFixed(2) : "--"}</strong>
                    </div>
                    <div class="teacher-quarterly-score">
                      <span>Transmuted</span>
                      <strong>${summary.transmutedQuarterlyGrade !== null ? summary.transmutedQuarterlyGrade : "--"}</strong>
                    </div>
                    <div class="teacher-quarterly-score">
                      <span>Letter Grade</span>
                      <strong>${summary.descriptor.letter || "--"}</strong>
                    </div>
                  </div>
                </div>

                <div class="teacher-quarterly-card-meta">
                  <div>
                    <span>Subjects</span>
                    <strong>${summary.gradedSubjectCount}/${summary.subjectCount}</strong>
                  </div>
                  <div>
                    <span>Remaining</span>
                    <strong>${summary.remainingSubjectCount}</strong>
                  </div>
                  <div>
                    <span>Latest Update</span>
                    <strong>${escapeHtml(summary.latestUpdatedAt ? formatCompactDateTime(summary.latestUpdatedAt) : "Pending")}</strong>
                  </div>
                </div>

                <div class="teacher-quarterly-card-footer">
                  ${summary.transmutedQuarterlyGrade !== null
                    ? `<span class="badge ${summary.transmutedQuarterlyGrade >= PASSING_GRADE ? "good" : "warn"}">${escapeHtml(summary.remarks)}</span>`
                    : `<span class="badge warn">Pending</span>`}
                  <span class="quarter-grade-descriptor-badge">${escapeHtml(summary.descriptor.text)}</span>
                  <p class="muted">${escapeHtml(summary.remainingSubjectCount ? `${summary.remainingSubjectCount} subject(s) still missing.` : "All subjects graded.")}</p>
                </div>
              </article>
            `).join("")}
          </div>
          </div>
          <div class="empty-state" id="quarterly-search-empty" style="display:none;">No quarterly grade summaries match your search in ${escapeHtml(activeQuarterLabel)}.</div>
        ` : `
          <div class="empty-state">Add at least one student assigned to you before reviewing ${escapeHtml(activeQuarterLabel.toLowerCase())} quarterly grades.</div>
        ` : `
          <div class="empty-state">Add a subject for ${escapeHtml(activeQuarterLabel)} to generate quarterly grades for every student.</div>
        `}
      </article>

      <article class="card span-12 admin-section teacher-quarter-frame" id="teacher-class-record"${quarterTransitionQuaternary}>
        <div class="toolbar">
          <div>
            <h3>Class Record</h3>
            <p class="muted">Showing the class record for ${escapeHtml(activeQuarterLabel)}. Switch quarters from the sidebar.</p>
          </div>
          <div class="toolbar-tools">
            ${activeSubjects.length && dashboard.students.length ? `
              <button class="primary-btn" type="button" id="save-all-grades">Save All Grades</button>
            ` : ""}
            <form class="toolbar-search" id="grade-search-form">
              <label for="grade-search">Search Class Record</label>
              <div class="search-controls">
                <input id="grade-search" type="search" placeholder="Search student or subject in ${escapeHtml(activeQuarterLabel)}" value="${escapeHtml(state.teacherGradeSearch)}">
                <button class="primary-btn" type="submit">Search</button>
                <button class="secondary-btn" type="button" id="grade-search-clear">Clear</button>
              </div>
            </form>
          </div>
        </div>

        <div class="quarter-record-list">
          <section class="quarter-record-card">
            <div class="quarter-record-head">
              <div>
                <small class="eyebrow">Quarterly Record</small>
                <h4>${escapeHtml(activeQuarterLabel)}</h4>
              </div>
              <div class="quarter-record-meta">
                <span>${activeSubjects.length} subject(s)</span>
                <span>${dashboard.students.length} student(s)</span>
              </div>
            </div>

            ${activeSubjects.length ? dashboard.students.length ? `
              <div class="table-wrap teacher-grade-table quarter-grade-table">
                <table class="quarter-grade-matrix">
                  <colgroup>
                    <col class="quarter-grade-col quarter-grade-col-student">
                    <col class="quarter-grade-col quarter-grade-col-subject">
                    <col class="quarter-grade-col quarter-grade-col-assignment">
                    <col class="quarter-grade-col quarter-grade-col-missed-assignment">
                    <col class="quarter-grade-col quarter-grade-col-quiz">
                    <col class="quarter-grade-col quarter-grade-col-missed-quiz">
                    <col class="quarter-grade-col quarter-grade-col-exam">
                    <col class="quarter-grade-col quarter-grade-col-average">
                    <col class="quarter-grade-col quarter-grade-col-remarks">
                    <col class="quarter-grade-col quarter-grade-col-updated">
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Subject</th>
                      <th><span>Assignment</span><span>Score</span></th>
                      <th><span>Missed</span><span>Assignments</span></th>
                      <th>Quiz</th>
                      <th><span>Missed</span><span>Quizzes</span></th>
                      <th>Exam</th>
                      <th>Average</th>
                      <th>Remarks</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${dashboard.students.map((student) => activeSubjects.map((subject) => {
                      const grade = gradeLookup.get(`${student.id}|${subject.id}`);
                      const gradeValue = grade ? computeGrade(grade.quiz, grade.exam, grade.assignmentScore) : 0;
                      return `
                        <tr data-grade-row data-search-text="${escapeHtml(`${student.name} ${subject.name} ${activeQuarterLabel} ${student.id} ${subject.id}`)}">
                          <td class="quarter-grade-student-cell">${escapeHtml(student.name)}</td>
                          <td class="quarter-grade-subject-cell">
                            <strong>${escapeHtml(subject.name)}</strong>
                            <div class="muted">${escapeHtml(activeQuarterLabel)}</div>
                          </td>
                          <td class="quarter-grade-input-cell"><input type="number" min="0" max="100" step="0.01" data-grade-input="assignmentScore" data-student-id="${student.id}" data-subject-id="${subject.id}" value="${grade && grade.assignmentScore !== null ? grade.assignmentScore : ""}"></td>
                          <td class="quarter-grade-input-cell"><input type="number" min="0" step="1" data-grade-input="missedAssignmentCount" data-student-id="${student.id}" data-subject-id="${subject.id}" value="${grade && Number.isInteger(grade.missedAssignmentCount) ? grade.missedAssignmentCount : 0}"></td>
                          <td class="quarter-grade-input-cell"><input type="number" min="0" max="100" step="0.01" data-grade-input="quiz" data-student-id="${student.id}" data-subject-id="${subject.id}" value="${grade ? grade.quiz : ""}"></td>
                          <td class="quarter-grade-input-cell"><input type="number" min="0" step="1" data-grade-input="missedQuizCount" data-student-id="${student.id}" data-subject-id="${subject.id}" value="${grade && Number.isInteger(grade.missedQuizCount) ? grade.missedQuizCount : 0}"></td>
                          <td class="quarter-grade-input-cell"><input type="number" min="0" max="100" step="0.01" data-grade-input="exam" data-student-id="${student.id}" data-subject-id="${subject.id}" value="${grade ? grade.exam : ""}"></td>
                          <td class="quarter-grade-average-cell">${grade ? gradeValue.toFixed(2) : "--"}</td>
                          <td class="quarter-grade-remarks-cell">${grade ? `<span class="badge ${gradeValue >= PASSING_GRADE ? "good" : "warn"}">${escapeHtml(getRemarks(gradeValue))}</span>` : `<span class="muted">Not yet graded</span>`}</td>
                          <td class="quarter-grade-updated-cell">${escapeHtml(grade ? formatCompactDateTime(grade.updatedAt) : "Pending")}</td>
                        </tr>
                      `;
                    }).join("")).join("")}
                  </tbody>
                </table>
              </div>
            ` : `
              <div class="empty-state">Add at least one student assigned to you before encoding ${escapeHtml(activeQuarterLabel.toLowerCase())} grades.</div>
            ` : `
              <div class="empty-state">Add a subject for ${escapeHtml(activeQuarterLabel)} to start encoding grades.</div>
            `}
          </section>
        </div>
        <div class="empty-state" id="grade-search-empty" style="display:none;">No class record entries match your search in ${escapeHtml(activeQuarterLabel)}.</div>
      </article>

      <article class="card span-12 admin-section" id="teacher-attendance">
        <div class="toolbar attendance-toolbar">
          <div class="attendance-heading">
            <span class="section-kicker">Daily Check</span>
            <h3>Attendance</h3>
            <p class="muted">Mark everyone for ${escapeHtml(formatDate(selectedAttendanceDate))} and save the class in one action.</p>
          </div>
          <div class="toolbar-tools">
            <div class="toolbar-field">
              <label for="attendance-date">Date</label>
              <input id="attendance-date" type="date" value="${escapeHtml(selectedAttendanceDate)}">
            </div>
            <form class="toolbar-search" id="attendance-search-form">
              <label for="attendance-search">Search Attendance</label>
              <div class="search-controls">
                <input id="attendance-search" type="search" placeholder="Search student name" value="${escapeHtml(state.teacherAttendanceSearch)}">
                <button class="primary-btn" type="submit">Search</button>
                <button class="secondary-btn" type="button" id="attendance-search-clear">Clear</button>
              </div>
            </form>
          </div>
        </div>

        ${dashboard.students.length ? `
          <div class="attendance-overview">
            <div class="attendance-overview-card is-present">
              <span>Present</span>
              <strong id="attendance-present-count">${selectedAttendanceSummary.present}</strong>
            </div>
            <div class="attendance-overview-card is-absent">
              <span>Absent</span>
              <strong id="attendance-absent-count">${selectedAttendanceSummary.absent}</strong>
            </div>
            <div class="attendance-overview-card">
              <span>Recorded Today</span>
              <strong>${selectedAttendanceRecords.length}/${dashboard.students.length}</strong>
            </div>
            <div class="attendance-actions">
              <button class="secondary-btn" type="button" id="mark-all-present">Mark All Present</button>
              <button class="secondary-btn" type="button" id="mark-all-absent">Mark All Absent</button>
              <button class="primary-btn" type="button" id="save-all-attendance">Save Attendance</button>
            </div>
          </div>

          <div class="teacher-attendance-list">
            ${dashboard.students.map((student) => {
              const currentAttendance = selectedAttendanceLookup.get(student.id);
              const currentStatus = currentAttendance ? currentAttendance.status : "present";
              return `
                <div class="attendance-student-card ${currentStatus === "absent" ? "is-absent" : "is-present"}" data-attendance-row data-search-text="${escapeHtml(`${student.name} ${student.id} ${student.email || ""}`)}">
                  <div class="attendance-student-main">
                    <div>
                      <strong>${escapeHtml(student.name)}</strong>
                      <div class="muted">${escapeHtml(student.email || student.id)}</div>
                    </div>
                    <span class="badge ${currentStatus === "absent" ? "warn" : "good"}" data-attendance-badge="${student.id}">${escapeHtml(formatAttendanceStatus(currentStatus))}</span>
                  </div>
                  <div class="attendance-student-controls">
                    <label class="attendance-status-option ${currentStatus === "present" ? "is-selected" : ""}">
                      <input type="radio" name="attendance-${student.id}" value="present" data-attendance-status="${student.id}" ${currentStatus === "present" ? "checked" : ""}>
                      <span>Present</span>
                    </label>
                    <label class="attendance-status-option ${currentStatus === "absent" ? "is-selected" : ""}">
                      <input type="radio" name="attendance-${student.id}" value="absent" data-attendance-status="${student.id}" ${currentStatus === "absent" ? "checked" : ""}>
                      <span>Absent</span>
                    </label>
                  </div>
                  <div class="attendance-student-meta">
                    <span><strong>${student.presentCount}</strong> Present total</span>
                    <span><strong>${student.absentCount}</strong> Absent total</span>
                    <span>${currentAttendance ? `Updated ${escapeHtml(formatCompactDateTime(currentAttendance.updatedAt))}` : "Ready to save"}</span>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
          <div class="empty-state" id="attendance-search-empty" style="display:none;">No attendance entries match your search.</div>
        ` : `
          <div class="empty-state">Add at least one student assigned to you.</div>
        `}
      </article>
    </section>
  `);

  initializeQuickNav();
  document.getElementById("teacher-add-student-form").addEventListener("submit", handleAddStudentAsTeacher);
  document.getElementById("add-subject-form").addEventListener("submit", handleAddSubject);
  setupPasswordGenerators();
  if (document.getElementById("grade-search-form")) {
    document.getElementById("grade-search-form").addEventListener("submit", handleGradeSearch);
    document.getElementById("grade-search").addEventListener("input", applyGradeSearchFilter);
    document.getElementById("grade-search-clear").addEventListener("click", handleGradeSearchClear);
  }
  if (document.getElementById("quarterly-search-form")) {
    document.getElementById("quarterly-search-form").addEventListener("submit", handleQuarterlySearch);
    document.getElementById("quarterly-search").addEventListener("input", applyQuarterlySearchFilter);
    document.getElementById("quarterly-search-clear").addEventListener("click", handleQuarterlySearchClear);
  }
  document.getElementById("attendance-date").addEventListener("change", (event) => {
    state.teacherAttendanceDate = event.target.value;
    render();
  });
  if (document.getElementById("attendance-search-form")) {
    document.getElementById("attendance-search-form").addEventListener("submit", handleAttendanceSearch);
    document.getElementById("attendance-search").addEventListener("input", applyAttendanceSearchFilter);
    document.getElementById("attendance-search-clear").addEventListener("click", handleAttendanceSearchClear);
  }
  document.querySelectorAll("[data-delete-subject]").forEach((button) => {
    button.addEventListener("click", handleDeleteSubject);
  });
  if (document.getElementById("save-all-grades")) {
    document.getElementById("save-all-grades").addEventListener("click", handleSaveAllGrades);
  }
  if (document.getElementById("save-all-attendance")) {
    document.getElementById("save-all-attendance").addEventListener("click", handleSaveAllAttendance);
  }
  if (document.getElementById("mark-all-present")) {
    document.getElementById("mark-all-present").addEventListener("click", () => markAllAttendance("present"));
  }
  if (document.getElementById("mark-all-absent")) {
    document.getElementById("mark-all-absent").addEventListener("click", () => markAllAttendance("absent"));
  }
  document.querySelectorAll("[data-attendance-status]").forEach((input) => {
    input.addEventListener("change", updateAttendanceSelectionState);
  });
  applyQuarterlySearchFilter();
  applyGradeSearchFilter();
  applyAttendanceSearchFilter();
  state.teacherQuarterTransitionDirection = "";
}

function renderStudentView() {
  const dashboard = state.dashboard;
  const groupedRecords = groupItemsByQuarter(sortQuarterItems(dashboard.records));
  const selectedPrintQuarter = normalizeStudentPrintQuarter(state.studentPrintQuarter);
  const selectedPrintLabel = getStudentPrintScopeLabel(selectedPrintQuarter);
  const hasGradeRecords = dashboard.records.length > 0;
  const overallTransmutedGrade = hasGradeRecords ? transmuteGrade(dashboard.metrics.overallAverage) : null;
  const overallDescriptor = getGradeDescriptor(overallTransmutedGrade);

  renderShell(`
    <section class="grade-summary student-grade-summary">
      <div class="grade-card"><small>Transmuted Grade</small><strong>${overallTransmutedGrade !== null ? overallTransmutedGrade : "--"}</strong></div>
      <div class="grade-card"><small>Letter Grade</small><strong>${overallDescriptor.letter || "--"}</strong></div>
      <div class="grade-card"><small>Present</small><strong>${dashboard.metrics.presentCount}</strong></div>
      <div class="grade-card"><small>Absent</small><strong>${dashboard.metrics.absentCount}</strong></div>
    </section>

    <section class="card student-report-card student-print-main">
      <div class="student-report-head">
        <div>
          <small class="eyebrow">Printable Grade Report</small>
          <h3>My Quarterly Grades</h3>
          <p class="muted">A quarter-by-quarter summary of your transmuted grades and letter grades for easier review and printing.</p>
        </div>
        <div class="student-report-meta">
          <div><span>Student</span><strong>${escapeHtml(state.currentUser.name)}</strong></div>
          <div><span>Adviser</span><strong>${escapeHtml(dashboard.teacherName || "Unassigned")}</strong></div>
          <div><span>Print Scope</span><strong>${escapeHtml(selectedPrintLabel)}</strong></div>
          <div><span>Date</span><strong>${escapeHtml(todayStamp())}</strong></div>
        </div>
      </div>
      ${dashboard.records.length ? `
        <div class="student-quarter-stack">
          ${QUARTER_ORDER.map((quarter) => {
            const quarterLabel = getQuarterLabel(quarter);
            const quarterRecords = groupedRecords[quarter];

            return `
              <section class="student-quarter-section" data-quarter="${quarter}">
                <div class="student-quarter-header">
                  <div>
                    <small class="eyebrow">Quarter</small>
                    <h4>${escapeHtml(quarterLabel)}</h4>
                  </div>
                  <div class="student-quarter-meta">${quarterRecords.length} subject(s)</div>
                </div>

                ${quarterRecords.length ? `
                  <div class="subject-report-list">
                    ${quarterRecords.map((record) => {
                      const transmutedGrade = transmuteGrade(record.average);
                      const descriptor = getGradeDescriptor(transmutedGrade);
                      return `
                        <article class="subject-report-card-item student-grade-display-card">
                          <div class="subject-report-top">
                            <div class="subject-report-heading">
                              <small class="subject-report-label">Subject</small>
                              <h4>${escapeHtml(record.subjectName)}</h4>
                              <p class="muted">Teacher: ${escapeHtml(record.teacherName)}</p>
                            </div>
                            <div class="student-grade-result-grid">
                              <div class="subject-report-result">
                                <small>Transmuted Grade</small>
                                <strong>${transmutedGrade}</strong>
                              </div>
                              <div class="subject-report-result">
                                <small>Letter Grade</small>
                                <strong>${escapeHtml(descriptor.letter || "--")}</strong>
                              </div>
                            </div>
                          </div>

                          <div class="subject-report-footer">
                            <div class="subject-report-notes">
                              <div><span>Missed Assignments</span><strong>${Number.isInteger(record.missedAssignmentCount) ? record.missedAssignmentCount : 0}</strong></div>
                              <div><span>Missed Quizzes</span><strong>${Number.isInteger(record.missedQuizCount) ? record.missedQuizCount : 0}</strong></div>
                            </div>
                          </div>
                        </article>
                      `;
                    }).join("")}
                  </div>
                ` : `
                  <div class="empty-state">No grades posted for ${escapeHtml(quarterLabel)} yet.</div>
                `}
              </section>
            `;
          }).join("")}
        </div>
      ` : `<div class="empty-state">Your teacher has not added grades yet.</div>`}
      <div class="actions card-actions student-print-actions">
        <div class="toolbar-field print-scope-field">
          <label for="student-print-scope">Print Scope</label>
          <select id="student-print-scope">
            <option value="all" ${selectedPrintQuarter === "all" ? "selected" : ""}>All Quarters</option>
            ${QUARTER_ORDER.map((quarter) => `<option value="${quarter}" ${selectedPrintQuarter === quarter ? "selected" : ""}>${escapeHtml(getQuarterLabel(quarter))}</option>`).join("")}
          </select>
        </div>
        <button class="secondary-btn" id="student-download-report" type="button">Download Report</button>
        <button class="primary-btn" id="student-print" type="button">Print ${escapeHtml(selectedPrintLabel)}</button>
      </div>
    </section>

    <section class="card section-gap student-attendance-card">
      <h3>Attendance Record</h3>
      ${dashboard.attendance.length ? `
        <div class="report-list">
          ${dashboard.attendance.map((record) => `
            <div class="report-item">
              <div>
                <strong>${escapeHtml(record.date)}</strong>
                <div class="muted">Updated: ${escapeHtml(formatDate(record.updatedAt))}</div>
              </div>
              <div>
                <div class="badge ${record.status === "present" ? "good" : "warn"}">${escapeHtml(formatAttendanceStatus(record.status))}</div>
              </div>
            </div>
          `).join("")}
        </div>
      ` : `<div class="empty-state">No attendance records yet.</div>`}
    </section>
  `);

  document.getElementById("student-print-scope").addEventListener("change", handleStudentPrintScopeChange);
  document.getElementById("student-download-report").addEventListener("click", handleStudentReportDownload);
  document.getElementById("student-print").addEventListener("click", handlePrintAction);
}

function render() {
  if (state.loading) {
    renderLoading();
    return;
  }

  if (!state.currentUser) {
    renderLogin();
    return;
  }

  if (state.currentUser.role === "admin") {
    renderAdminView();
    return;
  }

  if (state.currentUser.role === "teacher") {
    renderTeacherView();
    return;
  }

  renderStudentView();
}

function handlePrintAction() {
  if (state.currentUser && state.currentUser.role === "student") {
    app.setAttribute("data-student-print-quarter", normalizeStudentPrintQuarter(state.studentPrintQuarter));
  }

  window.print();
}

async function handleStudentReportDownload() {
  const reportCard = document.querySelector(".student-print-main");
  if (!reportCard || !state.currentUser || state.currentUser.role !== "student") {
    notify("The student report is not ready to download yet.", "error");
    return;
  }

  const scope = normalizeStudentPrintQuarter(state.studentPrintQuarter);
  const exportCard = reportCard.cloneNode(true);
  const actionBar = exportCard.querySelector(".student-print-actions");
  if (actionBar) {
    actionBar.remove();
  }

  if (scope !== "all") {
    exportCard.querySelectorAll(".student-quarter-section").forEach((section) => {
      if (section.getAttribute("data-quarter") !== scope) {
        section.remove();
      }
    });
  }

  try {
    const stylesheetText = await getStudentReportStylesheetText();
    const documentHtml = buildStudentReportDownloadHtml(exportCard.outerHTML, scope, stylesheetText);
    const fileDate = new Date().toISOString().slice(0, 10);
    const scopeSlug = sanitizeFileNamePart(scope === "all" ? "all-quarters" : getQuarterLabel(scope));
    const studentSlug = sanitizeFileNamePart(state.currentUser.name);
    const downloadUrl = URL.createObjectURL(new Blob([documentHtml], { type: "text/html;charset=utf-8" }));
    const downloadLink = document.createElement("a");

    downloadLink.href = downloadUrl;
    downloadLink.download = `${studentSlug}-${scopeSlug}-grade-report-${fileDate}.html`;
    document.body.append(downloadLink);
    downloadLink.click();
    downloadLink.remove();

    window.setTimeout(() => {
      URL.revokeObjectURL(downloadUrl);
    }, 1000);

    notify("Report downloaded. You can open it and print or save it as PDF.");
  } catch (error) {
    notify("Unable to download the report right now.", "error");
  }
}

function handleStudentPrintScopeChange(event) {
  state.studentPrintQuarter = normalizeStudentPrintQuarter(event.target.value);
  render();
}

async function handleLogin(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);

  try {
    const payload = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        email: formData.get("email"),
        password: formData.get("password")
      })
    });

    state.currentUser = payload.user;
    setStoredUser(payload.user);
    await refreshDashboard(false);
  } catch (error) {
    notify(error.message, "error");
  }
}

async function handleSetupAdmin(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const password = String(formData.get("password") || "");

  if (!isValidPassword(password)) {
    notify(PASSWORD_RULE_MESSAGE, "error");
    return;
  }

  try {
    const payload = await api("/api/setup-admin", {
      method: "POST",
      body: JSON.stringify({
        name: formData.get("name"),
        email: formData.get("email"),
        password
      })
    });

    state.currentUser = payload.user;
    state.systemStatus = {
      hasUsers: true,
      hasAdmin: true
    };
    setStoredUser(payload.user);
    await refreshDashboard(false);
    notify("Admin account created.");
  } catch (error) {
    notify(error.message, "error");
  }
}

function logout() {
  setStoredUser(null);
  state.currentUser = null;
  state.dashboard = null;
  state.teacherFilter = "";
  state.teacherQuarterlySearch = "";
  state.teacherQuarter = "first";
  state.teacherQuarterTransitionDirection = "";
  state.studentPrintQuarter = "all";
  clearNotice();
  render();
}

async function handleAddTeacher(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const password = String(formData.get("password") || "");

  if (!isValidPassword(password)) {
    notify(PASSWORD_RULE_MESSAGE, "error");
    return;
  }

  try {
    await api("/api/users", {
      method: "POST",
      body: JSON.stringify({
        actorId: state.currentUser.id,
        role: "teacher",
        name: formData.get("name"),
        email: formData.get("email"),
        password
      })
    });

    await refreshDashboard(false);
    notify("Teacher account created.");
  } catch (error) {
    notify(error.message, "error");
  }
}

async function handleAddStudentAsAdmin(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const password = String(formData.get("password") || "");

  if (!isValidPassword(password)) {
    notify(PASSWORD_RULE_MESSAGE, "error");
    return;
  }

  try {
    await api("/api/users", {
      method: "POST",
      body: JSON.stringify({
        actorId: state.currentUser.id,
        role: "student",
        name: formData.get("name"),
        email: formData.get("email"),
        password,
        teacherId: formData.get("teacherId") || null
      })
    });

    await refreshDashboard(false);
    notify("Student account created.");
  } catch (error) {
    notify(error.message, "error");
  }
}

async function handleAddStudentAsTeacher(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const password = String(formData.get("password") || "");

  if (!isValidPassword(password)) {
    notify(PASSWORD_RULE_MESSAGE, "error");
    return;
  }

  try {
    await api("/api/users", {
      method: "POST",
      body: JSON.stringify({
        actorId: state.currentUser.id,
        role: "student",
        name: formData.get("name"),
        email: formData.get("email"),
        password
      })
    });

    await refreshDashboard(false);
    notify("Student added to your class.");
  } catch (error) {
    notify(error.message, "error");
  }
}

async function handleDeleteUser(event) {
  const userId = event.currentTarget.getAttribute("data-delete-user");
  const shouldDelete = window.confirm("Delete this user? Linked subjects and grades may also be removed.");
  if (!shouldDelete) return;

  try {
    await api(`/api/users/${encodeURIComponent(userId)}?actorId=${encodeURIComponent(state.currentUser.id)}`, {
      method: "DELETE"
    });

    await refreshDashboard(false);
    notify("User deleted.");
  } catch (error) {
    notify(error.message, "error");
  }
}

async function handleUpdateUserCredentials(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const userId = form.getAttribute("data-account-form");
  const formData = new FormData(form);
  const password = String(formData.get("password") || "");
  const passwordInput = form.querySelector("[name='password']");

  if (!form.reportValidity()) {
    return;
  }

  passwordInput.setCustomValidity("");
  if (!isValidPassword(password)) {
    passwordInput.setCustomValidity(PASSWORD_RULE_MESSAGE);
    passwordInput.reportValidity();
    passwordInput.setCustomValidity("");
    return;
  }

  try {
    await api(`/api/users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      body: JSON.stringify({
        actorId: state.currentUser.id,
        email: formData.get("email"),
        password
      })
    });

    await refreshDashboard(false);
    notify("Account credentials updated.");
  } catch (error) {
    notify(error.message, "error");
  }
}

async function handleAddSubject(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const quarter = normalizeQuarter(formData.get("quarter"));

  try {
    await api("/api/subjects", {
      method: "POST",
      body: JSON.stringify({
        actorId: state.currentUser.id,
        name: formData.get("name"),
        quarter
      })
    });

    await refreshDashboard(false);
    notify(`${getQuarterLabel(quarter)} subject created.`);
  } catch (error) {
    notify(error.message, "error");
  }
}

function handleTeacherQuarterChange(event) {
  const quarter = normalizeQuarter(event.currentTarget.getAttribute("data-teacher-quarter"));
  const currentQuarter = normalizeQuarter(state.teacherQuarter);
  if (quarter === currentQuarter) {
    return;
  }

  state.teacherQuarterTransitionDirection = getQuarterTransitionDirection(currentQuarter, quarter);
  state.teacherQuarter = quarter;
  render();
}

async function handleDeleteSubject(event) {
  const subjectId = event.currentTarget.getAttribute("data-delete-subject");
  const shouldDelete = window.confirm("Delete this subject? Related grades will also be removed.");
  if (!shouldDelete) return;

  try {
    await api(`/api/subjects/${encodeURIComponent(subjectId)}?actorId=${encodeURIComponent(state.currentUser.id)}`, {
      method: "DELETE"
    });

    if (state.teacherFilter === subjectId) {
      state.teacherFilter = "";
    }

    await refreshDashboard(false);
    notify("Subject deleted.");
  } catch (error) {
    notify(error.message, "error");
  }
}

function getGradePayloadFromRow(row) {
  const assignmentInput = row.querySelector('[data-grade-input="assignmentScore"]');
  const missedAssignmentInput = row.querySelector('[data-grade-input="missedAssignmentCount"]');
  const quizInput = row.querySelector('[data-grade-input="quiz"]');
  const missedQuizInput = row.querySelector('[data-grade-input="missedQuizCount"]');
  const examInput = row.querySelector('[data-grade-input="exam"]');

  if (!assignmentInput || !quizInput || !examInput) {
    return { error: "A grade row is missing required inputs." };
  }

  const studentId = assignmentInput.getAttribute("data-student-id");
  const subjectId = assignmentInput.getAttribute("data-subject-id");
  const studentName = row.querySelector(".quarter-grade-student-cell")?.textContent?.trim() || "Student";
  const subjectName = row.querySelector(".quarter-grade-subject-cell strong")?.textContent?.trim() || "Subject";
  const assignmentRaw = assignmentInput.value.trim();
  const missedAssignmentRaw = missedAssignmentInput ? missedAssignmentInput.value.trim() : "0";
  const quizRaw = quizInput.value.trim();
  const missedQuizRaw = missedQuizInput ? missedQuizInput.value.trim() : "0";
  const examRaw = examInput.value.trim();
  const hasScoreValue = assignmentRaw !== "" || quizRaw !== "" || examRaw !== "";
  const hasMissedValue = Number(missedAssignmentRaw || "0") !== 0 || Number(missedQuizRaw || "0") !== 0;

  if (!hasScoreValue && !hasMissedValue) {
    return { skip: true };
  }

  const assignmentScore = Number(assignmentRaw);
  const missedAssignmentCount = Number(missedAssignmentRaw);
  const quiz = Number(quizRaw);
  const missedQuizCount = Number(missedQuizRaw);
  const exam = Number(examRaw);

  if (
    assignmentRaw === "" ||
    quizRaw === "" ||
    examRaw === "" ||
    !Number.isFinite(assignmentScore) ||
    !Number.isInteger(missedAssignmentCount) ||
    !Number.isFinite(quiz) ||
    !Number.isInteger(missedQuizCount) ||
    !Number.isFinite(exam) ||
    assignmentScore < 0 ||
    assignmentScore > 100 ||
    missedAssignmentCount < 0 ||
    quiz < 0 ||
    quiz > 100 ||
    missedQuizCount < 0 ||
    exam < 0 ||
    exam > 100
  ) {
    return {
      error: `Enter valid assignment, quiz, and exam scores from 0 to 100 for ${studentName} in ${subjectName}, and use 0 or more for missed assignments and missed quizzes.`
    };
  }

  return {
    payload: {
      studentId,
      subjectId,
      assignmentScore,
      missedAssignmentCount,
      quiz,
      missedQuizCount,
      exam
    }
  };
}

async function handleSaveAllGrades() {
  const rows = Array.from(document.querySelectorAll("[data-grade-row]"));
  const gradePayloads = [];

  for (const row of rows) {
    const result = getGradePayloadFromRow(row);
    if (result.skip) {
      continue;
    }

    if (result.error) {
      notify(result.error, "error");
      return;
    }

    gradePayloads.push(result.payload);
  }

  if (!gradePayloads.length) {
    notify("Enter at least one complete grade row before saving.", "error");
    return;
  }

  try {
    await api("/api/grades", {
      method: "PUT",
      body: JSON.stringify({
        actorId: state.currentUser.id,
        grades: gradePayloads
      })
    });

    await refreshDashboard(false);
    notify(`${gradePayloads.length} grade entr${gradePayloads.length === 1 ? "y" : "ies"} saved.`);
  } catch (error) {
    notify(error.message, "error");
  }
}

function updateAttendanceSelectionState() {
  const checkedInputs = Array.from(document.querySelectorAll("[data-attendance-status]:checked"));
  const summary = checkedInputs.reduce((counts, input) => {
    if (input.value === "absent") {
      counts.absent += 1;
    } else {
      counts.present += 1;
    }
    return counts;
  }, { present: 0, absent: 0 });

  const presentCount = document.getElementById("attendance-present-count");
  const absentCount = document.getElementById("attendance-absent-count");
  if (presentCount) {
    presentCount.textContent = summary.present;
  }
  if (absentCount) {
    absentCount.textContent = summary.absent;
  }

  document.querySelectorAll("[data-attendance-row]").forEach((row) => {
    const checkedInput = row.querySelector("[data-attendance-status]:checked");
    if (!checkedInput) {
      return;
    }

    const status = checkedInput.value;
    row.classList.toggle("is-present", status === "present");
    row.classList.toggle("is-absent", status === "absent");
    row.querySelectorAll(".attendance-status-option").forEach((option) => {
      const optionInput = option.querySelector("[data-attendance-status]");
      option.classList.toggle("is-selected", optionInput && optionInput.checked);
    });

    const badge = row.querySelector("[data-attendance-badge]");
    if (badge) {
      badge.textContent = formatAttendanceStatus(status);
      badge.classList.toggle("good", status === "present");
      badge.classList.toggle("warn", status === "absent");
    }
  });
}

function markAllAttendance(status) {
  document.querySelectorAll(`[data-attendance-status][value="${status}"]`).forEach((input) => {
    input.checked = true;
  });
  updateAttendanceSelectionState();
}

async function handleSaveAllAttendance() {
  const date = state.teacherAttendanceDate || new Date().toISOString().slice(0, 10);

  if (!date) {
    notify("Select an attendance date first.", "error");
    return;
  }

  const attendance = Array.from(document.querySelectorAll("[data-attendance-status]:checked")).map((input) => ({
    studentId: input.getAttribute("data-attendance-status"),
    status: input.value
  }));

  if (!attendance.length) {
    notify("Add at least one student before saving attendance.", "error");
    return;
  }

  try {
    await api("/api/attendance", {
      method: "PUT",
      body: JSON.stringify({
        actorId: state.currentUser.id,
        date,
        attendance
      })
    });

    await refreshDashboard(false);
    notify(`${attendance.length} attendance entr${attendance.length === 1 ? "y" : "ies"} saved.`);
  } catch (error) {
    notify(error.message, "error");
  }
}

boot();
