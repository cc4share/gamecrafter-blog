import { hasRecommendationBody, recommendationTypes } from '../src/recommendations.mjs';

export function contentPaths(items, sections=[]) {
  const routes=[];
  for (const item of items) {
    if (item.kind==='recommendation' && !hasRecommendationBody(item.html)) continue;
    if (!/^\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.modulePath || '') || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id || '')) {
      throw new Error('生成内容路由时发现无效路径');
    }
    const path=item.modulePath+'/'+item.id;
    routes.push(path,path+'/',path+'/index.html');
  }
  for (const section of sections.filter(section=>section.enabled && section.layout==='推荐陈列')) {
    for (const type of recommendationTypes) {
      const path=`${section.path}/category/${type.key}`;
      routes.push(path,path+'/',path+'/index.html');
    }
  }
  return [...new Set(routes)];
}
