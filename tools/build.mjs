import {cp,mkdir,rm,stat} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const arg=process.argv.slice(2);
if(arg.length!==0&&(arg.length!==2||arg[0]!=='--outdir'))throw new Error('usage: node tools/build.mjs [--outdir <path>]');
const dist=path.resolve(root,arg[1]??'dist');
if(dist===root)throw new Error('refusing to use the repository root as outdir');
const files=['index.html','admin.html','app.js','backend-config.js','styles.css','mingyun-integration.js','mingyun-integration.css','supabase-config.js','supabase-client.js'];
const assets=['hero-video.mp4','hero-video-mobile.mp4','music-spirits.jpg','spirit-yeye.mp4','spirit-momo.mp4','spirit-lulu.mp4'];
await rm(dist,{recursive:true,force:true});await mkdir(path.join(dist,'assets'),{recursive:true});
for(const f of files){await stat(path.join(root,f));await cp(path.join(root,f),path.join(dist,f));}
for(const f of assets){await stat(path.join(root,'assets',f));await cp(path.join(root,'assets',f),path.join(dist,'assets',f));}
await cp(path.join(root,'src/static/contest-ui.js'),path.join(dist,'contest-ui.js'));
console.log(`built output: ${files.length+assets.length+1} files; direct submission audio excluded`);
