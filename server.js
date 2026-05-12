const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const RENDER_DATA_DIR = "/var/data";
const DEFAULT_DATA_DIR = process.env.RENDER && fs.existsSync(RENDER_DATA_DIR)
  ? RENDER_DATA_DIR
  : path.join(__dirname, "data");
const DATA_FILE = process.env.DATA_FILE
  ? path.resolve(process.env.DATA_FILE)
  : path.join(process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : DEFAULT_DATA_DIR, "class-record.json");
const DATA_DIR = path.dirname(DATA_FILE);
const ALLOW_DATA_RESET = process.env.ALLOW_DATA_RESET === "true";
const PASSING_GRADE = 75;
const PASSWORD_RULE_MESSAGE = "Password must be exactly 10 characters and include at least one lowercase letter, one uppercase letter, and one number.";
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10}$/;
const QUARTER_ORDER = ["first", "second", "third", "fourth"];
const QUARTER_LABELS = {
  first: "First Quarter",
  second: "Second Quarter",
  third: "Third Quarter",
  fourth: "Fourth Quarter"
};

function createId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeQuarter(value) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  return QUARTER_ORDER.includes(normalizedValue) ? normalizedValue : "first";
}

function getQuarterLabel(quarter) {
  return QUARTER_LABELS[normalizeQuarter(quarter)];
}

function sortQuarterItems(items) {
  return [...items].sort((left, right) => {
    const quarterDifference = QUARTER_ORDER.indexOf(normalizeQuarter(left.quarter)) - QUARTER_ORDER.indexOf(normalizeQuarter(right.quarter));
    if (quarterDifference !== 0) {
      return quarterDifference;
    }

    return String(left.name || "").localeCompare(String(right.name || ""));
  });
}

function createEmptyData() {
  return {
    users: [],
    subjects: [],
    grades: [],
    attendance: []
  };
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(createEmptyData(), null, 2));
  }
}

function readData() {
  ensureDataFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    parsed.users = Array.isArray(parsed.users) ? parsed.users : [];
    parsed.subjects = Array.isArray(parsed.subjects) ? parsed.subjects.map((subject) => ({
      ...subject,
      quarter: normalizeQuarter(subject.quarter)
    })) : [];
    parsed.grades = Array.isArray(parsed.grades) ? parsed.grades.map((grade) => ({
      ...grade,
      missedAssignmentCount: normalizeWholeNumber(grade.missedAssignmentCount),
      missedQuizCount: normalizeWholeNumber(grade.missedQuizCount),
      assignmentScore: normalizeOptionalScore(grade.assignmentScore),
      quiz: normalizeOptionalScore(grade.quiz),
      exam: normalizeOptionalScore(grade.exam)
    })) : [];
    parsed.attendance = Array.isArray(parsed.attendance) ? parsed.attendance : [];
    delete parsed.assignments;
    return parsed;
  } catch (error) {
    const empty = createEmptyData();
    fs.writeFileSync(DATA_FILE, JSON.stringify(empty, null, 2));
    return empty;
  }
}

function writeData(data) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function normalizeOptionalScore(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeWholeNumber(value) {
  if (value === "" || value === null || value === undefined) {
    return 0;
  }

  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue >= 0 ? numericValue : null;
}

function computeGrade(quiz, exam, assignmentScore = null) {
  const scores = [assignmentScore, quiz, exam].filter((value) => normalizeOptionalScore(value) !== null).map(Number);
  return scores.length ? average(scores) : 0;
}

function validateGradePayload(data, actor, payload) {
  const missedAssignmentCount = normalizeWholeNumber(payload.missedAssignmentCount);
  const missedQuizCount = normalizeWholeNumber(payload.missedQuizCount);
  const assignmentScore = normalizeOptionalScore(payload.assignmentScore);
  const quiz = Number(payload.quiz);
  const exam = Number(payload.exam);
  const studentId = String(payload.studentId || "");
  const subjectId = String(payload.subjectId || "");
  const student = data.users.find((user) => user.id === studentId && user.role === "student" && user.teacherId === actor.id);
  const subject = data.subjects.find((item) => item.id === subjectId && item.teacherId === actor.id);

  if (!student || !subject) {
    return {
      ok: false,
      statusCode: 404,
      message: "Student or subject not found."
    };
  }

  if (
    missedAssignmentCount === null ||
    missedQuizCount === null ||
    assignmentScore === null ||
    !Number.isFinite(quiz) ||
    !Number.isFinite(exam) ||
    assignmentScore < 0 ||
    assignmentScore > 100 ||
    quiz < 0 ||
    quiz > 100 ||
    exam < 0 ||
    exam > 100
  ) {
    return {
      ok: false,
      statusCode: 400,
      message: "Missed assignments and missed quizzes must be 0 or more, and assignment, quiz, and exam scores must be between 0 and 100."
    };
  }

  return {
    ok: true,
    value: {
      studentId,
      subjectId,
      missedAssignmentCount,
      missedQuizCount,
      assignmentScore,
      quiz,
      exam
    }
  };
}

function normalizeDate(value) {
  const raw = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function isValidPassword(password) {
  return PASSWORD_PATTERN.test(String(password || ""));
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    teacherId: user.teacherId ?? null
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0"
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(text);
}

function getMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".js") return "application/javascript; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function serveStatic(response, pathname) {
  const requestedPath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendText(response, 404, "Not Found");
    return;
  }

  response.writeHead(200, { "Content-Type": getMimeType(filePath) });
  response.end(fs.readFileSync(filePath));
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";

    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request body too large."));
      }
    });

    request.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("Invalid JSON body."));
      }
    });

    request.on("error", reject);
  });
}

function getUserById(data, userId) {
  return data.users.find((user) => user.id === userId) || null;
}

function getTeacherName(data, teacherId) {
  const teacher = getUserById(data, teacherId);
  return teacher ? teacher.name : "Unassigned";
}

function getAttendanceCounts(records) {
  return {
    presentCount: records.filter((record) => record.status === "present").length,
    absentCount: records.filter((record) => record.status === "absent").length
  };
}

function buildAdminDashboard(data) {
  const teachers = data.users.filter((user) => user.role === "teacher");
  const students = data.users.filter((user) => user.role === "student");
  const scores = data.grades.map((grade) => computeGrade(grade.quiz, grade.exam, grade.assignmentScore));

  return {
    metrics: {
      teacherCount: teachers.length,
      studentCount: students.length,
      subjectCount: data.subjects.length,
      schoolAverage: Number(average(scores).toFixed(2))
    },
    teachers: teachers.map((teacher) => ({
      ...sanitizeUser(teacher),
      studentCount: students.filter((student) => student.teacherId === teacher.id).length,
      subjectCount: data.subjects.filter((subject) => subject.teacherId === teacher.id).length
    })),
    students: students.map((student) => ({
      ...sanitizeUser(student),
      teacherName: getTeacherName(data, student.teacherId)
    })),
    accounts: data.users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      password: user.password,
      role: user.role,
      teacherId: user.teacherId ?? null,
      teacherName: user.role === "student" ? getTeacherName(data, user.teacherId) : "",
      studentCount: user.role === "teacher"
        ? students.filter((student) => student.teacherId === user.id).length
        : 0,
      subjectCount: user.role === "teacher"
        ? data.subjects.filter((subject) => subject.teacherId === user.id).length
        : 0
    })),
    subjects: data.subjects.map((subject) => ({
      ...subject,
      quarter: normalizeQuarter(subject.quarter),
      quarterLabel: getQuarterLabel(subject.quarter),
      teacherName: getTeacherName(data, subject.teacherId)
    }))
  };
}

function buildTeacherDashboard(data, teacher) {
  const students = data.users.filter((user) => user.role === "student" && user.teacherId === teacher.id);
  const subjects = sortQuarterItems(
    data.subjects
      .filter((subject) => subject.teacherId === teacher.id)
      .map((subject) => ({
        ...subject,
        quarter: normalizeQuarter(subject.quarter),
        quarterLabel: getQuarterLabel(subject.quarter)
      }))
  );
  const subjectIds = new Set(subjects.map((subject) => subject.id));
  const relevantGrades = data.grades.filter((grade) => subjectIds.has(grade.subjectId));
  const studentIds = new Set(students.map((student) => student.id));
  const relevantAttendance = data.attendance.filter((record) => studentIds.has(record.studentId));
  const scoreValues = relevantGrades.map((grade) => computeGrade(grade.quiz, grade.exam, grade.assignmentScore));
  const assignmentScoreCount = relevantGrades.filter((grade) => grade.assignmentScore !== null).length;

  return {
    metrics: {
      studentCount: students.length,
      subjectCount: subjects.length,
      assignmentScoreCount,
      encodedGradeCount: relevantGrades.length,
      averageScore: Number(average(scoreValues).toFixed(2)),
      attendanceCount: relevantAttendance.length
    },
    students: students.map((student) => ({
      ...sanitizeUser(student),
      ...getAttendanceCounts(relevantAttendance.filter((record) => record.studentId === student.id))
    })),
    subjects,
    attendance: relevantAttendance,
    grades: relevantGrades.map((grade) => ({
      ...grade,
      quarter: subjects.find((subject) => subject.id === grade.subjectId)?.quarter || "first",
      quarterLabel: subjects.find((subject) => subject.id === grade.subjectId)?.quarterLabel || getQuarterLabel("first"),
      average: Number(computeGrade(grade.quiz, grade.exam, grade.assignmentScore).toFixed(2)),
      remarks: computeGrade(grade.quiz, grade.exam, grade.assignmentScore) >= PASSING_GRADE ? "Passed" : "Needs Improvement"
    }))
  };
}

function buildStudentDashboard(data, student) {
  const attendanceRecords = data.attendance
    .filter((record) => record.studentId === student.id)
    .sort((left, right) => right.date.localeCompare(left.date));
  const records = data.grades
    .filter((grade) => grade.studentId === student.id)
    .map((grade) => {
      const subject = data.subjects.find((item) => item.id === grade.subjectId);
      const averageScore = computeGrade(grade.quiz, grade.exam, grade.assignmentScore);
      return {
        id: grade.id,
        subjectId: grade.subjectId,
        subjectName: subject ? subject.name : "Removed Subject",
        quarter: subject ? normalizeQuarter(subject.quarter) : "first",
        quarterLabel: getQuarterLabel(subject ? subject.quarter : "first"),
        teacherName: subject ? getTeacherName(data, subject.teacherId) : "Unknown",
        missedAssignmentCount: grade.missedAssignmentCount,
        missedQuizCount: grade.missedQuizCount,
        assignmentScore: grade.assignmentScore,
        quiz: grade.quiz,
        exam: grade.exam,
        updatedAt: grade.updatedAt,
        average: Number(averageScore.toFixed(2)),
        remarks: averageScore >= PASSING_GRADE ? "Passed" : "Needs Improvement"
      };
    })
    .sort((left, right) => {
      const quarterDifference = QUARTER_ORDER.indexOf(left.quarter) - QUARTER_ORDER.indexOf(right.quarter);
      if (quarterDifference !== 0) {
        return quarterDifference;
      }

      return left.subjectName.localeCompare(right.subjectName);
    });

  const values = records.map((record) => record.average);
  const attendanceCounts = getAttendanceCounts(attendanceRecords);

  return {
    teacherName: getTeacherName(data, student.teacherId),
    metrics: {
      overallAverage: Number(average(values).toFixed(2)),
      highestGrade: values.length ? Math.max(...values) : 0,
      lowestGrade: values.length ? Math.min(...values) : 0,
      presentCount: attendanceCounts.presentCount,
      absentCount: attendanceCounts.absentCount,
      assignmentScoreCount: records.filter((record) => record.assignmentScore !== null).length
    },
    records,
    attendance: attendanceRecords
  };
}

function requireActor(data, actorId, role) {
  const actor = getUserById(data, actorId);
  if (!actor || actor.role !== role) {
    return null;
  }
  return actor;
}

function isEmailTaken(data, email, excludeUserId = null) {
  return data.users.some((user) => user.id !== excludeUserId && user.email.toLowerCase() === String(email).toLowerCase());
}

async function handleApi(request, response, url) {
  const pathname = url.pathname;
  const method = request.method;

  if (pathname === "/api/health" && method === "GET") {
    sendJson(response, 200, { ok: true });
    return true;
  }

  if (pathname === "/api/public/status" && method === "GET") {
    const data = readData();
    sendJson(response, 200, {
      hasUsers: data.users.length > 0,
      hasAdmin: data.users.some((user) => user.role === "admin")
    });
    return true;
  }

  if (pathname === "/api/setup-admin" && method === "POST") {
    const body = await parseBody(request);
    const data = readData();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "").trim();

    if (data.users.some((user) => user.role === "admin")) {
      sendJson(response, 409, { message: "An admin account already exists." });
      return true;
    }

    if (!name || !email || !password) {
      sendJson(response, 400, { message: "Complete admin account information is required." });
      return true;
    }

    if (!isValidPassword(password)) {
      sendJson(response, 400, { message: PASSWORD_RULE_MESSAGE });
      return true;
    }

    if (isEmailTaken(data, email)) {
      sendJson(response, 409, { message: "Email is already in use." });
      return true;
    }

    const admin = {
      id: createId("user"),
      name,
      email,
      password,
      role: "admin",
      teacherId: null
    };

    data.users.push(admin);
    writeData(data);
    sendJson(response, 201, {
      message: "Admin account created.",
      user: sanitizeUser(admin)
    });
    return true;
  }

  if (pathname === "/api/reset" && method === "POST") {
    if (!ALLOW_DATA_RESET) {
      sendJson(response, 403, { message: "Data reset is disabled." });
      return true;
    }

    const empty = createEmptyData();
    writeData(empty);
    sendJson(response, 200, { message: "All data cleared." });
    return true;
  }

  if (pathname === "/api/login" && method === "POST") {
    const body = await parseBody(request);
    const data = readData();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const user = data.users.find((item) => item.email.toLowerCase() === email && item.password === password);

    if (!user) {
      sendJson(response, 401, { message: "Invalid email or password." });
      return true;
    }

    sendJson(response, 200, { user: sanitizeUser(user) });
    return true;
  }

  if (pathname.startsWith("/api/users/") && method === "GET") {
    const userId = pathname.split("/").pop();
    const data = readData();
    const user = getUserById(data, userId);

    if (!user) {
      sendJson(response, 404, { message: "User not found." });
      return true;
    }

    sendJson(response, 200, { user: sanitizeUser(user) });
    return true;
  }

  if (pathname === "/api/admin/dashboard" && method === "GET") {
    const data = readData();
    const actor = requireActor(data, url.searchParams.get("userId"), "admin");

    if (!actor) {
      sendJson(response, 403, { message: "Admin access required." });
      return true;
    }

    sendJson(response, 200, {
      user: sanitizeUser(actor),
      dashboard: buildAdminDashboard(data)
    });
    return true;
  }

  if (pathname === "/api/teacher/dashboard" && method === "GET") {
    const data = readData();
    const actor = requireActor(data, url.searchParams.get("teacherId"), "teacher");

    if (!actor) {
      sendJson(response, 403, { message: "Teacher access required." });
      return true;
    }

    sendJson(response, 200, {
      user: sanitizeUser(actor),
      dashboard: buildTeacherDashboard(data, actor)
    });
    return true;
  }

  if (pathname === "/api/student/dashboard" && method === "GET") {
    const data = readData();
    const actor = requireActor(data, url.searchParams.get("studentId"), "student");

    if (!actor) {
      sendJson(response, 403, { message: "Student access required." });
      return true;
    }

    sendJson(response, 200, {
      user: sanitizeUser(actor),
      dashboard: buildStudentDashboard(data, actor)
    });
    return true;
  }

  if (pathname === "/api/users" && method === "POST") {
    const body = await parseBody(request);
    const data = readData();
    const actor = getUserById(data, body.actorId);

    if (!actor) {
      sendJson(response, 403, { message: "Valid actor required." });
      return true;
    }

    const role = String(body.role || "").trim();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "").trim();

    if (!name || !email || !password || !["teacher", "student"].includes(role)) {
      sendJson(response, 400, { message: "Incomplete user information." });
      return true;
    }

    if (!isValidPassword(password)) {
      sendJson(response, 400, { message: PASSWORD_RULE_MESSAGE });
      return true;
    }

    if (isEmailTaken(data, email)) {
      sendJson(response, 409, { message: "Email is already in use." });
      return true;
    }

    if (role === "teacher" && actor.role !== "admin") {
      sendJson(response, 403, { message: "Only admins can create teachers." });
      return true;
    }

    if (role === "student" && !["admin", "teacher"].includes(actor.role)) {
      sendJson(response, 403, { message: "Only admins or teachers can create students." });
      return true;
    }

    const teacherId = actor.role === "teacher"
      ? actor.id
      : role === "student"
        ? (body.teacherId || null)
        : null;

    data.users.push({
      id: createId("user"),
      name,
      email,
      password,
      role,
      teacherId
    });

    writeData(data);
    sendJson(response, 201, { message: `${role === "teacher" ? "Teacher" : "Student"} created.` });
    return true;
  }

  if (pathname.startsWith("/api/users/") && method === "PUT") {
    const userId = pathname.split("/").pop();
    const body = await parseBody(request);
    const data = readData();
    const actor = requireActor(data, body.actorId, "admin");
    const targetUser = getUserById(data, userId);

    if (!actor) {
      sendJson(response, 403, { message: "Admin access required." });
      return true;
    }

    if (!targetUser) {
      sendJson(response, 404, { message: "User not found." });
      return true;
    }

    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "").trim();

    if (!email || !password) {
      sendJson(response, 400, { message: "Email and password are required." });
      return true;
    }

    if (!isValidPassword(password)) {
      sendJson(response, 400, { message: PASSWORD_RULE_MESSAGE });
      return true;
    }

    if (isEmailTaken(data, email, targetUser.id)) {
      sendJson(response, 409, { message: "Email is already in use." });
      return true;
    }

    targetUser.email = email;
    targetUser.password = password;
    writeData(data);
    sendJson(response, 200, { message: "Account credentials updated." });
    return true;
  }

  if (pathname.startsWith("/api/users/") && method === "DELETE") {
    const userId = pathname.split("/").pop();
    const actorId = url.searchParams.get("actorId");
    const data = readData();
    const actor = requireActor(data, actorId, "admin");

    if (!actor) {
      sendJson(response, 403, { message: "Admin access required." });
      return true;
    }

    const target = getUserById(data, userId);
    if (!target || target.role === "admin") {
      sendJson(response, 404, { message: "User not found." });
      return true;
    }

    if (target.role === "teacher") {
      const subjectIds = data.subjects.filter((subject) => subject.teacherId === userId).map((subject) => subject.id);
      data.subjects = data.subjects.filter((subject) => subject.teacherId !== userId);
      data.users = data.users.map((user) => user.teacherId === userId ? { ...user, teacherId: null } : user);
      data.grades = data.grades.filter((grade) => !subjectIds.includes(grade.subjectId));
    }

    if (target.role === "student") {
      data.grades = data.grades.filter((grade) => grade.studentId !== userId);
      data.attendance = data.attendance.filter((record) => record.studentId !== userId);
    }

    data.users = data.users.filter((user) => user.id !== userId);
    writeData(data);
    sendJson(response, 200, { message: "User deleted." });
    return true;
  }

  if (pathname === "/api/subjects" && method === "POST") {
    const body = await parseBody(request);
    const data = readData();
    const actor = requireActor(data, body.actorId, "teacher");

    if (!actor) {
      sendJson(response, 403, { message: "Teacher access required." });
      return true;
    }

    const name = String(body.name || "").trim();
    const quarter = normalizeQuarter(body.quarter);
    if (!name) {
      sendJson(response, 400, { message: "Subject name is required." });
      return true;
    }

    const exists = data.subjects.some((subject) =>
      subject.teacherId === actor.id &&
      normalizeQuarter(subject.quarter) === quarter &&
      subject.name.toLowerCase() === name.toLowerCase()
    );
    if (exists) {
      sendJson(response, 409, { message: `You already have a subject with that name for ${getQuarterLabel(quarter)}.` });
      return true;
    }

    data.subjects.push({
      id: createId("subject"),
      name,
      quarter,
      teacherId: actor.id
    });

    writeData(data);
    sendJson(response, 201, { message: "Subject created." });
    return true;
  }

  if (pathname.startsWith("/api/subjects/") && method === "DELETE") {
    const subjectId = pathname.split("/").pop();
    const actorId = url.searchParams.get("actorId");
    const data = readData();
    const actor = requireActor(data, actorId, "teacher");

    if (!actor) {
      sendJson(response, 403, { message: "Teacher access required." });
      return true;
    }

    const subject = data.subjects.find((item) => item.id === subjectId && item.teacherId === actor.id);
    if (!subject) {
      sendJson(response, 404, { message: "Subject not found." });
      return true;
    }

    data.subjects = data.subjects.filter((item) => item.id !== subjectId);
    data.grades = data.grades.filter((grade) => grade.subjectId !== subjectId);
    writeData(data);
    sendJson(response, 200, { message: "Subject deleted." });
    return true;
  }

  if (pathname === "/api/grades" && method === "PUT") {
    const body = await parseBody(request);
    const data = readData();
    const actor = requireActor(data, body.actorId, "teacher");

    if (!actor) {
      sendJson(response, 403, { message: "Teacher access required." });
      return true;
    }

    const gradeEntries = Array.isArray(body.grades) ? body.grades : [body];
    if (!gradeEntries.length) {
      sendJson(response, 400, { message: "At least one grade entry is required." });
      return true;
    }

    const normalizedGrades = [];

    for (let index = 0; index < gradeEntries.length; index += 1) {
      const validation = validateGradePayload(data, actor, gradeEntries[index]);

      if (!validation.ok) {
        const message = gradeEntries.length > 1
          ? `Grade entry ${index + 1}: ${validation.message}`
          : validation.message;
        sendJson(response, validation.statusCode, { message });
        return true;
      }

      normalizedGrades.push(validation.value);
    }

    const savedAt = new Date().toISOString();

    normalizedGrades.forEach((gradePayload) => {
      const existing = data.grades.find((grade) => grade.studentId === gradePayload.studentId && grade.subjectId === gradePayload.subjectId);

      if (existing) {
        existing.missedAssignmentCount = gradePayload.missedAssignmentCount;
        existing.missedQuizCount = gradePayload.missedQuizCount;
        existing.assignmentScore = gradePayload.assignmentScore;
        existing.quiz = gradePayload.quiz;
        existing.exam = gradePayload.exam;
        existing.updatedAt = savedAt;
      } else {
        data.grades.push({
          id: createId("grade"),
          studentId: gradePayload.studentId,
          subjectId: gradePayload.subjectId,
          missedAssignmentCount: gradePayload.missedAssignmentCount,
          missedQuizCount: gradePayload.missedQuizCount,
          assignmentScore: gradePayload.assignmentScore,
          quiz: gradePayload.quiz,
          exam: gradePayload.exam,
          updatedAt: savedAt
        });
      }
    });

    writeData(data);
    sendJson(response, 200, {
      message: normalizedGrades.length === 1 ? "Grade saved." : `${normalizedGrades.length} grade entries saved.`,
      savedCount: normalizedGrades.length
    });
    return true;
  }

  if (pathname === "/api/attendance" && method === "PUT") {
    const body = await parseBody(request);
    const data = readData();
    const actor = requireActor(data, body.actorId, "teacher");

    if (!actor) {
      sendJson(response, 403, { message: "Teacher access required." });
      return true;
    }

    const date = normalizeDate(body.date);
    const attendancePayloads = Array.isArray(body.attendance)
      ? body.attendance
      : [{ studentId: body.studentId, status: body.status }];

    if (!date) {
      sendJson(response, 400, { message: "A valid attendance date is required." });
      return true;
    }

    if (!attendancePayloads.length) {
      sendJson(response, 400, { message: "Add at least one attendance entry before saving." });
      return true;
    }

    const teacherStudentIds = new Set(
      data.users
        .filter((user) => user.role === "student" && user.teacherId === actor.id)
        .map((student) => student.id)
    );
    const normalizedAttendance = [];

    for (const attendancePayload of attendancePayloads) {
      const studentId = String(attendancePayload.studentId || "");
      const status = String(attendancePayload.status || "").trim().toLowerCase();

      if (!teacherStudentIds.has(studentId)) {
        sendJson(response, 404, { message: "Student not found." });
        return true;
      }

      if (!["present", "absent"].includes(status)) {
        sendJson(response, 400, { message: "Attendance status must be present or absent." });
        return true;
      }

      normalizedAttendance.push({ studentId, status });
    }

    const savedAt = new Date().toISOString();

    normalizedAttendance.forEach((attendancePayload) => {
      const existing = data.attendance.find((record) => record.studentId === attendancePayload.studentId && record.date === date);

      if (existing) {
        existing.status = attendancePayload.status;
        existing.updatedAt = savedAt;
      } else {
        data.attendance.push({
          id: createId("attendance"),
          studentId: attendancePayload.studentId,
          date,
          status: attendancePayload.status,
          updatedAt: savedAt
        });
      }
    });

    writeData(data);
    sendJson(response, 200, {
      message: normalizedAttendance.length === 1 ? "Attendance saved." : `${normalizedAttendance.length} attendance entries saved.`,
      savedCount: normalizedAttendance.length
    });
    return true;
  }

  return false;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  try {
    if (url.pathname.startsWith("/api/")) {
      const handled = await handleApi(request, response, url);
      if (!handled) {
        sendJson(response, 404, { message: "API route not found." });
      }
      return;
    }

    serveStatic(response, url.pathname);
  } catch (error) {
    sendJson(response, 500, { message: error.message || "Server error." });
  }
});

server.listen(PORT, () => {
  ensureDataFile();
  console.log(`Class record app running at http://localhost:${PORT}`);
  console.log(`Class record data file: ${DATA_FILE}`);
});
