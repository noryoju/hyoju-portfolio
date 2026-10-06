(() => {
  // 세션 토큰은 메모리 변수에만 둔다. localStorage/sessionStorage에 저장하지 않으므로
  // 창을 닫거나 새로고침하면 무조건 사라지고, 다시 들어오면 항상 로그인해야 한다.
  let authToken = null;
  let editingId = null;

  const loginScreen = document.getElementById("loginScreen");
  const adminPanel = document.getElementById("adminPanel");
  const loginForm = document.getElementById("loginForm");
  const loginError = document.getElementById("loginError");

  const projectForm = document.getElementById("projectForm");
  const formTitle = document.getElementById("formTitle");
  const formError = document.getElementById("formError");
  const projectList = document.getElementById("projectList");
  const duplicateBanner = document.getElementById("duplicateBanner");
  const duplicateList = document.getElementById("duplicateList");

  const fields = {
    title: document.getElementById("fieldTitle"),
    role: document.getElementById("fieldRole"),
    description: document.getElementById("fieldDescription"),
    date: document.getElementById("fieldDate"),
    memberCount: document.getElementById("fieldMemberCount"),
    note: document.getElementById("fieldNote"),
    videoUrl: document.getElementById("fieldVideoUrl"),
  };
  const videoFileInput = document.getElementById("fieldVideoFile");
  const videoUploadStatus = document.getElementById("videoUploadStatus");

  const REQUIRED_FIELDS = ["title", "role", "description", "date", "memberCount"];

  function showLogin() {
    authToken = null;
    loginScreen.hidden = false;
    adminPanel.hidden = true;
  }

  function showPanel() {
    loginScreen.hidden = true;
    adminPanel.hidden = false;
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(options.headers || {}),
      },
    });

    if (res.status === 401) {
      showLogin();
      throw new Error("로그인이 만료되었습니다. 다시 로그인해주세요.");
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || "요청 처리 중 오류가 발생했습니다.");
    }
    return data;
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.hidden = true;
    const password = document.getElementById("loginPassword").value;

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "로그인에 실패했습니다.");

      authToken = data.token;
      document.getElementById("loginPassword").value = "";
      showPanel();
      loadAll();
      showViewFromHash();
    } catch (err) {
      loginError.textContent = err.message;
      loginError.hidden = false;
    }
  });

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    try {
      await api("/api/admin/logout", { method: "POST" });
    } catch (_) {
      // 로그아웃 요청 실패해도 클라이언트 쪽 세션은 지운다.
    }
    showLogin();
  });

  function resetForm() {
    editingId = null;
    projectForm.reset();
    formTitle.textContent = "새 프로젝트 추가";
    formError.hidden = true;
    fields.videoUrl.value = "";
    videoUploadStatus.textContent = "";
  }

  document.getElementById("resetFormBtn").addEventListener("click", resetForm);

  videoFileInput.addEventListener("change", async () => {
    const file = videoFileInput.files[0];
    if (!file) return;

    videoUploadStatus.textContent = "업로드 중...";
    try {
      const formData = new FormData();
      formData.append("video", file);
      const res = await fetch("/api/admin/upload/video", {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "업로드에 실패했습니다.");

      fields.videoUrl.value = data.url;
      videoUploadStatus.textContent = `업로드 완료: ${file.name}`;
    } catch (err) {
      videoUploadStatus.textContent = err.message;
    }
  });

  function getFormData() {
    const status = projectForm.querySelector('input[name="status"]:checked').value;
    return {
      title: fields.title.value.trim(),
      role: fields.role.value.trim(),
      description: fields.description.value.trim(),
      date: fields.date.value.trim(),
      memberCount: fields.memberCount.value.trim(),
      note: fields.note.value.trim(),
      videoUrl: fields.videoUrl.value,
      status,
    };
  }

  function validate(data) {
    if (data.status === "published") {
      for (const f of REQUIRED_FIELDS) {
        if (!data[f]) return "공개하려면 참고사항을 제외한 모든 항목을 입력해야 합니다.";
      }
    }
    return null;
  }

  projectForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    formError.hidden = true;

    const data = getFormData();
    const clientError = validate(data);
    if (clientError) {
      formError.textContent = clientError;
      formError.hidden = false;
      return;
    }

    try {
      if (editingId) {
        await api(`/api/admin/projects/${editingId}`, { method: "PUT", body: JSON.stringify(data) });
      } else {
        await api("/api/admin/projects", { method: "POST", body: JSON.stringify(data) });
      }
      resetForm();
      loadAll();
    } catch (err) {
      formError.textContent = err.message;
      formError.hidden = false;
    }
  });

  function fillFormForEdit(project) {
    editingId = project.id;
    formTitle.textContent = "프로젝트 수정";
    fields.title.value = project.title;
    fields.role.value = project.role;
    fields.description.value = project.description;
    fields.date.value = project.date;
    fields.memberCount.value = project.memberCount;
    fields.note.value = project.note;
    fields.videoUrl.value = project.videoUrl || "";
    videoUploadStatus.textContent = project.videoUrl ? `현재 등록된 영상: ${project.videoUrl.split("/").pop()}` : "";
    projectForm.querySelector(`input[name="status"][value="${project.status}"]`).checked = true;
    formError.hidden = true;
    projectForm.scrollIntoView({ behavior: "smooth" });
  }

  async function deleteProject(id) {
    if (!confirm("이 프로젝트를 삭제할까요? 되돌릴 수 없습니다.")) return;
    try {
      await api(`/api/admin/projects/${id}`, { method: "DELETE" });
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  }

  function renderProjectList(projects) {
    projectList.innerHTML = "";
    if (projects.length === 0) {
      projectList.innerHTML = '<p style="color:var(--text-muted)">등록된 프로젝트가 없습니다.</p>';
      return;
    }

    for (const p of projects) {
      const item = document.createElement("div");
      item.className = "admin-project-item";
      item.innerHTML = `
        <div class="info">
          <h3>
            <span class="admin-status-badge ${p.status}">${p.status === "published" ? "공개" : "초안"}</span>
            ${escapeHtml(p.title || "(제목 없음)")}
          </h3>
          <p>${escapeHtml(p.role || "")} · ${escapeHtml(p.date || "")} · ${escapeHtml(p.memberCount || "")}</p>
        </div>
        <div class="actions">
          <button class="btn btn-sm btn-outline" data-action="edit">수정</button>
          <button class="btn btn-sm btn-outline" data-action="delete">삭제</button>
        </div>
      `;
      item.querySelector('[data-action="edit"]').addEventListener("click", () => fillFormForEdit(p));
      item.querySelector('[data-action="delete"]').addEventListener("click", () => deleteProject(p.id));
      projectList.appendChild(item);
    }
  }

  function renderDuplicates(groups) {
    if (!groups || groups.length === 0) {
      duplicateBanner.hidden = true;
      return;
    }
    duplicateBanner.hidden = false;
    duplicateList.innerHTML = "";

    for (const group of groups) {
      const groupEl = document.createElement("div");
      groupEl.className = "admin-duplicate-group";
      groupEl.innerHTML = `<p style="color:var(--text-muted);margin-bottom:8px;">같은 제목의 프로젝트 ${group.length}건이 있습니다. 필요 없는 항목을 삭제해서 정리하세요.</p>`;

      for (const p of group) {
        const row = document.createElement("div");
        row.className = "dup-item";
        row.innerHTML = `
          <span>${escapeHtml(p.title)} (${p.status === "published" ? "공개" : "초안"}, ${escapeHtml(p.date || "날짜 없음")})</span>
          <button class="btn btn-sm btn-outline" data-action="delete-dup">이 항목 삭제</button>
        `;
        row.querySelector('[data-action="delete-dup"]').addEventListener("click", () => deleteProject(p.id));
        groupEl.appendChild(row);
      }
      duplicateList.appendChild(groupEl);
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  async function loadAll() {
    try {
      const [listRes, dupRes] = await Promise.all([
        api("/api/admin/projects"),
        api("/api/admin/projects/duplicates/list"),
      ]);
      renderProjectList(listRes.projects);
      renderDuplicates(dupRes.groups);
    } catch (err) {
      // 401은 api()에서 이미 로그인 화면으로 돌려보낸다.
      console.error(err);
    }
  }

  /* ==========================================================================
     화면 전환 (프로젝트 관리 / 예약하기 관리)
     세션 토큰이 메모리에만 있으므로 별도 HTML로 이동하지 않고 같은 페이지 안에서 화면을 바꾼다.
     주소 끝(#projects / #reservations)으로 현재 화면을 구분한다.
     ========================================================================== */
  const VIEWS = {
    projects: { el: document.getElementById("projectsView"), title: "프로젝트 관리" },
    reservations: { el: document.getElementById("reservationsView"), title: "예약하기 관리" },
  };
  const adminTitle = document.getElementById("adminTitle");
  const adminTabs = document.querySelectorAll(".admin-tab");

  function showView(name) {
    if (!VIEWS[name]) name = "projects";
    Object.entries(VIEWS).forEach(([key, view]) => {
      view.el.hidden = key !== name;
    });
    adminTabs.forEach((tab) => {
      const active = tab.dataset.view === name;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-current", active ? "page" : "false");
    });
    adminTitle.textContent = VIEWS[name].title;
    adminPanel.classList.toggle("is-wide", name === "reservations");
    if (name === "reservations") loadReservations();
  }

  function showViewFromHash() {
    showView(location.hash.replace("#", ""));
  }

  window.addEventListener("hashchange", () => {
    if (authToken) showViewFromHash();
  });

  /* ==========================================================================
     예약하기 관리
     ========================================================================== */
  const reservationTableBody = document.getElementById("reservationTableBody");
  const reservationError = document.getElementById("reservationError");
  const RESERVATION_STATUSES = ["접수", "확정", "변경 요청", "취소"];
  const STATUS_CLASS = { 접수: "received", 확정: "confirmed", "변경 요청": "change", 취소: "cancelled" };
  const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
  const reservationSummary = document.getElementById("reservationSummary");
  const reservationFilters = document.getElementById("reservationFilters");

  let allReservations = []; // 서버에서 받은 전체 예약
  let currentFilter = "전체"; // 선택한 처리 상태 필터

  function formatVisitTime(visitDate, visitTime) {
    const [y, m, d] = visitDate.split("-").map(Number);
    const day = WEEKDAYS[new Date(y, m - 1, d).getDay()];
    return `${y}.${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")} (${day}) ${visitTime}`;
  }

  // 1. 처리 상태별 요약: "전체 n건 / 접수 n건 / 확정 n건 / 변경 요청 n건 / 취소 n건"
  function renderSummary() {
    const counts = { 전체: allReservations.length };
    RESERVATION_STATUSES.forEach((s) => {
      counts[s] = allReservations.filter((r) => r.status === s).length;
    });

    reservationSummary.textContent = ["전체", ...RESERVATION_STATUSES]
      .map((s) => `${s} ${counts[s]}건`)
      .join(" / ");

    reservationFilters.querySelectorAll(".admin-res-filter").forEach((btn) => {
      btn.querySelector(".count").textContent = counts[btn.dataset.filter];
    });
  }

  // 2. 선택한 필터에 해당하는 예약만 표로 보여준다
  function renderFilteredReservations() {
    reservationFilters.querySelectorAll(".admin-res-filter").forEach((btn) => {
      const active = btn.dataset.filter === currentFilter;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    });

    const visible = currentFilter === "전체"
      ? allReservations
      : allReservations.filter((r) => r.status === currentFilter);

    if (allReservations.length === 0) {
      reservationTableBody.innerHTML = '<tr><td colspan="6" class="admin-res-empty">아직 접수된 예약이 없습니다.</td></tr>';
      return;
    }
    if (visible.length === 0) {
      reservationTableBody.innerHTML = `<tr><td colspan="6" class="admin-res-empty">'${escapeHtml(currentFilter)}' 상태의 예약이 없습니다.</td></tr>`;
      return;
    }
    renderReservations(visible);
  }

  function renderReservations(reservations) {

    reservationTableBody.innerHTML = "";
    for (const r of reservations) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="admin-res-no">${escapeHtml(r.reservationNo)}</td>
        <td>
          <div class="admin-res-name">${escapeHtml(r.name)}</div>
          <a class="admin-res-email" href="mailto:${escapeHtml(r.email)}">${escapeHtml(r.email)}</a>
        </td>
        <td class="admin-res-time">${escapeHtml(formatVisitTime(r.visitDate, r.visitTime))}</td>
        <td class="admin-res-purpose">${escapeHtml(r.purpose)}</td>
        <td><span class="admin-res-badge ${STATUS_CLASS[r.status] || ""}">${escapeHtml(r.status)}</span></td>
        <td>
          <div class="admin-res-actions" role="group" aria-label="${escapeHtml(r.reservationNo)} 처리 상태 변경">
            ${RESERVATION_STATUSES.map((s) => `
              <button type="button" class="admin-res-btn ${STATUS_CLASS[s]}${s === r.status ? " is-current" : ""}"
                data-id="${r.id}" data-status="${s}" aria-pressed="${s === r.status}">${s}</button>
            `).join("")}
          </div>
        </td>
      `;
      reservationTableBody.appendChild(tr);
    }
  }

  async function loadReservations() {
    reservationError.hidden = true;
    try {
      const res = await api("/api/admin/reservations");
      allReservations = res.reservations;
      renderSummary();
      renderFilteredReservations();
    } catch (err) {
      allReservations = [];
      renderSummary();
      reservationSummary.textContent = "";
      reservationTableBody.innerHTML = '<tr><td colspan="6" class="admin-res-empty">예약 목록을 불러오지 못했습니다.</td></tr>';
      reservationError.textContent = err.message;
      reservationError.hidden = false;
    }
  }

  async function changeReservationStatus(button) {
    const { id, status } = button.dataset;
    if (button.classList.contains("is-current")) return;

    const group = button.closest(".admin-res-actions");
    group.querySelectorAll("button").forEach((b) => (b.disabled = true));
    reservationError.hidden = true;
    try {
      await api(`/api/admin/reservations/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadReservations();
    } catch (err) {
      reservationError.textContent = err.message;
      reservationError.hidden = false;
      group.querySelectorAll("button").forEach((b) => (b.disabled = false));
    }
  }

  reservationFilters.addEventListener("click", (e) => {
    const button = e.target.closest(".admin-res-filter");
    if (!button) return;
    currentFilter = button.dataset.filter;
    renderFilteredReservations();
  });

  reservationTableBody.addEventListener("click", (e) => {
    const button = e.target.closest(".admin-res-btn");
    if (button) changeReservationStatus(button);
  });

  document.getElementById("reloadReservationsBtn").addEventListener("click", loadReservations);

  // 페이지를 새로 열거나 새로고침하면 항상 로그인 화면부터 시작한다.
  showLogin();
})();
