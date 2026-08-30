INSERT OR IGNORE INTO competition_settings(key,value_json,updated_at) VALUES
('contest','{"slug":"guyun","submission":{"startAt":null,"endAt":null},"voting":{"startAt":null,"endAt":null}}',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('cost_circuit','{"open":true,"dailyAudioBytes":0,"dailyDistinctIds":0}',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
