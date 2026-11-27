/* Day plan link format and .ics export, shared by /plan (layouts/_default/plan.html) and
   /schedule-maker/ (layouts/_default/schedule-maker.html). Runs in the browser only: nothing
   here talks to a server. Link format: oscarvgg/Align#284. */
window.AlignDayPlan = (function () {
  var MAX_BLOCKS = 24;

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // Same rules as the app's align://time-block/import link: `day` is yyyy-MM-dd (today when
  // missing), each `block` is HH:mm,minutes,title with the title last (it may hold commas),
  // at most 24 blocks, unreadable blocks are skipped and an unknown `v` is rejected.
  function parseDay(raw) {
    var now = new Date();
    if (!raw) return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return (d.getMonth() === +m[2] - 1 && d.getDate() === +m[3]) ? d : null;
  }

  // A block as wall-clock numbers: { start: minutes after midnight, minutes, title }, or null.
  // No Date is involved, so a daylight-saving change on the day can't move or merge blocks.
  function parseBlockParts(raw) {
    var first = raw.indexOf(','), second = raw.indexOf(',', first + 1);
    if (first < 0 || second < 0) return null;
    var time = /^(\d{1,2}):(\d{2})$/.exec(raw.slice(0, first).trim());
    var minutesText = raw.slice(first + 1, second).trim();
    var title = raw.slice(second + 1).trim();
    if (!time || !/^\d+$/.test(minutesText) || !title) return null;
    var hour = +time[1], minute = +time[2], minutes = +minutesText;
    if (hour > 23 || minute > 59 || minutes < 1 || minutes > 1440) return null;
    return { start: hour * 60 + minute, minutes: minutes, title: title.slice(0, 200) };
  }

  function parseBlock(raw, day) {
    var parts = parseBlockParts(raw);
    if (!parts) return null;
    var start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, parts.start);
    return { start: start, end: new Date(start.getTime() + parts.minutes * 60000), title: parts.title };
  }

  function formatDay(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  // The inverse of parseBlock: HH:mm,minutes,title, from the start as minutes after midnight.
  function formatBlock(startMinutes, minutes, title) {
    return pad(Math.floor(startMinutes / 60)) + ':' + pad(startMinutes % 60) + ',' + minutes + ',' + title;
  }

  // .ics with floating local times (no time zone), so each block lands at the wall-clock
  // time the plan names in whatever zone the calendar is in, as the app does.
  function icsDate(d) {
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00';
  }
  // The same floating stamp from the day and minutes after its midnight (1440 is the next
  // midnight), without going through the browser's time zone.
  function icsLocal(day, minutes) {
    var date = new Date(day.getFullYear(), day.getMonth(), day.getDate() + Math.floor(minutes / 1440), 12);
    var m = minutes % 1440;
    return date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate()) + 'T' + pad(Math.floor(m / 60)) + pad(m % 60) + '00';
  }
  function icsStamp(v) { return typeof v === 'string' ? v : icsDate(v); }
  function icsText(s) {
    return s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
  }
  // Lines longer than 75 octets are folded (RFC 5545 3.1), counted in UTF-8 and cut only
  // between characters, so a multi-byte character such as an emoji is never split.
  function utf8Length(ch) {
    var c = ch.codePointAt(0);
    return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  function fold(line) {
    var out = [], current = '', bytes = 0;
    for (var ch of line) {
      var size = utf8Length(ch);
      if (bytes + size > 75) { out.push(current); current = ' '; bytes = 1; }
      current += ch;
      bytes += size;
    }
    out.push(current);
    return out.join('\r\n');
  }
  function buildIcs(blocks, uidPrefix) {
    var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Align//Day plan//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    blocks.forEach(function (block, i) {
      lines.push('BEGIN:VEVENT',
        'UID:' + uidPrefix + '-' + i + '@align.day',
        'DTSTAMP:' + stamp,
        'DTSTART:' + icsStamp(block.start),
        'DTEND:' + icsStamp(block.end),
        'SUMMARY:' + icsText(block.title),
        'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  // Blocks are { start, end, title } with start and end as Dates or as icsLocal stamps.
  // Saves the blocks as `<filePrefix>-yyyyMMdd.ics`. The file is built in the page.
  function downloadIcs(blocks, day, uidPrefix, filePrefix) {
    var blob = new Blob([buildIcs(blocks, uidPrefix)], { type: 'text/calendar;charset=utf-8' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filePrefix + '-' + icsDate(day).slice(0, 8) + '.ics';
    document.body.appendChild(link);
    link.click();
    setTimeout(function () { URL.revokeObjectURL(link.href); link.remove(); }, 1000);
  }

  return {
    MAX_BLOCKS: MAX_BLOCKS,
    pad: pad,
    parseDay: parseDay,
    parseBlockParts: parseBlockParts,
    parseBlock: parseBlock,
    formatDay: formatDay,
    formatBlock: formatBlock,
    icsDate: icsDate,
    icsLocal: icsLocal,
    buildIcs: buildIcs,
    downloadIcs: downloadIcs
  };
})();
