const express = require("express");
const requireAdmin = require("../middleware/requireAdmin");
const { STATUSES, getAllReservations, updateReservationStatus } = require("../data/reservationStore");

const router = express.Router();

router.use(requireAdmin);

function sendError(res, err, fallbackMessage) {
  if (err.code === "NOT_CONFIGURED") {
    return res.status(503).json({ ok: false, error: err.message });
  }
  res.status(500).json({ ok: false, error: fallbackMessage });
}

// 예약 목록
router.get("/", async (req, res) => {
  try {
    res.json({ ok: true, statuses: STATUSES, reservations: await getAllReservations() });
  } catch (err) {
    console.error("[admin/reservations] 목록 조회 실패:", err);
    sendError(res, err, "예약 목록을 불러오지 못했습니다.");
  }
});

// 처리 상태 변경 (접수 / 확정 / 변경 요청 / 취소)
router.patch("/:id/status", async (req, res) => {
  const status = (req.body || {}).status;
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ ok: false, error: `처리 상태는 ${STATUSES.join(", ")} 중 하나여야 합니다.` });
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ ok: false, error: "잘못된 예약 ID입니다." });
  }

  try {
    const updated = await updateReservationStatus(id, status);
    if (!updated) return res.status(404).json({ ok: false, error: "예약을 찾을 수 없습니다." });
    res.json({ ok: true, reservation: updated });
  } catch (err) {
    console.error("[admin/reservations] 상태 변경 실패:", err);
    sendError(res, err, "처리 상태를 변경하지 못했습니다.");
  }
});

module.exports = router;
