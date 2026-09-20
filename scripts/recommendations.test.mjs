import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { metadata, collectSnapshot } from './sync-notion.mjs';
import { buildSectionPaths } from '../src/section-routes.mjs';
import { hasRecommendationBody, sortRecommendations } from '../src/recommendations.mjs';
import { contentPaths } from './content-routes.mjs';

const config=JSON.parse(await readFile(new URL('../notion.config.json',import.meta.url),'utf8'));
const adapter=config.sources.content.layouts['推荐陈列'];
const common=config.sources.content.commonFields;
const section={key:'recommendations',path:'/recommendations',layout:'推荐陈列',enabled:true,contentSource:'推荐',sourceId:'recs',name:'推荐'};
const rt=text=>[{type:'text',plain_text:text,text:{content:text}}];
const page=(status='已发布')=>({id:'test-page',created_time:'2026-09-20T00:00:00Z',last_edited_time:'2026-09-20T00:00:00Z',parent:{data_source_id:'recs'},properties:{
  名称:{title:rt('书籍测试')},推荐语:{rich_text:rt('一段推荐理由')},类型:{select:{name:'书籍'}},副标题:{rich_text:rt('作者')},链接:{url:'https://example.com/book'},路径:{rich_text:rt('test-page')},排序:{number:0},精选:{checkbox:true},发布状态:{select:{name:status}},图片:{files:[{type:'external',external:{url:'https://example.com/book.jpg'}}]},
}});
const schema={properties:Object.fromEntries(Object.entries({名称:'title',推荐语:'rich_text',类型:'select',副标题:'rich_text',链接:'url',排序:'number',精选:'checkbox',发布状态:'select',图片:'files',发布日期:'date',路径:'rich_text',标签:'multi_select'}).map(([name,type])=>[name,{type}]))};

test('recommendations validate types and URLs, read their own fields, and never publish drafts',()=>{
  const context={section,common,adapter};
  const result=metadata(page(),context);
  assert.equal(result.title,'书籍测试'); assert.equal(result.description,'一段推荐理由');
  assert.equal(result.recommendationType,'书籍'); assert.equal(result.sortOrder,0);
  assert.equal(metadata(page('草稿'),context),null);
  const invalid=page(); invalid.properties.类型.select=null;
  assert.throws(()=>metadata(invalid,context),/必须选择类型/);
  invalid.properties.类型.select={name:'游戏'}; invalid.properties.链接.url='javascript:alert(1)';
  assert.throws(()=>metadata(invalid,context),/HTTPS/);
});

test('incremental recommendation publication updates only its target and resolves its image',async()=>{
  const previous=[{id:'existing',kind:'article',moduleKey:'writing',modulePath:'/blog',sourcePageId:'existing',html:'unchanged'}];
  const request=async path=>{
    if(path==='data_sources/recs') return schema;
    if(path==='pages/test-page') return page();
    if(path.startsWith('blocks/test-page/')) return {results:[{type:'paragraph',paragraph:{rich_text:rt('长评')}}],has_more:false};
    throw new Error('unexpected '+path);
  };
  const result=await collectSnapshot({config,request,media:async file=>file.external.url,previous,targets:[{id:'test-page',type:'article-button'}],sections:[section]});
  assert.deepEqual(result.find(item=>item.id==='existing'),previous[0]);
  assert.equal(result.find(item=>item.id==='test-page').cover,'https://example.com/book.jpg');
  assert.equal(result.find(item=>item.id==='test-page').html,'<p>长评</p>');
  const withdrawn=await collectSnapshot({config,request:async path=>path==='data_sources/recs'?schema:page('草稿'),previous:result,targets:[{id:'test-page',type:'page.properties_updated'}],sections:[section]});
  assert.deepEqual(withdrawn,previous);
});

test('empty Notion paragraphs do not create detail pages; media-only bodies do',()=>{
  assert.equal(hasRecommendationBody('<p> </p><p>&nbsp;</p>'),false);
  assert.equal(hasRecommendationBody('<figure><img src="/cover.png"></figure>'),true);
  const items=[{id:'short',data:{moduleKey:'recommendations',html:'<p></p>'}},{id:'long',data:{moduleKey:'recommendations',html:'<p>正文</p>'}}];
  const routes=buildSectionPaths({sections:[section],posts:[],projects:[],recommendations:items});
  assert.equal(routes.length,7);
  assert.ok(routes.some(route=>route.params.path==='recommendations/category/people'));
  assert.ok(routes.some(route=>route.params.path==='recommendations/long'));
  assert.ok(!routes.some(route=>route.params.path==='recommendations/short'));
  const manifest=contentPaths(items.map(item=>({id:item.id,...item.data,kind:'recommendation',modulePath:section.path})),[section]);
  assert.ok(manifest.includes('/recommendations/category/books/'));
  assert.ok(!manifest.includes('/recommendations/short/'));
});

test('featured first, then explicit order (including zero), then date; sorting does not mutate input',()=>{
  const items=[{id:'a',sortOrder:null,pubDate:'2026-09-20'},{id:'b',sortOrder:0,pubDate:'2026-09-18'},{id:'c',featured:true,sortOrder:8,pubDate:'2026-09-17'}];
  assert.deepEqual(sortRecommendations(items).map(item=>item.id),['c','b','a']);
  assert.deepEqual(items.map(item=>item.id),['a','b','c']);
});
