const avatarEl = document.getElementById("avatar");
const profileTitleEl = document.getElementById("profile-title");
const profileContentEl = document.getElementById("profile-content");
const stageEl = document.getElementById("stack-stage");
const backBtn = document.getElementById("back-btn");

if (avatarEl) {
  avatarEl.onerror = () => {
    avatarEl.src = "assets/img/avatar-fallback.svg";
  };
}

const state = {
  list: [],
  center: 0,
  path: []
};

backBtn.addEventListener("click", goBack);

fetch("assets/data/manifest.json", { cache: "no-cache" })
  .then((r) => r.json())
  .then((tree) => {
    if (tree.profile) renderProfile(tree.profile);
    const roots = tree.children || [];
    if (!roots.length) {
      renderEmpty("暂无内容，请在 content 里添加文件夹或 Markdown。");
      return;
    }
    state.list = roots;
    state.center = 0;
    render();
  })
  .catch((err) => {
    renderEmpty("加载失败");
    console.error(err);
  });

function render() {
  stageEl.innerHTML = "";
  toggleBack();

  const n = state.list.length;
  if (!n) {
    renderEmpty("该目录为空。");
    return;
  }

  for (let i = 0; i < n; i += 1) {
    const node = state.list[i];
    const rel = shortestOffset(i, state.center, n);
    const abs = Math.abs(rel);

    const card = document.createElement("button");
    card.type = "button";
    card.className = "card";
    if (rel === 0) card.classList.add("active");
    card.dataset.index = String(i);
    card.innerHTML = `
      <span class="badge">${node.type === "note" ? "MD" : "夹"}</span>
      <h3>${escapeHtml(node.title || "未命名")}</h3>
      <p>${escapeHtml(node.summary || (node.type === "note" ? "Markdown 文档" : "文件夹"))}</p>
    `;

    const x = rel * 170;
    const scale = Math.max(0.58, 1 - abs * 0.12);
    const y = abs * 14;
    const rotate = rel * -5;
    const opacity = Math.max(0.3, 1 - abs * 0.12);
    card.style.transform = `translate(-50%, -50%) translateX(${x}px) translateY(${y}px) scale(${scale}) rotateY(${rotate}deg)`;
    card.style.zIndex = String(100 - abs);
    card.style.opacity = String(opacity);

    card.addEventListener("click", () => onCardClick(i));
    stageEl.appendChild(card);
  }
}

function onCardClick(index) {
  if (index !== state.center) {
    state.center = index;
    render();
    return;
  }

  const node = state.list[index];
  if (node.type === "folder") {
    state.path.push({
      list: state.list,
      center: state.center
    });
    state.list = node.children || [];
    state.center = 0;
    render();
    return;
  }
}

function goBack() {
  const last = state.path.pop();
  if (!last) return;
  state.list = last.list;
  state.center = Math.min(last.center, Math.max(0, state.list.length - 1));
  render();
}

function toggleBack() {
  backBtn.hidden = state.path.length === 0;
}

function renderEmpty(text) {
  stageEl.innerHTML = `<div class="empty">${escapeHtml(text)}</div>`;
}

function renderProfile(profile) {
  if (profileTitleEl && profile.title) profileTitleEl.textContent = profile.title;
  if (profileContentEl) profileContentEl.innerHTML = profile.html || "<p>profile.md 为空。</p>";
}

function shortestOffset(index, center, total) {
  const raw = index - center;
  const half = total / 2;
  if (raw > half) return raw - total;
  if (raw < -half) return raw + total;
  return raw;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
