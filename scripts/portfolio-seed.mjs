// Fictional records only. Uses the original Prisma schema and original reporting queries.
import {PrismaClient} from '@prisma/client';
const url=new URL(process.env.DATABASE_URL||'http://invalid');
if(url.hostname!=='127.0.0.1'||process.env.PORTFOLIO_SAMPLE!=='1')throw Error('This seed only runs in the portfolio local database.');
const db=new PrismaClient();
const day=n=>{const d=new Date();d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()+n);return d;};
const names=['Maya Linden','Theo Vale','Nora Finch','Jules Rowan','Ari Meadow','Clara Wren','Owen Brook','Lena Reed','Emery Shore','Iris Maple','Finn Alder','Sage Bell','Milo Frost','Zoe Clover','Remy Lane','Eden Moss','Luca Fern','Ada Birch'];
const brands=[{name:'Lumen Grove',product:'Daily Cream'},{name:'Tidewell',product:'Scalp Wash'},{name:'Fieldnote',product:'Sun Veil'}];
try {
 if(await db.organisation.findUnique({where:{id:'sample-studio'}})){console.log('Trackify sample database already exists.');process.exitCode=0;}
 else {
  await db.organisation.create({data:{id:'sample-studio',name:'Sample Studio'}});
  const team=['Alex Rivera','Jordan Vale','Sam Linden','Mira Chen','Theo Brooks','Nora Finch','Eli Rowan','Zoe Hart','Owen Reed','Isla Park'];
  await db.user.createMany({data:team.map((name,i)=>({id:i?'sample-user-'+i:'sample-editor',supabaseUserId:i?'sample-auth-'+i:'sample-auth-editor',name,email:name.toLowerCase().replace(' ','.')+'@example.invalid',role:i?'Editor':'Admin',organisationId:'sample-studio'}))});
  for(let b=0;b<brands.length;b++) {
    const brand=brands[b],campaignId='sample-campaign-'+b;
    await db.collection.create({data:{id:'sample-brand-'+b,name:brand.name,type:'brand',organisationId:'sample-studio'}});
    for(const type of ['paid','seeding'])await db.collection.create({data:{id:`sample-${b}-${type}`,name:type==='paid'?'Paid':'Seeding',type,parentId:'sample-brand-'+b,organisationId:'sample-studio'}});
    await db.campaign.create({data:{id:campaignId,name:brand.name+' · '+brand.product,brand:brand.name,stage:'Active',budget:6000+b*1500,startsAt:day(-35),endsAt:day(21),notes:'Fictional portfolio campaign. All messages, fees, and results are samples.',organisationId:'sample-studio'}});
    await db.workflowStatus.createMany({data:['Open','Contacted','Negotiating','Confirmed','Shipped','Posted','Completed'].map((label,i)=>({campaignId,label,color:['gray','blue','yellow','purple','orange','green','green'][i]}))});
    for(const type of ['paid','seeding'])await db.campaignSubcategory.create({data:{id:`sample-segment-${b}-${type}`,campaignId,name:type==='paid'?'Paid creators':'Seeding creators',trackerKind:type,collectionId:`sample-${b}-${type}`}});
  }
  for(let i=0;i<names.length;i++) {
    const name=names[i],b=i%3,type=i%2?'seeding':'paid',platform=['tiktok','instagram','youtube'][i%3],handle='portfolio_sample_'+String(i+1).padStart(2,'0');
    const profile=platform==='youtube'?`https://www.youtube.com/@${handle}`:`https://www.${platform}.com/@${handle}`;
    const accountId='sample-account-'+i;
    await db.account.create({data:{id:accountId,platform,handle,displayName:name,avatarUrl:'/sample-avatar.svg',organisationId:'sample-studio',firstTrackedAt:day(-40),lastRefreshAt:day(0)}});
    await db.influencer.create({data:{id:'sample-influencer-'+i,profile,name,email:handle+'@example.invalid',platform,followerCount:12000+i*4700,category:i%2?'Lifestyle':'Skincare',address:`${100+i} Example Lane (fictional)`,city:'Sample City',state:'CA',zipcode:'00000',organisationId:'sample-studio'}});
    for(let v=0;v<2;v++) {
      const id=`sample-video-${i}-${v}`,age=12+(i%6)*4+v*2,base=8000+i*2300+v*1700;
      const url=platform==='youtube'?`https://www.youtube.com/watch?v=Sample${String(i).padStart(3,'0')}${v}`:platform==='instagram'?`https://www.instagram.com/reel/Sample${i}${v}/`:`https://www.tiktok.com/@${handle}/video/${7100000000000000000n+BigInt(i*10+v)}`;
      await db.video.create({data:{id,platform,caption:`${brands[b].product}: ${v?'routine walkthrough':'first impressions'} · fictional sample`,thumbnailUrl:'/sample-video.svg',url,uploadDate:day(-age),accountId,organisationId:'sample-studio'}});
      const snapshots=[...new Set([age,Math.max(0,age-7),Math.max(0,age-14),7,0])].sort((a,b)=>b-a);
      const metric=ago=>{const views=Math.round(base*((age-ago+1)/(age+1)));return {views,likes:Math.round(views*.062),comments:Math.round(views*.004),shares:Math.round(views*.009),saves:Math.round(views*.013)};};
      await db.videoDailyMetric.createMany({data:snapshots.map(ago=>({videoId:id,date:day(-ago),...metric(ago)}))});
      await db.videoCurrentMetric.create({data:{videoId:id,capturedAt:day(0),source:'portfolio-simulation',...metric(0)}});
      await db.collectionItem.create({data:{collectionId:`sample-${b}-${type}`,videoId:id}});
      if(v===0)await db.campaignInfluencer.create({data:{id:'sample-assignment-'+i,campaignId:'sample-campaign-'+b,influencerId:'sample-influencer-'+i,subcategoryId:`sample-segment-${b}-${type}`,trackerKind:type,status:['Contacted','Negotiating','Confirmed','Shipped','Posted','Completed'][i%6],rate:type==='paid'?450+i*25:0,finalLink:i%6>=4?url:null,contactedAt:day(-25),shippedAt:i%6>=3?day(-15):null,deliveryStatus:i%6>=4?'Delivered (simulation)':null,notes:'Sample relationship record. No email or shipment will be sent.',gmailThreads:[{id:'sample-thread-'+i,gmailThreadId:'abcdef123450'+i,url:'https://mail.google.com/mail/u/0/#all/abcdef123450'+i,subject:`[Simulation] ${brands[b].name} collaboration`,lastMessageAt:day(-3).toISOString().slice(0,10),notes:'Fictional conversation'}],trackerFields:{priority:i%3?'Normal':'High',nextStep:'Review the fictional brief',dueDate:day(7).toISOString().slice(0,10),paymentStatus:type==='paid'?'Pending':'Not applicable'}}});
    }
  }
  await db.gmailConnection.create({data:{userId:'sample-editor',gmailEmail:'alex.rivera@example.invalid',encryptedAccessToken:'simulation-no-credential',scope:'local-simulation'}});
  await db.metricRefreshRun.create({data:{organisationId:'sample-studio',source:'portfolio-simulation',status:'success',videosChecked:36,succeeded:36,metricsSynced:36,startedAt:day(0),finishedAt:day(0)}});
  console.log('Trackify: 3 campaigns, 18 creators, 36 videos, related snapshots and 10 fictional team members seeded.');
 }
} finally {await db.$disconnect();}
