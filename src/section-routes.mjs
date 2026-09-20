import { recommendationTypes, hasRecommendationBody, sortRecommendations } from './recommendations.mjs';

export function buildSectionPaths({sections,posts,projects,recommendations=[]}) {
  const paths=[];
  for (const section of sections.filter(section=>section.enabled && section.path !== '/')) {
    const path=section.path.slice(1);
    if (section.layout === '普通页面') {
      paths.push({params:{path},props:{view:'page',section}});
      continue;
    }
    if (section.layout === '推荐陈列') {
      const items=sortRecommendations(recommendations.filter(item=>item.data.moduleKey===section.key));
      paths.push({params:{path},props:{view:'recommendations',section,items}});
      for (const category of recommendationTypes) {
        paths.push({params:{path:`${path}/category/${category.key}`},props:{view:'recommendations',section,items,category}});
      }
      for (const item of items.filter(item=>hasRecommendationBody(item.data.html))) {
        paths.push({params:{path:`${path}/${item.id}`},props:{view:'recommendation',section,item}});
      }
      continue;
    }
    const collection=section.layout === '项目网格'?projects:posts;
    const items=collection.filter(item=>item.data.moduleKey === section.key);
    const stream=section.layout === '动态流';
    paths.push({params:{path},props:{view:section.layout === '项目网格'?'projects':stream?'thoughts':'archive',section,items}});
    for (const item of items) paths.push({params:{path:`${path}/${item.id}`},props:{view:section.layout === '项目网格'?'project':stream?'thought':'article',section,item,items}});
  }
  return paths;
}
