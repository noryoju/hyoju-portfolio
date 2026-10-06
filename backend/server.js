require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const { connectDB } = require("./config/db");
const contactRouter = require("./routes/contact");
const projectsRouter = require("./routes/projects");
const adminAuthRouter = require("./routes/adminAuth");
const adminProjectsRouter = require("./routes/adminProjects");
const adminUploadRouter = require("./routes/adminUpload");
const adminReservationsRouter = require("./routes/adminReservations");
const { useSupabase } = require("./data/store");
const { isConfigured: reservationsConfigured } = require("./data/reservationStore");

const app = express();
const PORT = process.env.PORT || 4000;
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");

app.use(cors());
app.use(express.json());

// 개발 중 프론트엔드/백엔드를 한 번에 켜서 볼 수 있도록 정적 파일도 함께 제공한다.
// (frontend, backend 폴더 구조 자체는 분리된 상태 그대로 유지)
app.use(express.static(FRONTEND_DIR));

// 프론트엔드에서 연결 상태를 확인할 수 있는 헬스체크
app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "백엔드 서버가 정상적으로 동작 중입니다." });
});

app.use("/api/contact", contactRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/admin", adminAuthRouter);
app.use("/api/admin/projects", adminProjectsRouter);
app.use("/api/admin/upload", adminUploadRouter);
app.use("/api/admin/reservations", adminReservationsRouter);

// `node server.js`로 직접 실행할 때만 포트를 열어 서버를 띄운다.
// Vercel 서버리스 환경에서는 이 파일을 함수로만 불러쓰기 때문에 listen하지 않는다.
if (require.main === module) {
  (async () => {
    await connectDB(); // DATABASE_URL이 없으면 연결을 건너뛰고 계속 진행한다.
    app.listen(PORT, () => {
      console.log(`[server] http://localhost:${PORT} 에서 실행 중`);
      console.log(`[projects] 저장소: ${useSupabase ? "Supabase(DB)" : "로컬 JSON 파일"}`);
      console.log(`[reservations] 예약 DB: ${reservationsConfigured ? "연결됨" : "설정 필요 (.env 확인)"}`);
    });
  })();
}

module.exports = app;
