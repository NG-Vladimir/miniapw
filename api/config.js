export default function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    return res.status(500).json({ error: 'Config not set' });
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.json({ supabaseUrl: url, supabaseKey: key });
}
