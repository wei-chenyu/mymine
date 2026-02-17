const avatarEl = document.getElementById("avatar");
const profileTitleEl = document.getElementById("profile-title");
const profileContentEl = document.getElementById("profile-content");
const treeRootEl = document.getElementById("tree-root");

if (avatarEl) {
  avatarEl.onerror = () => { avatarEl.src = "assets/img/avatar-fallback.svg"; };
}

const state = {
  tree: {},
  // 层级栈：每层 { nodes, expandedIndex }
  // levels[0] = 顶层，levels[last] = 当前活跃层
  levels: [],
  hoveredKey: null, // "level-idx"
  transitioning: false,
  activeFile: null
};

// ========== 初始化 ==========

fetch("assets/data/manifest.json", { cache: "no-cache" })
  .then(r => r.json())
  .then(tree => {
    if (tree.profile) renderProfile(tree.profile);
    if (!tree.children || tree.children.length === 0) {
      renderEmpty("暂无内容，请在 content 里添加文件夹或 Markdown。");
      return;
    }
    state.tree = tree;
    state.levels = [{ nodes: tree.children, expandedIndex: null }];
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

// ========== 初始卡片渲染 ==========

function initCards() {
  const container = treeRootEl;
  container.innerHTML = '';

  state.levels[0].nodes.forEach((node, i) => {
    const el = createCardElement(node);
    el.dataset.level = '0';
    el.dataset.idx = String(i);
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

// ========== 布局计算：所有层级共存 ==========

function layoutAll() {
  const container = treeRootEl;
  const activeLevel = state.levels.length - 1;
  const containerW = container.clientWidth || 1200;

  state.levels.forEach((level, L) => {
    const cards = container.querySelectorAll(`[data-level="${L}"]`);
    const count = level.nodes.length;
    if (count === 0) return;
    const centerIdx = Math.floor(count / 2);

    if (L === activeLevel) {
      // 活跃层：正常轮播布局
      const spacing = Math.min(260, Math.max(140, (containerW * 0.7) / Math.max(count, 2)));
      const scaleStep = 0.09;

      cards.forEach(el => {
        const idx = parseInt(el.dataset.idx);
        const offset = idx - centerIdx;
        const dist = Math.abs(offset);

        let hoverShift = 0;
        if (state.hoveredKey === `${L}-${idx}` && offset !== 0) {
          hoverShift = -offset * 35;
        }

        const x = offset * spacing + hoverShift;
        const scale = Math.max(0.58, 1 - dist * scaleStep);
        const zIndex = 100 - dist * 10 + (state.hoveredKey === `${L}-${idx}` ? 20 : 0);
        const opacity = Math.max(0.3, 1 - dist * 0.2);

        el.style.transform = `translateX(${x}px) scale(${scale})`;
        el.style.zIndex = zIndex;
        el.style.opacity = opacity;
        el.style.pointerEvents = '';
        el.classList.remove('dimmed-parent');
      });

    } else {
      // 父层：缩小、上移、半透明，保持可见作为上下文
      const depthDiff = activeLevel - L;
      const spacing = 55;

      cards.forEach(el => {
        const idx = parseInt(el.dataset.idx);
        const offset = idx - centerIdx;
        const isExpanded = idx === level.expandedIndex;

        const x = offset * spacing;
        const y = -(170 + depthDiff * 25);
        const scale = Math.max(0.14, 0.26 - depthDiff * 0.04);
        const opacity = isExpanded ? 0.35 : 0.1;
        const zIndex = 8 - depthDiff;

        el.style.transform = `translateX(${x}px) translateY(${y}px) scale(${scale})`;
        el.style.zIndex = zIndex;
        el.style.opacity = opacity;
        // 展开的那张卡片可点击（点击返回该层）
        el.style.pointerEvents = isExpanded ? '' : 'none';
        el.classList.toggle('dimmed-parent', true);
      });
    }
  });
}

// ========== 展开文件夹 ==========

function expandFolder(level, idx) {
  if (state.transitioning) return;
  const folder = state.levels[level].nodes[idx];
  if (!folder.children || folder.children.length === 0) return;

  state.transitioning = true;
  const container = treeRootEl;

  // 设置展开索引
  state.levels[level].expandedIndex = idx;

  // 获取点击卡片的当前屏幕位置作为子卡片出发点
  const clickedEl = container.querySelector(`[data-level="${level}"][data-idx="${idx}"]`);
  let originX = 0;
  if (clickedEl) {
    const cRect = container.getBoundingClientRect();
    const eRect = clickedEl.getBoundingClientRect();
    originX = (eRect.left + eRect.width / 2) - (cRect.left + cRect.width / 2);
  }

  // 添加新层
  const newLevelIdx = state.levels.length;
  const newLevel = { nodes: folder.children, expandedIndex: null };
  state.levels.push(newLevel);

  // 创建子卡片，全部从 originX 处开始
  newLevel.nodes.forEach((node, i) => {
    const el = createCardElement(node);
    el.dataset.level = String(newLevelIdx);
    el.dataset.idx = String(i);
    el.style.transition = 'none';
    el.style.transform = `translateX(${originX}px) scale(0.25)`;
    el.style.opacity = '0';
    el.style.zIndex = '200';
    container.appendChild(el);
    bindCardEvents(el, node, newLevelIdx, i);
  });

  // 动画：新卡片展开 + 父层缩小
  requestAnimationFrame(() => {
    container.querySelectorAll(`[data-level="${newLevelIdx}"]`).forEach(el => {
      el.style.transition = '';
    });

    requestAnimationFrame(() => {
      layoutAll();

      setTimeout(() => {
        // 清理临时 z-index
        container.querySelectorAll(`[data-level="${newLevelIdx}"]`).forEach(el => {
          el.style.zIndex = '';
        });
        layoutAll();
        state.transitioning = false;
      }, 550);
    });
  });
}

// ========== 收起：回到指定层级 ==========

function collapseToLevel(targetLevel) {
  if (state.transitioning) return;
  const activeLevel = state.levels.length - 1;
  if (targetLevel < 0 || targetLevel >= activeLevel) return;

  state.transitioning = true;
  const container = treeRootEl;

  // 要移除的层级
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
  state.hoveredKey = null;

  // 父层卡片恢复到正常布局
  requestAnimationFrame(() => {
    layoutAll();

    setTimeout(() => {
      // 移除被收起层的 DOM 元素
      for (let L = targetLevel + 1; L <= activeLevel; L++) {
        container.querySelectorAll(`[data-level="${L}"]`).forEach(el => el.remove());
      }
      state.transitioning = false;
    }, 550);
  });
}

// ========== 事件绑定 ==========

function bindCardEvents(el, node, level, idx) {
  const container = treeRootEl;

  el.addEventListener('mouseenter', () => {
    if (level === state.levels.length - 1) {
      state.hoveredKey = `${level}-${idx}`;
      layoutAll();
    }
  });

  el.addEventListener('mouseleave', () => {
    if (state.hoveredKey === `${level}-${idx}`) {
      state.hoveredKey = null;
      layoutAll();
    }
  });

  el.querySelector('.node-card').addEventListener('click', e => {
    e.stopPropagation();
    if (state.transitioning) return;

    const activeLevel = state.levels.length - 1;

    // 点击父层的卡片 → 收回到该层
    if (level < activeLevel) {
      collapseToLevel(level);
      return;
    }

    // 点击活跃层
    if (node.type === 'folder') {
      expandFolder(level, idx);
    } else {
      openFileModal(node);
    }
  });
}

// ========== 全局事件 ==========

// 点击空白区域 → 收回一层
document.addEventListener('click', e => {
  if (state.transitioning) return;
  if (e.target.closest('.node-card') || e.target.closest('.modal')) return;
  if (state.levels.length > 1) {
    collapseToLevel(state.levels.length - 2);
  }
});

// ESC → 收回一层
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (document.getElementById('file-modal')) return;
    if (state.levels.length > 1) {
      collapseToLevel(state.levels.length - 2);
    }
  }
});

// ========== 创建卡片元素 ==========

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
