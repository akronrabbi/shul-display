// Hebrew calendar and Akron zmanim, computed on this computer with @hebcal/core.
// Candle lighting matches hebcal.com for geonameid 5145476: 18 minutes before
// sunset, sea level (elevation off). Havdalah defaults to nightfall at 8.5
// degrees, which is the Hebcal "M=on" time. The geoname point (41.08144,
// -81.51901) is the one Hebcal uses for Akron; 41.13, -81.56 is only a rounding.

export const TZ = 'America/New_York';

export const AKRON = {
  latitude: 41.08144,
  longitude: -81.51901,
  name: 'Akron, Ohio',
  country: 'US',
  geoid: 5145476,
  elevation: 0,
};

const ZMAN_DEFS = [
  ['sunrise', 'Sunrise', (z) => z.sunrise()],
  ['misheyakir', 'Misheyakir', (z) => z.misheyakir()],
  ['sofZmanShma', 'Latest Shema', (z) => z.sofZmanShma()],
  ['sofZmanTfilla', 'Latest Shacharit', (z) => z.sofZmanTfilla()],
  ['chatzot', 'Midday', (z) => z.chatzot()],
  ['minchaGedola', 'Earliest Mincha', (z) => z.minchaGedola()],
  ['plag', 'Plag haMincha', (z) => z.plagHaMincha()],
  ['sunset', 'Sunset', (z) => z.sunset()],
  ['tzeit', 'Nightfall', (z) => z.tzeit(8.5)],
];

export function zoneParts(date, tz = TZ) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const map = {};
  for (const part of fmt.formatToParts(date)) map[part.type] = part.value;
  let hour = Number(map.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

// Akron wall-clock time as an absolute instant, whatever zone this computer is in.
export function akronWallTimeToDate(year, month, day, hour = 0, minute = 0) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const got = zoneParts(new Date(utcGuess), TZ);
  const gotUtc = Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute, got.second);
  const intended = Date.UTC(year, month - 1, day, hour, minute, 0);
  return new Date(utcGuess - (gotUtc - intended));
}

export function normalizeShabbosSettings(settings = {}) {
  const mins = Number(settings.candleLightingMins);
  const havMins = Number(settings.havdalahMins);
  const deg = Number(settings.havdalahDeg);
  return {
    candleLightingMins: Number.isFinite(mins) ? Math.min(120, Math.max(0, Math.round(mins))) : 18,
    havdalahMode: settings.havdalahMode === 'minutes' ? 'minutes' : 'degrees',
    havdalahMins: Number.isFinite(havMins) ? Math.min(180, Math.max(1, Math.round(havMins))) : 42,
    havdalahDeg: Number.isFinite(deg) ? deg : 8.5,
  };
}

function formatInZone(date, options) {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...options })
    .format(date)
    .replace(/\u202f/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function createCalendar(lib) {
  if (!lib || !lib.HDate || !lib.HebrewCalendar || !lib.Zmanim || !lib.Location) {
    throw new Error('Hebcal did not load');
  }

  const location = new lib.Location(
    AKRON.latitude,
    AKRON.longitude,
    false,
    TZ,
    AKRON.name,
    AKRON.country,
    AKRON.geonameid || AKRON.geoid,
    AKRON.elevation,
  );

  const cache = new Map();
  function memo(key, compute) {
    if (cache.has(key)) return cache.get(key);
    const value = compute();
    cache.set(key, value);
    if (cache.size > 48) cache.delete(cache.keys().next().value);
    return value;
  }

  function formatTime(date) {
    return formatInZone(date, { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  function formatLong(date) {
    return formatInZone(date, { weekday: 'long', month: 'long', day: 'numeric' });
  }

  function hebrew(now) {
    const minute = Math.floor(now.getTime() / 60000);
    return memo('he:' + minute, () => {
      const hd = lib.Zmanim.makeSunsetAwareHDate(location, now, false);
      return {
        hebrew: hd.renderGematriya(false),
        plain: hd.renderGematriya(true),
        translit: hd.render('en'),
        weekday: formatInZone(now, { weekday: 'long' }),
        dateLine: formatInZone(now, { month: 'long', day: 'numeric', year: 'numeric' }),
      };
    });
  }

  function parshaForCivilDay(year, month, day) {
    const hd = new lib.HDate(new Date(year, month - 1, day, 12, 0, 0));
    const info = lib.getSedra(hd.getFullYear(), false).lookup(hd);
    if (info && info.parsha && info.parsha.length && !info.chag) {
      const ev = new lib.ParshaEvent(info);
      return { en: ev.render('en'), he: ev.render('he') };
    }
    const holidays = lib.getHolidaysOnDate(hd, false) || [];
    const main = holidays.find((item) => {
      const flags = item.getFlags();
      return flags & (lib.flags.CHAG | lib.flags.MAJOR_FAST | lib.flags.SPECIAL_SHABBAT);
    });
    const pick = main || holidays[0];
    if (pick) return { en: pick.render('en'), he: pick.render('he') };
    if (info && info.parsha && info.parsha.length) {
      const ev = new lib.ParshaEvent(info);
      return { en: ev.render('en'), he: ev.render('he') };
    }
    return null;
  }

  function shabbos(now, rawSettings) {
    const settings = normalizeShabbosSettings(rawSettings);
    const minute = Math.floor(now.getTime() / 60000);
    const key = ['sh', minute, settings.candleLightingMins, settings.havdalahMode, settings.havdalahMins, settings.havdalahDeg].join(':');
    return memo(key, () => {
      const options = {
        start: new Date(now.getTime() - 3 * 86400000),
        end: new Date(now.getTime() + 16 * 86400000),
        candlelighting: true,
        sedrot: true,
        location,
        candleLightingMins: settings.candleLightingMins,
      };
      if (settings.havdalahMode === 'minutes') options.havdalahMins = settings.havdalahMins;
      else options.havdalahDeg = settings.havdalahDeg;

      const events = lib.HebrewCalendar.calendar(options);
      const candles = events
        .filter((ev) => ev.getDesc() === 'Candle lighting' && ev.eventTime)
        .sort((a, b) => a.eventTime - b.eventTime);
      const havdalahs = events
        .filter((ev) => ev.getDesc() === 'Havdalah' && ev.eventTime)
        .sort((a, b) => a.eventTime - b.eventTime);

      let chosenCandles = null;
      let chosenHavdalah = null;
      for (const candle of candles) {
        const havdalah = havdalahs.find((item) => item.eventTime.getTime() > candle.eventTime.getTime());
        if (!havdalah) continue;
        // Keep this Shabbos on screen until havdalah, then move to the next one.
        if (now.getTime() <= havdalah.eventTime.getTime()) {
          chosenCandles = candle;
          chosenHavdalah = havdalah;
          break;
        }
      }

      if (!chosenCandles || !chosenHavdalah) return null;
      const when = zoneParts(chosenHavdalah.eventTime, TZ);
      return {
        candles: { time: formatTime(chosenCandles.eventTime), when: formatLong(chosenCandles.eventTime) },
        havdalah: { time: formatTime(chosenHavdalah.eventTime), when: formatLong(chosenHavdalah.eventTime) },
        parsha: parshaForCivilDay(when.year, when.month, when.day),
      };
    });
  }

  // The Shabbos or Yom Tov that is on now, or about to start, with its start and
  // end as instants. Uses the same candle lighting and havdalah as the board.
  function restWindow(now, rawSettings, { before = 0, after = 0, yomTov = true } = {}) {
    const settings = normalizeShabbosSettings(rawSettings);
    const minute = Math.floor(now.getTime() / 60000);
    const key = ['rw', minute, settings.candleLightingMins, settings.havdalahMode, settings.havdalahMins, settings.havdalahDeg, before, after, yomTov].join(':');
    return memo(key, () => {
      const options = {
        start: new Date(now.getTime() - 4 * 86400000),
        end: new Date(now.getTime() + 9 * 86400000),
        candlelighting: true,
        location,
        candleLightingMins: settings.candleLightingMins,
      };
      if (settings.havdalahMode === 'minutes') options.havdalahMins = settings.havdalahMins;
      else options.havdalahDeg = settings.havdalahDeg;
      const events = lib.HebrewCalendar.calendar(options);
      const candles = events
        .filter((ev) => ev.getDesc() === 'Candle lighting' && ev.eventTime)
        .sort((a, b) => a.eventTime - b.eventTime);
      const havdalahs = events
        .filter((ev) => ev.getDesc() === 'Havdalah' && ev.eventTime)
        .sort((a, b) => a.eventTime - b.eventTime);
      const time = now.getTime();
      for (const candle of candles) {
        const havdalah = havdalahs.find((item) => item.eventTime.getTime() > candle.eventTime.getTime());
        if (!havdalah) continue;
        const friday = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(candle.eventTime) === 'Fri';
        if (!friday && !yomTov) continue;
        const start = candle.eventTime.getTime() - Math.max(0, Number(before) || 0) * 60000;
        const end = havdalah.eventTime.getTime() + Math.max(0, Number(after) || 0) * 60000;
        if (time > end) continue;
        return { start: new Date(start), end: new Date(end), active: time >= start, kind: friday ? 'shabbos' : 'yomtov' };
      }
      return null;
    });
  }

  function zmanim(now) {
    const minute = Math.floor(now.getTime() / 60000);
    return memo('z:' + minute, () => {
      const today = zoneParts(now, TZ);
      let day = new Date(today.year, today.month - 1, today.day, 12, 0, 0);
      let calc = new lib.Zmanim(location, day, false);
      let afterSunset = now.getTime() >= calc.sunset().getTime();
      if (afterSunset) {
        day = new Date(today.year, today.month - 1, today.day + 1, 12, 0, 0);
        calc = new lib.Zmanim(location, day, false);
      }
      const items = ZMAN_DEFS.map(([key, label, read]) => ({
        key,
        label,
        time: formatTime(lib.Zmanim.roundTime(read(calc))),
      }));
      return { afterSunset, items };
    });
  }

  // No network from Friday sunset until Saturday nightfall (tzeit, 8.5 degrees)
// in Akron. This is the sunset itself, not candle lighting.
function networkQuiet(now = new Date()) {
  const minute = Math.floor(now.getTime() / 60000);
  return memo('quiet:' + minute, () => {
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(now);
    const index = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[weekday];
    const today = zoneParts(now, TZ);
    const noon = new Date(today.year, today.month - 1, today.day, 12, 0, 0);
    const back = index === 6 ? 1 : (index + 2) % 7;
    const friday = new Date(noon.getFullYear(), noon.getMonth(), noon.getDate() - back, 12, 0, 0);
    const saturday = new Date(friday.getFullYear(), friday.getMonth(), friday.getDate() + 1, 12, 0, 0);
    const start = new lib.Zmanim(location, friday, false).sunset();
    const end = new lib.Zmanim(location, saturday, false).tzeit(8.5);
    const time = now.getTime();
    return {
      active: time >= start.getTime() && time < end.getTime(),
      start,
      end,
    };
  });
}

return {
    formatTime,
    formatLong,
    hebrew,
    shabbos,
    restWindow,
    zmanim,
    networkQuiet,
    location,
  };
}
