export const recommendationTypes = [
  { key: 'books', label: '书籍', subtitle: '留在书架，也留在脑海。', linkLabel: '了解这本书', limit: 4 },
  { key: 'games', label: '游戏', subtitle: '值得亲自走进去的世界。', linkLabel: '查看游戏', limit: 2 },
  { key: 'software', label: '软件', subtitle: '让日常更顺手的工具。', linkLabel: '访问官网', limit: 4 },
  { key: 'hardware', label: '硬件', subtitle: '用得顺手，留在身边。', linkLabel: '了解产品', limit: 2 },
  { key: 'people', label: '人物', subtitle: '从他们的创作与思考中获得启发。', linkLabel: '访问主页', limit: 4 },
];

export function recommendationType(label) {
  return recommendationTypes.find(type => type.label === label);
}

export function hasRecommendationBody(html = '') {
  return /<(?:img|iframe|video|audio|table|hr)\b/i.test(html)
    || html.replace(/<[^>]*>/g, '').replace(/&(?:nbsp|#160|#xA0);/gi, '').trim().length > 0;
}

export function sortRecommendations(items) {
  return [...items].sort((a, b) => {
    const left = a.data ?? a, right = b.data ?? b;
    return Number(!!right.featured) - Number(!!left.featured)
      || (left.sortOrder ?? Infinity) - (right.sortOrder ?? Infinity)
      || new Date(right.pubDate).valueOf() - new Date(left.pubDate).valueOf()
      || a.id.localeCompare(b.id);
  });
}
