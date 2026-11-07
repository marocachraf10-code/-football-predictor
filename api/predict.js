const K = 5, D = 0.97;
const pois = (l, k) => { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; };

function probs(xh, xa) {
  let h = 0, d = 0, a = 0, o25 = 0, bt = 0, sc = [];
  for (let i = 0; i <= 9; i++) for (let j = 0; j <= 9; j++) {
    const p = pois(xh, i) * pois(xa, j);
    if (i > j) h += p; else if (i == j) d += p; else a += p;
    if (i + j > 2) o25 += p;
    if (i && j) bt += p;
    sc.push([i + "-" + j, p]);
  }
  const t = h + d + a;
  sc.sort((x, y) => y[1] - x[1]);
  return { h: h / t, d: d / t, a: a / t, o25: o25 / t, bt: bt / t, top: sc.slice(0, 3).map(s => [s[0], s[1] / t]) };
}

module.exports = async (req, res) => {
  try {
    const comp = String(req.query.comp || "PL").replace(/[^A-Z0-9]/g, "");
    const H = { "X-Auth-Token": process.env.FD_TOKEN || "" };
    const base = "https://api.football-data.org/v4/competitions/" + comp + "/matches";
    const get = async (u) => {
      const r = await fetch(u, { headers: H });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || ("HTTP " + r.status));
      return j.matches || [];
    };
    const f = (d) => d.toISOString().slice(0, 10);
    const fin = await get(base + "?status=FINISHED");
    const up = (await get(base + "?dateFrom=" + f(new Date()) + "&dateTo=" + f(new Date(Date.now() + 3 * 864e5))))
      .filter((m) => m.status !== "FINISHED");

    fin.sort((a, b) => a.utcDate.localeCompare(b.utcDate));
    const S = {}, last = {};
    let sh = 0, sa = 0, n = 0;
    const g = (t) => S[t] || (S[t] = { f: 0, a: 0, n: 0 });
    for (const m of fin) {
      const hg = m.score.fullTime.home, ag = m.score.fullTime.away;
      if (hg == null || ag == null) continue;
      const h = g(m.homeTeam.name), a = g(m.awayTeam.name);
      for (const [x, gf, ga] of [[h, hg, ag], [a, ag, hg]]) {
        x.f = x.f * D + gf; x.a = x.a * D + ga; x.n = x.n * D + 1;
      }
      last[m.homeTeam.name] = m.utcDate; last[m.awayTeam.name] = m.utcDate;
      sh += hg; sa += ag; n++;
    }
    if (n < 20) throw new Error("مباريات قليلة فهاد الموسم باش نحسبو");
    const avg = (sh + sa) / (2 * n);
    const att = (t) => ((g(t).f + K * avg) / (g(t).n + K)) / avg;
    const def = (t) => ((g(t).a + K * avg) / (g(t).n + K)) / avg;
    const rf = (t, d) => {
      if (!last[t]) return 1;
      const r = (new Date(d) - new Date(last[t])) / 864e5;
      return r >= 5 ? 1 : r >= 4 ? 0.98 : r >= 3 ? 0.95 : 0.92;
    };

    const out = up.map((m) => {
      const h = m.homeTeam.name, a = m.awayTeam.name;
      const xh = Math.min(Math.max((sh / n) * att(h) * def(a) * rf(h, m.utcDate), 0.2), 4.5);
      const xa = Math.min(Math.max((sa / n) * att(a) * def(h) * rf(a, m.utcDate), 0.2), 4.5);
      return { date: m.utcDate, home: h, away: a, xh, xa, ...probs(xh, xa) };
    });
    res.setHeader("Cache-Control", "s-maxage=1800");
    res.status(200).json(out);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
};
