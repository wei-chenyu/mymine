// 完全自由的示例树：你可任意增删、改标题、改内容类型。
const treeData = {
  id: 'root',
  title: '工作区',
  summary: '自由嵌套的模块树；每个节点都能放文字、图片、视频、链接。',
  blocks: [],
  children: [
    {
      id: 'node-a',
      title: '节点 A',
      summary: '示例：纯文本说明',
      blocks: [
        { type: 'text', html: '<p>这里是一个普通节点，写什么都行。用 HTML 自由排版。</p>' },
      ],
      children: [
        {
          id: 'node-a1',
          title: '子节点 A1',
          summary: '示例：再下一层',
          blocks: [
            { type: 'text', html: '<p>可继续嵌套更多层级。</p>' }
          ]
        }
      ]
    },
    {
      id: 'node-b',
      title: '节点 B',
      summary: '示例：图 + 视频混排',
      blocks: [
        { type: 'image', src: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=80', alt: '示例图', caption: '示例图片，可换成本地相对路径' },
        { type: 'video', src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', caption: '示例视频，可换 ../media/your.mp4' },
        { type: 'link', href: 'https://github.com/wei-chenyu/mymine', label: '示例链接' }
      ]
    }
  ]
};

const nodes = new Map();
const parentOf = new Map();
(function index(node, parent = null) {
  nodes.set(node.id, node);
  if (parent) parentOf.set(node.id, parent.id);
  (node.children || []).forEach(child => index(child, node));
})(treeData);

const treeContainer = document.getElementById('tree');
const contentEl = document.getElementById('content');
const titleEl = document.getElementById('title');
const summaryEl = document.getElementById('summary');
const breadcrumbEl = document.getElementById('breadcrumb');
let current = null;

function renderTree(node) {
  const ul = document.createElement('ul');
  ul.className = 'tree';
  (node.children || []).forEach(child => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'tree-btn';
    btn.textContent = child.title;
    btn.dataset.id = child.id;
    li.appendChild(btn);
    if (child.children && child.children.length) {
      li.appendChild(renderTree(child));
    }
    ul.appendChild(li);
  });
  return ul;
}

treeContainer.appendChild(renderTree(treeData));

treeContainer.addEventListener('click', (e) => {
  const btn = e.target.closest('.tree-btn');
  if (!btn) return;
  const node = nodes.get(btn.dataset.id);
  if (node) select(node);
});

function select(node) {
  current = node;
  titleEl.textContent = node.title;
  summaryEl.textContent = node.summary || '';
  breadcrumbEl.textContent = breadcrumb(node).join(' / ');
  renderBlocks(node.blocks || []);
  highlight(node.id);
}

function breadcrumb(node) {
  const path = [];
  let n = node;
  while (n) {
    path.unshift(n.title);
    const pid = parentOf.get(n.id);
    n = pid ? nodes.get(pid) : null;
  }
  return path;
}

function renderBlocks(blocks) {
  contentEl.innerHTML = '';
  if (!blocks.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = '这个节点还没有内容。';
    contentEl.appendChild(empty);
    return;
  }
  blocks.forEach(block => {
    const wrap = document.createElement('div');
    wrap.className = 'block';
    if (block.type === 'text') {
      wrap.innerHTML = block.html || '';
    } else if (block.type === 'image') {
      const fig = document.createElement('figure');
      const img = document.createElement('img');
      img.src = block.src;
      img.alt = block.alt || '';
      fig.appendChild(img);
      if (block.caption) {
        const cap = document.createElement('figcaption');
        cap.textContent = block.caption;
        fig.appendChild(cap);
      }
      wrap.appendChild(fig);
    } else if (block.type === 'video') {
      const vid = document.createElement('video');
      vid.controls = true;
      vid.src = block.src;
      wrap.appendChild(vid);
      if (block.caption) {
        const cap = document.createElement('div');
        cap.className = 'muted';
        cap.textContent = block.caption;
        wrap.appendChild(cap);
      }
    } else if (block.type === 'link') {
      const a = document.createElement('a');
      a.href = block.href;
      a.target = '_blank';
      a.rel = 'noreferrer';
      a.textContent = block.label || block.href;
      wrap.appendChild(a);
    }
    contentEl.appendChild(wrap);
  });
}

function highlight(id) {
  document.querySelectorAll('.tree-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.id === id));
}

// 默认选中第一项
if (treeData.children?.length) {
  select(treeData.children[0]);
}
