CREATE TABLE public_access_daily (day TEXT NOT NULL, subject_hash TEXT NOT NULL, public_id TEXT NOT NULL, requests INTEGER NOT NULL DEFAULT 0, bytes INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day,subject_hash,public_id));
CREATE INDEX public_access_day ON public_access_daily(day,subject_hash);
