const avatarEl = document.getElementById("avatar");
const profileTitleEl = document.getElementById("profile-title");
const profileContentEl = document.getElementById("profile-content");
const treeRootEl = document.getElementById("tree-root");

if (avatarEl) {
  avatarEl.onerror = () => { avatarEl.src = "assets/img/avatar-fallback.svg"; };
}

const HOVER_DELAY = 520; // 悬停多久后才旋转（毫秒）
const HOVER_COOLDOWN = 420; // 切换后冷却周期，避免过快连续跳转
const SWIPE_MIN_DISTANCE = 44;
let hoverTimer = null;

const state = {
  tree: {},
  nodeById: new Map(),
  parentById: new Map(),
  noteByPublicPath: new Map(),
  // 层级栈：每层 { nodes, expandedIndex, focusIndex }
  levels: [],
  transitioning: false,
  activeFile: null,
  hoverLockedUntil: 0
};

// ========== 初始化 ==========

fetch("assets/data/manifest.json", { cache: "no-cache" })
  .then(r => r.json())
  .then(tree => {
    applyCustomBackgroundIfExists();
    if (tree.profile) renderProfile(tree.profile);
    if (!tree.children || tree.children.length === 0) {
      renderEmpty("暂无内容，请在 content 里添加文件夹或 Markdown。");
      return;
    }
    state.tree = tree;
    buildNodeIndexes();
    state.levels = [{
      nodes: tree.children,
      expandedIndex: null,
      focusIndex: Math.floor(tree.children.length / 2)
    }];
    initCards();
    setupSwipeNavigation();
  })
  .catch(err => {
    renderEmpty("加载失败");
    console.error(err);
  });

function renderProfile(profile) {
  if (profileTitleEl && profile.title) profileTitleEl.textContent = profile.title;
  if (profileContentEl) profileContentEl.innerHTML = profile.html || "<p>profile.md 为空。</p>";
}

function renderEmpty(text) {
  treeRootEl.innerHTML = `<div class="empty">${escapeHtml(text)}</div>`;
}

function buildNodeIndexes() {
  state.nodeById.clear();
  state.parentById.clear();
  state.noteByPublicPath.clear();

  const walk = (nodes, parentId = null) => {
    nodes.forEach(node => {
      state.nodeById.set(node.id, node);
      if (parentId) state.parentById.set(node.id, parentId);
      if (node.type === "note") {
        const p = normalizePath(`content/${node.id}`);
        state.noteByPublicPath.set(p, node);
      }
      if (node.children && node.children.length > 0) walk(node.children, node.id);
    });
  };

  walk(state.tree.children || []);
}

function setupSwipeNavigation() {
  const zone = document.querySelector(".cards-root") || treeRootEl;
  let startX = 0;
  let startY = 0;
  let touching = false;

  zone.addEventListener("touchstart", e => {
    if (!e.touches || e.touches.length !== 1) return;
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    touching = true;
  }, { passive: true });

  zone.addEventListener("touchend", e => {
    if (!touching || !e.changedTouches || e.changedTouches.length !== 1) return;
    touching = false;
    if (document.getElementById("file-modal")) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    if (Math.abs(dx) < SWIPE_MIN_DISTANCE) return;
    if (Math.abs(dx) <= Math.abs(dy)) return;
    moveFocus(dx < 0 ? 1 : -1);
  }, { passive: true });
}

function moveFocus(step) {
  if (state.transitioning || state.levels.length === 0) return;
  const L = state.levels[state.levels.length - 1];
  const n = L.nodes.length;
  if (!n) return;
  L.focusIndex = (L.focusIndex + step + n) % n;
  state.hoverLockedUntil = Date.now() + HOVER_COOLDOWN;
  layoutAll();
}

function normalizePath(p) {
  let s = String(p || "").trim().replace(/\\/g, "/");
  try {
    s = decodeURIComponent(s);
  } catch {}
  if (s.startsWith("./")) s = s.slice(2);
  if (s.startsWith("/")) s = s.slice(1);
  return s;
}

// ========== 环形位置计算 ==========
// 返回 idx 相对于 focusIdx 的环形偏移量
// 偶数时右侧多一张：leftCount = floor((N-1)/2), rightCount = N-1-leftCount
function getCircularPosition(idx, focusIdx, N) {
  if (N <= 1) return 0;
  const rightCount = N - 1 - Math.floor((N - 1) / 2);
  const cd = ((idx - focusIdx) % N + N) % N;
  if (cd === 0) return 0;
  if (cd <= rightCount) return cd;
  return cd - N;
}

// ========== 初始卡片 ==========

function initCards() {
  const container = treeRootEl;
  container.innerHTML = '';

  const level = state.levels[0];
  level.nodes.forEach((node, i) => {
    const el = createCardElement(node);
    el.dataset.level = '0';
    el.dataset.idx = String(i);
    el.dataset.ringPos = '0';
    el.style.transition = 'none';
    el.style.transform = 'translateX(0px) scale(0.3)';
    el.style.opacity = '0';
    container.appendChild(el);
    bindCardEvents(el, node, 0, i);
  });

  requestAnimationFrame(() => {
    container.querySelectorAll(':scope > .node').forEach(el => {
      el.style.transition = '';
    });
    requestAnimationFrame(() => layoutAll());
  });
}

// ========== 全局布局：所有层级共存 ==========

function layoutAll() {
  const container = treeRootEl;
  const activeLevel = state.levels.length - 1;
  const containerW = container.clientWidth || 1200;

  state.levels.forEach((level, L) => {
    const cards = [...container.querySelectorAll(`[data-level="${L}"]`)];
    const N = level.nodes.length;
    if (N === 0) return;
    const C = level.focusIndex;
    const isActive = L === activeLevel;

    const spacing = Math.min(260, Math.max(140, (containerW * 0.7) / Math.max(N, 2)));

    cards.forEach(el => {
      const idx = parseInt(el.dataset.idx);
      const pos = getCircularPosition(idx, C, N);
      const dist = Math.abs(pos);
      const x = pos * spacing;

      let scale, opacity, zIndex;

      if (isActive) {
        scale = Math.max(0.6, 1 - dist * 0.09);
        opacity = Math.max(0.35, 1 - dist * 0.18);
        zIndex = 100 - dist * 10;
        el.style.pointerEvents = '';
        el.classList.remove('dimmed-parent');
      } else {
        // 父层：保持同样的位置布局，仅略微缩小 + 变暗
        scale = Math.max(0.52, (1 - dist * 0.09) * 0.88);
        const isExpanded = idx === level.expandedIndex;
        opacity = isExpanded ? 0.32 : 0.12;
        zIndex = 15 - dist;
        el.style.pointerEvents = isExpanded ? '' : 'none';
        el.classList.add('dimmed-parent');
      }

      // 环形换位检测：位置跳变超过半圈则瞬移
      const oldPos = parseInt(el.dataset.ringPos || '0');
      const isWrap = N > 2 && Math.abs(pos - oldPos) > Math.floor(N / 2);

      if (isWrap) {
        // 先隐藏、瞬移到新位置，再渐显
        el.style.transition = 'none';
        el.style.opacity = '0';
        el.style.transform = `translateX(${x}px) scale(${scale})`;
        el.style.zIndex = String(zIndex);
        requestAnimationFrame(() => {
          el.style.transition = '';
          requestAnimationFrame(() => {
            el.style.opacity = String(opacity);
          });
        });
      } else {
        el.style.transform = `translateX(${x}px) scale(${scale})`;
        el.style.zIndex = String(zIndex);
        el.style.opacity = String(opacity);
      }

      el.dataset.ringPos = String(pos);
    });
  });
}

// ========== 展开文件夹 ==========

function expandFolder(level, idx) {
  if (state.transitioning) return;
  const folder = state.levels[level].nodes[idx];
  if (!folder.children || folder.children.length === 0) return;

  state.transitioning = true;
  const container = treeRootEl;

  // 设置父层状态
  state.levels[level].expandedIndex = idx;
  state.levels[level].focusIndex = idx;

  // 获取出发点（应该在中心，因为已被悬停）
  const clickedEl = container.querySelector(`[data-level="${level}"][data-idx="${idx}"]`);
  let originX = 0;
  if (clickedEl) {
    const cRect = container.getBoundingClientRect();
    const eRect = clickedEl.getBoundingClientRect();
    originX = (eRect.left + eRect.width / 2) - (cRect.left + cRect.width / 2);
  }

  // 创建新层
  const newLevelIdx = state.levels.length;
  const children = folder.children;
  const newLevel = {
    nodes: children,
    expandedIndex: null,
    focusIndex: Math.floor(children.length / 2)
  };
  state.levels.push(newLevel);

  // 创建子卡片，从 originX 出发
  children.forEach((node, i) => {
    const el = createCardElement(node);
    el.dataset.level = String(newLevelIdx);
    el.dataset.idx = String(i);
    el.dataset.ringPos = '0';
    el.style.transition = 'none';
    el.style.transform = `translateX(${originX}px) scale(0.25)`;
    el.style.opacity = '0';
    el.style.zIndex = '200';
    container.appendChild(el);
    bindCardEvents(el, node, newLevelIdx, i);
  });

  // 动画
  requestAnimationFrame(() => {
    container.querySelectorAll(`[data-level="${newLevelIdx}"]`).forEach(el => {
      el.style.transition = '';
    });
    requestAnimationFrame(() => {
      layoutAll();
      setTimeout(() => {
        container.querySelectorAll(`[data-level="${newLevelIdx}"]`).forEach(el => {
          el.style.zIndex = '';
        });
        layoutAll();
        state.transitioning = false;
      }, 550);
    });
  });
}

// ========== 收起到指定层 ==========

function collapseToLevel(targetLevel) {
  if (state.transitioning) return;
  const activeLevel = state.levels.length - 1;
  if (targetLevel < 0 || targetLevel >= activeLevel) return;

  state.transitioning = true;
  const container = treeRootEl;

  // 子层卡片收缩消失
  for (let L = targetLevel + 1; L <= activeLevel; L++) {
    container.querySelectorAll(`[data-level="${L}"]`).forEach(el => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(0px) scale(0.25)';
      el.style.pointerEvents = 'none';
    });
  }

  // 更新状态
  state.levels.length = targetLevel + 1;
  state.levels[targetLevel].expandedIndex = null;

  // 父层恢复
  requestAnimationFrame(() => {
    layoutAll();
    setTimeout(() => {
      for (let L = targetLevel + 1; L <= activeLevel; L++) {
        container.querySelectorAll(`[data-level="${L}"]`).forEach(el => el.remove());
      }
      state.transitioning = false;
    }, 550);
  });
}

// ========== 事件绑定 ==========

function bindCardEvents(el, node, level, idx) {
  // 悬停 → 延迟后轮盘旋转到该卡片为中心
  el.addEventListener('mouseenter', () => {
    const currentActive = state.levels.length - 1;
    if (level === currentActive && !state.transitioning) {
      if (Date.now() < state.hoverLockedUntil) return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => {
        if (Date.now() < state.hoverLockedUntil) return;
        if (state.levels[level] && state.levels[level].focusIndex !== idx) {
          state.levels[level].focusIndex = idx;
          layoutAll();
          state.hoverLockedUntil = Date.now() + HOVER_COOLDOWN;
        }
      }, HOVER_DELAY);
    }
  });

  el.addEventListener('mouseleave', () => {
    clearTimeout(hoverTimer);
  });

  el.querySelector('.node-card').addEventListener('click', e => {
    e.stopPropagation();
    if (state.transitioning) return;

    const currentActive = state.levels.length - 1;

    // 点击父层 → 收回到该层
    if (level < currentActive) {
      collapseToLevel(level);
      return;
    }

    // 活跃层
    if (node.type === 'folder') {
      state.levels[level].focusIndex = idx;
      expandFolder(level, idx);
    } else {
      openFileModal(node);
    }
  });
}

// ========== 全局事件 ==========

document.addEventListener('click', e => {
  if (state.transitioning) return;
  if (e.target.closest('.node-card') || e.target.closest('.modal')) return;
  if (state.levels.length > 1) {
    collapseToLevel(state.levels.length - 2);
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (document.getElementById('file-modal')) return;
    if (state.levels.length > 1) {
      collapseToLevel(state.levels.length - 2);
    }
  }
});

// ========== 创建卡片 ==========

function createCardElement(node) {
  const nodeEl = document.createElement('div');
  nodeEl.className = 'node';
  nodeEl.dataset.type = node.type;

  const cardEl = document.createElement('div');
  cardEl.className = 'node-card';

  if (node.type === 'folder') {
    cardEl.appendChild(createFolderVisual(node));
  } else {
    cardEl.appendChild(createNoteVisual(node));
  }

  const titleEl = document.createElement('div');
  titleEl.className = 'node-title';
  titleEl.textContent = node.title;
  cardEl.appendChild(titleEl);

  nodeEl.appendChild(cardEl);
  return nodeEl;
}

// ========== 文件夹视觉 ==========

function createFolderVisual(node) {
  const wrap = document.createElement('div');
  wrap.className = 'folder-card-wrap';

  const tab = document.createElement('div');
  tab.className = 'folder-tab';
  wrap.appendChild(tab);

  const body = document.createElement('div');
  body.className = 'folder-body';

  const directImages = collectDirectImages(node);
  const coverImg = getFolderCover(node, directImages);

  if (directImages.length > 0) {
    const stackEl = document.createElement('div');
    stackEl.className = 'image-stack';

    if (coverImg) {
      const img = document.createElement('img');
      img.className = 'stack-layer cover';
      img.src = coverImg;
      img.alt = node.title;
      img.loading = 'lazy';
      stackEl.appendChild(img);
    }

    const others = directImages.filter(s => s !== coverImg).slice(0, 4);
    others.forEach(src => {
      const img = document.createElement('img');
      img.className = 'stack-layer';
      img.src = src;
      img.alt = '';
      img.loading = 'lazy';
      stackEl.appendChild(img);
    });

    body.appendChild(stackEl);
  } else {
    const ph = document.createElement('div');
    ph.className = 'placeholder-bg';
    const icon = document.createElement('div');
    icon.className = 'folder-icon-inner';
    for (let i = 0; i < 3; i++) {
      const line = document.createElement('div');
      line.className = 'line';
      icon.appendChild(line);
    }
    ph.appendChild(icon);
    body.appendChild(ph);
  }

  wrap.appendChild(body);
  return wrap;
}

function collectDirectImages(folder) {
  const imgs = [];
  if (!folder.children) return imgs;
  folder.children.forEach(child => {
    if (child.type === 'note' && child.images && child.images.length > 0) {
      imgs.push(...child.images);
    }
  });
  return imgs;
}

function getFolderCover(folder, directImages) {
  if (folder.children) {
    const coverNote = folder.children.find(
      c => c.type === 'note' && c.title === '封面'
    );
    if (coverNote && coverNote.images && coverNote.images.length > 0) {
      return coverNote.images[0];
    }
  }
  return folder.coverImage || directImages[0] || null;
}

// ========== 笔记视觉 ==========

function createNoteVisual(node) {
  const visualEl = document.createElement('div');
  visualEl.className = 'note-visual';

  if (node.images && node.images.length > 0) {
    const img = document.createElement('img');
    img.className = 'note-image';
    img.src = node.images[0];
    img.alt = node.title;
    img.loading = 'lazy';
    visualEl.appendChild(img);
  } else {
    const textEl = document.createElement('div');
    textEl.className = 'note-text';
    textEl.innerHTML = node.html || `<p>${escapeHtml(node.textContent || '空文档')}</p>`;
    visualEl.appendChild(textEl);
  }

  return visualEl;
}

// ========== 文件模态框 ==========

function openFileModal(node) {
  const modal = document.createElement("div");
  modal.id = "file-modal";
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-content">
      <button class="modal-close">✕</button>
      <div class="modal-split">
        <section class="modal-left">
          <h2 class="modal-left-title"></h2>
          <div class="modal-hero"></div>
          <div class="modal-body"></div>
        </section>
        <aside class="modal-right">
          <h3 class="modal-right-title"></h3>
          <div class="modal-grid"></div>
        </aside>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add("visible"));

  const titleEl = modal.querySelector(".modal-left-title");
  const heroEl = modal.querySelector(".modal-hero");
  const bodyEl = modal.querySelector(".modal-body");
  const rightTitleEl = modal.querySelector(".modal-right-title");
  const gridEl = modal.querySelector(".modal-grid");

  const renderInModal = current => {
    state.activeFile = current.id;
    titleEl.textContent = current.title || "";
    const hero = (current.images && current.images[0]) || "";
    heroEl.innerHTML = hero ? `<img src="${hero}" alt="${escapeHtml(current.title || "")}" />` : "";
    heroEl.classList.toggle("is-empty", !hero);
    bodyEl.innerHTML = buildDetailBodyHtml(current.html || "<p>空文档</p>", hero);

    const linked = getLinkedNotes(current);
    const entries = linked.length > 0 ? linked : getSiblingEntries(current);
    rightTitleEl.textContent = linked.length > 0 ? "双链入口" : "同级入口";
    gridEl.innerHTML = "";

    if (entries.length === 0) {
      gridEl.innerHTML = '<div class="modal-grid-empty">暂无可跳转内容</div>';
      return;
    }

    entries.forEach(entry => {
      const card = createRightEntryCard(entry, nextNode => renderInModal(nextNode));
      gridEl.appendChild(card);
    });
  };

  renderInModal(node);

  const closeModal = () => {
    modal.classList.remove("visible");
    setTimeout(() => modal.remove(), 300);
    state.activeFile = null;
  };

  modal.querySelector(".modal-close").addEventListener("click", closeModal);
  modal.querySelector(".modal-backdrop").addEventListener("click", closeModal);

  const handleEsc = e => {
    if (e.key === "Escape") {
      closeModal();
      document.removeEventListener("keydown", handleEsc);
    }
  };
  document.addEventListener("keydown", handleEsc);
}

function getLinkedNotes(noteNode) {
  const html = noteNode.html || "";
  const reg = /<a[^>]+href="([^"]+)"/g;
  const seen = new Set();
  const hits = [];
  let m;

  while ((m = reg.exec(html)) !== null) {
    const raw = (m[1] || "").split("#")[0].split("?")[0];
    const normalized = normalizePath(raw);
    if (!normalized || !normalized.endsWith(".md")) continue;
    const hit = state.noteByPublicPath.get(normalized);
    if (!hit || hit.id === noteNode.id || seen.has(hit.id)) continue;
    seen.add(hit.id);
    hits.push({ node: hit, type: "note" });
  }

  return hits;
}

function getSiblingEntries(noteNode) {
  const parentId = state.parentById.get(noteNode.id);
  if (!parentId) return [];
  const parent = state.nodeById.get(parentId);
  if (!parent || !parent.children) return [];

  return parent.children
    .filter(child => child.id !== noteNode.id)
    .map(child => ({ node: child, type: child.type }));
}

function createRightEntryCard(entry, onOpen) {
  const el = document.createElement("button");
  el.className = "right-entry";
  el.type = "button";

  const targetNode = entry.type === "folder" ? pickDisplayNote(entry.node) : entry.node;
  const cover = pickEntryCover(entry.node);

  if (cover) {
    const img = document.createElement("img");
    img.className = "right-entry-cover";
    img.src = cover;
    img.alt = entry.node.title || "";
    img.loading = "lazy";
    el.appendChild(img);
  } else {
    const ph = document.createElement("div");
    ph.className = "right-entry-cover right-entry-placeholder";
    ph.textContent = entry.type === "folder" ? "文件夹" : "笔记";
    el.appendChild(ph);
  }

  const title = document.createElement("div");
  title.className = "right-entry-title";
  title.textContent = entry.node.title || "";
  el.appendChild(title);

  if (targetNode) {
    el.addEventListener("click", () => onOpen(targetNode));
  } else {
    el.disabled = true;
  }

  return el;
}

function pickEntryCover(node) {
  if (!node) return null;
  if (node.type === "note") return (node.images && node.images[0]) || null;
  return getFolderCover(node, collectDirectImages(node));
}

function pickDisplayNote(folder) {
  if (!folder || folder.type !== "folder") return null;
  const children = folder.children || [];
  for (const child of children) {
    if (child.type === "note") return child;
  }
  for (const child of children) {
    if (child.type === "folder") {
      const found = pickDisplayNote(child);
      if (found) return found;
    }
  }
  return null;
}

function buildDetailBodyHtml(rawHtml, heroSrc) {
  if (!heroSrc) return rawHtml;

  const wrap = document.createElement("div");
  wrap.innerHTML = rawHtml;
  const normalizedHero = normalizePath(heroSrc);
  const firstMatched = [...wrap.querySelectorAll("img")]
    .find(img => normalizePath(img.getAttribute("src") || "") === normalizedHero);
  if (firstMatched) firstMatched.remove();
  return wrap.innerHTML;
}

// ========== 工具 ==========

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function applyCustomBackgroundIfExists() {
  const img = new Image();
  img.onload = () => {
    document.body.classList.add("custom-bg");
  };
  img.src = "background.jpg";
}
