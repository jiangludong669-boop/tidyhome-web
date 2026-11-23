(function (exports) {
  'use strict';

  const byRoom = new Intl.Collator('zh-Hans-CN');
  const compact = value => value.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

  function id() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    if (globalThis.crypto?.getRandomValues) {
      return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)),
        value => value.toString(16).padStart(2, '0')).join('');
    }
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function drawerName(drawer) {
    return drawer.name.trim() || '抽屉 ' + drawer.number;
  }

  function roomName(location) {
    return location.trim().split(/\s*[·／/、，,>＞|]\s*|\s+[—–-]\s+/u)[0] || '未填写位置';
  }

  function cabinetGroups(cabinets, sort) {
    const recent = [...cabinets].reverse().sort((left, right) => right.createdAt - left.createdAt);
    if (sort !== 'room') return [{ name: '', cabinets: recent }];
    const groups = new Map();
    for (const cabinet of recent) {
      const name = roomName(cabinet.location);
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(cabinet);
    }
    return [...groups].sort(([left], [right]) => byRoom.compare(left, right))
      .map(([name, cabinets]) => ({ name, cabinets }));
  }

  function entries(cabinets) {
    return cabinets.flatMap(cabinet => cabinet.drawers.flatMap(drawer =>
      drawer.items.map(item => ({ cabinet, drawer, item }))));
  }

  function localMatches(question, cabinets) {
    const text = compact(question);
    const query = text
      .replace(/^(?:你好|请问|帮我|麻烦|我想知道|家里面|家里|我家|咱家|还有没有|有没有|还有|有|找一下|找找|找|想找)+/u, '')
      .replace(/(?:(?:放|搁)?在?(?:哪里|哪儿|哪)(?:了)?|还有吗|有没有|还有没有|有没有啊|剩多少|还有多少|多少个|在哪个抽屉|吗|呢|啊)+$/u, '');
    if (!text) return [];
    const ranked = entries(cabinets).map(entry => {
      const variants = [entry.item.name, ...entry.item.aliases].map(compact).filter(Boolean);
      const rank = Math.max(0, ...variants.map(name => {
        if (text === name || query === name) return 100 + name.length;
        if (text.includes(name) && name.length > 1) return 50 + name.length;
        if (query.length > 1 && name.includes(query)) return 20 + query.length;
        return 0;
      }));
      return { entry, rank };
    });
    return ranked.filter(row => row.rank > 0)
      .sort((left, right) => right.rank - left.rank).map(row => row.entry);
  }

  function assistantInput(question, cabinets) {
    return {
      question,
      items: entries(cabinets).map(({ item }) => ({ id: item.id, name: item.name, aliases: item.aliases }))
    };
  }

  function resultSummary(rows) {
    if (!rows.length) return '库存里没有匹配的记录。';
    const stocked = rows.filter(({ item }) => item.quantity > 0).length;
    const empty = rows.length - stocked;
    if (!stocked) return '库存里找到了 ' + empty + ' 条记录，数量为 0。';
    const extra = empty ? '另有 ' + empty + ' 条记录数量为 0。' : '';
    return '有，找到 ' + stocked + ' 条有库存的记录。' + extra;
  }

  function responseIDs(response) {
    const parsed = JSON.parse(response.choices?.[0]?.message?.content ?? '{}');
    if (!Array.isArray(parsed.item_ids)) throw new Error('Missing item_ids');
    return [...new Set(parsed.item_ids.filter(id => typeof id === 'string'))];
  }

  function nextNumber(drawers) {
    return Math.max(0, ...drawers.map(drawer => drawer.number)) + 1;
  }

  function applyMarkers(drawers, draft) {
    const byID = new Map(draft.map(drawer => [drawer.id, drawer]));
    const existingIDs = new Set(drawers.map(drawer => drawer.id));
    let number = nextNumber(drawers);
    const additions = draft.filter(drawer => drawer.marker && !existingIDs.has(drawer.id))
      .map(drawer => {
        const availableNumber = Math.max(number, drawer.number);
        number = availableNumber + 1;
        return { ...drawer, number: availableNumber, items: [] };
      });
    return drawers.map(drawer => byID.has(drawer.id)
      ? { ...drawer, marker: byID.get(drawer.id).marker } : drawer).concat(additions);
  }

  Object.assign(exports, { id, clamp, drawerName, cabinetGroups, entries, localMatches,
    assistantInput, resultSummary, responseIDs, nextNumber, applyMarkers });
})(typeof module === 'object' && module.exports ? module.exports : (window.Inventory = {}));
