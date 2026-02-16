const treeData = {
  id: 'root',
  title: '工作区',
  summary: '自由嵌套的模块树，每个节点都能承载图文/视频内容。',
  blocks: [
    { type: 'text', html: '<p>欢迎！左侧点击任何节点即可查看内容。你可以在 <code>treeData</code> 里自由增删层级，像 Obsidian 那样组织。</p>' },
  ],
  children: [
    {
      id: 'gallery',
      title: '画册 / Gallery',
      summary: '示例：混排图片与文本。',
      blocks: [
        { type: 'text', html: '<h2>画册封面</h2><p>这里放系列简介、创作理念等。</p>' },
        { type: 'image', src: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=80', alt: '山路', caption: '示例图 1' },
        { type: 'image', src: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1600&q=80', alt: '湖泊', caption: '示例图 2' },
      ],
      children: [
        {
          id: 'gallery-landscape',
          title: '子文件夹 · 风景',
          summary: '可以继续分系列。',
          blocks: [
            { type: 'text', html: '<p>把你的风景作品放进这一层，或者再往下拆分。</p>' },
            { type: 'image', src: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=80', alt: '海浪' }
          ]
        },
        {
          id: 'gallery-portrait',
          title: '子文件夹 · 人像',
          summary: '另一套系列。',
          blocks: [
            { type: 'image', src: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1400&q=80', alt: '人像' },
            { type: 'text', html: '<p>支持写长文说明，或链接到外部视频。</p>' }
          ]
        }
      ]
    },
    {
      id: 'dev',
      title: '产品 / 代码演示',
      summary: '放视频、截图、链接。',
      blocks: [
        { type: 'video', src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', caption: '示例视频，换成 ../media/your-demo.mp4 即可' },
        { type: 'text', html: '<p>可以附加 GitHub 仓库链接、技术栈说明等。</p>' },
        { type: 'link', href: 'https://github.com/wei-chenyu/mymine', label: 'GitHub: mymine' }
      ]
    },
    {
      id: 'notes',
      title: '随笔 / 文本',
      summary: '纯文本或混排都行。',
      blocks: [
        { type: 'text', html: '<h2>一则示例笔记</h2><p>用 HTML 写段落、列表、代码都可以。<br>也可把 Markdown 预先转成 HTML 粘贴。</p>' }
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
