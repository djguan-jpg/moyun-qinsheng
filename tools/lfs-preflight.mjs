import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const git=(args)=>{const result=spawnSync('git',args,{cwd:root,encoding:'utf8'});if(result.status!==0)throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);return result.stdout};
const manifest=JSON.parse(await readFile(path.join(root,'migration/production-partial-manifest.json'),'utf8'));
const listed=git(['lfs','ls-files','--name-only']).trim().split(/\r?\n/).filter(Boolean);
if(listed.length===0)throw new Error('no Git LFS files found');
const materialized=new Map();
for(const [index,name] of listed.entries()){
  const pointer=git(['show',`HEAD:${name}`]);
  const match=/^version https:\/\/git-lfs\.github\.com\/spec\/v1\r?\noid sha256:([0-9a-f]{64})\r?\nsize ([0-9]+)\r?\n?$/.exec(pointer);
  if(!match)throw new Error(`LFS item ${index+1}: invalid committed pointer`);
  const bytes=await readFile(path.join(root,name));
  const digest=createHash('sha256').update(bytes).digest('hex');
  if(bytes.length<=200&&bytes.toString('utf8').startsWith('version https://git-lfs.github.com/spec/v1'))throw new Error(`LFS item ${index+1}: pointer stub is not materialized; run git lfs pull && git lfs checkout`);
  if(bytes.length!==Number(match[2])||digest!==match[1])throw new Error(`LFS item ${index+1}: materialized bytes do not match pointer`);
  materialized.set(name,{size:bytes.length,digest});
}
if(manifest.works.length!==14)throw new Error(`immutable manifest count mismatch: ${manifest.works.length}`);
for(const [index,work] of manifest.works.entries()){
  const name=path.posix.join('media/submissions',work.filename);
  const item=materialized.get(name);
  if(!item)throw new Error(`manifest item ${index+1}: not tracked by Git LFS`);
  if(item.size!==work.size||item.digest!==work.sha256)throw new Error(`manifest item ${index+1}: immutable size/hash mismatch`);
}
console.log(`LFS preflight OK: tracked=${listed.length} materialized=${materialized.size} manifest=${manifest.works.length}`);
