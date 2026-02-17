const avatarEl = document.getElementById("avatar");
const profileTitleEl = document.getElementById("profile-title");
const profileContentEl = document.getElementById("profile-content");
const treeRootEl = document.getElementById("tree-root");

if (avatarEl) {
  avatarEl.onerror = () => { avatarEl.src = "assets/img/avatar-fallback.svg"; };
}

const HOVER_DELAY = 520; // 悬停多久后才旋转（毫秒）
const HOVER_COOLDOWN = 420; // 切换后冷却周期，避免过快连续跳转
let hoverTimer = null;

const state = {
  tree: {},
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
    state.levels = [{
      nodes: tree.children,
      expandedIndex: null,
      focusIndex: Math.floor(tree.children.length / 2)
    }];
    initCards();
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
  state.activeFile = node.id;

  const modal = document.createElement('div');
  modal.id = 'file-modal';
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-content">
      <button class="modal-close">✕</button>
      <h2>${escapeHtml(node.title)}</h2>
      <div class="modal-body">${node.html || '<p>空文档</p>'}</div>
    </div>
  `;

  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('visible'));

  const closeModal = () => {
    modal.classList.remove('visible');
    setTimeout(() => modal.remove(), 300);
    state.activeFile = null;
  };

  modal.querySelector('.modal-close').addEventListener('click', closeModal);
  modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);

  const handleEsc = e => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', handleEsc);
    }
  };
  document.addEventListener('keydown', handleEsc);
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
