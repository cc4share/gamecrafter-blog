export const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const plainText = (items = []) => items.map(item => item.plain_text ?? item.text?.content ?? item.equation?.expression ?? '').join('');

export function safeUrl(value) {
  try {
    const url = new URL(value);
    if (['https:', 'http:', 'mailto:'].includes(url.protocol)) return url.href;
  } catch {}
  return null;
}

function youtubeStart(value) {
  if (!value) return 0;
  if (/^\d+$/.test(value)) return Number(value);
  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!match || !match.slice(1).some(Boolean)) return 0;
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
}

export function youtubeEmbedUrl(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    const parts = url.pathname.split('/').filter(Boolean);
    let id = '';
    if (host === 'youtu.be') id = parts[0] || '';
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
      else if (['embed', 'shorts', 'live', 'v'].includes(parts[0])) id = parts[1] || '';
    } else if (['youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host) && parts[0] === 'embed') id = parts[1] || '';
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
    const start = youtubeStart(url.searchParams.get('start') || url.searchParams.get('t'));
    return `https://www.youtube-nocookie.com/embed/${id}${start > 0 ? `?start=${start}` : ''}`;
  } catch {}
  return null;
}

function youtubeFromRichText(items = []) {
  if (items.length !== 1) return null;
  const item = items[0];
  return youtubeEmbedUrl(item.href ?? item.text?.link?.url ?? plainText(items).trim());
}

function youtubeFigure(src, caption = []) {
  return '<figure class="notion-video notion-youtube"><div class="notion-video-frame"><iframe src="' + escapeHtml(src) + '" title="YouTube 视频" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>' + (caption?.length ? '<figcaption>' + richText(caption) + '</figcaption>' : '') + '</figure>';
}

export function richText(items = []) {
  return items.map(item => {
    let value = escapeHtml(plainText([item])).replaceAll('\n', '<br>');
    const a = item.annotations ?? {};
    if (a.code) value = '<code>' + value + '</code>';
    if (a.bold) value = '<strong>' + value + '</strong>';
    if (a.italic) value = '<em>' + value + '</em>';
    if (a.strikethrough) value = '<s>' + value + '</s>';
    if (a.underline) value = '<u>' + value + '</u>';
    // Do not turn Notion page mentions into links to private workspace pages.
    const href = item.type === 'mention' ? null : safeUrl(item.href ?? item.text?.link?.url);
    return href ? '<a href="' + escapeHtml(href) + '" rel="noopener noreferrer">' + value + '</a>' : value;
  }).join('');
}

// The only HTML published by the sync is generated here; Notion text is escaped.
export async function renderBlocks(blocks, { children, media, publishedLinks = new Map() }, depth = 0) {
  if (depth > 24) throw new Error('Notion 内容嵌套超过 24 层');
  let html = '', list = null;
  const closeList = () => { if (list) html += '</' + list + '>'; list = null; };
  for (const block of blocks) {
    if (block.archived || block.in_trash || block.is_archived) continue;
    const type = block.type, body = block[type] ?? {};
    const listType = type === 'bulleted_list_item' ? 'ul' : type === 'numbered_list_item' ? 'ol' : null;
    if (list !== listType) { closeList(); if (listType) { list = listType; html += '<' + list + '>'; } }
    const text = richText(body.rich_text);
    const nested = async () => block.has_children ? renderBlocks(await children(block.id), {children, media, publishedLinks}, depth + 1) : '';
    switch (type) {
      case 'paragraph': {
        const youtube = youtubeFromRichText(body.rich_text);
        html += (youtube ? youtubeFigure(youtube) : '<p>' + text + '</p>') + await nested(); break;
      }
      case 'heading_1': case 'heading_2': case 'heading_3': {
        const tag = 'h' + Math.min(Number(type.at(-1)) + 1, 4);
        html += '<' + tag + '>' + text + '</' + tag + '>' + await nested(); break;
      }
      case 'bulleted_list_item': case 'numbered_list_item': html += '<li>' + text + await nested() + '</li>'; break;
      case 'to_do': html += '<div class="notion-todo"><span aria-label="' + (body.checked ? '已完成' : '未完成') + '">' + (body.checked ? '☑' : '☐') + '</span> ' + text + await nested() + '</div>'; break;
      case 'quote': case 'callout': html += '<blockquote>' + text + await nested() + '</blockquote>'; break;
      case 'toggle': html += '<details><summary>' + text + '</summary>' + await nested() + '</details>'; break;
      case 'code': html += '<pre><code>' + escapeHtml(plainText(body.rich_text)) + '</code></pre>'; break;
      case 'equation': html += '<pre class="equation">' + escapeHtml(body.expression) + '</pre>'; break;
      case 'divider': html += '<hr>'; break;
      case 'image': {
        const src = await media(body, block.id);
        if (!src) throw new Error('图片缺少可用地址');
        html += '<figure><img src="' + escapeHtml(src) + '" alt="' + escapeHtml(plainText(body.caption)) + '" loading="lazy">' + (body.caption?.length ? '<figcaption>' + richText(body.caption) + '</figcaption>' : '') + '</figure>'; break;
      }
      case 'file': case 'pdf': case 'audio': case 'video': {
        const youtube = type === 'video' ? youtubeEmbedUrl(body.external?.url ?? body.file?.url) : null;
        if (youtube) { html += youtubeFigure(youtube, body.caption); break; }
        const src = await media(body, block.id);
        if (src) html += '<p><a href="' + escapeHtml(src) + '">' + escapeHtml(body.name || plainText(body.caption) || ({pdf:'查看 PDF',file:'下载附件',audio:'播放音频',video:'观看视频'}[type])) + '</a></p>'; break;
      }
      case 'bookmark': case 'embed': case 'link_preview': {
        const href = safeUrl(body.url);
        const youtube = youtubeEmbedUrl(href);
        if (youtube) html += youtubeFigure(youtube, body.caption);
        else if (href) html += '<p><a href="' + escapeHtml(href) + '" rel="noopener noreferrer">' + (richText(body.caption) || escapeHtml(href)) + '</a></p>'; break;
      }
      case 'table': {
        const rows = await children(block.id);
        html += '<table><tbody>';
        for (let i = 0; i < rows.length; i++) {
          if (rows[i].type !== 'table_row') throw new Error('Notion 表格内容不完整');
          html += '<tr>' + rows[i].table_row.cells.map((cell,j) => { const tag = (i === 0 && body.has_column_header) || (j === 0 && body.has_row_header) ? 'th' : 'td'; return '<'+tag+'>'+richText(cell)+'</'+tag+'>'; }).join('') + '</tr>';
        }
        html += '</tbody></table>'; break;
      }
      case 'column_list': case 'column': html += '<div>' + await nested() + '</div>'; break;
      case 'link_to_page': {
        const href = publishedLinks.get(body.page_id);
        if (href) html += '<p><a href="' + escapeHtml(href) + '">阅读相关文章</a></p>'; break;
      }
      case 'child_page': html += '<p>' + escapeHtml(body.title) + '</p>'; break;
      case 'child_database': html += '<p>' + escapeHtml(body.title) + '</p>'; break;
      case 'table_of_contents': case 'breadcrumb': break;
      // Synced blocks may originate outside the blog database; never publish them implicitly.
      default: throw new Error('不支持的 Notion 区块：' + type + '。请换成普通文本、列表、表格、图片或附件。');
    }
  }
  closeList();
  return html;
}
