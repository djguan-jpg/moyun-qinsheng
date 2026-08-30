"""Offline verified-backup reconciliation planner. Dry-run unless --apply is explicit."""
import argparse, datetime, hashlib, json, os, secrets, sqlite3, subprocess, tempfile
from pathlib import Path

def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''): h.update(block)
    return h.hexdigest()

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--sqlite',type=Path,required=True);p.add_argument('--uploads',type=Path,required=True);p.add_argument('--manifest',type=Path,required=True)
    p.add_argument('--target',default='guyun-contest-staging');p.add_argument('--bucket');p.add_argument('--apply',action='store_true')
    a=p.parse_args()
    for x in (a.sqlite,a.uploads,a.manifest):
        if not x.exists(): p.error(f'explicit path does not exist: {x}')
    if a.apply and ('staging' not in a.target.lower() or not a.bucket or 'staging' not in a.bucket.lower() or os.getenv('GUYUN_IMPORT_ALLOW_STAGING')!='YES'):
        p.error('apply requires a staging-named target and GUYUN_IMPORT_ALLOW_STAGING=YES')
    manifest=json.loads(a.manifest.read_text(encoding='utf-8'))
    expected={x['filename']:{'size':int(x['size']),'sha256':x['sha256'].lower()} for x in manifest['files']}
    actual={x.name:{'size':x.stat().st_size,'sha256':digest(x)} for x in a.uploads.iterdir() if x.is_file()}
    con=sqlite3.connect(f'file:{a.sqlite.resolve().as_posix()}?mode=ro',uri=True)
    integrity=con.execute('PRAGMA integrity_check').fetchall()
    if integrity!=[('ok',)]: raise SystemExit(f'SQLite integrity failure: {integrity}')
    tables={r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if not {'registrations','votes'}<=tables: raise SystemExit('required legacy tables missing')
    counts={t:con.execute(f'SELECT count(*) FROM {t}').fetchone()[0] for t in ('registrations','votes')}
    cols={r[1] for r in con.execute('PRAGMA table_info(registrations)')}
    audio_col=next((x for x in ('stored_filename','audio_filename','filename') if x in cols),None)
    if not audio_col: raise SystemExit('legacy audio filename column not recognized')
    referenced={r[0] for r in con.execute(f'SELECT {audio_col} FROM registrations WHERE {audio_col} IS NOT NULL')}
    mismatches={k:{'expected':v,'actual':actual.get(k)} for k,v in expected.items() if actual.get(k)!=v}
    plan={'mode':'apply' if a.apply else 'dry-run','target':a.target,'snapshot_sha256':digest(a.sqlite),'integrity':'ok','table_counts':counts,'manifest_files':len(expected),'actual_files':len(actual),'referenced_files':len(referenced),'missing_referenced':sorted(referenced-actual.keys()),'unreferenced_uploads':sorted(actual.keys()-referenced),'manifest_mismatches':mismatches}
    print(json.dumps(plan,ensure_ascii=False,indent=2,sort_keys=True))
    if plan['missing_referenced'] or plan['unreferenced_uploads'] or mismatches: raise SystemExit('reconciliation rejected: orphan or mismatch')
    if a.apply:
        now=datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z')
        q=lambda v:"NULL" if v is None else "'"+str(v).replace("'","''")+"'"
        rows=[dict(zip([x[0] for x in con.execute('SELECT * FROM registrations').description],r)) for r in con.execute('SELECT * FROM registrations')]
        object_keys={}
        for r in rows:
            fn=r.get(audio_col)
            if fn:
                key=f"active/{secrets.token_urlsafe(24)}";object_keys[fn]=key
                subprocess.run(['npx','wrangler','r2','object','put',f'{a.bucket}/{key}','--file',str(a.uploads/fn),'--remote'],check=True)
        lines=['PRAGMA foreign_keys=ON;','BEGIN IMMEDIATE;']
        voter_ids={r[0] for r in con.execute('SELECT DISTINCT voter_discord_id FROM votes')}
        for r in rows:
            uid=r['discord_user_id'];created=r['created_at'];updated=r.get('updated_at') or created
            lines.append(f"INSERT OR IGNORE INTO users VALUES({q(uid)},{q(r['discord_username'])},{q(r['display_name'])},'[]',{q(created)},{q(created)},{q(updated)});")
        for uid in voter_ids:
            lines.append(f"INSERT OR IGNORE INTO users VALUES({q(uid)},'legacy-voter','legacy-voter','[]',{q(now)},{q(now)},{q(now)});")
        stages={r[0] for r in con.execute('SELECT DISTINCT stage FROM votes')}
        for i,stage in enumerate(sorted(stages),1): lines.append(f"INSERT OR IGNORE INTO vote_stages(id,slug,title,opens_at,closes_at,active,created_at,updated_at) VALUES({i},{q(stage)},{q(stage)},'1970-01-01T00:00:00Z','1970-01-01T00:00:00Z',0,{q(now)},{q(now)});")
        for r in rows:
            fn=r.get(audio_col);pub=secrets.token_urlsafe(18);key=object_keys.get(fn);sha=actual.get(fn,{}).get('sha256');updated=r.get('updated_at') or r['created_at'];published=1 if fn and not r.get('is_test',0) else 0
            vals=[r['id'],pub,r['discord_user_id'],r['work_title'],r['category'],r['description'],r['contact_email'],key,fn,r.get('audio_content_type'),r.get('audio_size'),sha,'active' if fn else 'none',r.get('is_test',0),published,r['created_at'],updated]
            lines.append('INSERT INTO registrations(id,public_id,discord_user_id,title,category,description,contact_email,audio_object_key,audio_original_name,audio_content_type,audio_size,audio_sha256,audio_state,is_test,published,created_at,updated_at) VALUES('+','.join(q(x) for x in vals)+');')
        stage_ids={x:i for i,x in enumerate(sorted(stages),1)}
        for r in con.execute('SELECT id,registration_id,voter_discord_id,stage,created_at FROM votes'):
            lines.append(f"INSERT INTO votes(id,registration_id,voter_discord_id,stage_id,idempotency_key,created_at) VALUES({r[0]},{r[1]},{q(r[2])},{stage_ids[r[3]]},{q('legacy-'+str(r[0]))},{q(r[4])});")
        plan_json=json.dumps(plan,ensure_ascii=False,separators=(',',':'));lines.append(f"INSERT INTO migration_imports VALUES({q(plan['snapshot_sha256'])},{q(a.sqlite.name)},{q(plan_json)},{counts['registrations']},{counts['votes']},{len(actual)},{q(now)});");lines.append('COMMIT;')
        with tempfile.NamedTemporaryFile('w',suffix='.sql',encoding='utf-8',delete=False) as f: f.write('\n'.join(lines));sql_path=f.name
        try: subprocess.run(['npx','wrangler','d1','execute',a.target,'--remote','--file',sql_path],check=True)
        finally: os.unlink(sql_path)

if __name__=='__main__': main()
