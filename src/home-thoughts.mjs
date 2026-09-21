const cleanExcerpt=value=>value.replace(/<[^>]*>/g,' ').replace(/https?:\/\/\S+/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();

export function selectHomeThoughts(posts,sections) {
  const keys=new Set(sections.filter(section=>section.enabled&&section.layout==='动态流').map(section=>section.key));
  return posts.filter(item=>keys.has(item.data.moduleKey)&&!item.data.draft&&item.data.homeThought)
    .sort((a,b)=>new Date(b.data.pubDate).valueOf()-new Date(a.data.pubDate).valueOf())
    .map(item=>({href:`${item.data.modulePath}/${item.id}/`,text:cleanExcerpt(item.data.html?.match(/<p>([\s\S]*?)<\/p>/)?.[1]||item.data.description||item.data.title)}))
    .filter(item=>item.text).slice(0,5);
}
