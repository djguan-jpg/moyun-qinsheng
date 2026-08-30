import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('owned legacy migration is forward-only and preserves imported objects',async()=>{
  const migration=await readFile('migrations/0005_owned_legacy_import.sql','utf8');
  const worker=await readFile('src/worker.js','utf8');
  assert.match(migration,/ALTER TABLE registrations ADD COLUMN display_order/);
  assert.match(migration,/preserve_audio_object/);
  assert.match(worker,/display_order sort_order FROM registrations/);
  assert.match(worker,/!old\.preserve_audio_object/);
  assert.doesNotMatch(worker,/1000000-id sort_order/);
});

test('public query is bounded, deterministic, and contains no private projection',async()=>{
  const worker=await readFile('src/worker.js','utf8');
  const query=worker.match(/SELECT public_id,sort_order FROM \(SELECT[\s\S]*?LIMIT \?/u)?.[0];
  assert.ok(query);
  assert.match(query,/ORDER BY sort_order,public_id LIMIT \?/);
  assert.doesNotMatch(query,/discord|contact|filename/i);
});
