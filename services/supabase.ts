
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const getLocalConfig = () => {
    try {
        const stored = typeof window !== 'undefined' ? localStorage.getItem('rythu_supabase_config') : null;
        if (stored) return JSON.parse(stored);
    } catch (e) { console.error("Invalid Supabase Config", e); }
    return null;
};

const config = getLocalConfig();

export const supabase = config && config.url && config.key 
    ? createClient(config.url, config.key) 
    : null;

export const isSupabaseConfigured = () => !!supabase;

// Schema Definition for User Reference
export const SQL_SCHEMA = `
-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE,
  mobile TEXT,
  role TEXT,
  password TEXT,
  status TEXT DEFAULT 'Active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE,
  is_new INTEGER DEFAULT 0,
  is_updated INTEGER DEFAULT 0
);

-- 2. Files Table
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  file_name TEXT,
  module TEXT,
  upload_date TIMESTAMP WITH TIME ZONE,
  row_count INTEGER,
  columns TEXT[],
  metadata JSONB
);

-- 3. Records Table (Stores Dynamic Excel Data)
CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  file_id TEXT REFERENCES files(id) ON DELETE CASCADE,
  module TEXT,
  data JSONB, -- Stores the dynamic Excel columns
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE,
  is_new INTEGER DEFAULT 0,
  is_modified INTEGER DEFAULT 0,
  is_highlighted INTEGER DEFAULT 0,
  image_url TEXT
);

-- 4. Attendance Table
CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  user_name TEXT,
  date DATE,
  timestamp TIMESTAMP WITH TIME ZONE,
  latitude FLOAT,
  longitude FLOAT,
  accuracy FLOAT,
  address TEXT,
  selfie_url TEXT,
  device_info TEXT,
  browser TEXT,
  jio_tag_status TEXT,
  map_url TEXT
);

-- 5. FMB Table
CREATE TABLE IF NOT EXISTS fmb (
  id TEXT PRIMARY KEY,
  survey_no TEXT,
  village TEXT,
  sketch_url TEXT,
  last_updated TEXT,
  file_type TEXT
);

-- 6. KML Table
CREATE TABLE IF NOT EXISTS kml (
  id TEXT PRIMARY KEY,
  file_name TEXT,
  uploaded_by TEXT,
  upload_date TEXT,
  size TEXT,
  url TEXT,
  google_earth_link TEXT,
  latitude FLOAT,
  longitude FLOAT
);

-- 7. Enable Row Level Security (Optional but recommended)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE records ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE fmb ENABLE ROW LEVEL SECURITY;
ALTER TABLE kml ENABLE ROW LEVEL SECURITY;

-- 8. Policies (Public Access for simplicity in this demo, restrict in production)
CREATE POLICY "Public Access" ON users FOR ALL USING (true);
CREATE POLICY "Public Access" ON files FOR ALL USING (true);
CREATE POLICY "Public Access" ON records FOR ALL USING (true);
CREATE POLICY "Public Access" ON attendance FOR ALL USING (true);
CREATE POLICY "Public Access" ON fmb FOR ALL USING (true);
CREATE POLICY "Public Access" ON kml FOR ALL USING (true);
`;
