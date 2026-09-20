// Explicit, idempotent CMS setup. Not run by the build or publication pipeline.
// Run with NOTION_CLI_SCRIPT pointing to the authenticated ntn entrypoint.
// Add --activate only after the recommendation layout has reached production.
import { readFile } from 'node:fs/promises';
import { createRequest, discoverSources } from './sync-notion.mjs';
import { recommendationTypes } from '../src/recommendations.mjs';

const config=JSON.parse(await readFile(new URL('../notion.config.json',import.meta.url),'utf8'));
const request=createRequest({token:process.env.NOTION_TOKEN,cliScript:process.env.NOTION_CLI_SCRIPT});
const rt=content=>[{type:'text',text:{content}}];
const sources=await discoverSources({request,config});
let sourceId=sources.byName.get('推荐');
if (!sourceId) {
  const source=await request('data_sources',{method:'POST',body:{
    parent:{database_id:config.databaseId},title:rt('推荐'),icon:{type:'emoji',emoji:'📚'},
    properties:{
      名称:{title:{}},类型:{select:{options:recommendationTypes.map(type=>({name:type.label,color:'default'}))}},
      图片:{files:{}},推荐语:{rich_text:{}},副标题:{rich_text:{}},链接:{url:{}},
      精选:{checkbox:{}},排序:{number:{format:'number'}},
      发布状态:{select:{options:[{name:'草稿',color:'gray'},{name:'已发布',color:'green'}]}},
      发布日期:{date:{}},路径:{rich_text:{}},标签:{multi_select:{options:[]}},
    },
  }});
  sourceId=source.id;
}
const source=await request('data_sources/'+sourceId);
const viewList=await request('views?database_id='+config.databaseId);
const existingViews=[];
for (const view of viewList.results) existingViews.push(await request('views/'+view.id));
for (const category of [null,...recommendationTypes]) {
  const name=category?`推荐 · ${category.label}`:'推荐';
  const existingView=existingViews.find(view=>view.data_source_id===sourceId && view.name===name);
  const shown=['名称',...(category?[]:['类型']),'图片','副标题','推荐语','链接','精选','排序','发布状态','发布'].filter(name=>source.properties[name]);
  const properties=[...shown,...Object.keys(source.properties).filter(name=>!shown.includes(name))].map(name=>({
    property_id:decodeURIComponent(source.properties[name].id),visible:shown.includes(name),
    width:name==='推荐语'?320:name==='名称'?220:name==='副标题'?180:120,wrap:true,
  }));
  await request(existingView?'views/'+existingView.id:'views',{method:existingView?'PATCH':'POST',body:{...(existingView?{}:{database_id:config.databaseId,data_source_id:sourceId}),name,type:'table',
    ...(category?{filter:{property:'类型',select:{equals:category.label}}}:{}),
    sorts:[{property:'精选',direction:'descending'},{property:'排序',direction:'ascending'}],
    configuration:{type:'table',wrap_cells:true,show_vertical_lines:false,properties},
  }});
}

const existing=await request('data_sources/'+sourceId+'/query',{method:'POST',body:{page_size:100}});
if (!existing.results.length) {
  const subtitles={books:'作者姓名',games:'类型 · 平台',software:'适用平台 · 用途',hardware:'品牌 · 型号',people:'领域 · 身份'};
  for (const type of recommendationTypes) await request('pages',{method:'POST',body:{
    parent:{data_source_id:sourceId},properties:{
      名称:{title:rt(`示例 · ${type.label}推荐（请替换）`)},类型:{select:{name:type.label}},
      副标题:{rich_text:rt(subtitles[type.key])},
      推荐语:{rich_text:rt('在这里写下你为什么推荐，以及适合什么样的人。')},
      发布状态:{select:{name:'草稿'}},
    },
  }});
}
console.log(JSON.stringify({sourceId,databaseUrl:config.databaseUrl,views:'推荐 + 五个分类视图',samples:'仅在空库初始化五条草稿'}));

const managementPage=sources.database.parent?.page_id;
if (managementPage) {
  const blocks=await request('blocks/'+managementPage+'/children?page_size=100');
  if (!blocks.results.some(block=>block.type==='child_page' && block.child_page.title==='推荐 · 使用说明')) {
    const paragraph=text=>({object:'block',type:'paragraph',paragraph:{rich_text:rt(text)}});
    const heading=text=>({object:'block',type:'heading_2',heading_2:{rich_text:rt(text)}});
    const doc=await request('pages',{method:'POST',body:{parent:{page_id:managementPage},properties:{title:{title:rt('推荐 · 使用说明')}},children:[
      paragraph('推荐栏目用于收藏书籍、游戏、软件、硬件和人物。进入 MyBlog 的「推荐」或「推荐 · 书籍」等分类视图开始编辑。五条示例均为草稿，请先替换成自己的真实推荐。'),
      heading('新增与发布'),
      paragraph('1. 在对应分类视图新增条目，确认「类型」正确。填写名称、推荐语，上传图片并填写官网或作品链接。副标题按需填写作者、平台、型号或人物领域。'),
      paragraph('2. 准备好后，把「发布状态」改为「已发布」。属性变化会自动同步；修改页面正文后点击该行的「发布」按钮。按钮只同步当前条目，不会把草稿改为已发布。'),
      paragraph('3. 改为「草稿」即可下线。同步触发后需要等待 Cloudflare 构建完成，网页不会即时变化。'),
      heading('短推荐与长评'),
      paragraph('「推荐语」直接显示在卡片上，适合写几句话。不需要长评时，页面正文留空即可。有正文、图片或视频时，网站会生成独立详情页并显示「阅读推荐理由」。'),
      heading('图片怎么选'),
      paragraph('书籍：约 2:3 竖版书封，完整显示。游戏：16:9 横版封面。软件：方形图标。硬件：主体完整、留白适中的产品图，完整显示。人物：方形头像，网站裁成圆形。图片留空也能显示文字。'),
      heading('排序与首页'),
      paragraph('同一类型内优先显示勾选「精选」的条目，然后按「排序」从小到大排列（可从 0 开始，留空排在有数字的条目后面），最后按发布日期倒序。总览每类显示少量内容，分类页显示全部。推荐不进入首页最近更新和文章 RSS。'),
      heading('页面标题与导航'),
      paragraph('在「栏目管理」中找到「推荐」，可修改导航名称、页面标题、简介或关闭栏目。网站路径为 https://gamecrafter.fun/recommendations/ 。请保留布局「推荐陈列」和内容数据源「推荐」。'),
    ]}});
    console.log(JSON.stringify({guideUrl:doc.url}));
  }
}

if (process.argv.includes('--activate')) {
  const sectionSource=sources.byName.get(config.sources.sections.name);
  const existingSection=await request('data_sources/'+sectionSource+'/query',{method:'POST',body:{filter:{property:'标识',rich_text:{equals:'recommendations'}}}});
  if (!existingSection.results.length) {
    const section=await request('pages',{method:'POST',body:{parent:{data_source_id:sectionSource},properties:{
      栏目:{title:rt('推荐')},标识:{rich_text:rt('recommendations')},路径:{rich_text:rt('/recommendations')},布局:{select:{name:'推荐陈列'}},
      启用:{checkbox:true},导航名称:{rich_text:rt('推荐')},显示在导航:{checkbox:true},导航排序:{number:45},
      页面标题:{rich_text:rt('值得推荐。')},页面简介:{rich_text:rt('一些喜欢的作品、用得顺手的工具，以及带来启发的人。')},
      首页展示:{checkbox:false},首页数量:{number:0},内容数据源:{rich_text:rt('推荐')},
    }}});
    console.log(JSON.stringify({sectionId:section.id,path:'/recommendations/'}));
  }
}
